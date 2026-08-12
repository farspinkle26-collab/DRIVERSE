/**
 * Driveverse — the Main Quest's pure rules.
 *
 * Everything here is a function of one input: the set of step ids this
 * driver has already completed (`user_main_quests`, loaded by
 * `hooks/useMainQuestStore.ts`). No React, no Supabase — split out for the
 * same reason `lib/questRing.ts` is split from the Quests tab: the ordering,
 * the "what do I show them next" rule and the homepage nudge condition are
 * the parts worth testing, and a test runner should not have to load React
 * Native to check them.
 *
 * The catalogue itself is `constants/mainQuests.ts`; read that file's header
 * first — in particular, why the capstone waits on the whole chain rather
 * than on the level alone.
 */

import {
  CAPSTONE_STEP_ID,
  MAIN_QUEST_STEPS,
  REQUIRED_STEP_IDS,
  type MainQuestStep,
  type MainQuestStepId,
} from "@/constants/mainQuests";

/** A step plus where the driver stands on it. */
export interface MainQuestStepState {
  step: MainQuestStep;
  done: boolean;
  /**
   * The one step the UI points at: the first incomplete, non-optional step.
   * Exactly one step in the list has this, or none once the chain is done.
   */
  current: boolean;
}

export interface MainQuestState {
  steps: MainQuestStepState[];
  /** The step to nudge the driver toward, or `null` when there is nothing left. */
  next: MainQuestStep | null;
  /** Completed steps, counting the optional one if they did it. */
  completed: number;
  /** Every step in the chain, optional included — the denominator the UI shows. */
  total: number;
  /** 0–1, for a progress bar. */
  ratio: number;
  /** The capstone is done: the chain is finished. */
  allComplete: boolean;
}

/**
 * The whole chain's state from the set of completed ids.
 *
 * `completedIds` is deliberately a plain array rather than a Set so callers
 * can hand it straight from a Supabase result without ceremony; it is small
 * and fixed (eight ids at most), so the lookup cost is irrelevant.
 */
export function mainQuestState(completedIds: readonly string[]): MainQuestState {
  const done = new Set(completedIds);

  // The step the UI points at is the first incomplete REQUIRED step —
  // never the optional one. "Send a friend request" cannot be the thing the
  // homepage nags about when there may be nobody within a hundred miles to
  // send it to; it is shown in the list, and it pays out when it happens,
  // but it is not what the chain is waiting on.
  const nextStep =
    MAIN_QUEST_STEPS.find((s) => !s.optional && !done.has(s.id)) ?? null;

  const steps: MainQuestStepState[] = MAIN_QUEST_STEPS.map((step) => ({
    step,
    done: done.has(step.id),
    current: nextStep != null && step.id === nextStep.id,
  }));

  return {
    steps,
    next: nextStep,
    completed: MAIN_QUEST_STEPS.filter((s) => done.has(s.id)).length,
    total: MAIN_QUEST_STEPS.length,
    ratio: MAIN_QUEST_STEPS.length
      ? MAIN_QUEST_STEPS.filter((s) => done.has(s.id)).length / MAIN_QUEST_STEPS.length
      : 0,
    allComplete: done.has(CAPSTONE_STEP_ID),
  };
}

/**
 * Whether the capstone's non-level half is satisfied — every required step
 * done. The level check itself is the database's (`user_xp.level >= 2`);
 * this is the same predicate restated on the client so the UI can explain
 * *why* the last step has not fired yet rather than leaving it looking
 * stuck.
 */
export function capstoneUnlocked(completedIds: readonly string[]): boolean {
  const done = new Set(completedIds);
  return REQUIRED_STEP_IDS.every((id) => done.has(id));
}

/**
 * Whether the homepage shows its "you have a main quest going" notification.
 *
 * Three conditions, and the third is the one that matters: **the driver has
 * to be signed in and their progress actually loaded.** Before the first
 * fetch resolves, `completedIds` is an empty array, which is indistinguishable
 * from a brand-new account with nothing done — so a nudge driven off the
 * array alone would flash on every cold start for drivers who finished the
 * chain months ago. `loaded` is what tells those two apart.
 */
export function shouldNudge(args: {
  signedIn: boolean;
  loaded: boolean;
  completedIds: readonly string[];
}): boolean {
  if (!args.signedIn || !args.loaded) return false;
  return !mainQuestState(args.completedIds).allComplete;
}

/** "3 / 8" — the count shown beside the chain's progress bar. */
export function mainQuestProgressLabel(state: MainQuestState): string {
  return `${state.completed} / ${state.total}`;
}

/** Total XP the chain pays out if every step is finished, optional included. */
export function totalChainXp(): number {
  return MAIN_QUEST_STEPS.reduce((sum, s) => sum + s.xp, 0);
}

/** The XP still unclaimed, for the "keep going" line. */
export function remainingChainXp(completedIds: readonly string[]): number {
  const done = new Set(completedIds);
  return MAIN_QUEST_STEPS.filter((s) => !done.has(s.id)).reduce(
    (sum, s) => sum + s.xp,
    0
  );
}

/** Narrow an arbitrary string from the database back onto the catalogue. */
export function isMainQuestStepId(value: string): value is MainQuestStepId {
  return MAIN_QUEST_STEPS.some((s) => s.id === value);
}
