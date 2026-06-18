// Client-safe types + pure helpers for the founder profile.
//
// Split out of lib/founder-profile.ts so the client bundle never pulls in the
// supabase service-role client (which is server-only). The form UI imports
// from here; the server code (API route, /api/svi pipeline) imports the full
// lib/founder-profile.ts.

export interface CoFounder {
  name: string;
  role: string;
  linkedin?: string;
  bio?: string;
}

export interface Advisor {
  name: string;
  role: string;
  linkedin?: string;
}

export interface FounderProfile {
  id?: string;
  account_id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  linkedin_url: string | null;
  bio: string | null;
  prev_employers: string[];
  ship_history: string[];
  years_in_domain: number | null;
  domain_insight: string | null;
  ambition: string | null;
  co_founders: CoFounder[];
  advisors: Advisor[];
  notable_hires: Array<{ name: string; role: string; from?: string }>;
  public_visible: boolean;
}

export const EMPTY_PROFILE = (accountId: string, email: string): FounderProfile => ({
  account_id: accountId,
  email,
  full_name: null,
  role: null,
  linkedin_url: null,
  bio: null,
  prev_employers: [],
  ship_history: [],
  years_in_domain: null,
  domain_insight: null,
  ambition: null,
  co_founders: [],
  advisors: [],
  notable_hires: [],
  public_visible: true,
});

/**
 * 0-100. Drives the dashboard nag + visibility of the Team-signal boost in
 * the SVI report. Pure function — safe to call on client.
 */
export function profileCompletionPct(p: FounderProfile | null): number {
  if (!p) return 0;
  const checks: Array<boolean> = [
    Boolean(p.full_name && p.full_name.trim().length > 1),
    Boolean(p.role && p.role.trim().length > 1),
    Boolean(p.linkedin_url),
    Boolean(p.bio && p.bio.length > 80),
    Boolean(p.prev_employers.length > 0),
    Boolean(p.ship_history.length > 0),
    Boolean(p.years_in_domain != null && p.years_in_domain > 0),
    Boolean(p.domain_insight && p.domain_insight.length > 40),
    Boolean(p.ambition && p.ambition.length > 40),
    Boolean(p.co_founders.length > 0 || p.advisors.length > 0),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/**
 * Projects the profile to a single text blob the SVI engine can scan.
 * Pure function — used by both server (api/svi route) and tests.
 */
export function profileToSviInputText(p: FounderProfile | null): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.full_name) parts.push(`Founder: ${p.full_name}${p.role ? `, ${p.role}` : ""}.`);
  if (p.years_in_domain) parts.push(`${p.years_in_domain} years in domain.`);
  if (p.prev_employers.length > 0) parts.push(`Previously at ${p.prev_employers.join(", ")}.`);
  if (p.ship_history.length > 0) parts.push(`Ship history: ${p.ship_history.join(" · ")}.`);
  if (p.domain_insight) parts.push(p.domain_insight);
  if (p.ambition) parts.push(p.ambition);
  if (p.co_founders.length > 0) {
    parts.push(`Co-founders: ${p.co_founders.map((c) => `${c.name} (${c.role})`).join(", ")}.`);
  }
  if (p.advisors.length > 0) {
    parts.push(`Advisors: ${p.advisors.map((a) => `${a.name} (${a.role})`).join(", ")}.`);
  }
  if (p.notable_hires.length > 0) {
    parts.push(`Notable hires: ${p.notable_hires.map((h) => `${h.name} (${h.role}${h.from ? ` ex-${h.from}` : ""})`).join(", ")}.`);
  }
  return parts.join(" ");
}
