"use client";

/**
 * ProofButton — anchors a score proof via POST /api/proofs/score
 * and shows the resulting hash + a link to /verify/[proofId].
 *
 * This is a client component so it can manage loading/result state
 * without server re-render.
 */

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Loader2, ExternalLink, Copy, Check } from "lucide-react";

interface ProofResult {
  proofId: string;
  hash: string;
  anchoredAt: string;
  idempotent: boolean;
}

interface ProofButtonProps {
  scoreId: string;
}

export function ProofButton({ scoreId }: ProofButtonProps) {
  const [loading, setLoading] = useState(false);
  const [proof, setProof] = useState<ProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleAnchor() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proofs/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score_id: scoreId }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        proofId?: string;
        hash?: string;
        anchoredAt?: string;
        idempotent?: boolean;
        error?: string;
      };
      if (!data.ok || !data.proofId) {
        setError(data.error ?? "Failed to anchor proof");
      } else {
        setProof({
          proofId: data.proofId,
          hash: data.hash ?? "",
          anchoredAt: data.anchoredAt ?? "",
          idempotent: data.idempotent ?? false,
        });
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  async function copyHash() {
    if (!proof?.hash) return;
    try {
      await navigator.clipboard.writeText(proof.hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  if (proof) {
    const shortHash = proof.hash.slice(0, 28) + "…";
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/40 px-4 py-4">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold text-emerald-800">
            {proof.idempotent ? "Proof already anchored" : "Proof anchored"}
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-white border border-emerald-200 px-3 py-2 font-mono text-xs text-ink-700 overflow-hidden">
          <span className="truncate flex-1">{shortHash}</span>
          <button
            onClick={copyHash}
            className="shrink-0 text-ink-400 hover:text-ink-700 transition-colors"
            title="Copy full hash"
            aria-label="Copy proof hash"
          >
            {copied ? (
              <Check strokeWidth={1.75} className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Link
            href={`/verify/${proof.proofId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            View Proof Page
            <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
          </Link>
          <span className="text-xs text-ink-400 tabular-nums">
            {proof.anchoredAt.slice(0, 10)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {error && (
        <p className="mb-2 text-xs text-red-600">{error}</p>
      )}
      <button
        onClick={handleAnchor}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
      >
        {loading ? (
          <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
        ) : (
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
        )}
        {loading ? "Anchoring proof…" : "Get Tamper-Evident Proof"}
      </button>
      <p className="mt-1.5 text-xs text-ink-400">
        Generate a cryptographic hash you can share with investors as evidence this score has not been altered.
      </p>
    </div>
  );
}
