// /tools/esic — accessible names on every control (release QA-1 #6).
//
// pa11y (WCAG2AA) flagged 5 role="switch" buttons with no name
// (H91.Button.Name) and 3 range inputs with no label (H91.InputRange.Name):
// the visible <label> sat next to the control with no `htmlFor`, so assistive
// tech announced "switch, off" and "slider, 0". Every control now carries
// `id` + `aria-label` (the item label) + `aria-describedby` (the item
// description), and the label points at it.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => "/tools/esic",
  useSearchParams: () => new URLSearchParams(),
}));

import { ESICChecker } from "./esic-checker";

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out;
}

describe("ESIC checker — accessible names (release QA-1 #6)", () => {
  const html = renderToStaticMarkup(<ESICChecker />);

  it("every role=switch button has an aria-label, an id, and a <label htmlFor> pointing at it", () => {
    const switches = (html.match(/<button\b[^>]*role="switch"[^>]*>/g) ?? []).map(attrs);
    expect(switches.length).toBe(5); // 1 innovation boolean + 4 early-stage tests
    for (const s of switches) {
      expect(s["aria-label"], JSON.stringify(s)).toBeTruthy();
      expect(s["aria-checked"]).toMatch(/^(true|false)$/);
      expect(s.id).toMatch(/^esic-/);
      expect(html, `label for ${s.id}`).toContain(`<label for="${s.id}"`);
      expect(html, `description for ${s.id}`).toContain(`id="${s["aria-describedby"]}"`);
    }
  });

  it("every range input has an aria-label, aria-valuetext, an id, and a matching <label htmlFor>", () => {
    const ranges = (html.match(/<input\b[^>]*type="range"[^>]*>/g) ?? []).map(attrs);
    expect(ranges.length).toBe(3);
    for (const r of ranges) {
      expect(r["aria-label"], JSON.stringify(r)).toBeTruthy();
      expect(r["aria-valuetext"]).toMatch(/of \d+ points$/);
      expect(r.id).toMatch(/^esic-/);
      expect(html).toContain(`<label for="${r.id}"`);
    }
  });

  it("no <button> on the form is nameless (text content or aria-label)", () => {
    const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.length).toBeGreaterThan(5);
    const nameless = buttons.filter((b) => !/aria-label="[^"]+"/.test(b) && b.replace(/<[^>]+>/g, "").trim() === "");
    expect(nameless).toEqual([]);
  });

  it("range tick labels are 12px+ (no text-[10px] on the sliders)", () => {
    expect(html).not.toMatch(/text-\[10px\][^"]*"[^>]*>0 pts/);
  });
});
