// S8-B a11y render test for the dashboard widget grid (2026-09-11).
// Pure-helper coverage (resolveWidgetOrder, sanitizeStoredIds, merge) lives
// in widget-grid.test.ts; this file pins the markup the keyboard / screen-
// reader path depends on, rendered with renderToStaticMarkup (no
// @testing-library in this workspace):
//   • WidgetEditControls — focusable drag handle (role=button, tabindex=0)
//     with a position-aware name and the reorder hint, explicit Move up /
//     Move down buttons disabled at the edges, Pin carries aria-pressed,
//     every icon is aria-hidden;
//   • WidgetGrid at SSR — a polite live region is mounted from the first
//     render, the "Show hidden widgets" button keeps its visible text as its
//     accessible name (2.5.3 Label in Name), the pinned badge no longer
//     carries an aria-label on a plain span.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WIDGET_MOVE_KEYS, WidgetEditControls, WidgetGrid } from "./widget-grid";

const noop = () => undefined;

function controls(over: Partial<Parameters<typeof WidgetEditControls>[0]> = {}) {
  return renderToStaticMarkup(
    <WidgetEditControls
      id="money-radar"
      position={1}
      count={3}
      isPinned={false}
      onDragStart={noop}
      onDragEnd={noop}
      onMove={noop}
      onTogglePin={noop}
      onHide={noop}
      {...over}
    />,
  );
}

describe("WidgetEditControls — keyboard alternative to drag-and-drop", () => {
  it("drag handle is a focusable button with a position-aware name and the reorder hint", () => {
    const out = controls();
    expect(out).toContain('role="button"');
    expect(out).toContain('tabindex="0"');
    expect(out).toContain('draggable="true"');
    expect(out).toContain('aria-label="Move money-radar, position 2 of 3. Use the up and down arrow keys to reorder."');
    expect(out).toContain('aria-describedby="widget-grid-reorder-hint"');
    expect(out).toContain('data-widget-handle="money-radar"');
    expect(WIDGET_MOVE_KEYS).toEqual(["ArrowUp", "ArrowDown", "Home", "End"]);
  });

  it("explicit Move up / Move down buttons, disabled at the top and bottom edges", () => {
    const mid = controls({ position: 1, count: 3 });
    expect(mid).toContain('aria-label="Move money-radar up"');
    expect(mid).toContain('aria-label="Move money-radar down"');
    expect(mid).not.toContain('disabled=""');

    const first = controls({ position: 0, count: 3 });
    expect(first).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move money-radar up"/);
    expect(first).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move money-radar down"/);

    const last = controls({ position: 2, count: 3 });
    expect(last).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Move money-radar down"/);
  });

  it("Pin is a toggle button with aria-pressed reflecting the state; Hide is named", () => {
    expect(controls({ isPinned: false })).toContain('aria-pressed="false"');
    expect(controls({ isPinned: false })).toContain('aria-label="Pin money-radar"');
    expect(controls({ isPinned: true })).toContain('aria-pressed="true"');
    expect(controls({ isPinned: true })).toContain('aria-label="Unpin money-radar"');
    expect(controls()).toContain('aria-label="Hide money-radar"');
  });

  it("every icon is decorative (aria-hidden) and controls meet the 24px target floor", () => {
    const out = controls();
    const svgs = out.match(/<svg[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThanOrEqual(5);
    for (const svg of svgs) expect(svg).toContain('aria-hidden="true"');
    expect((out.match(/min-h-6/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});

describe("WidgetGrid — SSR markup", () => {
  it("mounts a polite live region on first render and keeps the visible label as the name of Show hidden widgets", () => {
    const out = renderToStaticMarkup(
      <WidgetGrid>
        <section data-widget-id="a">A</section>
        <section data-widget-id="b">B</section>
      </WidgetGrid>,
    );
    expect(out).toContain('role="status" aria-live="polite" data-widget-announce');
    // Declaration order at SSR (hydration contract) and no pinned badge yet.
    expect(out.indexOf('data-widget-slot="a"')).toBeLessThan(out.indexOf('data-widget-slot="b"'));
    expect(out).not.toContain("data-widget-pinned-badge");
    // Customize is the only toolbar control before hydration; its aria-label contains the visible text.
    expect(out).toContain('aria-label="Customize dashboard layout"');
    expect(out).toContain("Customize</button>");
    // No aria-label on a non-interactive span anywhere in the grid chrome.
    expect(out).not.toMatch(/<span[^>]*aria-label=/);
  });
});
