/**
 * Hero one-liners — the approved, speakable lines that introduce BlockID
 * from the founder's side, the investor's side, and to the public
 * (G11 §4i D-5, T0250). This file is the single catalogue; `messages/en.json`
 * / `vi.json` carry the same strings under `hero.line.*` and the colocated
 * test pins the two together.
 *
 * WHY NOT `lib/sales/cta-variants.ts`. That catalogue is keyed
 * `phase:surface` with no arm dimension and an exhaustive-count test
 * (`allCtaKeys().length === phases × surfaces`); hero arms live here instead
 * and reach GA4 as the `arm` param on `hero_variant_shown` (plan §8.1
 * correction 7).
 *
 * SPEAKABILITY (the acceptance test, plan D-5):
 *   - ≤ 2 sentences ([.!?]) and ≤ 20 words per breath unit — a breath unit
 *     is a sentence split further on an em dash, colon or semicolon, because
 *     that is where a speaker pauses. F1 is one sentence of 21 words but two
 *     breaths of 8 + 13, which is the whole reason it reads aloud in < 6 s.
 *   - Vietnamese is written one syllable per whitespace token, ~1.4 syllables
 *     per word, so VI lines are capped at 28 syllables per breath unit
 *     (20 × 1.4) and only the count is checked — the jargon list is English.
 *   - No internal jargon: "SVI", "SCN", "tokenisation", "PhD" never appear.
 *     ("Startup Value Index" spelled out is allowed — I3 is brand-forward on
 *     purpose.)
 *
 * TRUTH (G9/G10): every number is live or verifiable — "8 investor
 * dimensions" is the shipped SVI rubric, "60 seconds" is the on-screen
 * free score, "every open Australian grant" is the free `/funding/grants`
 * directory. One line was softened against the plan text: F3 said "the
 * grants you qualify for — free", but the eligibility match is the A$3
 * Money Finder (`/funding` says so on the page); the free thing is the
 * directory, so F3 now promises that. Recorded in
 * `docs/plans/value-first-hero-goal.md` (G11-P14 note).
 */

export type FounderLineId = "F1" | "F2" | "F3" | "F4";
export type InvestorLineId = "I1" | "I2" | "I3";
export type GeneralLineId = "G1" | "G2" | "G3";
export type HeroLineId = FounderLineId | InvestorLineId | GeneralLineId;

/** The homepage H1 arms that `?hero=` can select. F1 is the SSR default. */
export type HeroArm = "F1" | "F2" | "F3";
export const HERO_ARMS: readonly HeroArm[] = ["F1", "F2", "F3"];
export const HERO_DEFAULT_ARM: HeroArm = "F1";

/** Per-breath-unit word cap (EN), sentence cap, and the VI syllable cap. */
export const MAX_WORDS_PER_UNIT = 20;
export const MAX_SENTENCES = 2;
export const MAX_VI_SYLLABLES_PER_UNIT = 28;

export interface HeroLine {
  id: HeroLineId;
  /** Where the line is meant to be used. */
  role: string;
  en: string;
  vi: string;
  /** English word count of the whole line (standalone punctuation excluded). */
  words: number;
  /** The per-breath-unit cap the line is held to. */
  maxWords: typeof MAX_WORDS_PER_UNIT;
  /** English sentence count ([.!?]); must be ≤ MAX_SENTENCES. */
  sentences: number;
}

// ─── Counting helpers ────────────────────────────────────────────────────────

/** Whitespace tokens that carry at least one letter or digit ("—" is not a word). */
export function countWords(text: string): number {
  return text
    .split(/\s+/)
    .filter((tok) => /[\p{L}\p{N}]/u.test(tok)).length;
}

