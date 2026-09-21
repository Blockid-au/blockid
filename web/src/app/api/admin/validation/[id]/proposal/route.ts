// GET /api/admin/validation/[id]/proposal — the written pilot proposal PDF
// for one validation-tracker entry (G23-B, 2026-09-21; the advisor plan's
// Level 3 artefact).
//
//   401 anonymous · 403 signed-in non-admin · 400 malformed id / applicants ·
//   404 unknown entry · 429 (PROPOSALS_PER_HOUR per admin) · 200 application/pdf
//   with a Content-Disposition filename slugged from the organisation.
//
//   ?applicants=<n>  overrides the cohort size the entry text implies
//                    (≤ 25 → the 25 pilot, else the 50 — lib/validation/proposal.ts).
//
// Generated on demand, never stored. The one write is the entry stamp
// `proposal_generated_at` (PATCH through the existing ledger helper), and
// the one audit row is `validation.proposal_generated` via logUserAction (a
// GET cannot be wrapped by apiRoute, which is mutation-only). The level /
// outcome stay whatever the founder recorded — sending the PDF is what makes
// the L3 row `done`.

import { NextResponse } from "next/server";
import { extractIp, extractUserAgent, logUserAction } from "@/lib/audit/log";
import { gateAdmin } from "@/lib/pilots/admin-gate";
import { checkRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS } from "@/lib/security/request-guards";
import { patchEntry, readValidationLedger, resolveValidationRoot } from "@/lib/validation/ledger";
import { buildPilotProposal } from "@/lib/validation/proposal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Proposal renders per admin per hour (react-pdf is CPU-bound). */
export const PROPOSALS_PER_HOUR = 30;

const ID_RE = /^[0-9a-f-]{8,64}$/i;

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await gateAdmin();
  if (g.response) return g.response;

  const rl = checkRateLimit(`admin:validation:proposal:${g.user.id}`, PROPOSALS_PER_HOUR, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "rate_limited", message: "Too many proposals generated in the last hour — try again later." }, { status: 429, headers: { ...PRIVATE_JSON_HEADERS, "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } });
  }

  const { id } = await ctx.params;
  if (!ID_RE.test(id ?? "")) return json({ ok: false, error: "invalid_input", field: "id", message: "id: entry id required" }, 400);

  const url = new URL(request.url);
  const rawApplicants = url.searchParams.get("applicants");
  let applicants: number | null = null;
  if (rawApplicants !== null && rawApplicants !== "") {
    const n = Number(rawApplicants);
    if (!Number.isInteger(n) || n < 1 || n > 10_000) return json({ ok: false, error: "invalid_input", field: "applicants", message: "applicants: a whole number between 1 and 10,000" }, 400);
    applicants = n;
  }

  const root = await resolveValidationRoot();
  const ledger = await readValidationLedger(root);
  const entry = ledger.entries.find((e) => e.id === id);
  if (!entry) return json({ ok: false, error: "not_found", message: "No entry with that id." }, 404);

  const now = new Date();
  const proposal = buildPilotProposal(entry, { now, applicants });
  const { renderPilotProposalPdf } = await import("@/lib/pdf/pilot-proposal-pdf");
  const { buffer, pages } = await renderPilotProposalPdf(proposal);

  // Stamp the entry (the ledger helper owns the write); a failed stamp never
  // withholds the PDF the founder is about to send.
  const stamped = await patchEntry(root, entry.id, { proposal_generated_at: now.toISOString() }, now);
  if (!stamped.ok) console.warn("[blockid:validation] proposal_generated_at stamp failed", stamped.message);

  await logUserAction({
    userId: g.user.id,
    action: "validation.proposal_generated",
    subjectType: "validation_entry",
    subjectId: entry.id,
    fields: { level: entry.level, sku: proposal.meta.sku, applicants: proposal.scope.applicantsCap, pages, reference: proposal.meta.reference },
    route: "/api/admin/validation/[id]/proposal",
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  }).catch(() => undefined);

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${proposal.meta.filename}"`,
      "content-length": String(buffer.length),
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex, nofollow",
      "x-proposal-pages": String(pages),
      "x-proposal-sku": proposal.meta.sku,
      // The stamped row's timestamps so the client's next PATCH carries the
      // current `If-Match` (review G23 P2: the edit after a download 409'd).
      ...(stamped.ok ? { "x-proposal-generated-at": stamped.value.proposal_generated_at ?? now.toISOString(), "x-entry-updated-at": stamped.value.updated_at } : {}),
    },
  });
}
