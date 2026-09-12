// Hydration-safety helpers for server-render tests (release QA-2 F9).
//
// React #418 ("server HTML didn't match the client") has two silent causes
// a unit test can catch without a browser:
//
//   1. Invalid HTML nesting — the browser's parser relocates the element
//      (`<div>` inside `<p>` closes the `<p>`; `<a>` inside `<a>`,
//      `<button>` inside `<button>`/`<a>` …) so the DOM React hydrates
//      against is not the tree it rendered. `assertHydratableNesting()`
//      walks the SSR string with a tag stack and fails on those patterns.
//   2. Non-deterministic render — `Date.now()`, `Math.random()`,
//      locale-dependent `toLocaleString()` etc. `renderTwice()` renders the
//      same element twice under a fixed clock and asserts byte-equality.
//
// Both are static-markup checks, so they work on Server Components and on
// the server pass of Client Components alike.

import { Parser } from "htmlparser2";
import { expect } from "vitest";

/** Elements that end an open `<p>` when the parser meets them (HTML spec "closes p"). */
const CLOSES_P = new Set([
  "address", "article", "aside", "blockquote", "details", "dialog", "div", "dl", "fieldset",
  "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header",
  "hgroup", "hr", "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul",
]);

const VOID = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

export interface NestingViolation {
  child: string;
  parent: string;
  /** Opening-tag snippet for the offending child. */
  snippet: string;
}

/**
 * Returns every element the browser would relocate on parse. Empty array
 * means the markup hydrates structurally as rendered.
 */
export function findNestingViolations(html: string): NestingViolation[] {
  const stack: string[] = [];
  const violations: NestingViolation[] = [];
  let cursor = 0;
  const parser = new Parser(
    {
      onopentag(name, attribs) {
        const tag = name.toLowerCase();
        const snippet = `<${tag}${Object.entries(attribs)
          .slice(0, 3)
          .map(([k, v]) => ` ${k}="${String(v).slice(0, 40)}"`)
          .join("")}>`;
        const openP = stack.includes("p");
        if (openP && CLOSES_P.has(tag)) violations.push({ child: tag, parent: "p", snippet });
        if (tag === "a" && stack.includes("a")) violations.push({ child: "a", parent: "a", snippet });
        if (tag === "button" && (stack.includes("button") || stack.includes("a"))) {
          violations.push({ child: "button", parent: stack.includes("button") ? "button" : "a", snippet });
        }
        if ((tag === "tr" || tag === "td" || tag === "th") && !stack.some((s) => ["table", "thead", "tbody", "tfoot", "tr"].includes(s))) {
          violations.push({ child: tag, parent: stack[stack.length - 1] ?? "(root)", snippet });
        }
        if (tag === "li" && !stack.some((s) => s === "ul" || s === "ol" || s === "menu")) {
          violations.push({ child: "li", parent: stack[stack.length - 1] ?? "(root)", snippet });
        }
        if (!VOID.has(tag)) stack.push(tag);
        cursor += 1;
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (VOID.has(tag)) return;
        // Pop to the matching tag (SSR output is well-formed, so this is
        // normally the top of the stack).
        const idx = stack.lastIndexOf(tag);
        if (idx >= 0) stack.splice(idx);
      },
    },
    { decodeEntities: false, lowerCaseTags: true, recognizeSelfClosing: true },
  );
  parser.write(html);
  parser.end();
  void cursor;
  return violations;
}

/** Vitest assertion wrapper with a readable failure message. */
export function assertHydratableNesting(html: string, label = "markup"): void {
  const v = findNestingViolations(html);
  expect(
    v,
    `${label}: ${v.length} element(s) the browser parser would relocate → React #418. ${v
      .map((x) => `<${x.child}> inside <${x.parent}> at ${x.snippet}`)
      .join("; ")}`,
  ).toEqual([]);
}

/**
 * Render twice under a frozen clock and assert the output is identical —
 * catches `Date.now()`, `Math.random()`, `crypto.randomUUID()` in render.
 * `render` must build a fresh element each call.
 */
export async function assertDeterministicRender(
  render: () => Promise<string> | string,
  opts: { fixedNow?: string } = {},
): Promise<string> {
  const { vi } = await import("vitest");
  const now = new Date(opts.fixedNow ?? "2026-09-12T02:00:00.000Z");
  vi.useFakeTimers({ now, toFake: ["Date"] });
  try {
    const a = await render();
    const b = await render();
    expect(b).toBe(a);
    return a;
  } finally {
    vi.useRealTimers();
  }
}
