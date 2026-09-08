// /s/dr/[token] — the investor-facing data room.
//
// Read-only, no auth: the token in the URL is the credential. A bad, revoked,
// expired or orphaned token all render the same 404, so the page never
// confirms that a token exists to someone who does not hold it.
//
// This replaces the old "share link", which handed the investor
// /api/investor-data-room?token=… — raw JSON, and 500-ing JSON at that.

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, CircleDashed, CircleAlert, FileText, Lock } from "lucide-react";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { isSupabaseConfigured } from "@/lib/supabase";
import {
  loadSharedDataRoom,
  recordShareView,
  stageLabel,
  type SharedRoom,
  type SharedRoomDocument,
} from "./load";
import { DocMarkdown } from "./markdown";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  // Deliberately generic and noindex: the title of a private room must not
  // leak through a link unfurl or a search crawler.
  return {
    title: "Investor Data Room — BlockID",
    description: "A private, read-only data room shared by an Australian founder.",
    robots: { index: false, follow: false },
  };
}

async function logView(room: SharedRoom): Promise<void> {
  const h = await headers();
  const ua = h.get("user-agent");
  // Link unfurlers are not investors — do not tell the founder a bot looked.
  if (ua && /bot|crawler|spider|preview|fetch|curl|httpclient|slack|discord/i.test(ua)) {
    return;
  }
  await recordShareView({
    room,
    ipHash: hashIp(clientIpFromHeaders(h)),
    userAgent: ua,
    referer: h.get("referer"),
  });
}

export default async function DataRoomSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!isSupabaseConfigured()) notFound();

  const room = await loadSharedDataRoom(token);
  if (!room) notFound();

  // Never block the render on telemetry.
  void logView(room);

  const title = room.startupName?.trim() || room.name;
  const gaps = room.folders
    .flatMap((f) => f.documents)
    .filter((d) => d.status !== "complete" && d.status !== "not_applicable");

  return (
    <main id="main" className="min-h-screen bg-surface">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
        <header>
          <p className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted">
            <Lock aria-hidden="true" strokeWidth={1.75} className="h-3.5 w-3.5" />
            Private data room
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-primary sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-secondary">
            {stageLabel(room.stage)} stage
            {room.investorLabel ? ` · prepared for ${room.investorLabel}` : ""}
            {room.lastGeneratedAt
              ? ` · assembled ${room.lastGeneratedAt.slice(0, 10)}`
              : ""}
            .
          </p>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Shared by the founder through BlockID. Read-only. Every figure is
            generated from the founder&rsquo;s own workspace data; documents
            BlockID cannot produce are listed as missing rather than shown as
            complete.
          </p>
        </header>

        {/* ── Headline figures ─────────────────────────────────────────── */}
        <section aria-labelledby="headline-h" className="mt-8">
          <h2 id="headline-h" className="sr-only">
            Headline figures
          </h2>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Assembled" value={`${room.completeness}%`} />
            <Stat
              label="Documents"
              value={`${room.counts.complete}/${room.counts.total}`}
            />
            {room.headlines.slice(0, 2).map((h) => (
              <Stat key={h.label} label={h.label} value={h.value} />
            ))}
          </dl>
          {room.headlines.length > 2 && (
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {room.headlines.slice(2).map((h) => (
                <Stat key={h.label} label={h.label} value={h.value} />
              ))}
            </dl>
          )}
        </section>

        {/* ── What is missing, up front ────────────────────────────────── */}
        <section
          aria-labelledby="gaps-h"
          className="mt-8 rounded-xl border border-line-subtle bg-surface-sunken p-5"
        >
          <h2
            id="gaps-h"
            className="inline-flex items-center gap-2 text-base font-semibold text-primary"
          >
            <CircleAlert aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 text-warn" />
            {gaps.length === 0
              ? "Nothing outstanding"
              : `${gaps.length} item${gaps.length === 1 ? "" : "s"} still outstanding`}
          </h2>
          {gaps.length === 0 ? (
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              Every item in this room has content behind it.
            </p>
          ) : (
            <>
              <p className="mt-2 text-sm leading-relaxed text-secondary">
                These are not in the room yet. Shown so you can ask for them
                directly rather than discovering an empty folder in diligence.
              </p>
              <ul className="mt-4 space-y-2">
                {gaps.map((d) => (
                  <li key={d.id} className="text-sm leading-relaxed">
                    <span className="font-medium text-primary">{d.documentName}</span>
                    <span className="text-tertiary"> · {d.folder}</span>
                    {d.notes && (
                      <span className="block text-muted">{d.notes}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* ── Sections ─────────────────────────────────────────────────── */}
        {room.folders.length === 0 ? (
          <p className="mt-8 rounded-xl border border-line-subtle p-5 text-sm text-secondary">
            The founder has not assembled any documents in this room yet.
          </p>
        ) : (
          <div className="mt-10 space-y-8">
            {room.folders.map((folder) => (
              <section key={folder.folder} aria-labelledby={`f-${slug(folder.folder)}`}>
                <h2
                  id={`f-${slug(folder.folder)}`}
                  className="border-b border-line-subtle pb-2 text-base font-semibold tracking-tight text-primary"
                >
                  {folder.folder}
                </h2>
                <ul className="mt-4 space-y-4">
                  {folder.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="rounded-xl border border-line-subtle bg-surface p-4 sm:p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                          <FileText
                            aria-hidden="true"
                            strokeWidth={1.75}
                            className="h-4 w-4 text-tertiary"
                          />
                          {doc.documentName}
                        </h3>
                        <StatusBadge status={doc.status} />
                      </div>

                      {doc.content ? (
                        <div className="mt-4 border-t border-line-subtle pt-4">
                          <DocMarkdown source={doc.content} />
                        </div>
                      ) : doc.hasFile ? (
                        <p className="mt-2 text-sm text-secondary">
                          A file is attached to this item. Ask the founder for
                          access if you need the original.
                        </p>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                          {doc.notes ??
                            "Not supplied yet. Ask the founder to add this before diligence."}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <footer className="mt-12 border-t border-line-subtle pt-6">
          <p className="text-xs leading-relaxed text-tertiary">
            Assembled by{" "}
            <Link href="/" className="text-action underline underline-offset-2">
              BlockID
            </Link>
            . Indicative only — not a valuation opinion and not financial
            product advice. The founder can revoke this link at any time
            {room.expiresAt ? `; it expires ${room.expiresAt.slice(0, 10)}` : ""}.
          </p>
        </footer>
      </div>
    </main>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line-subtle bg-surface p-4">
      <dt className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-primary">
        {value}
      </dd>
    </div>
  );
}

function StatusBadge({ status }: { status: SharedRoomDocument["status"] }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-medium text-bull">
        <CheckCircle2 aria-hidden="true" strokeWidth={2} className="h-3.5 w-3.5" />
        In the room
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-medium text-warn">
        <CircleDashed aria-hidden="true" strokeWidth={2} className="h-3.5 w-3.5" />
        Partial
      </span>
    );
  }
  if (status === "not_applicable") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-line-subtle px-2.5 py-0.5 text-xs font-medium text-tertiary">
        Not applicable
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-current/30 px-2.5 py-0.5 text-xs font-medium text-bear">
      <CircleAlert aria-hidden="true" strokeWidth={2} className="h-3.5 w-3.5" />
      Missing
    </span>
  );
}
