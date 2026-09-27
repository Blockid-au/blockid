// /api/og/svi — the share-card PNG. 27/09 health sweep: every request 502'd
// because the stage badge was a non-flex <div> with several text children
// (`{stageLabel} — Stage {stage}`), which Satori rejects with "Expected <div>
// to have explicit display: flex …". The error only surfaces while the PNG
// body streams, so this test reads the whole body — a 200 status alone would
// not have caught it.

import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

async function render(query: string): Promise<{ status: number; type: string | null; bytes: Uint8Array }> {
  const res = await GET(new NextRequest(`https://blockid.au/api/og/svi${query}`));
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get("content-type"), bytes };
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

describe("GET /api/og/svi", () => {
  it.each([
    ["defaults", ""],
    ["a mid-stage score", "?svi=142&stage=4&name=Acme%20Pty%20Ltd"],
    ["an out-of-range stage and a non-numeric score", "?svi=abc&stage=99&name=X"],
  ])("renders a PNG for %s", async (_label, query) => {
    const { status, type, bytes } = await render(query);
    expect(status).toBe(200);
    expect(type).toContain("image/png");
    expect(Array.from(bytes.slice(0, 4))).toEqual(PNG_MAGIC);
  }, 20_000);
});
