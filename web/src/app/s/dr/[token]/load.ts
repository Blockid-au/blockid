// Read side of the investor share link.
//
// The token IS the credential: there is no auth on /s/dr/[token]. So every
// failure mode collapses to `null` and the page 404s — a bad token, a revoked
// token, an expired token and a token whose room was deleted are all
// indistinguishable to whoever is holding the URL. Confirming that a token
// exists to someone who does not hold it would turn this into an oracle.
//
// Nothing here consults `data_rooms.is_public`. A room is reachable only
// because the founder minted a link, which is the consent record.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  shareLinkState,
  type ShareLinkRow,
  type ShareLinkState,
} from "@/lib/data-room";
import {
  ndaAllowsDocuments,
  ndaGate,
  normaliseNdaVersion,
  type NdaGate,
} from "@/lib/dataroom/nda";
import { ownerTrustEntitled } from "@/lib/dataroom/nda-server";
import { willWatermark } from "@/lib/dataroom/watermark-recipient";

export interface SharedRoomDocument {
  id: string;
  section: string;
  folder: string;
  documentName: string;
  documentType: string;
  status: "complete" | "pending" | "missing" | "not_applicable";
  priority: "P0" | "P1" | "P2";
  content: string | null;
  hasFile: boolean;
  notes: string | null;
}

export interface SharedRoomFolder {
  folder: string;
  documents: SharedRoomDocument[];
}

export interface SharedRoomHeadline {
  label: string;
  value: string;
}

export interface SharedRoom {
  token: string;
  shareId: string;
  dataRoomId: string;
  name: string;
  startupName: string | null;
  stage: number;
  investorLabel: string | null;
  lastGeneratedAt: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  accessCount: number;
  state: ShareLinkState;
  folders: SharedRoomFolder[];
  headlines: SharedRoomHeadline[];
  counts: { total: number; complete: number; pending: number; missing: number };
  completeness: number;
  /**
   * S21-A — the NDA click-wrap. When `status === "pending"` the loader did
   * NOT query documents: `folders` is empty and `counts` are zero, so nothing
   * confidential reaches the render tree before the investor accepts.
   */
  nda: NdaGate;
  /** PDFs downloaded through this link carry the per-recipient watermark. */
  watermarked: boolean;
}

const STAGE_LABELS = [
  "Idea",
  "Validation",
  "MVP",
  "Launch",
  "Revenue",
  "Growth",
  "Scale",
  "Exit-Ready",
];

export function stageLabel(stage: number): string {
  return STAGE_LABELS[stage] ?? `Stage ${stage}`;
}

/**
 * Pull the numbers an investor opens with out of the persisted `sections`
 * blob written by /api/data-room/generate. Defensive on purpose: one live row
 * has an unrelated 242-entry knowledge-base index in that column, so anything
 * that is not the DataRoomSection shape is ignored rather than rendered.
 */
export function extractHeadlines(sections: unknown): SharedRoomHeadline[] {
  if (!Array.isArray(sections)) return [];
  const wanted = new Map<string, string>([
    ["svi score", "SVI score"],
    ["valuation estimate", "Valuation (mid)"],
    ["current stage", "Stage"],
    ["monthly recurring revenue (mrr)", "MRR"],
    ["runway (months)", "Runway"],
  ]);
  const out: SharedRoomHeadline[] = [];
  for (const section of sections) {
    if (!section || typeof section !== "object") continue;
    const items = (section as { items?: unknown }).items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const { label, value, status } = item as {
        label?: unknown;
        value?: unknown;
        status?: unknown;
      };
      if (typeof label !== "string" || typeof value !== "string") continue;
      if (status !== "complete") continue;
      const nice = wanted.get(label.trim().toLowerCase());
      if (nice && !out.some((h) => h.label === nice)) {
        out.push({ label: nice, value });
      }
    }
  }
  return out;
}

export function groupDocuments(
  docs: SharedRoomDocument[],
): SharedRoomFolder[] {
  const order = new Map<string, SharedRoomDocument[]>();
  for (const doc of docs) {
    const list = order.get(doc.folder) ?? [];
    list.push(doc);
    order.set(doc.folder, list);
  }
  return [...order.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true }))
    .map(([folder, documents]) => ({
      folder,
      documents: documents.sort(
        (a, b) =>
          a.priority.localeCompare(b.priority) ||
          a.documentName.localeCompare(b.documentName),
      ),
    }));
}

export function countDocuments(docs: SharedRoomDocument[]) {
  return {
    total: docs.length,
    complete: docs.filter((d) => d.status === "complete").length,
    pending: docs.filter((d) => d.status === "pending").length,
    missing: docs.filter((d) => d.status === "missing").length,
  };
}

