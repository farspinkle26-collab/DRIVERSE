import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useCallback, useEffect, useState } from "react";

export type SpeedUnit = "kmh" | "mph";

export interface AppLanguage {
  code: string;
  /** Native name, shown to the user */
  label: string;
  /** English name, for reference */
  english: string;
  flag: string;
}

export const LANGUAGES: AppLanguage[] = [
  { code: "en", label: "English", english: "English", flag: "🇬🇧" },
  { code: "id", label: "Bahasa Indonesia", english: "Indonesian", flag: "🇮🇩" },
  { code: "es", label: "Español", english: "Spanish", flag: "🇪🇸" },
  { code: "ja", label: "日本語", english: "Japanese", flag: "🇯🇵" },
  { code: "de", label: "Deutsch", english: "German", flag: "🇩🇪" },
  { code: "fr", label: "Français", english: "French", flag: "🇫🇷" },
  { code: "zh", label: "中文", english: "Chinese", flag: "🇨🇳" },
  { code: "ar", label: "العربية", english: "Arabic", flag: "🇸🇦" },
];

const LANG_KEY = "pref.language";
const UNIT_KEY = "pref.speedUnit";
const KM_TO_MI = 0.621371;

export const [PreferencesContext, usePreferences] = createContextHook(() => {
  const [language, setLanguageState] = useState<string>("en");
  const [speedUnit, setSpeedUnitState] = useState<SpeedUnit>("kmh");
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const [lang, unit] = await Promise.all([
          AsyncStorage.getItem(LANG_KEY),
          AsyncStorage.getItem(UNIT_KEY),
        ]);
        if (lang && LANGUAGES.some((l) => l.code === lang)) setLanguageState(lang);
        if (unit === "kmh" || unit === "mph") setSpeedUnitState(unit);
      } catch (err) {
        console.error("Failed to load preferences:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const setLanguage = useCallback(async (code: string) => {
    setLanguageState(code);
    try {
      await AsyncStorage.setItem(LANG_KEY, code);
    } catch (err) {
      console.error("Failed to save language:", err);
    }
  }, []);

  const setSpeedUnit = useCallback(async (unit: SpeedUnit) => {
    setSpeedUnitState(unit);
    try {
      await AsyncStorage.setItem(UNIT_KEY, unit);
    } catch (err) {
      console.error("Failed to save speed unit:", err);
    }
  }, []);

  const isMph = speedUnit === "mph";
  const speedUnitLabel = isMph ? "mph" : "km/h";
  const distanceUnitLabel = isMph ? "mi" : "km";

  /** Convert a km/h value into the user's chosen unit. */
  const convertSpeed = useCallback(
    (kmh: number) => (isMph ? kmh * KM_TO_MI : kmh),
    [isMph]
  );

  /** Convert a kilometre value into the user's chosen distance unit. */
  const convertDistance = useCallback(
    (km: number) => (isMph ? km * KM_TO_MI : km),
    [isMph]
  );

  const currentLanguage =
    LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return {
    language,
    currentLanguage,
    speedUnit,
    isMph,
    loading,
    setLanguage,
    setSpeedUnit,
    speedUnitLabel,
    distanceUnitLabel,
    convertSpeed,
    convertDistance,
  };
});
