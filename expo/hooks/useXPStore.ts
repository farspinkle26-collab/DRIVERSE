import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState, useCallback } from "react";

// XP required per level: L1=100, L2=250, L3=500, L4=1000, L5=1800, L6=3000...
function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.6, level - 1));
}

function totalXpForLevel(level: number): number {
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += xpForLevel(i);
  }
  return total;
}

interface XPState {
  level: number;
  xp: number;
  totalXp: number;
}

const INITIAL_STATE: XPState = { level: 1, xp: 0, totalXp: 0 };

export const [XPProvider, useXP] = createContextHook(() => {
  const [state, setState] = useState<XPState>(INITIAL_STATE);
  const [loading, setLoading] = useState(true);

  // Load from storage on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("driveverse_xp");
        if (raw) {
          const parsed = JSON.parse(raw) as XPState;
          setState(parsed);
        }
      } catch {
        // Use defaults
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Persist on change
  const persist = useCallback(async (s: XPState) => {
    try {
      await AsyncStorage.setItem("driveverse_xp", JSON.stringify(s));
    } catch {
      // Silent
    }
  }, []);

  const addXP = useCallback(
    (amount: number): number => {
      let { level: newLevel, xp: newXp, totalXp: newTotalXp } = state;
      newTotalXp += amount;
      newXp += amount;

      while (newXp >= xpForLevel(newLevel)) {
        newXp -= xpForLevel(newLevel);
        newLevel++;
      }

      const next: XPState = { level: newLevel, xp: newXp, totalXp: newTotalXp };
      persist(next);
      setState(next);
      return newLevel;
    },
    [state, persist]
  );

  const xpCurrentLevel = state.xp;
  const xpRequired = xpForLevel(state.level);
  const xpProgress = xpRequired > 0 ? state.xp / xpRequired : 1;

  return {
    level: state.level,
    xp: state.xp,
    totalXp: state.totalXp,
    xpCurrentLevel,
    xpRequired,
    xpProgress,
    loading,
    addXP,
  };
});
