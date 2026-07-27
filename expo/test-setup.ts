/**
 * Bun test preload.
 *
 * `constants/ranks.ts` pulls the badge art in with `require("...png")`, which
 * Metro understands and a bare test runner does not. This teaches the runner
 * to resolve a PNG import to its path string — the same shape Metro hands
 * back for a static asset — so config modules that reference art can be
 * unit-tested without a bundler.
 *
 * Loaded via `bunfig.toml`. Harmless to the Edge Function tests, which
 * import no assets.
 */

import { plugin } from "bun";

plugin({
  name: "static-asset-stub",
  setup(build) {
    build.onLoad({ filter: /\.(png|jpg|jpeg|gif|webp|svg)$/ }, (args) => ({
      loader: "js",
      contents: `module.exports = ${JSON.stringify(args.path)};`,
    }));
  },
});
