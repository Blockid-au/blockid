// G19-S45 — TBR string parity + Vietnamese diacritics.
//
//   1. Every locale carries exactly the same key tree as EN (nested blocks
//      included) — a missing key would render `undefined` in a chapter.
//   2. Functions take the same arity in every locale.
//   3. The `vi` block is real Vietnamese: ≥ 50 diacritic characters across
//      the shell strings, zero of the old ASCII-stripped labels, and the D6
//      survey question verbatim.
//   4. `CRITERIA[].titleVi` and `DIMENSION_OWNERS[*].titleVi` carry diacritics.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CRITERIA } from "@/lib/evaluation-criteria";
import { DIMENSION_OWNERS } from "@/lib/report-pipeline/dimension-owners";
import { TBR_STRINGS, TBR_V3_STRINGS, TBR_VALUATION_STRINGS, getTbrStrings, getTbrV3Strings, type TbrLocale } from "./tbr-strings";

const LOCALES: TbrLocale[] = ["en", "vi", "es", "ja"];

/** Flatten a strings object into "a.b.c" → typeof / function arity. */
function shape(obj: unknown, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "function") out.set(key, `fn/${v.length}`);
    else if (v && typeof v === "object") for (const [ck, cv] of shape(v, key)) out.set(ck, cv);
    else out.set(key, typeof v);
  }
  return out;
}

/** Sample every string leaf, calling functions with plausible arguments. */
function leaves(obj: unknown): string[] {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (typeof v === "function") {
      try {
        const r = (v as (...a: unknown[]) => unknown)(7, 3, 5, "x", "y", 2);
        if (typeof r === "string") out.push(r);
        else if (Array.isArray(r)) for (const s of r) if (typeof s === "string") out.push(s);
      } catch {
        /* a helper that needs richer args is fine to skip */
      }
    } else if (v && typeof v === "object") for (const c of Object.values(v as Record<string, unknown>)) walk(c);
  };
  walk(obj);
  return out;
}

const DIACRITIC_RE = /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚÝĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ]/g;

/** The ASCII-stripped labels the audit found (02-audit-ux.md §i18n) — none may survive. */
const ASCII_STRIPPED = [
  "Bao cao Kinh doanh Tin cay",
  "Tom tat Dieu hanh",
  "Khia canh",
  "Phu luc",
  "Chia se voi Nha dau tu",
  "Dang phat trien",
  "Giai doan som",
  "Trang bia",
  "Ke hoach hanh dong",
  "Muc luc",
  "Y tuong & Doi moi",
  "Ho so Nha sang lap",
];

describe("TbrStrings key parity across locales", () => {
  const en = shape(TBR_STRINGS.en);

  it.each(LOCALES.filter((l) => l !== "en"))("%s has exactly the EN key tree with the same function arity", (locale) => {
    const other = shape(TBR_STRINGS[locale]);
    const missing = [...en.keys()].filter((k) => !other.has(k));
    const extra = [...other.keys()].filter((k) => !en.has(k));
    expect(missing, `missing in ${locale}`).toEqual([]);
    expect(extra, `extra in ${locale}`).toEqual([]);
    for (const [k, t] of en) expect(other.get(k), `${locale}.${k}`).toBe(t);
  });

  it("no string leaf is empty in any locale", () => {
    for (const locale of LOCALES) for (const s of leaves(TBR_STRINGS[locale])) expect(s.trim().length, locale).toBeGreaterThan(0);
  });

  it("getTbrStrings falls back to EN for an unknown locale and returns the v2 block everywhere", () => {
    expect(getTbrStrings(undefined)).toBe(TBR_STRINGS.en);
    expect(getTbrStrings("xx" as TbrLocale)).toBe(TBR_STRINGS.en);
    for (const l of LOCALES) expect(getTbrStrings(l).v2.survey.question.length).toBeGreaterThan(5);
  });

  it("valuation strings (EN / VI) keep key parity too", () => {
    const en = shape(TBR_VALUATION_STRINGS.en);
    const vi = shape(TBR_VALUATION_STRINGS.vi);
    expect([...en.keys()].filter((k) => !vi.has(k))).toEqual([]);
    expect([...vi.keys()].filter((k) => !en.has(k))).toEqual([]);
  });

  // G27 — the v3 investment-view block: same key tree + arity, VI is a real translation.
  it("v3 investment-view strings (EN / VI) keep key parity, the same arity, and VI carries diacritics", () => {
    const en = shape(TBR_V3_STRINGS.en);
    const vi = shape(TBR_V3_STRINGS.vi);
    expect([...en.keys()].filter((k) => !vi.has(k))).toEqual([]);
    expect([...vi.keys()].filter((k) => !en.has(k))).toEqual([]);
    for (const [k, t] of en) expect(vi.get(k), `vi.${k}`).toBe(t);
    const enLeaves = leaves(TBR_V3_STRINGS.en);
    const viLeaves = leaves(TBR_V3_STRINGS.vi);
    expect(viLeaves.length).toBe(enLeaves.length);
    for (const s of [...enLeaves, ...viLeaves]) expect(s.trim().length).toBeGreaterThan(0);
    expect((viLeaves.join("\n").match(DIACRITIC_RE) ?? []).length).toBeGreaterThanOrEqual(100);
    const same = viLeaves.filter((s, i) => s === enLeaves[i] && s.trim().split(/\s+/).length >= 3);
    expect(same, `identical EN/VI sentences: ${same.join(" | ")}`).toEqual([]);
    expect(getTbrV3Strings("vi")).toBe(TBR_V3_STRINGS.vi);
    expect(getTbrV3Strings("ja")).toBe(TBR_V3_STRINGS.en);
    // The mandatory sub-line (spec § 4) is verbatim in both locales.
    expect(TBR_V3_STRINGS.en.subline).toBe("Based on the evidence supplied and the SVI rubric. BlockID structures the evidence; evaluators and founders make the decision. General information, not financial product advice.");
    expect(TBR_V3_STRINGS.vi.subline).toBe("Dựa trên bằng chứng đã cung cấp và bộ tiêu chí SVI. BlockID sắp xếp bằng chứng; nhà đánh giá và nhà sáng lập tự ra quyết định. Thông tin chung, không phải lời khuyên về sản phẩm tài chính.");
  });
});

