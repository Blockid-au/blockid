import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ShieldCheck, ShieldX, Clock, Hash, FileCheck, ExternalLink } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/* ── Types ─────────────────────────────────────────────────────────────────── */

interface ProofRow {
  id: string;
  score_id: string;
  hash: string;
  canonical_json: string;
  anchored_at: string;
  anchor_method: "local" | "blockchain";
  verified: boolean;
}

interface TrustEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  event_type: string;
  hash: string;
  metadata: {
    proof_id?: string;
    company_name?: string | null;
    score_date?: string | null;
    svi_total?: number | null;
    anchor_method?: string;
  };
  created_at: string;
}

/* ── Data fetching ─────────────────────────────────────────────────────────── */

async function fetchProof(proofId: string): Promise<ProofRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("score_proofs")
    .select("*")
    .eq("id", proofId)
    .maybeSingle();

  if (error) {
    console.error("[blockid:verify] proof fetch failed", error);
    return null;
  }
  return (data as ProofRow) ?? null;
}

async function fetchTrustEvent(proofId: string): Promise<TrustEvent | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("trust_events")
    .select("*")
    .eq("metadata->>proof_id", proofId)
    .maybeSingle();

  if (error) {
    console.error("[blockid:verify] trust_event fetch failed", error);
    return null;
  }
  return (data as TrustEvent) ?? null;
}

