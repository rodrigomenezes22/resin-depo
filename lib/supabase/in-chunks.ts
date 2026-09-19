// =============================================================================
// inChunks — an `.in(...)` filter that survives a grown table
// =============================================================================
// PostgREST takes its filters in the URL, so `.in("id", ids)` with a few
// hundred uuids produces a multi-kilobyte query string and the server answers
// `URI too long`. supabase-js reports that in `error`, and the usual
// `const { data } = await …` at these call sites drops it — so the lookup
// returns nothing, the grid renders every row's joined value as "—", and
// nothing anywhere says why.
//
// It is a bug that only appears with volume: the Bank ledger looked correct for
// months and silently lost its Shipment, cost and lot columns once the table
// passed ~250 non-draft rows. A production ledger passes that in a week.
//
// So: batch the ids, and THROW on error rather than degrade. A ledger showing
// confidently wrong numbers is worse than one that fails.
// =============================================================================

/**
 * Ids per request. 100 uuids ≈ 3.7 KB of query string, comfortably inside the
 * 8 KB most proxies allow, and few enough round trips to be irrelevant next to
 * the queries themselves.
 */
export const IN_CHUNK_SIZE = 100;

type Result<T> = { data: T[] | null; error: { message: string } | null };

/**
 * Run `query` once per batch of ids and concatenate the rows.
 *
 * ```ts
 * const rows = await inChunks(dealIds, (batch) =>
 *   db.from("shipment_containers").select("…").in("matched_order_id", batch),
 * );
 * ```
 */
export async function inChunks<T>(
  ids: string[],
  query: (batch: string[]) => PromiseLike<Result<T>>,
): Promise<T[]> {
  if (!ids.length) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const { data, error } = await query(ids.slice(i, i + IN_CHUNK_SIZE));
    if (error) throw new Error(error.message);
    if (data) out.push(...data);
  }
  return out;
}
