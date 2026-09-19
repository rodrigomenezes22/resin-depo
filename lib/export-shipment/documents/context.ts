// =============================================================================
// Document context — every repeated fact, derived exactly once
// =============================================================================
// THE RULE THIS FILE EXISTS FOR: anything that appears on more than one export
// document is computed HERE and nowhere else.
//
// The Commercial Invoice, Packing List, Sales Contract, Proforma Invoice and
// Certificate of Origin restate the same handful of facts — who the parties
// are, what the goods are, how much material, which vessel, which ports, what
// terms, which bank. If each document derived those independently, they would
// drift: one rounds a weight differently, another falls back to
// `product_text` where its neighbour used `products.name`, a third joins the
// incoterm to the port with a comma instead of a space. A customs officer
// comparing two documents from the same booking finds it immediately.
//
// So each document mapper takes a DocumentContext and SHAPES it — picking
// fields, renaming them into that document's vocabulary, aggregating lines.
// None of them recompute. `tests/unit/document-consistency.spec.ts` asserts the
// shared facts come out identical across documents built from one shipment.
//
// The context is pure: it takes rows and `today`, never a clock or a database.
// =============================================================================

import { orgToPartyBlock, nameOnlyPartyBlock, type PartyOrg } from "./parties";
import { sumInvoiceLines, type InvoiceTotals } from "./totals";
import type { InvoiceLine, PartyBlock } from "./types";
import { formatShipmentNumber } from "@/components/bank/export-shipments/group-status";
import { formatPackages, packageKindLabel } from "@/components/bank/export-shipments/package-kinds";
import {
  dealOrderNumber,
  formatOrderNumber,
  lbsToKilograms,
  lbsToMetricTons,
  type OrderUnit,
} from "@/lib/units";

// ---------------------------------------------------------------------------
// Input rows — a subset of `exportShipments.detail` plus the reference lookups
// ---------------------------------------------------------------------------

export interface ContextContainer {
  id: string;
  position: number;
  container_number: string | null;
  seal_number: string | null;
  container_type: string | null;
  package_count: number | null;
  package_kind: string | null;
  pallet_count: number | null;
  net_weight_lbs: number | string | null;
  gross_weight_lbs: number | string | null;
  marks_and_numbers: string | null;
  /** Lots physically inside this box — the Packing List prints a line each. */
  lots?: { lot_number_text: string | null; qty_lbs: number | string | null; position: number }[];
  /** Resolved parent deal number, when this container's deal is a leg. */
  parent_display_number?: number | null;
  matched_orders: {
    id: string;
    display_number: number;
    qty: number | string;
    unit: string;
    leg_index?: number | null;
    quantity_lbs: number | string;
    tpe_sell_price: number | string;
    freight: number | string;
    buyer_terms: string | null;
    buyer_po: string | null;
    buyer_company_text: string | null;
    shipping_terms: string | null;
    tolerance_pct: number | string | null;
    insurance_terms: string | null;
    shipment_window: string | null;
    product_text: string | null;
    quality: string;
    created_at: string;
    products: { name: string } | null;
  } | null;
}

export interface ContextGroup {
  display_number: number;
  incoterm: string;
  currency: string;
  vessel_name: string | null;
  voyage_number: string | null;
  master_bl_number: string | null;
  booking_number: string | null;
  hbl_number: string | null;
  etd: string | null;
  eta: string | null;
  place_of_receipt: string | null;
  place_of_delivery: string | null;
  carrier: { name: string } | null;
  pol: { name: string; country: string | null } | null;
  pod: { name: string; country: string | null } | null;
  // Export-filing facts — the Certificate of Origin's numbered boxes and the
  // Proforma's freight terms. Optional so older callers keep compiling.
  aes_itn?: string | null;
  forwarding_agent?: string | null;
  fmc_number?: string | null;
  loading_terminal?: string | null;
  type_of_move?: string | null;
  final_destination?: string | null;
  freight_terms?: string | null;
  dthc_terms?: string | null;
}

export interface ContextBankAccount {
  beneficiary_name: string;
  bank_name: string;
  bank_address: string | null;
  swift_code: string | null;
  account_number: string | null;
  aba_routing: string | null;
  iban: string | null;
  currency: string;
}

export interface BuildContextInput {
  group: ContextGroup;
  /** The containers this document covers, in manifest order. */
  containers: ContextContainer[];
  exchangeOrg: PartyOrg | null;
  buyerOrg: (PartyOrg & { payment_terms_days: number | null }) | null;
  product: { name: string; hs_code: string | null; country_of_origin: string | null } | null;
  bankAccount: ContextBankAccount | null;
  /** Injected, so the context is pure and testable. */
  today: string;
}

