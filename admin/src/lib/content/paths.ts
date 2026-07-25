import "server-only";
import path from "node:path";

// The content store lives at the repo root in `content/`, one level above this
// Next app. Override with CONTENT_DIR (absolute path) for tests or a relocated
// store. Resolved lazily so importing this module never throws.
export function contentDir(): string {
  const override = process.env.CONTENT_DIR;
  if (override && override.length > 0) return override;
  return path.join(process.cwd(), "..", "content");
}

export function postsDir(): string {
  return path.join(contentDir(), "posts");
}

export function accountJsonPath(): string {
  return path.join(contentDir(), "account.json");
}

export function whatWorksPath(): string {
  return path.join(contentDir(), "what-works.md");
}