/* ── Metadata ──────────────────────────────────────────────────────────────── */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ proofId: string }>;
}): Promise<Metadata> {
  const { proofId } = await params;
  const proof = await fetchProof(proofId);
  const found = Boolean(proof?.verified);

  return {
    title: found
      ? "Verified Score Proof — BlockID"
      : "Proof Not Found — BlockID",
    description: found
      ? "Independently verify the tamper-evident hash for this BlockID Startup Value Index score."
      : "This proof ID was not found in the BlockID registry.",
    robots: { index: false, follow: false },
  };
}

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default async function VerifyProofPage({
  params,
}: {
  params: Promise<{ proofId: string }>;
}) {
  const { proofId } = await params;

  const proof = await fetchProof(proofId);

  if (!proof) {
    notFound();
  }

  const trustEvent = await fetchTrustEvent(proofId);
  const companyName = trustEvent?.metadata?.company_name ?? "Unknown Company";
  const scoreDate = trustEvent?.metadata?.score_date
    ? trustEvent.metadata.score_date.slice(0, 10)
    : proof.anchored_at.slice(0, 10);
  const sviTotal = trustEvent?.metadata?.svi_total ?? null;

  const anchoredDate = new Date(proof.anchored_at).toLocaleString("en-AU", {
    dateStyle: "long",
    timeStyle: "medium",
    timeZone: "Australia/Sydney",
  });

  // Break hash into prefix + hex for display
  const hashParts = proof.hash.split(":");
  const hashHex = hashParts[hashParts.length - 1] ?? proof.hash;
  const hashPrefix = hashParts.slice(0, -1).join(":") + ":";

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-50 to-white">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-surface-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="BlockID home">
            <Image
              src="/images/logo-icon-transparent.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 shrink-0"
            />
            <span className="font-extrabold tracking-tight text-lg text-ink-900">
              BlockID<span className="text-brand-500">.au</span>
            </span>
          </Link>
          <span className="text-xs font-medium text-ink-400 uppercase tracking-wider">
            Proof Verification
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">

        {/* ── Status Banner ──────────────────────────────────────────────────── */}
        {proof.verified ? (
          <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5">
            <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <ShieldCheck strokeWidth={1.75} className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-emerald-800">Verified</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                This proof is cryptographically valid and on record in the BlockID registry.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-5">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <ShieldX strokeWidth={1.75} className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-red-800">Not Verified</p>
              <p className="text-sm text-red-700 mt-0.5">
                This proof record exists but has not been marked as verified.
              </p>
            </div>
          </div>
        )}

        {/* ── Score Summary ─────────────────────────────────────────────────── */}
        <section className="mt-8 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold text-ink-900 flex items-center gap-2">
            <FileCheck strokeWidth={1.75} className="h-5 w-5 text-brand-500" />
            Score Snapshot
          </h1>
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-medium">Company</p>
              <p className="mt-1 text-sm font-semibold text-ink-800 truncate">{companyName}</p>
            </div>
            <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
              <p className="text-[10px] uppercase tracking-widest text-ink-400 font-medium">Score Date</p>
              <p className="mt-1 text-sm font-semibold text-ink-800 tabular-nums">{scoreDate}</p>
            </div>
            {sviTotal !== null && (
              <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
                <p className="text-[10px] uppercase tracking-widest text-ink-400 font-medium">SVI Score</p>
                <p className="mt-1 text-sm font-semibold text-ink-800 tabular-nums">{sviTotal}</p>
              </div>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-ink-400">
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-100 px-2.5 py-1 font-medium">
              {proof.anchor_method === "blockchain" ? "Blockchain anchored" : "Locally anchored"}
            </span>
            <span>·</span>
            <Link
              href={`/s/${proof.score_id}`}
              className="inline-flex items-center gap-1 text-brand-600 hover:underline"
            >
              View full report <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
            </Link>
          </div>
        </section>

        {/* ── Hash ─────────────────────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink-800 flex items-center gap-2">
            <Hash strokeWidth={1.75} className="h-4.5 w-4.5 text-brand-500" />
            Cryptographic Hash
          </h2>
          <p className="mt-1 text-sm text-ink-500">SHA-256 of the canonical score JSON, prefixed with <code className="text-xs bg-surface-100 px-1 rounded">blockid:v1:</code></p>
          <div className="mt-4 rounded-xl bg-surface-50 border border-surface-200 px-4 py-3 overflow-x-auto">
            <p className="font-mono text-xs text-ink-500 break-all leading-relaxed">
              <span className="text-brand-500">{hashPrefix}</span>
              <span className="text-ink-800">{hashHex}</span>
            </p>
          </div>
          <p className="mt-3 text-xs text-ink-400">
            Proof ID: <span className="font-mono text-ink-600">{proof.id}</span>
          </p>
        </section>

        {/* ── Timestamp ────────────────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink-800 flex items-center gap-2">
            <Clock strokeWidth={1.75} className="h-4.5 w-4.5 text-brand-500" />
            Anchored At
          </h2>
          <p className="mt-2 text-sm text-ink-700 tabular-nums">{anchoredDate} AEST</p>
          <p className="mt-0.5 text-xs text-ink-400 font-mono">{proof.anchored_at}</p>
        </section>

        {/* ── What this proves ─────────────────────────────────────────────── */}
        <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/40 p-6">
          <h2 className="text-base font-semibold text-ink-800">What this proof means</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink-600">
            <li className="flex items-start gap-3">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
              <span>
                <strong className="text-ink-800">Tamper evidence:</strong> The hash above was computed from the exact score data at the time of anchoring. If any score field — revenue, runway, governance, SVI total — were changed after anchoring, the hash would not match.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
              <span>
                <strong className="text-ink-800">Deterministic:</strong> The same score data always produces the same hash (sorted keys, no whitespace variation). You can re-compute independently using the canonical JSON and SHA-256.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
              <span>
                <strong className="text-ink-800">Anchor method:</strong>{" "}
                {proof.anchor_method === "blockchain"
                  ? "This proof is anchored on-chain. The hash can be independently verified on the blockchain explorer."
                  : "This proof is locally anchored in the BlockID registry. Blockchain anchoring is available on request."}
              </span>
            </li>
          </ul>
        </section>

        {/* ── CTA ─────────────────────────────────────────────────────────── */}
        <section className="mt-8 text-center">
          <p className="text-sm text-ink-500">Want to verify your own startup&apos;s score?</p>
          <Link
            href="/score"
            className="inline-flex items-center gap-2 mt-3 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            Get Your Free SVI Score →
          </Link>
        </section>

        {/* ── Footer note ─────────────────────────────────────────────────── */}
        <p className="mt-12 text-center text-[11px] text-ink-300 leading-relaxed max-w-lg mx-auto">
          This is an automated tamper-evidence record generated by BlockID.au. It does not constitute
          investment advice or a guarantee of the underlying data accuracy. Always conduct your own
          due diligence.
        </p>
      </main>
    </div>
  );
}
