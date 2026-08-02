#!/usr/bin/env node
/**
 * Fails the build when a NEW native module is looked up in the launch window —
 * the stretch of startup in which this app has now died three times.
 *
 * WHY THIS EXISTS
 *
 * LAUNCH_SAFETY_REFERENCE.md §1/§2 states the rule: no native call and no
 * `throw` at module scope on anything reachable from `app/_layout.tsx`. Those
 * modules are evaluated before any React tree exists, above `AppErrorBoundary`,
 * and before `installCrashReporter()` has armed — so a throw there ends the
 * process a few hundred milliseconds after the icon is tapped, with a black
 * screen and no artefact to read.
 *
 * The rule was written down and broken anyway, because it cannot be checked by
 * reading the source. §8 is the first proof: the offending provider was
 * injected by a Babel transformer and existed in no file in this repository.
 * §10 is the second: the offending line was
 * `requireNativeModule('ExpoWebBrowser')` inside `node_modules/expo-web-browser`,
 * reached by a bare `import` in `lib/socialAuth.ts` — a file whose own header
 * says nothing in it may run at import time. Deferring every call in our own
 * source did not help; the import statement itself was the hazard.
 *
 * So this checks the BUNDLE, the only artefact that tells the truth about what
 * runs at launch.
 *
 * TWO ROOTS, BECAUSE THE ROUTES LOAD LAZILY — the correction that makes this
 * check catch anything at all.
 *
 * Only ~550 of this bundle's 3,231 modules evaluate while Hermes loads it, and
 * NONE of the app's own code is among them. `expo-router` reaches the routes
 * through Metro's `require.context`, which compiles to a map of lazy getters:
 *
 *     {"./_layout.tsx":{enumerable:!0,get:()=>r(d[6])}, ...}
 *
 * so `app/_layout.tsx` — and its whole import closure — is pulled in later,
 * when `ExpoRoot` reads that key during the first render. Seeding the walk only
 * from Metro's `__r(...)` entry points therefore proves nothing about app code:
 * it would have passed this bundle while the crash was still in it.
 *
 * The window that matters runs from the first line of the bundle to the moment
 * `AppErrorBoundary` is mounted, and `AppErrorBoundary` is exported BY the root
 * layout — so a throw while that module is being required is not caught by it,
 * nor by the router's own `ErrorBoundary` export, which lives in the same file
 * that failed to load. Nothing catches it and the process dies. So the walk is
 * seeded from both roots: Metro's entry points, and the root layout reached
 * through the route context.
 *
 * EAGER EDGES, NOT STATIC ONES — the second subtlety.
 *
 * Metro emits `__d(factory, id, [deps])`, where `deps` is a STATIC list of
 * every `require()` in the module, including ones inside function bodies that
 * never run at startup. Walking that list marks essentially the whole bundle as
 * "reachable" and proves nothing either. What matters is whether the factory
 * calls `r(d[N])` at its own top level — an ESM `import`, hoisted and evaluated
 * the instant the module is required — or inside a function, which is inert
 * until something calls it. That is exactly the difference between the broken
 * and fixed forms of `lib/socialAuth.ts`, and a brace-counting heuristic gets
 * it wrong on minified code, so this parses each factory and asks the AST.
 *
 * WHAT AN ADDITION MEANS. Not automatically a bug — most of the allowlist is
 * legitimate: SDK-matched Expo packages whose native halves autolinking builds,
 * so their lookups resolve. It means a new native module now loads on every
 * cold start, and someone has to decide that is intended. Two questions:
 *
 *   1. Does the package's major match the Expo SDK? (`bun run check:versions`
 *      answers this, and is the check that would have caught §10 outright.) A
 *      mismatched major means the JS looks up a native module autolinking never
 *      built, and the lookup throws.
 *
 *   2. Does it need to be on the launch path at all? If one screen or flow is
 *      the only caller, defer the import — `require()` it inside the function
 *      that uses it, as `lib/socialAuth.ts` does for `expo-web-browser`. By
 *      then there is a tree, a boundary and a reporter to catch anything.
 *
 * If both answers are yes, add the name to ALLOWED with a note saying which
 * package brought it in.
 *
 * Run by `bun run check:launch-path` and by `bundle:verify` (which builds the
 * bundle first).
 */

const fs = require("fs");
const { parse } = require("@babel/parser");

const BUNDLE = process.env.DRIVERSE_BUNDLE ?? "/tmp/driverse-ios.bundle.js";

/**
 * Native modules allowed to be looked up during bundle evaluation.
 *
 * Every entry is an Expo package on the SDK 54 line, whose native half
 * autolinking builds, reached because the root layout's provider stack imports
 * it. Sorted; keep it that way so an addition is a one-line diff.
 */
