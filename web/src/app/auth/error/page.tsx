import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign-in link issue · BlockID",
  robots: { index: false, follow: false },
};

const REASONS: Record<string, { title: string; body: string }> = {
  invalid_token: {
    title: "That link looks malformed",
    body: "The sign-in link in your email may have been truncated. Try clicking it again, or request a new link.",
  },
  not_found: {
    title: "Link not recognised",
    body: "We couldn't find that sign-in link. It may have been used already, or it was generated on a different deployment.",
  },
  expired: {
    title: "Link has expired",
    body: "Sign-in links are good for 15 minutes. Request a fresh one and try again.",
  },
  already_used: {
    title: "Link has been used",
    body: "Magic links work once. Request a new one if you need to sign in again.",
  },
  not_configured: {
    title: "Sign-in not available",
    body: "BlockID auth is not configured on this environment. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable it.",
  },
  session_failed: {
    title: "Couldn't start your session",
    body: "We verified your link but couldn't issue a session cookie. Please try again.",
  },
  db_error: {
    title: "Something went wrong on our side",
    body: "Try again in a moment. If this keeps happening, email admin@blockid.au.",
  },
  unknown: {
    title: "Couldn't sign you in",
    body: "Something didn't go to plan. Request a new sign-in link and try again.",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const sp = await searchParams;
  const reasonKey = (sp.reason ?? "unknown") as keyof typeof REASONS;
  const r = REASONS[reasonKey] ?? REASONS.unknown;

  return (
    <main className="min-h-screen bg-[#0B1220] text-slate-100 flex items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-[#0F172A] border border-[#1F2A44] rounded-2xl p-8">
        <p className="text-[11px] tracking-[0.2em] uppercase text-brand-500 font-medium mb-2">
          BlockID<span className="text-gold-400">.au</span> — sign in
        </p>
        <h1 className="text-2xl font-semibold mb-3">{r.title}</h1>
        <p className="text-slate-400 leading-relaxed mb-6">{r.body}</p>
        <Link
          href="/auth/login"
          className="inline-block bg-brand-500 hover:bg-brand-600 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
        >
          Request a new link
        </Link>
        <Link
          href="/"
          className="inline-block ml-3 text-slate-400 text-sm hover:text-slate-200"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
