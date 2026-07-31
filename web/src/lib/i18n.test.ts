// Colocated vitest for the tiny UI-locale + translation lib `i18n.ts` — the
// server-side `blockid_lang` cookie reader powering the EN/VI toggle and the
// `tx(key, locale)` translator used by report headings, hero CTA copy, and the
// email subject lines rendered by the SVI-report pipeline.
//
// Silent drift here would leak to two very visible surfaces:
//   • server pages calling `getLocale()` — a cookie value like "VI" (uppercase
//     from a legacy set-cookie) that starts resolving to "vi" would flip the
//     UI language for existing English users; the strict `raw === "vi"`
//     guard is what pins the safe fallback and is regression-worth
//   • the `tx()` translator is called with a runtime string key (`tx(row.key,
//     locale)`) so the missing-key fallback contract (`en` → key-string) is
//     what keeps a mis-typed key from rendering `undefined` in a paying-user
//     PDF report — pin that too
//
// `VI_AI_INSTRUCTION` is a prompt fragment prepended to the system prompt for
// Vietnamese-locale SVI generation; a silent shortening / rewrite would let
// the model drop back to English mid-report — the pin covers presence + the
// mandatory "Respond ENTIRELY in Vietnamese" anchor + the technical-term
// carve-out list (SVI/ESIC/SAFE/MRR/ARR/CAC/LTV).
//
// Uses `vi.mock("next/headers")` with a per-test cookie store so `getLocale()`
// can be exercised without a live Next.js request scope.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface CookieState {
  store: Map<string, string>;
  throws: boolean;
}

const state: CookieState = {
  store: new Map(),
  throws: false,
};

function resetState() {
  state.store = new Map();
  state.throws = false;
}

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (state.throws) throw new Error("cookies() called outside request scope");
    return {
      get(name: string) {
        const v = state.store.get(name);
        return v === undefined ? undefined : { name, value: v };
      },
    };
  },
}));

import { getLocale, tx, VI_AI_INSTRUCTION, type Locale } from "./i18n";

