// =============================================================================
// Document payload schemas
// =============================================================================
// ONE contract, used three times: it validates the payload on write, validates
// it again on read before rendering, and types the PDF template's props. That
// single shared schema is what makes "the PDF matches the record" enforceable
// rather than hoped-for.
//
// The payload is FROZEN at issue. A document's PDF renders from its payload and
// from nothing else — never from a live join — so that editing an org's address
// next month cannot silently rewrite an invoice a bank is already holding.
//
// Keys are camelCase and TOP-LEVEL keys are the unit of the editable-after-issue
// allowlist (see ./editable.ts and the SQL function it mirrors). That is why
// `notifyParty` is one nested object rather than four flat fields: allowlisting
// the notify party means allowlisting the block.
// =============================================================================

import { z } from "zod";

/** A party block as printed: name, address lines, contact and tax registration. */
export const PartyBlockSchema = z.object({
  name: z.string(),
  address: z.string().nullable(),
  address2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  zip: z.string().nullable(),
  country: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  taxId: z.string().nullable(),
  contactName: z.string().nullable(),
});
export type PartyBlock = z.infer<typeof PartyBlockSchema>;

/**
 * One container's line on the invoice. Weights are stored in the payload in
 * KILOGRAMS — already converted, at full precision — because the document
 * states KG and the payload is the record of what the document said. Rounding
 * happens once, at render.
 */
