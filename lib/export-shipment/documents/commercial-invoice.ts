// =============================================================================
// Commercial Invoice — the prefill
// =============================================================================
// SHAPES the shared DocumentContext into this document's vocabulary. It derives
// nothing itself: every fact that also appears on the Sales Contract, Packing
// List or Certificate of Origin comes from the context, so the two documents
// cannot state different weights, parties, ports or terms for one booking.
// See ./context.ts for why.
//
// Vocabulary mapping — same fact, different name per document:
//   context.seller → "Beneficiary / Shipper"
//   context.buyer  → "Consignee" (and "Notify Party" by default)
// =============================================================================

import type { DocumentContext } from "./context";
import type { CommercialInvoiceFields } from "./types";

export interface BuildCommercialInvoiceInput {
  context: DocumentContext;
  documentNumber: string;
}

export function buildCommercialInvoiceDraft({
  context,
  documentNumber,
}: BuildCommercialInvoiceInput): CommercialInvoiceFields {
  const { goods, routing, refs, terms, totals } = context;

  return {
    documentNumber,
    invoiceDate: context.today,
    transactionDate: refs.transactionDate,
    shippingDate: routing.etd,
    paymentDue: terms.paymentDue,
    paymentTerms: terms.payment,
    incoterms: routing.incotermsLabel,
    customerReference: refs.customerReference,
    carrierBookingNumber: refs.carrierBookingNumber,
    hblNumber: refs.hblNumber,

    shipper: context.seller,
    consignee: context.buyer,
    // Notify defaults to the consignee — the overwhelmingly common case, and
    // one of the few fields that stays editable after issue.
    notifyParty: context.buyer,

    portOfLoading: routing.portOfLoading,
    portOfDischarge: routing.portOfDischarge,
    carrierName: routing.carrierName,
    vesselName: routing.vesselName,
    voyageNumber: routing.voyageNumber,
    sailingOnOrAbout: routing.etd,

    descriptionOfGoods: goods.description,
    packaging: goods.packaging,
    commodityCode: goods.hsCode,
    countryOfOrigin: goods.countryOfOrigin,
    marksAndNumbers: refs.marksAndNumbers,

    lines: context.lines,
    currency: context.currency,
    fobTotal: totals.fobTotal,
    freightTotal: totals.freightTotal,
    totalValue: totals.totalValue,
  };
}
