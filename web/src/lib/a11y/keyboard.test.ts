// Colocated tests for the S8-B keyboard helpers — pins the arrow-key
// arithmetic the funding tabs, the widget grid reorder handle and the
// evaluations dialogs rely on. Pure, no DOM for the index helpers; the
// focus-trap case builds a tiny fake container so no JSDOM is needed.

import { describe, expect, it } from "vitest";
import { FOCUSABLE_SELECTOR, moveIndex, rovingIndex, trapTab } from "./keyboard";

describe("rovingIndex() — tablist arrows wrap, Home/End jump", () => {
  it("horizontal: ArrowRight advances and wraps, ArrowLeft retreats and wraps", () => {
    expect(rovingIndex("ArrowRight", 0, 3)).toBe(1);
    expect(rovingIndex("ArrowRight", 2, 3)).toBe(0);
    expect(rovingIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(rovingIndex("ArrowLeft", 1, 3)).toBe(0);
  });

  it("Home / End land on the ends; unrelated keys return null", () => {
    expect(rovingIndex("Home", 2, 8)).toBe(0);
    expect(rovingIndex("End", 2, 8)).toBe(7);
    expect(rovingIndex("Enter", 2, 8)).toBeNull();
    expect(rovingIndex("ArrowDown", 2, 8)).toBeNull(); // vertical key on a horizontal list
    expect(rovingIndex("ArrowRight", 0, 0)).toBeNull();
  });

  it("vertical / both orientations accept the matching arrows", () => {
    expect(rovingIndex("ArrowDown", 0, 2, "vertical")).toBe(1);
    expect(rovingIndex("ArrowRight", 0, 2, "vertical")).toBeNull();
    expect(rovingIndex("ArrowUp", 0, 2, "both")).toBe(1);
    expect(rovingIndex("ArrowLeft", 0, 2, "both")).toBe(1);
  });
});

describe("moveIndex() — keyboard reorder never wraps", () => {
  it("moves one slot with arrows and to the ends with Home / End", () => {
    expect(moveIndex("ArrowUp", 2, 4)).toBe(1);
    expect(moveIndex("ArrowDown", 2, 4)).toBe(3);
    expect(moveIndex("ArrowLeft", 2, 4)).toBe(1);
    expect(moveIndex("ArrowRight", 2, 4)).toBe(3);
    expect(moveIndex("Home", 2, 4)).toBe(0);
    expect(moveIndex("End", 2, 4)).toBe(3);
  });

  it("returns null at an edge, for a single item and for other keys", () => {
    expect(moveIndex("ArrowUp", 0, 4)).toBeNull();
    expect(moveIndex("ArrowDown", 3, 4)).toBeNull();
    expect(moveIndex("Home", 0, 4)).toBeNull();
    expect(moveIndex("End", 3, 4)).toBeNull();
    expect(moveIndex("ArrowDown", 0, 1)).toBeNull();
    expect(moveIndex("Enter", 1, 4)).toBeNull();
    expect(moveIndex("ArrowUp", 9, 4)).toBeNull();
  });
});

describe("trapTab() — Tab cycles inside the container", () => {
  interface FakeEl {
    hidden: boolean;
    focused: boolean;
    attrs: Record<string, string>;
    focus(): void;
    getAttribute(n: string): string | null;
    closest(): null;
  }
  function el(): FakeEl {
    return {
      hidden: false,
      focused: false,
      attrs: {},
      focus() {
        this.focused = true;
      },
      getAttribute(n) {
        return this.attrs[n] ?? null;
      },
      closest: () => null,
    };
  }
  function container(items: FakeEl[]) {
    const c = {
      ...el(),
      querySelectorAll: (sel: string) => {
        expect(sel).toBe(FOCUSABLE_SELECTOR);
        return items;
      },
      contains: (n: unknown) => items.includes(n as FakeEl) || n === c,
    };
    return c as unknown as HTMLElement;
  }
  const ev = (shiftKey: boolean) => {
    const e = { key: "Tab", shiftKey, prevented: false, preventDefault() { this.prevented = true; } };
    return e;
  };

  it("Tab on the last item wraps to the first; Shift+Tab on the first wraps to the last", () => {
    const a = el();
    const b = el();
    const c = container([a, b]);
    // HTMLElement instanceof checks are not available without a DOM, so pass
    // `active` as the container itself for the "not inside" branch and use
    // the items for the edge branches through the `contains` fake.
    const e1 = ev(false);
    expect(trapTab(e1, c, b as unknown as Element)).toBe(true);
    expect(e1.prevented).toBe(true);
    expect(a.focused).toBe(true);

    const e2 = ev(true);
    expect(trapTab(e2, c, a as unknown as Element)).toBe(true);
    expect(e2.prevented).toBe(true);
    expect(b.focused).toBe(true);
  });

  it("ignores non-Tab keys and focuses the container when nothing inside is tabbable", () => {
    const c = container([]);
    expect(trapTab({ key: "Escape", shiftKey: false, preventDefault: () => undefined }, c)).toBe(false);
    const e = ev(false);
    expect(trapTab(e, c)).toBe(true);
    expect(e.prevented).toBe(true);
    expect((c as unknown as FakeEl).focused).toBe(true);
  });
});
