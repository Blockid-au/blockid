// report-visuals — SVG string → element tree for the non-browser twins.
//
// G13-W4-R4 (spec §C.4 / §D.1): the PDF twin must draw the SAME shapes from
// the SAME data as the web renderer. Rather than re-implementing every
// renderer's geometry a second time (and letting the two drift), the twins
// consume the renderer's own output: every `render*` function emits a strict
// subset of SVG (`svg.ts` header — rect / line / circle / path / polygon /
// polyline / text, inline attributes only, no CSS, no <pattern>, no
// <foreignObject>), which this parser turns into a small tree that
// `pdf.tsx` maps 1:1 onto @react-pdf primitives and `png.ts` rasterises.
// One geometry, three surfaces.
//
// Pure module, no DOM, no React. The grammar is exactly what `frame()` +
// the helpers in `svg.ts` produce; anything else (comments, CDATA,
// processing instructions) is ignored rather than guessed at.

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
  /** Concatenated text content (text / title / desc). */
  text: string;
}

const TAG_RE = /<(\/?)([A-Za-z][A-Za-z0-9:-]*)((?:\s+[A-Za-z_:][-A-Za-z0-9_:.]*\s*=\s*"[^"]*")*)\s*(\/?)>/g;
const ATTR_RE = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*"([^"]*)"/g;

/** Reverse of `svg.ts:esc` (plus the numeric entities our helpers never emit but browsers accept). */
export function unescapeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n: string) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(raw)) !== null) out[m[1]] = unescapeXml(m[2]);
  return out;
}

/**
 * Parse one rendered visual. Returns the root `<svg>` node (or a synthetic
 * empty root when the string carries none, so callers never branch on null).
 */
export function parseVisualSvg(svg: string): SvgNode {
  const root: SvgNode = { tag: "svg", attrs: {}, children: [], text: "" };
  const stack: SvgNode[] = [];
  let current: SvgNode = root;
  let sawRoot = false;
  let last = 0;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const source = String(svg ?? "");
  while ((m = TAG_RE.exec(source)) !== null) {
    const between = source.slice(last, m.index);
    if (current !== root && between.trim()) current.text += unescapeXml(between);
    last = m.index + m[0].length;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const selfClosing = m[4] === "/";
    if (closing) {
      // `</svg>` on the root: stack is empty, current stays root.
      if (current.tag === tag && stack.length > 0) current = stack.pop()!;
      continue;
    }
    const node: SvgNode = { tag, attrs: parseAttrs(m[3]), children: [], text: "" };
    if (tag === "svg" && !sawRoot) {
      // The outer frame: keep its attributes on the synthetic root; its
      // children land on `root` because `current` is still the root.
      sawRoot = true;
      root.attrs = node.attrs;
      continue;
    }
    current.children.push(node);
    if (!selfClosing) {
      stack.push(current);
      current = node;
    }
  }
  return root;
}

/** Numeric attribute with fallback; tolerant of "12.5px". */
export function attrNum(attrs: Record<string, string>, name: string, fallback = 0): number {
  const raw = attrs[name];
  if (raw === undefined) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

/** `viewBox="0 0 w h"` → [x, y, w, h] with a safe fallback to width/height. */
export function viewBoxOf(attrs: Record<string, string>): [number, number, number, number] {
  const vb = (attrs.viewBox ?? "").trim().split(/[\s,]+/).map((p) => Number.parseFloat(p));
  if (vb.length === 4 && vb.every((n) => Number.isFinite(n)) && vb[2] > 0 && vb[3] > 0) return [vb[0], vb[1], vb[2], vb[3]];
  const w = Math.max(1, attrNum(attrs, "width", 320));
  const h = Math.max(1, attrNum(attrs, "height", 160));
  return [0, 0, w, h];
}

/** Count drawable elements (everything except title/desc) — parity checks. */
export function countShapes(node: SvgNode): number {
  let n = 0;
  for (const c of node.children) {
    if (c.tag !== "title" && c.tag !== "desc") n += 1;
    n += countShapes(c);
  }
  return n;
}