export const InvoiceLineSchema = z.object({
  containerId: z.string().uuid(),
  position: z.number().int().positive(),
  containerNumber: z.string().nullable(),
  sealNumber: z.string().nullable(),
  containerType: z.string().nullable(),
  /**
   * Deal number and product, so a document's container list reads exactly like
   * the shipment page's manifest. Optional: payloads frozen before these
   * existed must keep parsing, so an old document simply shows "—".
   */
  orderNumber: z.string().nullable().optional(),
  productName: z.string().nullable().optional(),
  netWeightKg: z.number().nonnegative(),
  grossWeightKg: z.number().nonnegative(),
  packageCount: z.number().int().nonnegative().nullable(),
  packageKind: z.string().nullable(),
  palletCount: z.number().int().nonnegative().nullable(),
  /** Contract weight in lbs — what the money is computed from, never the net. */
  contractLbs: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  lineTotal: z.number(),
  freight: z.number(),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const CommercialInvoiceSchema = z.object({
  // --- header / references ------------------------------------------------
  documentNumber: z.string(),
  invoiceDate: z.string(),
  transactionDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  paymentDue: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  incoterms: z.string().nullable(),
  customerReference: z.string().nullable(),
  carrierBookingNumber: z.string().nullable(),
  hblNumber: z.string().nullable(),

  // --- parties -------------------------------------------------------------
  shipper: PartyBlockSchema,
  consignee: PartyBlockSchema,
  notifyParty: PartyBlockSchema,

  // --- routing -------------------------------------------------------------
  portOfLoading: z.string().nullable(),
  portOfDischarge: z.string().nullable(),
  carrierName: z.string().nullable(),
  vesselName: z.string().nullable(),
  voyageNumber: z.string().nullable(),
  sailingOnOrAbout: z.string().nullable(),

  // --- goods ---------------------------------------------------------------
  descriptionOfGoods: z.string(),
  packaging: z.string().nullable(),
  commodityCode: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  marksAndNumbers: z.string().nullable(),

  // --- lines + money -------------------------------------------------------
  lines: z.array(InvoiceLineSchema),
  currency: z.string(),
  fobTotal: z.number(),
  freightTotal: z.number(),
  totalValue: z.number(),
});
export type CommercialInvoiceFields = z.infer<typeof CommercialInvoiceSchema>;

/** The wire block a contract or proforma prints. */
export const BankBlockSchema = z.object({
  beneficiaryName: z.string(),
  bankName: z.string(),
  bankAddress: z.string().nullable(),
  swiftCode: z.string().nullable(),
  accountNumber: z.string().nullable(),
  abaRouting: z.string().nullable(),
  iban: z.string().nullable(),
});

/**
 * One commodity row on a Sales Contract. The contract states quantity in MT and
 * prices per MT, where the invoice states pounds — the same material, in the
 * unit each document is written in. Covered containers are grouped by product
 * and unit price, so a three-container booking of one grade prints one line,
 * exactly as the samples do.
 */
export const ContractLineSchema = z.object({
  description: z.string(),
  grade: z.string().nullable(),
  quantityMt: z.number().nonnegative(),
  unitPricePerMt: z.number().nonnegative(),
  terms: z.string().nullable(),
  amount: z.number(),
  /** Which containers rolled up into this row — the audit trail back. */
  containerIds: z.array(z.string().uuid()),
});
export type ContractLine = z.infer<typeof ContractLineSchema>;

export const SalesContractSchema = z.object({
  documentNumber: z.string(),
  contractDate: z.string(),

  // Parties — a contract names them buyer and seller, not consignee/shipper.
  buyer: PartyBlockSchema,
  seller: PartyBlockSchema,

  lines: z.array(ContractLineSchema),
  currency: z.string(),
  totalQuantityMt: z.number().nonnegative(),
  totalAmount: z.number(),

  packing: z.string().nullable(),
  remarks: z.string().nullable(),

  portOfLoading: z.string().nullable(),
  portOfDischarge: z.string().nullable(),
  insurance: z.string().nullable(),
  shipmentWindow: z.string().nullable(),
  paymentTerms: z.string().nullable(),

  bank: BankBlockSchema.nullable(),
  tolerancePct: z.number().nonnegative(),
});
export type SalesContractFields = z.infer<typeof SalesContractSchema>;

/** One row of the Packing List's container table. */
export const PackingLineSchema = z.object({
  containerId: z.string().uuid(),
  containerNumber: z.string().nullable(),
  sealNumber: z.string().nullable(),
  netWeightKg: z.number().nonnegative(),
  grossWeightKg: z.number().nonnegative(),
  packageCount: z.number().int().nonnegative().nullable(),
  palletCount: z.number().int().nonnegative().nullable(),
  /** Lot numbers inside this box — one box can hold several. */
  lotNumbers: z.array(z.string()),
});
export type PackingLine = z.infer<typeof PackingLineSchema>;

export const PackingListSchema = z.object({
  documentNumber: z.string(),
  invoiceDate: z.string(),
  transactionDate: z.string().nullable(),
  shippingDate: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  incoterms: z.string().nullable(),
  customerReference: z.string().nullable(),
  carrierBookingNumber: z.string().nullable(),

  billTo: PartyBlockSchema,
  // OPTIONAL is load-bearing: stored payloads re-parse against the CURRENT
  // schema at render time (app/api/shipment-documents/[documentId]/pdf,
  // drafts always + issued docs whose stored PDF object went missing), so a
  // required key would 422 every pre-Locations document. Absent → the
  // template falls back to its historical hardcoded letterhead.
  shipper: PartyBlockSchema.optional(),
  destination: z.string().nullable(),
  carrierName: z.string().nullable(),

  descriptionOfGoods: z.string(),
  grade: z.string().nullable(),
  packaging: z.string().nullable(),
  commodityCode: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),

  quantityMt: z.number().nonnegative(),
  totalPackages: z.number().int().nonnegative(),
  totalPallets: z.number().int().nonnegative(),
  containerSummary: z.string().nullable(),
  totalNetWeightKg: z.number().nonnegative(),
  totalGrossWeightKg: z.number().nonnegative(),

  lines: z.array(PackingLineSchema),
  portOfLoading: z.string().nullable(),
  portOfDischarge: z.string().nullable(),
  atd: z.string().nullable(),
  eta: z.string().nullable(),
});
export type PackingListFields = z.infer<typeof PackingListSchema>;

export const ProformaInvoiceSchema = z.object({
  documentNumber: z.string(),
  invoiceDate: z.string(),
  transactionDate: z.string().nullable(),
  latestSailingDate: z.string().nullable(),
  paymentTerms: z.string().nullable(),
  customerReference: z.string().nullable(),
  incoterms: z.string().nullable(),

  soldTo: PartyBlockSchema,
  // Optional for the same backward-parse reason as PackingListSchema.shipper.
  seller: PartyBlockSchema.optional(),
  deliveredTo: z.string().nullable(),

  descriptionOfGoods: z.string(),
  grade: z.string().nullable(),
  quantityMt: z.number().nonnegative(),
  unitPricePerMt: z.number().nonnegative(),
  currency: z.string(),
  totalValue: z.number(),

  packing: z.string().nullable(),
  totalNetWeightKg: z.number().nonnegative(),
  containerSummary: z.string().nullable(),
  carrierName: z.string().nullable(),
  vesselVoyage: z.string().nullable(),
  freightTerms: z.string().nullable(),
  dthcTerms: z.string().nullable(),
  tolerancePct: z.number().nonnegative(),

  bank: BankBlockSchema.nullable(),
  shippingVia: z.string().nullable(),
  blDate: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  signatory: z.string().nullable(),
});
export type ProformaInvoiceFields = z.infer<typeof ProformaInvoiceSchema>;

/**
 * Certificate of Origin. Its fields are numbered BOXES on a fixed government-
 * style form, so the schema keeps the box numbers in the key names — it is the
 * only way to read the template against the paper it reproduces.
 */
export const CertificateOfOriginSchema = z.object({
  documentNumber: z.string(),
  issueDate: z.string(),

  shipper: PartyBlockSchema, // box 2
  consignee: PartyBlockSchema, // box 3
  notifyParty: PartyBlockSchema, // box 4
  blNumber: z.string().nullable(), // box 5A
  bookingNumber: z.string().nullable(),
  exportReferences: z.string().nullable(), // box 6
  forwardingAgent: z.string().nullable(), // box 7
  fmcNumber: z.string().nullable(), // box 7
  countryOfOrigin: z.string().nullable(), // box 8
  routingInstructions: z.string().nullable(), // box 9 — EORI
  finalDestination: z.string().nullable(), // box 9A
  loadingTerminal: z.string().nullable(), // box 10
  typeOfMove: z.string().nullable(), // box 11
  placeOfReceipt: z.string().nullable(), // box 13
  vesselVoyage: z.string().nullable(), // box 14
  portOfLoading: z.string().nullable(), // box 15
  portOfDischarge: z.string().nullable(), // box 16
  placeOfDelivery: z.string().nullable(), // box 17
  marksAndNumbers: z.string().nullable(), // box 18
  packageCount: z.number().int().nonnegative(), // box 19
  packageKind: z.string().nullable(),
  descriptionOfGoods: z.string(), // box 20
  containerSummary: z.string().nullable(),
  quantityMt: z.number().nonnegative(),
  commodityCode: z.string().nullable(),
  netWeightKg: z.number().nonnegative(),
  invoiceReference: z.string().nullable(),
  grossWeightKg: z.number().nonnegative(), // box 21
  measurement: z.string().nullable(), // box 22
});
export type CertificateOfOriginFields = z.infer<typeof CertificateOfOriginSchema>;

/** Document types, mirroring the `shipment_doc_type` enum. */
/**
 * Order matters: this is the order the Export buttons appear in on the
 * shipment's Documents card, and it follows the desk's paperwork sequence —
 * contract first, invoice last.
 */
export const DOC_TYPES = [
  "sales_contract",
  "proforma_invoice",
  "packing_list",
  "certificate_of_origin",
  "certificate_of_analysis",
  "commercial_invoice",
] as const;
export type ShipmentDocType = (typeof DOC_TYPES)[number];

/** Labels + the code that goes into the document number (SHP-01041-**CI**-1). */
export const DOC_TYPE_META: Record<ShipmentDocType, { label: string; code: string }> = {
  sales_contract: { label: "Sales Contract", code: "SC" },
  proforma_invoice: { label: "Proforma Invoice", code: "PI" },
  packing_list: { label: "Packing List", code: "PL" },
  certificate_of_origin: { label: "Certificate of Origin", code: "COO" },
  certificate_of_analysis: { label: "Certificate of Analysis", code: "COA" },
  commercial_invoice: { label: "Commercial Invoice", code: "CI" },
};

/**
 * The document types that are actually built. ONE list, read by the card (to
 * decide which Export buttons light up), by `documentDraft` (to refuse the
 * rest with a readable message) and by the PDF route — so the button can never
 * offer something the server will not produce.
 */
/**
 * The subset the `doc_type` column accepts. A placeholder type exists so its
 * button can render, but it must never reach the database, `documentDraft` or
 * the PDF route — narrowing to this at every persistence boundary is what makes
 * that a compile error instead of a runtime one.
 */
export type PersistedDocType = Exclude<ShipmentDocType, "certificate_of_analysis">;

export const isPersistedDocType = (t: ShipmentDocType): t is PersistedDocType =>
  t !== "certificate_of_analysis";

export const BUILT_DOC_TYPES: readonly PersistedDocType[] = [
  "sales_contract",
  "proforma_invoice",
  "packing_list",
  "certificate_of_origin",
  "commercial_invoice",
];
/** Narrows to a type the server will actually produce. */
export const isBuiltDocType = (t: ShipmentDocType): t is PersistedDocType =>
  (BUILT_DOC_TYPES as readonly ShipmentDocType[]).includes(t);

// `certificate_of_analysis` is deliberately absent: the button renders
// DISABLED ("Not built yet") until there is a document sample to build from.
// Leaving it out of this list is what keeps the placeholder from reaching
// `documentDraft`, the PDF route, or the `doc_type` column.

export const DOC_STATUSES = ["draft", "issued", "superseded", "void"] as const;
export type ShipmentDocStatus = (typeof DOC_STATUSES)[number];

/**
 * Per-type payload schema. Stages 2-3 fill in the rest; until then those types
 * validate loosely rather than pretending to a shape nobody has written.
 */
export function payloadSchemaFor(docType: ShipmentDocType): z.ZodType<unknown> {
  switch (docType) {
    // No sample document yet, so no shape to validate against.
    case "certificate_of_analysis":
      return z.unknown();
    case "commercial_invoice":
      return CommercialInvoiceSchema;
    case "packing_list":
      return PackingListSchema;
    case "sales_contract":
      return SalesContractSchema;
    case "proforma_invoice":
      return ProformaInvoiceSchema;
    case "certificate_of_origin":
      return CertificateOfOriginSchema;
  }
}
