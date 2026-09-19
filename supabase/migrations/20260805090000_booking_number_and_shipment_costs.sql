-- =============================================================================
-- Booking number moves to the shipment + shared export costs
-- =============================================================================
--
-- 1. BOOKING NUMBER IS PER SHIPMENT, NOT PER CONTAINER.
--
--    The original model put it on the container, reasoning that a rolled box
--    gets a new booking number from the line. That reasoning is now obsolete:
--    a rolled container MOVES TO A NEW SHIPMENT, and the new shipment carries
--    the new booking number. One booking per booking — the tension the
--    per-container column existed to resolve no longer exists.
--
-- 2. SHARED COSTS, ALLOCATED TO THE CONTAINERS.
--
--    Ocean freight, terminal handling and documentation are quoted PER BOOKING,
--    but the ledger prices and reports PER TRANSACTION. Until now the desk had
--    to divide by hand and type the share onto each deal. Now the total is
--    entered once against the shipment and allocated automatically.
--
--    The allocation is BY CONTRACT WEIGHT with the LAST container absorbing the
--    rounding remainder, so the shares sum to the total to the cent. That is
--    the identical rule `convert_matched_order` uses for freight on a railcar
--    conversion, for the identical reason: money that does not add up is worse
--    than money that is slightly unevenly spread.
--
--    Allocations are written into `matched_orders.freight`, so Transaction
--    Summary margin, the Commercial Invoice's freight line and the shipment all
--    read ONE number. For a grouped container the shipment therefore OWNS that
--    field — see the trigger comment below.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Booking number → shipment_groups
-- ---------------------------------------------------------------------------
alter table public.shipment_groups add column booking_number text;

comment on column public.shipment_groups.booking_number is
  'The ocean carrier''s booking number for this shipment. One per booking: a '
  'rolled container moves to a NEW shipment, which gets its own.';

-- Carry across whatever the containers already hold. Distinct values are joined
-- rather than silently dropped, so a shipment that really did carry two numbers
-- is visible to the desk instead of losing one.
update public.shipment_groups g
   set booking_number = sub.numbers
  from (
    select shipment_group_id,
           string_agg(distinct booking_number, ', ' order by booking_number) as numbers
      from public.shipment_containers
     where shipment_group_id is not null
       and nullif(btrim(booking_number), '') is not null
     group by shipment_group_id
  ) sub
 where g.id = sub.shipment_group_id;

alter table public.shipment_containers drop column booking_number;

-- ---------------------------------------------------------------------------
-- 2. Shared costs
-- ---------------------------------------------------------------------------
create type export_cost_type as enum (
  'ocean_freight',
  'thc',
  'documentation',
  'insurance',
  'customs',
  'other');

