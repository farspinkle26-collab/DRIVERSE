import { readAllPosts, readAccount, readWhatWorks } from "@/lib/content/store";
import { computeStrategy } from "@/lib/content/strategy";
import { ContentClient } from "./ContentClient";

// Server component: read the git-committed content store (Markdown posts,
// account.json, what-works.md) at request time and hand serializable data to
// the client, which recomputes analytics instantly as filters change.
export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const [posts, account, whatWorks] = await Promise.all([
    readAllPosts(),
    readAccount(),
    readWhatWorks(),
  ]);

  // Deterministic strategy on load (no model call — fast + offline-safe). The
  // Insights tab can request the richer AI narrative on demand.
  const strategyCore = computeStrategy(posts);
  const strategy = { ...strategyCore, narrative: deterministic(strategyCore) };

  return (
    <ContentClient
      posts={posts}
      account={account}
      whatWorks={whatWorks}
      strategy={strategy}
      generatedAt={new Date().toISOString()}
    />
  );
}

function deterministic(s: ReturnType<typeof computeStrategy>): string {
  const lines = [s.headline + "."];
  for (const r of s.pillars) lines.push(`• ${r.label} — ${r.verdict}: ${r.reason}`);
  if (s.testSlot) lines.push(`• Scheduling test: ${s.testSlot.note}`);
  return lines.join("\n");
}
