// Static introspection of the typed analytics registries (S23-B).
//
// `AnalyticsEventMap` (src/lib/analytics.ts) and `AnalyticsEvent`
// (src/lib/analytics/events.ts) are TypeScript *types*, so nothing can
// enumerate them at runtime. The GA4 dimension registry and the event-name
// limits test need the event → param-name table, so this module parses the
// source text with a small brace-aware scanner (no TS compiler dependency —
// the .mjs CLI imports it too). Pure; the callers pass the file contents in.

export interface EventParamTable {
  /** event name → param names (in declaration order, deduplicated) */
  events: Map<string, string[]>;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function stripStrings(src: string): string {
  return src.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g, '""');
}

/** Param names inside one payload type text, e.g. `{ step: 1 | 2; slug?: string }`. */
export function paramNamesOf(payloadText: string): string[] {
  const text = stripStrings(payloadText);
  // Record<string, never> / Record<string, X> carry no fixed params.
  if (!text.includes("{")) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  // Only depth-1 keys: walk braces so a nested Record<…> or object type does
  // not contribute its inner keys.
  let depth = 0;
  let buf = "";
  const flush = () => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:/.exec(buf);
    if (m && !seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
    buf = "";
  };
  for (const ch of text) {
    if (ch === "{") {
      depth += 1;
      if (depth === 1) buf = "";
      continue;
    }
    if (ch === "}") {
      if (depth === 1) flush();
      depth -= 1;
      continue;
    }
    if (depth === 1) {
      if (ch === ";" || ch === ",") flush();
      else buf += ch;
    }
  }
  return out;
}

/**
 * Parse `export interface AnalyticsEventMap { … }` from src/lib/analytics.ts.
 */
export function parseAnalyticsEventMap(source: string): EventParamTable {
  const clean = stripComments(source);
  const start = clean.search(/export\s+interface\s+AnalyticsEventMap\s*\{/);
  if (start < 0) throw new Error("AnalyticsEventMap interface not found");
  const open = clean.indexOf("{", start);
  // Find the matching close brace of the interface body.
  let depth = 0;
  let end = -1;
  for (let i = open; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) throw new Error("AnalyticsEventMap interface not terminated");
  const body = clean.slice(open + 1, end);

  const events = new Map<string, string[]>();
  // Split the body into `name: <type>;` members at depth 0.
  let member = "";
  depth = 0;
  const commit = () => {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([\s\S]*)$/.exec(member.trim());
    if (m) events.set(m[1], paramNamesOf(m[2]));
    member = "";
  };
  for (const ch of body) {
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    if (ch === ";" && depth === 0) {
      commit();
      continue;
    }
    member += ch;
  }
  if (member.trim()) commit();
  return { events };
}

/**
 * Parse the server registry's discriminated union
 * `{ name: "x"; params: { … } }` members from src/lib/analytics/events.ts.
 */
export function parseServerEventUnion(source: string): EventParamTable {
  const clean = stripComments(source);
  const events = new Map<string, string[]>();
  const re = /\{\s*name:\s*"([a-z0-9_]+)"\s*;\s*params:\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    // Read the balanced `{ … }` that follows `params:`.
    let i = re.lastIndex;
    while (i < clean.length && clean[i] !== "{") i += 1;
    let depth = 0;
    let j = i;
    for (; j < clean.length; j += 1) {
      if (clean[j] === "{") depth += 1;
      else if (clean[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    events.set(m[1], paramNamesOf(clean.slice(i, j + 1)));
    re.lastIndex = j;
  }
  return { events };
}

/** All params across both registries: param → events carrying it. */
export function paramIndex(tables: EventParamTable[]): Map<string, string[]> {
  const idx = new Map<string, string[]>();
  for (const t of tables) {
    for (const [ev, params] of t.events) {
      for (const p of params) {
        const list = idx.get(p) ?? [];
        if (!list.includes(ev)) list.push(ev);
        idx.set(p, list);
      }
    }
  }
  return idx;
}
