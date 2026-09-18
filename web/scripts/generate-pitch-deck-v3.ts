#!/usr/bin/env npx tsx
/**
 * Startup Value Index — pre-seed pitch deck v3 (G14, 2026-09-16).
 *
 * Source of truth: content/pitch/pitch-deck-v3.md (front-matter + one fenced
 * yaml block per slide + `## 3-minute cut` + `## Provenance`). This script only
 * renders it; never hard-code a number here — put it in the md and cite it in
 * the Provenance table (the colocated test enforces that).
 *
 * Usage:
 *   npm run pitch:v3          → public/pitch/SVI-Pitch-Deck-PreSeed-2026-09.pptx
 *   npm run pitch:v3:html     → public/pitch/svi-pitch-deck-v3-preview.html
 *
 * Helpers (BRAND, addFooter, darkBg, lightBg, LAYOUT_WIDE) follow
 * scripts/generate-pitch-deck.ts (the May 2026 Antler deck, kept for history).
 * The yaml subset parser is deliberately dependency-free: `yaml` is not in
 * package.json and the deck only needs maps, block lists, list-of-maps, flow
 * lists of scalars and quoted/unquoted scalars.
 */

import PptxGenJS from "pptxgenjs";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ─── Brand (copied from generate-pitch-deck.ts) ─────────────────────────────
export const BRAND = {
  blue: "2563EB",
  blueDark: "1E40AF",
  blueLight: "DBEAFE",
  navy: "0F172A",
  navyDeep: "0B1220",
  ink800: "1E293B",
  ink700: "334155",
  ink500: "64748B",
  ink400: "94A3B8",
  ink300: "CBD5E1",
  white: "FFFFFF",
  surface50: "F8FAFC",
  surface100: "F1F5F9",
  surface200: "E2E8F0",
  emerald: "059669",
  emeraldLight: "D1FAE5",
  amber: "D97706",
  amberLight: "FEF3C7",
  red: "DC2626",
  redLight: "FEE2E2",
  gold: "FBBF24",
};

export const FOOTER_TEXT =
  "Startup Value Index by BlockID — Auschain PTY LTD | ACN 659 615 111 | Confidential";

// ─── Minimal YAML subset parser ─────────────────────────────────────────────

export type YamlValue =
  | string
  | number
  | boolean
  | null
  | YamlValue[]
  | { [key: string]: YamlValue };
export type YamlMap = { [key: string]: YamlValue };

function unquote(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"') && t.length >= 2) ||
    (t.startsWith("'") && t.endsWith("'") && t.length >= 2)
  ) {
    return t.slice(1, -1);
  }
  return t;
}

function parseScalar(raw: string): YamlValue {
  const t = raw.trim();
  if (t === "") return "";
  if (t.startsWith('"') || t.startsWith("'")) return unquote(t);
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((p) => parseScalar(p));
  }
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null" || t === "~") return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

const KEY_RE = /^("[^"]*"|'[^']*'|[^:\s][^:]*?):(?:\s+(.*))?$/;

/**
 * Parse the yaml subset used by pitch-deck-v3.md. Supports block maps, block
 * lists of scalars, lists of maps (`- key: value` + indented continuation),
 * flow lists of scalars (`[a, b]`), quoted and unquoted scalars, numbers,
 * booleans. Comments (`# …`) and blank lines are ignored. Throws on a line it
 * cannot place so a malformed slide fails loudly.
 */
export function parseYamlSubset(src: string): YamlMap {
  const items = src
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "" && !/^\s*#/.test(l))
    .map((l) => ({ indent: (l.match(/^ */) as RegExpMatchArray)[0].length, text: l.trim() }));
  let i = 0;

  function parseBlock(indent: number): YamlValue {
    if (i >= items.length) return null;
    return items[i].text.startsWith("- ") || items[i].text === "-"
      ? parseList(indent)
      : parseMap(indent);
  }

  function parseMap(indent: number): YamlMap {
    const obj: YamlMap = {};
    while (i < items.length && items[i].indent === indent && !items[i].text.startsWith("- ")) {
      const { text } = items[i];
      const m = text.match(KEY_RE);
      if (!m) throw new Error(`yaml subset: cannot parse map line "${text}"`);
      const key = unquote(m[1]);
      const rest = m[2];
      i++;
      if (rest === undefined || rest.trim() === "") {
        if (i < items.length && items[i].indent > indent) {
          obj[key] = parseBlock(items[i].indent);
        } else {
          obj[key] = null;
        }
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    if (i < items.length && items[i].indent > indent) {
      throw new Error(`yaml subset: unexpected indent at "${items[i].text}"`);
    }
    return obj;
  }

  function parseList(indent: number): YamlValue[] {
    const arr: YamlValue[] = [];
    while (i < items.length && items[i].indent === indent && items[i].text.startsWith("- ")) {
      const rest = items[i].text.slice(2).trim();
      const isQuoted = rest.startsWith('"') || rest.startsWith("'");
      const km = !isQuoted && !rest.startsWith("[") ? rest.match(KEY_RE) : null;
      if (km) {
        // list item that is a map: re-inject the first pair at indent+2 and parse the map
        items[i] = { indent: indent + 2, text: rest };
        arr.push(parseMap(indent + 2));
      } else {
        i++;
        arr.push(parseScalar(rest));
      }
    }
    return arr;
  }

  const out = parseBlock(items.length ? items[0].indent : 0);
  if (i < items.length) throw new Error(`yaml subset: trailing content at "${items[i].text}"`);
  if (out === null) return {};
  if (Array.isArray(out) || typeof out !== "object") {
    throw new Error("yaml subset: top level must be a map");
  }
  return out;
}

// ─── Deck model ─────────────────────────────────────────────────────────────

export type HeroType =
  | "ring"
  | "number"
  | "loop"
  | "screenshot"
  | "strip"
  | "ladder"
  | "bars"
  | "quadrant"
  | "tile"
  | "team"
  | "donut"
  | "messages"
  | "table";

export const HERO_TYPES: readonly HeroType[] = [
  "ring", "number", "loop", "screenshot", "strip", "ladder",
  "bars", "quadrant", "tile", "team", "donut", "messages", "table",
];

export interface DeckSlide {
  n: number;
  heading: string;
  title: string;
  sub: string;
  hero: { type: HeroType; description: string; data: YamlMap };
  bullets: string[];
  speaker: string;
  clusters: string[];
  sources: string[];
}

export interface ThreeMinuteCut {
  table: { slide: string; time: string; seconds: number; beat: string }[];
  script: string;
}

export interface Deck {
  front: YamlMap;
  slides: DeckSlide[];
  threeMinute: ThreeMinuteCut;
  provenance: string;
  raw: string;
}

function asString(v: YamlValue | undefined, what: string): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  throw new Error(`deck: ${what} must be a string`);
}

function asStringList(v: YamlValue | undefined): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new Error("deck: expected a list");
  return v.map((x) => (typeof x === "string" ? x : String(x)));
}

