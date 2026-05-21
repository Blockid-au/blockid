"use client";

import { useLocale, type Locale } from "@/lib/use-locale";

const FLAGS: Record<Locale, { emoji: string; short: string; label: string }> = {
  en: { emoji: "🇦🇺", short: "EN", label: "English" },
  vi: { emoji: "🇻🇳", short: "VI", label: "Tiếng Việt" },
};

interface LanguageToggleProps {
  locale?: Locale;
  onChange?: (l: Locale) => void;
  /** "pill" = flag + code side-by-side, "icon" = flag only with tooltip */
  variant?: "pill" | "icon";
  className?: string;
}

export function LanguageToggle({
  locale: externalLocale,
  onChange: externalOnChange,
  variant = "pill",
  className = "",
}: LanguageToggleProps) {
  const [hookLocale, hookSet] = useLocale();

  const locale = externalLocale ?? hookLocale;
  const setLocale = externalOnChange ?? hookSet;

  const options: Locale[] = ["en", "vi"];

  if (variant === "icon") {
    const next: Locale = locale === "en" ? "vi" : "en";
    const current = FLAGS[locale];
    const nextFlag = FLAGS[next];
    return (
      <button
        type="button"
        title={`Switch to ${nextFlag.label}`}
        aria-label={`Switch to ${nextFlag.label}`}
        onClick={() => setLocale(next)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors ${className}`}
      >
        <span className="text-base leading-none">{current.emoji}</span>
        <span className="text-xs font-semibold">{current.short}</span>
      </button>
    );
  }

  return (
    <div className={`inline-flex rounded-full border border-surface-300 overflow-hidden text-xs font-medium ${className}`}>
      {options.map((opt) => {
        const f = FLAGS[opt];
        return (
          <button
            key={opt}
            type="button"
            title={f.label}
            aria-label={f.label}
            onClick={() => setLocale(opt)}
            className={`inline-flex items-center gap-1 px-3 py-1.5 transition-colors ${
              locale === opt
                ? "bg-brand-500 text-white"
                : "bg-white text-ink-600 hover:bg-surface-100"
            }`}
          >
            <span className="text-sm leading-none">{f.emoji}</span>
            <span>{f.short}</span>
          </button>
        );
      })}
    </div>
  );
}
