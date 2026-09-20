// Public claims register — extraction + lookup (G21 P0-D, 2026-09-20).
//
// `docs/design/public-claims-policy.md` classifies every quantified public
// claim as proven (production data / code fact), observed (limited customer
// usage) or hypothesis (being tested). `content/claims-register.json` is the
// ledger; `claims.test.ts` walks the marketing trees with the conservative
// extractor below and fails on any quantified claim that is not registered.
//
// Deliberately narrow: only percentages, "<n> <traction-or-product noun>",
// time-to-value phrases ("in 60 seconds", "within 14 days"), multiples
// ("8 ×") and spelled-out counts ("eight dimensions") are extracted.
// Prices (A$…) are governed by docs/ops/pricing-truth.md + stripe-map.test.ts
// and skipped here; CSS/Tailwind values, comments and import lines are
// stripped before matching.
//
// To add a claim: add the sentence to the surface, then add (or extend) a
// register row with a `patterns` entry equal to the normalised match text
// (`normaliseClaim("Eight dimensions") === "eight dimensions"`), its class,
// its source (a code path, a script, a doc) and the review date. The test
// prints the exact normalised token it could not find.

import { z } from "zod";

export const CLAIM_CLASSES = ["proven", "observed", "hypothesis"] as const;
export type ClaimClass = (typeof CLAIM_CLASSES)[number];

export const claimRowSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  claim: z.string().min(8),
  class: z.enum(CLAIM_CLASSES),
  value: z.string().min(1),
  source: z.string().min(3),
  /** Routes where the claim is shown (informational; the extractor finds the files). */
  surfaces: z.array(z.string()),
  reviewed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Normalised match texts (see normaliseClaim) that resolve to this row. */
  patterns: z.array(z.string().min(1)).min(1),
  note: z.string().optional(),
});
export type ClaimRow = z.infer<typeof claimRowSchema>;
export const claimsRegisterSchema = z.array(claimRowSchema);

/** Public trees the guard walks (relative to `web/`). */
export const CLAIM_TREES: readonly string[] = [
  "src/app/(marketing)",
  "src/components/landing",
  "src/components/marketing",
  "src/lib/marketing/hero-variants.ts",
  "src/lib/i18n/messages/en.json",
];

/**
 * Path prefixes (relative to `web/`) the guard skips: history pages carry
 * shipped-release facts with their own guard, the calibration page renders
 * statistical labels (95 % CI) from the backtest JSON, and the admin roadmap
 * is not public.
 */
export const CLAIM_EXCLUDED_PREFIXES: readonly string[] = [
  "src/app/(marketing)/roadmap/",
  "src/app/(marketing)/changelog/",
  "src/app/(marketing)/methodology/calibration/",
];

export type ClaimKind = "percent" | "count" | "time" | "multiple" | "words";

const NOUNS = [
  "startups?", "reports?", "companies", "founders?", "investors?", "evaluators?", "users?", "snapshots?",
  "dimensions?", "criteria", "levels?", "phases?", "chapters?", "pages?", "tools?", "agents?", "providers?",
  "models?", "applicants?", "organisations?", "industries", "sectors?", "comparables?", "sources?", "articles?",
  "grants?", "programs?", "pilots?", "seats?", "steps?", "questions?", "actions?", "customers?", "clients?",
  "deals?", "cohorts?", "analyses", "reviews?", "accelerators?", "advisors?", "angels?", "funds?", "firms?",
  "connectors?", "integrations?", "countries", "tiers?", "signals?", "metrics?", "records?", "documents?",
  "seconds?", "minutes?", "hours?",
].join("|");

const WORD_NUMBERS = "six|seven|eight|nine|ten|eleven|twelve|thirteen|sixteen|twenty|thirty|forty|fifty|hundred|thousand";
const WORD_NOUNS = "dimensions?|criteria|phases?|steps?|seconds?|minutes?|hours?|days?|weeks?|months?|startups?|reports?|companies|founders?|investors?|pages?|chapters?|agents?|tools?|questions?|actions?|evaluators?|organisations?";