/** Parse content/pitch/pitch-deck-v3.md into a Deck. */
export function parseDeck(md: string): Deck {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fm) throw new Error("deck: missing front-matter");
  const front = parseYamlSubset(fm[1]);

  const slideRe = /^## Slide (\d+) — (.+?)\s*$/gm;
  const headings: { n: number; heading: string; start: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = slideRe.exec(md)) !== null) {
    headings.push({ n: Number(m[1]), heading: m[2], start: m.index, end: m.index + m[0].length });
  }
  const cutIdx = md.indexOf("\n## 3-minute cut");
  const provIdx = md.indexOf("\n## Provenance");
  if (cutIdx < 0 || provIdx < 0) throw new Error("deck: missing 3-minute cut or Provenance section");

  const slides: DeckSlide[] = headings.map((h, idx) => {
    const sectionEnd = idx + 1 < headings.length ? headings[idx + 1].start : cutIdx;
    const section = md.slice(h.end, sectionEnd);
    const blocks = [...section.matchAll(/```yaml\r?\n([\s\S]*?)```/g)];
    if (blocks.length !== 1) {
      throw new Error(`deck: slide ${h.n} must have exactly one yaml block (found ${blocks.length})`);
    }
    const y = parseYamlSubset(blocks[0][1]);
    const hero = y.hero;
    if (!hero || typeof hero !== "object" || Array.isArray(hero)) {
      throw new Error(`deck: slide ${h.n} hero must be a map`);
    }
    const heroType = asString(hero.type, `slide ${h.n} hero.type`) as HeroType;
    if (!HERO_TYPES.includes(heroType)) throw new Error(`deck: slide ${h.n} unknown hero type ${heroType}`);
    const data = hero.data && typeof hero.data === "object" && !Array.isArray(hero.data) ? (hero.data as YamlMap) : {};
    return {
      n: h.n,
      heading: h.heading,
      title: asString(y.title, `slide ${h.n} title`),
      sub: asString(y.sub ?? "", `slide ${h.n} sub`),
      hero: { type: heroType, description: asString(hero.description ?? "", `slide ${h.n} hero.description`), data },
      bullets: asStringList(y.bullets),
      speaker: asString(y.speaker, `slide ${h.n} speaker`),
      clusters: asStringList(y.clusters),
      sources: asStringList(y.sources),
    };
  });

  const cutSection = md.slice(cutIdx, provIdx);
  const table: ThreeMinuteCut["table"] = [];
  for (const row of cutSection.split(/\r?\n/)) {
    const cells = row.split("|").map((c) => c.trim());
    // | # | Slide | Time | Seconds | Beat |
    if (cells.length >= 7 && /^\d+$/.test(cells[1]) && /^\d+$/.test(cells[4])) {
      table.push({ slide: cells[2], time: cells[3], seconds: Number(cells[4]), beat: cells[5] });
    }
  }
  const scriptIdx = cutSection.indexOf("### Script");
  const script = scriptIdx >= 0 ? cutSection.slice(scriptIdx + "### Script".length).trim() : "";

  return {
    front,
    slides,
    threeMinute: { table, script },
    provenance: md.slice(provIdx),
    raw: md,
  };
}

/** Whitespace tokens that carry at least one letter or digit (mirrors hero-variants.countWords). */
export function countWords(text: string): number {
  return text.split(/\s+/).filter((tok) => /[\p{L}\p{N}]/u.test(tok)).length;
}

/** Every scalar (string / number) reachable inside a yaml value, for the provenance test. */
export function collectScalars(v: YamlValue | undefined): string[] {
  if (v === undefined || v === null || typeof v === "boolean") return [];
  if (typeof v === "string" || typeof v === "number") return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => collectScalars(x));
  return Object.values(v).flatMap((x) => collectScalars(x));
}

// ─── Rendering (PPTX) ───────────────────────────────────────────────────────

type Slide = PptxGenJS.Slide;
type TableRow = PptxGenJS.TableRow;
const FONT = "Arial";
const HERO = { x: 0.5, y: 1.85, w: 7.7, h: 4.75 }; // hero region (left)
const SIDE = { x: 8.55, y: 1.95, w: 4.3 };            // bullets column (right)

function addFooter(slide: Slide, num: number, total: number, dark = false) {
  slide.addText(
    [
      { text: FOOTER_TEXT, options: { fontSize: 7, color: dark ? BRAND.ink500 : BRAND.ink400 } },
      { text: `   ${num}/${total}`, options: { fontSize: 7, color: dark ? BRAND.ink500 : BRAND.ink400 } },
    ],
    { x: 0.5, y: 6.9, w: 12, h: 0.3, fontFace: FONT },
  );
}

function darkBg(slide: Slide) {
  slide.background = { fill: BRAND.navy };
}

function lightBg(slide: Slide) {
  slide.background = { fill: BRAND.white };
}

function str(v: YamlValue | undefined, fallback = ""): string {
  return typeof v === "string" || typeof v === "number" ? String(v) : fallback;
}

function num(v: YamlValue | undefined, fallback = 0): number {
  return typeof v === "number" ? v : typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : fallback;
}

function list(v: YamlValue | undefined): YamlValue[] {
  return Array.isArray(v) ? v : [];
}

function map(v: YamlValue | undefined): YamlMap {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as YamlMap) : {};
}

function addTitleBlock(slide: Slide, s: DeckSlide, dark: boolean) {
  slide.addText(s.title, {
    x: 0.5, y: 0.35, w: 12.3, h: 0.85, fontSize: 30, fontFace: FONT, bold: true,
    color: dark ? BRAND.white : BRAND.ink800,
  });
  if (s.sub) {
    slide.addText(s.sub, {
      x: 0.5, y: 1.15, w: 12.3, h: 0.5, fontSize: 14, fontFace: FONT,
      color: dark ? BRAND.ink400 : BRAND.ink500,
    });
  }
}

function addBullets(slide: Slide, s: DeckSlide, dark: boolean) {
  if (!s.bullets.length) return;
  slide.addText(
    s.bullets.map((b) => ({
      text: b,
      options: { bullet: { code: "25AA" }, breakLine: true, paraSpaceAfter: 8 },
    })),
    {
      x: SIDE.x, y: SIDE.y, w: SIDE.w, h: 4.3, fontSize: 13, fontFace: FONT, valign: "top",
      color: dark ? BRAND.ink300 : BRAND.ink700,
    },
  );
}

