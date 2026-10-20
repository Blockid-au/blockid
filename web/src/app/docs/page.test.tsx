// /docs — Pricing v5 P5: the "What BlockID.au is" line and the pricing
// ladder follow platform_config.payg_enabled. Flag OFF keeps the pre-v5
// single report price; flag ON lists Snapshot / Full / Verified and the
// 1-credit re-score. The changelog entries above them are history and stay.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/landing/nav-v2", () => ({ NavV2: () => null }));
vi.mock("@/components/marketing/footer", () => ({ Footer: () => null }));

const cfgState = vi.hoisted(() => ({ payg: false }));
vi.mock("@/lib/platform-config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform-config")>("@/lib/platform-config");
  return {
    ...actual,
    getPlatformConfig: async () => ({ ...actual.CONFIG_DEFAULTS, payg_enabled: cfgState.payg }),
  };
});

import DocsPage from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const text = (s: string) => s.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

describe("/docs — Pricing v5 P5 payg_enabled", () => {
  it("flag OFF: the pre-v5 single report price, unchanged", async () => {
    cfgState.payg = false;
    const out = text(await html(await DocsPage()));
    expect(out).toContain("can unlock the full Trusted Business Report for A$3. The founder");
    expect(out).toContain("One report price for everyone — A$3 buys the full Trusted Business Report");
    expect(out).toContain("A$3 — full Trusted Business Report");
    expect(out).toContain("A$3 per Trusted Business Report on any startup you enter, pay as you go");
    expect(out).not.toContain("Snapshot A$19");
  });

  it("flag ON: Snapshot / Full / Verified from the view and the 1-credit re-score; history entries untouched", async () => {
    cfgState.payg = true;
    try {
      const raw = await html(await DocsPage());
      const out = text(raw);
      expect(raw).toContain('data-testid="docs-payg-ladder"');
      expect(out).toContain("can buy a single Trusted Business Report from A$19 (Snapshot, Full or Verified). The founder");
      expect(out).toContain("Snapshot A$19");
      expect(out).toContain("Full A$49");
      expect(out).toContain("Verified A$149");
      expect(out).toContain("costs 1 credit.");
      expect(out).toContain("re-score 1 credit");
      expect(out).not.toContain("One report price for everyone");
      expect(out).not.toContain("A$3 per Trusted Business Report on any startup you enter");
      // Changelog history (G16) keeps its own wording.
      expect(out).toContain("G16 First dollar");
    } finally {
      cfgState.payg = false;
    }
  });
});
