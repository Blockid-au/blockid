"use client";

import { useLocale, type Locale } from "@/lib/use-locale";

interface LanguageToggleProps {
  /** Optional external locale + setter (when a parent already owns the state). */
  locale?: Locale;
  onChange?: (l: Locale) => void;
  className?: string;
}

export function LanguageToggle({
  locale: externalLocale,
  onChange: externalOnChange,
  className = "",
}: LanguageToggleProps) {
  const [hookLocale, hookSet] = useLocale();

  const locale = externalLocale ?? hookLocale;
  const setLocale = externalOnChange ?? hookSet;

  const options: Locale[] = ["en", "vi"];

  return (
    <div className={`inline-flex rounded-full border border-surface-300 overflow-hidden text-xs font-medium ${className}`}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => setLocale(opt)}
          className={`px-3 py-1 uppercase transition-colors ${
            locale === opt
              ? "bg-brand-500 text-white"
              : "bg-white text-ink-600 hover:bg-surface-100"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}
