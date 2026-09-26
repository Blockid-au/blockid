"use client";

// DataPurposeNote — G34 DC10. One short purpose line + a privacy-policy link
// at every user-data capture point, and (optionally) the visible autosave
// state of a form that already keeps a draft. Display only: it records no
// consent and adds no persistence.
//
// Locale: an explicit `locale` prop wins; otherwise the `blockid_lang`
// cookie (useLocale — server snapshot "en", so SSR and hydration agree).

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/use-locale";
import {
  dataPurposeCopy,
  type DataPurposeContext,
  type DataPurposeLocale,
  type SaveState,
} from "@/lib/privacy/data-purpose-copy";

export interface DataPurposeNoteProps {
  context?: DataPurposeContext;
  locale?: DataPurposeLocale;
  /** Autosave status to surface after the line; omit when the form keeps no draft. */
  saveState?: SaveState;
  className?: string;
  testId?: string;
}

export function DataPurposeNote({
  context = "analysis",
  locale,
  saveState,
  className,
  testId = "data-purpose-note",
}: DataPurposeNoteProps) {
  const [cookieLocale] = useLocale();
  const copy = dataPurposeCopy(locale ?? cookieLocale);
  return (
    <p className={cn("text-xs leading-relaxed text-tertiary", className)} data-testid={testId}>
      <span>{copy[context]}</span>{" "}
      <Link href={copy.privacyHref} className="font-medium text-action underline-offset-2 hover:underline">
        {copy.privacyLink}
      </Link>
      {saveState !== undefined ? (
        <span
          role="status"
          aria-live="polite"
          className={cn("ml-2 inline-block font-medium", saveState === "unsaved" ? "text-warn" : "text-secondary")}
          data-testid={`${testId}-save`}
          data-save-state={saveState}
        >
          · {copy.save[saveState]}
        </span>
      ) : null}
    </p>
  );
}

export default DataPurposeNote;
