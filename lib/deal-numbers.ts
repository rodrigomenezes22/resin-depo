// =============================================================================
// Deal numbers — resolving the PARENT number a conversion leg renders under
// =============================================================================
// `dealOrderNumber()` (lib/units.ts) renders a leg under its parent's number
// (`05025-BT2`), so every procedure that serves an order number has to supply
// `parent_display_number` alongside `leg_index`. That number can't come from a
// PostgREST self-embed — `matched_orders → parent` resolves to an ARRAY, the
// same quirk `rolled_from` documents — so it takes a second lookup by id.
//
// A second lookup rather than reading from the result set, because a filtered
// page (Transaction Summary) or a differently-scoped one (Receiving, which
// lists lots) can easily show a leg whose parent isn't in the same result.
// =============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { inChunks } from "@/lib/supabase/in-chunks";

type DB = SupabaseClient<Database>;

/** Map of matched-order id → display_number, for the ids that exist. */
export async function parentDisplayNumbers(
  db: DB,
  parentIds: (string | null | undefined)[],
): Promise<Map<string, number>> {
  const ids = [...new Set(parentIds.filter((id): id is string => Boolean(id)))];
  // Batched — see lib/supabase/in-chunks.ts. A page of legs can name hundreds
  // of parents, and an over-long URL would blank every leg's order number.
  const data = await inChunks(ids, (batch) =>
    db.from("matched_orders").select("id, display_number").in("id", batch),
  );
  return new Map(data.map((p) => [p.id, p.display_number]));
}
