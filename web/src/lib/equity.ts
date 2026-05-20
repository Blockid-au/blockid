import "server-only";
import { getSupabaseAdmin } from "./supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TeamMember {
  id: string;
  projectId: string;
  name: string;
  email: string | null;
  role: string;
  equityPct: number;
  vestingMonths: number | null;
  cliffMonths: number | null;
  vestingStartDate: string | null;
  isActive: boolean;
  vestedPct: number; // calculated: how much has vested so far
  unvestedPct: number;
}

export interface EquityEvent {
  id: string;
  projectId: string;
  memberId: string | null;
  type: string;
  equityPct: number;
  description: string | null;
  date: string;
  createdAt: string;
}

export interface EquitySummary {
  totalAllocated: number;
  unallocated: number;
  members: TeamMember[];
  events: EquityEvent[];
}

// ---------------------------------------------------------------------------
// Vesting calculation
// ---------------------------------------------------------------------------

function calculateVesting(
  equityPct: number,
  vestingMonths: number | null,
  cliffMonths: number | null,
  vestingStartDate: string | null,
): { vestedPct: number; unvestedPct: number } {
  // No vesting schedule → fully vested
  if (!vestingMonths || !vestingStartDate) {
    return { vestedPct: equityPct, unvestedPct: 0 };
  }

  const start = new Date(vestingStartDate);
  const now = new Date();

  // Calculate months elapsed
  const monthsElapsed =
    (now.getFullYear() - start.getFullYear()) * 12 +
    (now.getMonth() - start.getMonth()) +
    (now.getDate() >= start.getDate() ? 0 : -1);

  // Not started yet
  if (monthsElapsed < 0) {
    return { vestedPct: 0, unvestedPct: equityPct };
  }

  // Cliff not passed
  const cliff = cliffMonths ?? 0;
  if (monthsElapsed < cliff) {
    return { vestedPct: 0, unvestedPct: equityPct };
  }

  // Fully vested
  if (monthsElapsed >= vestingMonths) {
    return { vestedPct: equityPct, unvestedPct: 0 };
  }

  // Linear vesting after cliff
  const vestedFraction = monthsElapsed / vestingMonths;
  const vestedPct = Math.round(equityPct * vestedFraction * 10000) / 10000;
  const unvestedPct = Math.round((equityPct - vestedPct) * 10000) / 10000;

  return { vestedPct, unvestedPct };
}

// ---------------------------------------------------------------------------
// Row mapper
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapTeamMember(row: any): TeamMember {
  const equityPct = Number(row.equity_pct) || 0;
  const vestingMonths = row.vesting_months ?? null;
  const cliffMonths = row.cliff_months ?? null;
  const vestingStartDate = row.vesting_start_date ?? null;
  const { vestedPct, unvestedPct } = calculateVesting(
    equityPct,
    vestingMonths,
    cliffMonths,
    vestingStartDate,
  );

  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    email: row.email ?? null,
    role: row.role ?? "founder",
    equityPct,
    vestingMonths,
    cliffMonths,
    vestingStartDate,
    isActive: row.is_active ?? true,
    vestedPct,
    unvestedPct,
  };
}

function mapEquityEvent(row: any): EquityEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    memberId: row.member_id ?? null,
    type: row.event_type,
    equityPct: Number(row.equity_pct) || 0,
    description: row.description ?? null,
    date: row.event_date,
    createdAt: row.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Get all team members for a project with vesting calculations
// ---------------------------------------------------------------------------

export async function getTeamMembers(projectId: string): Promise<TeamMember[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("team_members")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("equity_pct", { ascending: false });

  if (error) {
    console.error("[blockid:equity] getTeamMembers failed", error);
    return [];
  }

  return (data ?? []).map(mapTeamMember);
}

// ---------------------------------------------------------------------------
// Add team member
// ---------------------------------------------------------------------------

export interface AddTeamMemberInput {
  name: string;
  email?: string;
  role: string;
  equityPct: number;
  vestingMonths?: number;
  cliffMonths?: number;
  vestingStartDate?: string;
}

