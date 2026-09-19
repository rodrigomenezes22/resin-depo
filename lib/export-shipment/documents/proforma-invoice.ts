// =============================================================================
// Proforma Invoice — the prefill
// =============================================================================
// SHAPES the shared DocumentContext. See ./context.ts.
//
// Vocabulary mapping — same fact, different name per document:
//   context.buyer → "Sold To"   (the CI calls it Consignee)
//
// A proforma is the quote a buyer takes to their bank to open credit, so it is
// priced like a CONTRACT (metric tonnes, price per tonne) but formatted like an
// INVOICE. Both unit systems come from the same context figures through the
// same factor, so its total agrees with the Commercial Invoice raised later.
// =============================================================================

import type { DocumentContext } from "./context";
import type { ProformaInvoiceFields } from "./types";
import { pricePerLbToPerMetricTon } from "@/lib/units";

export interface BuildProformaInvoiceInput {
  context: DocumentContext;
  documentNumber: string;
}

export function buildProformaInvoiceDraft({
  context,
  documentNumber,
}: BuildProformaInvoiceInput): ProformaInvoiceFields {
  const { goods, routing, refs, terms, filing, totals } = context;

  // Weighted average price per pound across the covered containers, so a mixed
  // booking still states one figure that reconciles with the total.
  const pricePerLb = totals.contractLbs
    ? totals.fobTotal / totals.contractLbs
    : (context.lines[0]?.unitPrice ?? 0);

  const containerType = context.lines.find((l) => l.containerType)?.containerType ?? null;

  return {
    documentNumber,
    invoiceDate: context.today,
    transactionDate: refs.transactionDate,
    latestSailingDate: routing.etd,
    paymentTerms: terms.payment,
    customerReference: refs.customerReference,
    incoterms: routing.incotermsLabel,

    soldTo: context.buyer,
    // The letterhead — TPE as seller, resolved from the exchange org's
    // headquarters address (Locations push); replaces the hardcoded block.
    seller: context.seller,
    deliveredTo: routing.portOfDischarge,

    descriptionOfGoods: goods.description,
    grade: goods.grade,
    quantityMt: totals.contractMt,
    unitPricePerMt: pricePerLbToPerMetricTon(pricePerLb),
    currency: context.currency,
    totalValue: totals.fobTotal,

    packing: goods.packagingStatement,
    totalNetWeightKg: totals.netWeightKg,
    containerSummary: containerType
      ? `${totals.containerCount} x ${containerType}`
      : `${totals.containerCount}`,
    carrierName: routing.carrierName,
    vesselVoyage: routing.vesselVoyage,
    freightTerms: filing.freightTerms,
    dthcTerms: filing.dthcTerms,
    tolerancePct: terms.tolerancePct ?? 5,

    bank: context.bank,
    shippingVia: "VESSEL",
    blDate: routing.etd,
    countryOfOrigin: goods.countryOfOrigin,
    signatory: context.seller.contactName,
  };
}
