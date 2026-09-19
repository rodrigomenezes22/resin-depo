-- =============================================================================
-- resin-depo post-export adjustments (target-only)
-- =============================================================================
-- Runs after the verbatim TPE export migrations. Two statements, both chosen
-- to keep this database importable into TPE:
--
--   1. Drop organizations.address2. TPE added it in 20260804120000 and dropped
--      it again in 20260902042751 when addresses moved to locations +
--      organization_locations. We never copied the intermediate address
--      columns, so this single drop lands organizations in TPE's current shape.
--
--   2. Offset shipment numbering. TPE's sequence starts at 1000 (SHP-01000).
--      Shipment numbers print on every document (and form document_number,
--      which is UNIQUE), so this app starts at SHP-90000 and the eventual TPE
--      import can never collide. matched_orders already starts at 900000
--      (foundation).
-- =============================================================================

alter table public.organizations drop column if exists address2;

alter sequence public.shipment_groups_display_number_seq restart with 90000;

-- ---------------------------------------------------------------------------
-- 3. Table privileges for the export tables.
-- ---------------------------------------------------------------------------
-- TPE's export migrations never GRANT on their tables: TPE's project predates
-- Supabase's hardened defaults, where new tables in `public` were readable by
-- `authenticated` automatically. This project (and current local stacks) grant
-- only TRUNCATE/REFERENCES/TRIGGER/MAINTAIN by default, so without this block
-- every copied table returns "permission denied" and RLS never even runs.
--
-- shipment_group_events is deliberately absent: 20260806100000 (REM-12) made
-- it append-only (select, insert) and that grant is already explicit there.
-- shipment_files (20260908120000) already grants itself; repeating is harmless.

grant select, insert, update, delete on
  public.shipment_groups,
  public.shipment_containers,
  public.shipment_container_lots,
  public.shipment_documents,
  public.shipment_document_containers,
  public.shipment_group_costs,
  public.shipment_files,
  public.bank_accounts
to authenticated;

grant usage, select on sequence public.shipment_groups_display_number_seq to authenticated;
