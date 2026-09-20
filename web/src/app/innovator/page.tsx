// /innovator — HIDDEN (G20-F1, 2026-09-20). See ./hidden-console.tsx.
import { hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";
import { HiddenInnovatorConsole } from "./hidden-console";

export const metadata = hiddenPageMetadata("Innovator Console");
export const dynamic = "force-dynamic";

export default function Page() {
  return <HiddenInnovatorConsole path="/innovator" />;
}
