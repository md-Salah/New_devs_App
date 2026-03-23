import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import esTranslations from './locales/es.json';
import frTranslations from './locales/fr.json';
import ptTranslations from './locales/pt.json';
import arTranslations from './locales/ar.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      es: { translation: esTranslations },
      fr: { translation: frTranslations },
      pt: { translation: ptTranslations },
      ar: { translation: arTranslations }
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    },
    detection: {
      order: ['cookie', 'localStorage', 'navigator'],
      caches: ['cookie']
    }
  });

export default i18n;