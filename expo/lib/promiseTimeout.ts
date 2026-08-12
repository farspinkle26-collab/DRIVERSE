/**
 * Driveverse — bounds a promise that might never settle.
 *
 * A `try/catch` (or a `.catch()`) only protects against a promise that
 * REJECTS. A promise that never settles at all — a stalled fetch with no
 * server-side timeout, a network dropped mid-request — passes straight
 * through every catch in the codebase, because there is nothing to catch:
 * nothing ever throws, the `await` just never returns. Every gate this app
 * has gotten stuck on for good was that shape (see `useAppFonts`'s
 * `FONT_TIMEOUT_MS` and the `getSession()` comment in `useAuthStore.ts`),
 * not a thrown error — and the Google sign-in flow's post-browser network
 * calls (`exchangeCodeForSession`, `loadUserProfile`) had no such cap,
 * which is how "stuck on the loading screen after picking a Google account"
 * happens: the app comes back from the browser exactly when its network
 * state is least settled, one of those calls stalls, and nothing downstream
 * was ever going to fire.
 *
 * `withTimeout` turns "hangs forever" into "rejects after `ms`", which every
 * existing `.catch()` / `finally` in the codebase already knows how to
 * handle — nothing downstream has to change to benefit from it.
 */
export function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
