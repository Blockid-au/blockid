// json-salvage — the hard trim before a JSON parse (G23-A, fix b).
//
// A structured model call that overruns its output budget comes back cut
// mid-JSON ("Unterminated string in JSON at position 9569" on the BlockID
// showcase run of 2026-09-21: cfo/revenue and cpo/idea both lost their first
// answer, the repair pass was cut the same way, and each fell back to a third
// prose-only call). The salvage rewinds the raw text to the last COMPLETE
// value — or, when the cut landed inside a prose string, to the last full
// sentence of that string — and closes every open string / array / object so
// the rest of the answer survives the parse. Nothing is invented: every byte
// of the output was written by the model; the salvage only drops the tail.
//
// Pure, client-safe, no dependencies. Never throws.

const CLOSER: Record<string, string> = { "{": "}", "[": "]" };

/** True when a JSON.parse error message describes an output cut short (not a syntax slip). */
/** A cut string with no sentence end is kept (to its last word) only when it is prose this long. */
export const SALVAGE_MIN_PROSE_WORDS = 40;

export function looksTruncated(message: string): boolean {
  return /Unterminated string|Unexpected end of JSON|Unexpected end of input|Expected .*after|Expected double-quoted property name|Expected property name/i.test(message);
}

/** Position after the last sentence end (". " / "! " / "? " / ".\\n") inside a JSON-escaped string body, or -1. */
function lastSentenceEnd(body: string): number {
  let best = -1;
  const re = /[.!?]["’”)\]]?(?=\s|\\n|$)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    // Never cut right after a backslash (an escape in flight) or inside a decimal ("A$1.2").
    const after = m.index + m[0].length;
    const prev = body[m.index - 1];
    if (prev === "\\") continue;
    if (m[0][0] === "." && /\d/.test(prev ?? "") && /\d/.test(body[m.index + 1] ?? "")) continue;
    best = after;
  }
  return best;
}

/**
 * Rewind a truncated JSON document to its last complete value and close it.
 * Returns the repaired text (guaranteed to `JSON.parse`) or `null` when the
 * input is not a truncated document (no opening brace, or nothing complete).
 * A document that already parses is returned unchanged.
 */
export function salvageTruncatedJson(raw: string): string | null {
  return salvageScan(raw).primary;
}

/**
 * G36: every salvage of a truncated document, best first. The first entry is
 * `salvageTruncatedJson`'s answer (when there is one); the rest drop the
 * PARTIAL trailing element of each array still open at the cut, innermost
 * first, then close the document. Measured on the 2026-11-25 showcase run:
 * clo/dataroom was cut at its 2,600-token budget inside the `risks` array —
 * the last-complete-value rewind kept `{"area_id": …, "title": …}` of the
 * half-written risk, which no schema accepts, so the salvage was thrown away
 * and the repair pass (cut the same way) cost a third, prose-only call.
 * Dropping the half-written element keeps every risk / citation / highlight
 * the model did finish. Like the rewind, nothing is invented — the
 * alternatives only drop more of the tail. Every entry `JSON.parse`s;
 * duplicates are removed. Callers validate each against their schema and
 * keep the first that passes.
 */
export function salvageTruncatedJsonCandidates(raw: string): string[] {
  const { primary, drops } = salvageScan(raw);
  const out: string[] = [];
  for (const c of [primary, ...drops]) if (c !== null && !out.includes(c)) out.push(c);
  return out;
}

