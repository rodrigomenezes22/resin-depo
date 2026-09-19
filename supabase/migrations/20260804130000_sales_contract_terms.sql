-- =============================================================================
-- Sales Contract terms + remittance accounts
-- =============================================================================
-- The Commercial Invoice (Stage 1) needed routing and goods facts. The Sales
-- Contract adds the COMMERCIAL terms a contract states and an invoice does not:
-- the quantity tolerance, who carries the insurance, the shipment window, and
-- the bank the buyer wires to.
--
-- Same division as before: reusable facts become columns and feed the prefill;
-- what a document SAID is frozen in shipment_documents.payload.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Commercial terms — properties of the DEAL, not of the booking
-- ---------------------------------------------------------------------------
alter table public.matched_orders
  add column tolerance_pct   numeric(5,2) not null default 5
    check (tolerance_pct >= 0 and tolerance_pct <= 100),
  add column insurance_terms text,
  add column shipment_window text;

comment on column public.matched_orders.tolerance_pct is
  'Quantity / credit tolerance the contract allows, in percent. The samples '
  'read "TOLERANCE: 5.0 % MORE OR LESS ON BOTH CREDIT AMOUNT AND QUANTITY"; '
  '5 is the house default.';
comment on column public.matched_orders.insurance_terms is
  'Who carries marine insurance, as printed — e.g. "Covered by Buyer". Free '
  'text: under CFR the buyer insures, under CIF the seller does, and the desk '
  'occasionally words it per deal.';
comment on column public.matched_orders.shipment_window is
  'Shipment window as printed on the contract (e.g. "May 8, 2026", "May 2026", '
  '"Q3 2026"). Free text rather than a date range because contracts state it '
  'in whatever form was negotiated.';

-- ---------------------------------------------------------------------------
-- Remittance accounts — the wire block on a contract / proforma invoice
-- ---------------------------------------------------------------------------
-- A table rather than columns on `organizations`: TPE holds more than one
-- account over time (and per currency), the details are reused verbatim on
-- every document, and nobody should retype a SWIFT code.
create table public.bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  label            text,
  beneficiary_name text not null,
  bank_name        text not null,
  bank_address     text,
  swift_code       text,
  account_number   text,
  aba_routing      text,
  iban             text,
  currency         text not null default 'USD',
  is_default       boolean not null default false,
  created_at       timestamptz not null default now()
);

-- One default per org per currency — the prefill picks a bank account without
-- asking, so "the default" has to be unambiguous.
create unique index bank_accounts_one_default_idx
  on public.bank_accounts (org_id, currency) where is_default;

create index bank_accounts_org_idx on public.bank_accounts (org_id);

comment on table public.bank_accounts is
  'Remittance details printed on Sales Contracts and Proforma Invoices. Keyed '
  'to an organization so TPE''s own accounts live beside anyone else''s; the '
  'document prefill reads the default for the shipment''s currency.';

-- ---------------------------------------------------------------------------
-- RLS — internal-only, matching the rest of the deal tables
-- ---------------------------------------------------------------------------
alter table public.bank_accounts enable row level security;

create policy bank_accounts_select_internal on public.bank_accounts
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy bank_accounts_insert_admin on public.bank_accounts
  for insert with check (public.get_platform_role() = 'admin');
create policy bank_accounts_update_admin on public.bank_accounts
  for update
  using (public.get_platform_role() = 'admin')
  with check (public.get_platform_role() = 'admin');
create policy bank_accounts_delete_admin on public.bank_accounts
  for delete using (public.get_platform_role() = 'admin');
