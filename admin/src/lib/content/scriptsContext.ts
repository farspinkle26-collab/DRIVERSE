import "server-only";
import { readAllScripts } from "./scriptStore";
import { extractAutoSection, readAllPosts, readWhatWorks } from "./store";
import { getUserLocations } from "../queries";
import { onlineUserCount } from "../metrics";
import type { DensitySnapshot } from "./scriptRules";
import type { PovScript } from "./scriptTypes";
import type { Post } from "./types";

// Everything the POV Script pages need, read once per request.
//
// The Supabase read (live map presence, for the Social density gate) is
// deliberately non-fatal: the whole content section works with no Supabase
// credentials at all, and a Social script that can't see the driver count still
// has to show its gate banner — it just says the count is unavailable.

export interface ScriptsContext {
  scripts: PovScript[];
  posts: Post[];
  /** The machine-generated section of what-works.md, for the prompt builders. */
  whatWorksAuto: string;
  density: DensitySnapshot;
}

async function readDensity(): Promise<DensitySnapshot> {
  const checkedAt = new Date().toISOString();
  try {
    const locations = await getUserLocations();
    if (!locations.available) return { count: 0, available: false, checkedAt };
    return { count: onlineUserCount(locations.rows), available: true, checkedAt };
  } catch {
    // No credentials, or the table isn't there yet.
    return { count: 0, available: false, checkedAt };
  }
}

export async function loadScriptsContext(): Promise<ScriptsContext> {
  const [scripts, posts, whatWorks, density] = await Promise.all([
    readAllScripts(),
    readAllPosts(),
    readWhatWorks(),
    readDensity(),
  ]);
  return { scripts, posts, whatWorksAuto: extractAutoSection(whatWorks), density };
}
