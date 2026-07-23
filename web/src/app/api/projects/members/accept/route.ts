// Invite acceptance endpoint — Q4 Multi-project #3 (iteration-13 T4).
//
// Invitee-facing counterpart to /api/projects/[id]/members. Consumes a
// one-time token minted by inviteMember() and flips the row to
// status='accepted', binding it to the authenticated user's id.
//
// POST /api/projects/members/accept   body: { token: string }
//
// Auth is required — anonymous users are redirected upstream by the
// /invites/[token] page to /auth/login?next=… before ever hitting here.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  acceptInvite,
  ProjectMemberScopeError,
} from "@/lib/project-members/scope";

export const dynamic = "force-dynamic";

function scopeErrorToStatus(err: ProjectMemberScopeError): number {
  switch (err.code) {
    case "invalid_token":
      return 404;
    case "already_accepted":
      return 409;
    case "revoked":
      return 410;
    case "service_unavailable":
      return 503;
    default:
      return 400;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json(
      { ok: false, error: "token is required" },
      { status: 400 },
    );
  }

  try {
    const member = await acceptInvite(token, user.id);
    return NextResponse.json({ ok: true, member });
  } catch (err) {
    if (err instanceof ProjectMemberScopeError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: scopeErrorToStatus(err) },
      );
    }
    console.error("[blockid:project-members] accept failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
