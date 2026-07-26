/**
 * Driveverse — the early-access gate.
 *
 * One hook, used by every feature that wants "Platinum gets it first". The
 * feature itself contains no Platinum logic:
 *
 *   const showcase = useEarlyAccess("ai-showcase");
 *   if (!showcase.enabled) {
 *     return <PlatinumLockedRow ... onPress={showcase.promptUpgrade} />;
 *   }
 *
 * When the flag graduates to `stage: "everyone"` in
 * `constants/earlyAccess.ts`, `enabled` becomes true for all drivers and the
 * feature's own code never changes.
 */

import { useCallback, useMemo } from "react";
import {
  isEarlyAccessUpsell,
  isFeatureEnabled,
  resolveStage,
  type EarlyAccessStage,
} from "@/constants/earlyAccess";
import { usePlatinum } from "@/hooks/usePlatinumStore";

export interface EarlyAccessGate {
  /** Render the feature. */
  enabled: boolean;
  stage: EarlyAccessStage;
  /**
   * True when the feature exists, is Platinum-gated, and this driver isn't
   * Platinum — the only case where an upsell is honest. A flag that is `off`
   * for everyone must NOT advertise itself as a Platinum perk.
   */
  showUpsell: boolean;
  /** Raises the paywall pinned to the Early Access row. */
  promptUpgrade: () => void;
}

export function useEarlyAccess(featureId: string): EarlyAccessGate {
  const { isPlatinum, openPaywall } = usePlatinum();

  const promptUpgrade = useCallback(
    () => openPaywall("earlyAccess"),
    [openPaywall]
  );

  return useMemo(
    () => ({
      enabled: isFeatureEnabled(featureId, isPlatinum),
      stage: resolveStage(featureId),
      showUpsell: isEarlyAccessUpsell(featureId, isPlatinum),
      promptUpgrade,
    }),
    [featureId, isPlatinum, promptUpgrade]
  );
}

export default useEarlyAccess;
