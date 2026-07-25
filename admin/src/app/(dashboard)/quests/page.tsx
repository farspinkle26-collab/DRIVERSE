import { getDailyQuests, getQuestTemplates, getUserXp } from "@/lib/queries";
import { QuestsClient } from "./QuestsClient";

export const dynamic = "force-dynamic";

export default async function QuestsPage() {
  const [quests, templates, xp] = await Promise.all([
    getDailyQuests(),
    getQuestTemplates(),
    getUserXp(),
  ]);

  const titleMap: Record<string, string> = {};
  for (const t of templates.rows) titleMap[t.id] = t.title_template;

  return (
    <QuestsClient
      quests={quests.rows}
      templateTitles={titleMap}
      xp={xp.rows.map((u) => ({ level: u.level }))}
    />
  );
}
