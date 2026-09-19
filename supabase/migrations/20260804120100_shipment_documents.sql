-- =============================================================================
-- Shipment documents
-- =============================================================================
-- The export paperwork a booking produces: Commercial Invoice, Packing List,
-- Sales Contract, Proforma Invoice, Certificate of Origin.
--
-- THE GOVERNING RULE: a document's PDF renders from its frozen `payload` and
-- from nothing else — never from a live join. A bank is holding a printed
-- invoice; if the PDF re-rendered from current data, editing the buyer's
-- address next month would silently rewrite a document already in a credit
-- file. Columns elsewhere feed the prefill; the payload freezes the result.
--
-- Lifecycle:
--
--     draft ──issue──▶ issued ──void──▶ void
--       │                 │
--       │                 └── ONLY allowlisted payload keys stay editable
--       └── everything editable, delete really deletes
--
-- A roll is a REISSUE, not an edit. Container coverage is not allowlisted, so
-- when a box leaves a booking the desk voids SHP-01041-CI-1 with a reason and
-- exports SHP-01041-CI-2 covering what actually sailed. Both stay downloadable.
-- The trailing counter in the document number is the revision; there is no
-- separate revision concept.
-- =============================================================================

create type shipment_doc_type as enum (
  'commercial_invoice',
  'packing_list',
  'sales_contract',
  'proforma_invoice',
  'certificate_of_origin');

-- All four values now. ALTER TYPE ADD VALUE cannot share a transaction with
-- code that uses the new value, so adding one later costs an extra migration.
create type shipment_doc_status as enum ('draft', 'issued', 'superseded', 'void');

create sequence shipment_documents_display_number_seq start 1;

create table public.shipment_documents (
  id                uuid primary key default gen_random_uuid(),
  display_number    bigint not null default nextval('shipment_documents_display_number_seq'),
  shipment_group_id uuid not null references public.shipment_groups(id) on delete cascade,
  doc_type          shipment_doc_type   not null,
  status            shipment_doc_status not null default 'draft',
  document_number   text not null unique,
  revision          integer not null default 1 check (revision > 0),
  supersedes_id     uuid references public.shipment_documents(id) on delete set null,
  payload           jsonb not null default '{}'::jsonb,
  generated_path    text,
  uploaded_path     text,
  issued_at         timestamptz,
  voided_at         timestamptz,
  void_reason       text,
  created_by        uuid references public.user_profiles(id) on delete set null,
  created_at        timestamptz not null default now(),

  constraint shipment_documents_not_self check (supersedes_id is distinct from id),

  -- Draft ⇔ never issued. A voided document WAS issued, so it keeps issued_at,
  -- which also makes voiding a draft impossible — drafts are deleted instead.
  constraint shipment_documents_issued_at check (
    (status = 'draft') = (issued_at is null)),

  -- A void without a reason is just a deletion wearing a hat.
  constraint shipment_documents_void_reason check (
    (status = 'void') = (voided_at is not null
                         and nullif(btrim(void_reason), '') is not null))
);

comment on table public.shipment_documents is
  'One export document. `payload` is the frozen record of what it said; the PDF '
  'is a view of that payload and is regenerable from it if storage is lost.';
comment on column public.shipment_documents.document_number is
  'Shipment-derived and permanent: {shipmentNumber}-{typeCode}-{n}, e.g. '
  'SHP-01041-CI-2. The trailing counter is the reissue number.';
comment on column public.shipment_documents.generated_path is
  'Storage path of the PDF we produced.';
comment on column public.shipment_documents.uploaded_path is
  'Storage path of the EXECUTED original that came back — the Certificate of '
  'Origin''s wet-ink chamber stamp and notary seal, or any counter-signed '
  'invoice. A document may legitimately carry both files.';

create table public.shipment_document_containers (
  document_id  uuid not null references public.shipment_documents(id) on delete cascade,
  container_id uuid not null references public.shipment_containers(id) on delete cascade,
  primary key (document_id, container_id)
);

comment on table public.shipment_document_containers is
  'Which containers a document covers. Answers "which documents mention this '
  'box?" — the query the roll runs to decide what must be voided and reissued.';

create index shipment_documents_group_idx
  on public.shipment_documents (shipment_group_id, created_at desc);
create index shipment_documents_type_idx on public.shipment_documents (doc_type);
create index shipment_document_containers_container_idx
  on public.shipment_document_containers (container_id);

