import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { contentDir } from "./paths";

// ── Storage backend for the content/ store ──────────────────────────────────
// Locally (and anywhere the filesystem is writable) we just read/write the
// checked-out files directly. On Vercel the deployed filesystem is read-only
// outside /tmp and thrown away between invocations, so a plain fs.writeFile
// there silently doesn't persist. When GITHUB_TOKEN + GITHUB_REPO are set, we
// instead read/write through the GitHub Contents API, committing straight to
// the git-committed store — the same source of truth `git pull` sees.

function githubConfig(): { token: string; owner: string; repo: string; branch: string } | null {
  const token = process.env.GITHUB_TOKEN;
  const repoSlug = process.env.GITHUB_REPO; // "owner/repo"
  if (!token || !repoSlug) return null;
  const [owner, repo] = repoSlug.split("/");
  if (!owner || !repo) {
    throw new Error(`GITHUB_REPO must be "owner/repo", got: ${repoSlug}`);
  }
  return { token, owner, repo, branch: process.env.GITHUB_BRANCH || "main" };
}

// Path to a file/dir under content/, relative to the repo root, e.g.
// "content/posts/foo.md". `contentDir()` may be an absolute override
// (CONTENT_DIR) for local dev/tests, in which case the GitHub backend — which
// only makes sense against the real repo — is simply not used.
function repoRelativePath(absPath: string): string {
  const repoRoot = path.join(contentDir(), "..");
  return path.relative(repoRoot, absPath).split(path.sep).join("/");
}

async function ghRequest(
  cfg: NonNullable<ReturnType<typeof githubConfig>>,
  relPath: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${relPath}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

export async function readTextFile(absPath: string): Promise<string | null> {
  const cfg = githubConfig();
  if (!cfg) {
    try {
      return await fs.readFile(absPath, "utf8");
    } catch {
      return null;
    }
  }
  const relPath = repoRelativePath(absPath);
  const res = await ghRequest(cfg, `${relPath}?ref=${cfg.branch}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub read failed for ${relPath}: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { content: string; encoding: string };
  return Buffer.from(json.content, "base64").toString("utf8");
}

export async function writeTextFile(
  absPath: string,
  content: string,
  message: string,
): Promise<void> {
  const cfg = githubConfig();
  if (!cfg) {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, content, "utf8");
    return;
  }
  const relPath = repoRelativePath(absPath);
  // Need the current blob sha to update an existing file; omit for a new one.
  const existing = await ghRequest(cfg, `${relPath}?ref=${cfg.branch}`);
  const sha = existing.ok ? ((await existing.json()) as { sha: string }).sha : undefined;
  const res = await ghRequest(cfg, relPath, {
    method: "PUT",
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: cfg.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`GitHub write failed for ${relPath}: ${res.status} ${await res.text()}`);
  }
}

export async function listDir(absPath: string): Promise<string[]> {
  const cfg = githubConfig();
  if (!cfg) {
    try {
      return await fs.readdir(absPath);
    } catch {
      return [];
    }
  }
  const relPath = repoRelativePath(absPath);
  const res = await ghRequest(cfg, `${relPath}?ref=${cfg.branch}`);
  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`GitHub list failed for ${relPath}: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { name: string; type: string }[];
  return json.filter((e) => e.type === "file").map((e) => e.name);
}

export function usingGitHubBackend(): boolean {
  return githubConfig() !== null;
}
