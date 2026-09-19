-- =============================================================================
-- Per-container package weight — how much resin is in ONE package
-- =============================================================================
-- The container sheet derives the package count from the net weight:
-- supersacks and boxes are stuffed to 1,500 lbs, 25 kg bags to 25 kg
-- (`PACKAGE_STUFFING_LBS`, components/bank/export-shipments/package-kinds.ts).
-- Those are house defaults, not laws — a supplier who fills boxes to 1,200 lbs
-- would otherwise leave the desk back-solving the count by hand, so the sheet
-- offers an "Edit weight" override for the two variable-fill kinds.
--
-- The override lived only in component state, which meant reopening a container
-- showed the house default again with no record of what the stored count had
-- actually been derived at. This column gives it a home.
--
-- SCOPE: strictly this container. It is a fact about one physical box — the
-- pallet of 1,200 lb boxes that went into THIS one — not a setting for the
-- booking, the customer, or the kind. There is deliberately no group-level or
-- product-level default to inherit from: the next container is stuffed by
-- whoever stuffs it, and silently carrying 1,200 lbs onto it is exactly the
-- kind of quiet wrong number this codebase keeps having to chase down.
--
-- NULL is the normal state and means "use the house default for the kind".
-- Nothing back-fills it, so every existing container keeps deriving at 1,500
-- exactly as before. It is documentation arithmetic only: it prices nothing
-- (the invoice is priced on matched_orders.quantity_lbs) and it does not
-- constrain package_count, which the desk may still override by hand — a
-- short-filled last box is real, and the count is what the documents state.
-- =============================================================================

alter table public.shipment_containers
  add column package_weight_lbs numeric
    check (package_weight_lbs is null or package_weight_lbs > 0);

comment on column public.shipment_containers.package_weight_lbs is
  'Weight of ONE package in this container, overriding the house default for '
  'its package_kind (supersacks/boxes 1,500 lbs; 25 kg bags 25 kg). NULL = use '
  'the default. Scoped to this container only — never inherited by the next '
  'one. Derives package_count; prices nothing.';