create table public.shipment_group_costs (
  id                uuid primary key default gen_random_uuid(),
  shipment_group_id uuid not null references public.shipment_groups(id) on delete cascade,
  cost_type         export_cost_type not null,
  description       text,
  amount            numeric(14,2) not null check (amount >= 0),
  currency          text not null default 'USD',
  created_by        uuid references public.user_profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index shipment_group_costs_group_idx
  on public.shipment_group_costs (shipment_group_id);

comment on table public.shipment_group_costs is
  'Costs quoted per BOOKING — ocean freight, THC, documentation. Allocated '
  'across the shipment''s containers by contract weight and written into '
  'matched_orders.freight, so one number serves the ledger, the manifest and '
  'the documents.';

-- A cost's currency must match its shipment's: there is no FX model in this
-- repo, and adding two currencies into one total is silently wrong.
create or replace function public.shipment_group_costs_currency_guard()
returns trigger
language plpgsql
as $$
declare
  group_currency text;
begin
  select currency into group_currency
    from public.shipment_groups where id = NEW.shipment_group_id;

  if group_currency is not null and NEW.currency <> group_currency then
    raise exception
      'shipment: a cost in % cannot sit on a shipment priced in %',
      NEW.currency, group_currency;
  end if;
  return NEW;
end;
$$;

create trigger shipment_group_costs_currency_guard_trg
  before insert or update on public.shipment_group_costs
  for each row execute function public.shipment_group_costs_currency_guard();

-- ---------------------------------------------------------------------------
-- 3. The allocation
-- ---------------------------------------------------------------------------
-- Recompute every container's share for one shipment and write it to the
-- transaction's freight. Idempotent: safe to call as often as anything changes.
--
-- Σ shares === the shipment total TO THE CENT. Each share is rounded down to
-- cents as it is computed and the LAST container takes whatever is left, so the
-- rounding error lands in one place instead of being spread invisibly.
create or replace function public.allocate_shipment_costs(p_group_id uuid)
returns void
language plpgsql
as $$
declare
  total_cost   numeric(14,2);
  total_lbs    numeric;
  running      numeric(14,2) := 0;
  container    record;
  share        numeric(14,2);
  row_count    integer;
  seen         integer := 0;
begin
  select coalesce(sum(amount), 0) into total_cost
    from public.shipment_group_costs where shipment_group_id = p_group_id;

  select coalesce(sum(mo.quantity_lbs), 0), count(*)
    into total_lbs, row_count
    from public.shipment_containers sc
    join public.matched_orders mo on mo.id = sc.matched_order_id
   where sc.shipment_group_id = p_group_id;

  if row_count = 0 then
    return;
  end if;

  for container in
    select sc.matched_order_id, mo.quantity_lbs
      from public.shipment_containers sc
      join public.matched_orders mo on mo.id = sc.matched_order_id
     where sc.shipment_group_id = p_group_id
     order by sc.position
  loop
    seen := seen + 1;

    if seen = row_count then
      -- The last container absorbs the remainder, so the shares add up.
      share := total_cost - running;
    elsif total_lbs > 0 then
      share := round(total_cost * (container.quantity_lbs / total_lbs), 2);
    else
      -- No contract weight recorded anywhere: fall back to an even split
      -- rather than putting the whole cost on one box.
      share := round(total_cost / row_count, 2);
    end if;

    running := running + share;

    update public.matched_orders
       set freight = share
     where id = container.matched_order_id;
  end loop;
end;
$$;

comment on function public.allocate_shipment_costs is
  'Split a shipment''s shared costs across its containers by contract weight, '
  'last container absorbing the rounding remainder, and write each share to '
  'matched_orders.freight. The shipment OWNS that field for grouped containers.';

-- ---------------------------------------------------------------------------
-- 4. Keep it current
-- ---------------------------------------------------------------------------
-- Both a cost change AND a membership change alter the split, so both
-- reallocate. Without the membership trigger, adding a fourth container would
-- leave three shares summing to the old total and the fourth on zero.
create or replace function public.reallocate_from_cost()
returns trigger
language plpgsql
as $$
begin
  perform public.allocate_shipment_costs(
    coalesce(NEW.shipment_group_id, OLD.shipment_group_id));
  return coalesce(NEW, OLD);
end;
$$;

create trigger shipment_group_costs_reallocate_trg
  after insert or update or delete on public.shipment_group_costs
  for each row execute function public.reallocate_from_cost();

create or replace function public.reallocate_from_membership()
returns trigger
language plpgsql
as $$
begin
  -- A container leaving a booking must not keep carrying that booking's costs.
  -- Zero it first, THEN recompute the shipment it left: the shipment owned the
  -- field while the box was on it, and owns it no longer.
  if (TG_OP = 'DELETE')
     or (TG_OP = 'UPDATE' and NEW.shipment_group_id is distinct from OLD.shipment_group_id)
  then
    update public.matched_orders set freight = 0 where id = OLD.matched_order_id;
  end if;

  -- A container can move between shipments; both sides need recomputing.
  if TG_OP <> 'INSERT' and OLD.shipment_group_id is not null then
    perform public.allocate_shipment_costs(OLD.shipment_group_id);
  end if;
  if TG_OP <> 'DELETE' and NEW.shipment_group_id is not null
     and NEW.shipment_group_id is distinct from OLD.shipment_group_id then
    perform public.allocate_shipment_costs(NEW.shipment_group_id);
  end if;
  return coalesce(NEW, OLD);
end;
$$;

create trigger shipment_containers_reallocate_trg
  after insert or update of shipment_group_id or delete on public.shipment_containers
  for each row execute function public.reallocate_from_membership();

-- ---------------------------------------------------------------------------
-- 5. RLS — internal-only, matching the rest of the shipment tables
-- ---------------------------------------------------------------------------
alter table public.shipment_group_costs enable row level security;

create policy shipment_group_costs_select_internal on public.shipment_group_costs
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_group_costs_insert_internal on public.shipment_group_costs
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_group_costs_update_internal on public.shipment_group_costs
  for update
  using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_group_costs_delete_internal on public.shipment_group_costs
  for delete using (public.get_platform_role() in ('admin', 'broker_trader'));
