-- =============================================================================
-- REM-12 — shipment_group_events is an append-only log, like every sibling
-- =============================================================================
-- `shipment_group_events` (20260731183551_export_shipments.sql:202-250) was the
-- only event log in the schema that could be erased: it carried an admin DELETE
-- policy while `delivery_events` and `location_events` carry none. An audit log
-- that its own subjects can delete is not an audit log.
--
-- Two layers were wrong, not one:
--   • RLS — `shipment_group_events_delete_admin` permitted the delete.
--   • GRANTS — the table declared no grants at all, so it inherited
--     `GRANT ALL ON TABLES TO authenticated` from the baseline's default
--     privileges: DELETE, UPDATE and TRUNCATE included. Its siblings each
--     declare `grant select, insert` and nothing more. RLS happened to deny
--     UPDATE (no update policy was ever written), but the privilege sat there
--     waiting for the first permissive policy someone adds later.
-- Both are corrected here, so the table matches the convention instead of
-- relying on a missing policy to save it.
--
-- Convention for every new event/audit table (now stated in supabase/AGENTS.md):
--   grant select, insert — never update, delete or truncate;
--   write SELECT and INSERT policies only. Corrections are new rows, not edits.
--
-- Not changed: `shipment_containers`' own admin DELETE policy stays. A
-- container is mutable domain state (it can be removed from a booking), not a
-- record of something that happened.
-- =============================================================================

drop policy shipment_group_events_delete_admin on public.shipment_group_events;

-- Re-declare the grant explicitly rather than revoking piecemeal, so the
-- surviving privileges are visible in one line.
revoke all on public.shipment_group_events from authenticated;
grant select, insert on public.shipment_group_events to authenticated;

comment on table public.shipment_group_events is
  'Append-only log of what happened to a shipment group. No UPDATE or DELETE '
  'path exists by design (REM-12): no delete policy, and only select/insert are '
  'granted. Event types: created, containers_assigned, containers_removed, '
  'containers_rolled_out, containers_rolled_in, container_updated, '
  'status_changed, cost_reallocated, document_issued.';
