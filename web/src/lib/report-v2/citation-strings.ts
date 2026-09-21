// citation-strings — G24-A: the EN / VI copy for footnote citations and the
// "Evidence cited" appendix, read from the message catalogues
// (`lib/i18n/messages/{en,vi}.json`, keys `tbr.citations.*`). ES / JA
// documents read the English copy, as every other ReportV2 label does.
// Evidence-level and source names reuse the S43 tables so the appendix
// says "transaction data" / "Stripe (revenue)" exactly as the chapters do.

import { getMessagesSync, t } from "@/lib/i18n/t";
import { getTbrS43Strings } from "@/lib/i18n/tbr-strings";
import type { CitationEntry } from "./citations";

export interface CitationStrings {
  appendixTitle: string;
  appendixPurpose: string;
  th: { n: string; label: string; level: string; source: string; date: string };
  levelUnrated: string;
  noDate: string;
  citeTitle: (n: number, label: string) => string;
  citeAria: (n: number, label: string) => string;
  unverified: string;
  unverifiedTitle: string;
  /** Localised evidence level for an appendix row ("transaction data" / "not rated"). */
  level: (entry: Pick<CitationEntry, "level">) => string;
  /** Localised source kind ("Stripe (revenue)"). */
  source: (entry: Pick<CitationEntry, "source">) => string;
  status: (entry: Pick<CitationEntry, "status">) => string;
  date: (entry: Pick<CitationEntry, "observedAt">) => string;
}

const fill = (s: string, n: number, label: string) => s.replace("{n}", String(n)).replace("{label}", label);

export function citationStrings(locale: string | undefined): CitationStrings {
  const loc = locale === "vi" ? "vi" : "en";
  const m = getMessagesSync(loc);
  const s43 = getTbrS43Strings(loc);
  const k = (key: string) => t(m, `tbr.citations.${key}`);
  return {
    appendixTitle: k("appendixTitle"),
    appendixPurpose: k("appendixPurpose"),
    th: { n: k("th.n"), label: k("th.label"), level: k("th.level"), source: k("th.source"), date: k("th.date") },
    levelUnrated: k("levelUnrated"),
    noDate: k("noDate"),
    citeTitle: (n, label) => fill(k("citeTitle"), n, label),
    citeAria: (n, label) => fill(k("citeAria"), n, label),
    unverified: k("unverified"),
    unverifiedTitle: k("unverifiedTitle"),
    level: (e) => (e.level ? s43.evidenceLevel[e.level] : k("levelUnrated")),
    source: (e) => s43.source[e.source] ?? e.source,
    status: (e) => k(`status.${e.status}`),
    date: (e) => e.observedAt ?? k("noDate"),
  };
}
