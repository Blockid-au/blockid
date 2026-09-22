/**
 * Console + network guard for one page visit.
 *
 * Collects `console.error` messages, uncaught page errors and failed / ≥400
 * responses, then lets a spec assert "nothing unexpected". The only
 * allow-listed error is the Cloudflare-injected Google tag bootstrap
 * (docs/ops/analytics.md §4): two nonce-less inline scripts the edge inserts
 * that the CSP `'strict-dynamic'` correctly refuses. The allow-list is keyed
 * on the signature IN THE SERVED HTML (`google_tags_first_party` /
 * `developer_id.dYzg1YT`), so the moment the founder flips the Cloudflare
 * switch the CSP error is no longer tolerated and the check tightens itself.
 */
import type { Page, Request, Response } from "@playwright/test";

export const CF_GTM_SIGNATURES = ["google_tags_first_party", "developer_id.dYzg1YT"] as const;

/**
 * Cloudflare Scrape Shield → Email Obfuscation (S24 founder follow-up: turn
 * it OFF). On every page that prints an email address the edge rewrites the
 * text into `<a class="__cf_email__" data-cfemail=…>` and injects
 * `/cdn-cgi/scripts/<hash>/cloudflare-static/email-decode.min.js` — the CSP
 * refuses the script (nonce-less under strict-dynamic) and React 19 then
 * hydrates against DOM it did not render → "Minified React error #418".
 * Both are tolerated ONLY while the served HTML carries the signature, so the
 * check tightens itself the moment the switch is flipped.
 */
export const CF_EMAIL_SIGNATURES = ["email-decode.min.js", "__cf_email__"] as const;
const CF_EMAIL_SCRIPT_RE = /cloudflare-static\/email-decode\.min\.js/;
const REACT_418_RE = /Minified React error #418/;

/**
 * Google Identity Services (FedCM) on the sign-in pages logs these when the
 * browser has no Google account — always true in a headless run, never a
 * product error (G20-F2 page sweep, 2026-09-20). Mirrored in
 * scripts/lib/page-sweep-core.mjs (parity pinned by scripts/page-sweep.test.mjs).
 */
export const FEDCM_NOISE_RE = /^(Provider's accounts list is empty|Not signed in with the identity provider)\.?$|^\[GSI_LOGGER\]: FedCM get\(\) rejects with NetworkError|^\[auth:google\] client one_tap (unknown_reason|opt_out_or_no_session)$/;

/**
 * Chromium's wording for a refused nonce-less inline script under
 * strict-dynamic — "Refused to execute inline script because it violates…"
 * (≤ 130) and "Executing inline script violates…" (131+, seen on prod 2026-09-13).
 */
const CSP_INLINE_SCRIPT_RE = /(Refused to execute inline script because it violates|Executing inline script violates) the following Content Security Policy directive/;

/**
 * Google Identity Services' OWN report-only CSP on the sign-in button iframe
 * (`frame-ancestors 'self'`): Chromium logs the violation in the embedding
 * page's console when blockid.au frames accounts.google.com, but a report-only
 * policy blocks nothing — the button renders and the popup flow works. It is
 * Google's header, not ours, so it is never a page defect (G29-C; /auth/login,
 * /ja/auth/login, every `?next=` bounce). Only the report-only wording for
 * accounts.google.com is tolerated — an ENFORCED "Framing … violates" line
 * still fails. Mirrored in scripts/lib/page-sweep-core.mjs (parity pinned by
 * scripts/page-sweep.test.mjs).
 */
export const GSI_REPORT_ONLY_FRAME_RE = /^Framing 'https:\/\/accounts\.google\.com\/[^']*' violates the following report-only Content Security Policy directive: "frame-ancestors [^"]*"\. The violation has been logged, but no further action has been taken\.$/;

export interface ConsoleEntry {
  type: "console" | "pageerror";
  text: string;
  url?: string;
}

export interface FailedRequest {
  method: string;
  url: string;
  status: number | null;
  failure: string | null;
}

export interface GuardReport {
  page: string;
  errors: ConsoleEntry[];
  allowed: ConsoleEntry[];
  failedRequests: FailedRequest[];
  allowedRequests: FailedRequest[];
  cfInjected: boolean;
  /** Served HTML carries the Cloudflare email-obfuscation rewrite. */
  cfEmailObfuscated: boolean;
}

export interface GuardOptions {
  /** Requests whose (method, path) are expected to fail on this page (e.g. an expected 409 preview). */
  allowRequest?: Array<{ method?: string; pathRe: RegExp; status?: number }>;
}

export class ConsoleGuard {
  private readonly errors: ConsoleEntry[] = [];
  private readonly failed: FailedRequest[] = [];
  private htmlHasCfInjection = false;
  private cfInjectedDocuments = 0;
  private htmlHasCfEmail = false;

