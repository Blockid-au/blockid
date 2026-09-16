import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FundraiseClient } from "./fundraise-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Fundraise | BlockID",
  description: "Model fundraise rounds, calculate dilution, and manage your fundraising workflow.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FundraisePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/raise/round");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto">
        <FundraiseClient />
        {/* G13-W2-IA2 — the Chapter 10 share-structure decision was URL-only
            after the S-IA1 sidebar cut; it belongs to this round. */}
        <Link
          href="/workspace/raise/round/structure"
          data-testid="structure-decision-link"
          className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-line-subtle bg-surface p-4 text-sm hover:border-action transition-colors"
        >
          <span>
            <span className="block font-semibold text-primary">Share structure decision</span>
            <span className="block text-secondary">Single-class, founder protections or dual-class — decide before the term sheet.</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-action" aria-hidden />
        </Link>
      </div>
    </WorkspaceLayout>
  );
}
