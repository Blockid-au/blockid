// Funding workspace tab ids — importable from server AND client code.
//
// Kept out of funding-workspace.tsx ("use client"): the server page called
// isFundingTab() from that module and Next.js threw "Attempted to call
// isFundingTab() from the server but isFundingTab is on the client" for every
// Starter+ founder (digest 1907948635) — the free branch never reached it.

export type FundingTab = "grants" | "programs" | "events" | "timeline" | "capital" | "refresh" | "alerts";

export const FUNDING_TABS: ReadonlyArray<{ id: FundingTab; label: string }> = [
  { id: "grants", label: "Grants" },
  { id: "programs", label: "Programs" },
  { id: "events", label: "Events" },
  { id: "timeline", label: "Timeline" },
  { id: "capital", label: "Capital map" },
  { id: "refresh", label: "Expert update" },
  { id: "alerts", label: "Alerts" },
];

export function isFundingTab(v: string | null | undefined): v is FundingTab {
  return FUNDING_TABS.some((t) => t.id === v);
}
