// /dashboard/admin/content-pillars — T0203 CMO content pillar tracker
//
// Admin-only. Tracks 7 CMO content pillars × weekly LinkedIn queue.
// Each pillar has a publishing cadence target and a list of recent posts.
// Pulls data from content/insights/*.md (front-matter `pillar:` field).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import * as fs from "fs";
import * as path from "path";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ContentPillarsClient } from "./content-pillars-client";

export const metadata: Metadata = {
  title: "Content Pillars — Admin · BlockID",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface PillarPost {
  slug: string;
  title: string;
  pillar: string;
  publishedAt: string;
  status: "published" | "draft" | "scheduled";
}

export interface PillarStats {
  id: string;
  name: string;
  description: string;
  weeklyTarget: number;
  postsThisWeek: number;
  postsLast30d: number;
  totalPosts: number;
  recentPosts: PillarPost[];
}

const PILLARS = [
  { id: "founder-stories", name: "Founder Stories", description: "Case studies of AU founders who used SVI", weeklyTarget: 1 },
  { id: "valuation-101", name: "Valuation 101", description: "Educational content on startup valuation methods", weeklyTarget: 2 },
  { id: "fundraising-tactics", name: "Fundraising Tactics", description: "Cold outreach, deck tips, Antler/Startmate prep", weeklyTarget: 2 },
  { id: "esop-equity", name: "ESOP & Equity", description: "Cap table, Division 83A, ESOP best practices", weeklyTarget: 1 },
  { id: "au-ecosystem", name: "AU Ecosystem", description: "Local AU startup news, sector insights, accelerator updates", weeklyTarget: 2 },
  { id: "ai-tooling", name: "AI Tooling", description: "How founders use AI to validate ideas and accelerate growth", weeklyTarget: 1 },
  { id: "metrics-deep-dives", name: "Metrics Deep Dives", description: "MRR/ARR, LTV/CAC, Rule of 40, runway, cohort analysis", weeklyTarget: 1 },
];

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*"?([^"]*)"?$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

function loadInsightsArticles(): PillarPost[] {
  const insightsDir = path.join(process.cwd(), "content/insights");
  const posts: PillarPost[] = [];
  if (!fs.existsSync(insightsDir)) return posts;

  try {
    for (const file of fs.readdirSync(insightsDir)) {
      if (!file.endsWith(".md") && !file.endsWith(".mdx")) continue;
      const full = path.join(insightsDir, file);
      const content = fs.readFileSync(full, "utf8");
      const fm = parseFrontmatter(content);
      const slug = file.replace(/\.mdx?$/, "");
      posts.push({
        slug,
        title: fm.title || slug,
        pillar: fm.pillar || inferPillar(slug, fm.title || ""),
        publishedAt: fm.publishedAt || fm.date || new Date(fs.statSync(full).mtime).toISOString(),
        status: "published",
      });
    }
  } catch {
    // best effort
  }
  return posts;
}

function inferPillar(slug: string, title: string): string {
  const s = (slug + " " + title).toLowerCase();
  if (s.includes("found") || s.includes("story") || s.includes("case stud")) return "founder-stories";
  if (s.includes("valuation") || s.includes("berkus") || s.includes("scorecard") || s.includes("vc method")) return "valuation-101";
  if (s.includes("raise") || s.includes("fundrai") || s.includes("antler") || s.includes("startmate") || s.includes("deck") || s.includes("pitch")) return "fundraising-tactics";
  if (s.includes("esop") || s.includes("cap table") || s.includes("equity") || s.includes("div 83") || s.includes("vesting")) return "esop-equity";
  if (s.includes("austral") || s.includes("au ") || s.includes("avcal") || s.includes("ecosystem")) return "au-ecosystem";
  if (s.includes("ai ") || s.includes("ml ") || s.includes("automat") || s.includes("llm")) return "ai-tooling";
  if (s.includes("mrr") || s.includes("arr") || s.includes("ltv") || s.includes("cac") || s.includes("metric") || s.includes("runway")) return "metrics-deep-dives";
  return "au-ecosystem";
}

function computeStats(allPosts: PillarPost[]): PillarStats[] {
  const now = Date.now();
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;

  return PILLARS.map((p) => {
    const pillarPosts = allPosts.filter((post) => post.pillar === p.id);
    const thisWeek = pillarPosts.filter((post) => new Date(post.publishedAt).getTime() >= weekAgo).length;
    const last30 = pillarPosts.filter((post) => new Date(post.publishedAt).getTime() >= monthAgo).length;
    const recent = pillarPosts
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
      .slice(0, 4);
    return {
      ...p,
      postsThisWeek: thisWeek,
      postsLast30d: last30,
      totalPosts: pillarPosts.length,
      recentPosts: recent,
    };
  });
}

export default async function ContentPillarsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/content-pillars");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <WorkspaceLayout user={user}>
        <div className="max-w-2xl mx-auto p-8 text-center">
          <p className="text-sm text-muted-foreground">Admin only.</p>
          <Link href="/dashboard" className="text-blue-600 hover:underline mt-2 inline-block">← Back to dashboard</Link>
        </div>
      </WorkspaceLayout>
    );
  }

  const allPosts = loadInsightsArticles();
  const stats = computeStats(allPosts);

  return (
    <WorkspaceLayout user={user}>
      <ContentPillarsClient stats={stats} totalArticles={allPosts.length} />
    </WorkspaceLayout>
  );
}
