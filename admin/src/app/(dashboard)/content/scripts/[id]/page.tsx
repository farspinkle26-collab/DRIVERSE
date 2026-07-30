import { notFound } from "next/navigation";
import { loadScriptsContext } from "@/lib/content/scriptsContext";
import { featureRotation, recentPovHooks } from "@/lib/content/scriptRules";
import { scriptPerformance, scriptPillarLabel } from "@/lib/content/scriptPerformance";
import { ScriptEditorClient } from "./ScriptEditorClient";

export const dynamic = "force-dynamic";

export default async function ScriptDetailPage({ params }: { params: { id: string } }) {
  const { scripts, posts, whatWorksAuto, density } = await loadScriptsContext();
  const script = scripts.find((s) => s.id === params.id);
  if (!script) notFound();

  // Both computed checks exclude this script — a script never checks itself for
  // repetition, and its own feature isn't what it should rotate away from.
  return (
    <ScriptEditorClient
      script={script}
      rotation={featureRotation(scripts, undefined, script.id)}
      recentHooks={recentPovHooks(scripts, undefined, script.id)}
      performance={scriptPerformance(script, posts)}
      pillarLabel={scriptPillarLabel(script, posts)}
      whatWorks={whatWorksAuto}
      density={density}
      postSlugs={posts.map((p) => p.slug)}
    />
  );
}