// ---------------------------------------------------------------------------
// The context
// ---------------------------------------------------------------------------

export interface GoodsBlock {
  /** The ONE description string every document prints. */
  description: string;
  productName: string | null;
  quality: string | null;
  /** Producer grade ("LDPE EX0222A"). No column yet — the desk types it. */
  grade: string | null;
  hsCode: string | null;
  countryOfOrigin: string | null;
  /** The packing kind alone, e.g. "Supersacks". */
  packaging: string | null;
  /** The full packing statement, e.g. "62 Supersacks palletized in 40'HC". */
  packagingStatement: string | null;
}

export interface RoutingBlock {
  portOfLoading: string | null;
  portOfDischarge: string | null;
  carrierName: string | null;
  vesselName: string | null;
  voyageNumber: string | null;
  /** "MV NORTHERN JADE / V.214E" — one string, so nobody joins it two ways. */
  vesselVoyage: string | null;
  etd: string | null;
  eta: string | null;
  incoterm: string;
  /** "CFR Port of Shanghai" — the incoterm as documents state it. */
  incotermsLabel: string;
}

export interface ReferenceBlock {
  /** "SHP-01041" */
  shipmentNumber: string;
  /** The covered transactions' legacy order numbers, e.g. ["05012-CN1", …]. */
  orderNumbers: string[];
  customerReference: string | null;
  carrierBookingNumber: string | null;
  hblNumber: string | null;
  masterBlNumber: string | null;
  /** Shipping marks — printed on the Commercial Invoice and the COO's box 18. */
  marksAndNumbers: string | null;
  /** Earliest covered transaction date, YYYY-MM-DD. */
  transactionDate: string | null;
}

export interface TermsBlock {
  payment: string | null;
  paymentDue: string | null;
  shipping: string | null;
  tolerancePct: number | null;
  insurance: string | null;
  shipmentWindow: string | null;
}

export interface BankBlock {
  beneficiaryName: string;
  bankName: string;
  bankAddress: string | null;
  swiftCode: string | null;
  accountNumber: string | null;
  abaRouting: string | null;
  iban: string | null;
}

/**
 * The export filing — the Certificate of Origin's numbered boxes, and the
 * freight terms a Proforma states. Shipment-wide, so every document that
 * mentions any of it reads the same value.
 */
export interface FilingBlock {
  aesItn: string | null;
  forwardingAgent: string | null;
  fmcNumber: string | null;
  loadingTerminal: string | null;
  typeOfMove: string | null;
  finalDestination: string | null;
  placeOfReceipt: string | null;
  placeOfDelivery: string | null;
  freightTerms: string | null;
  dthcTerms: string | null;
  /** The consignee's EU registration, printed in the COO's routing box. */
  buyerEori: string | null;
}

/** One lot inside one container, as the Packing List lists them. */
export interface ContextLot {
  containerId: string;
  containerNumber: string | null;
  lotNumber: string;
  qtyLbs: number | null;
}

export interface DocumentContext {
  currency: string;
  /** TPE — the seller on a contract, the shipper/beneficiary on an invoice. */
  seller: PartyBlock;
  /** The counterparty — the buyer on a contract, the consignee on an invoice. */
  buyer: PartyBlock;
  goods: GoodsBlock;
  routing: RoutingBlock;
  refs: ReferenceBlock;
  terms: TermsBlock;
  filing: FilingBlock;
  bank: BankBlock | null;
  /** One per covered container, manifest order. Weights already in kg. */
  lines: InvoiceLine[];
  /** Flattened lots across the covered containers, in manifest then lot order. */
  lots: ContextLot[];
  totals: InvoiceTotals & { contractMt: number };
  today: string;
}

// ---------------------------------------------------------------------------
// Helpers — shared so two documents cannot pick different fallbacks
// ---------------------------------------------------------------------------

const num = (v: number | string | null | undefined): number => Number(v ?? 0);

/** First non-empty value across the covered containers. */
function firstOf<T>(
  containers: ContextContainer[],
  pick: (c: ContextContainer) => T | null,
): T | null {
  for (const c of containers) {
    const v = pick(c);
    if (v != null && v !== "") return v;
  }
  return null;
}

