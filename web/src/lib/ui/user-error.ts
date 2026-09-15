// S31-E — one place that turns a caught error into copy a user may read.
//
// Client-safe: no server imports, no React. Two rules the whole UI leans on:
//
//   1. A message reaches the screen only when we *know* where it came from —
//      a structured API body (`{ ok:false, error, code }`) read through
//      `readErrorBody()` / `ApiError.fromBody()`, or a code we map here.
//      Anything else (a bare `Error`, a string, a database / AI-provider
//      exception, `TypeError: Failed to fetch`) collapses to the caller's
//      `fallback` or one of the fixed sentences below. `err.message` from an
//      unknown throwable is never echoed.
//   2. Even a structured body's free-text `error` is screened: snake_case
//      slugs, stack traces, SQL, vendor names and anything longer than a
//      sentence are replaced with the fallback.
//
// Usage (fetch caller):
//
//     const res = await fetch("/api/x", …);
//     if (!res.ok) throw await readErrorBody(res);
//     …
//   } catch (err) {
//     console.error("[x] save", err);                 // raw, for developers
//     setError(userErrorMessage(err, "Could not save. Please try again."));
//   }

export interface ApiErrorBody {
  ok?: boolean;
  error?: unknown;
  code?: unknown;
  message?: unknown;
  reason?: unknown;
  feature?: unknown;
  plan?: unknown;
  required_plan?: unknown;
  plan_name?: unknown;
  retry_after_sec?: unknown;
  retry_after_seconds?: unknown;
  required?: unknown;
  creditsRequired?: unknown;
  credits_needed?: unknown;
  balance?: unknown;
  status?: unknown;
  [key: string]: unknown;
}

/** A non-2xx API answer whose body we parsed. Thrown by fetch callers. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody | null | undefined) {
    const b: ApiErrorBody = body && typeof body === "object" ? body : {};
    const code = codeOf(b);
    super(
      typeof b.error === "string" && b.error.length > 0
        ? b.error
        : code ?? `HTTP ${status}`,
    );
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.body = b;
  }

  /** Build from an already-parsed body (callers that `await res.json()` once). */
  static fromBody(status: number, body: unknown): ApiError {
    return new ApiError(status, body as ApiErrorBody);
  }
}

/**
 * An error whose message *we* wrote for the user (local validation, a
 * pre-flight check). `userErrorMessage` shows it verbatim.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function isUserError(err: unknown): err is UserError {
  return (
    err instanceof UserError ||
    (typeof err === "object" && err !== null && (err as { name?: unknown }).name === "UserError")
  );
}

export function isApiError(err: unknown): err is ApiError {
  return (
    err instanceof ApiError ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: unknown }).name === "ApiError" &&
      typeof (err as { status?: unknown }).status === "number")
  );
}

/**
 * Read a failed `Response` into an `ApiError` (never throws; a non-JSON body
 * becomes `{}` so the status alone drives the copy).
 */
export async function readErrorBody(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
  } catch {
    body = null;
  }
  return new ApiError(res.status, body as ApiErrorBody);
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const USER_ERROR_COPY = {
  network: "Connection problem — check your network and try again.",
  unauthorized: "Please sign in again.",
  forbidden: "You don't have access to this.",
  not_found: "We couldn't find that. It may have been removed.",
  rate_limited: "Too many requests — wait a moment and try again.",
  credits_unknown: "You need more credits to do this.",
  feature_locked_unknown: "This isn't included in your plan — see Pricing to upgrade.",
  generic: "Something went wrong. Please try again.",
  wallet_rejected: "You cancelled the request in your wallet.",
  wallet_pending: "Your wallet already has a request open — switch to it to continue.",
  wallet_network: "Your wallet is on the wrong network — switch networks and try again.",
} as const;

const KNOWN_BARE_CODES = new Set(["unauthorized", "forbidden", "unauthenticated"]);

function codeOf(b: ApiErrorBody): string | undefined {
  for (const k of ["code", "error", "reason"] as const) {
    const v = b[k];
    if (typeof v === "string" && isSlug(v)) return v;
  }
  return undefined;
}

