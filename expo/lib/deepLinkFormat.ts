/**
 * The pure half of `lib/deepLink.ts`.
 *
 * Split out for the same reason `lib/routeDraft.ts` and
 * `hooks/onlineUsersMerge.ts` are: the rule can then be unit-tested by a bare
 * runner, with no React Native or Expo module anywhere in the import graph.
 */

/**
 * Joins a scheme and a path into a deep link.
 *
 * Tolerant on both sides — the scheme may or may not already carry `:` or
 * `://`, and the path may or may not have a leading slash — because the
 * caller's inputs come from a manifest and from call sites written months
 * apart.
 */
export function buildLink(scheme: string, path: string): string {
  const bare = scheme.replace(/:\/*$/, "");
  const suffix = path.replace(/^\/+/, "");
  return `${bare}://${suffix}`;
}
