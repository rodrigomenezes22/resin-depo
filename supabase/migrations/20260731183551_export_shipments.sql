-- =============================================================================
-- Export Shipments — grouping container transactions into one booking
-- =============================================================================
-- International sales ship as containers. Each container is already its own
-- matched_orders row, but commercially they move as ONE shipment: one booking
-- with the ocean carrier, one Commercial Invoice covering several containers,
-- one set of shared costs quoted for the booking rather than per box.
--
-- This layer sits BESIDE matched_orders and does not touch it. A container
-- record is 1:1 with a transaction (UNIQUE) and carries the group link, so the
-- Transaction Summary ledger, its internal-side totals, and the railcar
-- conversion lineage (parent_matched_order_id / orderByLineage) all keep
-- working unchanged. The ledger stays one row per container.
--
-- Why not `lots`: a lot is shareable and splittable — a deal can be fulfilled
-- from a lot shared with other deals (see costsEditable in transactionDetail),
-- and convert_matched_order deliberately refuses to copy car_number to child
-- lots ("a truck is not the railcar"). Conveyance identity does not belong on a
-- material node.
--
-- Why not columns on matched_orders: nine export-only columns NULL on every
-- domestic truckload, widening four select lists for a small minority of rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Ports — extend locations rather than add a table
-- ---------------------------------------------------------------------------
-- `locations` already has kind = 'port', RLS, and a picker (inventory.locations).
-- A discharge port is usually foreign, and `state` is US-shaped, so a port needs
-- a country; UN/LOCODE is what the carrier and the B/L actually key on.
alter table public.locations
  add column country  text,
  add column unlocode text;

create unique index locations_unlocode_idx
  on public.locations (unlocode)
  where unlocode is not null;

comment on column public.locations.unlocode is
  'UN/LOCODE for a port (e.g. USHOU, CNSHA). Null for warehouses and customer docks.';

-- ---------------------------------------------------------------------------
-- shipment_groups — the booking
-- ---------------------------------------------------------------------------
-- Vessel / voyage / dates / ports are set ONCE here; the booking number is set
-- per container, because the line issues one per box and a rolled box gets a
-- new one.
create type shipment_group_status as enum
  ('draft', 'booked', 'sailed', 'arrived', 'closed', 'cancelled');

create type incoterm as enum
  ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP');

create sequence shipment_groups_display_number_seq start 1000;

create table public.shipment_groups (
  id                   uuid primary key default gen_random_uuid(),
  display_number       bigint not null default nextval('shipment_groups_display_number_seq'),

  status               shipment_group_status not null default 'draft',
  incoterm             incoterm not null default 'FOB',
  currency             text not null default 'USD',

  -- the booking, set once for the whole shipment
  carrier_org_id       uuid references public.organizations(id) on delete set null,
  vessel_name          text,
  voyage_number        text,
  master_bl_number     text,
  pol_location_id      uuid references public.locations(id) on delete set null,
  pod_location_id      uuid references public.locations(id) on delete set null,
  place_of_receipt     text,
  place_of_delivery    text,
  etd                  date,
  eta                  date,

  -- set when this shipment was minted by rolling containers out of another
  rolled_from_group_id uuid references public.shipment_groups(id) on delete set null,

  notes                text,
  created_by           uuid references public.user_profiles(id) on delete set null,
  created_at           timestamptz not null default now(),

  constraint shipment_groups_not_rolled_from_self check (rolled_from_group_id <> id)
);

create unique index shipment_groups_display_number_idx
  on public.shipment_groups (display_number);
create index shipment_groups_status_idx on public.shipment_groups (status);
create index shipment_groups_etd_idx on public.shipment_groups (etd desc nulls last);

comment on table public.shipment_groups is
  'An export shipment: one ocean booking covering one or more container transactions. Vessel/voyage/ports/dates live here; booking numbers live per container.';
comment on column public.shipment_groups.status is
  'Hand-set desk label (the analogue of matched_orders.ship_status), NOT event-sourced. Physical movement remains deliveries.status via delivery_events. Readiness ("3 of 4 containers stuffed") is derived, never stored.';

-- ---------------------------------------------------------------------------
-- shipment_containers — one steel box, 1:1 with a transaction
-- ---------------------------------------------------------------------------
create table public.shipment_containers (
  id                   uuid primary key default gen_random_uuid(),

  -- UNIQUE makes "one container = one transaction" a database invariant rather
  -- than a convention. Dropping it later is a one-line migration if a heavy
  -- container ever needs to span two deals.
  matched_order_id     uuid not null unique
                         references public.matched_orders(id) on delete cascade,

  -- Nullable: a container can exist unassigned while a shipment is assembled,
  -- and `on delete set null` keeps the manifest row alive if a group is removed.
  shipment_group_id    uuid references public.shipment_groups(id) on delete set null,
  position             integer not null default 1 check (position > 0),

  booking_number       text,
  container_number     text,
  seal_number          text,
  package_count        integer check (package_count is null or package_count > 0),
  package_kind         text,

  -- Documentation weights. These NEVER price anything — the Commercial Invoice
  -- is priced on matched_orders.quantity_lbs (the contract weight). They exist
  -- for the Packing List and the B/L.
  net_weight_lbs       numeric check (net_weight_lbs is null or net_weight_lbs > 0),
  tare_weight_lbs      numeric check (tare_weight_lbs is null or tare_weight_lbs >= 0),
  gross_weight_lbs     numeric generated always as
                         (coalesce(net_weight_lbs, 0) + coalesce(tare_weight_lbs, 0)) stored,

  marks_and_numbers    text,

  rolled_from_group_id uuid references public.shipment_groups(id) on delete set null,
  created_at           timestamptz not null default now()
);

