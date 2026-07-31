/**
 * Priority #2 (integration) — the XP store hook end to end.
 *
 * Renders the real `useXP` provider with Supabase and AsyncStorage mocked and
 * drives it through one award sequence. The key case is RAPID CONSECUTIVE
 * AWARDS: two awards fired in the same tick used to silently drop XP, because
 * `addXP` recomputed from the state captured in its closure, so the second
 * award overwrote the first from the same base. The store now advances a ref,
 * so both awards compound — this test would fail against the old code.
 *
 * The assertions share one mounted store (one `renderHook`): RNTL 14's async
 * renderHook + jest-expo don't re-mount cleanly across multiple `it` blocks in
 * a file, so the whole narrative runs in a single test.
 */
import { act, renderHook, waitFor } from "@testing-library/react-native";

// Plain functions (not jest.fn) so jest-expo's between-test mock reset can't
// wipe their implementations.
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async () => null,
    setItem: async () => undefined,
    removeItem: async () => undefined,
  },
}));

jest.mock("@/lib/supabase", () => {
  const chain = { on: () => chain, subscribe: () => chain };
  return {
    supabase: {
      auth: {
        // Signed-out driver: XP lives in AsyncStorage, no network involved.
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({
          data: { subscription: { unsubscribe: () => undefined } },
        }),
      },
      from: () => ({ upsert: async () => ({ error: null }) }),
      channel: () => chain,
      removeChannel: () => undefined,
    },
  };
});

// Imported after the mocks are registered.
import { XPProvider, useXP } from "@/hooks/useXPStore";

test("awards XP, levels up, and counts BOTH of two same-tick awards", async () => {
  const { result } = await renderHook(() => useXP(), { wrapper: XPProvider });
  await waitFor(() => expect(result.current?.loading).toBe(false));

  // A fresh signed-out driver starts at level 1 with nothing.
  expect(result.current.level).toBe(1);
  expect(result.current.xp).toBe(0);
  expect(result.current.totalXp).toBe(0);

  // Two awards in the same handler (e.g. drive XP + a quest completing). Both
  // must land: 60 + 60 = 120, crossing level 1's 100 cap → level 2, xp 20.
  await act(async () => {
    result.current.addXP(60);
    result.current.addXP(60);
  });

  expect(result.current.totalXp).toBe(120); // regression: not 60
  expect(result.current.level).toBe(2);
  expect(result.current.xp).toBe(20);

  // Progress is reported against level 2's requirement (160).
  expect(result.current.xpRequired).toBe(160);
  expect(result.current.xpProgress).toBeCloseTo(20 / 160, 5);
});
