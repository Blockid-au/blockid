/**
 * Playwright Stripe helpers — drive the mock webhook and QA endpoints.
 *
 * The real Stripe test-clock API is expensive to hit for every spec, so we
 * shell out to `scripts/stripe-mock-webhook.mjs` and the internal QA
 * endpoints (guarded by NEXT_PUBLIC_QA_MODE=true) to advance state.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const MOCK_SCRIPT = path.join(REPO_ROOT, "scripts", "stripe-mock-webhook.mjs");

function baseURL(page: Page | APIRequestContext): string {
  // both Page and APIRequestContext expose _options in Playwright internals
  const ctx = (page as any).context?.() ?? page;
  return ctx._options?.baseURL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
}

export interface AdvanceOpts {
  userId: string;
  days: number;
  subscriptionId?: string;
  customerId?: string;
}

/**
 * Fast-forward the trial clock for a QA user by firing the webhook events
 * Stripe would emit at T+days.
 */
export async function advanceTrialClock(opts: AdvanceOpts): Promise<void> {
  const sub = opts.subscriptionId ?? `sub_qa_${opts.userId}`;
  const cust = opts.customerId ?? `cus_qa_${opts.userId}`;

  // trial_will_end fires ~72h before trial_end. Emit it if we're jumping past that.
  if (opts.days >= 4) {
    postEvent({ type: "customer.subscription.trial_will_end", sub, cust, at: `T+${opts.days - 3}d` });
  }
  if (opts.days >= 7) {
    postEvent({ type: "customer.subscription.updated", sub, cust, status: "active", at: `T+${opts.days}d` });
    postEvent({ type: "invoice.paid", sub, cust, at: `T+${opts.days}d` });
  }
}

export function simulatePaymentFailure(userId: string): void {
  postEvent({
    type: "invoice.payment_failed",
    sub: `sub_qa_${userId}`,
    cust: `cus_qa_${userId}`,
    at: "T+0d",
  });
}

interface PostArgs {
  type: string;
  sub: string;
  cust: string;
  status?: string;
  at?: string;
}

function postEvent({ type, sub, cust, status, at }: PostArgs) {
  const args = ["--type", type, "--sub", sub, "--customer", cust];
  if (status) args.push("--status", status);
  if (at) args.push("--at", at);
  const res = spawnSync("node", [MOCK_SCRIPT, ...args], {
    env: process.env,
    encoding: "utf8",
  });
  if (res.status !== 0) {
    throw new Error(
      `stripe-mock-webhook ${type} failed: ${res.stderr || res.stdout}`,
    );
  }
}

/**
 * Assert an entitlement resolves to `expected` for the given user, using the
 * internal /api/entitlement/me endpoint (already landed in W2).
 */
export async function assertEntitlement(
  page: Page,
  userId: string,
  feature: string,
  expected: boolean,
): Promise<void> {
  const url = `${baseURL(page)}/api/entitlement/me?feature=${encodeURIComponent(feature)}`;
  const resp = await page.request.get(url, {
    headers: { "x-qa-user-id": userId, "x-qa-mode": "true" },
  });
  if (!resp.ok()) {
    throw new Error(`entitlement/me ${resp.status()} for feature=${feature}`);
  }
  const body = (await resp.json()) as { allowed?: boolean; can?: boolean };
  const got = body.allowed ?? body.can ?? false;
  if (got !== expected) {
    throw new Error(
      `entitlement ${feature} expected ${expected} for ${userId} but got ${got}`,
    );
  }
}
