// =============================================================================
// Editable-after-issue allowlist
// =============================================================================
// MIRRORS the SQL function `public.shipment_document_editable_keys(doc_type)`
// in 20260804120100_shipment_documents.sql. The database is the enforcement —
// this copy exists only so the sheet can grey out the inputs it already knows
// will be refused, rather than letting someone type into a field and discover
// on save that it was frozen.
//
// If the two ever disagree, THE DATABASE IS RIGHT. A unit test asserts they
// match, because a UI that offers an edit the server rejects is worse than one
// that never offered it.
// =============================================================================

import type { ShipmentDocType } from "./types";

/**
 * Top-level payload keys that stay editable once a document is issued.
 * Everything else — weights, prices, parties, goods, container coverage — is
 * frozen, and correcting it means voiding and reissuing.
 *
 * Keyed on document type so a Sales Contract can be stricter than a Packing
 * List later; today every type shares one list.
 *
 * TODO(rodrigo): confirm this list. Shipping the wrong one silently permits
 * edits to documents already sent.
 */
const BASE: readonly string[] = [
  "hblNumber",
  "vesselName",
  "voyageNumber",
  "notifyParty",
  "carrierBookingNumber",
  "marksAndNumbers",
];

/**
 * A TOTAL Record, so adding a document type is a compile error here rather than
 * a type that silently inherits somebody else's rules. Every type shares one
 * list today; splitting them is a one-line change on both sides.
 */
const EDITABLE_AFTER_ISSUE: Record<ShipmentDocType, readonly string[]> = {
  commercial_invoice: BASE,
  packing_list: BASE,
  sales_contract: BASE,
  proforma_invoice: BASE,
  certificate_of_origin: BASE,
  certificate_of_analysis: BASE,
};

export function editableKeysAfterIssue(docType: ShipmentDocType): readonly string[] {
  return EDITABLE_AFTER_ISSUE[docType];
}

/** Is this payload key still editable, given the document's status? */
export function isFieldEditable(key: string, docType: ShipmentDocType, status: string): boolean {
  if (status === "draft") return true;
  if (status !== "issued") return false; // void / superseded are read-only
  return editableKeysAfterIssue(docType).includes(key);
}
