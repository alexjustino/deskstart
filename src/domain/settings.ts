/**
 * The settings a person chooses, as data (F10).
 *
 * Kept the way a profile is: read by one function that never throws, with a
 * known default for anything missing or unreadable. A settings row from a
 * newer version — a key this build does not know, a value it does not accept —
 * falls back to the default rather than breaking the screen, because a setting
 * is a convenience and a broken screen is not.
 *
 * There is one setting today, the theme. The shape is a map so the second one
 * is a key, not a rewrite.
 */

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEMES)[number];

/** The languages the manual is written in (1.1). The interface stays English. */
export const MANUAL_LANGUAGES = ['en', 'pt-BR'] as const;
export type ManualLanguage = (typeof MANUAL_LANGUAGES)[number];

export interface Settings {
  theme: ThemeChoice;
  /** The manual's language; null until a person chooses, when the system's is used. */
  manualLanguage: ManualLanguage | null;
}

export const DEFAULT_SETTINGS: Settings = { theme: 'system', manualLanguage: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a stored settings map — `{ theme: "dark" }` — into a whole `Settings`,
 * every key defaulted. Anything the reader does not recognise is left at its
 * default and not carried forward.
 */
export function readSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  const theme = value.theme;
  const manualLanguage = value.manualLanguage;
  return {
    theme: (THEMES as readonly unknown[]).includes(theme)
      ? (theme as ThemeChoice)
      : DEFAULT_SETTINGS.theme,
    manualLanguage: (MANUAL_LANGUAGES as readonly unknown[]).includes(manualLanguage)
      ? (manualLanguage as ManualLanguage)
      : null,
  };
}

/** What each manual language is called, in itself. */
export const MANUAL_LANGUAGE_LABELS: Record<ManualLanguage, string> = {
  en: 'English',
  'pt-BR': 'Português (Brasil)',
};

/** What a setting is called on screen. */
export const THEME_LABELS: Record<ThemeChoice, string> = {
  system: 'Match Windows',
  light: 'Light',
  dark: 'Dark',
};
