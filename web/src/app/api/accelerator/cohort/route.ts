// /api/accelerator/cohort — cohort CRUD stub.
//
// W5b: returns cohort + applicants for the current user. Backed by the
// lib/accelerator-portal helpers, which fall back to placeholder data
// until migration 0080 provisions the cohort tables. POST accepts a
// draft cohort payload and echoes it back with a generated id — real
// persistence lands with 0080.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  getCohort,
  listApplicants,
  getCohortSviAvg,
} from "@/lib/accelerator-portal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const cohortId = url.searchParams.get("id") ?? undefined;

  const cohort = await getCohort(user.id, cohortId);
  const [applicants, svi] = await Promise.all([
    listApplicants(cohort.id),
    getCohortSviAvg(cohort.id),
  ]);

  return NextResponse.json({
    ok: true,
    cohort,
    applicants,
    svi,
    // TODO: wire to cohorts table after migration 0080
  });
}

interface DraftCohort {
  name?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
  founder_count?: unknown;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: DraftCohort;
  try {
    body = (await request.json()) as DraftCohort;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "name_required" }, { status: 400 });
  }

  // TODO: wire to cohorts table after migration 0080
  const draft = {
    id: `cohort-draft-${Date.now().toString(36)}`,
    name: body.name.trim(),
    startsAt:
      typeof body.starts_at === "string"
        ? body.starts_at
        : new Date().toISOString(),
    endsAt:
      typeof body.ends_at === "string"
        ? body.ends_at
        : new Date(Date.now() + 90 * 86_400_000).toISOString(),
    founderCount:
      typeof body.founder_count === "number" ? body.founder_count : 0,
    ownerId: user.id,
    persisted: false,
  };

  return NextResponse.json({ ok: true, cohort: draft, persisted: false });
}
