// Domain types for the Driveverse organic-marketing schedule (Product build
// order + weekly content calendar + 4-week rollout + results log). Backed by
// content/marketing/schedule.json — client-safe: no server-only imports.
import type { Pillar } from "@/lib/content/types";

export interface ProductTask {
  id: string;
  week: string;
  build: string;
  why: string;
  done: boolean;
  notes: string;
}

export interface CalendarSlot {
  id: string;
  day: string;
  pillar: Pillar | null;
  format: string;
  commentSeed: boolean;
  done: boolean;
  notes: string;
}

export interface RolloutWeek {
  id: string;
  week: number;
  title: string;
  description: string;
  done: boolean;
}

export interface ChecklistStep {
  id: string;
  order: number;
  title: string;
  description: string;
}

export interface ResultsEntry {
  id: string;
  date: string; // YYYY-MM-DD
  day: string;
  pillar: Pillar | null;
  featureShown: string;
  views: number;
  downloads: number;
  organicPickup: boolean;
  seeded: boolean;
  notes: string;
  done: boolean;
}

export interface MarketingSchedule {
  updatedAt: string;
  productTasks: ProductTask[];
  contentCalendar: CalendarSlot[];
  rolloutPlan: RolloutWeek[];
  checklistSteps: ChecklistStep[];
  resultsLog: ResultsEntry[];
}

/** Sections that can be updated/added/removed via the API. checklistSteps is
 *  a fixed reference list and is intentionally excluded. */
export const MARKETING_SECTIONS = [
  "productTasks",
  "contentCalendar",
  "rolloutPlan",
  "resultsLog",
] as const;
export type MarketingSection = (typeof MARKETING_SECTIONS)[number];

export function emptySchedule(): MarketingSchedule {
  return {
    updatedAt: new Date(0).toISOString(),
    productTasks: [],
    contentCalendar: [],
    rolloutPlan: [],
    checklistSteps: [],
    resultsLog: [],
  };
}
