import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import translationID from './locales/id/translation.json';
import translationEN from './locales/en/translation.json';
import translationZH from './locales/zh/translation.json';
import translationKO from './locales/ko/translation.json';

const resources = {
  id: {
    translation: translationID
  },
  en: {
    translation: translationEN
  },
  zh: {
    translation: translationZH
  },
  ko: {
    translation: translationKO
  }
};

// Retrieve language from localStorage or default to 'id'
const savedLanguage = localStorage.getItem('app_language') || 'id';

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage,
    fallbackLng: 'en', // requested fallback language is English
    interpolation: {
      escapeValue: false // react already safes from xss
    }
  });

export default i18n;
