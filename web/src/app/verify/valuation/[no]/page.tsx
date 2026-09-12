// /verify/valuation/[no] — public verification page for a valuation
// certificate (S22-A). Same shell as /verify/[proofId]: status banner,
// what-is-on-record card, hash card, what-this-means, footer note.
//
// Shows ONLY: issue date, startup name, whether the stored content still
// hashes to the printed fingerprint (and whether a `?hash=` the visitor
// pasted matches), and the revoked state. No valuation figures — the
// certificate itself carries those, and only whoever the founder gave it
// to should have it. An unknown number renders a not-found state (200,
// noindex) rather than `notFound()` so a mistyped number gets a useful page.

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Clock, FileCheck, Hash, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyCertificate, type VerifyAnswer } from "@/lib/valuation-certificate/verify";
import { LEGAL_ENTITY_LINE } from "@/lib/valuation-certificate/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ no: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { no } = await params;
  return {
    title: `Verify valuation certificate ${decodeURIComponent(no).slice(0, 20)} — BlockID`,
    description: "Check whether a BlockID valuation certificate is on record, unchanged and not revoked.",
    robots: { index: false, follow: false },
  };
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-AU", { dateStyle: "long", timeStyle: "short", timeZone: "Australia/Sydney" });
}

function Banner({ answer }: { answer: VerifyAnswer }) {
  if (!answer.found) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-5" data-status="unknown">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <ShieldX strokeWidth={1.75} className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-red-800">Not on record</p>
          <p className="text-sm text-red-700 mt-0.5">
            No certificate with the number <span className="font-mono">{answer.certificateNo || "—"}</span> exists in the
            BlockID register. Check the number on the PDF cover and try again.
          </p>
        </div>
      </div>
    );
  }
  if (answer.status === "hash_mismatch") {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-6 py-5" data-status="hash_mismatch">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
          <ShieldX strokeWidth={1.75} className="h-6 w-6 text-red-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-red-800">Record does not match its seal</p>
          <p className="text-sm text-red-700 mt-0.5">
            The stored certificate no longer hashes to its recorded fingerprint. Do not rely on this certificate; contact
            BlockID.au.
          </p>
        </div>
      </div>
    );
  }
  if (answer.status === "revoked") {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-6 py-5" data-status="revoked">
        <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
          <ShieldAlert strokeWidth={1.75} className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <p className="text-lg font-semibold text-amber-800">Revoked</p>
          <p className="text-sm text-amber-700 mt-0.5">
            This certificate was issued and is on record, but the startup revoked it on {fmt(answer.revokedAt ?? "")}
            {answer.revokedReason ? ` — "${answer.revokedReason}"` : ""}. It is no longer current.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5" data-status="valid">
      <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
        <ShieldCheck strokeWidth={1.75} className="h-6 w-6 text-emerald-600" />
      </div>
      <div>
        <p className="text-lg font-semibold text-emerald-800">Verified</p>
        <p className="text-sm text-emerald-700 mt-0.5">
          This certificate is on record in the BlockID register, its content matches its seal, and it has not been revoked.
        </p>
      </div>
    </div>
  );
}

