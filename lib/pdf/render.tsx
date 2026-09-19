// =============================================================================
// renderShipmentDocument — doc_type → the ONE template that may render it
// =============================================================================
// This dispatch used to live inline in the PDF route as a ternary chain whose
// final `else` rendered `CommercialInvoicePdf`. That made "I forgot a branch"
// indistinguishable from "this really is a commercial invoice": a new doc_type
// would render, upload, and be served as a Commercial Invoice — with a real
// document number on it, to a bank. Wrong document beats no document only in
// the sense that nobody notices.
//
// `match().exhaustive()` removes the fallback entirely: a missing branch is a
// TYPE error at build time, and an impossible value throws instead of
// impersonating an invoice. Keep it that way — do not add a `.otherwise()`.
// =============================================================================

import { match } from "ts-pattern";

import { CertificateOfOriginPdf } from "@/lib/pdf/templates/certificate-of-origin";
import { CommercialInvoicePdf } from "@/lib/pdf/templates/commercial-invoice";
import { PackingListPdf } from "@/lib/pdf/templates/packing-list";
import { ProformaInvoicePdf } from "@/lib/pdf/templates/proforma-invoice";
import { SalesContractPdf } from "@/lib/pdf/templates/sales-contract";
import type {
  CertificateOfOriginFields,
  CommercialInvoiceFields,
  PackingListFields,
  ProformaInvoiceFields,
  SalesContractFields,
  PersistedDocType,
  ShipmentDocStatus,
} from "@/lib/export-shipment/documents/types";

/** Chrome every template draws the same way (issued/void banner + reason). */
export interface DocumentChrome {
  status: ShipmentDocStatus;
  voidReason: string | null;
}

/**
 * Pick the template for a doc_type and build its element.
 *
 * `fields` is the payload AFTER `payloadSchemaFor(docType)` has parsed it —
 * the cast per branch is safe precisely because the caller validated with the
 * schema that types the same template. Rendering an unparsed payload is the
 * one way to get this wrong; see the route for the ordering.
 */
export function renderShipmentDocument(
  docType: PersistedDocType,
  fields: unknown,
  chrome: DocumentChrome,
) {
  return match(docType)
    .with("commercial_invoice", () => (
      <CommercialInvoicePdf fields={fields as CommercialInvoiceFields} {...chrome} />
    ))
    .with("packing_list", () => <PackingListPdf fields={fields as PackingListFields} {...chrome} />)
    .with("sales_contract", () => (
      <SalesContractPdf fields={fields as SalesContractFields} {...chrome} />
    ))
    .with("proforma_invoice", () => (
      <ProformaInvoicePdf fields={fields as ProformaInvoiceFields} {...chrome} />
    ))
    .with("certificate_of_origin", () => (
      <CertificateOfOriginPdf fields={fields as CertificateOfOriginFields} {...chrome} />
    ))
    .exhaustive();
}
