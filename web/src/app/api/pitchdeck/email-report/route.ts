// POST /api/pitchdeck/email-report
//
// Wave 21 — send a founder a plain-text SVI report at the email they
// supply. Idempotent on (pitchdeckId + email): the row's status ensures
// the second call short-circuits.
//
// Body: {
//   pitchdeckId: string,   // from /api/pitchdeck/classify
//   email:       string,   // recipient address
//   totalSVI:    number,   // client-computed weighted total
//   dimResults:  Record<string, { score: number; priority: "high"|"medium"|"low" }>,
// }
//
// Renders a compact HTML brief + text fallback using the shared sendEmail
// helper (SMTP Gmail relay → Resend fallback). Never blocks on the
// deliverability side — logs and returns { ok: true, sent: bool }.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIM_LABELS: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

interface DimResult { score: number; priority: "high" | "medium" | "low" }

function band(svi: number): string {
  if (svi >= 70) return "Investor-ready";
  if (svi >= 40) return "Developing";
  return "Early stage";
}

function renderHtml(args: {
  filename: string;
  totalSVI: number;
  dimResults: Record<string, DimResult>;
}): string {
  const sorted = Object.entries(args.dimResults)
    .sort((a, b) => a[1].score - b[1].score);
  const rows = sorted.map(([k, r]) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-family:ui-sans-serif;font-size:13px;color:#1e293b;">
        ${DIM_LABELS[k] ?? k.toUpperCase()}
      </td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;font-family:ui-sans-serif;font-size:13px;color:#1e293b;font-weight:600;">
        ${r.score}/100
      </td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;font-family:ui-sans-serif;font-size:12px;color:${r.priority === "high" ? "#b91c1c" : r.priority === "medium" ? "#b45309" : "#475569"};">
        ${r.priority}
      </td>
    </tr>`).join("");
  const bandLabel = band(args.totalSVI);
  const bandColor = args.totalSVI >= 70 ? "#047857" : args.totalSVI >= 40 ? "#b45309" : "#b91c1c";
  return `<!doctype html>
<html><body style="margin:0;padding:20px;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
    <p style="margin:0 0 8px 0;font-size:11px;color:#64748b;letter-spacing:.14em;text-transform:uppercase;font-weight:600;">Your Startup Value Index report</p>
    <h1 style="margin:0 0 4px 0;font-size:14px;color:#334155;font-weight:600;">${args.filename}</h1>
    <div style="margin:16px 0 24px 0;">
      <div style="font-size:48px;font-weight:800;line-height:1;color:${bandColor};font-variant-numeric:tabular-nums;">${args.totalSVI}<span style="font-size:20px;color:#64748b;font-weight:400;">/100</span></div>
      <div style="margin-top:6px;font-size:12px;color:${bandColor};font-weight:600;">${bandLabel}</div>
    </div>
    <p style="margin:0 0 12px 0;font-size:13px;color:#334155;">Per-dimension breakdown (sorted weakest first — attack these to lift your score):</p>
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr>
        <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.14em;font-weight:600;border-bottom:1px solid #e5e7eb;">Dimension</th>
        <th style="padding:6px 12px;text-align:right;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.14em;font-weight:600;border-bottom:1px solid #e5e7eb;">Score</th>
        <th style="padding:6px 12px;text-align:left;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.14em;font-weight:600;border-bottom:1px solid #e5e7eb;">Priority</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin:24px 0 4px 0;font-size:13px;color:#334155;">Log in to see the full narrative, deck-quoted evidence, sector cohort compare, and 3-case valuation:</p>
    <p style="margin:0 0 20px 0;"><a href="https://blockid.au/workspace/svi-evidence" style="display:inline-block;padding:10px 18px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open your dashboard</a></p>
    <p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;">Directional estimate only — not a formal valuation. Reply to this email if anything looks off.</p>
  </div>
</body></html>`;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    pitchdeckId?: string;
    email?: string;
    totalSVI?: number;
    dimResults?: Record<string, DimResult>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const pitchdeckId = (body.pitchdeckId ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const totalSVI = Math.round(Number(body.totalSVI));
  if (!pitchdeckId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isFinite(totalSVI)) {
    return NextResponse.json({ ok: false, error: "missing_or_invalid_fields" }, { status: 400 });
  }
  const dimResults = body.dimResults ?? {};

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 500 });
  const { data: deck } = await supabase
    .from("pitchdeck_analyses")
    .select("id, filename, user_id")
    .eq("id", pitchdeckId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!deck) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const filename = String(deck.filename ?? "pitchdeck");
  const html = renderHtml({ filename, totalSVI, dimResults });

  const result = await sendEmail({
    to: email,
    subject: `Your SVI report: ${totalSVI}/100 — ${filename}`,
    html,
  });
  return NextResponse.json({
    ok: true,
    sent: result.ok,
    id: result.ok ? result.id : null,
  });
}
