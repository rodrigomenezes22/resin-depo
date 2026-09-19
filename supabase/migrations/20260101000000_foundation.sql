-- =============================================================================
-- Foundation — the minimal upstream schema the TPE export feature depends on
-- =============================================================================
-- resin-depo is an interim, standalone copy of TPE's "Export Shipments"
-- section. It has NO access to TPE's database, but its data must import into
-- TPE later, so the export tables themselves are copied from TPE verbatim
-- (every migration after this one is byte-identical to its TPE twin).
--
-- Those copied migrations FK into, ALTER, and read from a handful of upstream
-- TPE tables. This file creates only those tables, with TPE-identical names
-- and column types, in their PRE-EXPORT shape:
--
--   · 20260731183551 adds locations.country / unlocode
--   · 20260804120000 adds organizations.address2 / tax_id / eori / contact_name
--                    and products.hs_code / country_of_origin
--   · 20260804130000 adds matched_orders.tolerance_pct / insurance_terms /
--                    shipment_window
--
-- so none of those columns may exist here, or the copied ALTERs would fail.
-- The trailing target-only migration (20260918000000) drops organizations.
-- address2 again, mirroring TPE 20260902042751, so every table ends in TPE's
-- current shape.
--
-- Deliberate deviations from TPE, all import-safe:
--   · user_profiles.platform_role DEFAULTS TO 'admin'. This app has one trusted
--     team; every copied RLS policy reads get_platform_role() in
--     ('admin','broker_trader'), and this default is what opens them.
--   · matched_orders_display_number_seq starts at 900000 (TPE: 5000) so order
--     numbers typed here can never collide with TPE's on import.
--   · matched_orders.tpe_buy_price defaults to 0 (TPE: no default). The export
--     team never records a buy side.
--   · public.lots is a two-column stub — it exists only so
--     shipment_container_lots.lot_id's FK (20260804120000) copies verbatim.
--   · Columns that only serve TPE's ledger/CRM/inventory (orders, deals, tax,
--     spec, CRM allocation) are omitted. matched_orders keeps exactly what the
--     export router selects and the export triggers read.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums (values verbatim from TPE — the guard trigger compares against them)
-- ---------------------------------------------------------------------------

create type public.order_market as enum ('domestic', 'international');

create type public.order_unit as enum (
  'railcar',
  'bulk_truck',
  'truckload_boxes',
  'truckload_bags',
  'barrel',
  'supersacks',
  'pounds',
  'metric_tonnes',
  'container_20',
  'container_40',
  'container_40hc',
  'bags_25kg',
  'container',
  'heavy_container',
  'truckload_supersacks'
);

create type public.order_quality as enum ('prime', 'offgrade', 'regrind');

create type public.ship_status as enum ('inventory', 'enroute', 'delivered', 'client_reserved');

create type public.location_kind as enum ('warehouse', 'port', 'customer_dock', 'office');

-- ---------------------------------------------------------------------------
-- user_profiles + role function + signup trigger
-- ---------------------------------------------------------------------------

create table public.user_profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  first_name        text,
  last_name         text,
  organization_name text,
  platform_role     text not null default 'admin',
  organization_id   uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint user_profiles_platform_role_check check (
    platform_role in (
      'admin', 'broker_trader', 'external_broker',
      'resin_processor', 'resin_producer', 'resin_analyst'
    )
  )
);

comment on table public.user_profiles is
  'One row per auth user (1:1 with auth.users). platform_role drives every RLS policy through get_platform_role(); in resin-depo every user is admin.';
comment on column public.user_profiles.platform_role is
  'RBAC role. TPE vocabulary kept for import parity; resin-depo defaults to admin because the export team is one trusted group.';

create function public.get_platform_role() returns text
  language sql stable security definer
  as $$
  select platform_role from public.user_profiles where id = auth.uid()
$$;

grant execute on function public.get_platform_role() to anon, authenticated, service_role;

create function public.handle_new_user() returns trigger
  language plpgsql security definer
  set search_path to ''
  as $$
begin
  insert into public.user_profiles (id, first_name, last_name, platform_role)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''),
    'admin'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users created before this migration (the seeded admin) never fired the
-- trigger — give them profiles now.
insert into public.user_profiles (id, platform_role)
select id, 'admin' from auth.users
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- organizations — parties: the exchange (seller), buyers, carriers
-- ---------------------------------------------------------------------------

