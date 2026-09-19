-- =============================================================================
-- Export document reference fields
-- =============================================================================
-- The five export documents (Commercial Invoice, Packing List, Sales Contract,
-- Proforma Invoice, Certificate of Origin) state ~40 facts that had no home in
-- the schema. This migration gives the REUSABLE ones a real column, so the desk
-- types each fact once and every future document prefills from it.
--
-- The division of labour, decided in docs/export-shipment-documents-plan.md:
--
--   • COLUMNS hold facts that are true NOW — an org's tax ID, a product's HS
--     code, a container's pallet count. They feed the prefill.
--   • shipment_documents.payload (next migration) holds what a document SAID
--     when it was issued. It freezes the result.
--
-- Anything inherently per-document (consignee vs notify party — a shipment can
-- be consigned to a bank or a forwarder) stays in the payload and is NOT a
-- column here.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Parties — the samples carry a two-line address, a tax ID and a named contact
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column address2     text,
  add column tax_id       text,
  add column eori         text,
  add column contact_name text;

comment on column public.organizations.address2 is
  'Second address line. The export samples routinely need it ("Unit G 15/F, '
  'TAL Building" above "49 Austin Road"); `address` alone truncated them.';
comment on column public.organizations.tax_id is
  'Tax registration shown on export documents — TPE''s US EIN on the Commercial '
  'Invoice''s Beneficiary block, or a foreign buyer''s VAT / RFC.';
comment on column public.organizations.eori is
  'EU Economic Operators Registration and Identification number, printed in the '
  'Certificate of Origin''s routing-instructions box for EU consignees.';
comment on column public.organizations.contact_name is
  'Named individual printed on document party blocks ("Representative: ..."). '
  'Distinct from any user_profiles row — this is who the counterparty puts on '
  'their paperwork, not someone with a login here.';

-- ---------------------------------------------------------------------------
-- Goods — HS code and origin are properties of the PRODUCT, not the shipment
-- ---------------------------------------------------------------------------
alter table public.products
  add column hs_code           text,
  add column country_of_origin text;

comment on column public.products.hs_code is
  'Harmonized System tariff code (e.g. 3901.10.10). Required on the Commercial '
  'Invoice and the Certificate of Origin.';
comment on column public.products.country_of_origin is
  'Where the resin is produced. The Certificate of Origin certifies exactly '
  'this, and it is NOT organizations.country — that is a party''s country.';

-- ---------------------------------------------------------------------------
-- Per box — the Packing List states these per row
-- ---------------------------------------------------------------------------
alter table public.shipment_containers
  add column pallet_count   integer check (pallet_count is null or pallet_count > 0),
  add column container_type text;

comment on column public.shipment_containers.pallet_count is
  'Pallets loaded in this container. The Packing List prints it per row and '
  'totals it ("TOTAL NUMBER OF PALLETS: 18").';
comment on column public.shipment_containers.container_type is
  'ISO size as printed on documents ("40''HC"). A real column rather than a '
  'derivation from matched_orders.unit, because `container` / `heavy_container` '
  'are WEIGHT-based units (54,565 / 59,524 lb) and say nothing about box size.';

-- ---------------------------------------------------------------------------
-- Lots in a box — many per container
-- ---------------------------------------------------------------------------
-- The Packing List sample shows one Lot No. against one container, but a box
-- can be stuffed from several lots and then needs a line each. `lot_id` is the
-- real inventory row when the material came through the graph; `lot_number_text`
-- covers material that never did, so the desk is never blocked from stating
-- what is physically in the box.
create table public.shipment_container_lots (
  id              uuid primary key default gen_random_uuid(),
  container_id    uuid not null references public.shipment_containers(id) on delete cascade,
  lot_id          uuid references public.lots(id) on delete set null,
  lot_number_text text,
  qty_lbs         numeric check (qty_lbs is null or qty_lbs > 0),
  position        integer not null default 1 check (position > 0),
  created_at      timestamptz not null default now(),
  constraint shipment_container_lots_identified check (
    lot_id is not null or nullif(btrim(lot_number_text), '') is not null),
  unique (container_id, position)
);

comment on table public.shipment_container_lots is
  'Which lots are physically inside a shipment container. Many rows per '
  'container: a box stuffed from two lots prints two Lot No. lines on the '
  'Packing List.';
comment on column public.shipment_container_lots.lot_number_text is
  'Free-text lot number for material that never passed through the inventory '
  'graph. Exactly one of lot_id / lot_number_text must identify the lot.';

-- ---------------------------------------------------------------------------
-- Shipment-wide export-filing facts (Certificate of Origin boxes, CI header)
-- ---------------------------------------------------------------------------
alter table public.shipment_groups
  add column hbl_number        text,
  add column aes_itn           text,
  add column forwarding_agent  text,
  add column fmc_number        text,
  add column loading_terminal  text,
  add column type_of_move      text,
  add column final_destination text,
  add column freight_terms     text,
  add column dthc_terms        text;

comment on column public.shipment_groups.hbl_number is
  'House Bill of Lading number (the forwarder''s). Distinct from '
  'master_bl_number, which is the ocean carrier''s — the Commercial Invoice '
  'header carries the house B/L.';
comment on column public.shipment_groups.aes_itn is
  'Automated Export System / Internal Transaction Number from the US export '
  'filing, printed in the Certificate of Origin''s marks box.';
comment on column public.shipment_groups.type_of_move is
  'Container stuffing/destuffing responsibility, e.g. "FCL / FCL".';
comment on column public.shipment_groups.final_destination is
  'Final destination of the GOODS, which is not the port of discharge — cargo '
  'discharged at Gdansk may be destined inland.';

-- ---------------------------------------------------------------------------
-- RLS for the new table — identical to shipment_containers
-- ---------------------------------------------------------------------------
alter table public.shipment_container_lots enable row level security;

create policy shipment_container_lots_select_internal on public.shipment_container_lots
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_container_lots_insert_internal on public.shipment_container_lots
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_container_lots_update_internal on public.shipment_container_lots
  for update
  using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_container_lots_delete_admin on public.shipment_container_lots
  for delete using (public.get_platform_role() = 'admin');
