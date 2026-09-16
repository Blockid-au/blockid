// /workspace/reports hub layout — G13-W2-IA2 (spec §A.1).
//
// Wraps every tab page in the hub's HubTabsProvider; WorkspaceLayout (which
// each page still mounts itself) renders the tablist from that context at
// the top of <main>. Tabs + gates live in lib/nav/hubs.ts.

import type { ReactNode } from "react";
import { HubTabsProvider } from "@/components/workspace/hub-tabs";

export default function ReportsHubLayout({ children }: { children: ReactNode }) {
  return <HubTabsProvider hub="reports">{children}</HubTabsProvider>;
}
