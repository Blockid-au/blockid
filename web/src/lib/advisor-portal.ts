// advisor-portal — helpers for the /workspace/advisor surface.
//
// W5b: reads the advisor client roster and engagement notes. The dedicated
// advisor tables (advisor_portal, advisor_notes) land in a forthcoming
// migration; until then these helpers degrade to empty state so the page
// renders cleanly.

import "server-only";
import { getSupabaseAdmin, isSupabaseConfigured } from "./supabase";

export interface ClientRow {
  id: string;
  startupName: string;
  founderName: string | null;
  svi: number | null;
  lastActivityAt: string | null;
  engagement: "active" | "at_risk" | "dormant";
}

export interface ClientNote {
  id: string;
  clientId: string;
  advisorId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// getClientRoster — list of startups the given advisor is engaged with.
// Returns [] if the table is missing so the page shows an empty state.
// ---------------------------------------------------------------------------

export async function getClientRoster(advisorId: string): Promise<ClientRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // TODO: wire to advisor_portal table after migration 0080
  try {
    const { data, error } = await supabase
      .from("advisor_portal")
      .select("client_id,startup_name,founder_name,svi,last_activity_at,engagement")
      .eq("advisor_id", advisorId)
      .order("last_activity_at", { ascending: false });
    if (error) {
      if ((error as { code?: string }).code === "42P01") return [];
      return [];
    }
    return (data ?? []).map((row) => ({
      id: String(row.client_id),
      startupName: String(row.startup_name ?? ""),
      founderName: row.founder_name == null ? null : String(row.founder_name),
      svi: row.svi == null ? null : Number(row.svi),
      lastActivityAt: row.last_activity_at == null ? null : String(row.last_activity_at),
      engagement: normaliseEngagement(row.engagement),
    }));
  } catch {
    return [];
  }
}

function normaliseEngagement(raw: unknown): ClientRow["engagement"] {
  const s = String(raw ?? "").toLowerCase();
  if (s === "at_risk" || s === "dormant") return s;
  return "active";
}

// ---------------------------------------------------------------------------
// getClientNotes — engagement notes for one advisor↔client pair.
// ---------------------------------------------------------------------------

export async function getClientNotes(
  advisorId: string,
  clientId: string,
): Promise<ClientNote[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  // TODO: wire to advisor_notes table after migration 0080
  try {
    const { data, error } = await supabase
      .from("advisor_notes")
      .select("id,client_id,advisor_id,body,created_at,updated_at")
      .eq("advisor_id", advisorId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      if ((error as { code?: string }).code === "42P01") return [];
      return [];
    }
    return (data ?? []).map((row) => ({
      id: String(row.id),
      clientId: String(row.client_id),
      advisorId: String(row.advisor_id),
      body: String(row.body ?? ""),
      createdAt: String(row.created_at ?? ""),
      updatedAt: String(row.updated_at ?? row.created_at ?? ""),
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// saveNote — insert a new engagement note. Returns the created row, or null
// if the storage table isn't provisioned yet.
// ---------------------------------------------------------------------------

export async function saveNote(input: {
  advisorId: string;
  clientId: string;
  body: string;
}): Promise<ClientNote | null> {
  const body = input.body.trim();
  if (!body) return null;
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  // TODO: wire to advisor_notes table after migration 0080
  try {
    const { data, error } = await supabase
      .from("advisor_notes")
      .insert({
        advisor_id: input.advisorId,
        client_id: input.clientId,
        body,
      })
      .select("id,client_id,advisor_id,body,created_at,updated_at")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "42P01") return null;
      return null;
    }
    return {
      id: String(data.id),
      clientId: String(data.client_id),
      advisorId: String(data.advisor_id),
      body: String(data.body ?? ""),
      createdAt: String(data.created_at ?? ""),
      updatedAt: String(data.updated_at ?? data.created_at ?? ""),
    };
  } catch {
    return null;
  }
}
