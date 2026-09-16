// report-visuals SVG helpers — escaping, numeric guards, accessible frame.
//
// Every renderer wraps its body with `frame()`, which emits
// `<svg role="img" aria-labelledby=…><title/><desc/>…</svg>` so the output is
// accessible on the web, printable and (S-R4) portable to react-pdf, whose
// SVG subset is path / rect / circle / line / polygon / polyline / text.
// No <pattern>, no <foreignObject>, no CSS classes — inline attributes only.

import { DATA_STATE_LABEL, INK } from "./palette";
import type { DataState } from "./types";

export const FONT = "Inter, Helvetica, Arial, sans-serif";

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Finite number or fallback — the one guard that keeps NaN out of the SVG. */
export function fin(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Fixed-precision string with no trailing zeros ("12.5", "40"). */
export function num(value: unknown, digits = 1): string {
  const v = fin(value);
  const s = v.toFixed(digits);
  if (!s.includes(".")) return s;
  return s.replace(/0+$/, "").replace(/\.$/, "");
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, fin(value, lo)));
}

/** A$ formatting shared by the valuation visuals (A$1.2M / A$850k / A$400). */
export function aud(value: unknown): string {
  const v = fin(value);
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}A$${num(abs / 1_000_000_000, 1)}B`;
  if (abs >= 1_000_000) return `${sign}A$${num(abs / 1_000_000, 1)}M`;
  if (abs >= 1_000) return `${sign}A$${num(abs / 1_000, 0)}k`;
  return `${sign}A$${num(abs, 0)}`;
}

/** Stable id token for aria-labelledby (letters, digits, dash/underscore only). */
export function idToken(id: string): string {
  const cleaned = String(id ?? "visual").replace(/[^A-Za-z0-9_-]/g, "-");
  return /^[A-Za-z]/.test(cleaned) ? cleaned : `v-${cleaned}`;
}

export function truncate(label: unknown, max: number): string {
  const s = String(label ?? "");
  return s.length > max ? `${s.slice(0, Math.max(0, max - 1))}…` : s;
}

export interface FrameOptions {
  id: string;
  title: string;
  description: string;
  width: number;
  height: number;
  dataState: DataState;
  /** Hide the data-state badge (cover strips where it would be noise). */
  hideBadge?: boolean;
}

/**
 * Wrap a body in the accessible SVG shell. The data-state badge is drawn in
 * the top-right corner of every chart (D.2: a reader never mistakes a target
 * donut for an actual cap table).
 */
export function frame(opts: FrameOptions, body: string): string {
  const id = idToken(opts.id);
  const w = Math.max(80, Math.round(fin(opts.width, 320)));
  const h = Math.max(40, Math.round(fin(opts.height, 160)));
  const badge = opts.hideBadge
    ? ""
    : `<text x="${w - 6}" y="12" text-anchor="end" font-family="${FONT}" font-size="9" fill="${INK.faint}">${esc(DATA_STATE_LABEL[opts.dataState])}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" ` +
    `role="img" aria-labelledby="${id}-title ${id}-desc" data-visual-id="${id}" data-state="${esc(opts.dataState)}">` +
    `<title id="${id}-title">${esc(opts.title)}</title>` +
    `<desc id="${id}-desc">${esc(opts.description)}</desc>` +
    badge +
    body +
    `</svg>`
  );
}

export function text(
  x: number,
  y: number,
  content: string,
  attrs: { size?: number; fill?: string; anchor?: "start" | "middle" | "end"; weight?: number | string } = {},
): string {
  return (
    `<text x="${num(x, 2)}" y="${num(y, 2)}" font-family="${FONT}" font-size="${attrs.size ?? 10}" ` +
    `fill="${attrs.fill ?? INK.text}" text-anchor="${attrs.anchor ?? "start"}"` +
    (attrs.weight ? ` font-weight="${attrs.weight}"` : "") +
    `>${esc(content)}</text>`
  );
}

/** Polar → cartesian, 0° at 12 o'clock, clockwise. */
export function polar(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const a = ((fin(angleDeg) - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

/** SVG arc path from `startDeg` sweeping clockwise to `endDeg` on radius r. */
export function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const sweep = clamp(endDeg - startDeg, 0, 359.999);
  const s = polar(cx, cy, r, startDeg);
  const e = polar(cx, cy, r, startDeg + sweep);
  const large = sweep > 180 ? 1 : 0;
  return `M ${num(s.x, 2)} ${num(s.y, 2)} A ${num(r, 2)} ${num(r, 2)} 0 ${large} 1 ${num(e.x, 2)} ${num(e.y, 2)}`;
}