// hero renderers ──────────────────────────────────────────────────────────────

function heroRing(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const cx = HERO.x + 1.9, cy = HERO.y + 2.3, r = 1.55;
  slide.addShape(pptx.ShapeType.ellipse, { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, fill: { color: BRAND.blue } });
  slide.addShape(pptx.ShapeType.ellipse, {
    x: cx - r + 0.32, y: cy - r + 0.32, w: 2 * (r - 0.32), h: 2 * (r - 0.32),
    fill: { color: dark ? BRAND.navy : BRAND.white },
  });
  slide.addText(str(d.score), {
    x: cx - r, y: cy - 0.7, w: 2 * r, h: 0.9, fontSize: 44, bold: true, fontFace: FONT, align: "center",
    color: dark ? BRAND.white : BRAND.ink800,
  });
  slide.addText(str(d.label), {
    x: cx - r, y: cy + 0.2, w: 2 * r, h: 0.4, fontSize: 10, fontFace: FONT, align: "center",
    color: dark ? BRAND.ink400 : BRAND.ink500,
  });
  const dims = list(d.dims).map(map);
  const maxW = Math.max(1, ...dims.map((x) => num(x.weight)));
  const bx = HERO.x + 4.0, bw = 3.6, rowH = 0.52;
  dims.forEach((dim, i) => {
    const y = HERO.y + 0.25 + i * rowH;
    slide.addText(`${str(dim.key)} · ${str(dim.name)}`, {
      x: bx, y, w: bw, h: 0.24, fontSize: 9, fontFace: FONT, color: dark ? BRAND.ink300 : BRAND.ink700,
    });
    slide.addShape(pptx.ShapeType.rect, {
      x: bx, y: y + 0.26, w: (bw - 0.5) * (num(dim.weight) / maxW), h: 0.14, fill: { color: BRAND.blue },
    });
    slide.addText(String(num(dim.weight)), {
      x: bx + bw - 0.5, y: y + 0.2, w: 0.5, h: 0.26, fontSize: 9, bold: true, fontFace: FONT, align: "right",
      color: dark ? BRAND.white : BRAND.ink800,
    });
  });
}

function heroNumber(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const hasSecondary = d.secondary !== undefined;
  const colW = hasSecondary ? HERO.w / 2 : HERO.w;
  const pairs = [
    { v: str(d.value), c: str(d.caption) },
    ...(hasSecondary ? [{ v: str(d.secondary), c: str(d.secondaryCaption) }] : []),
  ];
  pairs.forEach((p, i) => {
    slide.addText(p.v, {
      x: HERO.x + i * colW, y: HERO.y + 0.4, w: colW, h: 1.9, fontSize: hasSecondary ? 80 : 120, bold: true,
      fontFace: FONT, align: "center", color: BRAND.blue,
    });
    slide.addText(p.c, {
      x: HERO.x + i * colW + 0.3, y: HERO.y + 2.4, w: colW - 0.6, h: 0.8, fontSize: 14, fontFace: FONT,
      align: "center", color: dark ? BRAND.ink300 : BRAND.ink500,
    });
  });
  const logos = list(d.logos).map((x) => String(x));
  if (logos.length) {
    const pillW = (HERO.w - 0.2 * (logos.length - 1)) / logos.length;
    logos.forEach((name, i) => {
      const x = HERO.x + i * (pillW + 0.2);
      slide.addShape(pptx.ShapeType.roundRect, {
        x, y: HERO.y + 3.7, w: pillW, h: 0.55, rectRadius: 0.1,
        fill: { color: dark ? BRAND.ink800 : BRAND.surface100 }, line: { color: BRAND.surface200, width: 0.5 },
      });
      slide.addText(name, {
        x, y: HERO.y + 3.7, w: pillW, h: 0.55, fontSize: 10, bold: true, fontFace: FONT, align: "center",
        color: dark ? BRAND.ink300 : BRAND.ink700,
      });
    });
  }
}

function heroLoop(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const steps = list(d.steps).map((x) => String(x));
  const perRow = Math.ceil(steps.length / 2);
  const gap = 0.35, boxW = (HERO.w - gap * (perRow - 1)) / perRow, boxH = 0.95;
  const topY = HERO.y + 0.6, botY = HERO.y + 3.1;
  const pos = steps.map((_, i) => {
    const onTop = i < perRow;
    const col = onTop ? i : perRow - 1 - (i - perRow);
    return { x: HERO.x + col * (boxW + gap), y: onTop ? topY : botY };
  });
  steps.forEach((label, i) => {
    const highlight = /PASS|TRACK|PROCEED|Evaluator/.test(label);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: pos[i].x, y: pos[i].y, w: boxW, h: boxH, rectRadius: 0.12,
      fill: { color: highlight ? BRAND.blue : dark ? BRAND.ink800 : BRAND.surface100 },
      line: { color: highlight ? BRAND.blueDark : BRAND.surface200, width: 0.75 },
    });
    slide.addText(label, {
      x: pos[i].x, y: pos[i].y, w: boxW, h: boxH, fontSize: 10, bold: true, fontFace: FONT, align: "center",
      valign: "middle", color: highlight ? BRAND.white : dark ? BRAND.ink300 : BRAND.ink700,
    });
    // arrow to next step (wraps around at the end)
    const j = (i + 1) % steps.length;
    const from = pos[i], to = pos[j];
    const sameRow = Math.abs(from.y - to.y) < 0.01;
    const line = { color: BRAND.ink400, width: 1.25, endArrowType: "triangle" as const };
    if (sameRow) {
      const goingRight = to.x > from.x;
      slide.addShape(pptx.ShapeType.line, {
        x: goingRight ? from.x + boxW : to.x + boxW, y: from.y + boxH / 2, w: gap, h: 0,
        line, flipH: !goingRight,
      });
    } else {
      const down = to.y > from.y;
      slide.addShape(pptx.ShapeType.line, {
        x: from.x + boxW / 2, y: down ? from.y + boxH : to.y + boxH, w: 0, h: botY - topY - boxH,
        line, flipV: !down,
      });
    }
  });
  slide.addText("loop: every verdict sends reasons back, and the founder can re-score", {
    x: HERO.x, y: HERO.y + 4.25, w: HERO.w, h: 0.35, fontSize: 10, italic: true, fontFace: FONT, align: "center",
    color: dark ? BRAND.ink400 : BRAND.ink500,
  });
}

