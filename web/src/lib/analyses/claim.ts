// Claim-on-auth — the one call a signup or login makes to rescue the work a
// visitor did before they had an account.
//
// Sequence, and why it is in this order:
//   1. read the anon cookie (may be absent — a first-time visitor who never
//      ran an analysis has nothing to claim, and that is not an error);
//   2. move matching rows onto the user_id, plus any paid guest reports
//      bought with the same email;
//   3. clear the cookie, but ONLY when something was actually claimed —
//      clearing on a no-op would throw away a key whose rows had not been
//      written yet (a race between the intake write and a fast signup).
//
// Idempotent end to end: step 2's updates filter on `user_id is null`, so a
// second call claims nothing, and step 3 has already removed the cookie.
// Never throws — a broken claim must not break authentication.
//
// G34 DC03 — claim by delivery address (`analyses.full_report_email` /
// `summary_email`) runs ONLY when the caller passes `emailVerified: true`,
// i.e. the sign-in itself proved the person controls the mailbox:
//   • magic link (/auth/verify)      — verified: the token was mailed there;
//   • Google (lib/auth/google-login) — verified: `email_verified === false`
//     is rejected before the login, so the address is Google-verified;
//   • password register / login, register-with-card, svi-handoff — NOT
//     verified: app_users has no confirmation flag and /api/auth/register
//     accepts any typed address, so these claim by anon cookie only.
// (Paid `guest_analyses` keep their pre-G34 claim-by-email on every path.)

import "server-only";

import { readAnonKey, clearAnonCookie } from "./anon-key";
import { claimAnalyses, type ClaimResult } from "./store";

export async function claimForCurrentBrowser(params: {
  userId: string;
  email?: string | null;
  emailVerified?: boolean;
}): Promise<ClaimResult> {
  try {
    const anonKey = await readAnonKey();
    const result = await claimAnalyses({
      userId: params.userId,
      anonKey,
      email: params.email ?? null,
      emailVerified: params.emailVerified === true,
    });
    // Only the cookie's own rows clear it — an e-mail claim says nothing
    // about whether this browser's intake write has landed yet.
    if (anonKey && result.analyses > 0) {
      await clearAnonCookie();
    }
    const byEmail = result.emailAnalyses ?? 0;
    if (result.analyses > 0 || result.guestAnalyses > 0 || byEmail > 0) {
      console.info(
        `[analyses:claim] user=${params.userId} analyses=${result.analyses} guest=${result.guestAnalyses} email=${byEmail}`,
      );
    }
    return result;
  } catch (err) {
    console.error("[analyses:claim] failed —", err);
    return { analyses: 0, guestAnalyses: 0 };
  }
}
