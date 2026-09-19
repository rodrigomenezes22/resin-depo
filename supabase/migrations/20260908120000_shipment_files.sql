-- =============================================================================
-- Shipment Files — arbitrary attachments on a deal or a booking
-- =============================================================================
-- Ports legacy's `Shipment_Files` panel (Administrator/Transaction_Details.aspx,
-- 4th fieldset — docs/legacy-ui-audit.md:370-372). Legacy showed a grid of
--
--   Delete | File | Description | Owner | Date | Buyer access | Seller access
--
-- with an upload area beneath it (File to Add, Description, per-party Access
-- Rights checkboxes, Upload).
--
-- WHY A NEW TABLE, given two document tables already exist. `shipment_documents`
-- and `transaction_documents` are TYPED paperwork: each carries a frozen
-- `payload jsonb` that the PDF is merely a view of, a `document_number`, a
-- reissue counter and an issue/void lifecycle. A shipment file is the opposite
-- — an arbitrary artefact somebody was emailed (a customs form, a weight
-- ticket, a photo of a damaged bag). It has no payload to freeze, no number, and
-- nothing to reissue. Forcing it into `*_documents` would mean a doc_type that
-- renders no PDF and a payload that is always '{}'.
--
-- ONE TABLE, TWO OWNERS. Legacy hung files off SHIPMENT only. We need the same
-- panel on Bank → Transaction Details (a matched order) AND on Bank → Export
-- Shipments detail (a booking covering many matched orders), so the row carries
-- a nullable FK to each and a CHECK admitting exactly one. This is the shape
-- docs/export-shipments-plan.md:703-707 anticipated for this surface.
--
-- ACCESS RIGHTS ARE RECORDED, NOT YET ENFORCED. `buyer_access` / `seller_access`
-- are the legacy per-party visibility flags. RLS below is staff-only, because
-- there is no customer-facing surface in this app that could read a file today.
-- The flags are captured now so the customer login (planned) can enforce them
-- without a backfill: the desk's intent for every file uploaded between now and
-- then is already on the row. Until that surface exists, a checked box changes
-- nothing about who can read the object — do not describe it to users as though
-- it does.
--
-- STORAGE. No new bucket: files land in the existing private `shipment-documents`
-- bucket (20 MB, pdf/jpeg/png), following the precedent set by
-- 20260806104500_shipment_cost_invoice_documents.sql, which explicitly declined
-- to mint one. Paths are
--
--   files/deal/{matchedOrderId}/{fileId}.{ext}
--   files/group/{shipmentGroupId}/{fileId}.{ext}
--
-- The `files/` first segment is what lets the DELETE policy at the bottom of
-- this migration be scoped to attachments alone, so it can never reach a
-- generated document's PDF sitting in the same bucket.
-- =============================================================================

create table public.shipment_files (
  id                uuid primary key default gen_random_uuid(),
  matched_order_id  uuid references public.matched_orders(id) on delete cascade,
  shipment_group_id uuid references public.shipment_groups(id) on delete cascade,
  file_name         text not null,
  description       text,
  storage_path      text not null unique,
  content_type      text not null,
  size_bytes        bigint not null check (size_bytes > 0),
  buyer_access      boolean not null default false,
  seller_access     boolean not null default false,
  created_by        uuid references public.user_profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz,
  updated_by        uuid references public.user_profiles(id) on delete set null,

  -- Exactly one owner. A file belongs to a deal or to a booking, never both and
  -- never neither — the two surfaces list by their own id and an unowned row
  -- would be invisible on both.
  constraint shipment_files_one_owner check (
    (matched_order_id is not null)::int + (shipment_group_id is not null)::int = 1),

  -- A blank name renders as an unclickable gap in the grid's File column.
  constraint shipment_files_file_name_present check (
    nullif(btrim(file_name), '') is not null)
);

comment on table public.shipment_files is
  'Arbitrary file attached to a matched order or a shipment group — legacy '
  'Shipment_Files. Distinct from shipment_documents/transaction_documents, '
  'which are typed paperwork generated from a frozen payload.';
comment on column public.shipment_files.matched_order_id is
  'Owning deal, when the file was uploaded from Transaction Details. Exactly '
  'one of this and shipment_group_id is set.';
