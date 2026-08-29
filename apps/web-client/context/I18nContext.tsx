import React, { createContext, useContext, useState, useEffect } from "react";
import { de, type Translations } from "../locales/de";
import { en } from "../locales/en";

export type Language = "de" | "en";

interface I18nContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const translations: Record<Language, Translations> = { de, en };

const I18nContext = createContext<I18nContextType>({
  lang: "de",
  setLang: () => {},
  t: de,
});

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>("de");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("ia3_sim_lang") as Language;
      if (saved === "de" || saved === "en") {
        setLangState(saved);
      }
    }
  }, []);

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== "undefined") {
      localStorage.setItem("ia3_sim_lang", newLang);
    }
  };

  const t = translations[lang] || de;

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => useContext(I18nContext);
