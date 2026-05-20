import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { DataRoomClient } from "./data-room-client";

export const metadata: Metadata = {
  title: "Data Room",
  description: "Build and manage your investor-ready data room on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Data room item definition — shared between server & client
// ---------------------------------------------------------------------------

export interface DataRoomItemDef {
  id: string;
  category: string;
  label: string;
  description: string;
  dimension: string;
}

export interface DataRoomItemState {
  id: string;
  status: "not_started" | "uploaded" | "verified";
  fileUrl: string | null;
  fileName: string | null;
  evidenceId: string | null;
}

const DATA_ROOM_ITEMS: DataRoomItemDef[] = [
  // Company Formation
  { id: "cert_incorp", category: "Company Formation", label: "Certificate of Incorporation / ASIC registration", description: "Official registration document from ASIC or equivalent authority", dimension: "lco" },
  { id: "constitution", category: "Company Formation", label: "Company constitution", description: "The company's governing rules and constitution document", dimension: "lco" },
  { id: "sha", category: "Company Formation", label: "Shareholders agreement (SHA)", description: "Agreement between all shareholders covering rights and obligations", dimension: "lco" },
  { id: "abn", category: "Company Formation", label: "ABN confirmation", description: "Australian Business Number registration confirmation", dimension: "lco" },

  // Cap Table & Equity
  { id: "cap_table", category: "Cap Table & Equity", label: "Cap table (current)", description: "Current ownership structure showing all shareholders and their holdings", dimension: "cgh" },
  { id: "vesting", category: "Cap Table & Equity", label: "Vesting schedules", description: "Vesting timelines for founders and key employees", dimension: "cgh" },
  { id: "esop", category: "Cap Table & Equity", label: "ESOP plan document", description: "Employee Share Option Plan terms and documentation", dimension: "cgh" },
  { id: "safe_notes", category: "Cap Table & Equity", label: "Convertible note / SAFE terms", description: "Terms of any convertible instruments or SAFEs issued", dimension: "cgh" },

  // Financials
  { id: "pnl", category: "Financials", label: "P&L (last 12 months)", description: "Profit and loss statement for the previous 12 months", dimension: "tre" },
  { id: "cashflow", category: "Financials", label: "Cash flow forecast", description: "Forward-looking cash flow projections (12-24 months)", dimension: "tre" },
  { id: "revenue_metrics", category: "Financials", label: "Revenue metrics dashboard", description: "Key revenue metrics: MRR, ARR, churn, LTV, CAC", dimension: "tre" },
  { id: "bank_statements", category: "Financials", label: "Bank statements (last 3 months)", description: "Recent bank statements showing cash position", dimension: "tre" },

  // Product & Tech
  { id: "product_demo", category: "Product & Tech", label: "Product demo / screenshots", description: "Screenshots, video demo, or live product walkthrough", dimension: "ptd" },
  { id: "tech_arch", category: "Product & Tech", label: "Technical architecture doc", description: "Overview of tech stack, infrastructure, and system design", dimension: "ptd" },
  { id: "ip_assignment", category: "Product & Tech", label: "IP assignment agreements", description: "Intellectual property assignment from founders and contractors", dimension: "ptd" },

  // Market & Traction
  { id: "pitch_deck", category: "Market & Traction", label: "Pitch deck", description: "Investor-facing pitch deck (10-15 slides)", dimension: "mpc" },
  { id: "customer_contracts", category: "Market & Traction", label: "Customer contracts / LOIs", description: "Signed customer agreements, LOIs, or pilot contracts", dimension: "mpc" },
  { id: "market_research", category: "Market & Traction", label: "Market research summary", description: "TAM/SAM/SOM analysis and competitive landscape", dimension: "mpc" },

  // Legal & Compliance
  { id: "tos", category: "Legal & Compliance", label: "Terms of service", description: "Customer-facing terms of service or EULA", dimension: "lco" },
  { id: "privacy_policy", category: "Legal & Compliance", label: "Privacy policy", description: "Privacy policy compliant with Australian Privacy Act", dimension: "lco" },
  { id: "key_contracts", category: "Legal & Compliance", label: "Key contracts (suppliers, partners)", description: "Material contracts with suppliers, distributors, or partners", dimension: "lco" },
];

// Group items by category for the client
const CATEGORIES = Array.from(new Set(DATA_ROOM_ITEMS.map((i) => i.category)));

export default async function DataRoomPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/data-room");

  // Load existing evidence to determine item states
  const itemStates: DataRoomItemState[] = [];
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();

    if (account) {
      // Find evidence rows matching data room items
      const { data: evidence } = await supabase
        .from("svi_evidence")
        .select("id, label, value_or_url, confidence_level, dimension")
        .eq("account_id", account.id)
        .eq("evidence_type", "document_uploaded")
        .order("created_at", { ascending: false });

      if (evidence) {
        // Map evidence back to data room items by matching label substrings
        for (const item of DATA_ROOM_ITEMS) {
          const match = evidence.find(
            (e: { label?: string; dimension?: string }) =>
              e.label?.toLowerCase().includes(item.id.replace(/_/g, " ")) ||
              e.label?.toLowerCase().includes(item.label.toLowerCase().slice(0, 20)),
          );
          if (match) {
            itemStates.push({
              id: item.id,
              status: match.confidence_level === "verified" ? "verified" : "uploaded",
              fileUrl: (match.value_or_url as string) ?? null,
              fileName: (match.label as string) ?? null,
              evidenceId: match.id,
            });
          }
        }
      }
    }
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-4xl mx-auto">
        <DataRoomClient
          items={DATA_ROOM_ITEMS}
          categories={CATEGORIES}
          initialStates={itemStates}
        />
      </div>
    </WorkspaceLayout>
  );
}