beforeEach(() => {
  resetState();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("getLocale", () => {
  it("returns 'en' when the blockid_lang cookie is absent", async () => {
    // clean cookie jar — no cookie set
    await expect(getLocale()).resolves.toBe("en");
  });

  it("returns 'vi' when the blockid_lang cookie is exactly 'vi'", async () => {
    state.store.set("blockid_lang", "vi");
    await expect(getLocale()).resolves.toBe("vi");
  });

  it("returns 'en' when the blockid_lang cookie is 'en'", async () => {
    state.store.set("blockid_lang", "en");
    await expect(getLocale()).resolves.toBe("en");
  });

  it("returns 'en' for uppercase 'VI' — the strict === 'vi' guard is intentional", async () => {
    // If a caller ever sets the cookie uppercase (e.g. a legacy Set-Cookie
    // from an old page) the safe fallback keeps English rather than silently
    // flipping the UI language.
    state.store.set("blockid_lang", "VI");
    await expect(getLocale()).resolves.toBe("en");
  });

  it("returns 'en' for any unrecognised value (fr / zh / '' / ' vi ')", async () => {
    for (const raw of ["fr", "zh", "", " vi ", "vi ", "vietnamese"]) {
      state.store.clear();
      state.store.set("blockid_lang", raw);
      await expect(getLocale()).resolves.toBe("en");
    }
  });

  it("does not check any cookie other than blockid_lang", async () => {
    // A stray "lang=vi" cookie must not flip the locale — the reader is
    // pinned to blockid_lang so cross-site cookie names never leak in.
    state.store.set("lang", "vi");
    state.store.set("locale", "vi");
    state.store.set("i18n", "vi");
    await expect(getLocale()).resolves.toBe("en");
  });

  it("re-reads cookies each call (not memoized)", async () => {
    // Same request scope, cookie flips mid-flight — the second call must
    // reflect the new value. This pins the "read fresh every call" contract
    // that lets a locale-switch mutation take effect without a page reload.
    await expect(getLocale()).resolves.toBe("en");
    state.store.set("blockid_lang", "vi");
    await expect(getLocale()).resolves.toBe("vi");
    state.store.delete("blockid_lang");
    await expect(getLocale()).resolves.toBe("en");
  });

  it("propagates the cookies() rejection (does not swallow request-scope errors)", async () => {
    state.throws = true;
    await expect(getLocale()).rejects.toThrow(/outside request scope/);
  });
});

describe("tx", () => {
  it("returns the EN string for a known key with locale='en'", () => {
    expect(tx("executive_summary", "en")).toBe("Executive Summary");
    expect(tx("svi_score", "en")).toBe("SVI Score");
    expect(tx("first_free", "en")).toBe("First analysis FREE");
  });

  it("returns the VI string for a known key with locale='vi'", () => {
    expect(tx("executive_summary", "vi")).toBe("Tóm Tắt Điều Hành");
    expect(tx("svi_score", "vi")).toBe("Điểm SVI");
    expect(tx("first_free", "vi")).toBe("Phân tích đầu tiên MIỄN PHÍ");
  });

  it("falls back to EN when the requested locale is missing for a key", () => {
    // Guard against a future partial-add (someone adds an EN key without VI).
    // The signature is typed to Locale, but the runtime fallback uses `??`
    // chaining so an empty-VI branch would still return the EN copy rather
    // than `undefined`.
    const brokenLocale = "vi" as Locale;
    // simulate the guarded branch by feeding a key that only exists in EN —
    // the real translations map has both, so we use a key that doesn't exist
    // at all to hit the second `??`. The critical pin is that the return is
    // never `undefined`.
    expect(tx("nonexistent_key_xyz", brokenLocale)).toBe("nonexistent_key_xyz");
  });

  it("returns the raw key when the key is not in the translations map", () => {
    // This is what a report renderer sees when a mis-typed key sneaks in —
    // a visible identifier in the UI is safer than `undefined`.
    expect(tx("no_such_key", "en")).toBe("no_such_key");
    expect(tx("no_such_key", "vi")).toBe("no_such_key");
  });

  it("returns the raw key for empty-string key input", () => {
    expect(tx("", "en")).toBe("");
    expect(tx("", "vi")).toBe("");
  });

  it("is case-sensitive on the key lookup", () => {
    // "executive_summary" exists; "Executive_Summary" must NOT alias.
    expect(tx("Executive_Summary", "en")).toBe("Executive_Summary");
    expect(tx("EXECUTIVE_SUMMARY", "vi")).toBe("EXECUTIVE_SUMMARY");
  });

  it("covers every SVI report section heading key with both locales", () => {
    // The report renderer maps section-slug → tx(slug, locale). A silent
    // drop of one of these keys (or a typo in the value) would render the
    // section header as the raw slug in a paying-user PDF.
    const sectionKeys = [
      "executive_summary",
      "market_problem",
      "product_technical",
      "traction_revenue",
      "cap_table",
      "investor_readiness",
      "legal_compliance",
      "strategic_moat",
      "risk_assessment",
      "evidence_gaps",
      "next_steps",
    ];
    for (const k of sectionKeys) {
      const en = tx(k, "en");
      const vi = tx(k, "vi");
      expect(en).not.toBe(k);
      expect(vi).not.toBe(k);
      expect(en.length).toBeGreaterThan(0);
      expect(vi.length).toBeGreaterThan(0);
      // EN + VI should differ for report headings (would catch a copy-paste
      // where someone forgot to translate the VI branch)
      expect(en).not.toBe(vi);
    }
  });

  it("covers the hero-CTA keys with both locales (landing page trust bar)", () => {
    const heroKeys = [
      "get_svi",
      "try_example",
      "first_free",
      "no_credit_card",
      "no_signup",
      "describe_idea",
      "analyzing",
    ];
    for (const k of heroKeys) {
      expect(tx(k, "en")).not.toBe(k);
      expect(tx(k, "vi")).not.toBe(k);
    }
  });

  it("covers the post-report action keys (share/copy/new-analysis)", () => {
    const actionKeys = [
      "view_report",
      "sign_in",
      "upload_evidence",
      "create_account",
      "share_score",
      "copy_link",
      "new_analysis",
    ];
    for (const k of actionKeys) {
      expect(tx(k, "en")).not.toBe(k);
      expect(tx(k, "vi")).not.toBe(k);
    }
  });

  it("covers the email-subject/heading keys used by the report-ready mailer", () => {
    expect(tx("email_subject_report", "en")).toBe(
      "Your BlockID Startup Value Report is Ready",
    );
    expect(tx("email_subject_report", "vi")).toBe(
      "Báo Cáo Giá Trị Startup BlockID Đã Sẵn Sàng",
    );
    expect(tx("email_heading", "en")).toBe(
      "Your Startup Value Report is Ready",
    );
    expect(tx("email_heading", "vi")).toBe(
      "Báo Cáo Giá Trị Startup Đã Sẵn Sàng",
    );
  });

  it("covers the pagination + strengths/weaknesses labels", () => {
    expect(tx("page_of", "en")).toBe("of");
    expect(tx("page_of", "vi")).toBe("trong");
    expect(tx("strengths", "en")).toBe("Strengths");
    expect(tx("strengths", "vi")).toBe("Điểm Mạnh");
    expect(tx("weaknesses", "en")).toBe("Areas to Improve");
    expect(tx("weaknesses", "vi")).toBe("Cần Cải Thiện");
    expect(tx("your_idea", "en")).toBe("Your Idea");
    expect(tx("your_idea", "vi")).toBe("Ý Tưởng Của Bạn");
  });

  it("never returns undefined for any (key, locale) combo — belt-and-braces", () => {
    for (const key of ["executive_summary", "no_such_key", "", "svi_score"]) {
      for (const loc of ["en", "vi"] as const) {
        const out = tx(key, loc);
        expect(typeof out).toBe("string");
        expect(out).toBeDefined();
      }
    }
  });
});

describe("VI_AI_INSTRUCTION", () => {
  it("is a non-empty string", () => {
    expect(typeof VI_AI_INSTRUCTION).toBe("string");
    expect(VI_AI_INSTRUCTION.length).toBeGreaterThan(0);
  });

  it("opens with the mandatory IMPORTANT anchor so the model doesn't skim past it", () => {
    // The upstream prompt-builder concatenates this before the system prompt;
    // if the anchor drifts, the "Respond ENTIRELY in Vietnamese" directive
    // stops being the first thing the model sees.
    expect(VI_AI_INSTRUCTION.startsWith("IMPORTANT:")).toBe(true);
  });

  it("contains the 'Respond ENTIRELY in Vietnamese' directive", () => {
    expect(VI_AI_INSTRUCTION).toContain("Respond ENTIRELY in Vietnamese");
    expect(VI_AI_INSTRUCTION).toContain("tiếng Việt");
  });

  it("mentions every UI-facing translation surface that MUST be in Vietnamese", () => {
    // These names match the SVI-report renderer's section vocabulary — the
    // prompt tells the model to translate ALL of these, not just section
    // titles. Dropping one of these words has silently regressed the
    // Vietnamese report before.
    for (const surface of [
      "section titles",
      "analysis text",
      "recommendations",
      "evidence gap descriptions",
      "action items",
    ]) {
      expect(VI_AI_INSTRUCTION).toContain(surface);
    }
  });

  it("carves out the six-plus canonical acronyms so the model doesn't over-translate", () => {
    // The technical-term carve-out is what stops the model turning "MRR" into
    // "Doanh Thu Định Kỳ Hàng Tháng" mid-financial-table. Pin the full list.
    for (const acronym of ["SVI", "ESIC", "SAFE", "MRR", "ARR", "CAC", "LTV"]) {
      expect(VI_AI_INSTRUCTION).toContain(acronym);
    }
  });

  it("tells the model to still explain acronyms in Vietnamese (not just leave them)", () => {
    expect(VI_AI_INSTRUCTION).toContain("explain them in Vietnamese");
  });

  it("closes with the 'professional Vietnamese business language' register instruction", () => {
    expect(VI_AI_INSTRUCTION).toContain("professional Vietnamese business language");
  });
});
