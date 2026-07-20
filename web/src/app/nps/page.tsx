import type { Metadata } from "next";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { getSupabaseAdmin } from "@/lib/supabase";
import { NpsClient } from "./nps-client";

export const metadata: Metadata = {
  title: "How likely are you to recommend BlockID?",
  description: "One-question NPS pulse for BlockID.au founders.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface NpsRow {
  id: string;
  completed_at: string | null;
  score: number | null;
}

async function lookupToken(token: string): Promise<NpsRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("nps_responses")
    .select("id, completed_at, score")
    .eq("token", token)
    .maybeSingle();
  return (data as NpsRow | null) ?? null;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="min-h-svh bg-surface-100 flex items-center justify-center px-4 pt-28 pb-16">
        <div className="max-w-md w-full bg-white border border-surface-200 rounded-2xl p-8 shadow-sm">
          {children}
        </div>
      </main>
      <Footer />
    </>
  );
}

export default async function NpsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;

  if (!token) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-ink-900 mb-2">Invalid link</h1>
        <p className="text-ink-600 text-sm">
          This NPS link is missing its token. Please open it from the email we sent you.
        </p>
      </Shell>
    );
  }

  const row = await lookupToken(token);

  if (!row) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-ink-900 mb-2">Link not found</h1>
        <p className="text-ink-600 text-sm">
          We could not find a pending pulse for this token. It may have already been answered.
        </p>
      </Shell>
    );
  }

  if (row.completed_at) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold text-ink-900 mb-2">Thanks, already recorded</h1>
        <p className="text-ink-600 text-sm">
          You scored BlockID {row.score ?? "?"} out of 10 on{" "}
          {new Date(row.completed_at).toLocaleDateString()}. You can close this tab.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <NpsClient token={token} />
    </Shell>
  );
}
