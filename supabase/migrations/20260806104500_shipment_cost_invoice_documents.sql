-- =============================================================================
-- Vendor invoices on shared export costs
-- =============================================================================
-- A shared cost is a bill somebody sent us — the carrier's ocean freight
-- invoice, the terminal's THC note. The desk records its number and attaches
-- the PDF, so the Shared Costs table can answer "what is this $4,050?" without
-- anyone digging through email.
--
-- STORAGE: no new bucket. These files go in `shipment-documents`
-- (20260804120200), the private bucket the export paperwork already uses, whose
-- policies restrict INSERT / SELECT / UPDATE to staff — admin and broker_trader.
-- Customer roles (resin_processor / resin_producer / resin_analyst) can neither
-- read nor write it, and it is `public = false`, so there is no unsigned URL to
-- leak: viewing always goes through a short-lived signed URL minted for a
-- session that passed those policies. That is the same guard already protecting
-- the Bills of Lading and Commercial Invoices in the same bucket, and it
-- matches this table's own RLS (20260805090000), which is staff-only too.
--
--   {shipmentGroupId}/costs/{costId}.pdf
--
-- Keyed on the cost's UUID, so it cannot collide with a document object in the
-- same folder (those are named for the document number — SHP-01041-CI-2) and a
-- re-upload replaces that cost's invoice rather than accumulating orphans.
-- =============================================================================

alter table public.shipment_group_costs
  add column invoice_number        text,
  add column invoice_document_path text;

comment on column public.shipment_group_costs.invoice_number is
  'The vendor''s invoice number for this cost, as printed on their bill.';

comment on column public.shipment_group_costs.invoice_document_path is
  'Storage path in the private shipment-documents bucket for this cost''s '
  'invoice PDF ({groupId}/costs/{costId}.pdf). Null until one is uploaded.';
