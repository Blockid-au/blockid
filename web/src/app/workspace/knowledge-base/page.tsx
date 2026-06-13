import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { kbList } from "@/lib/kb-client";
import { KnowledgeBaseClient } from "./client";

export const metadata: Metadata = {
  title: "Knowledge Base",
  description: "BlockID Startup Index™ proprietary knowledge base — valuation methodologies, SVI dimensions, market benchmarks.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function KnowledgeBasePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/knowledge-base");

  const articles = await kbList(undefined, 500);
  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";

  return (
    <WorkspaceLayout user={user}>
      <KnowledgeBaseClient
        initialArticles={articles.map((a) => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          category: a.category,
          content: a.content,
          author: a.author,
          updated_at: a.updated_at,
        }))}
        isAdmin={isAdmin}
      />
    </WorkspaceLayout>
  );
}
