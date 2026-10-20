// W0 (pricing v5 L0-1, founder 2026-10-20) — early warning for the report
// price-policy time bomb. `report-attempt-budget.ts` refuses every report-scoped
// AI call (paid + free) once REPORT_PRICE_POLICY_EXPIRES_AT passes; on
// 2026-10-23 that would have stopped every report with "price or request not
// admitted". This helper lets a cron raise an ops alert while there is still
// time to re-verify the DeepInfra prices and extend the window.
//
// Pure + dependency-injected (no server-only import) so it is unit-testable;
// /api/cron/ai-health-check wires it to sendTelegram (which falls back to the
// ops-alert e-mail when Telegram is unavailable). One alert per UTC day: the
// day is recorded in a small state file before the alert is sent.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export const REPORT_PRICE_POLICY_WARN_DAYS = 7;
const DAY_MS = 86_400_000;

export interface PricePolicyExpiryStatus {
  expiresAt: string;
  /** Whole-or-fractional days left, negative once expired. */
  daysLeft: number;
  expired: boolean;
  /** True when inside the warning window (or already expired). */
  warn: boolean;
}

export function reportPricePolicyExpiryStatus(expiresAt: string, now: number, warnDays = REPORT_PRICE_POLICY_WARN_DAYS): PricePolicyExpiryStatus {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return { expiresAt, daysLeft: Number.NEGATIVE_INFINITY, expired: true, warn: true };
  const daysLeft = (at - now) / DAY_MS;
  return { expiresAt, daysLeft, expired: daysLeft <= 0, warn: daysLeft < warnDays };
}

export function defaultAlertStateFile(): string {
  return join(homedir(), ".local/state/blockid-runtime/report-price-policy-alert.json");
}

export interface PricePolicyAlertDeps {
  expiresAt: string;
  now?: number;
  send: (text: string) => Promise<boolean>;
  stateFile?: string;
}

export interface PricePolicyAlertResult extends PricePolicyExpiryStatus {
  alerted: boolean;
}

/** Sends at most one alert per UTC day while the policy is within the warning
 *  window. Never throws — a failing alert must not fail the health check. */
export async function maybeAlertReportPricePolicyExpiry(deps: PricePolicyAlertDeps): Promise<PricePolicyAlertResult> {
  const now = deps.now ?? Date.now();
  const status = reportPricePolicyExpiryStatus(deps.expiresAt, now);
  if (!status.warn) return { ...status, alerted: false };
  const file = deps.stateFile ?? defaultAlertStateFile();
  const day = new Date(now).toISOString().slice(0, 10);
  try {
    const prior = JSON.parse(await readFile(file, "utf8")) as { day?: unknown; expiresAt?: unknown };
    if (prior.day === day && prior.expiresAt === deps.expiresAt) return { ...status, alerted: false };
  } catch { /* no state yet — alert */ }
  try {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, JSON.stringify({ day, expiresAt: deps.expiresAt }), { mode: 0o600 });
  } catch (err) {
    console.warn(`[report-price-policy] could not record alert day: ${err instanceof Error ? err.message : String(err)}`);
  }
  const when = status.expired
    ? `EXPIRED at ${deps.expiresAt} — every report-scoped AI call is being refused ("price or request not admitted").`
    : `expires in ${status.daysLeft.toFixed(1)} day(s), at ${deps.expiresAt}. After that every report (paid + free) fails with "price or request not admitted".`;
  const text = [
    "Report price policy (DeepInfra, report-attempt-budget.ts) " + when,
    "Fix: re-verify the 4 admitted model prices on the official DeepInfra pages, then extend REPORT_PRICE_POLICY_EXPIRES_AT (keep REPORT_PRICE_POLICY id unchanged) and deploy.",
  ].join("\n");
  let alerted = false;
  try { alerted = await deps.send(text); } catch { alerted = false; }
  return { ...status, alerted };
}
