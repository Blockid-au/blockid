// Colocated vitest for lib/intake/inbox-csv.ts (G14 S35): header row,
// BOM + CRLF, the formula guard on attacker-controlled cells (startup name,
// founder name, website), RFC 4180 quoting, bare numbers, and the filename.

import { describe, expect, it } from "vitest";
import { CSV_BOM } from "@/lib/evaluations/batch-shared";
import { INBOX_CSV_HEADERS, inboxCsv, inboxCsvFilename } from "./inbox-csv";
import type { InboxRow } from "./program-intakes";

function row(over: Partial<InboxRow> = {}): InboxRow {
  return {
    id: "sub-1",
    intakeId: "intake-1",
    evaluationId: "ev-1",
    projectId: "proj-1",
    founderEmail: "ann@alpha.io",
    founderName: "Ann",
    startupName: "Alpha",
    website: "https://alpha.io",
    deckStoragePath: "/tmp/x.pdf",
    pitchdeckAnalysisId: null,
    status: "scored",
    sviTotal: 60,
    coverage: { ftv: { level: "strong" }, mpc: { level: "partial" } },
    warnings: [],
    submittedAt: "2026-09-16T10:00:00.000Z",
    intakeName: "Demo Program",
    intakeSlug: "demo-program-abcdefgh",
    latestSvi: 71.4,
    dossierUrl: "/workspace/evaluations/ev-1",
    ...over,
  };
}

describe("inboxCsv", () => {
  it("BOM + header + CRLF, dossier link absolute, latest SVI bare, coverage summary + per-dim", () => {
    const csv = inboxCsv([row()], "https://blockid.au");
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(INBOX_CSV_HEADERS.join(","));
    expect(lines[1]).toContain("Alpha,Ann,ann@alpha.io,https://alpha.io,Demo Program,scored,71.4,1,1,6,strong,partial,,,,,,,https://blockid.au/workspace/evaluations/ev-1,2026-09-16T10:00:00.000Z,");
    expect(lines[2]).toBe("");
  });

  it("neutralises formula cells and quotes commas / quotes (RFC 4180)", () => {
    const csv = inboxCsv([
      row({ startupName: "=HYPERLINK(\"http://evil\")", founderName: "+cmd", website: "-1", intakeName: 'Say "hi", team', warnings: ["@x"] }),
    ]);
    const line = csv.split("\r\n")[1]!;
    expect(line).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(line).toContain(",'+cmd,");
    expect(line).toContain(",'-1,");
    expect(line).toContain(`"Say ""hi"", team"`);
    expect(line.endsWith(",'@x")).toBe(true);
  });

  it("filename from the intake name or all-intakes", () => {
    const now = new Date("2026-09-16T00:00:00Z");
    expect(inboxCsvFilename({ name: "Demo Program!", createdAt: "" }, now)).toBe("intake-demo-program-2026-09-16.csv");
    expect(inboxCsvFilename(null, now)).toBe("intake-all-intakes-2026-09-16.csv");
  });
});
