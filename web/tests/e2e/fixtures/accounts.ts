/**
 * Playwright account fixture — logs a QA test user in.
 *
 * Two auth strategies are supported (in preference order):
 *   1. Direct-set Supabase session cookie via the service-role admin API,
 *      returning a short-lived JWT. Fastest; used in CI.
 *   2. Magic-link stub: hits `/api/qa/login` (only enabled when
 *      `NEXT_PUBLIC_QA_MODE=true`) which returns a signed cookie.
 *
 * QA passwords are read from /tmp/blockid-qa-accounts.txt as written by
 * `scripts/seed-test-users.mjs`.
 */

import { readFileSync } from "node:fs";
import type { BrowserContext, Page } from "@playwright/test";

const PW_FILE = process.env.QA_ACCOUNTS_FILE ?? "/tmp/blockid-qa-accounts.txt";

export type QaSegment =
  | "founder"
  | "investor_angel"
  | "investor_vc"
  | "advisor"
  | "accelerator"
  | "lp";

export interface QaAccount {
  email: string;
  password: string;
  plan: string;
  status: string;
  segment: QaSegment;
}

let cache: Map<string, QaAccount> | null = null;

function loadAccounts(): Map<string, QaAccount> {
  if (cache) return cache;
  cache = new Map();
  let text: string;
  try {
    text = readFileSync(PW_FILE, "utf8");
  } catch {
    return cache;
  }
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const [email, password, plan, status] = line.split("\t");
    if (!email || !password) continue;
    const seg = /^qa-([a-z_]+)-\d+@/.exec(email)?.[1] as QaSegment | undefined;
    if (!seg) continue;
    cache.set(email, { email, password, plan: plan ?? "free", status: status ?? "active", segment: seg });
  }
  return cache;
}

export function getAccount(email: string): QaAccount {
  const a = loadAccounts().get(email);
  if (!a) {
    throw new Error(
      `QA account ${email} not found in ${PW_FILE}. Run scripts/seed-test-users.mjs first.`,
    );
  }
  return a;
}

export function accountsForSegment(segment: QaSegment): QaAccount[] {
  return [...loadAccounts().values()].filter((a) => a.segment === segment);
}

export function allAccounts(): QaAccount[] {
  return [...loadAccounts().values()];
}

/**
 * Log the browser context in as the given account.
 * Prefers the QA login endpoint (fast, deterministic). Falls back to the
 * public sign-in form if `NEXT_PUBLIC_QA_MODE` is unset.
 */
export async function loginAs(page: Page, email: string): Promise<QaAccount> {
  const account = getAccount(email);
  const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";

  // Strategy 1 — QA endpoint.
  try {
    const resp = await page.request.post(`${baseURL}/api/qa/login`, {
      data: { email: account.email, password: account.password },
      headers: { "x-qa-mode": "true" },
    });
    if (resp.ok()) {
      // Cookies are set on the request context; propagate to browser context.
      const cookies = await page.request.storageState();
      await (page.context() as BrowserContext).addCookies(cookies.cookies);
      await page.goto(`${baseURL}/dashboard`);
      return account;
    }
  } catch {
    /* fall through */
  }

  // Strategy 2 — public sign-in form (slower).
  await page.goto(`${baseURL}/signin`);
  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel(/password/i).fill(account.password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((u) => !/signin/.test(u.pathname), { timeout: 15_000 });
  return account;
}

export async function logout(page: Page): Promise<void> {
  const baseURL = page.context()._options.baseURL ?? "http://localhost:3000";
  await page.context().clearCookies();
  await page.goto(baseURL);
}
