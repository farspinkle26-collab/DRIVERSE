// 10. Performance feedback loop — the other end of the pipeline.
//
// Once a script's `linked_post` resolves to a real post file, the numbers that
// post earned come back to the script it came from, so browsing old scripts
// shows which approaches actually worked rather than only what was written.
//
// Pure and client-safe: it reads the post store the dashboard already loaded and
// the same medians the learning loop uses. It never invents a number — a linked
// post that is still Scheduled reports "no metrics yet", not a zero.

import { median } from "./metrics";
import { PILLAR_LABELS, type Pillar, type Post } from "./types";
import { DEFAULT_SCRIPT_PILLAR, type PovScript } from "./scriptTypes";

/** Strip the shapes `linked_post` can legitimately hold down to a slug. */
function slugCandidates(linkedPost: string): string[] {
  const raw = linkedPost.trim();
  if (!raw) return [];
  const withoutPath = raw
    .replace(/^\.?\/?content\/posts\//, "")
    .replace(/\.md$/, "");
  return [raw, withoutPath];
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Resolve `linked_post` — a post slug, a `content/posts/<slug>.md` reference, or
 * a permalink — to the post it names. Returns null when nothing matches, which
 * the UI shows as an unresolved link rather than silently treating as unlinked.
 */
export function resolveLinkedPost(
  linkedPost: string | null | undefined,
  posts: Post[],
): Post | null {
  if (!linkedPost) return null;
  const candidates = slugCandidates(linkedPost);
  for (const candidate of candidates) {
    const bySlug = posts.find((p) => p.slug === candidate);
    if (bySlug) return bySlug;
  }
  const url = normalizeUrl(linkedPost);
  if (!/^https?:\/\//.test(url)) return null;
  return (
    posts.find((p) => {
      const fm = p.frontmatter;
      return [fm.permalink, fm.link_instagram, fm.link_tiktok]
        .filter(Boolean)
        .some((u) => normalizeUrl(u) === url);
    }) ?? null
  );
}

export interface ScriptPerformance {
  post: Post;
  pillar: Pillar;
  pillarLabel: string;
  /** False while the linked post is still Scheduled — nothing to report yet. */
  hasMetrics: boolean;
  views: number;
  saveRate: number;
  /** Median save rate across published posts of the same pillar (this one
   *  included), or null when there's no comparison population. */
  pillarMedianSaveRate: number | null;
  /** Relative gap vs that median, as a ratio (0.2 = 20% above). */
  vsMedian: number | null;
  organicPickup: number;
  seededComments: number;
  /** organic / (organic + seeded) — the strategic number. */
  organicPickupRate: number | null;
  /** How many published posts the median is computed over. */
  pillarN: number;
}

/**
 * The "How this performed" card's data. The comparison pillar is the linked
 * post's own — a POV script whose post was filed under Fake Scripted POV is
 * judged against that pillar, not against POV Daily — falling back to the POV
 * pillar only when the post is unclassified.
 */
export function scriptPerformance(
  script: PovScript,
  posts: Post[],
): ScriptPerformance | null {
  const post = resolveLinkedPost(script.frontmatter.linked_post, posts);
  if (!post) return null;
  const fm = post.frontmatter;
  const pillar: Pillar = fm.pillar ?? DEFAULT_SCRIPT_PILLAR;
  const hasMetrics = fm.status === "published" && fm.views > 0;

  const cohort = posts.filter(
    (p) =>
      p.frontmatter.status === "published" &&
      !p.frontmatter.is_repost &&
      (p.frontmatter.pillar ?? DEFAULT_SCRIPT_PILLAR) === pillar &&
      p.frontmatter.views > 0,
  );
  const pillarMedianSaveRate = cohort.length
    ? median(cohort.map((p) => p.frontmatter.save_rate))
    : null;

  const organic = fm.comments_organic_pickup;
  const seeded = fm.comments_seeded;

  return {
    post,
    pillar,
    pillarLabel: PILLAR_LABELS[pillar],
    hasMetrics,
    views: fm.views,
    saveRate: fm.save_rate,
    pillarMedianSaveRate,
    vsMedian:
      hasMetrics && pillarMedianSaveRate && pillarMedianSaveRate > 0
        ? fm.save_rate / pillarMedianSaveRate - 1
        : null,
    organicPickup: organic,
    seededComments: seeded,
    organicPickupRate: organic + seeded > 0 ? organic / (organic + seeded) : null,
    pillarN: cohort.length,
  };
}

/** The pillar a script is judged against — used by the refine prompt too. */
export function scriptPillarLabel(script: PovScript, posts: Post[]): string {
  const post = resolveLinkedPost(script.frontmatter.linked_post, posts);
  const pillar = post?.frontmatter.pillar ?? DEFAULT_SCRIPT_PILLAR;
  return PILLAR_LABELS[pillar];
}
