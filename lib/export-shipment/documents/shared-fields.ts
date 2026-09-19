// =============================================================================
// Shared fields — which document keys are the SHIPMENT's data, and where
// =============================================================================
// resin-depo relaxes TPE's "a draft opens on its stored payload" rule, because
// here the same fact (vessel, port, terms, HS code) is typed once on the
// shipment and printed on five documents. The rule this module encodes:
//
//   · A shared key has one home — a column on shipment_groups (Booking card),
//     the purchase (parent matched_orders row), or the product. Every DRAFT
//     document reads it LIVE; saving a document that changed it writes it back
//     home and every other draft is re-derived (trpc resyncDrafts).
//   · A derived key is computed from picker-backed data (ports, carrier,
//     incoterm, party blocks, totals). Drafts read it live too, but it is not
//     editable in a document form — the desk changes it where the picker is.
//   · Everything else is document-local: it lives only in that document's
//     payload (invoice date, description wording, a hand-set payment due).
//
// Issued documents are unaffected: the DB lock keeps them frozen except for
// their allowlisted references, and those still write back.
//
// Pure data + pure functions — imported by the router AND the client forms.
// =============================================================================

/** Where a shared key lives. */
export type SharedTarget =
  | { table: "shipment_groups"; column: string }
  | { table: "purchase"; column: string }
  | { table: "products"; column: string };

/** The shared key → home column mapping. Same key name across document types. */
export const SHARED_TARGETS: Record<string, SharedTarget> = {
  // Booking
  vesselName: { table: "shipment_groups", column: "vessel_name" },
  voyageNumber: { table: "shipment_groups", column: "voyage_number" },
  carrierBookingNumber: { table: "shipment_groups", column: "booking_number" },
  bookingNumber: { table: "shipment_groups", column: "booking_number" },
  hblNumber: { table: "shipment_groups", column: "hbl_number" },
  sailingOnOrAbout: { table: "shipment_groups", column: "etd" },
  shippingDate: { table: "shipment_groups", column: "etd" },
  latestSailingDate: { table: "shipment_groups", column: "etd" },
  atd: { table: "shipment_groups", column: "etd" },
  blDate: { table: "shipment_groups", column: "etd" },
  eta: { table: "shipment_groups", column: "eta" },
  placeOfReceipt: { table: "shipment_groups", column: "place_of_receipt" },
  placeOfDelivery: { table: "shipment_groups", column: "place_of_delivery" },
  forwardingAgent: { table: "shipment_groups", column: "forwarding_agent" },
  fmcNumber: { table: "shipment_groups", column: "fmc_number" },
  loadingTerminal: { table: "shipment_groups", column: "loading_terminal" },
  typeOfMove: { table: "shipment_groups", column: "type_of_move" },
  finalDestination: { table: "shipment_groups", column: "final_destination" },
  freightTerms: { table: "shipment_groups", column: "freight_terms" },
  dthcTerms: { table: "shipment_groups", column: "dthc_terms" },
  aesItn: { table: "shipment_groups", column: "aes_itn" },
  // Purchase
  customerReference: { table: "purchase", column: "buyer_po" },
  paymentTerms: { table: "purchase", column: "buyer_terms" },
  tolerancePct: { table: "purchase", column: "tolerance_pct" },
  insurance: { table: "purchase", column: "insurance_terms" },
  shipmentWindow: { table: "purchase", column: "shipment_window" },
  // Product
  commodityCode: { table: "products", column: "hs_code" },
  countryOfOrigin: { table: "products", column: "country_of_origin" },
};

/**
 * Derived keys: shown live on drafts, edited on the shipment (or computed).
 * The COO's blNumber prefers the HBL and falls back to the master B/L, so it is
 * derived rather than mapped to one column.
 */
export const DERIVED_KEYS = new Set<string>([
  "portOfLoading",
  "portOfDischarge",
  "destination",
  "deliveredTo",
  "carrierName",
  "incoterms",
  "vesselVoyage",
  "blNumber",
  "shipper",
  "seller",
  "bank",
  "signatory",
  "routingInstructions",
  "transactionDate",
]);

/** Keys a document owns outright — never overwritten by a re-derivation. */
export const LOCAL_KEYS = new Set<string>([
  "documentNumber",
  "invoiceDate",
  "issueDate",
  "contractDate",
  "paymentDue",
  "descriptionOfGoods",
  "description",
  "grade",
  "packaging",
  "packing",
  "marksAndNumbers",
  "exportReferences",
  "measurement",
  "remarks",
  "notifyParty",
  "consignee",
  "buyer",
  "billTo",
  "soldTo",
  "shippingVia",
]);

export const isSharedKey = (key: string) => key in SHARED_TARGETS;
export const isDerivedKey = (key: string) => DERIVED_KEYS.has(key);

/** True when a form must not offer this key for editing (edit it on the shipment). */
export const isEditedOnShipment = (key: string) => DERIVED_KEYS.has(key);

/**
 * A DRAFT's working payload: the stored document with every shared and
 * derived key — and the container-dependent keys (lines, totals, summaries) —
 * replaced by the live derivation. Local keys keep what the document says.
 * Shared/derived keys the fresh payload lacks (older docs) fall through.
 */
export function mergeLiveIntoDraft<T extends Record<string, unknown>>(
  stored: T,
  fresh: Record<string, unknown>,
): T {
  const out: Record<string, unknown> = { ...stored };
  for (const [key, value] of Object.entries(fresh)) {
    if (LOCAL_KEYS.has(key)) continue;
    // Everything that is not explicitly document-local follows the shipment:
    // shared, derived, and the line / total / summary keys that depend on the
    // covered containers.
    out[key] = value;
  }
  // documentNumber is the row's identity, never the fresh placeholder.
  if (stored.documentNumber !== undefined) out.documentNumber = stored.documentNumber;
  return out as T;
}

/**
 * The write-back patch for a saved document: every shared key whose value
 * differs from the live derivation, grouped by home table. `fresh` is the
 * live payload for the same document type, so the comparison is like-for-like
 * (e.g. both sides are "Net 30 days from shipment").
 */
export function sharedWriteBack(
  payload: Record<string, unknown>,
  fresh: Record<string, unknown>,
): {
  shipment_groups: Record<string, unknown>;
  purchase: Record<string, unknown>;
  products: Record<string, unknown>;
} {
  const out = {
    shipment_groups: {} as Record<string, unknown>,
    purchase: {} as Record<string, unknown>,
    products: {} as Record<string, unknown>,
  };
  for (const [key, target] of Object.entries(SHARED_TARGETS)) {
    if (!(key in payload)) continue;
    const next = normalise(payload[key]);
    const live = normalise(fresh[key]);
    if (next === live) continue;
    // Two doc keys can map to one column (shippingDate + sailingOnOrAbout →
    // etd). First writer wins within one save; they were equal on open.
    if (target.column in out[target.table]) continue;
    out[target.table][target.column] = next;
  }
  return out;
}

const normalise = (v: unknown): unknown => {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v.trim() === "" ? null : v.trim();
  return v;
};
