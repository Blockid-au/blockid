// G29 lane C — ONE bottom-right slot for every floating pill.
//
// No DOM environment here (renderToStaticMarkup only, like the sibling
// component tests), so the portal itself is exercised by live-qa 33 at
// 375 px; this file pins the contract: the host's positioning (fixed,
// bottom-right, safe-area aware, lift variable), the slot order, the
// SSR-safe null render, and — structurally — that the three pills go through
// the slot instead of carrying their own `fixed bottom-* right-*` corner.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FLOATING_SLOT, FLOATING_STACK_CLASS, FLOATING_STACK_ID, FloatingSlot, FloatingStackHost } from "./floating-stack";

const SRC = resolve(__dirname, "..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

describe("FloatingStackHost", () => {
  it("renders the one fixed bottom-right column, safe-area aware and liftable", () => {
    const html = renderToStaticMarkup(<FloatingStackHost />);
    expect(html).toContain(`id="${FLOATING_STACK_ID}"`);
    expect(html).toContain('data-testid="floating-stack"');
    expect(FLOATING_STACK_CLASS).toMatch(/\bfixed\b/);
    expect(FLOATING_STACK_CLASS).toContain("env(safe-area-inset-bottom)");
    expect(FLOATING_STACK_CLASS).toContain("env(safe-area-inset-right)");
    expect(FLOATING_STACK_CLASS).toContain("var(--floating-stack-lift,0px)");
    expect(FLOATING_STACK_CLASS).toContain("flex-col");
    expect(FLOATING_STACK_CLASS).toContain("items-end");
    expect(FLOATING_STACK_CLASS).toContain("pointer-events-none");
    expect(FLOATING_STACK_CLASS).toContain("print:hidden");
    // Never wider than the viewport minus the 16 px gutters at 375.
    expect(FLOATING_STACK_CLASS).toContain("max-w-[calc(100vw-2rem)]");
  });

  it("the root layout mounts the host once, outside <Providers>, and declares viewport-fit=cover so the safe-area insets are real", () => {
    const layout = read("../app/layout.tsx");
    expect(layout.match(/<FloatingStackHost \/>/g)?.length).toBe(1);
    expect(layout.indexOf("<FloatingStackHost />")).toBeGreaterThan(layout.indexOf("</Providers>"));
    expect(layout).toMatch(/viewportFit:\s*"cover"/);
    // Zoom stays enabled (a11y): no maximumScale / userScalable lock.
    expect(layout).not.toMatch(/userScalable:\s*false|maximumScale:\s*1\b/);
  });
});

describe("FloatingSlot", () => {
  it("stack order: report chat on top, cookie prefs in the middle, feedback (the primary action) at the thumb", () => {
    expect(FLOATING_SLOT.reportChat).toBeLessThan(FLOATING_SLOT.cookiePrefs);
    expect(FLOATING_SLOT.cookiePrefs).toBeLessThan(FLOATING_SLOT.feedback);
  });

  it("renders nothing on the server (portal target exists only after hydration)", () => {
    const html = renderToStaticMarkup(
      <FloatingSlot order={FLOATING_SLOT.feedback} testId="x">
        <button type="button">Feedback</button>
      </FloatingSlot>,
    );
    expect(html).toBe("");
  });
});

describe("every floating pill goes through the slot (no private corners)", () => {
  const pills = [
    ["analytics/consent-banner.tsx", "FLOATING_SLOT.cookiePrefs"],
    ["ui/feedback-widget.tsx", "FLOATING_SLOT.feedback"],
    ["tbr/tbr-qa-chat.tsx", "FLOATING_SLOT.reportChat"],
  ] as const;

  for (const [file, slot] of pills) {
    it(`${file} uses ${slot} and has no fixed bottom corner of its own`, () => {
      const src = read(file);
      expect(src).toContain('from "@/components/ui/floating-stack"');
      expect(src).toContain(slot);
      // The pill/FAB must not position itself; the consent DIALOG (full-width
      // sheet, inset-x-0) is the one allowed `fixed` in consent-banner.
      const corners = src.match(/fixed[^"]*\bbottom-\d[^"]*\b(left|right)-\d/g) ?? [];
      expect(corners, `${file}: ${corners.join(" | ")}`).toEqual([]);
    });
  }

  it("the workspace shell no longer mounts a second FeedbackWidget on top of the root layout's", () => {
    const shell = read("workspace/workspace-layout.tsx");
    expect(shell).not.toContain("<FeedbackWidget");
    expect(shell).not.toContain('from "@/components/ui/feedback-widget"');
    expect(read("../app/layout.tsx").match(/<FeedbackWidget \/>/g)?.length).toBe(1);
  });

  it("StickyCta lifts the stack while its full-width mobile bar is visible", () => {
    const src = read("sales/sticky-cta.tsx");
    expect(src).toContain("setFloatingStackLift(");
    expect(src).toMatch(/max-width: 639px/);
  });
});
