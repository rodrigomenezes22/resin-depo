// =============================================================================
// Document totals — and the rounding rule that keeps them honest
// =============================================================================
// THE RULE: convert and sum at full precision, round ONCE at render.
//
// Rounding each container's kilograms and then adding them up makes the
// Commercial Invoice's total disagree with the sum of the Packing List's rows —
// three containers rounded to 2dp can drift from their own total by more than a
// cent's worth of resin, and a customs officer adding the column by hand will
// find it. That class of error is precisely what generating both documents from
// one dataset is supposed to eliminate, so it must not be reintroduced by
// arithmetic.
//
// Everything here therefore returns FULL-PRECISION numbers. `roundKg`, `roundMt`
// and `roundMoney` exist for the template to call at the last moment.
// =============================================================================

import type { InvoiceLine } from "./types";

/** Weights: 2dp is what a B/L states in KG. */
export const roundKg = (n: number): number => Math.round(n * 100) / 100;

/** Quantities: 3dp is what a B/L states in MT. */
export const roundMt = (n: number): number => Math.round(n * 1000) / 1000;

/** Money: cents. */
export const roundMoney = (n: number): number => Math.round(n * 100) / 100;

export interface InvoiceTotals {
  netWeightKg: number;
  grossWeightKg: number;
  contractLbs: number;
  packageCount: number;
  palletCount: number;
  containerCount: number;
  fobTotal: number;
  freightTotal: number;
  totalValue: number;
}

/**
 * Aggregate the covered lines. Full precision throughout — callers round for
 * display, never before summing.
 */
export function sumInvoiceLines(lines: readonly InvoiceLine[]): InvoiceTotals {
  const add = (f: (l: InvoiceLine) => number) => lines.reduce((a, l) => a + f(l), 0);

  const fobTotal = add((l) => l.lineTotal);
  const freightTotal = add((l) => l.freight);

  return {
    netWeightKg: add((l) => l.netWeightKg),
    grossWeightKg: add((l) => l.grossWeightKg),
    contractLbs: add((l) => l.contractLbs),
    packageCount: add((l) => l.packageCount ?? 0),
    palletCount: add((l) => l.palletCount ?? 0),
    containerCount: lines.length,
    fobTotal,
    freightTotal,
    totalValue: fobTotal + freightTotal,
  };
}
