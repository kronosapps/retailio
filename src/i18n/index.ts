/**
 * App i18n bootstrap.
 *
 * To add a language:
 * 1. Create `locales/<code>.json` (same keys as `en.json`)
 * 2. Register it in `registry.ts`
 * 3. Restart the app — no other wiring needed for shell strings
 */
import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  isLocaleCode,
  type LocaleCode,
} from "./registry"

function readStoredLocale(): LocaleCode {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (raw && isLocaleCode(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE
}

const resources = Object.fromEntries(
  LOCALES.map((locale) => [locale.code, { translation: locale.messages }])
)

const initialLng = readStoredLocale()

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLng,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
})

function applyDocumentLang(lng: string) {
  document.documentElement.lang = lng
}

applyDocumentLang(initialLng)

i18n.on("languageChanged", (lng) => {
  applyDocumentLang(lng)
  if (isLocaleCode(lng)) {
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, lng)
    } catch {
      /* ignore */
    }
  }
})

export default i18n
export {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_STORAGE_KEY,
  isLocaleCode,
  type LocaleCode,
} from "./registry"