const ALLOWED = new Set([
  "ExpoApplication", // expo-application, via expo-notifications
  "ExpoAsset", // expo-asset, via expo-font / expo-router
  "ExpoBackgroundNotificationTasksModule", // expo-notifications
  "ExpoBadgeModule", // expo-notifications
  "ExpoFontLoader", // expo-font, via useAppFonts
  "ExpoGo", // expo, runtime-environment detection
  "ExpoLinking", // expo-linking, via expo-router
  "ExpoLocation", // expo-location, via the map + presence stores
  "ExpoNotificationCategoriesModule", // expo-notifications
  "ExpoNotificationPermissionsModule", // expo-notifications
  "ExpoNotificationPresenter", // expo-notifications
  "ExpoNotificationScheduler", // expo-notifications
  "ExpoNotificationsEmitter", // expo-notifications
  "ExpoNotificationsHandlerModule", // expo-notifications
  "ExpoPushTokenManager", // expo-notifications
  "NotificationsServerRegistrationModule", // expo-notifications
]);

if (!fs.existsSync(BUNDLE)) {
  console.error(
    `[check-launch-path] No bundle at ${BUNDLE}.\n` +
      "Run `bun run bundle:ios` first (or `bun run bundle:verify`, which does)."
  );
  process.exit(1);
}

const src = fs.readFileSync(BUNDLE, "utf8");
const ast = parse(src, { sourceType: "script", errorRecovery: true });

/** id -> { eager:Set<number>, start:number, end:number } */
const modules = new Map();
const entries = [];
/** Module ids for `app/_layout.tsx`, found behind the route context's getters. */
const rootLayoutModules = [];

/**
 * True when `node` sits inside a function nested below `factory` — i.e. it does
 * not run when the module is first required.
 */
function collectFactory(factory, depsIdName, requireIdName) {
  const eager = new Set();

  const visit = (node, nested) => {
    if (!node || typeof node.type !== "string") return;

    // `r(d[N])` — the compiled form of both `import` and `require()`.
    if (
      !nested &&
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === requireIdName &&
      node.arguments.length >= 1
    ) {
      const arg = node.arguments[0];
      if (
        arg.type === "MemberExpression" &&
        arg.object.type === "Identifier" &&
        arg.object.name === depsIdName &&
        arg.property.type === "NumericLiteral"
      ) {
        eager.add(arg.property.value);
      }
    }

    const entersFunction =
      node.type === "FunctionExpression" ||
      node.type === "FunctionDeclaration" ||
      node.type === "ArrowFunctionExpression" ||
      node.type === "ObjectMethod" ||
      node.type === "ClassMethod";

    for (const key of Object.keys(node)) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) if (c && typeof c.type === "string") visit(c, nested || entersFunction);
      } else if (child && typeof child.type === "string") {
        visit(child, nested || entersFunction);
      }
    }
  };

  // Skip the factory node itself so its own body counts as top level.
  for (const stmt of factory.body.body) visit(stmt, false);
  return eager;
}

/**
 * The dependency index behind `"./_layout.tsx"` in a `require.context` map, or
 * null if this factory is not that map.
 *
 * The getter body is deliberately read WITHOUT the top-level rule above: the
 * whole point is that this require is lazy, and we want it anyway, because
 * `ExpoRoot` performs it during the first render — still inside the window
 * where nothing can catch a throw.
 */
function rootLayoutDepIndex(factory, depsIdName, requireIdName) {
  let found = null;

  const findRequire = (node) => {
    if (!node || typeof node.type !== "string" || found !== null) return;
    if (
      node.type === "CallExpression" &&
      node.callee.type === "Identifier" &&
      node.callee.name === requireIdName &&
      node.arguments[0]?.type === "MemberExpression" &&
      node.arguments[0].object.type === "Identifier" &&
      node.arguments[0].object.name === depsIdName &&
      node.arguments[0].property.type === "NumericLiteral"
    ) {
      found = node.arguments[0].property.value;
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === "loc") continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === "string" && findRequire(c));
      else if (child && typeof child.type === "string") findRequire(child);
    }
  };

  const walk = (node) => {
    if (!node || typeof node.type !== "string" || found !== null) return;
    const key = node.key ?? node.properties?.key;
    if (
      (node.type === "ObjectProperty" || node.type === "ObjectMethod") &&
      key?.type === "StringLiteral" &&
      key.value === "./_layout.tsx"
    ) {
      findRequire(node.value ?? node.body);
      if (found !== null) return;
    }
    for (const k of Object.keys(node)) {
      if (k === "loc") continue;
      const child = node[k];
      if (Array.isArray(child)) child.forEach((c) => c && typeof c.type === "string" && walk(c));
      else if (child && typeof child.type === "string") walk(child);
    }
  };

  for (const stmt of factory.body.body) walk(stmt);
  return found;
}