function heroScreenshot(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean, cwd: string) {
  const rel = str(d.path);
  const abs = path.isAbsolute(rel) ? rel : path.join(cwd, rel);
  const box = { x: HERO.x, y: HERO.y, w: HERO.w, h: 4.15 };
  if (rel && fs.existsSync(abs)) {
    slide.addImage({ path: abs, ...box, sizing: { type: "contain", w: box.w, h: box.h } });
  } else {
    slide.addShape(pptx.ShapeType.roundRect, {
      ...box, rectRadius: 0.1, fill: { color: dark ? BRAND.ink800 : BRAND.surface100 },
      line: { color: BRAND.ink400, width: 1, dashType: "dash" },
    });
    slide.addText(`[screenshot placeholder]\n${rel || "no path"}\nrun scripts/tour-capture.mjs on localhost:4001 (seeded evaluator)`, {
      ...box, fontSize: 12, fontFace: FONT, align: "center", valign: "middle", color: BRAND.ink500,
    });
  }
  slide.addText(str(d.caption), {
    x: HERO.x, y: HERO.y + 4.25, w: HERO.w, h: 0.35, fontSize: 10, italic: true, fontFace: FONT, align: "center",
    color: dark ? BRAND.ink400 : BRAND.ink500,
  });
}

function heroTile(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const tiles = list(d.tiles).map(map);
  const cols = 2, gap = 0.25;
  const w = (HERO.w - gap) / cols, h = (HERO.h - gap - 0.2) / Math.ceil(tiles.length / cols);
  tiles.forEach((t, i) => {
    const x = HERO.x + (i % cols) * (w + gap), y = HERO.y + Math.floor(i / cols) * (h + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.12, fill: { color: dark ? BRAND.ink800 : BRAND.surface50 },
      line: { color: BRAND.surface200, width: 0.75 },
    });
    slide.addText(str(t.head), {
      x: x + 0.2, y: y + 0.15, w: w - 0.4, h: 0.5, fontSize: 15, bold: true, fontFace: FONT, color: BRAND.blue,
    });
    slide.addText(str(t.body), {
      x: x + 0.2, y: y + 0.65, w: w - 0.4, h: h - 0.8, fontSize: 11, fontFace: FONT, valign: "top",
      color: dark ? BRAND.ink300 : BRAND.ink700,
    });
  });
}

function heroBarChart(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean, horizontal: boolean) {
  const bars = list(d.bars).map(map);
  const labels = bars.map((b) => str(b.label));
  const values = bars.map((b) => num(b.value));
  const callout = str(d.callout);
  const chartH = callout ? HERO.h - 0.95 : HERO.h;
  slide.addChart(pptx.ChartType.bar, [{ name: str(d.unit, "value"), labels, values }], {
    x: HERO.x, y: HERO.y, w: HERO.w, h: chartH,
    barDir: horizontal ? "bar" : "col",
    chartColors: [BRAND.blue],
    showValue: true,
    dataLabelFontSize: 9,
    dataLabelColor: dark ? BRAND.ink300 : BRAND.ink700,
    dataLabelFormatCode: "#,##0",
    catAxisLabelFontSize: 9,
    catAxisLabelColor: dark ? BRAND.ink300 : BRAND.ink700,
    valAxisLabelFontSize: 8,
    valAxisLabelColor: BRAND.ink400,
    valAxisLabelFormatCode: "#,##0",
    valGridLine: { color: dark ? BRAND.ink700 : BRAND.surface200, style: "solid", size: 0.5 },
    catAxisLineShow: false,
    showLegend: false,
    showTitle: !!d.unit,
    title: str(d.unit),
    titleFontSize: 10,
    titleColor: BRAND.ink400,
  });
  if (callout) {
    slide.addShape(pptx.ShapeType.roundRect, {
      x: HERO.x, y: HERO.y + chartH + 0.15, w: HERO.w, h: 0.7, rectRadius: 0.1,
      fill: { color: BRAND.emeraldLight }, line: { color: BRAND.emerald, width: 0.75 },
    });
    slide.addText(callout, {
      x: HERO.x + 0.15, y: HERO.y + chartH + 0.15, w: HERO.w - 0.3, h: 0.7, fontSize: 12, bold: true,
      fontFace: FONT, align: "center", valign: "middle", color: BRAND.emerald,
    });
  }
}

function heroQuadrant(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const q = { x: HERO.x + 0.6, y: HERO.y + 0.2, w: HERO.w - 0.8, h: HERO.h - 0.9 };
  slide.addShape(pptx.ShapeType.rect, {
    ...q, fill: { color: dark ? BRAND.ink800 : BRAND.surface50 }, line: { color: BRAND.surface200, width: 0.75 },
  });
  const axis = { color: BRAND.ink400, width: 1 };
  slide.addShape(pptx.ShapeType.line, { x: q.x + q.w / 2, y: q.y, w: 0, h: q.h, line: axis });
  slide.addShape(pptx.ShapeType.line, { x: q.x, y: q.y + q.h / 2, w: q.w, h: 0, line: axis });
  const xAxis = list(d.xAxis).map(String), yAxis = list(d.yAxis).map(String);
  const axisText = { fontSize: 9, fontFace: FONT, color: BRAND.ink500, italic: true } as const;
  slide.addText(xAxis[0] ?? "", { x: q.x, y: q.y + q.h + 0.05, w: q.w / 2, h: 0.3, align: "left", ...axisText });
  slide.addText(xAxis[1] ?? "", { x: q.x + q.w / 2, y: q.y + q.h + 0.05, w: q.w / 2, h: 0.3, align: "right", ...axisText });
  slide.addText(yAxis[1] ?? "", { x: HERO.x - 0.1, y: q.y, w: 0.7, h: 0.6, align: "center", ...axisText });
  slide.addText(yAxis[0] ?? "", { x: HERO.x - 0.1, y: q.y + q.h - 0.6, w: 0.7, h: 0.6, align: "center", ...axisText });
  const items = list(d.items).map(map);
  const bw = 2.35, bh = 0.85;
  items.forEach((it) => {
    const fx = num(it.x), fy = num(it.y);
    const cx = q.x + fx * q.w, cy = q.y + (1 - fy) * q.h;
    const us = /Startup Value Index/.test(str(it.name));
    const x = Math.min(Math.max(cx - bw / 2, q.x + 0.05), q.x + q.w - bw - 0.05);
    const y = Math.min(Math.max(cy - bh / 2, q.y + 0.05), q.y + q.h - bh - 0.05);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: bw, h: bh, rectRadius: 0.1,
      fill: { color: us ? BRAND.blue : dark ? BRAND.navy : BRAND.white },
      line: { color: us ? BRAND.blueDark : BRAND.ink300, width: 0.75 },
    });
    slide.addText(
      [
        { text: str(it.name), options: { bold: true, fontSize: 10, breakLine: true } },
        { text: str(it.tag), options: { fontSize: 8 } },
      ],
      { x, y, w: bw, h: bh, fontFace: FONT, align: "center", valign: "middle", color: us ? BRAND.white : dark ? BRAND.ink300 : BRAND.ink700 },
    );
  });
}

