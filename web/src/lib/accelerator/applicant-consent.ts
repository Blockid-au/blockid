// accelerator/applicant-consent — the founder-side consent screen text an
// applicant sees when a program reviews them on BlockID (G21 P2-C,
// 2026-09-20; moved from lib/pilots/consent by G25). Exposed as one constant
// so intake templates can use it as the default consent text and the
// /apply/[slug] form, the Cohort onboarding kit and the tests print the same
// sentence. The data sentence is the approved `DATA_PRINCIPLE_SENTENCE`
// (founder-approved 2026-09-10) — never paraphrased.
//
// Client-safe: no I/O, no server-only imports (the valuation-certificate
// types module is a constants module).

import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";

export { DATA_PRINCIPLE_SENTENCE };

/** The second sentence — what the program does and who keeps the data. */
export const APPLICANT_REVIEW_SENTENCE =
  "Your program is reviewing you on the Startup Value Index; you keep your data. The program sees your score, its evidence confidence and the dimensions behind it — you can claim your own profile at any time and choose what else to share.";

/** The default consent paragraph on an intake form (DATA_PRINCIPLE_SENTENCE + the review sentence). */
export const APPLICANT_CONSENT_TEXT = `${DATA_PRINCIPLE_SENTENCE} ${APPLICANT_REVIEW_SENTENCE}`;

/** The checkbox label beside the paragraph. */
export const APPLICANT_CONSENT_LABEL = "I understand my program reviews my startup on the Startup Value Index and that I keep my data.";

/** The three lines the founder-side screen lists under the paragraph. */
export const APPLICANT_CONSENT_POINTS: readonly string[] = Object.freeze([
  "Your program sees your Startup Value Index, its evidence confidence and the eight dimensions behind it.",
  "You can claim your own BlockID profile, add evidence and correct anything the report gets wrong.",
  "Nothing beyond the program's review is shared without your consent — access tiers are yours to set.",
]);
