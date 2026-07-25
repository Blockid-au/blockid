import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { StructureDecisionFormClient } from "./structure-decision-form-client";

export const metadata: Metadata = {
  title: "Share structure decision | BlockID",
  description:
    "Walk the Chapter 10 dual-class decision — ASX Rule 6.9, UK Companies Act 2006 Part 26 Scheme (Atlassian 2014-15), and Delaware DGCL s102(a)(4).",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function StructureDecisionPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/fundraise/structure");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Fundraise · Chapter 10
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            Share structure decision
          </h1>
          <p className="text-sm text-muted-foreground">
            Single-class default vs single-class-with-founder-protections vs
            dual-class via an offshore parent. Signal, not advice.
          </p>
        </header>

        <StructureDecisionFormClient />

        <div className="flex flex-wrap gap-3">
          <Link
            href="/guide/10-fundraise"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-100"
          >
            Read Chapter 10 — Fundraise
          </Link>
          <Link
            href="/workspace/fundraise"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Back to fundraise workspace
          </Link>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