create table public.organizations (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  role               text not null,
  created_at         timestamptz not null default now(),
  credit_limit       numeric(14,2) not null default 0,
  credit_available   numeric(14,2) not null default 0,
  payment_terms_days integer not null default 30,
  service_kind       text,
  phone              text,
  email              text,
  deactivated_at     timestamptz,
  constraint organizations_role_check check (
    role in ('exchange', 'buyer', 'seller', 'distributor', 'service_provider', 'partner')
  ),
  constraint organizations_service_kind_check check (
    service_kind is null or service_kind in ('freight', 'warehouse', 'both')
  )
);

comment on table public.organizations is
  'Companies. role=exchange is TPE itself (the exporter/seller on every document); buyers are consignees; service_provider + service_kind freight/both are ocean carriers.';

alter table public.user_profiles
  add constraint user_profiles_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete set null;

-- ---------------------------------------------------------------------------
-- products — resin grades (hs_code / country_of_origin arrive in 20260804120000)
-- ---------------------------------------------------------------------------

create table public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  base_unit  text not null default 'kg',
  created_at timestamptz not null default now(),
  constraint products_base_unit_check check (base_unit in ('kg', 'lb', 'mt'))
);

comment on table public.products is 'Product / grade catalogue printed on document goods lines.';

-- ---------------------------------------------------------------------------
-- locations + organization_locations — addresses and ports
-- ---------------------------------------------------------------------------
-- Shape = TPE locations after 20260826133933 (+ surcharge columns from
-- 20260910173321, so lib/locations/queries.ts LOCATION_COLUMNS copies verbatim)
-- but BEFORE country/unlocode (20260731183551 adds those).

create table public.locations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  kind                public.location_kind not null default 'warehouse',
  city                text,
  state               text,
  operated_by_org_id  uuid references public.organizations(id) on delete set null,
  created_at          timestamptz not null default now(),
  address_line1       text,
  address_line2       text,
  zip                 text,
  contact_name        text,
  phone               text,
  email               text,
  rail_number         text,
  instructions        text,
  deactivated_at      timestamptz,
  updated_at          timestamptz,
  updated_by          uuid references public.user_profiles(id) on delete set null,
  surcharge_free_days integer,
  surcharge_amount    numeric(14,4),
  surcharge_basis     text,
  surcharge_period    text not null default 'month',
  constraint locations_surcharge_amount_basis_together check (
    (surcharge_amount is null and surcharge_basis is null)
    or (surcharge_amount is not null and surcharge_basis is not null)
  ),
  constraint locations_surcharge_free_days_check check (
    surcharge_free_days is null or surcharge_free_days >= 0
  ),
  constraint locations_surcharge_amount_check check (
    surcharge_amount is null or surcharge_amount >= 0
  ),
  constraint locations_surcharge_basis_check check (
    surcharge_basis is null or surcharge_basis in ('per_lb', 'per_kg', 'per_pallet')
  ),
  constraint locations_surcharge_period_check check (
    surcharge_period in ('day', 'week', 'month')
  )
);

comment on table public.locations is
  'Places: kind=office rows are party addresses (linked through organization_locations); kind=port rows are ports of loading/discharge (unlocode added by 20260731183551).';

create index locations_kind_idx on public.locations (kind);
create index locations_operated_by_idx on public.locations (operated_by_org_id)
  where operated_by_org_id is not null;

create or replace function public.trg_locations_stamp_updated()
  returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger trg_locations_stamp_updated
  before update on public.locations
  for each row execute function public.trg_locations_stamp_updated();

create table public.organization_locations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  location_id     uuid not null references public.locations(id) on delete restrict,
  role            text not null,
  is_primary      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz,
  updated_by      uuid references public.user_profiles(id) on delete set null,
  constraint organization_locations_role_check
    check (role in ('headquarters', 'billing', 'shipping_point', 'delivery_point', 'remittance')),
  constraint organization_locations_org_loc_role_key
    unique (organization_id, location_id, role)
);

comment on table public.organization_locations is
  'Org <-> location role links. Documents resolve the exchange''s headquarters and the buyer''s billing address through this table (lib/locations/queries.ts resolveOrgAddress).';

create unique index organization_locations_one_hq_idx
  on public.organization_locations (organization_id) where role = 'headquarters';
create unique index organization_locations_primary_idx
  on public.organization_locations (organization_id, role) where is_primary;
create index organization_locations_location_idx
  on public.organization_locations (location_id);

create or replace function public.trg_organization_locations_stamp_updated()
  returns trigger language plpgsql security definer as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger trg_organization_locations_stamp_updated
  before update on public.organization_locations
  for each row execute function public.trg_organization_locations_stamp_updated();