export default async function VerifyValuationCertificatePage({ params, searchParams }: Params) {
  const { no } = await params;
  const sp = (await searchParams) ?? {};
  const suppliedHash = typeof sp.hash === "string" ? sp.hash : null;
  const answer = await verifyCertificate(getSupabaseAdmin(), no, suppliedHash);

  return (
    <div className="min-h-screen bg-gradient-to-b from-surface-50 to-white">
      <header className="border-b border-surface-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="BlockID home">
            <Image src="/images/logo-icon-transparent.png" alt="" width={28} height={28} className="h-7 w-7 shrink-0" />
            <span className="font-extrabold tracking-tight text-lg text-ink-900">
              BlockID<span className="text-brand-500">.au</span>
            </span>
          </Link>
          <span className="text-xs font-medium text-ink-400 uppercase tracking-wider">Certificate Verification</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <Banner answer={answer} />

        {answer.found && (
          <>
            <section className="mt-8 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
              <h1 className="text-xl font-semibold text-ink-900 flex items-center gap-2">
                <FileCheck strokeWidth={1.75} className="h-5 w-5 text-brand-500" />
                Valuation certificate on record
              </h1>
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-ink-400 font-medium">Certificate no.</p>
                  <p className="mt-1 text-sm font-semibold text-ink-800 font-mono" data-testid="certificate-no">{answer.certificateNo}</p>
                </div>
                <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-ink-400 font-medium">Startup</p>
                  <p className="mt-1 text-sm font-semibold text-ink-800 truncate" data-testid="startup-name">{answer.startupName}</p>
                </div>
                <div className="rounded-xl bg-surface-50 border border-surface-200 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-widest text-ink-400 font-medium">Issued</p>
                  <p className="mt-1 text-sm font-semibold text-ink-800 tabular-nums" data-testid="issued-at">{fmt(answer.issuedAt)}</p>
                </div>
              </div>
              <p className="mt-4 text-xs text-ink-400">
                This page confirms the record only. The SVI score and the indicative valuation range are printed on the
                certificate the startup shared with you; they are not shown here.
              </p>
            </section>

            <section className="mt-6 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-800 flex items-center gap-2">
                <Hash strokeWidth={1.75} className="h-4.5 w-4.5 text-brand-500" />
                Content hash
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                SHA-256 of the canonical certificate payload, prefixed with{" "}
                <code className="text-xs bg-surface-100 px-1 rounded">blockid:v1:</code>. The first 12 characters are the
                fingerprint printed on the cover.
              </p>
              <div className="mt-4 rounded-xl bg-surface-50 border border-surface-200 px-4 py-3 overflow-x-auto">
                <p className="font-mono text-xs text-ink-700 break-all leading-relaxed" data-testid="content-hash">{answer.contentHash}</p>
              </div>
              <ul className="mt-3 space-y-1 text-xs text-ink-500">
                <li data-testid="stored-hash-match">
                  Stored content re-hashes to this value:{" "}
                  <strong className={answer.storedHashMatch ? "text-emerald-700" : "text-red-700"}>
                    {answer.storedHashMatch ? "yes" : "no"}
                  </strong>
                </li>
                {answer.suppliedHashMatch !== null && (
                  <li data-testid="supplied-hash-match">
                    The hash you supplied matches the record:{" "}
                    <strong className={answer.suppliedHashMatch ? "text-emerald-700" : "text-red-700"}>
                      {answer.suppliedHashMatch ? "yes" : "no"}
                    </strong>
                  </li>
                )}
              </ul>
            </section>

            <section className="mt-6 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-ink-800 flex items-center gap-2">
                <Clock strokeWidth={1.75} className="h-4.5 w-4.5 text-brand-500" />
                Status
              </h2>
              <p className="mt-2 text-sm text-ink-700" data-testid="revoked-state">
                {answer.revoked ? `Revoked on ${fmt(answer.revokedAt ?? "")}` : "Not revoked"}
              </p>
              <p className="mt-0.5 text-xs text-ink-400 font-mono">issued {answer.issuedAt}</p>
            </section>
          </>
        )}

        <section className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/40 p-6">
          <h2 className="text-base font-semibold text-ink-800">What this check means</h2>
          <ul className="mt-4 space-y-3 text-sm text-ink-600">
            <li className="flex items-start gap-3">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
              <span>
                <strong className="text-ink-800">On record:</strong> the number was issued by BlockID.au for the startup named
                above on the date shown. Compare both with the PDF cover.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
              <span>
                <strong className="text-ink-800">Unchanged:</strong> the certificate content was hashed at issue. If any figure
                on the PDF differed from what was issued, its printed fingerprint would not match the hash here. Paste the
                full hash from page 3 as <code className="text-xs bg-white px-1 rounded">?hash=</code> to check it directly.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4 text-brand-500 mt-0.5 shrink-0" />
              <span>
                <strong className="text-ink-800">Current:</strong> a startup can revoke a certificate (for example after a new
                score run). A revoked certificate stays on record but is marked here.
              </span>
            </li>
          </ul>
        </section>

        <p className="mt-12 text-center text-[11px] text-ink-300 leading-relaxed max-w-lg mx-auto">
          A BlockID valuation certificate is an indicative Startup Value Index assessment issued by {LEGAL_ENTITY_LINE}. It
          is not an independent valuation report and not financial product advice; BlockID.au does not hold an AFSL.
          Conduct your own due diligence.
        </p>
      </main>
    </div>
  );
}
