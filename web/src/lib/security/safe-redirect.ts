// Open-redirect guard for `?next=` / `?from=` style return paths (S8-C API
// security review, 2026-09-11). Pure and client-safe — the login form
// ("use client") imports it, so no `server-only`, no Node APIs.
//
// Accepts only a same-origin absolute path: starts with a single "/", not
// "//" or "/\" (protocol-relative), no scheme, no CR/LF, no backslash
// tricks. Anything else falls back to `fallback` ("/" by default).

const MAX_LEN = 2048;

export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (typeof raw !== "string") return fallback;
  const v = raw.trim();
  if (!v || v.length > MAX_LEN) return fallback;
  if (!v.startsWith("/")) return fallback;
  // "//evil.com", "/\evil.com", "/\\evil.com" are treated as absolute by browsers.
  if (/^\/[\\/]/.test(v)) return fallback;
  if (/[\r\n\0]/.test(v)) return fallback;
  if (v.includes("\\")) return fallback;
  // A path that still parses to a different origin (defensive, e.g. "/@evil.com").
  try {
    const u = new URL(v, "https://blockid.au");
    if (u.origin !== "https://blockid.au") return fallback;
    if (u.pathname.startsWith("//")) return fallback;
  } catch {
    return fallback;
  }
  return v;
}
