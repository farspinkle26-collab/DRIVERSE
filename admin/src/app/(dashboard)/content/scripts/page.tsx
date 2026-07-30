import { loadScriptsContext } from "@/lib/content/scriptsContext";
import { ScriptsClient } from "./ScriptsClient";

// Server component: read content/scripts/*.md (plus the post store, for the
// performance loop, and live map presence, for the Social density gate) at
// request time and hand serializable data to the client, which recomputes the
// rotation/hook checks and every filter instantly.
export const dynamic = "force-dynamic";

export default async function ScriptsPage() {
  const { scripts, posts, density } = await loadScriptsContext();
  return <ScriptsClient scripts={scripts} posts={posts} density={density} />;
}