comment on column public.shipment_files.shipment_group_id is
  'Owning booking, when the file was uploaded from Export Shipments detail. '
  'Exactly one of this and matched_order_id is set.';
comment on column public.shipment_files.file_name is
  'Original name of the uploaded file, shown in the grid and used as the '
  'download filename. The storage object is keyed by uuid instead, so two '
  'files named scan.pdf cannot collide.';
comment on column public.shipment_files.description is
  'Free text the desk typed in the upload area''s Description field.';
comment on column public.shipment_files.storage_path is
  'Object path in the private shipment-documents bucket: '
  'files/{deal|group}/{ownerId}/{fileId}.{ext}. Unique so two rows can never '
  'point at one object and have a delete strand the other.';
comment on column public.shipment_files.content_type is
  'MIME type as uploaded — decides whether the UI previews inline (pdf, image) '
  'or offers download only.';
comment on column public.shipment_files.size_bytes is
  'Size of the stored object, for display. The 20 MB ceiling is enforced by the '
  'bucket, not here.';
comment on column public.shipment_files.buyer_access is
  'Legacy per-party visibility flag: the desk marked this file shareable with '
  'the BUYER. Recorded only — no customer-facing surface reads it yet, and RLS '
  'on this table is staff-only. See this migration''s header.';
comment on column public.shipment_files.seller_access is
  'Legacy per-party visibility flag: the desk marked this file shareable with '
  'the SELLER. Recorded only — see buyer_access.';
comment on column public.shipment_files.created_by is
  'Who uploaded it — the grid''s Owner column.';
comment on column public.shipment_files.updated_by is
  'REM-13 pair with updated_at: who last edited the description, access flags '
  'or replaced the file. NULL = never edited since upload.';

create index shipment_files_matched_order_idx
  on public.shipment_files (matched_order_id, created_at desc)
  where matched_order_id is not null;

create index shipment_files_group_idx
  on public.shipment_files (shipment_group_id, created_at desc)
  where shipment_group_id is not null;

-- ---------------------------------------------------------------------------
-- REM-13 updated stamps — rows DO mutate in place (description, access flags,
-- and file replacement), so the pair is required, stamped DB-side so a future
-- write path cannot forget it.
-- ---------------------------------------------------------------------------
create or replace function public.trg_shipment_files_stamp_updated()
  returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();  -- null for service-role/seed paths: stamp what we know
  return new;
end;
$$;

comment on function public.trg_shipment_files_stamp_updated is
  'REM-13: stamps updated_at/updated_by on every shipment_files UPDATE.';

drop trigger if exists trg_shipment_files_stamp_updated on public.shipment_files;

create trigger trg_shipment_files_stamp_updated
  before update on public.shipment_files
  for each row execute function public.trg_shipment_files_stamp_updated();

-- ---------------------------------------------------------------------------
-- RLS — internal-only, matching the two document tables' posture
-- ---------------------------------------------------------------------------
alter table public.shipment_files enable row level security;

-- The grant half is not optional: a table that declares no grants inherits
-- GRANT ALL ... TO authenticated from the baseline's default privileges, which
-- is how shipment_group_events once ended up deletable (REM-12).
revoke all on public.shipment_files from authenticated;
grant select, insert, update, delete on public.shipment_files to authenticated;

create policy shipment_files_select_internal on public.shipment_files
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_files_insert_internal on public.shipment_files
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_files_update_internal on public.shipment_files
  for update
  using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
-- Delete is staff-wide rather than admin-only, unlike the document tables: an
-- attachment carries no issue/void audit trail to protect, and the broker who
-- uploaded the wrong scan is the one who needs to remove it.
create policy shipment_files_delete_internal on public.shipment_files
  for delete using (public.get_platform_role() in ('admin', 'broker_trader'));

-- ---------------------------------------------------------------------------
-- Storage — the bucket already exists (20260804120200_shipment_document_storage)
-- and its staff insert/select/update policies already cover these objects. Only
-- DELETE was missing, because nothing in the app deleted a stored object until
-- now. Scoped to the files/ prefix so removing an attachment can never reach a
-- generated document's PDF in the same bucket.
-- ---------------------------------------------------------------------------
create policy "shipment docs: staff delete attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'shipment-documents'
    and (storage.foldername(name))[1] = 'files'
    and public.get_platform_role() in ('admin', 'broker_trader')
  );
