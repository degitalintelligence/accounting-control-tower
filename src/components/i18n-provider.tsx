"use client";

import { createContext, useContext, useMemo } from "react";
import { createTranslator, type AppLocale, type MessageKey } from "@/lib/i18n";

const I18nContext = createContext<{ locale: AppLocale; t: (key: MessageKey) => string }>({
  locale: "id-ID",
  t: createTranslator("id-ID"),
});

export function I18nProvider({ locale, children }: { locale: AppLocale; children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, t: createTranslator(locale) }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
