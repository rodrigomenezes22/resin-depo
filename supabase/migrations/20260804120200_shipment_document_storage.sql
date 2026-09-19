-- =============================================================================
-- Shipment document storage
-- =============================================================================
-- Private, staff-only bucket for export paperwork — both the PDFs we generate
-- and the executed originals that come back.
--
-- Cloned from 20260724150225_cost_invoice_documents.sql, with two differences:
--
--   • images are allowed, not just PDF. A Certificate of Origin comes back with
--     a wet-ink chamber-of-commerce stamp and a notary seal, and it arrives as
--     a scan;
--   • 20 MB rather than 10 MB, because those scans are photographed pages.
--
-- Paths:
--   {shipmentGroupId}/{documentNumber}.pdf          — what we generated
--   {shipmentGroupId}/{documentNumber}-signed.{ext} — what came back signed
--
-- The document number already carries the reissue counter (SHP-01041-CI-2), so
-- a reissue writes a NEW object and can never overwrite the voided one's PDF.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('shipment-documents', 'shipment-documents', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "shipment docs: staff upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'shipment-documents'
    and public.get_platform_role() in ('admin', 'broker_trader')
  );

create policy "shipment docs: staff read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'shipment-documents'
    and public.get_platform_role() in ('admin', 'broker_trader')
  );

create policy "shipment docs: staff update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'shipment-documents'
    and public.get_platform_role() in ('admin', 'broker_trader')
  )
  with check (
    bucket_id = 'shipment-documents'
    and public.get_platform_role() in ('admin', 'broker_trader')
  );