function heroDonut(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const slices = list(d.slices).map(map);
  slide.addChart(
    pptx.ChartType.doughnut,
    [{ name: str(d.total, "Use of funds"), labels: slices.map((s) => str(s.label)), values: slices.map((s) => num(s.value)) }],
    {
      x: HERO.x, y: HERO.y, w: 4.2, h: 3.4, holeSize: 55,
      chartColors: [BRAND.blue, BRAND.emerald, BRAND.amber],
      showPercent: true, showValue: false, showLegend: true, legendPos: "b", legendFontSize: 9,
      legendColor: dark ? BRAND.ink300 : BRAND.ink700,
      dataLabelColor: BRAND.white, dataLabelFontSize: 10,
      showTitle: true, title: str(d.total), titleFontSize: 11, titleColor: dark ? BRAND.ink300 : BRAND.ink700,
    },
  );
  slices.forEach((s, i) => {
    slide.addText(`${str(s.label)} — A$${num(s.value)}K (${num(s.pct)}%)`, {
      x: HERO.x + 4.4, y: HERO.y + 0.2 + i * 0.5, w: HERO.w - 4.4, h: 0.45, fontSize: 11, bold: true, fontFace: FONT,
      color: [BRAND.blue, BRAND.emerald, BRAND.amber][i % 3],
    });
  });
  const ms = list(d.milestones).map(map);
  const mw = (HERO.w - 0.2 * (ms.length - 1)) / Math.max(1, ms.length);
  ms.forEach((mstone, i) => {
    const x = HERO.x + i * (mw + 0.2), y = HERO.y + 3.55;
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: mw, h: 1.15, rectRadius: 0.1, fill: { color: dark ? BRAND.ink800 : BRAND.surface50 },
      line: { color: BRAND.surface200, width: 0.75 },
    });
    slide.addText(
      [
        { text: str(mstone.when), options: { bold: true, fontSize: 11, color: BRAND.blue, breakLine: true } },
        { text: str(mstone.what), options: { fontSize: 9, color: dark ? BRAND.ink300 : BRAND.ink700 } },
      ],
      { x: x + 0.1, y, w: mw - 0.2, h: 1.15, fontFace: FONT, valign: "top" },
    );
  });
}

function heroTeam(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const founder = map(d.founder);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: HERO.x, y: HERO.y, w: 3.4, h: 2.6, rectRadius: 0.12, fill: { color: BRAND.blue },
  });
  slide.addText(
    [
      { text: str(founder.name), options: { bold: true, fontSize: 18, breakLine: true } },
      { text: str(founder.role), options: { fontSize: 10, breakLine: true } },
      { text: "", options: { fontSize: 6, breakLine: true } },
      { text: str(founder.caption), options: { fontSize: 10 } },
    ],
    { x: HERO.x + 0.2, y: HERO.y + 0.15, w: 3.0, h: 2.3, fontFace: FONT, color: BRAND.white, valign: "top" },
  );
  const agents = list(d.agents).map(String);
  const gx = HERO.x + 3.7, cols = 4, pw = 0.95, ph = 0.5, g = 0.1;
  slide.addText("11 specialist agents", {
    x: gx, y: HERO.y - 0.05, w: 4, h: 0.3, fontSize: 10, bold: true, fontFace: FONT, color: dark ? BRAND.ink300 : BRAND.ink500,
  });
  agents.forEach((a, i) => {
    const x = gx + (i % cols) * (pw + g), y = HERO.y + 0.3 + Math.floor(i / cols) * (ph + g);
    slide.addShape(pptx.ShapeType.roundRect, {
      x, y, w: pw, h: ph, rectRadius: 0.08, fill: { color: dark ? BRAND.ink800 : BRAND.surface100 },
      line: { color: BRAND.surface200, width: 0.5 },
    });
    slide.addText(a, { x, y, w: pw, h: ph, fontSize: 10, bold: true, fontFace: FONT, align: "center", valign: "middle", color: dark ? BRAND.ink300 : BRAND.ink700 });
  });
  const auditorY = HERO.y + 0.3 + Math.ceil(agents.length / cols) * (ph + g);
  slide.addShape(pptx.ShapeType.roundRect, {
    x: gx, y: auditorY, w: cols * (pw + g) - g, h: ph, rectRadius: 0.08, fill: { color: BRAND.emeraldLight }, line: { color: BRAND.emerald, width: 0.5 },
  });
  slide.addText(str(d.auditor), { x: gx, y: auditorY, w: cols * (pw + g) - g, h: ph, fontSize: 10, bold: true, fontFace: FONT, align: "center", valign: "middle", color: BRAND.emerald });
  slide.addShape(pptx.ShapeType.roundRect, {
    x: HERO.x, y: HERO.y + 2.85, w: HERO.w, h: 0.9, rectRadius: 0.12, fill: { color: BRAND.amberLight }, line: { color: BRAND.amber, width: 1, dashType: "dash" },
  });
  slide.addText(str(d.open), { x: HERO.x, y: HERO.y + 2.85, w: HERO.w, h: 0.9, fontSize: 14, bold: true, fontFace: FONT, align: "center", valign: "middle", color: BRAND.amber });
}

function heroMessages(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const msgs = list(d.messages).map(map);
  const h = 1.15, gap = 0.2;
  msgs.forEach((m, i) => {
    const y = HERO.y + i * (h + gap);
    slide.addShape(pptx.ShapeType.roundRect, {
      x: HERO.x, y, w: 12.3, h, rectRadius: 0.12, fill: { color: dark ? BRAND.ink800 : BRAND.surface50 },
      line: { color: BRAND.blue, width: 1 },
    });
    slide.addText(String(i + 1), { x: HERO.x + 0.15, y, w: 0.8, h, fontSize: 36, bold: true, fontFace: FONT, align: "center", valign: "middle", color: BRAND.blue });
    slide.addText(
      [
        { text: str(m.head), options: { bold: true, fontSize: 20, breakLine: true, color: dark ? BRAND.white : BRAND.ink800 } },
        { text: str(m.body), options: { fontSize: 12, color: dark ? BRAND.ink300 : BRAND.ink700 } },
      ],
      { x: HERO.x + 1.0, y: y + 0.1, w: 11.1, h: h - 0.2, fontFace: FONT, valign: "middle" },
    );
  });
  slide.addText(str(d.contact), {
    x: HERO.x, y: HERO.y + msgs.length * (h + gap) + 0.15, w: 12.3, h: 0.4, fontSize: 11, fontFace: FONT, align: "center",
    color: dark ? BRAND.ink400 : BRAND.ink500,
  });
}