describe("Vietnamese diacritics (G19-S45)", () => {
  const viLeaves = leaves(TBR_STRINGS.vi);
  const viText = viLeaves.join("\n");

  it("the vi block carries ≥ 50 diacritic characters and none of the ASCII-stripped labels", () => {
    expect((viText.match(DIACRITIC_RE) ?? []).length).toBeGreaterThanOrEqual(50);
    for (const bad of ASCII_STRIPPED) expect(viText, bad).not.toContain(bad);
  });

  it("the source file's vi block itself has no ASCII-stripped label (guards a partial revert)", () => {
    const src = readFileSync(path.join(__dirname, "tbr-strings.ts"), "utf8");
    const start = src.indexOf("const vi: TbrStrings = {");
    const end = src.indexOf("const es: TbrStrings = {");
    expect(start).toBeGreaterThan(-1);
    const block = src.slice(start, end);
    expect((block.match(DIACRITIC_RE) ?? []).length).toBeGreaterThanOrEqual(50);
    for (const bad of ASCII_STRIPPED) expect(block, bad).not.toContain(bad);
  });

  it("headline labels are the diacritic forms", () => {
    const vi = TBR_STRINGS.vi;
    expect(vi.reportTitle).toBe("Báo cáo Kinh doanh Tin cậy");
    expect(vi.secExecutive).toBe("Tóm tắt Điều hành");
    expect(vi.tocDimensions).toBe("8 Khía cạnh");
    expect(vi.bandDeveloping).toBe("Đang phát triển");
    expect(vi.v2.survey.question).toBe("Báo cáo này có rõ ràng và hữu ích không?");
    expect(vi.v2.band.pending).toBe("Chưa đánh giá");
  });

  it("every v2 leaf differs from EN in VI (a real translation, not a copy) except shared tokens", () => {
    const en = leaves(TBR_STRINGS.en.v2);
    const vi = leaves(TBR_STRINGS.vi.v2);
    expect(vi.length).toBe(en.length);
    // "/100", "+7 SVI", "startup" (a loanword in VI) may match; sentences (≥ 3 words) must not.
    const same = vi.filter((s, i) => s === en[i] && s.trim().split(/\s+/).length >= 3);
    expect(same, `identical EN/VI sentences: ${same.join(" | ")}`).toEqual([]);
  });

  it("CRITERIA[].titleVi and DIMENSION_OWNERS[*].titleVi carry diacritics", () => {
    for (const c of CRITERIA) expect((c.titleVi.match(DIACRITIC_RE) ?? []).length, `${c.key}: ${c.titleVi}`).toBeGreaterThan(0);
    for (const [dim, owner] of Object.entries(DIMENSION_OWNERS)) expect((owner.titleVi.match(DIACRITIC_RE) ?? []).length, `${dim}: ${owner.titleVi}`).toBeGreaterThan(0);
    for (const bad of ASCII_STRIPPED) for (const c of CRITERIA) expect(c.titleVi).not.toContain(bad);
  });
});
