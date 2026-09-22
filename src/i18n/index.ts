// i18n system for Vision Studio

import { useEditorStore } from "../state/store";
import { en } from "./en";
import { ar } from "./ar";

export type Language = "en" | "ar";

export const LANGUAGES: Language[] = ["en", "ar"];

export const DEFAULT_LANGUAGE: Language = "en";

// Language labels for UI
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  ar: "العربية",
};

// Translation function
// Usage: t("menu.file") returns the translated string
export function t(key: string, language?: Language): string {
  const lang = language ?? useEditorStore.getState().language ?? DEFAULT_LANGUAGE;
  const dict = lang === "ar" ? ar : en;
  return (dict as Record<string, string>)[key] ?? key;
}

// Get current language
export const getLanguage = (): Language =>
  useEditorStore.getState().language === "ar" ? "ar" : DEFAULT_LANGUAGE;

// Set language (persisted via store)
export const setLanguage = (lang: Language): void => {
  // Will be persisted by the store
  // This is called from the language selector
};

// Direction based on language
export const getDirection = (): "ltr" | "rtl" =>
  useEditorStore.getState().language === "ar" ? "rtl" : "ltr";

// Get language label
export const getLanguageLabel = (lang: Language): string => LANGUAGE_LABELS[lang] ?? lang;