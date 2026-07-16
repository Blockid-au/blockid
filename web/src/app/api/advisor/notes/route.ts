// /api/advisor/notes — advisor engagement-notes CRUD stub.
//
// W5b: reads/writes advisor_notes for the current user. Both handlers
// degrade gracefully to an empty/no-op response when the underlying
// table is not yet provisioned.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getClientNotes, saveNote } from "@/lib/advisor-portal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  if (!clientId) {
    return NextResponse.json({ error: "client_id_required" }, { status: 400 });
  }

  const notes = await getClientNotes(user.id, clientId);
  return NextResponse.json({ ok: true, notes });
}

interface NoteBody {
  client_id?: unknown;
  body?: unknown;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: NoteBody;
  try {
    payload = (await request.json()) as NoteBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof payload.client_id !== "string" || !payload.client_id.trim()) {
    return NextResponse.json({ error: "client_id_required" }, { status: 400 });
  }
  if (typeof payload.body !== "string" || !payload.body.trim()) {
    return NextResponse.json({ error: "body_required" }, { status: 400 });
  }

  const note = await saveNote({
    advisorId: user.id,
    clientId: payload.client_id.trim(),
    body: payload.body,
  });

  if (!note) {
    // Table missing or write failed — return 202 so the client can render an
    // optimistic entry and re-sync once migration 0080 lands.
    return NextResponse.json(
      { ok: false, persisted: false, reason: "table_missing_or_write_failed" },
      { status: 202 },
    );
  }

  return NextResponse.json({ ok: true, persisted: true, note });
}
