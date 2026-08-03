"use client";

import { useEffect, useState } from "react";

export type Language = "zh" | "en";
export type Theme = "system" | "light" | "dark";

const preferenceEvent = "dream-space-preference-change";

export function usePreferences() {
  const [language, setLanguageState] = useState<Language>("zh");
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("dream-space-language");
    const savedTheme = window.localStorage.getItem("dream-space-theme");
    if (savedLanguage === "zh" || savedLanguage === "en") {
      setLanguageState(savedLanguage);
    }
    if (savedTheme === "system" || savedTheme === "light" || savedTheme === "dark") {
      setThemeState(savedTheme);
    }

    const handlePreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ language: Language; theme: Theme }>).detail;
      setLanguageState(detail.language);
      setThemeState(detail.theme);
    };
    window.addEventListener(preferenceEvent, handlePreferenceChange);
    return () => window.removeEventListener(preferenceEvent, handlePreferenceChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const setLanguage = (nextLanguage: Language) => {
    setLanguageState(nextLanguage);
    window.localStorage.setItem("dream-space-language", nextLanguage);
    document.documentElement.lang = nextLanguage === "zh" ? "zh-CN" : "en";
    window.dispatchEvent(
      new CustomEvent(preferenceEvent, { detail: { language: nextLanguage, theme } }),
    );
  };

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
    window.localStorage.setItem("dream-space-theme", nextTheme);
    window.dispatchEvent(
      new CustomEvent(preferenceEvent, { detail: { language, theme: nextTheme } }),
    );
  };

  return { language, setLanguage, theme, setTheme };
}