function isSlug(s: string): boolean {
  return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(s) || KNOWN_BARE_CODES.has(s);
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function planLabel(b: ApiErrorBody, opt?: string): string | undefined {
  const raw =
    opt ??
    ((typeof b.plan === "string" && b.plan) ||
      (typeof b.required_plan === "string" && b.required_plan) ||
      (typeof b.plan_name === "string" && b.plan_name) ||
      undefined);
  if (!raw) return undefined;
  // "founder_growth" → "Growth"; "Growth" stays "Growth".
  const last = raw.split(/[_\s-]+/).filter(Boolean).pop() ?? raw;
  return last.charAt(0).toUpperCase() + last.slice(1);
}

function copyForCode(code: string, b: ApiErrorBody, opts?: UserErrorOptions): string | undefined {
  switch (code) {
    case "ai_capacity_busy": {
      const secs = num(b.retry_after_sec) ?? num(b.retry_after_seconds) ?? 30;
      return `AI capacity is busy — try again in about ${Math.max(1, Math.round(secs))} seconds.`;
    }
    case "feature_locked":
    case "plan_required": {
      const plan = planLabel(b, opts?.plan);
      return plan ? `This needs the ${plan} plan.` : USER_ERROR_COPY.feature_locked_unknown;
    }
    case "insufficient_credits":
    case "credit_spend_failed": {
      const required = num(b.required) ?? num(b.creditsRequired) ?? num(b.credits_needed);
      const balance = num(b.balance);
      if (required !== undefined) {
        const more = balance !== undefined ? Math.max(1, required - balance) : required;
        return `You need ${more} more credit${more === 1 ? "" : "s"}.`;
      }
      return USER_ERROR_COPY.credits_unknown;
    }
    case "unauthorized":
    case "unauthenticated":
    case "not_authenticated":
    case "no_user":
    case "session_expired":
      return USER_ERROR_COPY.unauthorized;
    case "rate_limited":
    case "rate_limit_exceeded":
    case "too_many_requests":
      return USER_ERROR_COPY.rate_limited;
    case "forbidden":
    case "not_admin":
      return USER_ERROR_COPY.forbidden;
    case "not_found":
      return USER_ERROR_COPY.not_found;
    default:
      return undefined;
  }
}

function copyForStatus(status: number): string | undefined {
  if (status === 401) return USER_ERROR_COPY.unauthorized;
  if (status === 403) return USER_ERROR_COPY.forbidden;
  if (status === 404) return USER_ERROR_COPY.not_found;
  if (status === 429) return USER_ERROR_COPY.rate_limited;
  return undefined;
}

// Free-text screen: a structured body's `error` string is shown only when it
// reads like a sentence we wrote for a person.
const LEAKY =
  /\b(select|insert|delete)\b[\s\S]*\b(from|into)\b|\bupdate\b[\s\S]*\bset\b|\bpg[a-z_]*\b|postgres|supabase|prisma|\bsql\b|\bat\s+\S+\s*\(|\.[tj]sx?:\d+|node_modules|\beconn(?:reset|refused)\b|\betimedout\b|\benotfound\b|\b(?:openai|anthropic|claude|gemini|groq|mistral|openrouter|deepseek|cohere|together\.ai|fireworks|cerebras|xai|ollama|stripe)\b|api[_ -]?key|\bstack\b|\bundefined is not\b|cannot read propert|\bof (?:null|undefined)\b|unexpected token|\bjson\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export function isSafeUserCopy(s: unknown): s is string {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 3 || t.length > 240) return false;
  if (isSlug(t)) return false;
  if (/^https?:\/\//i.test(t)) return false;
  if (/^(HTTP|status)\s*\d{3}/i.test(t)) return false;
  if (LEAKY.test(t)) return false;
  // Must contain a space (a sentence, not an identifier) and start with a letter.
  if (!/\s/.test(t) || !/^[A-Za-z]/.test(t)) return false;
  return true;
}

const NETWORK_RE =
  /failed to fetch|networkerror|network request failed|load failed|network error|fetch failed|err_internet_disconnected|err_network|internet connection appears to be offline/i;

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) return true;
  if (typeof err === "string") return NETWORK_RE.test(err);
  if (typeof err === "object" && err !== null) {
    const name = (err as { name?: unknown }).name;
    const message = (err as { message?: unknown }).message;
    if (name === "NetworkError") return true;
    if (typeof message === "string" && NETWORK_RE.test(message)) return true;
  }
  return false;
}

