// G34 BT3 — page 1's evaluator next step ("Request evidence from founder") on
// the public share page goes through the EXISTING founder-contact path: the
// investor lead form (components/tbr/tbr-lead-modal.tsx → POST
// /api/tbr/[token]/lead → founder notification). Navigating to this anchor
// opens the form at once with the message below prefilled. Plain module (not
// "use client") so the server share page reads the real string.

export const TBR_REQUEST_EVIDENCE_HASH = "#tbr-request-evidence";
export const TBR_REQUEST_EVIDENCE_MESSAGE =
  "Could you share supporting evidence (documents or connected data) for the areas this report marks pending or weakest?";
