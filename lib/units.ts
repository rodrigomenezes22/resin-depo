// =============================================================================
// Unit → pounds conversion
// =============================================================================
// Mirrors the `orders.quantity_lbs` GENERATED column in the baseline migration
// (20260101000000_baseline.sql). The `orders` table computes lbs in-database,
// but `matched_orders.quantity_lbs` is a plain column — so when we create a
// matched order from manually-entered legs (no source offer to copy from) we
// compute it here. Keep these constants in sync with the migration.
// =============================================================================

export type OrderUnit =
  | "railcar"
  | "bulk_truck"
  | "truckload_boxes"
  | "truckload_bags"
  | "truckload_supersacks"
  | "barrel"
  | "supersacks"
  | "pounds"
  | "metric_tonnes"
  | "container_20"
  | "container_40"
  | "container_40hc"
  | "container"
  | "heavy_container"
  | "bags_25kg";

/** Pounds per one of each unit — must match the baseline `quantity_lbs` CASE. */
export const LBS_PER_UNIT: Record<OrderUnit, number> = {
  railcar: 190000,
  bulk_truck: 45000,
  truckload_boxes: 42000,
  truckload_bags: 44092,
  truckload_supersacks: 43000,
  barrel: 5000,
  supersacks: 2000,
  pounds: 1,
  metric_tonnes: 2205,
  container_20: 38500,
  container_40: 44500,
  container_40hc: 44500,
  container: 54565,
  heavy_container: 59524,
  bags_25kg: 55.1156,
};

/**
 * Display labels for each unit. Single source of truth — this map used to be
 * copy-pasted into nine components, so adding a unit meant nine edits and any
 * miss silently rendered the raw enum value.
 */
export const UNIT_LABELS: Record<OrderUnit, string> = {
  railcar: "Rail Car",
  bulk_truck: "Bulk Truck",
  truckload_boxes: "T/L Boxes",
  truckload_bags: "T/L Bags",
  truckload_supersacks: "T/L Supersacks",
  barrel: "Barrel",
  supersacks: "Supersacks",
  pounds: "Pounds",
  metric_tonnes: "Metric Tonnes",
  container_20: "20' Container",
  container_40: "40' Container",
  container_40hc: "40 HC Container",
  container: "Container",
  heavy_container: "Heavy Container",
  bags_25kg: "25 kg Bags",
};

/** Label for a unit, falling back to the raw value for anything unrecognized. */
export const unitLabel = (u: string): string => UNIT_LABELS[u as OrderUnit] ?? u;

/**
 * The sizes the desk actually trades — what the Transaction Summary's Size
 * filter offers.
 *
 * A SUBSET of `UNIT_LABELS`, which stays complete on purpose: barrels, loose
 * pounds, metric tonnes, 20'/40'/40 HC containers and 25 kg bags are still valid
 * values a historic row (or an import) can carry, and `unitLabel()` has to keep
 * rendering them rather than falling back to the raw enum. They are only
 * dropped from the FILTER, where picking one could never match anything.
 */
export const FILTERABLE_UNITS: readonly OrderUnit[] = [
  "railcar",
  "bulk_truck",
  "truckload_boxes",
  "truckload_bags",
  "truckload_supersacks",
  "container",
  "heavy_container",
];

/**
 * The sizes a shipment may be KEYED to — what the Transaction Detail
 * "Shipment Details" Unit dropdown offers.
 *
 * Another SUBSET of `UNIT_LABELS`, and for the same reason `FILTERABLE_UNITS`
 * is one: barrels, supersacks and 25 kg bags are packagings the desk retired,
 * so offering them on a live shipment only invites a size nobody trades. They
 * stay in `UNIT_LABELS` — dropping them from THERE would blank the Unit cell on
 * every historic row that still carries one, which is exactly what `unitLabel()`
 * exists to prevent.
 *
 * Wider than `FILTERABLE_UNITS`: loose pounds, metric tonnes and the
 * 20'/40'/40 HC containers are still keyable here even though the Size filter
 * does not offer them.
 */
export const SELECTABLE_UNITS: readonly OrderUnit[] = [
  "railcar",
  "bulk_truck",
  "truckload_boxes",
  "truckload_bags",
  "truckload_supersacks",
  "pounds",
  "metric_tonnes",
  "container_20",
  "container_40",
  "container_40hc",
  "container",
  "heavy_container",
];

/**
 * The sizes Logistics → Manage Truckloads' **Sizes** filter offers, in the
 * desk's reading order.
 *
 * A DEPARTURE FROM LEGACY, deliberately. `In_Transit.aspx` offered two numeric
 * bands — "Truckloads" (`SHIPMENT_SIZE` 42,000-45,000) and "Other Sizes"
 * (everything else) — which is a filter you can only use if you already know
 * which band a size falls in, and which mis-sorts the 44,500 lb 40' containers
 * into "Truckloads". The desk asked for the sizes by name instead, so this is a
 * per-unit list and the filter is a plain `unit = ?` equality.
 *
 * A SUBSET of the board, not its definition. The board itself shows every
 * non-railcar shipment (that predicate is the partition with Manage Railcars);
 * this only says which sizes can be SINGLED OUT. A deal booked in pounds or as
 * a 40 HC container still lists under "All sizes" and renders its label fine —
 * it just cannot be filtered to, the same posture `FILTERABLE_UNITS` takes on
 * the Transaction Summary ledger.
 *
 * `as const` because it drives a `z.enum` at the router boundary — widening it
 * to `OrderUnit[]` would cost the literal union that validates the input.
 */
