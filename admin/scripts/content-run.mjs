#!/usr/bin/env node
// Thin trigger for the content pipeline (enrich settled posts + regenerate the
// AUTO section of what-works.md). All logic lives in the app at
// POST /api/content/run — this script just authenticates and calls it, so it's
// the single entrypoint for a cron job or a Claude Code Routine.
//
// Usage:
//   BASE_URL=https://your-admin.vercel.app ADMIN_PASSWORD=... node scripts/content-run.mjs
//
// Defaults: BASE_URL=http://localhost:3000. Zero dependencies (Node 18+ fetch).

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function fail(msg) {
  console.error(`content-run: ${msg}`);
  process.exit(1);
}

async function main() {
  if (!ADMIN_PASSWORD) fail("ADMIN_PASSWORD is not set.");

  // 1. Authenticate to get the session cookie.
  const login = await fetch(`${BASE_URL}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: ADMIN_PASSWORD }),
  });
  if (!login.ok) fail(`login failed: ${login.status} ${await login.text()}`);
  const cookie = login.headers.get("set-cookie");
  if (!cookie) fail("login succeeded but no session cookie was returned.");

  // 2. Run the pipeline.
  const run = await fetch(`${BASE_URL}/api/content/run`, {
    method: "POST",
    headers: { cookie: cookie.split(";")[0] },
  });
  const json = await run.json().catch(() => ({}));
  if (!run.ok || !json.ok) fail(`run failed: ${run.status} ${JSON.stringify(json)}`);

  console.log(
    `content-run: scanned ${json.postsScanned} posts, enriched ${json.enriched.length}, ` +
      `what-works.md auto-section ${json.whatWorksBytes} bytes.`,
  );
  for (const e of json.enriched) console.log(`  · ${e.slug}: ${e.actions.join("; ")}`);
}

main().catch((e) => fail(e.message));
