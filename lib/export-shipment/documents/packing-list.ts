// =============================================================================
// Packing List — the prefill
// =============================================================================
// SHAPES the shared DocumentContext. See ./context.ts.
//
// Vocabulary mapping — same fact, different name per document:
//   context.buyer   → "Bill to"      (the CI calls it Consignee)
//   context.routing → POL / POD / ATD / ETA
//
// A Packing List states no money at all: it is the document a customs officer
// and a warehouse read to check that what is in the box matches what was
// declared. So it carries the weights and counts and nothing else — and those
// weights are the SAME numbers the Commercial Invoice prints, because both come
// from the context.
// =============================================================================

import type { DocumentContext } from "./context";
import type { PackingLine, PackingListFields } from "./types";

export interface BuildPackingListInput {
  context: DocumentContext;
  documentNumber: string;
}

export function buildPackingListDraft({
  context,
  documentNumber,
}: BuildPackingListInput): PackingListFields {
  const { goods, routing, refs, terms, totals } = context;

  const lines: PackingLine[] = context.lines.map((l) => ({
    containerId: l.containerId,
    containerNumber: l.containerNumber,
    sealNumber: l.sealNumber,
    netWeightKg: l.netWeightKg,
    grossWeightKg: l.grossWeightKg,
    packageCount: l.packageCount,
    palletCount: l.palletCount,
    // A box stuffed from two lots prints two lot numbers.
    lotNumbers: context.lots.filter((x) => x.containerId === l.containerId).map((x) => x.lotNumber),
  }));

  // "3 X 40'HC CONTAINERS" — the count and ISO size as the samples state it.
  const containerType = context.lines.find((l) => l.containerType)?.containerType ?? null;
  const containerSummary = containerType
    ? `${totals.containerCount} X ${containerType} CONTAINERS`
    : `${totals.containerCount} CONTAINER${totals.containerCount === 1 ? "" : "S"}`;

  return {
    documentNumber,
    invoiceDate: context.today,
    transactionDate: refs.transactionDate,
    shippingDate: routing.etd,
    paymentTerms: terms.payment,
    incoterms: routing.incotermsLabel,
    customerReference: refs.customerReference,
    carrierBookingNumber: refs.carrierBookingNumber,

    billTo: context.buyer,
    // The letterhead — TPE as shipper, resolved from the exchange org's
    // headquarters address (Locations push); replaces the hardcoded block.
    shipper: context.seller,
    destination: routing.portOfDischarge,
    carrierName: routing.carrierName,

    descriptionOfGoods: goods.description,
    grade: goods.grade,
    packaging: goods.packagingStatement,
    commodityCode: goods.hsCode,
    countryOfOrigin: goods.countryOfOrigin,

    quantityMt: totals.contractMt,
    totalPackages: totals.packageCount,
    totalPallets: totals.palletCount,
    containerSummary,
    totalNetWeightKg: totals.netWeightKg,
    totalGrossWeightKg: totals.grossWeightKg,

    lines,
    portOfLoading: routing.portOfLoading,
    portOfDischarge: routing.portOfDischarge,
    atd: routing.etd,
    eta: routing.eta,
  };
}