export const TRUCKLOAD_FILTER_UNITS = [
  "bulk_truck",
  "truckload_boxes",
  "truckload_bags",
  "truckload_supersacks",
  "container_20",
  "container",
  "heavy_container",
] as const satisfies readonly OrderUnit[];

/**
 * Short size codes for the legacy-style order number (e.g. `18263-RC1`). Legacy
 * (Convert_Order.aspx.cs) named the railcar `RC`, bulk-truck legs `BT#` and
 * truckload legs `TL#`; the rest follow the same two-letter scheme.
 */
export const UNIT_CODE: Record<OrderUnit, string> = {
  railcar: "RC",
  bulk_truck: "BT",
  truckload_boxes: "TL",
  truckload_bags: "TG",
  truckload_supersacks: "TS",
  barrel: "BR",
  supersacks: "SS",
  pounds: "LB",
  metric_tonnes: "MT",
  container_20: "C2",
  container_40: "C4",
  container_40hc: "CH",
  container: "CN",
  heavy_container: "HC",
  bags_25kg: "KG",
};

/** Size code for a unit, falling back to the first two letters uppercased. */
export const unitCode = (u: string): string =>
  UNIT_CODE[u as OrderUnit] ??
  (u
    .replace(/[^a-z]/gi, "")
    .slice(0, 2)
    .toUpperCase() ||
    "XX");

/**
 * Legacy-style order number: a ≥5-digit order number, a dash, the size code and
 * a trailing digit — e.g. `18263-RC1` (one railcar) or `05012-TL4` (four
 * truckloads). Mirrors legacy's `{ORDR_ID}-{SKU}` display (In_Transit.aspx.cs).
 * The number is zero-padded to five digits to match the legacy width.
 *
 * Pure formatting: it does not know what the trailing digit MEANS. For a
 * standalone transaction that is the quantity; for a conversion leg it is the
 * leg's position. `dealOrderNumber()` below decides which, and is what UI
 * should call — this stays exported for the cases that genuinely have only a
 * number, a unit and a count.
 */
export function formatOrderNumber(
  displayNumber: number,
  unit: string,
  qty: number | string,
): string {
  const n = String(displayNumber).padStart(5, "0");
  const q = Math.max(1, Math.round(Number(qty) || 0));
  return `${n}-${unitCode(unit)}${q}`;
}

/** The fields a transaction must expose for its order number to be composed. */
export type DealOrderNumberFields = {
  display_number: number;
  unit: string;
  qty: number | string;
  /** The parent's display number, when this transaction is a conversion leg. */
  parent_display_number?: number | null;
  /** 1-based position within its conversion; null for anything not a leg. */
  leg_index?: number | null;
};

/**
 * The order number a TRANSACTION shows.
 *
 * A conversion leg keeps its PARENT's number and is distinguished by the size
 * code plus its index: #5025 cut into five bulk trucks reads `05025-BT1` …
 * `05025-BT5`. That is the legacy shape — legacy kept `SHIPMENT_ORDR_ID` (the
 * parent order's) and `SHIPMENT_SKU` ("BT1", "BT2") as separate columns and
 * concatenated them only for display (`Convert_Order.aspx.cs:115-120, 260-261`);
 * one ORDER owned many SHIPMENTs. Our model fuses the two — every leg is its own
 * `matched_orders` row with its own `display_number` — so without this the five
 * legs of one railcar rendered as `05026-BT1`, `05027-BT1`, `05028-BT1`…: five
 * unrelated-looking numbers that all ended in `BT1`, because the trailing digit
 * was the quantity and every leg is one truck.
 *
 * A leg's own `display_number` is still assigned and still distinct — it is what
 * `orderByLineage` sorts legs by (balance leg last, see lib/conversion.ts). Only
 * the DISPLAY changes; nothing about identity or ordering does.
 *
 * Anything that is not a leg — including a converted parent, which survives as a
 * pass-through row — renders exactly as before.
 */
export function dealOrderNumber(d: DealOrderNumberFields): string {
  return d.parent_display_number != null && d.leg_index != null
    ? formatOrderNumber(d.parent_display_number, d.unit, d.leg_index)
    : formatOrderNumber(d.display_number, d.unit, d.qty);
}

/** Convert a quantity in the given unit to pounds. Unknown units fall back to 1:1. */
export function quantityToLbs(qty: number, unit: string): number {
  const per = LBS_PER_UNIT[unit as OrderUnit] ?? 1;
  return qty * per;
}

