// G20-sweep (2026-09-20): /workspace/projects/[slug]/analyze mounts
// <SVIEntrance chrome={false}> under its own "Analyse {project}" h1, but the
// component still rendered the whole marketing landing below the analyser —
// a second <h1> and a YouTube iframe the CSP `frame-src` refuses. The landing
// sections are now `chrome`-only. Pinned two ways: the source (the h1 and
// the embed sit inside the `{chrome && (` block) and a real render of each
// mode.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type React from "react";
import { renderToReadableStream } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/svi",
}));
vi.mock("next/image", () => ({ default: (p: { alt?: string; src?: string }) => <img alt={p.alt ?? ""} src={typeof p.src === "string" ? p.src : ""} /> }));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/components/landing/nav-v2", () => ({ NavV2: () => <nav data-nav /> }));
vi.mock("@/components/marketing/footer", () => ({ Footer: () => <footer data-footer /> }));
vi.mock("@/lib/hooks/use-pricing-experiment", () => ({ usePricingExperiment: () => ({ variant: "control", ready: true }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: () => {} }));

const SRC = readFileSync(join(__dirname, "svi-entrance.tsx"), "utf8");

describe("svi-entrance — the marketing landing is chrome-only (source)", () => {
  const open = SRC.indexOf("{chrome && (");
  const close = SRC.indexOf("{chrome && <BottomFooter />}");
  it("the chrome block exists and closes before the footer", () => {
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
  });
  it("every <h1 and the YouTube embed live inside the chrome block", () => {
    for (const m of SRC.matchAll(/<h1[\s>]|youtube\.com\/embed/g)) {
      expect(m.index, `${m[0]} at ${m.index} must sit inside the chrome block`).toBeGreaterThan(open);
      expect(m.index, `${m[0]} at ${m.index} must sit inside the chrome block`).toBeLessThan(close);
    }
    expect((SRC.match(/<h1[\s>]/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(SRC).toContain("youtube.com/embed");
  });
});

async function render(chrome: boolean): Promise<string> {
  const { SVIEntrance } = await import("./svi-entrance");
  const stream = await renderToReadableStream(<SVIEntrance chrome={chrome} />);
  await stream.allReady;
  return (await new Response(stream).text()).replace(/<!-- -->/g, "");
}

describe("svi-entrance — render", () => {
  it("chrome={false} (inside the workspace shell): the analyser only — no h1, no iframe, no nav/footer", async () => {
    const out = await render(false);
    expect(out).toContain('id="svi"');
    expect(out).not.toMatch(/<h1[\s>]/);
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("data-nav");
  });

  it("chrome={true} (standalone): the landing with its one h1 and the video", async () => {
    const out = await render(true);
    expect((out.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(out).toContain("youtube.com/embed");
  });
});
