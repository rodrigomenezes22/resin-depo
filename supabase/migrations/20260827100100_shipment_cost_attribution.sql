-- =============================================================================
-- Shipment costs: update attribution + an event, per the REM-12/REM-13
-- conventions
-- =============================================================================
-- `shipment_group_costs` arrived with the shipment-costs feature after the
-- remediation campaign, and reproduces both defects the campaign had just
-- finished fixing elsewhere:
--
--   • No update attribution (REM-13's convention, stated in supabase/AGENTS.md:
--     "New tables that accept UPDATEs need the updated_at/updated_by stamp
--     pair"). The table accepts UPDATEs — `exportShipments.updateCost` patches
--     amount, cost type, description and invoice number — and records neither
--     when nor by whom.
--
--   • A silent money edit (REM-12's shape: `updateContainer` was the one
--     export mutation writing no event). `addCost` logs `cost_added` and
--     `removeCost` logs `cost_removed`, but `updateCost` logged nothing — so a
--     cost AMOUNT could be rewritten with no trace. That is not cosmetic: an
--     amount change re-fires `allocate_shipment_costs()` (the AFTER UPDATE
--     `shipment_group_costs_reallocate_trg`), which rewrites
--     `matched_orders.freight` on every container in the booking, which feeds
--     `computeTransactionMoney()` — the canonical margin (REM-04). Money moved
--     on every transaction in the shipment, with nothing in the log.
--
-- The companion `cost_updated` event is emitted by `updateCost` in
-- trpc/routers/export-shipments.ts and is admitted by the REM-03 event_type
-- CHECK in 20260827100000_rem03_event_type_vocabulary.sql.
--
-- Trigger ordering: this table already has a BEFORE UPDATE trigger,
-- `shipment_group_costs_currency_guard_trg`. Postgres fires same-event BEFORE
-- triggers in trigger-name alphabetical order, and `...currency_guard_trg` <
-- `...stamp_updated_trg`, so the guard still runs first and only writes that
-- survive it get stamped — the same composition REM-13 relies on for
-- matched_orders.
-- =============================================================================

alter table public.shipment_group_costs
  add column updated_at timestamptz,
  add column updated_by uuid references public.user_profiles(id) on delete set null;

comment on column public.shipment_group_costs.updated_by is
  'Who last edited this cost line; NULL for never-edited rows and for '
  'service-role/seed writes that carry no auth.uid(). Stamped by '
  'trg_shipment_group_costs_stamp_updated.';

create or replace function public.trg_shipment_group_costs_stamp_updated()
  returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger shipment_group_costs_stamp_updated_trg
  before update on public.shipment_group_costs
  for each row execute function public.trg_shipment_group_costs_stamp_updated();