export async function addTeamMember(
  projectId: string,
  data: AddTeamMemberInput,
): Promise<{ ok: boolean; member?: TeamMember; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };

  // Validate total equity doesn't exceed 100%
  const existing = await getTeamMembers(projectId);
  const totalAllocated = existing.reduce((sum, m) => sum + m.equityPct, 0);
  if (totalAllocated + data.equityPct > 100) {
    return {
      ok: false,
      error: `Total equity would exceed 100%. Currently allocated: ${totalAllocated.toFixed(2)}%, trying to add: ${data.equityPct.toFixed(2)}%`,
    };
  }

  const { data: row, error } = await supabase
    .from("team_members")
    .insert({
      project_id: projectId,
      name: data.name,
      email: data.email ?? null,
      role: data.role,
      equity_pct: data.equityPct,
      vesting_months: data.vestingMonths ?? null,
      cliff_months: data.cliffMonths ?? null,
      vesting_start_date: data.vestingStartDate ?? null,
    })
    .select("*")
    .single();

  if (error || !row) {
    console.error("[blockid:equity] addTeamMember failed", error);
    return { ok: false, error: error?.message ?? "Insert failed" };
  }

  // Record equity event
  await supabase.from("equity_events").insert({
    project_id: projectId,
    member_id: row.id,
    event_type: "grant",
    equity_pct: data.equityPct,
    description: `Granted ${data.equityPct}% equity to ${data.name} (${data.role})`,
    event_date: new Date().toISOString().split("T")[0],
  });

  return { ok: true, member: mapTeamMember(row) };
}

// ---------------------------------------------------------------------------
// Update member
// ---------------------------------------------------------------------------

export async function updateTeamMember(
  memberId: string,
  updates: {
    name?: string;
    email?: string;
    role?: string;
    equityPct?: number;
    vestingMonths?: number | null;
    cliffMonths?: number | null;
    vestingStartDate?: string | null;
  },
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };

  // If equityPct is changing, validate the total
  if (updates.equityPct !== undefined) {
    // Get the member's current data and project
    const { data: current } = await supabase
      .from("team_members")
      .select("project_id, equity_pct")
      .eq("id", memberId)
      .single();

    if (current) {
      const existing = await getTeamMembers(current.project_id);
      const totalWithoutThis = existing
        .filter((m) => m.id !== memberId)
        .reduce((sum, m) => sum + m.equityPct, 0);

      if (totalWithoutThis + updates.equityPct > 100) {
        return {
          ok: false,
          error: `Total equity would exceed 100%. Other members: ${totalWithoutThis.toFixed(2)}%, trying to set: ${updates.equityPct.toFixed(2)}%`,
        };
      }
    }
  }

  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.email !== undefined) dbUpdates.email = updates.email;
  if (updates.role !== undefined) dbUpdates.role = updates.role;
  if (updates.equityPct !== undefined) dbUpdates.equity_pct = updates.equityPct;
  if (updates.vestingMonths !== undefined) dbUpdates.vesting_months = updates.vestingMonths;
  if (updates.cliffMonths !== undefined) dbUpdates.cliff_months = updates.cliffMonths;
  if (updates.vestingStartDate !== undefined) dbUpdates.vesting_start_date = updates.vestingStartDate;

  const { error } = await supabase
    .from("team_members")
    .update(dbUpdates)
    .eq("id", memberId);

  if (error) {
    console.error("[blockid:equity] updateTeamMember failed", error);
    return { ok: false, error: error.message };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Remove member (soft delete)
// ---------------------------------------------------------------------------

export async function removeMember(memberId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };

  // Get member info for the event log
  const { data: member } = await supabase
    .from("team_members")
    .select("project_id, name, equity_pct")
    .eq("id", memberId)
    .single();

  const { error } = await supabase
    .from("team_members")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("id", memberId);

  if (error) {
    console.error("[blockid:equity] removeMember failed", error);
    return { ok: false, error: error.message };
  }

  // Record removal event
  if (member) {
    await supabase.from("equity_events").insert({
      project_id: member.project_id,
      member_id: memberId,
      event_type: "transfer",
      equity_pct: Number(member.equity_pct) || 0,
      description: `Removed ${member.name} — ${member.equity_pct}% returned to unallocated pool`,
      event_date: new Date().toISOString().split("T")[0],
    });
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Get equity summary for a project
// ---------------------------------------------------------------------------

export async function getEquitySummary(projectId: string): Promise<EquitySummary> {
  const members = await getTeamMembers(projectId);
  const totalAllocated = members.reduce((sum, m) => sum + m.equityPct, 0);
  const unallocated = Math.round((100 - totalAllocated) * 10000) / 10000;

  // Load events
  const supabase = getSupabaseAdmin();
  let events: EquityEvent[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from("equity_events")
      .select("*")
      .eq("project_id", projectId)
      .order("event_date", { ascending: false })
      .limit(50);

    if (!error && data) {
      events = data.map(mapEquityEvent);
    }
  }

  return { totalAllocated, unallocated, members, events };
}