-- ---------------------------------------------------------------------------
-- The editable-after-issue allowlist
-- ---------------------------------------------------------------------------
-- Correcting a typo in the house B/L must not require reissuing a document a
-- bank is holding; changing a weight, a price or a party must be impossible
-- without one. Keeping the list in ONE function means revising it is a one-line
-- migration rather than a trigger rewrite.
--
-- Keyed on doc_type so a Sales Contract can be stricter than a Packing List
-- later; for now every type shares one list.
--
-- TODO(rodrigo): confirm this list before Stage 1 ships. Shipping the wrong
-- one silently permits edits to documents already sent.
create or replace function public.shipment_document_editable_keys(
  p_doc_type public.shipment_doc_type)
returns text[]
language sql
immutable
as $$
  select array[
    'hblNumber',
    'vesselName',
    'voyageNumber',
    'notifyParty',
    'carrierBookingNumber',
    'marksAndNumbers'
  ]::text[];
$$;

comment on function public.shipment_document_editable_keys is
  'Top-level payload keys that remain editable once a document is issued. '
  'Everything else — weights, prices, parties, goods, container coverage — is '
  'frozen. lib/export-shipment/documents/editable.ts must mirror this exactly.';

-- ---------------------------------------------------------------------------
-- Lock trigger — the enforcement
-- ---------------------------------------------------------------------------
create or replace function public.shipment_documents_lock()
returns trigger
language plpgsql
as $$
declare
  editable text[];
  k        text;
begin
  -- Drafts are working files.
  if OLD.status = 'draft' then
    return NEW;
  end if;

  if NEW.doc_type is distinct from OLD.doc_type then
    raise exception 'shipment: a document''s type cannot change once it is issued';
  end if;

  if OLD.status = 'void' and NEW.status <> 'void' then
    raise exception 'shipment: a voided document cannot be reopened';
  end if;

  if OLD.status = 'issued' and NEW.status = 'draft' then
    raise exception 'shipment: an issued document cannot return to draft';
  end if;

  editable := public.shipment_document_editable_keys(OLD.doc_type);

  -- Every key whose value actually CHANGED must be allowlisted. Union of both
  -- key sets, so adding or removing a key counts as a change too.
  for k in
    select key from jsonb_object_keys(OLD.payload) as t(key)
    union
    select key from jsonb_object_keys(NEW.payload) as t(key)
  loop
    if (OLD.payload -> k) is distinct from (NEW.payload -> k)
       and not (k = any (editable)) then
      raise exception
        'shipment: "%" cannot be edited once a document is issued — void it and reissue', k;
    end if;
  end loop;

  return NEW;
end;
$$;

create trigger shipment_documents_lock_trg
  before update on public.shipment_documents
  for each row execute function public.shipment_documents_lock();

-- Only drafts are deletable. Issued and voided rows ARE the audit trail.
create or replace function public.shipment_documents_delete_guard()
returns trigger
language plpgsql
as $$
begin
  if OLD.status <> 'draft' then
    raise exception
      'shipment: only draft documents can be deleted — void it instead';
  end if;
  return OLD;
end;
$$;

create trigger shipment_documents_delete_guard_trg
  before delete on public.shipment_documents
  for each row execute function public.shipment_documents_delete_guard();

-- Container coverage is frozen at issue: it is what makes a roll a reissue
-- rather than a silent edit of a document already sent.
create or replace function public.shipment_document_containers_guard()
returns trigger
language plpgsql
as $$
declare
  doc_status public.shipment_doc_status;
  doc_id     uuid := coalesce(NEW.document_id, OLD.document_id);
begin
  select status into doc_status
    from public.shipment_documents where id = doc_id;

  if doc_status is not null and doc_status <> 'draft' then
    raise exception
      'shipment: the containers a document covers cannot change once it is issued';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

create trigger shipment_document_containers_guard_trg
  before insert or delete on public.shipment_document_containers
  for each row execute function public.shipment_document_containers_guard();

-- ---------------------------------------------------------------------------
-- RLS — internal-only, matching shipment_groups / shipment_containers
-- ---------------------------------------------------------------------------
alter table public.shipment_documents            enable row level security;
alter table public.shipment_document_containers  enable row level security;

create policy shipment_documents_select_internal on public.shipment_documents
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_documents_insert_internal on public.shipment_documents
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_documents_update_internal on public.shipment_documents
  for update
  using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_documents_delete_admin on public.shipment_documents
  for delete using (public.get_platform_role() = 'admin');

create policy shipment_document_containers_select_internal
  on public.shipment_document_containers
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_document_containers_insert_internal
  on public.shipment_document_containers
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_document_containers_delete_internal
  on public.shipment_document_containers
  for delete using (public.get_platform_role() in ('admin', 'broker_trader'));

grant usage, select on sequence shipment_documents_display_number_seq to authenticated;
