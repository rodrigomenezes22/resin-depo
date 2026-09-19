-- =============================================================================
-- Customer credit — payments, receivables, aging, credit limit audit (resin-depo)
-- =============================================================================
-- TPE reserved organizations.credit_limit / credit_available but never wrote
-- them; its pre-rebuild migrations (20260526164602_ar_ap_payments,
-- 20260527173717_credit_limits, 20260528000050_credit_limit_changes) define the
-- intended model, and this file follows them so the numbers carry over:
--
--   · payments are append-only rows (kind, reference_id, amount, currency,
--     paid_at, method, reference_number, notes, recorded_by);
--   · a receivable is one purchase (here: one shipment), owed from the moment
--     the purchase exists until it is paid;
--   · credit_available = credit_limit − Σ open balances ("exposure");
--   · aging buckets: current | 1–30 | 31–60 | 61–90 | >90 days past due;
--   · credit-limit changes are audited (old, new, who, when, why).
--
-- Amount owed per shipment = the issued Commercial Invoice's frozen totalValue
-- when one exists (goods + freight), else the Purchase estimate
-- (Σ legs quantity_lbs × tpe_sell_price). Due date = the invoice's paymentDue,
-- else ETD + terms, else purchase date + terms; terms = the digits in the
-- buyer's payment terms ("Net 30 days from shipment" → 30) or the org default.
--
-- Everything here is resin-depo only and derived from data the desk already
-- enters. On import into TPE: drop the views, function and triggers; keep the
-- `payments` and `organization_credit_limit_changes` rows (TPE shapes).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

create table public.payments (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null default 'ar' check (kind in ('ar')),
  -- TPE: the receivable being paid. Here the purchase (parent matched_orders row).
  reference_id      uuid not null references public.matched_orders(id) on delete restrict,
  shipment_group_id uuid not null references public.shipment_groups(id) on delete restrict,
  buyer_org_id      uuid not null references public.organizations(id) on delete restrict,
  amount            numeric(14,2) not null check (amount > 0),
  currency          text not null default 'USD',
  paid_at           date not null default current_date,
  method            text check (
    method is null or method in ('wire', 'ach', 'check', 'credit_card', 'credit_note', 'write_off', 'other')
  ),
  reference_number  text,
  notes             text,
  recorded_by       uuid references public.user_profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

comment on table public.payments is
  'Money received against a shipment''s purchase (TPE pre-rebuild shape). Append-only in spirit: corrections are a delete + re-entry, both logged on the shipment timeline.';
comment on column public.payments.reference_id is
  'The purchase (parent matched_orders row) this payment settles — TPE''s polymorphic receivable reference.';
comment on column public.payments.method is
  'How it arrived. credit_note / write_off reduce the balance without cash.';

create index payments_shipment_idx on public.payments (shipment_group_id, paid_at desc);
create index payments_buyer_idx on public.payments (buyer_org_id, paid_at desc);

grant select, insert, delete on public.payments to authenticated;
alter table public.payments enable row level security;
create policy payments_internal on public.payments
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));

-- ---------------------------------------------------------------------------
-- organization_credit_limit_changes — TPE's audit table
-- ---------------------------------------------------------------------------

create table public.organization_credit_limit_changes (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  old_limit           numeric(14,2) not null,
  new_limit           numeric(14,2) not null,
  changed_by_user_id  uuid references public.user_profiles(id) on delete set null,
  changed_at          timestamptz not null default now(),
  reason              text
);

comment on table public.organization_credit_limit_changes is
  'Every change to organizations.credit_limit: old, new, who, when, why (TPE pre-rebuild shape).';

create index org_credit_limit_changes_org_idx
  on public.organization_credit_limit_changes (organization_id, changed_at desc);

grant select, insert on public.organization_credit_limit_changes to authenticated;
alter table public.organization_credit_limit_changes enable row level security;
create policy org_credit_limit_changes_internal on public.organization_credit_limit_changes
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));

-- ---------------------------------------------------------------------------
-- shipment_receivables — one row per shipment with a purchase
-- ---------------------------------------------------------------------------

