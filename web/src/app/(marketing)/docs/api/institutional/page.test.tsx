// Colocated render test for /docs/api/institutional (G22-C): the
// Institutional API contract rendered in-app from docs/api/institutional.md.
// Pins: indexable metadata (canonical, title ≤ 60, description 140–160),
// the document resolves from web/ (the build cwd), one H1, every `##` of the
// document as an h2 with a toc link, the six registry endpoints linked, the
// tables + fences rendered, token classes only, and that /developers/api +
// the registry link here instead of GitHub. The marketing shell mounts NavV2
// → useRouter(), so it is mocked to a pass-through.

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { INSTITUTIONAL_DOCS_PATH, INSTITUTIONAL_ENDPOINTS } from "@/lib/api-docs-registry";
import { renderedTitle } from "@/lib/seo/page-meta";
import { institutionalDocCandidates, loadInstitutionalDoc, readInstitutionalDocSource } from "./institutional-doc";
import InstitutionalApiDocPage, { PATH, metadata } from "./page";

async function html(): Promise<string> {
  const stream = await renderToReadableStream(<InstitutionalApiDocPage />);
  await stream.allReady;
  return new Response(stream).text();
}

const SOURCE = readFileSync(resolve(__dirname, "../../../../../../../docs/api/institutional.md"), "utf8");

describe("/docs/api/institutional — metadata + loader", () => {
  it("indexable, canonical, title ≤ 60, description 140–160, article OG", () => {
    expect(PATH).toBe(INSTITUTIONAL_DOCS_PATH);
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/docs/api/institutional");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(60);
    const d = String(metadata.description);
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
    expect((metadata.openGraph as { type?: string }).type).toBe("article");
  });

  it("the document resolves from the build cwd (web/) via the first candidate and renders", () => {
    expect(institutionalDocCandidates("/x/web")[0]).toBe("/x/docs/api/institutional.md");
    expect(readInstitutionalDocSource()).toBe(SOURCE);
    expect(loadInstitutionalDoc()?.title).toMatch(/^Institutional API/);
    expect(loadInstitutionalDoc("/nowhere")).toBeNull();
  });
});

describe("/docs/api/institutional — rendered", () => {
  it("one H1, every `##` of the document as an h2 + toc entry, six endpoint links, tables + fences, source line, no GitHub-only contract", async () => {
    const out = await html();
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain("Institutional API (read-only)");
    expect(out).toContain('data-testid="institutional-doc"');
    expect(out).toContain('data-testid="institutional-doc-toc"');
    expect(out).not.toContain('data-testid="institutional-doc-missing"');
    const h2s = [...SOURCE.matchAll(/^## (.+)$/gm)].map((m) => m[1]!.trim().replace(/`/g, ""));
    for (const h of h2s) {
      expect(out, h).toContain(`>${h.replace(/&/g, "&amp;")}</h2>`);
    }
    expect((out.match(/<a href="#[a-z0-9-]+" class=/g) ?? []).length).toBeGreaterThanOrEqual(h2s.length);
    for (const ep of INSTITUTIONAL_ENDPOINTS) expect(out).toContain(`href="/developers/api/${ep.slug}"`);
    expect((out.match(/<table>/g) ?? []).length).toBe((SOURCE.match(/^\|---/gm) ?? []).length);
    expect((out.match(/<pre /g) ?? []).length).toBe(3);
    expect(out).toContain("$BLOCKID_API_KEY");
    expect(out).toContain('data-testid="institutional-doc-source"');
    expect(out).toContain('href="/api/openapi.json"');
    expect(out).toContain('href="/developers/api#institutional"');
    expect(out).toContain('href="/methodology/governance"');
    // token classes only on the template page
    expect(out).not.toMatch(/bg-white|text-ink-|text-gray-|bg-gray-|#[0-9a-f]{6}\b/i);
    expect(out).not.toMatch(/\bPhD\b/);
    expect(out).not.toContain("bk_live_example");
  });

  it("/developers/api links to the in-app page (not GitHub) and the registry note carries the path", () => {
    const dev = readFileSync(resolve(__dirname, "../../../../developers/api/page.tsx"), "utf8");
    expect(dev).toContain("INSTITUTIONAL_DOCS_PATH");
    expect(dev).not.toContain("github.com/Blockid-au/blockid/blob/master/docs/api/institutional.md");
    const registry = readFileSync(resolve(__dirname, "../../../../../lib/api-docs-registry.ts"), "utf8");
    expect(registry).toContain('export const INSTITUTIONAL_DOCS_PATH = "/docs/api/institutional"');
  });
});