  constructor(private readonly page: Page, private readonly opts: GuardOptions = {}) {
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      this.errors.push({ type: "console", text: msg.text(), url: msg.location()?.url });
    });
    page.on("pageerror", (err) => {
      this.errors.push({ type: "pageerror", text: err.message });
    });
    page.on("requestfailed", (req: Request) => {
      if (isNoise(req)) return;
      this.failed.push({ method: req.method(), url: req.url(), status: null, failure: req.failure()?.errorText ?? null });
    });
    page.on("response", (res: Response) => {
      const req = res.request();
      // The document itself tells us whether Cloudflare injected the tag gateway.
      if (req.resourceType() === "document" && res.status() < 500) void this.sniffHtml(res);
      if (res.status() < 400) return;
      if (isNoise(req)) return;
      // RSC prefetch (`?_rsc=` or `&_rsc=` after other params) — a Link to an
      // API route prefetches with it and answers 4xx; not a page defect here.
      if (req.url().includes("/_next/data/") || /[?&]_rsc=/.test(req.url())) return;
      this.failed.push({ method: req.method(), url: res.url(), status: res.status(), failure: null });
    });
  }

  private async sniffHtml(res: Response): Promise<void> {
    try {
      const ct = res.headers()["content-type"] ?? "";
      if (!ct.includes("text/html")) return;
      const body = await res.text();
      if (CF_GTM_SIGNATURES.some((s) => body.includes(s))) {
        this.htmlHasCfInjection = true;
        // Two bootstrap scripts per injected DOCUMENT — a lane that walks
        // several pages before reporting sees two lines per page.
        this.cfInjectedDocuments += 1;
      }
      if (CF_EMAIL_SIGNATURES.some((s) => body.includes(s))) this.htmlHasCfEmail = true;
    } catch {
      /* body may be gone after navigation — a later response will refresh it */
    }
  }

  private requestAllowed(method: string | null, url: string, status: number | null): boolean {
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      return false;
    }
    return (this.opts.allowRequest ?? []).some(
      (a) => (!a.method || !method || a.method === method) && a.pathRe.test(pathname) && (a.status === undefined || status === null || a.status === status),
    );
  }

  report(pageLabel: string): GuardReport {
    const allowed: ConsoleEntry[] = [];
    const errors: ConsoleEntry[] = [];
    let cspAllowedCount = 0;
    for (const e of this.errors) {
      if (this.htmlHasCfInjection && e.type === "console" && CSP_INLINE_SCRIPT_RE.test(e.text) && cspAllowedCount < 2 * Math.max(1, this.cfInjectedDocuments)) {
        allowed.push(e);
        cspAllowedCount += 1;
        continue;
      }
      if (this.htmlHasCfEmail && ((e.type === "console" && CF_EMAIL_SCRIPT_RE.test(e.text)) || (e.type === "pageerror" && REACT_418_RE.test(e.text)))) {
        allowed.push(e);
        continue;
      }
      if (e.type === "console" && FEDCM_NOISE_RE.test(e.text.trim())) {
        allowed.push(e);
        continue;
      }
      if (e.type === "console" && GSI_REPORT_ONLY_FRAME_RE.test(e.text.trim())) {
        allowed.push(e);
        continue;
      }
      // Chromium mirrors every ≥400 resource load into the console; if the
      // request itself is allow-listed, so is its console echo.
      const m = /Failed to load resource: the server responded with a status of (\d+)/.exec(e.text);
      if (e.type === "console" && m && e.url && this.requestAllowed(null, e.url, Number(m[1]))) {
        allowed.push(e);
        continue;
      }
      errors.push(e);
    }
    const allowedRequests: FailedRequest[] = [];
    const failedRequests: FailedRequest[] = [];
    for (const f of this.failed) {
      // The refused email-decode.min.js load surfaces as requestfailed (csp) too.
      const cfEmailScript = this.htmlHasCfEmail && f.status === null && CF_EMAIL_SCRIPT_RE.test(f.url);
      (cfEmailScript || this.requestAllowed(f.method, f.url, f.status) ? allowedRequests : failedRequests).push(f);
    }
    return { page: pageLabel, errors, allowed, failedRequests, allowedRequests, cfInjected: this.htmlHasCfInjection, cfEmailObfuscated: this.htmlHasCfEmail };
  }
}

/** Analytics beacons, prefetch aborts and favicon noise never count. */
function isNoise(req: Request): boolean {
  const url = req.url();
  if (/google-analytics\.com|googletagmanager\.com|\/g\/collect|cloudflareinsights|stripe\.com\/b|r\.stripe\.com/.test(url)) return true;
  if (/\/favicon\.ico$/.test(url)) return true;
  const failure = req.failure()?.errorText ?? "";
  if (failure === "net::ERR_ABORTED") return true; // RSC prefetch cancelled by navigation
  return false;
}
