import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { ExpensesClient } from "./expenses-client";

export const metadata: Metadata = {
  title: "Expenses | BlockID",
  description:
    "Upload a bank statement CSV, let rules and AI categorise every line against an AU small-business chart, and see your monthly spend, burn rate and GST estimate.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/expenses");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Expenses</h1>
          <p className="text-sm text-ink-700 mt-1">
            Upload your bank statement CSV. Rules place the merchants they recognise for free; AI takes the rest after you see the price. Your monthly
            spend feeds the revenue dashboard, burn rate and runway.
          </p>
        </div>
        <ExpensesClient />
      </div>
    </WorkspaceLayout>
  );
}
