import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, ChevronDown } from 'lucide-react';

const languages = [
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh', name: '中文 (Chinese)', flag: '🇨🇳' },
  { code: 'ko', name: '한국어 (Korean)', flag: '🇰🇷' }
];

export const LanguageSelector = ({ dark = false }) => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (code) => {
    i18n.changeLanguage(code);
    localStorage.setItem('app_language', code);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative z-50 font-sans" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all duration-200 border text-sm font-medium shadow-sm hover:shadow-md cursor-pointer active:scale-95 ${
          dark
            ? 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700 hover:border-slate-600'
            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
        }`}
      >
        <span className="text-base" role="img" aria-label={currentLanguage.name}>
          {currentLanguage.flag}
        </span>
        <span className="hidden md:inline text-xs font-semibold tracking-wide">
          {currentLanguage.name}
        </span>
        <span className="md:hidden text-xs font-bold uppercase tracking-wider">
          {currentLanguage.code}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div
          className={`absolute right-0 mt-2 w-52 rounded-2xl shadow-xl border overflow-hidden animate-in fade-in zoom-in-95 duration-150 origin-top-right ${
            dark
              ? 'bg-slate-800 border-slate-700 text-slate-100'
              : 'bg-white border-slate-100 text-slate-700'
          }`}
        >
          <div className={`p-2.5 text-[10px] font-bold uppercase tracking-wider border-b ${dark ? 'border-slate-700/50 text-slate-400' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>
            Select Language / 选择语言 / 언어 선택
          </div>
          <div className="p-1.5 space-y-1">
            {languages.map((lang) => {
              const isActive = i18n.language === lang.code;
              return (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition-all duration-150 cursor-pointer ${
                    isActive
                      ? dark
                        ? 'bg-blue-600 text-white'
                        : 'bg-blue-50 text-blue-700'
                      : dark
                        ? 'hover:bg-slate-700 text-slate-200'
                        : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-lg" role="img" aria-label={lang.name}>
                    {lang.flag}
                  </span>
                  <span className="flex-1 text-xs tracking-wide">{lang.name}</span>
                  {isActive && (
                    <span className={`w-1.5 h-1.5 rounded-full ${dark ? 'bg-white' : 'bg-blue-600'}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
