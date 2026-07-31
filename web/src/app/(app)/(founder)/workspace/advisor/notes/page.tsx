// /workspace/advisor/notes — engagement notes timeline for a single client.
//
// Server component. Reads `searchParams.client` (client_id), queries
// engagement_notes for that client, and renders a reverse-chronological
// timeline. Includes an "Add note" form that POSTs to /api/advisor/notes
// (endpoint owned elsewhere — this file only renders the form).

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Feature } from "@/lib/entitlements";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Engagement Notes — Advisor Workspace",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const ADVISOR_COHORT_FEATURE = "advisor.cohort" as Feature;

interface EngagementNote {
  id: string;
  clientId: string;
  authorName: string | null;
  authorEmail: string | null;
  body: string;
  createdAt: string;
}

async function loadNotes(
  advisorId: string,
  clientId: string,
): Promise<EngagementNote[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("engagement_notes")
      .select("id,client_id,author_name,author_email,body,created_at")
      .eq("advisor_id", advisorId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data ?? []).map((row) => ({
      id: String(row.id),
      clientId: String(row.client_id),
      authorName: row.author_name == null ? null : String(row.author_name),
      authorEmail: row.author_email == null ? null : String(row.author_email),
      body: String(row.body ?? ""),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    }));
  } catch {
    return [];
  }
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Minimal safe body renderer — preserves paragraph breaks and escapes HTML by
// rendering as text. Bold `**foo**` becomes <strong>, single-newline stays
// as <br/>. Kept intentionally small; heavier markdown lives in a shared
// component in a follow-up task.
function renderBody(md: string): React.ReactNode {
  const paragraphs = md.split(/\n{2,}/);
  return paragraphs.map((p, pi) => (
    <p key={pi} className="whitespace-pre-wrap">
      {p.split(/(\*\*[^*]+\*\*)/g).map((chunk, ci) => {
        if (chunk.startsWith("**") && chunk.endsWith("**")) {
          return <strong key={ci}>{chunk.slice(2, -2)}</strong>;
        }
        return <span key={ci}>{chunk}</span>;
      })}
    </p>
  ));
}

interface PageProps {
  searchParams: Promise<{ client?: string | string[] }>;
}

export default async function AdvisorNotesPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/advisor/notes");

  const isSandbox = await getCurrentProjectIsSandbox();

  const params = await searchParams;
  const raw = params.client;
  const clientId = Array.isArray(raw) ? raw[0] : raw;

  const notes = clientId ? await loadNotes(user.id, clientId) : [];

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <FeatureGate feature={ADVISOR_COHORT_FEATURE} label="Engagement notes">
        <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
          <header>
            <div className="flex items-center gap-3">
              <Link
                href="/workspace/advisor/roster"
                className="text-xs text-brand-600 hover:underline"
              >
                &larr; Back to roster
              </Link>
            </div>
            <h1 className="mt-2 text-2xl font-bold text-ink-900">
              Engagement notes
            </h1>
            <p className="text-sm text-ink-500 mt-1">
              {clientId
                ? `Reverse-chronological log for client ${clientId}.`
                : "Pick a client from the roster to view their notes."}
            </p>
          </header>

          {clientId ? (
            <>
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <h2 className="text-lg font-semibold text-ink-900">Add note</h2>
                <p className="text-sm text-ink-500 mt-1">
                  Notes stay private to you. Markdown-lite: use blank lines for
                  paragraphs and <code>**bold**</code> for emphasis.
                </p>
                <form
                  action="/api/advisor/notes"
                  method="post"
                  className="mt-4 space-y-3"
                >
                  <input type="hidden" name="client_id" value={clientId} />
                  <label className="block">
                    <span className="text-xs uppercase tracking-wide text-slate-500">
                      Note body
                    </span>
                    <textarea
                      name="body"
                      required
                      rows={5}
                      className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                      placeholder="What did you discuss? Next actions? Blockers?"
                    />
                  </label>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                    >
                      Save note
                    </button>
                  </div>
                </form>
              </section>

              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
                <h2 className="text-lg font-semibold text-ink-900">Timeline</h2>
                {notes.length === 0 ? (
                  <p className="mt-4 text-sm text-ink-500 italic">
                    No engagement notes yet — first entry helps you show impact
                    at renewal.
                  </p>
                ) : (
                  <ol className="mt-4 space-y-6">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="border-l-2 border-brand-200 dark:border-brand-800 pl-4"
                      >
                        <div className="flex flex-wrap items-baseline gap-2 text-xs text-ink-500">
                          <span className="font-semibold text-ink-700">
                            {n.authorName ?? n.authorEmail ?? "You"}
                          </span>
                          <span>·</span>
                          <time dateTime={n.createdAt}>
                            {fmtDateTime(n.createdAt)}
                          </time>
                        </div>
                        <div className="mt-2 text-sm text-ink-900 space-y-2">
                          {renderBody(n.body)}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
              <p className="text-sm text-ink-500">
                No client selected. Go to the{" "}
                <Link
                  href="/workspace/advisor/roster"
                  className="text-brand-600 hover:underline"
                >
                  client roster
                </Link>{" "}
                and click a client to view their engagement history.
              </p>
            </section>
          )}

          <NotFinancialAdvice kind="not_financial_advice" compact />
        </div>
      </FeatureGate>
    </WorkspaceLayout>
  );
}