create or replace view public.shipment_receivables
with (security_invoker = true) as
with purchase as (
  select
    d.shipment_group_id,
    mo.id                 as purchase_id,
    mo.display_number     as order_number,
    mo.buyer_company_id   as buyer_org_id,
    mo.buyer_terms,
    mo.created_at         as purchase_created_at
  from public.shipment_group_deals d
  join public.matched_orders mo on mo.id = d.matched_order_id
),
legs as (
  select
    parent_matched_order_id as purchase_id,
    count(*)::int                                     as container_count,
    sum(quantity_lbs)                                 as contract_lbs,
    sum(quantity_lbs * tpe_sell_price)                as estimate
  from public.matched_orders
  where parent_matched_order_id is not null
  group by parent_matched_order_id
),
invoice as (
  -- The latest ISSUED Commercial Invoice on the shipment (void/superseded/draft ignored).
  select distinct on (shipment_group_id)
    shipment_group_id,
    id               as invoice_id,
    document_number  as invoice_number,
    issued_at        as invoice_issued_at,
    nullif(payload->>'totalValue', '')::numeric as invoice_total,
    nullif(payload->>'paymentDue', '')::date    as invoice_due
  from public.shipment_documents
  where doc_type = 'commercial_invoice' and status = 'issued'
  order by shipment_group_id, issued_at desc
),
paid as (
  select shipment_group_id, sum(amount) as paid, max(paid_at) as last_paid_at, count(*)::int as payment_count
  from public.payments
  group by shipment_group_id
),
base as (
  select
    g.id                                   as shipment_group_id,
    g.display_number,
    g.status,
    g.currency,
    g.etd,
    p.purchase_id,
    p.order_number,
    p.buyer_org_id,
    o.name                                 as buyer_name,
    coalesce(l.container_count, 0)         as container_count,
    coalesce(l.contract_lbs, 0)            as contract_lbs,
    i.invoice_id,
    i.invoice_number,
    i.invoice_issued_at,
    coalesce(i.invoice_total, l.estimate, 0)::numeric(14,2) as amount,
    case when i.invoice_total is not null then 'invoice' else 'estimate' end as amount_source,
    coalesce(pd.paid, 0)::numeric(14,2)    as paid,
    pd.last_paid_at,
    coalesce(pd.payment_count, 0)          as payment_count,
    coalesce(
      nullif(substring(coalesce(p.buyer_terms, '') from '(\d+)'), '')::int,
      o.payment_terms_days
    )                                      as terms_days,
    i.invoice_due,
    p.purchase_created_at
  from public.shipment_groups g
  join purchase p on p.shipment_group_id = g.id
  left join public.organizations o on o.id = p.buyer_org_id
  left join legs l on l.purchase_id = p.purchase_id
  left join invoice i on i.shipment_group_id = g.id
  left join paid pd on pd.shipment_group_id = g.id
)
select
  b.*,
  greatest(b.amount - b.paid, 0)::numeric(14,2) as balance,
  coalesce(
    b.invoice_due,
    b.etd + b.terms_days,
    (b.purchase_created_at at time zone 'utc')::date + b.terms_days
  ) as due_date,
  (current_date - coalesce(
    b.invoice_due,
    b.etd + b.terms_days,
    (b.purchase_created_at at time zone 'utc')::date + b.terms_days
  ))::int as days_late,
  (b.status <> 'cancelled' and b.amount - b.paid > 0) as is_open
from base b;

comment on view public.shipment_receivables is
  'What each shipment''s buyer owes: invoice total when issued else the purchase estimate, paid, balance, due date, days late. Source of truth for the credit pages.';

grant select on public.shipment_receivables to authenticated;

-- ---------------------------------------------------------------------------
-- buyer_credit — one row per organization with a limit or any receivable
-- ---------------------------------------------------------------------------

create or replace view public.buyer_credit
with (security_invoker = true) as
select
  o.id                                   as organization_id,
  o.name,
  o.role,
  o.credit_limit,
  o.payment_terms_days,
  coalesce(sum(r.balance) filter (where r.is_open), 0)::numeric(14,2)                       as exposure,
  (o.credit_limit - coalesce(sum(r.balance) filter (where r.is_open), 0))::numeric(14,2)   as available,
  coalesce(sum(r.balance) filter (where r.is_open and r.days_late <= 0), 0)::numeric(14,2)  as bucket_current,
  coalesce(sum(r.balance) filter (where r.is_open and r.days_late between 1 and 30), 0)::numeric(14,2)  as bucket_1_30,
  coalesce(sum(r.balance) filter (where r.is_open and r.days_late between 31 and 60), 0)::numeric(14,2) as bucket_31_60,
  coalesce(sum(r.balance) filter (where r.is_open and r.days_late between 61 and 90), 0)::numeric(14,2) as bucket_61_90,
  coalesce(sum(r.balance) filter (where r.is_open and r.days_late > 90), 0)::numeric(14,2)  as bucket_90_plus,
  count(r.shipment_group_id) filter (where r.is_open)::int                                  as open_shipments,
  min(r.due_date) filter (where r.is_open)                                                 as oldest_due,
  max(r.days_late) filter (where r.is_open)                                                as max_days_late,
  coalesce(sum(r.amount), 0)::numeric(14,2)                                                as lifetime_billed,
  coalesce(sum(r.paid), 0)::numeric(14,2)                                                  as lifetime_paid