function salvageScan(raw: string): { primary: string | null; drops: string[] } {
  const none = { primary: null, drops: [] as string[] };
  if (typeof raw !== "string") return none;
  const start = raw.indexOf("{");
  if (start < 0) return none;
  const s = raw.slice(start);
  try {
    JSON.parse(s);
    return { primary: s, drops: [] };
  } catch {
    /* fall through to the rewind */
  }

  const stack: string[] = [];
  const awaitingKey: boolean[] = [];
  /** Per stack level: where an array's CURRENT element starts (just after "[" or at its ","); -1 for objects. */
  const elemStart: number[] = [];
  let inStr = false;
  let esc = false;
  let strStart = -1;
  let strIsKey = false;
  let lastGood = -1;
  let lastGoodStack = "";
  const markGood = (end: number) => {
    lastGood = end;
    lastGoodStack = stack.join("");
  };

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === "\"") {
        inStr = false;
        if (strIsKey) awaitingKey[awaitingKey.length - 1] = false;
        else markGood(i + 1);
      }
      continue;
    }
    if (c === "\"") {
      inStr = true;
      strStart = i;
      strIsKey = stack[stack.length - 1] === "{" && awaitingKey[awaitingKey.length - 1] === true;
      continue;
    }
    if (c === "{" || c === "[") {
      stack.push(c);
      awaitingKey.push(c === "{");
      elemStart.push(c === "[" ? i + 1 : -1);
      continue;
    }
    if (c === "}" || c === "]") {
      if (!stack.length) return none;
      stack.pop();
      awaitingKey.pop();
      elemStart.pop();
      markGood(i + 1);
      continue;
    }
    if (c === ",") {
      if (stack[stack.length - 1] === "{") awaitingKey[awaitingKey.length - 1] = true;
      else if (stack[stack.length - 1] === "[") elemStart[elemStart.length - 1] = i;
      continue;
    }
    if (c === ":" || /\s/.test(c)) continue;
    // Number / literal token: complete only when a delimiter follows it.
    const m = /^(?:-?\d[\d.eE+-]*|true|false|null)/.exec(s.slice(i));
    if (m) {
      const end = i + m[0].length;
      if (end < s.length && /[\s,}\]]/.test(s[end]!)) markGood(end);
      i = end - 1;
      continue;
    }
    // Anything else is a syntax error the salvage does not understand.
    return none;
  }

  if (!stack.length) return none;

  // G36: one alternative per array open at the cut — its partial element dropped.
  const drops: string[] = [];
  for (let d = stack.length - 1; d >= 0; d--) {
    if (stack[d] !== "[") continue;
    let out = s.slice(0, elemStart[d]!).trimEnd();
    for (let k = d; k >= 0; k--) out += CLOSER[stack[k]!];
    try {
      JSON.parse(out);
      drops.push(out);
    } catch {
      /* not a closable prefix — skip this level */
    }
  }

  if (inStr && !strIsKey && strStart >= 0) {
    // Cut inside a prose value: keep whole sentences (else whole words), close the string.
    const body = s.slice(strStart + 1).replace(/\\$/, "");
    const cut = lastSentenceEnd(body);
    // Without a sentence end only long prose keeps its words (a cut
    // highlight / title such as "Revenue is not" would invert meaning —
    // review G23 P2); short strings fall back to the last complete value.
    const words = body.trim().split(/\s+/).filter(Boolean).length;
    const kept = (cut > 0 ? body.slice(0, cut) : words >= SALVAGE_MIN_PROSE_WORDS ? body.slice(0, Math.max(0, body.lastIndexOf(" "))) : "").replace(/\\+$/, "").trimEnd();
    if (kept.length > 0) {
      let out = `${s.slice(0, strStart + 1)}${kept}"`;
      for (let d = stack.length - 1; d >= 0; d--) out += CLOSER[stack[d]!];
      try {
        JSON.parse(out);
        return { primary: out, drops };
      } catch {
        /* fall back to the last complete value */
      }
    }
  }
  if (lastGood < 0) return { primary: null, drops };
  let out = s.slice(0, lastGood);
  for (let d = lastGoodStack.length - 1; d >= 0; d--) out += CLOSER[lastGoodStack[d]!];
  try {
    JSON.parse(out);
    return { primary: out, drops };
  } catch {
    return { primary: null, drops };
  }
}
