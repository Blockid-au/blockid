// G14-S36 — read-only lookup of `projects.verification_level` for the SVI
// multiplier (F-6). Never throws: a missing project, a mocked client without
// the table, or a DB error all read as `null`, which computeSVI treats as
// "no multiplier" (the ladder confidence, exactly as before S36).

import type { SupabaseClient } from "@supabase/supabase-js";
import { normaliseVerificationLevel } from "./confidence-multiplier";
import type { VerificationLevel } from "./level-engine";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = Pick<SupabaseClient<any, any, any>, "from">;

export async function loadVerificationLevel(db: Db | null | undefined, projectId: string | null | undefined): Promise<VerificationLevel | null> {
  if (!db || !projectId) return null;
  try {
    const { data, error } = await db.from("projects").select("verification_level").eq("id", projectId).maybeSingle();
    if (error || !data) return null;
    const raw = (data as { verification_level?: unknown }).verification_level;
    if (raw == null) return null;
    return normaliseVerificationLevel(raw);
  } catch {
    return null;
  }
}
