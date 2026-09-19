-- =============================================================================
-- REM-03 (shipment half) — bound shipment_group_events.event_type
-- =============================================================================
-- `event_type` is free text on an APPEND-ONLY table (REM-12): nothing can
-- update or delete a row, so a typo is permanent and a timeline can never be
-- corrected — only added to. That makes the vocabulary floor worth more here
-- than on a mutable column.
--
-- DEVIATION from the brief, which says "CHECK on event_type for the eight
-- documented values". That list — the comment at
-- 20260731183551_export_shipments.sql:205-206 — is stale, and enforcing it
-- verbatim would reject SIX event types the code writes today, breaking the
-- cost and document flows outright. The comment REM-12 left behind was also
-- incomplete: it added `container_updated` but never picked up the document
-- and cost types that arrived with those features.
--
-- Enumerated below is what the code actually writes, verified by sweeping
-- every writer (there is no SQL-side writer; all inserts are in
-- trpc/routers/export-shipments.ts, plus seed.sql):
--   created                trpc/routers/export-shipments.ts createGroup / createFromTransactions
--   status_changed         updateGroup
--   containers_assigned    assignContainers
--   containers_removed     removeContainer
--   container_updated      updateContainer (REM-12)
--   cost_added             addCost           (via logEvent)
--   cost_updated           updateCost        (via logEvent — added alongside
--                          this migration, see 20260827100100)
--   cost_removed           removeCost        (via logEvent)
--   document_drafted       draftDocument     (via logEvent)
--   document_issued        issueDocument     (via logEvent)
--   document_voided        voidDocument      (via logEvent)
--   document_deleted       deleteDocument    (via logEvent)
--
-- DESIGNED BUT NOT WRITTEN, and therefore NOT permitted:
-- `containers_rolled_out`, `containers_rolled_in`, `cost_reallocated`. They
-- appear in the original table comment as intended vocabulary, but no code
-- path emits them. This follows the same rule REM-03 applied to
-- `matched_orders.status`: admit only what is written, and widen deliberately
-- when the feature lands. Whoever implements container rolling or cost
-- reallocation adds their value here in the same change — the CHECK failing
-- loudly on the first insert is the point.
-- =============================================================================

alter table public.shipment_group_events
  add constraint shipment_group_events_event_type_check
  check (event_type in (
    'created',
    'status_changed',
    'containers_assigned',
    'containers_removed',
    'container_updated',
    'cost_added',
    'cost_updated',
    'cost_removed',
    'document_drafted',
    'document_issued',
    'document_voided',
    'document_deleted'
  ));

-- Supersedes REM-12's comment, which listed types nothing writes and omitted
-- six that everything writes. Keep this in step with the CHECK above.
comment on table public.shipment_group_events is
  'Append-only log of what happened to a shipment group. No UPDATE or DELETE '
  'path exists by design (REM-12): no delete policy, and only select/insert '
  'are granted. `event_type` is bounded by '
  'shipment_group_events_event_type_check (REM-03) to the twelve types the '
  'code writes: created, status_changed, containers_assigned, '
  'containers_removed, container_updated, cost_added, cost_updated, '
  'cost_removed, document_drafted, document_issued, document_voided, '
  'document_deleted. '
  'containers_rolled_out, containers_rolled_in and cost_reallocated are '
  'designed but unwritten — add them to the CHECK in the same change that '
  'starts emitting them.';