function heroStrip(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const items = list(d.items).map((x) => (typeof x === "object" && x ? str((x as YamlMap).label) : String(x)));
  const w = (HERO.w - 0.2 * (items.length - 1)) / Math.max(1, items.length);
  items.forEach((label, i) => {
    const x = HERO.x + i * (w + 0.2);
    slide.addShape(pptx.ShapeType.roundRect, { x, y: HERO.y + 1.5, w, h: 1.2, rectRadius: 0.1, fill: { color: dark ? BRAND.ink800 : BRAND.surface100 } });
    slide.addText(label, { x, y: HERO.y + 1.5, w, h: 1.2, fontSize: 11, bold: true, fontFace: FONT, align: "center", valign: "middle", color: dark ? BRAND.ink300 : BRAND.ink700 });
  });
}

/**
 * A table row is written in the deck md as a block map (`- dim: TRE\n  weight: "20"\n  ...`),
 * one field per column, fields in column order — never a flow list (`[a, b, c]`): the yaml
 * subset's flow-list parser splits on every raw comma, which would cut a thousands separator
 * like `56,880` in half. `Object.values()` walks a parsed map in insertion order, which is the
 * order its `key: value` lines appeared in the file, so this reads back out in column order
 * regardless of the field names chosen.
 */
function tableRowCells(r: YamlValue): string[] {
  return Object.values(map(r)).map((v) => {
    if (typeof v === "string" || typeof v === "number") return String(v);
    if (typeof v === "boolean") return String(v);
    return collectScalars(v).join(" · ");
  });
}

/**
 * Appendix hero: one or more stacked tables (`d.tables: [{heading?, columns, rows}]`),
 * rendered full-width like `heroMessages` (no bullets sidebar — see the `renderPptx` skip
 * list). Column widths are equal; row/table heights are allocated proportionally to row
 * count so a 21-row rubric table and a 12-row competitor table both fit the hero region.
 */
function heroTable(pptx: PptxGenJS, slide: Slide, d: YamlMap, dark: boolean) {
  const region = { x: HERO.x, y: HERO.y, w: 12.3, h: 4.85 };
  const tables = list(d.tables).map(map);
  const headingH = 0.28;
  const headingBudget = tables.filter((t) => str(t.heading)).length * headingH;
  const totalRows = Math.max(1, tables.reduce((sum, t) => sum + 1 + list(t.rows).length, 0));
  const availH = region.h - headingBudget;

  let y = region.y;
  for (const t of tables) {
    const columns = list(t.columns).map((c) => String(c));
    const rows = list(t.rows).map(tableRowCells);
    const nRows = rows.length + 1;
    const tableH = Math.max(0.35, (availH * nRows) / totalRows);
    if (str(t.heading)) {
      slide.addText(str(t.heading), {
        x: region.x, y, w: region.w, h: headingH, fontSize: 11, bold: true, fontFace: FONT,
        color: dark ? BRAND.blueLight : BRAND.blueDark,
      });
      y += headingH;
    }
    const headerRow: TableRow = columns.map((c) => ({
      text: c,
      options: { bold: true, fontSize: 9, fontFace: FONT, color: BRAND.white, fill: { color: BRAND.blue }, align: "left", valign: "middle" },
    }));
    const bodyRows: TableRow[] = rows.map((r, i) =>
      r.map((cell) => ({
        text: cell,
        options: {
          fontSize: 8.5, fontFace: FONT, valign: "middle", align: "left",
          color: dark ? BRAND.ink300 : BRAND.ink700,
          fill: { color: dark ? BRAND.navy : i % 2 === 0 ? BRAND.white : BRAND.surface50 },
        },
      })),
    );
    slide.addTable([headerRow, ...bodyRows], {
      x: region.x, y, w: region.w, h: tableH,
      border: { type: "solid", color: dark ? BRAND.ink700 : BRAND.surface200, pt: 0.5 },
      autoPage: false,
    });
    y += tableH + 0.08;
  }
  if (str(d.note)) {
    slide.addText(str(d.note), {
      x: region.x, y: Math.min(y, region.y + region.h - 0.28), w: region.w, h: 0.3,
      fontSize: 8.5, italic: true, fontFace: FONT, color: dark ? BRAND.ink400 : BRAND.ink500,
    });
  }
}

function renderHero(pptx: PptxGenJS, slide: Slide, s: DeckSlide, dark: boolean, cwd: string) {
  const d = s.hero.data;
  switch (s.hero.type) {
    case "ring": return heroRing(pptx, slide, d, dark);
    case "number": return heroNumber(pptx, slide, d, dark);
    case "loop": return heroLoop(pptx, slide, d, dark);
    case "screenshot": return heroScreenshot(pptx, slide, d, dark, cwd);
    case "tile": return heroTile(pptx, slide, d, dark);
    case "ladder": return heroBarChart(pptx, slide, d, dark, true);
    case "bars": return heroBarChart(pptx, slide, d, dark, false);
    case "quadrant": return heroQuadrant(pptx, slide, d, dark);
    case "donut": return heroDonut(pptx, slide, d, dark);
    case "team": return heroTeam(pptx, slide, d, dark);
    case "messages": return heroMessages(pptx, slide, d, dark);
    case "strip": return heroStrip(pptx, slide, d, dark);
    case "table": return heroTable(pptx, slide, d, dark);
  }
}

/** Slides rendered on the navy background: the opener and the close. */
function isDarkSlide(s: DeckSlide, total: number): boolean {
  return s.n === 1 || s.n === total;
}

export interface RenderOptions {
  /** Override which slides render on the dark navy background (default: first + last). */
  isDark?: (s: DeckSlide, total: number) => boolean;
}

