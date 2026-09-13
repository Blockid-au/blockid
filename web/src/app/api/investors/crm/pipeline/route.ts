// GET /api/investors/crm/pipeline — the summary strip (S28-B, viewer+).
//
// Counts by stage over the live contacts, the overdue / due-this-week next
// steps, and the A$ committed + funded on `fundraise_commitments` whose
// investor email matches a contact (lib/investors/crm `summarisePipeline`;
// the cheques are the owner's rounds on this project, matched in memory).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { summarisePipeline } from "@/lib/investors/crm";
import { listAllLiveContacts, listProjectCommitments, resolveCrmScope } from "@/lib/investors/crm-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const access = await resolveCrmScope("viewer");
  if (!access.ok) return access.response;

  const [contacts, commitments] = await Promise.all([
    listAllLiveContacts(supabase, access.projectId),
    listProjectCommitments(supabase, { ownerUserId: access.ownerUserId, projectId: access.projectId }),
  ]);
  return NextResponse.json({ ok: true, pipeline: summarisePipeline(contacts, commitments) });
}