/**
 * Pounds → metric tonnes, using the same 2205 factor as `LBS_PER_UNIT` (and so
 * the same as the `orders.quantity_lbs` generated column) rather than the
 * metrological 2204.62. Export documents state contract weight in both units
 * side by side; using a second factor here would make the MT and lbs columns
 * disagree about the same contract.
 */
export function lbsToMetricTons(lbs: number): number {
  return lbs / LBS_PER_UNIT.metric_tonnes;
}

/**
 * Pounds → kilograms, pinned to the same `metric_tonnes` factor so that
 * `lbsToKilograms(x) === lbsToMetricTons(x) * 1000` exactly. Export documents
 * state weights in KG and quantities in MT on the same page; deriving them from
 * two different factors is how a Commercial Invoice ends up disagreeing with
 * its own Packing List.
 */
export function lbsToKilograms(lbs: number): number {
  return lbs / (LBS_PER_UNIT.metric_tonnes / 1000);
}

/**
 * Metric tonnes → pounds. The exact inverse of `lbsToMetricTons`, sharing its
 * factor for the same reason `kilogramsToLbs` does: a weight keyed in MT and
 * read back in MT must come back as itself, not drift a pound per round trip.
 *
 * NOT the `MT_TO_LB = 0.00045359237` constant copy-pasted across the
 * marketplace and sales forms — that one converts a PRICE per metric ton and is
 * pinned to the metrological factor. Weights here use 2205, the same factor the
 * database's `quantity_lbs` generated column uses, so a weight and the money
 * charged for it cannot disagree about how heavy a tonne is.
 */
export function metricTonsToLbs(mt: number): number {
  return mt * LBS_PER_UNIT.metric_tonnes;
}

/** The units a weight field can be displayed and typed in. Storage is ALWAYS lbs. */
export type WeightUnit = "lbs" | "kg" | "mt";

/** Column-header suffix for a displayed unit — "Net Weight (MT)". */
export const WEIGHT_UNIT_SUFFIX: Record<WeightUnit, string> = {
  lbs: "(lbs)",
  kg: "(kg)",
  mt: "(MT)",
};

/**
 * How many decimals a unit is trimmed to before display.
 *
 * PER UNIT, not one constant, because a decimal place is worth wildly different
 * amounts in each: 0.001 kg is 0.002 lb (past any scale), but **0.001 MT is
 * 2.2 lb**. Trimming metric tonnes to three decimals quantizes the underlying
 * weight to the nearest two pounds, so a value the desk typed shifts every time
 * the toggle is flipped — and the row it belongs to stays dirty because the
 * draft no longer matches what the server would render.
 *
 * Six is chosen so one unit in the last place is well under a hundredth of a
 * pound in every unit here.
 */
const DISPLAY_DECIMALS: Record<WeightUnit, number> = { lbs: 3, kg: 3, mt: 6 };

/**
 * Trim a converted number back to something a human would type, at a precision
 * that keeps the conversion stable: flipping the toggle twice returns the value
 * you started with rather than shedding a fraction each time.
 */
const tidy = (n: number, unit: WeightUnit): string =>
  String(Number(n.toFixed(DISPLAY_DECIMALS[unit])));

/**
 * A field value typed in `unit` → pounds, the storage unit.
 *
 * `null` for blank or unparseable input, so a caller can tell "cleared" from
 * "zero" — the partial-patch vocabulary the boards use depends on that.
 */
export function weightToLbs(value: string, unit: WeightUnit): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (unit === "kg") return kilogramsToLbs(n);
  if (unit === "mt") return metricTonsToLbs(n);
  return n;
}

/** Pounds → a field value in `unit`, rounded to something typeable. */
export function weightFromLbs(lbs: number | null | undefined, unit: WeightUnit): string {
  if (lbs == null) return "";
  if (unit === "kg") return tidy(lbsToKilograms(lbs), unit);
  if (unit === "mt") return tidy(lbsToMetricTons(lbs), unit);
  return tidy(lbs, unit);
}

/**
 * Kilograms → pounds. The exact inverse of `lbsToKilograms`, sharing its
 * factor rather than hard-coding 2.205 or 2.20462.
 *
 * Weights are STORED in pounds; the container sheet lets the desk read and
 * type them in kg. Anything the desk enters in kg is converted back through
 * here, so a value keyed in kg and re-read in kg comes back as itself instead
 * of drifting a few pounds on every round trip.
 */
export function kilogramsToLbs(kg: number): number {
  return kg * (LBS_PER_UNIT.metric_tonnes / 1000);
}

/**
 * A price per pound restated per metric tonne. A Sales Contract quotes
 * $/MT where the Commercial Invoice quotes $/lb — the same money on the same
 * material, so it must use the same factor as the weight conversions or the
 * two documents' totals will not reconcile.
 */
export function pricePerLbToPerMetricTon(pricePerLb: number): number {
  return pricePerLb * LBS_PER_UNIT.metric_tonnes;
}
