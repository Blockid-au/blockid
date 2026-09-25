// Colocated test for /team (G17 P2-A): one h1, the founder + entity band
// (PPL Food = operating entity, Auschain = contracts / invoices / GST per the
// entity rule), the bench StatStrip, one link per roster row, pageMetadata.
// The roster is read from content/team-roster.json; when it is absent the
// page renders the empty state. The marketing shell is mocked.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { renderedTitle } from "@/lib/seo/page-meta";
import TeamPage, { metadata } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/team — template (G17 P2-A)", () => {
  it("one h1, #founder + #bench, the stat strip, the entity split, the closing CTAs", async () => {
    const out = await html(<TeamPage />);
    expect((out.match(/<h1\b/g) ?? []).length).toBe(1);
    expect(out).toMatch(/<section[^>]*id="founder"/);
    expect(out).toMatch(/<section[^>]*id="bench"/);
    expect(out).toContain('data-testid="stat-strip"');
    expect(out).toContain("refresh time is unavailable");
    expect(out).not.toContain("live shipping activity");
    expect(out).not.toContain("Last shipped");
    expect(out).toContain("PPL Food PTY LTD");
    expect(out).toContain("Auschain PTY LTD");
    expect(out).toContain("ACN 659 615 111");
    expect(out).toContain('href="/changelog"');
    expect(out).toContain('href="/roadmap"');
    // Either the roster grid (one link per row) or the empty state.
    const rows = (out.match(/href="\/team\/[a-z-]+"/g) ?? []).length;
    if (rows === 0) expect(out).toContain("Team roster not yet published");
    else expect(rows).toBeGreaterThanOrEqual(11);
  });

  it("pageMetadata: canonical, rendered title ≤ 65, description ≤ 165", () => {
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/team");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    expect(String(metadata.description).length).toBeLessThanOrEqual(165);
  });
});