from public.organizations o
left join public.shipment_receivables r on r.buyer_org_id = o.id
where o.role <> 'exchange'
group by o.id, o.name, o.role, o.credit_limit, o.payment_terms_days;

comment on view public.buyer_credit is
  'Per buyer: credit limit, exposure (Σ open balances), available, aging buckets. credit_available on organizations mirrors `available`.';

grant select on public.buyer_credit to authenticated;

-- ---------------------------------------------------------------------------
-- credit_available mirror — kept for TPE compatibility
-- ---------------------------------------------------------------------------

create or replace function public.refresh_credit_available(p_org_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.organizations o
     set credit_available = coalesce(
       (select bc.available from public.buyer_credit bc where bc.organization_id = p_org_id),
       o.credit_limit
     )
   where o.id = p_org_id
     and o.credit_available is distinct from coalesce(
       (select bc.available from public.buyer_credit bc where bc.organization_id = p_org_id),
       o.credit_limit
     );
$$;

comment on function public.refresh_credit_available(uuid) is
  'Re-materialises organizations.credit_available = credit_limit − exposure for one buyer (TPE recompute_credit_available).';

grant execute on function public.refresh_credit_available(uuid) to authenticated, service_role;

-- Trigger bodies: find the buyer(s) touched and refresh them.
create or replace function public.trg_credit_refresh_payments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.refresh_credit_available(coalesce(new.buyer_org_id, old.buyer_org_id));
  return null;
end;
$$;

create or replace function public.trg_credit_refresh_org_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.credit_limit is distinct from old.credit_limit then
    perform public.refresh_credit_available(new.id);
  end if;
  return null;
end;
$$;

create or replace function public.trg_credit_refresh_matched_orders()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.buyer_company_id is not null then
    perform public.refresh_credit_available(old.buyer_company_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.buyer_company_id is not null
     and (tg_op = 'INSERT' or new.buyer_company_id is distinct from old.buyer_company_id) then
    perform public.refresh_credit_available(new.buyer_company_id);
  end if;
  return null;
end;
$$;

create or replace function public.trg_credit_refresh_shipment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_group uuid;
  v_buyer uuid;
begin
  -- shipment_documents rows carry shipment_group_id; shipment_groups rows ARE the group.
  -- (Field access is per branch: NEW has no shipment_group_id on shipment_groups.)
  if tg_table_name = 'shipment_groups' then
    v_group := coalesce(new.id, old.id);
  else
    v_group := coalesce(new.shipment_group_id, old.shipment_group_id);
  end if;
  select mo.buyer_company_id into v_buyer
    from public.shipment_group_deals d join public.matched_orders mo on mo.id = d.matched_order_id
   where d.shipment_group_id = v_group;
  if v_buyer is not null then perform public.refresh_credit_available(v_buyer); end if;
  return null;
end;
$$;

create trigger trg_credit_payments
  after insert or delete on public.payments
  for each row execute function public.trg_credit_refresh_payments();

create trigger trg_credit_org_limit
  after update of credit_limit on public.organizations
  for each row execute function public.trg_credit_refresh_org_limit();

create trigger trg_credit_matched_orders
  after insert or update of buyer_company_id, quantity_lbs, tpe_sell_price, buyer_terms or delete
  on public.matched_orders
  for each row execute function public.trg_credit_refresh_matched_orders();

create trigger trg_credit_shipment_documents
  after insert or update of status, payload or delete on public.shipment_documents
  for each row execute function public.trg_credit_refresh_shipment();

create trigger trg_credit_shipment_groups
  after update of status, etd on public.shipment_groups
  for each row execute function public.trg_credit_refresh_shipment();

-- Materialise once for whatever is already there.
select public.refresh_credit_available(id) from public.organizations where role <> 'exchange';