export interface UserErrorOptions {
  /** Override / supply the error code when the caller already knows it. */
  code?: string;
  /** Plan label for `feature_locked` when the body does not carry one. */
  plan?: string;
}

/**
 * The one sentence a user may read for `err`. `fallback` is what they see
 * whenever we cannot say something more specific and safe.
 */
export function userErrorMessage(err: unknown, fallback: string, opts?: UserErrorOptions): string {
  const fb = fallback && fallback.trim() ? fallback : USER_ERROR_COPY.generic;

  // 1. Explicit code wins.
  if (opts?.code) {
    const c = copyForCode(opts.code, bodyOf(err), opts);
    if (c) return c;
  }

  // 2. Copy we authored for the user.
  if (isUserError(err) && typeof err.message === "string" && err.message.trim()) return err.message;

  // 3. Wallet (EIP-1193 / ethers) user actions — the only provider codes we name.
  const wallet = walletCopy(err);
  if (wallet) return wallet;

  // 3b. Network problems (offline, DNS, CORS, aborted connection).
  if (isNetworkError(err)) return USER_ERROR_COPY.network;

  // 4. Structured API errors.
  if (isApiError(err)) {
    const b = err.body;
    const code = err.code ?? codeOf(b);
    if (code) {
      const c = copyForCode(code, b, opts);
      if (c) return c;
    }
    const byStatus = copyForStatus(err.status);
    if (byStatus) return byStatus;
    if (err.status >= 500) return fb;
    if (isSafeUserCopy(b.message)) return b.message;
    if (isSafeUserCopy(b.error)) return b.error;
    return fb;
  }

  // 5. A raw body object passed straight in (`{ ok:false, error:"…" }`).
  if (typeof err === "object" && err !== null && !(err instanceof Error)) {
    const b = err as ApiErrorBody;
    if ("error" in b || "code" in b || "ok" in b) {
      const code = codeOf(b);
      if (code) {
        const c = copyForCode(code, b, opts);
        if (c) return c;
      }
      const status = num(b.status);
      if (status !== undefined) {
        const s = copyForStatus(status);
        if (s) return s;
        if (status >= 500) return fb;
      }
      if (isSafeUserCopy(b.message)) return b.message;
      if (isSafeUserCopy(b.error)) return b.error;
      return fb;
    }
  }

  // 6. `throw new Error("insufficient_credits")` / `throw new Error("HTTP 429")`
  //    — legacy fetch callers that threw the body's slug. Map the code only;
  //    never echo the message.
  const msg =
    typeof err === "string"
      ? err
      : typeof err === "object" && err !== null && typeof (err as { message?: unknown }).message === "string"
        ? (err as { message: string }).message
        : "";
  const t = msg.trim();
  if (t) {
    if (isSlug(t)) {
      const c = copyForCode(t, {}, opts);
      if (c) return c;
    }
    const http = /^HTTP\s+(\d{3})\b/i.exec(t);
    if (http) {
      const s = copyForStatus(Number(http[1]));
      if (s) return s;
    }
  }

  return fb;
}

function walletCopy(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null) return undefined;
  const code = (err as { code?: unknown }).code;
  const inner = (err as { cause?: unknown; error?: unknown }).cause ?? (err as { error?: unknown }).error;
  const innerCode = typeof inner === "object" && inner !== null ? (inner as { code?: unknown }).code : undefined;
  const c = code ?? innerCode;
  if (c === 4001 || c === "ACTION_REJECTED") return USER_ERROR_COPY.wallet_rejected;
  if (c === -32002) return USER_ERROR_COPY.wallet_pending;
  if (c === 4902 || c === "UNSUPPORTED_NETWORK") return USER_ERROR_COPY.wallet_network;
  return undefined;
}

function bodyOf(err: unknown): ApiErrorBody {
  if (isApiError(err)) return err.body;
  if (typeof err === "object" && err !== null && !(err instanceof Error)) return err as ApiErrorBody;
  return {};
}
