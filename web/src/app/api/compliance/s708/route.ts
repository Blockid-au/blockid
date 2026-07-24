// POST /api/compliance/s708 — capture a sophisticated / wholesale investor
// certificate (Corporations Act 2001 s708(8) + Corporations Regulations
// 6D.2.03) against the founder's active project. Also inserts a mirror
// row into dataroom_files under SVI dimension "Compliance" so the cert
// surfaces in the standard data-room view.
//
// GET /api/compliance/s708 — list the founder's stored certs with derived
// status (valid | expiring_soon | expired).
//
// Auth: getCurrentUser() → only the project owner may upload.
//
// Not legal advice — every response carries S708_DISCLAIMER. See
// web/src/lib/compliance/s708-wholesale.ts for the pure helpers.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  classifyCert,
  normaliseCert,
  S708_DISCLAIMER,
  summariseCerts,
  type S708CertInput,
  type S708CertRecord,
} from "@/lib/compliance/s708-wholesale";

export const dynamic = "force-dynamic";

const DATAROOM_MIME = "application/vnd.blockid.compliance-cert";
const DATAROOM_DIMENSION = "Compliance";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: S708_DISCLAIMER },
      { status: 401 },
    );
  }

  let body: S708CertInput;
  try {
    body = (await request.json()) as S708CertInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", disclaimer: S708_DISCLAIMER },
      { status: 400 },
    );
  }

  let record: S708CertRecord;
  try {
    record = normaliseCert(body);
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        message: err instanceof Error ? err.message : String(err),
        disclaimer: S708_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      record,
      meta: { source: "no_db" },
      disclaimer: S708_DISCLAIMER,
    });
  }

  const project = await getActiveProject(user.id);

  // Mirror into dataroom_files first so we can persist the FK back.
  let dataroomFileId: string | null = null;
  const drFileName = `s708(8) - ${record.investor_email}`;
  const { data: drInserted } = await supabase
    .from("dataroom_files")
    .insert({
      user_id: user.id,
      email: user.email,
      svi_dimension: DATAROOM_DIMENSION,
      file_name: drFileName,
      drive_file_url: record.evidence_url,
      mime_type: DATAROOM_MIME,
      status: "indexed",
    })
    .select("id")
    .maybeSingle();
  if (drInserted?.id) dataroomFileId = drInserted.id as string;

  const { data: certRow, error: certErr } = await supabase
    .from("compliance_s708_certs")
    .insert({
      user_id: user.id,
      project_id: project?.id ?? null,
      investor_email: record.investor_email,
      certifying_accountant_name: record.certifying_accountant_name,
      certifying_accountant_firm: record.certifying_accountant_firm,
      cert_type: record.cert_type,
      cert_date: record.cert_date,
      expiry_date: record.expiry_date,
      evidence_url: record.evidence_url,
      dataroom_file_id: dataroomFileId,
    })
    .select("id, cert_date, expiry_date")
    .maybeSingle();

  if (certErr) {
    return NextResponse.json(
      {
        ok: false,
        error: "insert_failed",
        message: certErr.message,
        disclaimer: S708_DISCLAIMER,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    record: { ...record, id: certRow?.id },
    dataroom_file_id: dataroomFileId,
    disclaimer: S708_DISCLAIMER,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: S708_DISCLAIMER },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      certs: [] as S708CertRecord[],
      summary: summariseCerts([]),
      disclaimer: S708_DISCLAIMER,
    });
  }

  const project = await getActiveProject(user.id);
  const { data } = await supabase
    .from("compliance_s708_certs")
    .select(
      "id, investor_email, certifying_accountant_name, certifying_accountant_firm, cert_type, cert_date, expiry_date, evidence_url",
    )
    .eq("user_id", user.id)
    .eq("project_id", project?.id ?? null)
    .order("cert_date", { ascending: false });

  const now = new Date();
  const certs: S708CertRecord[] = (data ?? []).map((row) => {
    const cls = classifyCert(row.cert_date, row.expiry_date, now);
    return {
      id: row.id as string,
      investor_email: row.investor_email as string,
      certifying_accountant_name: row.certifying_accountant_name as string,
      certifying_accountant_firm: row.certifying_accountant_firm as string,
      cert_type: row.cert_type as S708CertRecord["cert_type"],
      cert_date: row.cert_date as string,
      expiry_date: row.expiry_date as string,
      evidence_url: (row.evidence_url as string | null) ?? null,
      status: cls.status,
      days_to_expiry: cls.days_to_expiry,
    };
  });

  return NextResponse.json({
    ok: true,
    certs,
    summary: summariseCerts(certs),
    disclaimer: S708_DISCLAIMER,
  });
}
