// =============================================================================
// Shared-cost vocabulary — what a booking gets charged for
// =============================================================================
// Mirrors the `export_cost_type` enum, typed against it so adding a value to
// the database is a compile error here rather than a blank cell in the ledger.
// Lives outside the two components that need it (the Shared Costs table reads
// labels, the Add Cost drawer offers the options) so neither has to import the
// other.
// =============================================================================

import type { Database } from "@/lib/supabase/database.types";

export type ExportCostType = Database["public"]["Enums"]["export_cost_type"];

/** `[value, label]` — the options the Add Cost drawer offers, in desk order. */
export const COST_TYPES: [ExportCostType, string][] = [
  ["ocean_freight", "Ocean freight"],
  ["thc", "Terminal handling"],
  ["documentation", "Documentation"],
  ["insurance", "Insurance"],
  ["customs", "Customs"],
  ["other", "Other"],
];

const LABELS = new Map<string, string>(COST_TYPES);

/** Label for a stored type, falling back to the raw value. */
export const costLabel = (type: string): string => LABELS.get(type) ?? type;
