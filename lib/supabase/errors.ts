// =============================================================================
// dbError — turn a PostgrestError into a real Error
// =============================================================================
// supabase-js surfaces failures as PostgrestError values, which are plain
// objects — NOT Error instances. Re-throwing them directly (`throw error`)
// loses the stack trace and breaks anything that expects real errors: most
// visibly Playwright's `expect(...).rejects.toThrow()`, which reports a
// rejection with a plain object as "Received function did not throw".
// Every lib-layer `if (error) throw ...` goes through this instead.

interface DbErrorLike {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Wrap a Supabase/PostgREST error as a real Error; original kept as `cause`. */
export function dbError(error: DbErrorLike): Error {
  return new Error(error.message, { cause: error });
}
