// GET /api/dataroom/sbom
//
// Emits a Software Bill of Materials for BlockID's own package-lock.json —
// closes §2 data-room items 4.9 "Third-Party Dependency Inventory" and
// 7.9 "Open-Source License Inventory". Neither slot had auto-gen wiring
// before; both are surfaced by /dashboard/data-room as founder evidence.
//
// The route is public — the lock file is already shipped in the repo and
// nothing here is user-scoped. Investors doing pre-signature diligence
// can spot-check GPL / AGPL / SSPL exposure without an account.
//
// Format: JSON by default. `?format=csv` returns a spreadsheet-friendly
// dump suitable for uploading straight into folder 7 as evidence.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildSbom, type SbomEntry } from "@/lib/dataroom/sbom";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOCKFILE_PATH = path.join(process.cwd(), "package-lock.json");

function toCsv(entries: SbomEntry[]): string {
  const header = ["name", "version", "license", "dev", "resolved"].join(",");
  const rows = entries.map((e) =>
    [
      csvCell(e.name),
      csvCell(e.version),
      csvCell(e.license),
      e.dev ? "true" : "false",
      csvCell(e.resolved ?? ""),
    ].join(","),
  );
  return [header, ...rows].join("\n");
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET(req: NextRequest): Promise<Response> {
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";

  let raw: string;
  try {
    raw = await readFile(LOCKFILE_PATH, "utf8");
  } catch (err) {
    return NextResponse.json(
      {
        error: "lockfile_unreadable",
        message: "package-lock.json not readable at repo root",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return NextResponse.json(
      {
        error: "lockfile_invalid_json",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  const sbom = buildSbom(parsed);

  if (format === "csv") {
    return new NextResponse(toCsv(sbom.entries), {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="blockid-sbom-${sbom.generated_at.slice(0, 10)}.csv"`,
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    });
  }

  return NextResponse.json(sbom, {
    status: 200,
    headers: { "cache-control": "public, max-age=300, s-maxage=300" },
  });
}