/** Extraction patterns — every one deliberately avoids prices (`A$…`), CSS tokens and identifiers. */
export const CLAIM_PATTERNS: ReadonlyArray<{ kind: ClaimKind; re: RegExp }> = [
  { kind: "percent", re: /(?<![\w\-[#.$])\d{1,3}(?:\.\d+)?\s?%(?![\w\]])/g },
  { kind: "count", re: new RegExp(`(?<![\\w\\-[#.$/])\\d+(?:,\\d{3})*\\+?[-\\s](?:${NOUNS})\\b`, "gi") },
  { kind: "time", re: /\b(?:in|under|within)\s+~?\d+(?:\s?(?:to|–|-)\s?\d+)?\s?(?:seconds?|minutes?|hours?|days?|weeks?)\b/gi },
  { kind: "multiple", re: /(?<![\w\-[#.$])\d+(?:\.\d+)?\s?[×x](?![\w-])/g },
  { kind: "words", re: new RegExp(`\\b(?:${WORD_NUMBERS})[-\\s](?:${WORD_NOUNS})\\b`, "gi") },
];

export interface ClaimHit {
  kind: ClaimKind;
  /** The raw match. */
  text: string;
  /** normaliseClaim(text) — what the register `patterns` must contain. */
  token: string;
  line: number;
}

/** Lower-case, one space, `×` → `x`, no thousands commas, no `~`. */
export function normaliseClaim(text: string): string {
  return text
    .toLowerCase()
    .replace(/×/g, "x")
    .replace(/~/g, "")
    .replace(/(\d),(\d)/g, "$1$2")
    .replace(/[-–]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip what is never public copy while keeping line numbers stable: block
 * comments (newlines kept), `//` line comments, `className` / `class` /
 * `style` attribute values, Tailwind arbitrary values, CSS gradients and
 * import lines.
 */
export function stripNonCopy(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[\s(])\/\/(?!\s*https?:)[^\n]*/g, "$1")
    .replace(/(?:className|class|style)=\{?(?:"[^"\n]*"|'[^'\n]*'|`[^`\n]*`)\}?/g, "")
    .replace(/\[[^\]\n]*%[^\]\n]*\]/g, "")
    .replace(/[a-z-]*gradient\((?:[^()\n]|\([^()\n]*\))*\)/g, "")
    .replace(/^\s*import\b[^\n]*/gm, "");
}

/** JSON message catalogue → the public values only (keys starting `_comment` dropped), one per line, line numbers preserved. */
export function messageCatalogueCopy(src: string): string {
  return src
    .split("\n")
    .map((line) => {
      const m = /^\s*"([^"]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(line);
      if (!m) return "";
      if (m[1].startsWith("_comment")) return "";
      return m[2];
    })
    .join("\n");
}

/** Every quantified claim in `text` (already stripped), with 1-based line numbers. */
export function extractClaims(text: string): ClaimHit[] {
  const hits: ClaimHit[] = [];
  text.split("\n").forEach((line, i) => {
    for (const { kind, re } of CLAIM_PATTERNS) {
      re.lastIndex = 0;
      for (const m of line.matchAll(re)) {
        const raw = m[0];
        hits.push({ kind, text: raw, token: normaliseClaim(raw), line: i + 1 });
      }
    }
  });
  return hits;
}

/** patterns → row, for O(1) lookup in the guard. */
export function claimIndex(register: readonly ClaimRow[]): Map<string, ClaimRow> {
  const idx = new Map<string, ClaimRow>();
  for (const row of register) for (const p of row.patterns) idx.set(normaliseClaim(p), row);
  return idx;
}

/** Register rows on a class — the pitch deck's validation slide reads proven + observed only. */
export function claimsOfClass(register: readonly ClaimRow[], cls: ClaimClass): ClaimRow[] {
  return register.filter((r) => r.class === cls);
}
