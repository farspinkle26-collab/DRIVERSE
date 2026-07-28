/**
 * `Promise.all` with a ceiling on how many run at once.
 *
 * Pure, dependency-free and in its own file so it can be unit-tested without
 * pulling the Supabase client in behind it.
 *
 * WHY THE MAP NEEDS THIS
 *   The places layer fires one request per ticked category. All nine at once
 *   is not nine times faster: those requests become Overpass queries leaving
 *   Supabase from one IP, and Overpass refuses anything past its small
 *   per-IP slot count with an immediate 429 rather than queueing it. Beyond
 *   the slot count, extra parallelism converts into failures, not speed.
 */

/**
 * Runs `worker` over `items`, at most `limit` at a time. Results come back in
 * **input order** regardless of the order they finish in, so callers can keep
 * pairing them with the input array.
 *
 * A rejection propagates, exactly as `Promise.all` does — callers that want
 * partial success should have their worker catch and return a result type.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const runnerCount = Math.max(1, Math.min(Math.floor(limit), items.length));
  const runners = Array.from({ length: runnerCount }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
