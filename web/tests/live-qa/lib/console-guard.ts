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
 * Chromium's wording for a refused nonce-less inline script under
 * strict-dynamic — "Refused to execute inline script because it violates…"
 * (≤ 130) and "Executing inline script violates…" (131+, seen on prod 2026-09-13).
 */
const CSP_INLINE_SCRIPT_RE = /(Refused to execute inline script because it violates|Executing inline script violates) the following Content Security Policy directive/;

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
}

export interface GuardOptions {
  /** Requests whose (method, path) are expected to fail on this page (e.g. an expected 409 preview). */
  allowRequest?: Array<{ method?: string; pathRe: RegExp; status?: number }>;
}

export class ConsoleGuard {
  private readonly errors: ConsoleEntry[] = [];
  private readonly failed: FailedRequest[] = [];
  private htmlHasCfInjection = false;

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
      if (req.url().includes("/_next/data/") || req.url().includes("?_rsc=")) return;
      this.failed.push({ method: req.method(), url: res.url(), status: res.status(), failure: null });
    });
  }

  private async sniffHtml(res: Response): Promise<void> {
    try {
      const ct = res.headers()["content-type"] ?? "";
      if (!ct.includes("text/html")) return;
      const body = await res.text();
      if (CF_GTM_SIGNATURES.some((s) => body.includes(s))) this.htmlHasCfInjection = true;
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
      if (this.htmlHasCfInjection && e.type === "console" && CSP_INLINE_SCRIPT_RE.test(e.text) && cspAllowedCount < 2) {
        allowed.push(e);
        cspAllowedCount += 1;
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
      (this.requestAllowed(f.method, f.url, f.status) ? allowedRequests : failedRequests).push(f);
    }
    return { page: pageLabel, errors, allowed, failedRequests, allowedRequests, cfInjected: this.htmlHasCfInjection };
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
