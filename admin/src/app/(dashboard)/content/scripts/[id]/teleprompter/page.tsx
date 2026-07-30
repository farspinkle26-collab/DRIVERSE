import { notFound } from "next/navigation";
import { readScript } from "@/lib/content/scriptStore";
import { spokenLines } from "@/lib/content/scriptRules";
import { TeleprompterClient } from "./TeleprompterClient";

// Filming mode. Reads only this one script — nothing else on the page, because
// this runs on a dash mount with the engine on.
export const dynamic = "force-dynamic";

export default async function TeleprompterPage({ params }: { params: { id: string } }) {
  const script = await readScript(params.id);
  if (!script) notFound();

  return (
    <TeleprompterClient
      id={script.id}
      title={script.frontmatter.title || script.id}
      hook={script.frontmatter.hook}
      lines={spokenLines(script.body.script)}
      visualDirection={script.body.visualDirection}
      onScreenText={script.body.onScreenText}
      checklist={script.body.filmingChecklist}
    />
  );
}
