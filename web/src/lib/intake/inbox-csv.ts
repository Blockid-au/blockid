// Scored-inbox CSV (G14 S35) — same conventions as the cohort export
// (lib/evaluations/batch-shared.ts): UTF-8 BOM + CRLF + RFC 4180 quoting +
// the formula-injection guard in `csvCell`. Pure; no I/O.

import { CSV_BOM, csvCell } from "@/lib/evaluations/batch-shared";
import { DIM_KEYS, coverageSummary } from "@/lib/pitchdeck/coverage";
import type { InboxRow, ProgramIntake } from "./program-intakes";

export const INBOX_CSV_HEADERS = [
  "Startup",
  "Founder",
  "Founder email",
  "Website",
  "Intake",
  "Status",
  "SVI",
  "Coverage strong",
  "Coverage partial",
  "Coverage missing",
  ...DIM_KEYS.map((k) => `Coverage ${k.toUpperCase()}`),
  "Dossier",
  "Submitted",
  "Warnings",
] as const;

export function inboxCsv(rows: InboxRow[], base = "https://blockid.au"): string {
  const lines = [INBOX_CSV_HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    const summary = coverageSummary(r.coverage);
    lines.push(
      [
        r.startupName,
        r.founderName,
        r.founderEmail,
        r.website,
        r.intakeName,
        r.status,
        r.latestSvi,
        summary.strong,
        summary.partial,
        summary.missing,
        ...DIM_KEYS.map((k) => r.coverage?.[k]?.level ?? ""),
        r.dossierUrl ? `${base}${r.dossierUrl}` : "",
        r.submittedAt,
        r.warnings.join("; "),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

export function inboxCsvFilename(intake: Pick<ProgramIntake, "name" | "createdAt"> | null, now = new Date()): string {
  const slug = (intake?.name ?? "all-intakes").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "intake";
  const day = now.toISOString().slice(0, 10);
  return `intake-${slug}-${day}.csv`;
}
