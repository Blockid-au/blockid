// S23-B — the brace-aware scanner over the typed event registries. Pinned on
// synthetic sources (so a regression in the scanner is not masked by the real
// file) plus a sanity pass over the real files.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { paramIndex, paramNamesOf, parseAnalyticsEventMap, parseServerEventUnion } from "./event-map-introspect";

describe("paramNamesOf", () => {
  it("reads depth-1 keys, optional markers and union literals", () => {
    expect(paramNamesOf('{ method: "text" | "file"; has_file: boolean; arm?: string }')).toEqual(["method", "has_file", "arm"]);
    expect(paramNamesOf("{ step: 1 | 2 | 3 | 4 }")).toEqual(["step"]);
  });
  it("Record<string, never> / bare types have no params", () => {
    expect(paramNamesOf("Record<string, never>")).toEqual([]);
    expect(paramNamesOf("Record<string, string | number>")).toEqual([]);
  });
  it("does not descend into nested object types or Records", () => {
    expect(paramNamesOf("{ cohort: string; detail?: Record<string, string | number | boolean>; nested: { inner: string } }")).toEqual([
      "cohort",
      "detail",
      "nested",
    ]);
  });
  it("ignores colons inside string literals", () => {
    expect(paramNamesOf('{ href: "https://x:1"; kind: "a:b" | "c" }')).toEqual(["href", "kind"]);
  });
});

describe("parseAnalyticsEventMap", () => {
  const src = `
    // header comment with a URL https://example.com/x
    export interface Unrelated { a: string }
    export interface AnalyticsEventMap {
      // ── Section ──
      one: Record<string, never>;
      /** doc */
      two: { a: string; b?: number };
      three: {
        multi: "x" | "y";
        line: boolean;
      };
      four: { url: "https://x" };
    }
    export function trackEvent() {}
  `;
  it("collects every member with its params", () => {
    const t = parseAnalyticsEventMap(src);
    expect([...t.events.keys()]).toEqual(["one", "two", "three", "four"]);
    expect(t.events.get("one")).toEqual([]);
    expect(t.events.get("two")).toEqual(["a", "b"]);
    expect(t.events.get("three")).toEqual(["multi", "line"]);
    expect(t.events.get("four")).toEqual(["url"]);
  });
  it("throws when the interface is absent", () => {
    expect(() => parseAnalyticsEventMap("export const x = 1;")).toThrow(/not found/);
  });
});

describe("parseServerEventUnion", () => {
  it("reads `{ name: \"x\"; params: { … } }` members", () => {
    const src = `
      export type AnalyticsEvent =
        | { name: "sign_up"; params: { segment: UserSegment; method: "google" | "email" } }
        | { name: "cohort_action"; params: { cohort: string; detail?: Record<string, string> } };
    `;
    const t = parseServerEventUnion(src);
    expect(t.events.get("sign_up")).toEqual(["segment", "method"]);
    expect(t.events.get("cohort_action")).toEqual(["cohort", "detail"]);
  });
});

describe("paramIndex + real registries", () => {
  it("inverts event→params into param→events across tables", () => {
    const idx = paramIndex([{ events: new Map([["a", ["p", "q"]], ["b", ["p"]]]) }, { events: new Map([["c", ["q"]]]) }]);
    expect(idx.get("p")).toEqual(["a", "b"]);
    expect(idx.get("q")).toEqual(["a", "c"]);
  });
  it("parses the real src/lib/analytics.ts and events.ts", () => {
    const lib = path.resolve(__dirname, "..");
    const client = parseAnalyticsEventMap(readFileSync(path.join(lib, "analytics.ts"), "utf8"));
    const server = parseServerEventUnion(readFileSync(path.join(lib, "analytics", "events.ts"), "utf8"));
    expect(client.events.size).toBeGreaterThan(100);
    expect(server.events.size).toBeGreaterThan(20);
    expect(client.events.get("funding_directory_viewed")).toEqual(["kind", "capital"]);
    expect(client.events.get("compare_viewed")).toEqual(["variant"]);
    expect(server.events.get("sign_up")).toContain("segment");
  });
});