/** Port as printed: "Port of Houston, United States". */
function portLabel(
  port: { name: string; country: string | null } | null,
  fallback: string | null,
): string | null {
  if (!port) return fallback;
  return port.country ? `${port.name}, ${port.country}` : port.name;
}

/**
 * Payment due from the terms text. Deliberately shallow: it recognises
 * "Net 30"-style terms and otherwise says nothing rather than inventing a date.
 */
function derivePaymentDue(terms: string | null, etd: string | null): string | null {
  if (!terms || !etd) return null;
  const m = /net\s+(\d+)/i.exec(terms);
  if (!m) return null;
  const due = new Date(`${etd}T00:00:00Z`);
  if (Number.isNaN(due.getTime())) return null;
  due.setUTCDate(due.getUTCDate() + Number(m[1]));
  return due.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// buildDocumentContext
// ---------------------------------------------------------------------------

export function buildDocumentContext(input: BuildContextInput): DocumentContext {
  const { group, containers, exchangeOrg, buyerOrg, product, bankAccount, today } = input;

  // --- lines ---------------------------------------------------------------
  // Money comes from the CONTRACT weight (matched_orders.quantity_lbs); the net
  // weight documents the box and reaches the weight columns only. Keeping both
  // here is what stops one document pricing on the wrong one.
  const lines: InvoiceLine[] = containers.map((c) => {
    const mo = c.matched_orders;
    const contractLbs = num(mo?.quantity_lbs);
    const sellPrice = num(mo?.tpe_sell_price);

    // An unweighed box falls back to its contract weight — the same assumption
    // the container drawer makes when it preloads the net weight.
    const netLbs = c.net_weight_lbs == null ? contractLbs : num(c.net_weight_lbs);
    const grossLbs = c.gross_weight_lbs == null ? netLbs : num(c.gross_weight_lbs);

    return {
      containerId: c.id,
      position: c.position,
      containerNumber: c.container_number,
      sealNumber: c.seal_number,
      containerType: c.container_type,
      // Same string the manifest prints, conversion legs included, so the two
      // container tables never disagree about what a box is called.
      orderNumber: mo
        ? dealOrderNumber({
            display_number: mo.display_number,
            unit: mo.unit as OrderUnit,
            qty: num(mo.qty),
            parent_display_number: c.parent_display_number ?? null,
            leg_index: mo.leg_index ?? null,
          })
        : null,
      productName: mo?.products?.name ?? mo?.product_text ?? null,
      netWeightKg: lbsToKilograms(netLbs),
      grossWeightKg: lbsToKilograms(grossLbs),
      packageCount: c.package_count,
      packageKind: c.package_kind,
      palletCount: c.pallet_count,
      contractLbs,
      unitPrice: sellPrice,
      lineTotal: sellPrice * contractLbs,
      freight: num(mo?.freight),
    };
  });

  const summed = sumInvoiceLines(lines);
  const totals = { ...summed, contractMt: lbsToMetricTons(summed.contractLbs) };

  // --- parties -------------------------------------------------------------
  const seller: PartyBlock = exchangeOrg
    ? orgToPartyBlock(exchangeOrg)
    : nameOnlyPartyBlock("The Plastics Exchange, LLC");

  // No buyer org means the deal carries only the counterparty's NAME. Print it
  // and leave the rest for the desk — a blocked export helps nobody.
  const buyer: PartyBlock = buyerOrg
    ? orgToPartyBlock(buyerOrg)
    : nameOnlyPartyBlock(
        firstOf(containers, (c) => c.matched_orders?.buyer_company_text ?? null) ?? "—",
      );

  // --- goods ---------------------------------------------------------------
  const productName =
    product?.name ?? firstOf(containers, (c) => c.matched_orders?.product_text ?? null);
  const quality = firstOf(containers, (c) => c.matched_orders?.quality ?? null);
  const packagingKind = firstOf(containers, (c) => c.package_kind);
  const containerType = firstOf(containers, (c) => c.container_type);

  const packagingStatement = (() => {
    const packed = formatPackages(totals.packageCount || null, packagingKind);
    if (!packed) return packagingKind ? packageKindLabel(packagingKind) : null;
    return containerType ? `${packed} in ${containerType}` : packed;
  })();

  const goods: GoodsBlock = {
    description: [productName, quality].filter(Boolean).join(" — ") || "—",
    productName,
    quality,
    grade: null,
    hsCode: product?.hs_code ?? null,
    countryOfOrigin: product?.country_of_origin ?? "UNITED STATES",
    packaging: packagingKind ? packageKindLabel(packagingKind) : null,
    packagingStatement,
  };

  // --- routing -------------------------------------------------------------
  const podName = group.pod?.name ?? null;
  const routing: RoutingBlock = {
    portOfLoading: portLabel(group.pol, group.place_of_receipt),
    portOfDischarge: portLabel(group.pod, group.place_of_delivery),
    carrierName: group.carrier?.name ?? null,
    vesselName: group.vessel_name,
    voyageNumber: group.voyage_number,
    vesselVoyage: [group.vessel_name, group.voyage_number].filter(Boolean).join(" / ") || null,
    etd: group.etd,
    eta: group.eta,
    incoterm: group.incoterm,
    incotermsLabel: [group.incoterm, podName].filter(Boolean).join(" "),
  };

  // --- references ----------------------------------------------------------
  const refs: ReferenceBlock = {
    shipmentNumber: formatShipmentNumber(group.display_number),
    orderNumbers: containers
      .map((c) =>
        c.matched_orders
          ? formatOrderNumber(
              c.matched_orders.display_number,
              c.matched_orders.unit,
              c.matched_orders.qty,
            )
          : null,
      )
      .filter((n): n is string => Boolean(n)),
    customerReference: firstOf(containers, (c) => c.matched_orders?.buyer_po ?? null),
    carrierBookingNumber: group.booking_number,
    hblNumber: group.hbl_number,
    masterBlNumber: group.master_bl_number,
    marksAndNumbers: firstOf(containers, (c) => c.marks_and_numbers),
    transactionDate:
      containers
        .map((c) => c.matched_orders?.created_at)
        .filter((d): d is string => Boolean(d))
        .sort()[0]
        ?.slice(0, 10) ?? null,
  };

  // --- terms ---------------------------------------------------------------
  const payment =
    firstOf(containers, (c) => c.matched_orders?.buyer_terms ?? null) ??
    (buyerOrg?.payment_terms_days != null ? `Net ${buyerOrg.payment_terms_days} days` : null);

  const tolerance = firstOf(containers, (c) =>
    c.matched_orders?.tolerance_pct == null ? null : Number(c.matched_orders.tolerance_pct),
  );

  const terms: TermsBlock = {
    payment,
    paymentDue: derivePaymentDue(payment, group.etd),
    shipping: firstOf(containers, (c) => c.matched_orders?.shipping_terms ?? null),
    tolerancePct: tolerance,
    insurance: firstOf(containers, (c) => c.matched_orders?.insurance_terms ?? null),
    shipmentWindow: firstOf(containers, (c) => c.matched_orders?.shipment_window ?? null),
  };

  // --- bank ----------------------------------------------------------------
  const bank: BankBlock | null = bankAccount
    ? {
        beneficiaryName: bankAccount.beneficiary_name,
        bankName: bankAccount.bank_name,
        bankAddress: bankAccount.bank_address,
        swiftCode: bankAccount.swift_code,
        accountNumber: bankAccount.account_number,
        abaRouting: bankAccount.aba_routing,
        iban: bankAccount.iban,
      }
    : null;

  // --- filing ---------------------------------------------------------------
  const filing: FilingBlock = {
    aesItn: group.aes_itn ?? null,
    forwardingAgent: group.forwarding_agent ?? null,
    fmcNumber: group.fmc_number ?? null,
    loadingTerminal: group.loading_terminal ?? null,
    typeOfMove: group.type_of_move ?? null,
    finalDestination: group.final_destination ?? null,
    placeOfReceipt: group.place_of_receipt,
    placeOfDelivery: group.place_of_delivery,
    freightTerms: group.freight_terms ?? null,
    dthcTerms: group.dthc_terms ?? null,
    buyerEori: buyerOrg?.eori ?? null,
  };

  // --- lots -----------------------------------------------------------------
  // Flattened across the covered boxes: a container stuffed from two lots
  // contributes two rows, which is what the Packing List prints.
  const lots: ContextLot[] = containers.flatMap((c) =>
    [...(c.lots ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((l) => ({
        containerId: c.id,
        containerNumber: c.container_number,
        lotNumber: l.lot_number_text ?? "",
        qtyLbs: l.qty_lbs == null ? null : Number(l.qty_lbs),
      }))
      .filter((l) => l.lotNumber !== ""),
  );

  return {
    currency: group.currency,
    seller,
    buyer,
    goods,
    routing,
    refs,
    terms,
    filing,
    bank,
    lines,
    lots,
    totals,
    today,
  };
}
