// =============================================================================
// Sales Contract — the prefill
// =============================================================================
// SHAPES the shared DocumentContext, exactly like the Commercial Invoice does,
// so the two documents cannot disagree about one booking. See ./context.ts.
//
// Vocabulary mapping — same fact, different name per document:
//   context.seller → "The SELLER"    (the CI calls it Beneficiary / Shipper)
//   context.buyer  → "The BUYER"     (the CI calls it Consignee)
//
// The one genuine difference is UNITS. A contract is written in metric tonnes
// at a price per tonne; the invoice is written in pounds at a price per pound.
// Both are the same money on the same material — the conversion happens here,
// once, from the context's contract weight, so the totals reconcile exactly.
// =============================================================================

import { DEFAULT_CONTRACT_REMARKS } from "./boilerplate";
import type { DocumentContext } from "./context";
import type { ContractLine, SalesContractFields } from "./types";
import { lbsToMetricTons, pricePerLbToPerMetricTon } from "@/lib/units";

export interface BuildSalesContractInput {
  context: DocumentContext;
  documentNumber: string;
}

export function buildSalesContractDraft({
  context,
  documentNumber,
}: BuildSalesContractInput): SalesContractFields {
  const { goods, routing, terms, totals } = context;

  // Group the covered containers into commodity rows. The samples print ONE
  // line for a multi-container contract (81.00 MT of one grade), so rows are
  // keyed by what actually distinguishes them commercially: the goods and the
  // price. Two grades, or one grade sold at two prices, print two rows.
  const groups = new Map<string, ContractLine>();

  for (const line of context.lines) {
    // Price per pound → price per tonne, from the number the invoice prices on.
    const pricePerMt = pricePerLbToPerMetricTon(line.unitPrice);
    const key = `${goods.description}::${pricePerMt.toFixed(6)}`;

    const existing = groups.get(key);
    if (existing) {
      existing.quantityMt += lbsToMetricTons(line.contractLbs);
      existing.amount += line.lineTotal;
      existing.containerIds.push(line.containerId);
      continue;
    }

    groups.set(key, {
      description: goods.description,
      grade: goods.grade,
      quantityMt: lbsToMetricTons(line.contractLbs),
      unitPricePerMt: pricePerMt,
      terms: routing.incotermsLabel || null,
      amount: line.lineTotal,
      containerIds: [line.containerId],
    });
  }

  const lines = [...groups.values()];

  return {
    documentNumber,
    contractDate: context.today,

    buyer: context.buyer,
    seller: context.seller,

    lines,
    currency: context.currency,
    // Totalled from the context, not from the rows above — full precision, and
    // it therefore matches the invoice's total for the same containers.
    totalQuantityMt: totals.contractMt,
    totalAmount: totals.fobTotal,

    packing: goods.packagingStatement,
    remarks: DEFAULT_CONTRACT_REMARKS,

    portOfLoading: routing.portOfLoading,
    portOfDischarge: routing.portOfDischarge,
    insurance: terms.insurance,
    shipmentWindow: terms.shipmentWindow,
    paymentTerms: terms.payment,

    bank: context.bank,
    tolerancePct: terms.tolerancePct ?? 5,
  };
}
