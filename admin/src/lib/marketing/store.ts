import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { contentDir } from "@/lib/content/paths";
import { emptySchedule, type MarketingSchedule, type MarketingSection } from "./types";

function schedulePath(): string {
  return path.join(contentDir(), "marketing", "schedule.json");
}

export async function readSchedule(): Promise<MarketingSchedule> {
  try {
    const raw = await fs.readFile(schedulePath(), "utf8");
    return { ...emptySchedule(), ...(JSON.parse(raw) as Partial<MarketingSchedule>) };
  } catch {
    return emptySchedule();
  }
}

export async function writeSchedule(data: MarketingSchedule): Promise<void> {
  await fs.mkdir(path.dirname(schedulePath()), { recursive: true });
  const next: MarketingSchedule = { ...data, updatedAt: new Date().toISOString() };
  await fs.writeFile(schedulePath(), JSON.stringify(next, null, 2) + "\n", "utf8");
}

/** Merge `patch` into the item with this `id` in `section`. Returns the
 *  updated item, or null if no item with that id exists. */
export async function updateItem(
  section: MarketingSection,
  id: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
  const data = await readSchedule();
  const list = data[section] as unknown as Record<string, unknown>[];
  const idx = list.findIndex((x) => x.id === id);
  if (idx === -1) return null;
  list[idx] = { ...list[idx], ...patch, id };
  await writeSchedule(data);
  return list[idx];
}

/** Append a new item (with a generated id) to `section`. Only used for the
 *  results log — the plan sections (product tasks / calendar / rollout) are a
 *  fixed structure that only supports field edits, not row add/remove. */
export async function addItem(
  section: MarketingSection,
  item: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const data = await readSchedule();
  const id = `${section}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const withId = { ...item, id };
  (data[section] as unknown as Record<string, unknown>[]).push(withId);
  await writeSchedule(data);
  return withId;
}

export async function deleteItem(section: MarketingSection, id: string): Promise<void> {
  const data = await readSchedule();
  const list = data[section] as unknown as Record<string, unknown>[];
  (data as unknown as Record<MarketingSection, Record<string, unknown>[]>)[section] = list.filter(
    (x) => x.id !== id,
  );
  await writeSchedule(data);
}
