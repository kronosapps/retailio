/**
 * Locale registry.
 * To add a language: create `locales/<code>.json` and register it here.
 */
import en from "./locales/en.json"
import te from "./locales/te.json"

export type LocaleCode = "en" | "te"

export type LocaleDefinition = {
  code: LocaleCode
  /** Name in that language */
  nativeName: string
  /** English label for settings lists */
  englishName: string
  messages: Record<string, unknown>
}

export const LOCALES: LocaleDefinition[] = [
  {
    code: "en",
    nativeName: "English",
    englishName: "English",
    messages: en as Record<string, unknown>,
  },
  {
    code: "te",
    nativeName: "తెలుగు",
    englishName: "Telugu",
    messages: te as Record<string, unknown>,
  },
]

export const DEFAULT_LOCALE: LocaleCode = "en"
export const LOCALE_STORAGE_KEY = "retailos.locale"

export const LOCALE_MAP: Record<LocaleCode, LocaleDefinition> = Object.fromEntries(
  LOCALES.map((locale) => [locale.code, locale])
) as Record<LocaleCode, LocaleDefinition>

export function isLocaleCode(value: string): value is LocaleCode {
  return value in LOCALE_MAP
}
