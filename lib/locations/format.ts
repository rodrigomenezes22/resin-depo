// =============================================================================
// formatLocationLabel — the one "Name — City, ST" rule
// =============================================================================
// Every surface that names a location renders this exact shape — the deal
// point pickers (components/sales/matched-order-form.tsx), the Transaction
// Detail party cards (components/bank/transaction-detail/parties.tsx), and
// both Logistics boards' point columns (via `pointLabel` in
// lib/logistics/points.ts) — so the desk reads back exactly what it
// chose wherever it looks. This helper replaced three hand-rolled copies of
// the rule; don't grow a fourth.

/** `"Warehouse X — Joliet, IL"`; bare name when no city/state is on file. */
export function formatLocationLabel(loc: {
  name: string;
  city?: string | null;
  state?: string | null;
}): string {
  const where = [loc.city, loc.state].filter(Boolean).join(", ");
  return where ? `${loc.name} — ${where}` : loc.name;
}