-- ---------------------------------------------------------------------------
-- lots — stub for FK parity only
-- ---------------------------------------------------------------------------

create table public.lots (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

comment on table public.lots is
  'Stub. Exists so shipment_container_lots.lot_id (20260804120000) can reference it verbatim. Never written in resin-depo; lot numbers are free text.';

-- ---------------------------------------------------------------------------
-- matched_orders — the trade line behind every container
-- ---------------------------------------------------------------------------
-- In TPE a container IS a matched order (shipment_containers.matched_order_id
-- NOT NULL UNIQUE). resin-depo creates these rows from the "Add container"
-- drawer. Columns = exactly what trpc/routers/export-shipments.ts selects and
-- the export triggers/functions read (market, unit, status,
-- parent_matched_order_id, quantity_lbs, freight, ship_status).

create sequence public.matched_orders_display_number_seq start 900000;

create table public.matched_orders (
  id                      uuid primary key default gen_random_uuid(),
  display_number          integer not null default nextval('public.matched_orders_display_number_seq'),
  market                  public.order_market not null default 'domestic',
  buyer_company_id        uuid references public.organizations(id) on delete set null,
  buyer_company_text      text,
  buyer_terms             text,
  seller_company_id       uuid references public.organizations(id) on delete set null,
  seller_company_text     text,
  seller_terms            text,
  buyer_po                text,
  product_id              uuid references public.products(id) on delete set null,
  product_text            text,
  quality                 public.order_quality not null default 'prime',
  qty                     numeric not null,
  unit                    public.order_unit not null,
  quantity_lbs            numeric not null default 0,
  tpe_buy_price           numeric not null default 0,
  tpe_sell_price          numeric not null,
  commission_pct          numeric not null default 0,
  freight                 numeric not null default 0,
  notes                   text,
  broker_id               uuid not null references public.user_profiles(id) on delete restrict,
  status                  text not null default 'matched',
  created_at              timestamptz not null default now(),
  shipping_terms          text,
  legacy_number           text,
  parent_matched_order_id uuid references public.matched_orders(id) on delete set null,
  leg_index               integer,
  ship_status             public.ship_status not null default 'inventory',
  constraint matched_orders_qty_check            check (qty > 0),
  constraint matched_orders_tpe_buy_price_check  check (tpe_buy_price >= 0),
  constraint matched_orders_tpe_sell_price_check check (tpe_sell_price >= 0),
  constraint matched_orders_commission_pct_check check (commission_pct >= 0),
  constraint matched_orders_freight_check        check (freight >= 0),
  constraint matched_orders_status_check         check (status in ('draft', 'matched'))
);

comment on table public.matched_orders is
  'Trade lines. One row per container on an export shipment: order number, buyer, product, contract weight (quantity_lbs prices the invoice), sell price, terms. display_number starts at 900000 so it never collides with TPE on import.';
comment on column public.matched_orders.legacy_number is
  'Free-text reference from the team''s existing paperwork (their pre-TPE order number).';
comment on column public.matched_orders.freight is
  'Allocated share of shipment costs, written by allocate_shipment_costs() (20260805090000). Never edited by hand.';

create unique index matched_orders_display_number_idx on public.matched_orders (display_number);
create index matched_orders_parent_idx on public.matched_orders (parent_matched_order_id)
  where parent_matched_order_id is not null;
create index matched_orders_buyer_idx on public.matched_orders (buyer_company_id);

-- ---------------------------------------------------------------------------
-- Grants + RLS — one trusted internal team
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.user_profiles,
  public.organizations,
  public.products,
  public.locations,
  public.organization_locations,
  public.lots,
  public.matched_orders
to authenticated;

grant usage, select on sequence public.matched_orders_display_number_seq to authenticated;

alter table public.user_profiles          enable row level security;
alter table public.organizations          enable row level security;
alter table public.products               enable row level security;
alter table public.locations              enable row level security;
alter table public.organization_locations enable row level security;
alter table public.lots                   enable row level security;
alter table public.matched_orders         enable row level security;

create policy user_profiles_select on public.user_profiles
  for select using (id = auth.uid() or public.get_platform_role() = 'admin');
create policy user_profiles_update_own on public.user_profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy organizations_internal on public.organizations
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));

create policy products_internal on public.products
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));

create policy locations_internal on public.locations
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));

create policy organization_locations_internal on public.organization_locations
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));

create policy lots_internal on public.lots
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));

create policy matched_orders_internal on public.matched_orders
  for all using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
