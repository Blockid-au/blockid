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
  if (typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const s = raw.slice(start);
  try {
    JSON.parse(s);
    return s;
  } catch {
    /* fall through to the rewind */
  }

  const stack: string[] = [];
  const awaitingKey: boolean[] = [];
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
      continue;
    }
    if (c === "}" || c === "]") {
      if (!stack.length) return null;
      stack.pop();
      awaitingKey.pop();
      markGood(i + 1);
      continue;
    }
    if (c === ",") {
      if (stack[stack.length - 1] === "{") awaitingKey[awaitingKey.length - 1] = true;
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
    return null;
  }

  if (!stack.length) return null;

  if (inStr && !strIsKey && strStart >= 0) {
    // Cut inside a prose value: keep whole sentences (else whole words), close the string.
    const body = s.slice(strStart + 1).replace(/\\$/, "");
    const cut = lastSentenceEnd(body);
    const kept = (cut > 0 ? body.slice(0, cut) : body.slice(0, Math.max(0, body.lastIndexOf(" ")))).replace(/\\+$/, "").trimEnd();
    if (kept.length > 0) {
      let out = `${s.slice(0, strStart + 1)}${kept}"`;
      for (let d = stack.length - 1; d >= 0; d--) out += CLOSER[stack[d]!];
      try {
        JSON.parse(out);
        return out;
      } catch {
        /* fall back to the last complete value */
      }
    }
  }
  if (lastGood < 0) return null;
  let out = s.slice(0, lastGood);
  for (let d = lastGoodStack.length - 1; d >= 0; d--) out += CLOSER[lastGoodStack[d]!];
  try {
    JSON.parse(out);
    return out;
  } catch {
    return null;
  }
}
