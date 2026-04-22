// SCH-573 — guard against the recurring `null is not an object (evaluating 'X.id')`
// crash by forcing both error AND empty-row checks on Supabase write results
// that are expected to return a single row. Use on any
// `.insert(...).select().single()` / `.update(...).select().single()` /
// `.upsert(...).select().single()` result whose caller needs a non-null row.

type SupabaseSingleResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

export function requireRow<T>(
  result: SupabaseSingleResult<T>,
  op: string,
): NonNullable<T> {
  if (result.error) throw new Error(`${op} failed: ${result.error.message}`);
  if (result.data === null || result.data === undefined) {
    throw new Error(`${op} returned no row`);
  }
  return result.data as NonNullable<T>;
}

type SupabaseMutationResult = { error: { message: string } | null };

// Use on fire-and-forget `.insert(...)` / `.update(...)` / `.upsert(...)` /
// `.delete(...)` / `.rpc(...)` calls that don't expect a row back. Surfaces
// PostgREST errors (RLS denial, constraint violation, missing column) that
// would otherwise disappear silently and leave the UI in a "looks-OK"
// no-op state.
export function throwOnMutationError(
  result: SupabaseMutationResult,
  op: string,
): void {
  if (result.error) throw new Error(`${op} failed: ${result.error.message}`);
}
