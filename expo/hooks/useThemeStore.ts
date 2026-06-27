import AsyncStorage from "@react-native-async-storage/async-storage";
import createContextHook from "@nkzw/create-context-hook";
import { useEffect, useState } from "react";
import { lightTheme, darkTheme } from "@/constants/colors";

type Theme = typeof lightTheme;
type ThemeMode = "light" | "dark";

export const [ThemeContext, useTheme] = createContextHook(() => {
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [loading, setLoading] = useState<boolean>(true);

  const theme: Theme = themeMode === "dark" ? darkTheme : lightTheme;

  useEffect(() => {
    const loadTheme = async () => {
      try {
        const storedTheme = await AsyncStorage.getItem("themeMode");
        if (storedTheme && (storedTheme === "light" || storedTheme === "dark")) {
          setThemeMode(storedTheme);
        }
      } catch (err) {
        console.error("Failed to load theme:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTheme();
  }, []);

  const toggleTheme = async () => {
    try {
      const newTheme = themeMode === "light" ? "dark" : "light";
      setThemeMode(newTheme);
      await AsyncStorage.setItem("themeMode", newTheme);
    } catch (err) {
      console.error("Failed to save theme:", err);
    }
  };

  const setTheme = async (mode: ThemeMode) => {
    try {
      setThemeMode(mode);
      await AsyncStorage.setItem("themeMode", mode);
    } catch (err) {
      console.error("Failed to save theme:", err);
    }
  };

  return {
    theme,
    themeMode,
    loading,
    toggleTheme,
    setTheme,
    isDark: themeMode === "dark",
    isLight: themeMode === "light",
  };
});