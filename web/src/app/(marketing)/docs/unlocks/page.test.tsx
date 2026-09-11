// Colocated render test for /docs/unlocks (G8-P8). The marketing shell
// mounts NavV2 → useRouter(), which throws outside an app-router context,
// so it is mocked to a pass-through (same pattern as /compare).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import matrix from "../../../../../content/generated/unlock-matrix.json";
import UnlocksPage, { metadata } from "./page";

/** React escapes `&` as `&amp;` in text nodes. */
const esc = (s: string) => s.replace(/&/g, "&amp;");

async function html(): Promise<string> {
  const stream = await renderToReadableStream(<UnlocksPage />);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/docs/unlocks", () => {
  it("is indexable with a canonical URL", () => {
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/docs/unlocks");
  });

  it("S8-A: ≤ 60 title via the root brand template (no hand-written suffix), 140–160 description, OG image; WebPage + BreadcrumbList JSON-LD validate; one outcome-led H1", async () => {
    expect(String(metadata.title)).toBe("What unlocks when: phases, plans and tools");
    expect(`${String(metadata.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(metadata.description).length).toBeGreaterThanOrEqual(140);
    expect(String(metadata.description).length).toBeLessThanOrEqual(160);
    expect((metadata.openGraph as { images?: unknown[] }).images).toHaveLength(1);
    const out = await html();
    const blocks = extractJsonLd(out);
    expect(blocks.map((b) => b["@type"]).sort()).toEqual(["BreadcrumbList", "WebPage"]);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    expect(JSON.stringify(blocks)).toContain("https://blockid.au/docs/unlocks");
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain("What unlocks when: the tools each phase and plan opens");
  });

  it("renders both generated tables with all 12 phases and 7 plan columns", async () => {
    const out = await html();
    expect(out).toContain('data-testid="unlock-matrix-table"');
    expect(out).toContain('data-testid="unlock-rules-table"');
    for (const p of matrix.phases) {
      expect(out).toContain(esc(p.labelEn));
      expect(out).toContain(`>${p.id}<`);
    }
    for (const c of matrix.columns) {
      expect(out).toContain(`>${esc(c.label)}<`);
    }
    // The rules table carries the floors in founder language.
    expect(out).toContain("Market &amp; Problem (MPC) ≥ 40");
    expect(out).toContain("All 13 criteria");
  });

  it("carries the advisory-gate sentence and the D2 hidden-vs-dimmed explanation", async () => {
    const out = await html();
    expect(out).toContain("Gates are advisory: you can move on manually; the badge and investor-facing");
    expect(out).toContain("visible but dimmed");
    expect(out).toContain("Later phases");
  });

  it("links to the dashboard, pricing and the docs index; no academic vocabulary", async () => {
    const out = await html();
    expect(out).toContain('href="/dashboard"');
    expect(out).toContain('href="/pricing"');
    expect(out).toContain('href="/docs"');
    expect(out).not.toContain("PhD");
    expect(out).not.toContain("undefined");
    expect(out).not.toContain("[object Object]");
  });
});
