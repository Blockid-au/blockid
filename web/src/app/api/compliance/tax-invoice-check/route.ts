// POST /api/compliance/tax-invoice-check — assess an ATO tax invoice under
// A New Tax System (Goods and Services Tax) Act 1999 (Cth) s 29-70(1) and
// persist the latest snapshot per (user_id, project_id).
// GET returns the latest saved snapshot.
//
// Legal ref: ATO — Tax invoices
// https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/tax-invoices
//
// Every response carries TAX_INVOICE_DISCLAIMER — not tax advice.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getActiveProject } from "@/lib/projects";
import {
  assessTaxInvoice,
  TAX_INVOICE_DISCLAIMER,
  type TaxInvoiceInput,
} from "@/lib/compliance/tax-invoice-checker";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: TAX_INVOICE_DISCLAIMER },
      { status: 401 },
    );
  }

  let body: TaxInvoiceInput;
  try {
    body = (await request.json()) as TaxInvoiceInput;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json", disclaimer: TAX_INVOICE_DISCLAIMER },
      { status: 400 },
    );
  }

  if (typeof body?.gst_inclusive_total_aud !== "number") {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_required_fields",
        required: ["gst_inclusive_total_aud"],
        disclaimer: TAX_INVOICE_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const result = assessTaxInvoice(body);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const project = await getActiveProject(user.id);
    await supabase.from("compliance_tax_invoice_checks").insert({
      user_id: user.id,
      project_id: project?.id ?? null,
      input_json: body,
      result_json: result,
      ok: result.ok,
      band: result.band,
      gst_inclusive_total_aud: result.gst_inclusive_total_aud,
      computed_gst_component_aud: result.computed_gst_component_aud,
      missing_field_count: result.missing_fields.length,
      warning_count: result.warnings.length,
    });
  }

  return NextResponse.json({ ok: true, result });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "unauthenticated", disclaimer: TAX_INVOICE_DISCLAIMER },
      { status: 401 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({
      ok: true,
      result: null,
      disclaimer: TAX_INVOICE_DISCLAIMER,
    });
  }

  const project = await getActiveProject(user.id);
  const { data } = await supabase
    .from("compliance_tax_invoice_checks")
    .select(
      "input_json, result_json, ok, band, gst_inclusive_total_aud, computed_gst_component_aud, missing_field_count, warning_count, computed_at",
    )
    .eq("user_id", user.id)
    .eq("project_id", project?.id ?? null)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    result: data ?? null,
    disclaimer: TAX_INVOICE_DISCLAIMER,
  });
}