export async function loadSharedDataRoom(
  token: string,
): Promise<SharedRoom | null> {
  if (!token || token.length < 16 || token.length > 128) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: link } = await supabase
    .from("data_room_access_tokens")
    .select(
      "id, data_room_id, account_id, investor_name, investor_firm, access_count, is_active, revoked_at, expires_at, created_at, nda_required, nda_signed_at, nda_signed_version",
    )
    .eq("token", token)
    .maybeSingle();

  if (!link || !link.data_room_id) return null;

  const state = shareLinkState(link as ShareLinkRow);
  if (state !== "active") return null;

  const { data: room } = await supabase
    .from("data_rooms")
    .select(
      "id, user_id, name, startup_name, stage, sections, completeness_score, last_generated_at, nda_required, nda_text, nda_version, watermark_enabled",
    )
    .eq("id", link.data_room_id)
    .maybeSingle();

  if (!room) return null;

  // S21-A — NDA gate + watermark are Starter+ (investor_links.premium) on the
  // OWNER's plan. A Free room renders as before, with neither.
  const entitled = await ownerTrustEntitled(
    String(room.user_id ?? link.account_id ?? ""),
  );
  const nda = ndaGate(
    {
      ndaRequired: Boolean(room.nda_required),
      ndaText: (room.nda_text as string | null) ?? null,
      ndaVersion: normaliseNdaVersion(room.nda_version),
    },
    {
      ndaRequired: Boolean(link.nda_required),
      ndaSignedAt: (link.nda_signed_at as string | null) ?? null,
      ndaSignedVersion:
        typeof link.nda_signed_version === "number"
          ? link.nda_signed_version
          : null,
    },
    entitled,
  );
  // Same rule as the PDF route (lib/dataroom/watermark-recipient): with the
  // `link <id8>` fallback every link with an id can be named, so the badge
  // never promises a mark the PDF would not carry (S21-A review P2-3).
  const watermarked = entitled && willWatermark(Boolean(room.watermark_enabled), { id: String(link.id) });

  // Documents are not even queried until the gate is cleared — the page
  // cannot leak what the loader never fetched.
  const rows = ndaAllowsDocuments(nda)
    ? (
        await supabase
          .from("data_room_documents")
          .select(
            "id, section, folder, document_name, document_type, status, priority, template_content, file_url, notes",
          )
          .eq("data_room_id", room.id)
          .order("folder", { ascending: true })
      ).data
    : [];

  const documents: SharedRoomDocument[] = ((rows ?? []) as Array<
    Record<string, unknown>
  >).map((r) => ({
    id: String(r.id),
    section: String(r.section ?? ""),
    folder: String(r.folder ?? "Other"),
    documentName: String(r.document_name ?? "Untitled"),
    documentType: String(r.document_type ?? "upload"),
    status: (r.status as SharedRoomDocument["status"]) ?? "missing",
    priority: (r.priority as SharedRoomDocument["priority"]) ?? "P1",
    content:
      typeof r.template_content === "string" && r.template_content.trim()
        ? r.template_content
        : null,
    hasFile: Boolean(r.file_url),
    notes: typeof r.notes === "string" && r.notes.trim() ? r.notes : null,
  }));

  const counts = countDocuments(documents);

  return {
    token,
    shareId: String(link.id),
    dataRoomId: String(room.id),
    name: String(room.name ?? "Investor Data Room"),
    startupName: (room.startup_name as string | null) ?? null,
    stage: Number(room.stage ?? 0),
    investorLabel:
      (link.investor_name as string | null) ??
      (link.investor_firm as string | null) ??
      null,
    lastGeneratedAt: (room.last_generated_at as string | null) ?? null,
    createdAt: (link.created_at as string | null) ?? null,
    expiresAt: (link.expires_at as string | null) ?? null,
    accessCount: Number(link.access_count ?? 0),
    state,
    folders: groupDocuments(documents),
    headlines: extractHeadlines(room.sections),
    counts,
    // Recomputed from what is actually in the room rather than trusting the
    // stored score, which the old generate path never kept in step.
    completeness:
      counts.total > 0
        ? Math.round((counts.complete / counts.total) * 100)
        : Number(room.completeness_score ?? 0),
    nda,
    watermarked,
  };
}

/**
 * Access log. A founder needs to see that an investor opened the room, so this
 * writes one `data_room_views` row per render and rolls the counters on the
 * share link. Failures are swallowed: telemetry must never 500 an investor's
 * page.
 */
export async function recordShareView(input: {
  room: SharedRoom;
  ipHash: string | null;
  userAgent: string | null;
  referer: string | null;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;
  const now = new Date().toISOString();
  try {
    await supabase.from("data_room_views").insert({
      data_room_id: input.room.dataRoomId,
      access_token_id: input.room.shareId,
      viewer_ip_hash: input.ipHash,
      user_agent: input.userAgent?.slice(0, 512) ?? null,
      referer: input.referer?.slice(0, 512) ?? null,
    });
    await supabase
      .from("data_room_access_tokens")
      .update({
        access_count: input.room.accessCount + 1,
        last_accessed: now,
        ...(input.room.accessCount === 0 ? { first_accessed: now } : {}),
      })
      .eq("id", input.room.shareId);
  } catch (err) {
    console.error("[blockid:s/dr] view log failed", err);
  }
}