export async function renderPptx(deck: Deck, outPath: string, cwd: string, opts: RenderOptions = {}): Promise<string> {
  const isDark = opts.isDark ?? isDarkSlide;
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Do Van Long — Startup Value Index by BlockID";
  pptx.company = str(deck.front.entity, "Auschain PTY LTD");
  pptx.subject = `${str(deck.front.brand)} — ${str(deck.front.ask)} pitch deck v${str(deck.front.version)}`;
  pptx.title = `${str(deck.front.brand)} ${str(deck.front.byline)} — pre-seed deck`;

  const total = deck.slides.length;
  for (const s of deck.slides) {
    const slide = pptx.addSlide();
    const dark = isDark(s, total);
    if (dark) darkBg(slide); else lightBg(slide);
    addTitleBlock(slide, s, dark);
    renderHero(pptx, slide, s, dark, cwd);
    // the closing slide uses the full width for its three messages
    if (s.hero.type !== "messages" && s.hero.type !== "table") addBullets(slide, s, dark);
    slide.addNotes(`${s.speaker}\n\nAnswers: ${s.clusters.join(", ")}\nSources: ${s.sources.join(" | ")}`);
    addFooter(slide, s.n, total, dark);
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await pptx.writeFile({ fileName: outPath });
  return outPath;
}

// ─── Rendering (HTML preview) ───────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** HTML table(s) for the `table` hero type — mirrors `heroTable`'s pptx rendering. */
function heroTablesHtml(d: YamlMap): string {
  const tables = list(d.tables).map(map);
  const parts = tables.map((t) => {
    const columns = list(t.columns).map((c) => String(c));
    const rows = list(t.rows).map(tableRowCells);
    const heading = str(t.heading);
    const thead = columns.length ? `<thead><tr>${columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead>` : "";
    const tbody = `<tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody>`;
    return `${heading ? `<p class="hero-table-heading">${esc(heading)}</p>` : ""}<table class="hero-table">${thead}${tbody}</table>`;
  });
  const note = str(d.note);
  return parts.join("") + (note ? `<p class="hero-desc">${esc(note)}</p>` : "");
}

function heroScreenshotHtml(d: YamlMap): string {
  const rel = str(d.path);
  const abs = rel ? path.join(process.cwd(), rel) : "";
  const caption = str(d.caption);
  if (rel && fs.existsSync(abs)) {
    // Served from web/public/, so the absolute site path (not the repo-relative
    // yaml path) is what actually resolves in a browser.
    const publicPath = "/" + rel.replace(/^public\//, "");
    return `<img class="hero-screenshot" src="${esc(publicPath)}" alt="${esc(caption || "screenshot")}" loading="lazy">${caption ? `<p class="hero-desc">${esc(caption)}</p>` : ""}`;
  }
  return `<p class="hero-desc">[screenshot placeholder] ${esc(rel || "no path")} — run scripts/tour-capture.mjs on localhost:4001 (seeded evaluator)</p>`;
}

function heroSummary(s: DeckSlide): string {
  const d = s.hero.data;
  if (s.hero.type === "table") return heroTablesHtml(d);
  if (s.hero.type === "screenshot") return heroScreenshotHtml(d);
  const rows: string[] = [];
  const push = (label: string, v: YamlValue | undefined) => {
    if (v === undefined || v === null) return;
    if (Array.isArray(v)) {
      rows.push(`<li><b>${esc(label)}</b>: ${v.map((x) => (typeof x === "object" && x ? esc(collectScalars(x).join(" · ")) : esc(String(x)))).join(" → ")}</li>`);
    } else if (typeof v === "object") {
      rows.push(`<li><b>${esc(label)}</b>: ${esc(collectScalars(v).join(" · "))}</li>`);
    } else rows.push(`<li><b>${esc(label)}</b>: ${esc(String(v))}</li>`);
  };
  for (const [k, v] of Object.entries(d)) push(k, v);
  return rows.length ? `<ul class="hero-data">${rows.join("")}</ul>` : "";
}

export interface RenderHtmlOptions extends RenderOptions {
  /** Relative link + label rendered under the page meta line (main deck → appendix, or back). */
  footerLink?: { href: string; label: string };
}

export function renderHtml(deck: Deck, opts: RenderHtmlOptions = {}): string {
  const isDark = opts.isDark ?? isDarkSlide;
  const total = deck.slides.length;
  const cards = deck.slides
    .map((s) => {
      const body = countWords(s.bullets.join(" "));
      const dark = isDark(s, total);
      return `
<section class="slide${dark ? " dark" : ""}" id="slide-${s.n}">
  <div class="frame">
    <header>
      <span class="n">${s.n}/${total}</span>
      <span class="badge${body > 40 ? " over" : ""}" title="body words (bullets)">${body} words</span>
    </header>
    <h2>${esc(s.title)}</h2>
    <p class="sub">${esc(s.sub)}</p>
    <div class="cols">
      <div class="hero">
        <div class="hero-type">${esc(s.hero.type)}</div>
        <p class="hero-desc">${esc(s.hero.description)}</p>
        ${heroSummary(s)}
      </div>
      <ul class="bullets">${s.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    </div>
    <footer>${esc(FOOTER_TEXT)}</footer>
  </div>
  <p class="speaker"><span>Speaker</span> ${esc(s.speaker)} <em>(${countWords(s.speaker)} words · ${s.clusters.join(", ")})</em></p>
</section>`;
    })
    .join("\n");

  const cut = deck.threeMinute;
  const cutRows = cut.table.map((r) => `<tr><td>${esc(r.slide)}</td><td>${esc(r.time)}</td><td>${r.seconds}s</td><td>${esc(r.beat)}</td></tr>`).join("");
  const scriptParas = cut.script.split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(str(deck.front.brand))} — pre-seed deck v${esc(str(deck.front.version))} preview</title>
<meta name="robots" content="noindex">
<style>
:root{--bg:#F8FAFC;--card:#FFFFFF;--ink:#1E293B;--muted:#64748B;--line:#E2E8F0;--blue:#2563EB;--navy:#0F172A;--ok:#059669;--bad:#DC2626;--amber:#D97706}
@media (prefers-color-scheme: dark){:root{--bg:#0B1220;--card:#0F172A;--ink:#E2E8F0;--muted:#94A3B8;--line:#1E293B}}
*{box-sizing:border-box}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--ink);font:14px/1.45 Arial,Helvetica,sans-serif}
h1{font-size:22px;margin:0 0 4px}
.meta{color:var(--muted);margin:0 0 24px;font-size:12px}
.slide{max-width:1120px;margin:0 auto 32px}
.frame{aspect-ratio:16/9;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:28px 32px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.slide.dark .frame{background:var(--navy);color:#F8FAFC}
header{display:flex;justify-content:space-between;font-size:11px;color:var(--muted)}
.badge{border:1px solid var(--ok);color:var(--ok);border-radius:999px;padding:1px 8px}
.badge.over{border-color:var(--bad);color:var(--bad)}
h2{font-size:26px;margin:6px 0 2px;line-height:1.15}
.sub{margin:0 0 14px;color:var(--muted);font-size:13px}
.slide.dark .sub{color:#94A3B8}
.cols{display:grid;grid-template-columns:3fr 2fr;gap:20px;flex:1;min-height:0}
.hero{border:1px dashed var(--line);border-radius:8px;padding:12px;overflow:auto;font-size:12px}
.hero-type{display:inline-block;background:var(--blue);color:#fff;border-radius:4px;padding:1px 6px;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
.hero-desc{margin:6px 0;color:var(--muted)}
.hero-data{margin:0;padding-left:16px;color:var(--muted)}
.hero-data li{margin:2px 0}
.bullets{margin:0;padding-left:18px;font-size:14px}
.bullets li{margin:0 0 10px}
footer{font-size:9px;color:var(--muted);margin-top:8px}
.speaker{margin:8px 4px 0;font-size:13px}
.speaker span{font-weight:bold;color:var(--blue);margin-right:6px}
.speaker em{color:var(--muted);font-size:11px}
.cut{max-width:1120px;margin:0 auto 32px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px 24px}
table{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:12px}
td,th{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
.script p{margin:0 0 10px}
.hero-screenshot{max-width:100%;border:1px solid var(--line);border-radius:6px;display:block}
.hero-table{font-size:11px;margin-bottom:10px}
.hero-table th{background:var(--blue);color:#fff;font-size:10px}
.hero-table-heading{margin:4px 0;font-weight:bold;font-size:12px;color:var(--muted)}
.footer-link{max-width:1120px;margin:0 auto 24px;font-size:13px}
.footer-link a{color:var(--blue)}
@media (max-width:720px){.cols{grid-template-columns:1fr}.frame{aspect-ratio:auto}h2{font-size:20px}}
@media print{body{background:#fff;color:#000;padding:0}.slide{break-inside:avoid;page-break-inside:avoid}.frame{border-color:#999}.slide.dark .frame{background:#fff;color:#000}.slide.dark .sub{color:#444}}
</style>
</head>
<body>
<h1>${esc(str(deck.front.brand))} <small>${esc(str(deck.front.byline))}</small> — ${esc(str(deck.front.kind, "pre-seed deck"))} v${esc(str(deck.front.version))}</h1>
<p class="meta">${esc(str(deck.front.date))} · ${esc(str(deck.front.entity))} · ACN ${esc(str(deck.front.acn))} · ask ${esc(str(deck.front.ask))} · ${total} slides · preview generated from ${esc(str(deck.front.render, "the deck source md"))}</p>
${cards}
<section class="cut">
  <h2>3-minute cut <small style="font-weight:normal;color:var(--muted);font-size:13px">${countWords(cut.script)} words</small></h2>
  <table><thead><tr><th>Slide</th><th>Time</th><th>Seconds</th><th>Beat</th></tr></thead><tbody>${cutRows}</tbody></table>
  <div class="script">${scriptParas}</div>
</section>
${opts.footerLink ? `<p class="footer-link"><a href="${esc(opts.footerLink.href)}">${esc(opts.footerLink.label)}</a></p>` : ""}
</body>
</html>
`;
}

// ─── CLI ────────────────────────────────────────────────────────────────────

export const DECK_MD = path.join("content", "pitch", "pitch-deck-v3.md");
export const PPTX_OUT = path.join("public", "pitch", "SVI-Pitch-Deck-PreSeed-2026-09.pptx");
export const HTML_OUT = path.join("public", "pitch", "svi-pitch-deck-v3-preview.html");

/** Appendix deck (G14 leftover #2) — same md/yaml contract, six reference slides, own pptx/html outputs. */
export const APPENDIX_MD = path.join("content", "pitch", "pitch-deck-v3-appendix.md");
export const APPENDIX_PPTX_OUT = path.join("public", "pitch", "SVI-Pitch-Appendix-2026-09.pptx");
export const APPENDIX_HTML_OUT = path.join("public", "pitch", "svi-pitch-appendix-v3-preview.html");

export function loadDeck(cwd = process.cwd()): Deck {
  return parseDeck(fs.readFileSync(path.join(cwd, DECK_MD), "utf8"));
}

export function loadAppendixDeck(cwd = process.cwd()): Deck {
  return parseDeck(fs.readFileSync(path.join(cwd, APPENDIX_MD), "utf8"));
}

/** Appendix slides are reference tables — always light background, never the navy opener/closer treatment. */
const APPENDIX_RENDER_OPTS: RenderOptions = { isDark: () => false };

async function main() {
  const cwd = process.cwd();
  const html = process.argv.includes("--html");
  const appendix = process.argv.includes("--appendix");

  if (appendix) {
    const deck = loadAppendixDeck(cwd);
    if (html) {
      const out = path.join(cwd, APPENDIX_HTML_OUT);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(
        out,
        renderHtml(deck, {
          ...APPENDIX_RENDER_OPTS,
          footerLink: { href: path.basename(HTML_OUT), label: "← Back to the pitch deck" },
        }),
      );
      console.log(`✅ Appendix HTML preview: ${out} (${deck.slides.length} slides)`);
      return;
    }
    const out = await renderPptx(deck, path.join(cwd, APPENDIX_PPTX_OUT), cwd, APPENDIX_RENDER_OPTS);
    const kb = Math.round(fs.statSync(out).size / 1024);
    console.log(`✅ Appendix v${str(deck.front.version)}: ${out} (${deck.slides.length} slides, ${kb} KB)`);
    console.log(`   Download: /pitch/${path.basename(out)}`);
    return;
  }

  const deck = loadDeck(cwd);
  if (html) {
    const out = path.join(cwd, HTML_OUT);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      renderHtml(deck, { footerLink: { href: path.basename(APPENDIX_HTML_OUT), label: "Appendix: rubric, competitors, unit economics, ARR, backtest, use of funds →" } }),
    );
    console.log(`✅ HTML preview: ${out} (${deck.slides.length} slides)`);
    return;
  }
  const out = await renderPptx(deck, path.join(cwd, PPTX_OUT), cwd);
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`✅ Deck v${str(deck.front.version)}: ${out} (${deck.slides.length} slides, ${kb} KB)`);
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
    console.error("❌ pitch deck v3 failed:", err);
    process.exit(1);
  });
}
