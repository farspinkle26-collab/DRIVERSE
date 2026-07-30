import { loadScriptsContext } from "@/lib/content/scriptsContext";
import { featureRotation, recentPovHooks } from "@/lib/content/scriptRules";
import { NewScriptClient } from "./NewScriptClient";

// The rotation and hook-repetition checks are computed here, before the editor
// for a new script is shown at all — that's the point of them: you see which
// screens the last five scripts used and which hooks are spent while you're
// choosing, not after.
export const dynamic = "force-dynamic";

export default async function NewScriptPage() {
  const { scripts, density } = await loadScriptsContext();
  return (
    <NewScriptClient
      rotation={featureRotation(scripts)}
      recentHooks={recentPovHooks(scripts)}
      density={density}
    />
  );
}
