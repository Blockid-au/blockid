import { describe, expect, it } from "vitest";

import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";
import { getMessages, t, type Messages } from "./t";
import en from "./messages/en.json";
import vi from "./messages/vi.json";

// ─── getMessages ────────────────────────────────────────────────────────

describe("getMessages", () => {
  it("returns the EN catalog for locale 'en'", async () => {
    const m = await getMessages("en");
    expect(m).toBe(en as unknown as Messages);
  });

  it("returns the VI catalog for locale 'vi'", async () => {
    const m = await getMessages("vi");
    expect(m).toBe(vi as unknown as Messages);
  });

  it("resolves synchronously — the promise fulfils on the microtask queue with no I/O", async () => {
    const p = getMessages("en");
    expect(p).toBeInstanceOf(Promise);
    await expect(p).resolves.toBe(en as unknown as Messages);
  });

  it("falls back to DEFAULT_LOCALE when an unknown locale is passed", async () => {
    // isLocale() rejects unknown strings — the default catalog is served
    // rather than throwing so a stale cookie / query param never crashes SSR.
    const m = await getMessages("de" as unknown as Locale);
    expect(m).toBe((CATALOG_BY_CODE)[DEFAULT_LOCALE]);
  });

  it("falls back to DEFAULT_LOCALE for empty-string locale", async () => {
    const m = await getMessages("" as unknown as Locale);
    expect(m).toBe((CATALOG_BY_CODE)[DEFAULT_LOCALE]);
  });

  it("returns a non-empty catalog for every shipped locale", async () => {
    for (const code of LOCALES) {
      const m = await getMessages(code);
      expect(Object.keys(m).length).toBeGreaterThan(0);
    }
  });

  it("returned catalog is the imported JSON object — no defensive clone", async () => {
    // Callers pass the catalog into the sync `t()` hundreds of times per
    // request; cloning it would be a per-request allocation with no upside.
    const m1 = await getMessages("en");
    const m2 = await getMessages("en");
    expect(m1).toBe(m2);
  });
});

// ─── t() lookup ─────────────────────────────────────────────────────────

describe("t", () => {
  const messages: Messages = {
    "nav.product": "Product",
    "hero.title": "Hello",
    "empty.value": "",
  };

  it("returns the mapped string when the key exists", () => {
    expect(t(messages, "nav.product")).toBe("Product");
  });

  it("returns the explicit fallback when the key is missing", () => {
    expect(t(messages, "nav.missing", "Fallback")).toBe("Fallback");
  });

  it("returns the EN catalog value when key is missing AND no fallback", () => {
    // Uses a real EN key so we hit fallback step 3.
    const enOnly: Messages = {};
    const enValue = (en as unknown as Messages)["nav.product"];
    expect(enValue).toBeDefined();
    expect(t(enOnly, "nav.product")).toBe(enValue);
  });

  it("returns the key itself when no local, no fallback, no EN entry", () => {
    // The key never appears anywhere — never returns undefined.
    expect(t({}, "no.such.key")).toBe("no.such.key");
  });

  it("prefers the local mapped string over an explicit fallback", () => {
    expect(t(messages, "nav.product", "Fallback")).toBe("Product");
  });

  it("prefers the explicit fallback over an EN catalog value", () => {
    // Even when the key resolves in EN, an explicit fallback wins if the
    // caller supplied one and the local catalog didn't have it.
    const noLocal: Messages = {};
    const enValue = (en as unknown as Messages)["nav.product"];
    expect(enValue).toBeDefined();
    expect(t(noLocal, "nav.product", "Explicit")).toBe("Explicit");
  });

  it("treats empty-string values as missing at every fallback step", () => {
    // messages["empty.value"] === "" — the local branch is skipped because
    // length is 0, so the explicit fallback wins.
    expect(t(messages, "empty.value", "F")).toBe("F");
  });

  it("treats empty-string fallback as missing — skips to EN or key", () => {
    // Empty fallback string is skipped; the key itself is returned.
    expect(t({}, "no.such.key", "")).toBe("no.such.key");
  });

  it("never returns undefined for any input shape", () => {
    // Belt-and-braces: the function's return type is `string`. Every
    // possible fallback chain must satisfy that contract.
    const cases: Array<[Messages, string, string?]> = [
      [{}, "x"],
      [{}, "x", ""],
      [{}, "x", "y"],
      [{ x: "a" }, "x"],
      [{ x: "" }, "x"],
      [{}, "nav.product"], // hits EN
    ];
    for (const [m, k, f] of cases) {
      const result = t(m, k, f);
      expect(typeof result).toBe("string");
    }
  });

  it("returns the VI catalog string when caller supplies the VI catalog", () => {
    const viMessages = vi as unknown as Messages;
    const viValue = viMessages["nav.product"];
    expect(viValue).toBeDefined();
    expect(t(viMessages, "nav.product")).toBe(viValue);
  });

  it("returns the EN catalog value even when the VI catalog is passed but is missing this key", () => {
    // Simulates a VI key gap — VI catalog has no entry so we fall through
    // to the EN safety net.
    const partialVi: Messages = { "hero.title": "Xin chào" };
    const enValue = (en as unknown as Messages)["nav.product"];
    expect(enValue).toBeDefined();
    expect(t(partialVi, "nav.product")).toBe(enValue);
  });

  it("does not mutate the messages object", () => {
    const snapshot = JSON.stringify(messages);
    t(messages, "nav.product");
    t(messages, "no.such.key", "F");
    t(messages, "no.such.key");
    expect(JSON.stringify(messages)).toBe(snapshot);
  });

  it("handles keys containing dots without any nested-lookup magic", () => {
    // The catalog is a flat Record<string,string>, not a nested tree; a
    // dotted key is a literal string, not a path.
    const dotted: Messages = { "a.b.c": "leaf" };
    expect(t(dotted, "a.b.c")).toBe("leaf");
    expect(t(dotted, "a")).toBe("a"); // no partial-path match
  });

  it("handles empty-string key by returning the key itself when no fallback", () => {
    // Empty key can't match any real translation and no EN fallback exists.
    expect(t({}, "")).toBe("");
  });

  it("returns the fallback for empty-string key when fallback is supplied", () => {
    expect(t({}, "", "F")).toBe("F");
  });
});

// Local mirror of the module's private CATALOG for the isLocale-fallback
// assertions above — the module doesn't export it, so we rebuild the map here
// so the test can verify getMessages() returned the correct object identity.
const CATALOG_BY_CODE: Record<Locale, Messages> = {
  en: en as unknown as Messages,
  vi: vi as unknown as Messages,
};
