-- =============================================================================
-- Product catalogue — the nine grades TPE trades (target-only, data)
-- =============================================================================
-- The grades on theplasticsexchange.com's spot floor, in page order, so the
-- container drawer has a product to pick on day one on the hosted project
-- (which has no seed step). Fixed UUIDs, idempotent. HS codes are the usual US
-- HTS headings for these resins; hs_code / country_of_origin are editable in
-- Settings → Products and print on the Commercial Invoice and Certificate of
-- Origin. Import into TPE maps these to its own products by name.
-- =============================================================================

insert into public.products (id, name, base_unit, hs_code, country_of_origin) values
  ('c1000000-0000-4000-8000-000000000001', 'LDPE - Film',          'lb', '3901.10.50', 'United States'),
  ('c1000000-0000-4000-8000-000000000002', 'HDPE - Inj',           'lb', '3901.20.50', 'United States'),
  ('c1000000-0000-4000-8000-000000000003', 'HDPE - Blow Mold',     'lb', '3901.20.50', 'United States'),
  ('c1000000-0000-4000-8000-000000000004', 'LLDPE - Film',         'lb', '3901.10.50', 'United States'),
  ('c1000000-0000-4000-8000-000000000005', 'PP Homopolymer - Inj', 'lb', '3902.10.00', 'United States'),
  ('c1000000-0000-4000-8000-000000000006', 'PP Copolymer - Inj',   'lb', '3902.30.00', 'United States'),
  ('c1000000-0000-4000-8000-000000000007', 'LLDPE - Inj',          'lb', '3901.10.50', 'United States'),
  ('c1000000-0000-4000-8000-000000000008', 'LDPE - Inj',           'lb', '3901.10.50', 'United States'),
  ('c1000000-0000-4000-8000-000000000009', 'HMWPE - Film',         'lb', '3901.20.50', 'United States')
on conflict (id) do nothing;
