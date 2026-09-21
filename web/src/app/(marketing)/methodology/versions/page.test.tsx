// Colocated test for /methodology/versions + /vi/methodology/versions
// (G21 P3-C). Pins: the page renders every SVI_VERSION_HISTORY row (newest
// first) with its comparability sentence, marks the live SVI_VERSION as
// current, links to /methodology and /methodology/governance (the VI mirror
// to the /vi twins), carries canonical + hreflang metadata; /methodology and
// § 5 of /methodology/governance link here.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { SVI_VERSION_HISTORY, VERSIONS_PATH, VERSIONS_VI_PATH } from "@/lib/svi/version-history";
import { buildMethodologyProps } from "../methodology-content";
import { buildGovernanceSections } from "../governance/governance-content";
import GovernanceRoute from "../governance/page";
import VersionsRoute, { generateMetadata } from "./page";
import ViVersionsRoute, { generateMetadata as viGenerateMetadata } from "../../../vi/methodology/versions/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("/methodology/versions — rendered", () => {
  it("every history row, newest first, with its comparability sentence; the live version marked current; links to governance + methodology", async () => {
    const out = await html(VersionsRoute());
    expect(out).toContain("<h1");
    expect(out).toContain(`data-testid="versions-current" data-version="${SVI_VERSION}"`);
    expect(out).toContain(`data-version-row="${SVI_VERSION}" data-current="true"`);
    const order = [...out.matchAll(/data-version-row="([^"]+)"/g)].map((m) => m[1]);
    expect(order).toEqual([...SVI_VERSION_HISTORY].reverse().map((r) => r.version));
    for (const r of SVI_VERSION_HISTORY) {
      expect(out).toContain(esc(r.change));
      expect(out).toContain(esc(r.comparability));
      expect(out).toContain(r.date);
    }
    expect((out.match(/data-current="true"/g) ?? []).length).toBe(1);
    expect(out).toContain('href="/methodology/governance"');
    expect(out).toContain('href="/methodology"');
    expect(out).toContain("Effect on comparability");
    expect(out).not.toMatch(/\bpredicts?\b/i);
  });

  it("metadata: canonical + VI alternate; the VI mirror renders the same rows with /vi links", async () => {
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe(`https://blockid.au${VERSIONS_PATH}`);
    expect((meta.alternates?.languages as Record<string, string>).vi).toBe(`https://blockid.au${VERSIONS_VI_PATH}`);
    expect(String(meta.description)).toContain(`v${SVI_VERSION}`);
    const viMeta = await viGenerateMetadata();
    expect(viMeta.alternates?.canonical).toBe(`https://blockid.au${VERSIONS_VI_PATH}`);
    const out = await html(ViVersionsRoute());
    expect(out).toContain("Startup Value Index — lịch sử phiên bản");
    expect(out).toContain(`data-version-row="${SVI_VERSION}" data-current="true"`);
    expect(out).toContain('href="/vi/methodology/governance"');
    expect(out).toContain('href="/vi/methodology"');
  });

  it("/methodology and § 5 of /methodology/governance link to the versions page (EN and VI)", async () => {
    const enP = buildMethodologyProps(EN, "en", { sources: [] });
    expect(enP.governance.versionsHref).toBe(VERSIONS_PATH);
    expect(enP.governance.versionsLink.length).toBeGreaterThan(10);
    const viP = buildMethodologyProps(VI, "vi", { sources: [] });
    expect(viP.governance.versionsHref).toBe(VERSIONS_VI_PATH);
    const s5 = buildGovernanceSections().find((s) => s.id === "s5")!;
    expect(s5.link).toEqual({ href: VERSIONS_PATH, label: expect.stringContaining("comparability") });
    const gov = await html(GovernanceRoute());
    expect(gov).toContain(`data-testid="governance-link-s5"`);
    expect(gov).toContain(`href="${VERSIONS_PATH}"`);
  });
});
