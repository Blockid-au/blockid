#!/usr/bin/env npx tsx
/**
 * BlockID — pitch deck v4 (G21 P0-D, 2026-09-20): evidence-backed startup
 * assessment infrastructure, ten slides + a five-slide appendix.
 *
 * Source of truth: content/pitch/pitch-deck-v4.md (+ pitch-deck-v4-appendix.md)
 * in the v3 contract (front-matter, one fenced yaml block per slide,
 * `## 3-minute cut`, `## Provenance`). The parser and the pptx / html renderers
 * are the v3 ones (scripts/generate-pitch-deck-v3.ts); this file only owns the
 * v4 inputs, outputs, and the footer / metadata, which come from
 * lib/site/legal-entity.ts — never a literal. Never hard-code a number here:
 * put it in the md and cite it in Provenance (pitch-deck-v4.test.ts enforces).
 *
 * Usage:
 *   npm run pitch:v4                 → public/pitch/BlockID-Pitch-Deck-2026-09.pptx
 *   npm run pitch:v4:html            → public/pitch/blockid-pitch-deck-v4-preview.html
 *   npm run pitch:v4:appendix        → public/pitch/BlockID-Pitch-Appendix-2026-09.pptx
 *   npm run pitch:v4:appendix:html   → public/pitch/blockid-pitch-appendix-v4-preview.html
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { LEGAL_ENTITY, legalLine } from "../src/lib/site/legal-entity";
import { parseDeck, renderHtml, renderPptx, type Deck, type RenderOptions } from "./generate-pitch-deck-v3";

export { parseDeck, collectScalars, countWords, HERO_TYPES, parseYamlSubset } from "./generate-pitch-deck-v3";

// ─── Entity strings (config, never literals) ────────────────────────────────

/** "<brand> — <operator> (ACN …, ABN …) | Confidential" — every part from the config. */
export const FOOTER_TEXT_V4 = `${LEGAL_ENTITY.brand} — ${legalLine()} | Confidential`;
export const AUTHOR_V4 = `Do Van Long — ${LEGAL_ENTITY.brand} (${LEGAL_ENTITY.operator})`;

/** The three messages every surface carries (docs/design/messaging.md § 4b). */
export const THREE_MESSAGES = ["Screen faster", "Trust the evidence", "Track improvement"] as const;

/** Approved one-liner (goal doc § 0). */
export const ONE_LINER =
  "BlockID helps accelerators and startup programs screen companies consistently by converting founder submissions and company evidence into one comparable, evidence-backed startup assessment.";

/** Institutional line (goal doc § 0). */
export const INSTITUTIONAL_LINE = "BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.";

// ─── Inputs / outputs ───────────────────────────────────────────────────────

export const DECK_MD_V4 = path.join("content", "pitch", "pitch-deck-v4.md");
export const PPTX_OUT_V4 = path.join("public", "pitch", "BlockID-Pitch-Deck-2026-09.pptx");
export const HTML_OUT_V4 = path.join("public", "pitch", "blockid-pitch-deck-v4-preview.html");

export const APPENDIX_MD_V4 = path.join("content", "pitch", "pitch-deck-v4-appendix.md");
export const APPENDIX_PPTX_OUT_V4 = path.join("public", "pitch", "BlockID-Pitch-Appendix-2026-09.pptx");
export const APPENDIX_HTML_OUT_V4 = path.join("public", "pitch", "blockid-pitch-appendix-v4-preview.html");

export function loadDeckV4(cwd = process.cwd()): Deck {
  return parseDeck(fs.readFileSync(path.join(cwd, DECK_MD_V4), "utf8"));
}

export function loadAppendixDeckV4(cwd = process.cwd()): Deck {
  return parseDeck(fs.readFileSync(path.join(cwd, APPENDIX_MD_V4), "utf8"));
}

/** Entity parity: the md front-matter must name the config's operator and ACN. */
export function assertEntityFromConfig(deck: Deck): void {
  const entity = String(deck.front.entity ?? "");
  const acn = String(deck.front.acn ?? "");
  if (entity !== LEGAL_ENTITY.operator) throw new Error(`deck v4: front-matter entity "${entity}" ≠ LEGAL_ENTITY.operator "${LEGAL_ENTITY.operator}"`);
  if (acn !== LEGAL_ENTITY.acn) throw new Error(`deck v4: front-matter acn "${acn}" ≠ LEGAL_ENTITY.acn "${LEGAL_ENTITY.acn}"`);
}

const MAIN_OPTS: RenderOptions = {
  footerText: FOOTER_TEXT_V4,
  author: AUTHOR_V4,
  docTitle: `${LEGAL_ENTITY.brand} — evidence-backed startup assessment infrastructure — deck v4`,
};

/** Appendix slides are reference tables — always light background. */
const APPENDIX_OPTS: RenderOptions = { ...MAIN_OPTS, isDark: () => false };

// ─── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const cwd = process.cwd();
  const html = process.argv.includes("--html");
  const appendix = process.argv.includes("--appendix");

  const deck = appendix ? loadAppendixDeckV4(cwd) : loadDeckV4(cwd);
  assertEntityFromConfig(deck);

  if (html) {
    const out = path.join(cwd, appendix ? APPENDIX_HTML_OUT_V4 : HTML_OUT_V4);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      renderHtml(deck, {
        ...(appendix ? APPENDIX_OPTS : MAIN_OPTS),
        footerLink: appendix
          ? { href: path.basename(HTML_OUT_V4), label: "← Back to the deck" }
          : { href: path.basename(APPENDIX_HTML_OUT_V4), label: "Appendix: features, methodology, valuation, legal, architecture →" },
      }),
    );
    console.log(`✅ ${appendix ? "Appendix" : "Deck"} v${String(deck.front.version)} HTML preview: ${out} (${deck.slides.length} slides)`);
    return;
  }

  const out = await renderPptx(deck, path.join(cwd, appendix ? APPENDIX_PPTX_OUT_V4 : PPTX_OUT_V4), cwd, appendix ? APPENDIX_OPTS : MAIN_OPTS);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`✅ ${appendix ? "Appendix" : "Deck"} v${String(deck.front.version)}: ${out} (${deck.slides.length} slides, ${kb} KB)`);
  console.log(`   Download: /pitch/${path.basename(out)}`);
}

const isCli =
  typeof process !== "undefined" &&
  process.argv[1] !== undefined &&
  (() => {
    try {
      return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
    } catch {
      return false;
    }
  })();

if (isCli) {
  main().catch((err) => {
    console.error("❌ pitch deck v4 failed:", err);
    process.exit(1);
  });
}
