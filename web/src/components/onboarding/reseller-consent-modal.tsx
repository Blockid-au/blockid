"use client";

// APP 5.2 collection-notice modal — shown the moment a reseller code is
// validated. Text lives in web/src/lib/reseller/consent-notice.ts (pure
// module so the P10 au-compliance test suite can audit APP 5.2 (a)–(j)
// coverage without dragging this "use client" component through vitest).
//
// Consumers wire this via reseller-code-field.tsx onValidated callback:
//   const [consent, setConsent] = useState<Consent | null>(null);
//   <ResellerCodeField onValidated={(p) => setConsent({ ... p })} .../>
//   {consent && (
//     <ResellerConsentModal
//        locale={locale}
//        resellerName={consent.reseller.display_name}
//        onAccept={() => { setConsent(null); ... }}
//        onDecline={() => { setConsent(null); clearVia(); ... }}
//     />
//   )}

import { useEffect, useRef } from "react";

import {
  CONSENT_NOTICE_STRINGS,
  type ConsentNoticeLocale,
} from "@/lib/reseller/consent-notice";

interface Props {
  locale?: ConsentNoticeLocale;
  resellerName: string;
  onAccept: () => void;
  onDecline: () => void;
}

export function ResellerConsentModal({ locale = "en", resellerName, onAccept, onDecline }: Props) {
  const t = CONSENT_NOTICE_STRINGS[locale];
  const acceptRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    acceptRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDecline();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDecline]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reseller-consent-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-2xl">
        <h2 id="reseller-consent-title" className="text-lg font-semibold text-ink-900">
          {t.title}
        </h2>
        <p className="mt-3 max-h-[60vh] overflow-y-auto text-sm leading-relaxed text-ink-700">
          {t.body(resellerName)}
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onDecline}
            className="rounded-md border border-surface-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-surface-100"
          >
            {t.decline}
          </button>
          <button
            ref={acceptRef}
            type="button"
            onClick={onAccept}
            className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
