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

import "server-only";

import { readAnonKey, clearAnonCookie } from "./anon-key";
import { claimAnalyses, type ClaimResult } from "./store";

export async function claimForCurrentBrowser(params: {
  userId: string;
  email?: string | null;
}): Promise<ClaimResult> {
  try {
    const anonKey = await readAnonKey();
    const result = await claimAnalyses({
      userId: params.userId,
      anonKey,
      email: params.email ?? null,
    });
    if (anonKey && result.analyses > 0) {
      await clearAnonCookie();
    }
    if (result.analyses > 0 || result.guestAnalyses > 0) {
      console.info(
        `[analyses:claim] user=${params.userId} analyses=${result.analyses} guest=${result.guestAnalyses}`,
      );
    }
    return result;
  } catch (err) {
    console.error("[analyses:claim] failed —", err);
    return { analyses: 0, guestAnalyses: 0 };
  }
}
