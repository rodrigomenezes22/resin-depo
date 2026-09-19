// =============================================================================
// Certificate of Origin — the prefill
// =============================================================================
// SHAPES the shared DocumentContext. See ./context.ts.
//
// This one is a fixed government-style form of numbered boxes rather than a
// flowing document, so the field names keep their box numbers — it is the only
// way to read the mapper against the paper it reproduces.
//
// What it certifies is `countryOfOrigin`: where the RESIN was produced, which
// is `products.country_of_origin` and emphatically not the seller's country.
// The whole document exists to attest that one fact, so it comes from the
// context like everything else and reads identically on the invoice beside it.
// =============================================================================

import type { DocumentContext } from "./context";
import type { CertificateOfOriginFields } from "./types";
import { packageKindLabel } from "@/components/bank/export-shipments/package-kinds";

export interface BuildCertificateOfOriginInput {
  context: DocumentContext;
  documentNumber: string;
  /** The invoice this certificate accompanies, printed in box 20. */
  invoiceReference?: string | null;
}

export function buildCertificateOfOriginDraft({
  context,
  documentNumber,
  invoiceReference = null,
}: BuildCertificateOfOriginInput): CertificateOfOriginFields {
  const { goods, routing, refs, filing, totals } = context;

  const containerType = context.lines.find((l) => l.containerType)?.containerType ?? null;
  const packageKind = context.lines.find((l) => l.packageKind)?.packageKind ?? null;

  return {
    documentNumber,
    issueDate: context.today,

    shipper: context.seller, // box 2
    consignee: context.buyer, // box 3
    notifyParty: context.buyer, // box 4 — defaults to the consignee
    blNumber: refs.hblNumber ?? refs.masterBlNumber, // box 5A
    bookingNumber: refs.carrierBookingNumber,
    exportReferences: null, // box 6 — desk fills when the forwarder supplies one
    forwardingAgent: filing.forwardingAgent, // box 7
    fmcNumber: filing.fmcNumber, // box 7
    countryOfOrigin: goods.countryOfOrigin, // box 8
    // Box 9 carries the consignee's EU registration where there is one.
    routingInstructions: filing.buyerEori ? `EORI ${filing.buyerEori}` : null,
    finalDestination: filing.finalDestination, // box 9A
    loadingTerminal: filing.loadingTerminal, // box 10
    typeOfMove: filing.typeOfMove, // box 11
    placeOfReceipt: filing.placeOfReceipt, // box 13
    vesselVoyage: routing.vesselVoyage, // box 14
    portOfLoading: routing.portOfLoading, // box 15
    portOfDischarge: routing.portOfDischarge, // box 16
    placeOfDelivery: filing.placeOfDelivery, // box 17

    // Box 18 — the shipping marks, with the AES/ITN filing beneath them.
    marksAndNumbers:
      [filing.aesItn ? `AES ${filing.aesItn}` : null, refs.marksAndNumbers]
        .filter(Boolean)
        .join("\n") || null,

    packageCount: totals.packageCount, // box 19
    packageKind: packageKind ? packageKindLabel(packageKind) : null,

    descriptionOfGoods: goods.description, // box 20
    containerSummary: containerType
      ? `${totals.containerCount}X${containerType} CONTAINERS`
      : `${totals.containerCount} CONTAINERS`,
    quantityMt: totals.contractMt,
    commodityCode: goods.hsCode,
    netWeightKg: totals.netWeightKg,
    invoiceReference,

    grossWeightKg: totals.grossWeightKg, // box 21
    measurement: null, // box 22 — CBM, not modelled
  };
}