/** Sentences = non-empty runs between [.!?]. */
export function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** Breath units = sentences split further on em dash, colon, semicolon. */
export function splitBreathUnits(text: string): string[] {
  return text
    .split(/[.!?]+|—|:|;/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

/** Internal jargon that must never reach a spoken line (plan D-5). */
export const FORBIDDEN_TOKENS: readonly RegExp[] = [
  /\bSVI\b/,
  /\bSCN\b/,
  /tokeni[sz]ation/i,
  /\bPhD\b/i,
];

export interface SpeakabilityResult {
  ok: boolean;
  sentences: number;
  /** Longest breath unit, in words (EN) or syllables (VI). */
  longestUnit: number;
  problems: string[];
}

/**
 * The D-5 acceptance test for one line. VI lines are checked on counts only.
 */
export function speakabilityCheck(
  line: string,
  opts: { locale?: "en" | "vi" } = {},
): SpeakabilityResult {
  const locale = opts.locale ?? "en";
  const problems: string[] = [];
  const sentences = splitSentences(line).length;
  const units = splitBreathUnits(line);
  const longestUnit = units.reduce((m, u) => Math.max(m, countWords(u)), 0);
  const cap = locale === "vi" ? MAX_VI_SYLLABLES_PER_UNIT : MAX_WORDS_PER_UNIT;

  if (sentences === 0) problems.push("empty line");
  if (sentences > MAX_SENTENCES) {
    problems.push(`${sentences} sentences (max ${MAX_SENTENCES})`);
  }
  if (longestUnit > cap) {
    problems.push(
      `longest breath unit is ${longestUnit} ${locale === "vi" ? "syllables" : "words"} (max ${cap})`,
    );
  }
  if (locale === "en") {
    for (const re of FORBIDDEN_TOKENS) {
      if (re.test(line)) problems.push(`forbidden token ${re.source}`);
    }
  }
  return { ok: problems.length === 0, sentences, longestUnit, problems };
}

function line(id: HeroLineId, role: string, en: string, vi: string): HeroLine {
  return {
    id,
    role,
    en,
    vi,
    words: countWords(en),
    maxWords: MAX_WORDS_PER_UNIT,
    sentences: splitSentences(en).length,
  };
}

// ─── The catalogue ───────────────────────────────────────────────────────────

/** Founder / customer view. F1 = homepage H1 default, F3 = homepage sub-line. */
export const FOUNDER_LINES: readonly HeroLine[] = [
  line(
    "F1",
    "homepage H1 (default arm)",
    "See your startup the way an investor will — your score, what it's worth, and where the money is, in 60 seconds.",
    "Nhìn startup của bạn theo cách nhà đầu tư nhìn — điểm số, giá trị, và tiền có thể xin ở đâu, trong 60 giây.",
  ),
  line(
    "F2",
    "homepage H1 (arm 2 — the three questions: where / worth / next)",
    "Know where you stand, prove what you're worth, and find the money — before you pitch.",
    "Biết mình đang ở đâu, chứng minh mình đáng giá bao nhiêu, và tìm được tiền — trước khi đi gọi vốn.",
  ),
  line(
    "F3",
    "homepage sub-line under the omnibox (arm 3 as H1)",
    "Paste your idea. Get an investor-ready score, a valuation range and every open Australian grant — free.",
    "Dán ý tưởng vào. Nhận điểm sẵn sàng gọi vốn, khoảng định giá và mọi grant Úc đang mở — miễn phí.",
  ),
  line(
    "F4",
    "spoken — elevator / meetup version",
    "It's like a credit score for startups — you paste your idea and it tells you your score, your valuation range, and which grants and investors fit you.",
    "Giống như điểm tín nhiệm cho startup — bạn dán ý tưởng vào, nó cho bạn biết điểm số, khoảng định giá, và grant cùng nhà đầu tư nào phù hợp.",
  ),
];

/** Investor view. I1 = `/solutions/investor` H1 candidate. */
export const INVESTOR_LINES: readonly HeroLine[] = [
  line(
    "I1",
    "/solutions/investor H1 (default)",
    "One score across 8 investor dimensions, backed by evidence — screen an Australian startup in minutes, not weeks.",
    "Một điểm số trên 8 tiêu chí nhà đầu tư quan tâm, có bằng chứng — sàng lọc startup Úc trong vài phút thay vì vài tuần.",
  ),
  line(
    "I2",
    "investor — shipped artefacts (Trust Report link, per-investor links)",
    "See if a founder is investor-ready before the first coffee: one score, one trust report, one link.",
    "Biết founder đã sẵn sàng gọi vốn hay chưa trước cả buổi cà phê đầu tiên: một điểm số, một báo cáo tin cậy, một đường link.",
  ),
  line(
    "I3",
    "investor — brand-forward index narrative",
    "The Startup Value Index: a live, evidence-backed score for Australian startups — so you back the ones that are actually ready.",
    "Startup Value Index: điểm số cập nhật, có bằng chứng, cho startup Úc — để bạn rót vốn vào những công ty thực sự sẵn sàng.",
  ),
];

/** General / public — press, bios, friends. G1 = site `og:description`. */
export const GENERAL_LINES: readonly HeroLine[] = [
  line(
    "G1",
    "bio / press / site og:description",
    "BlockID is Australia's startup readiness score — it tells founders what they're worth and where to get money, and tells investors who's ready.",
    "BlockID là điểm sẵn sàng của startup Úc — cho founder biết mình đáng giá bao nhiêu và xin tiền ở đâu, cho nhà đầu tư biết ai đã sẵn sàng.",
  ),
  line(
    "G2",
    "tagline (3 words)",
    "A credit score for startups.",
    "Điểm tín nhiệm cho startup.",
  ),
  line(
    "G3",
    "one-breath pitch",
    "Founders paste an idea and get a score, a valuation and a list of grants and investors that fit. Investors get the same score to screen deals faster.",
    "Founder dán ý tưởng vào và nhận điểm số, định giá, cùng danh sách grant và nhà đầu tư phù hợp. Nhà đầu tư dùng chính điểm đó để sàng lọc deal nhanh hơn.",
  ),
];

export const ALL_HERO_LINES: readonly HeroLine[] = [
  ...FOUNDER_LINES,
  ...INVESTOR_LINES,
  ...GENERAL_LINES,
];

const BY_ID: ReadonlyMap<HeroLineId, HeroLine> = new Map(
  ALL_HERO_LINES.map((l) => [l.id, l]),
);

/** Look a line up by id; throws on an id that is not in the catalogue. */
export function heroLine(id: HeroLineId): HeroLine {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`hero line ${id} is not in the catalogue`);
  return found;
}

// ─── Arm selection ───────────────────────────────────────────────────────────

/** Parse a `?hero=` value (case-insensitive); null when it is not an arm. */
export function parseHeroArm(value: string | null | undefined): HeroArm | null {
  if (!value) return null;
  const up = value.trim().toUpperCase();
  return (HERO_ARMS as readonly string[]).includes(up) ? (up as HeroArm) : null;
}

/** FNV-1a 32-bit — small, dependency-free, stable across runtimes. */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export interface PickHeroVariantOptions {
  /** Explicit override (e.g. from `?hero=F2`); wins over the seed. */
  arm?: HeroArm | string | null;
  /** Stable per-visitor value (GA client id, a cookie) → deterministic bucket. */
  seed?: string | null;
}

/**
 * Choose the H1 arm. Override > seeded bucket > default F1. Same seed always
 * lands in the same bucket, and the three buckets are equal-width.
 */
export function pickHeroVariant(opts: PickHeroVariantOptions = {}): HeroArm {
  const forced = parseHeroArm(typeof opts.arm === "string" ? opts.arm : null);
  if (forced) return forced;
  const seed = opts.seed?.trim();
  if (!seed) return HERO_DEFAULT_ARM;
  return HERO_ARMS[fnv1a32(seed) % HERO_ARMS.length]!;
}