for (const stmt of ast.program.body) {
  if (stmt.type !== "ExpressionStatement") continue;
  const call = stmt.expression;
  if (call.type !== "CallExpression" || call.callee.type !== "Identifier") continue;

  if (call.callee.name === "__r" && call.arguments[0]?.type === "NumericLiteral") {
    entries.push(call.arguments[0].value);
    continue;
  }

  if (call.callee.name !== "__d") continue;
  const [factory, idNode, depsNode] = call.arguments;
  if (!factory || idNode?.type !== "NumericLiteral") continue;
  if (factory.type !== "FunctionExpression" && factory.type !== "ArrowFunctionExpression") continue;

  // Metro's factory signature is (global, require, importDefault, importAll,
  // module, exports, dependencyMap) — positional, and the names are mangled.
  const params = factory.params;
  const requireIdName = params[1]?.type === "Identifier" ? params[1].name : null;
  const depsIdName = params[6]?.type === "Identifier" ? params[6].name : null;
  if (!requireIdName || !depsIdName) continue;

  /**
   * `r(d[N])` indexes the dependency MAP — the third argument to `__d` — so N
   * is a position in that array, not a module id. Resolving the two the wrong
   * way round silently walks a graph that does not exist.
   */
  const depIds =
    depsNode?.type === "ArrayExpression"
      ? depsNode.elements.map((el) => (el?.type === "NumericLiteral" ? el.value : null))
      : [];

  const eager = new Set();
  for (const index of collectFactory(factory, depsIdName, requireIdName)) {
    const id = depIds[index];
    if (typeof id === "number") eager.add(id);
  }

  const layoutIndex = rootLayoutDepIndex(factory, depsIdName, requireIdName);
  if (layoutIndex !== null && typeof depIds[layoutIndex] === "number") {
    rootLayoutModules.push(depIds[layoutIndex]);
  }

  modules.set(idNode.value, { eager, start: factory.start, end: factory.end });
}

if (modules.size === 0) {
  console.error("[check-launch-path] Could not parse any modules out of the bundle.");
  process.exit(1);
}
if (entries.length === 0) {
  console.error("[check-launch-path] Could not find an `__r(...)` entry call.");
  process.exit(1);
}
if (rootLayoutModules.length === 0) {
  // Not a warning to skip past: without this root the walk misses every line of
  // app code, which is the half of the launch window that has actually failed.
  console.error(
    "[check-launch-path] Could not find `./_layout.tsx` in a require.context map.\n" +
      "The route context's shape must have changed — fix `rootLayoutDepIndex()`\n" +
      "rather than ignoring this, or the check silently stops covering app code."
  );
  process.exit(1);
}

// Only eager edges, from both roots: what the bundle evaluates on its own, plus
// the root layout the router pulls in during the first render.
const roots = [...entries, ...rootLayoutModules];
const evaluated = new Set(roots);
const queue = [...roots];
while (queue.length) {
  const id = queue.shift();
  for (const dep of modules.get(id)?.eager ?? []) {
    if (!evaluated.has(dep)) {
      evaluated.add(dep);
      queue.push(dep);
    }
  }
}

// `requireNativeModule` throws when the module is absent; the `Optional`
// variant returns null and is safe, so only the throwing form is policed.
const THROWING = /(?<!Optional)requireNativeModule\)?\s*\(\s*['"]([A-Za-z0-9_]+)['"]/g;

const found = new Map(); // native module name -> bundle module id
for (const id of evaluated) {
  const mod = modules.get(id);
  if (!mod) continue;
  const body = src.slice(mod.start, mod.end);
  for (const m of body.matchAll(THROWING)) {
    if (!found.has(m[1])) found.set(m[1], id);
  }
}

const unexpected = [...found.keys()].filter((n) => !ALLOWED.has(n)).sort();
const gone = [...ALLOWED].filter((n) => !found.has(n)).sort();

console.log(
  `[check-launch-path] ${evaluated.size} of ${modules.size} modules are EVALUATED in the launch ` +
    `window (eager edges from ${entries.length} bundle entr${
      entries.length === 1 ? "y" : "ies"
    } + root layout module ${rootLayoutModules.join(", ")}); ` +
    `${found.size} native-module lookup(s) among them.`
);

if (gone.length) {
  // Not a failure: a lookup leaving the launch path is the direction we want.
  console.log(
    `[check-launch-path] note — allowlisted but no longer on the launch path ` +
      `(safe to prune from ALLOWED): ${gone.join(", ")}`
  );
}

if (unexpected.length === 0) {
  console.log("[check-launch-path] OK — no unreviewed native module on the launch path.");
  process.exit(0);
}

console.error(
  `\n[check-launch-path] ${unexpected.length} native module(s) are looked up in the launch ` +
    "window and are not on the reviewed allowlist:\n"
);
for (const name of unexpected) {
  console.error(`  ${name}  (bundle module ${found.get(name)})`);
}
console.error(
  "\n`requireNativeModule` THROWS when the native module is not registered, and at\n" +
    "this point in startup there is no React tree, no error boundary and no crash\n" +
    "reporter — the app dies on open with a black screen and no artefact.\n\n" +
    "Either defer the import (`require()` it inside the function that uses it, as\n" +
    "`lib/socialAuth.ts` does for `expo-web-browser`), or — if it genuinely belongs\n" +
    "at startup and `bun run check:versions` is clean — add it to ALLOWED in this\n" +
    "file with a note saying which package brought it in.\n\n" +
    "See LAUNCH_SAFETY_REFERENCE.md §1, §2 and §10.\n"
);
process.exit(1);
