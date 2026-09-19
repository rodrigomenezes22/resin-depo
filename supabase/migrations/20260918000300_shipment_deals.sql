-- =============================================================================
-- shipment_group_deals — a shipment's PURCHASE (resin-depo only)
-- =============================================================================
-- In TPE a container reaches a shipment from the ledger: the desk already has a
-- deal (matched_orders row) which it CONVERTS into container legs
-- (convert_matched_order: legs copy the parent's buyer / product / prices /
-- terms and carry parent_matched_order_id + leg_index; they print as
-- "05025-CN2"). resin-depo has no ledger, so the Purchase card on the shipment
-- page IS that parent deal, and "Add container" mints its legs.
--
-- This table is only the link shipment → parent deal. Everything else is TPE's
-- shape: the parent is an ordinary matched_orders row, the legs are ordinary
-- conversion legs, shipment_containers point at the legs.
--
-- IMPORT INTO TPE: drop this table. The legs already carry
-- parent_matched_order_id, which is all TPE needs.
--
-- ON DELETE RESTRICT on matched_order_id: the parent cannot vanish from under
-- a shipment; deleting a shipment cascades the link away and leaves the deal
-- (TPE semantics — a booking never owns the trade).
-- =============================================================================

create table public.shipment_group_deals (
  shipment_group_id uuid primary key references public.shipment_groups(id) on delete cascade,
  matched_order_id  uuid not null unique references public.matched_orders(id) on delete restrict,
  created_at        timestamptz not null default now()
);

comment on table public.shipment_group_deals is
  'resin-depo only: links a shipment to its purchase (the parent matched_orders row whose conversion legs are the shipment''s containers). Drop on import into TPE.';
comment on column public.shipment_group_deals.matched_order_id is
  'The parent deal. Its legs (matched_orders.parent_matched_order_id = this) are the containers on the shipment.';

grant select, insert, update, delete on public.shipment_group_deals to authenticated;

alter table public.shipment_group_deals enable row level security;

create policy shipment_group_deals_internal on public.shipment_group_deals
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
