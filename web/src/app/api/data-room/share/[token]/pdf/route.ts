// GET /api/data-room/share/[token]/pdf?doc=<data_room_documents.id>
//
// A data-room document as a PDF, served through the investor share link
// (S21-A). The token is the credential — same rules as /s/dr/[token]:
//
//   - a bad, revoked, expired or orphaned token → 404, indistinguishable;
//   - a document that is not in THIS link's room → 404 (never 403 — the
//     document id must not become an oracle for another room);
//   - the room's NDA gate is enforced HERE, server-side, not just on the page:
//     a pending gate → 403 `nda_required`, whatever the UI showed;
//   - the per-recipient watermark is applied when the room has
//     `watermark_enabled`. Turning it (or the NDA) on needed
//     investor_links.premium on the owner's plan; enforcing it does not
//     (S21-A review P2-5 — a lapse never releases documents or strips the
//     mark). The recipient line follows lib/dataroom/watermark-recipient:
//     `data_room_access_tokens.watermark` (0339, mirror of
//     share_packages.watermark) → investor name / firm / email → the email
//     on the NDA ledger (read from data_room_nda_acceptances, never from
//     the token row — P1-1) → `link <id8>` (P2-3: every served PDF traces
//     to a disclosure; the page badge uses the same rule);
//   - every download is an engagement event (`document_download`) so the
//     founder's activity shows it.
//
// GET only — nothing here mutates founder data, so apiRoute() is not
// required (S20-A audits mutating methods).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { shareLinkState, type ShareLinkRow } from "@/lib/data-room";
import { ndaAllowsDocuments, ndaGate, normaliseNdaVersion } from "@/lib/dataroom/nda";
import { clientIpFromHeaders, hashIp } from "@/lib/iphash";
import { watermarkRecipient, willWatermark } from "@/lib/dataroom/watermark-recipient";
import { renderDataRoomDocumentPdf } from "@/lib/pdf/data-room-document-pdf";
import { watermarkLabel } from "@/lib/pdf/watermark";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_FOUND = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

function filenamePart(input: string): string {
  return (
    input
      .replace(/[^\w\s-]+/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60)
      .toLowerCase() || "document"
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;
  if (!token || token.length < 16 || token.length > 128) return NOT_FOUND();
  const docId = new URL(req.url).searchParams.get("doc");
  if (!docId || !/^[0-9a-f-]{36}$/i.test(docId)) return NOT_FOUND();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });

  const { data: link } = await supabase
    .from("data_room_access_tokens")
    .select(
      "id, data_room_id, account_id, investor_name, investor_firm, investor_email, watermark, is_active, revoked_at, expires_at, nda_required, nda_signed_at, nda_signed_version",
    )
    .eq("token", token)
    .maybeSingle();
  if (!link || !link.data_room_id) return NOT_FOUND();
  if (shareLinkState(link as ShareLinkRow) !== "active") return NOT_FOUND();

  const { data: room } = await supabase
    .from("data_rooms")
    .select("id, user_id, name, startup_name, nda_required, nda_text, nda_version, watermark_enabled")
    .eq("id", link.data_room_id)
    .maybeSingle();
  if (!room) return NOT_FOUND();

  const gate = ndaGate(
    {
      ndaRequired: Boolean(room.nda_required),
      ndaText: (room.nda_text as string | null) ?? null,
      ndaVersion: normaliseNdaVersion(room.nda_version),
    },
    {
      ndaRequired: Boolean(link.nda_required),
      ndaSignedAt: (link.nda_signed_at as string | null) ?? null,
      ndaSignedVersion: typeof link.nda_signed_version === "number" ? link.nda_signed_version : null,
    },
  );
  if (!ndaAllowsDocuments(gate)) {
    return NextResponse.json(
      { ok: false, error: "nda_required", message: "Accept the confidentiality terms on the data room page first." },
      { status: 403 },
    );
  }

  // Scoped to the link's room — a document id from another room 404s.
  const { data: doc } = await supabase
    .from("data_room_documents")
    .select("id, folder, document_name, template_content, status")
    .eq("id", docId)
    .eq("data_room_id", room.id)
    .maybeSingle();
  if (!doc) return NOT_FOUND();
  const body = typeof doc.template_content === "string" ? doc.template_content : "";
  if (!body.trim()) {
    return NextResponse.json(
      { ok: false, error: "no_content", message: "This item has no written content to export." },
      { status: 404 },
    );
  }

  const linkFields = {
    id: String(link.id),
    watermark: link.watermark as string | null,
    investor_name: link.investor_name as string | null,
    investor_firm: link.investor_firm as string | null,
    investor_email: link.investor_email as string | null,
  };
  const stamps = willWatermark(Boolean(room.watermark_enabled), linkFields);
  let watermark: string | null = null;
  if (stamps) {
    // Only reach for the ledger when the founder named nothing on the link.
    let ledgerEmail: string | null = null;
    if (!watermarkRecipient({ ...linkFields, id: "" })) {
      const { data: acceptance } = await supabase
        .from("data_room_nda_acceptances")
        .select("viewer_email")
        .eq("access_token_id", link.id)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      ledgerEmail = (acceptance?.viewer_email as string | null) ?? null;
    }
    watermark = watermarkLabel({ recipient: watermarkRecipient(linkFields, ledgerEmail), linkId: linkFields.id });
  }

  const startupName = (room.startup_name as string | null)?.trim() || "Startup";
  const roomName = (room.name as string | null)?.trim() || "Investor Data Room";
  const documentName = String(doc.document_name ?? "Document");

  let buffer: Buffer;
  try {
    buffer = await renderDataRoomDocumentPdf({
      startupName,
      roomName,
      folder: String(doc.folder ?? ""),
      documentName,
      body,
      watermark,
    });
  } catch (err) {
    console.error("[blockid:data-room/share/pdf] render failed", err);
    return NextResponse.json({ ok: false, error: "PDF generation failed" }, { status: 500 });
  }

  // Telemetry — never blocks the download.
  void (async () => {
    try {
      await supabase.from("data_room_engagement").insert({
        data_room_id: room.id,
        access_token_id: link.id,
        event_type: "document_download",
        section: String(doc.folder ?? "") || null,
        document_name: documentName.slice(0, 160),
        ip_hash: hashIp(clientIpFromHeaders(req.headers))?.slice(0, 16) ?? null,
        user_agent: req.headers.get("user-agent")?.slice(0, 200) ?? null,
      });
    } catch (err) {
      console.error("[blockid:data-room/share/pdf] engagement insert failed", err);
    }
  })();

  const filename = `${filenamePart(startupName)}-${filenamePart(documentName)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
      ...(watermark ? { "X-BlockID-Watermark": "1" } : {}),
    },
  });
}
