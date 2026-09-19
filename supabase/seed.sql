-- =============================================================================
-- Local development seed (supabase db reset). NOT applied to the hosted
-- project — the team types real reference data in through the UI.
-- =============================================================================
-- Just enough for a document to draft end-to-end on a fresh local database:
-- the exchange org (exporter/seller) with a headquarters + billing address,
-- a default USD bank account, two ports, a buyer with a billing address, an
-- ocean carrier, and a product with an HS code. Fixed UUIDs (TPE convention)
-- so scripts and tests can reference rows.
--
-- Users are NOT seeded here; run `pnpm admin:seed` against the local stack
-- (point .env.local at http://127.0.0.1:54321 + the local service role key).
-- =============================================================================

-- Organizations --------------------------------------------------------------
INSERT INTO public.organizations (id, name, role, service_kind, phone, email, tax_id, contact_name) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'The Plastics Exchange',      'exchange',         NULL,      '312-202-0002', 'export@theplasticsexchange.com', NULL, NULL),
  ('b0000000-0000-4000-8000-00000000000a', 'Meridian Ocean Line',        'service_provider', 'freight', NULL,           NULL,                             NULL, NULL),
  ('b0000000-0000-4000-8000-00000000000b', 'Shanghai Polymer Import Co', 'buyer',            NULL,      '+86 21 5555 0100', 'imports@spi.example',        'CN-91310000MA1K35', 'Wei Zhang');

-- Addresses (kind=office) + role links -----------------------------------------
INSERT INTO public.locations (id, name, kind, address_line1, address_line2, city, state, zip, country, operated_by_org_id) VALUES
  ('d0000000-0000-4000-8000-000000000101', 'The Plastics Exchange — Headquarters', 'office', '16510 N. 92nd Street', '#1010', 'Scottsdale', 'AZ', '85260', 'United States', 'b0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000102', 'Shanghai Polymer Import Co — Office',  'office', '88 Century Avenue',    NULL,    'Shanghai',   NULL, '200120', 'China',         'b0000000-0000-4000-8000-00000000000b');

INSERT INTO public.organization_locations (organization_id, location_id, role, is_primary) VALUES
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000101', 'headquarters', true),
  ('b0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000101', 'billing',      true),
  ('b0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000102', 'headquarters', true),
  ('b0000000-0000-4000-8000-00000000000b', 'd0000000-0000-4000-8000-000000000102', 'billing',      true);

-- Ports ---------------------------------------------------------------------
INSERT INTO public.locations (id, name, kind, city, state, country, unlocode) VALUES
  ('d0000000-0000-4000-8000-000000000003', 'Port of Houston',  'port', 'Houston',  'TX', 'United States', 'USHOU'),
  ('d0000000-0000-4000-8000-000000000004', 'Port of Shanghai', 'port', 'Shanghai', NULL, 'China',         'CNSHA');

-- Products: the nine TPE grades come from migration 20260918000100_products_catalogue.sql.

-- Bank account (placeholder numbers — replace through Settings → Company) --
INSERT INTO public.bank_accounts
  (id, org_id, label, beneficiary_name, bank_name, bank_address, swift_code, account_number, aba_routing, currency, is_default)
VALUES
  ('a4000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Primary USD', 'THE PLASTICS EXCHANGE, LLC', 'EXAMPLE BANK, N.A.', 'CHICAGO, IL 60606',
   'EXAMUS33', '000000000', '000000000', 'USD', true);