-- Contiguous manifest positions: a manifest must never read 1, 3, 4.
create unique index shipment_containers_group_position_idx
  on public.shipment_containers (shipment_group_id, position)
  where shipment_group_id is not null;
create index shipment_containers_group_idx on public.shipment_containers (shipment_group_id);

comment on column public.shipment_containers.gross_weight_lbs is
  'GENERATED = net + tare. A document where gross disagrees with net+tare is a customs problem, so it is made underivable by hand.';
comment on column public.shipment_containers.net_weight_lbs is
  'Actual loaded weight, for the Packing List and B/L only. The invoice is priced on matched_orders.quantity_lbs.';

-- ---------------------------------------------------------------------------
-- The guard: what may be grouped at all
-- ---------------------------------------------------------------------------
-- A conversion PARENT must never be groupable. convert_matched_order rewrites
-- the parent into a zero-margin pass-through whose buyer is the exchange org,
-- and the ledger footer excludes it from its totals via seller_internal /
-- buyer_internal. Letting one into a shipment would double-count TPE-to-TPE
-- money in the group totals. Its container-sized LEGS are fine, and are the
-- normal case for a railcar broken down for export.
create or replace function public.shipment_containers_guard()
returns trigger
language plpgsql
as $$
declare
  v_market    order_market;
  v_unit      order_unit;
  v_status    text;
  v_is_parent boolean;
  v_found     boolean;
begin
  select true, mo.market, mo.unit, mo.status,
         exists (select 1 from public.matched_orders c
                 where c.parent_matched_order_id = mo.id)
    into v_found, v_market, v_unit, v_status, v_is_parent
  from public.matched_orders mo
  where mo.id = new.matched_order_id;

  if v_found is not true then
    raise exception 'shipment: transaction % does not exist', new.matched_order_id;
  end if;

  if v_market <> 'international' then
    raise exception 'shipment: only international transactions ship as containers (this one is %)', v_market;
  end if;

  if v_unit not in ('container', 'heavy_container', 'container_20', 'container_40', 'container_40hc') then
    raise exception 'shipment: transaction unit % is not a container', v_unit;
  end if;

  if v_status = 'draft' then
    raise exception 'shipment: a draft transaction cannot be added to a shipment';
  end if;

  if v_is_parent then
    raise exception 'shipment: a conversion parent is a pass-through, not a container — group its legs instead';
  end if;

  return new;
end;
$$;

create trigger shipment_containers_guard
  before insert or update of matched_order_id on public.shipment_containers
  for each row execute function public.shipment_containers_guard();

-- ---------------------------------------------------------------------------
-- shipment_group_events — append-only audit (mirrors delivery_events)
-- ---------------------------------------------------------------------------
create table public.shipment_group_events (
  id                uuid primary key default gen_random_uuid(),
  shipment_group_id uuid not null references public.shipment_groups(id) on delete cascade,
  -- created | containers_assigned | containers_removed | containers_rolled_out
  -- | containers_rolled_in | status_changed | cost_reallocated | document_issued
  event_type        text not null,
  payload           jsonb not null default '{}'::jsonb,
  performed_by      uuid references public.user_profiles(id) on delete set null,
  occurred_at       timestamptz not null default now()
);

create index shipment_group_events_group_idx
  on public.shipment_group_events (shipment_group_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- RLS — internal-only, matching every other inventory/deal table
-- ---------------------------------------------------------------------------
alter table public.shipment_groups        enable row level security;
alter table public.shipment_containers    enable row level security;
alter table public.shipment_group_events  enable row level security;

create policy shipment_groups_select_internal on public.shipment_groups
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_groups_insert_internal on public.shipment_groups
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_groups_update_internal on public.shipment_groups
  for update
  using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_groups_delete_admin on public.shipment_groups
  for delete using (public.get_platform_role() = 'admin');

create policy shipment_containers_select_internal on public.shipment_containers
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_containers_insert_internal on public.shipment_containers
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_containers_update_internal on public.shipment_containers
  for update
  using (public.get_platform_role() in ('admin', 'broker_trader'))
  with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_containers_delete_admin on public.shipment_containers
  for delete using (public.get_platform_role() = 'admin');

create policy shipment_group_events_select_internal on public.shipment_group_events
  for select using (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_group_events_insert_internal on public.shipment_group_events
  for insert with check (public.get_platform_role() in ('admin', 'broker_trader'));
create policy shipment_group_events_delete_admin on public.shipment_group_events
  for delete using (public.get_platform_role() = 'admin');
