"use client";

// Review workspace for /admin/verified-reviews/[orderId] (G35 Pricing v5 P4).
//
//   * per item Accept / Reject (+ note; a reject needs one) →
//     PATCH /api/admin/verified-reviews/[orderId]/claims
//   * internal review notes → PATCH /api/admin/verified-reviews/[orderId]
//   * Mark reviewed (inline confirm — it e-mails the buyer) →
//     POST /api/admin/verified-reviews/[orderId]/mark-reviewed
// Everything is read-only once the order left IN_REVIEW (refunded /
// delivered). Server responses are the source of truth for each row.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { ReviewItem, ReviewItemKind, VerifiedReviewDetail } from "@/lib/verified-review/detail";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import { SlaPill } from "../sla-pill";

interface Props {
  initial: VerifiedReviewDetail;
}

type Filter = "all" | "undecided" | "accept" | "reject";

interface MarkResult {
  ok: boolean;
  alreadyReviewed?: boolean;
  badgeLabel?: string | null;
  verificationLevel?: number | null;
  previousLevel?: number | null;
  evidenceConfidence?: number | null;
  emailSent?: boolean;
  investorPackBytes?: number;
  slaMet?: boolean | null;
  warnings?: string[];
  reason?: string;
}

const KIND_TITLE: Record<ReviewItemKind, string> = {
  hub: "Evidence Hub uploads",
  report: "Evidence the report cites",
  claim: "Claims",
};
const KIND_HINT: Record<ReviewItemKind, string> = {
  hub: "Accepting approves the row in the Evidence Hub (third-party verified); rejecting caps it back to what the founder can file.",
  report: "Connector pulls, public sources and uploads the report used. Your decision is recorded against this report.",
  claim: "Statements the founder made. Recorded with the review; they do not change evidence levels.",
};

const REASON_COPY: Record<string, string> = {
  refunded: "This order was refunded — the review is closed.",
  not_in_review: "This order is no longer in review.",
  note_required: "A rejection needs a note.",
  note_too_long: "That note is too long.",
  unknown_claim: "That item is no longer part of this report — reload the page.",
  evidence_review_failed: "The Evidence Hub row could not be updated — try again.",
  migration_pending: "Migration 0474 is not applied yet.",
  not_verified: "This order is not a Verified report.",
  no_report: "This order has no generated report yet.",
  forbidden: "Admins only.",
};

function reason(r: string | undefined, status?: number): string {
  return (r && REASON_COPY[r]) ?? `Request failed${r ? ` (${r})` : status ? ` (${status})` : ""}.`;
}

function dimLabel(dim: string): string {
  return DIMENSION_OWNERS[dim as DimKey]?.title ?? dim.toUpperCase();
}

const DATE_FMT = new Intl.DateTimeFormat("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

export function VerifiedReviewClient({ initial }: Props) {
  const [items, setItems] = useState<ReviewItem[]>(initial.items);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => Object.fromEntries(initial.items.map((i) => [i.ref, i.note ?? ""])));
  const [notes, setNotes] = useState<string>(initial.review?.notes ?? "");
  const [savedNotes, setSavedNotes] = useState<string>(initial.review?.notes ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<MarkResult | null>(null);
  const [canDecide, setCanDecide] = useState(initial.canDecide);
  const orderId = initial.order.id;

  const counts = useMemo(() => {
    const accepted = items.filter((i) => i.decision === "accept").length;
    const rejected = items.filter((i) => i.decision === "reject").length;
    return { all: items.length, accept: accepted, reject: rejected, undecided: items.length - accepted - rejected };
  }, [items]);

  const visible = useMemo(() => items.filter((i) => (filter === "all" ? true : filter === "undecided" ? !i.decision : i.decision === filter)), [items, filter]);
  const groups = (["hub", "report", "claim"] as const).map((kind) => ({ kind, rows: visible.filter((i) => i.kind === kind) })).filter((g) => g.rows.length > 0);

  const decide = async (item: ReviewItem, decision: "accept" | "reject") => {
    const note = (drafts[item.ref] ?? "").trim();
    if (decision === "reject" && !note) {
      setMessage({ tone: "error", text: "A rejection needs a note — say what did not check out." });
      return;
    }
    setBusy(item.ref);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/verified-reviews/${orderId}/claims`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: item.ref, decision, note: note || undefined }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; item?: ReviewItem };
      if (!res.ok || !body.ok || !body.item) {
        if (body.reason === "refunded" || body.reason === "not_in_review") setCanDecide(false);
        setMessage({ tone: "error", text: reason(body.reason, res.status) });
        return;
      }
      const next = body.item;
      setItems((list) => list.map((i) => (i.ref === next.ref ? next : i)));
      setMessage({ tone: "ok", text: `${decision === "accept" ? "Accepted" : "Rejected"}: ${next.title}` });
    } catch {
      setMessage({ tone: "error", text: "Network error — nothing was saved." });
    } finally {
      setBusy(null);
    }
  };

  const saveNotes = async () => {
    setBusy("notes");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/verified-reviews/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; reason?: string; notes?: string | null };
      if (!res.ok || !body.ok) {
        setMessage({ tone: "error", text: reason(body.reason, res.status) });
        return;
      }
      setSavedNotes(body.notes ?? "");
      setMessage({ tone: "ok", text: "Review notes saved." });
    } catch {
      setMessage({ tone: "error", text: "Network error — notes not saved." });
    } finally {
      setBusy(null);
    }
  };

  const markReviewed = async () => {
    setBusy("mark");
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/verified-reviews/${orderId}/mark-reviewed`, { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as MarkResult;
      if (!res.ok || !body.ok) {
        if (body.reason === "refunded" || body.reason === "not_in_review") setCanDecide(false);
        setMessage({ tone: "error", text: reason(body.reason, res.status) });
        return;
      }
      setResult(body);
      setCanDecide(false);
      setConfirming(false);
    } catch {
      setMessage({ tone: "error", text: "Network error — the report was not marked reviewed. Try again (it is safe to repeat)." });
    } finally {
      setBusy(null);
    }
  };

  const o = initial.order;
  const r = initial.report;
  const notesDirty = notes !== savedNotes;

  return (
    <div className="space-y-6">
      {/* ── Summary ─────────────────────────────────────────────── */}
      <section aria-labelledby="review-heading" className="rounded-xl border border-surface-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Verified review</p>
            <h1 id="review-heading" className="text-xl font-semibold text-ink-900 sm:text-2xl">
              {initial.startup.name ?? "Unnamed startup"}
            </h1>
            <p className="mt-1 break-all text-sm text-ink-600">
              Buyer: {initial.buyer.name ?? initial.buyer.email ?? "—"}
              {initial.buyer.name && initial.buyer.email ? ` · ${initial.buyer.email}` : ""}
            </p>
            <p className="text-xs text-ink-500">
              Order {o.id} · <span className="capitalize">{o.tier}</span> · status <code className="rounded bg-surface-100 px-1">{o.status}</code> · paid {when(o.paidAt)}
            </p>
          </div>
          <div className="text-right">
            <SlaPill state={initial.sla.state} />
            <p className="mt-1 text-sm text-ink-700">{initial.sla.line}</p>
            {initial.sla.dueLabel && <p className="text-xs text-ink-500">Due {initial.sla.dueLabel}</p>}
          </div>
        </div>

        {o.status === "REFUNDED" && (
          <p role="status" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            This order was refunded. The review is closed and the report carries no BlockID Reviewed badge.
          </p>
        )}
        {(o.status === "READY" || o.status === "SHARED") && o.reviewedAt && !result && (
          <p role="status" className="mt-4 rounded-lg border border-brand-navy/30 bg-info-soft px-3 py-2 text-sm text-brand-navy">
            Reviewed {when(o.reviewedAt)} — delivered to the buyer.
          </p>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">SVI</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink-900">{r?.sviTotal != null ? Math.round(r.sviTotal) : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Band</dt>
            <dd className="text-lg font-semibold capitalize text-ink-900">{r?.band ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Verification level</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink-900">{initial.startup.verificationLevel != null ? `L${initial.startup.verificationLevel}` : "—"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-500">Grounded share</dt>
            <dd className="text-lg font-semibold tabular-nums text-ink-900">{r?.groundedShare != null ? `${Math.round(r.groundedShare * 100)}%` : "—"}</dd>
          </div>
        </dl>
        {r && r.dims.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Dimension scores">
            {r.dims.map((d) => (
              <li key={d.dim} className="rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-xs text-ink-700">
                {d.title}: <span className="font-semibold tabular-nums">{d.band === "pending" || d.score == null ? "pending" : Math.round(d.score)}</span>
              </li>
            ))}
          </ul>
        )}
        {!r && <p className="mt-3 text-sm text-ink-600">The stored report document could not be read — the evidence list below comes from the Evidence Hub and claims only.</p>}
      </section>

      {message && (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${message.tone === "error" ? "border-red-200 bg-red-50 text-red-900" : "border-surface-200 bg-white text-ink-700"}`}>
          {message.text}
        </p>
      )}

      {/* ── Items ───────────────────────────────────────────────── */}
      <section aria-labelledby="items-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="items-heading" className="text-base font-semibold text-ink-900">
            Claims &amp; evidence ({counts.all})
          </h2>
          <div role="group" aria-label="Filter items" className="flex flex-wrap gap-2">
            {(
              [
                ["all", `All ${counts.all}`],
                ["undecided", `Undecided ${counts.undecided}`],
                ["accept", `Accepted ${counts.accept}`],
                ["reject", `Rejected ${counts.reject}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
                className={`min-h-[36px] rounded-full border px-3 text-xs font-medium ${filter === key ? "border-action bg-action text-on-action" : "border-surface-300 bg-white text-ink-700 hover:bg-surface-100"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500">
            No evidence or claims found for this startup. You can still add review notes and mark the report reviewed.
          </p>
        )}

        {groups.map((g) => (
          <div key={g.kind} className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">{KIND_TITLE[g.kind]}</h3>
              <p className="text-xs text-ink-500">{KIND_HINT[g.kind]}</p>
            </div>
            <ul className="space-y-3">
              {g.rows.map((item) => (
                <li key={item.ref} data-review-ref={item.ref} data-decision={item.decision ?? "none"} className="rounded-xl border border-surface-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900">{item.title}</p>
                      <p className="mt-0.5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-600">
                        {item.dims.length > 0 && <span>{item.dims.map(dimLabel).join(" · ")}</span>}
                        {item.level && (
                          <span>
                            level <code className="rounded bg-surface-100 px-1">{item.level}</code>
                          </span>
                        )}
                        {item.status && (
                          <span>
                            status <code className="rounded bg-surface-100 px-1">{item.status}</code>
                          </span>
                        )}
                        {item.source && item.kind === "report" && <span>source {item.source}</span>}
                      </p>
                      {item.detail && <p className="mt-1 break-words text-xs text-ink-700">{item.detail}</p>}
                      {item.href && (
                        <a href={item.href} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block break-all text-xs text-brand-navy underline decoration-dotted">
                          {item.href}
                        </a>
                      )}
                      {item.decision && (
                        <p className="mt-2 text-xs font-medium text-ink-700">
                          {item.decision === "accept" ? "Accepted" : "Rejected"} {when(item.decidedAt)}
                          {item.note ? ` — ${item.note}` : ""}
                        </p>
                      )}
                    </div>
                    {canDecide && (
                      <div className="flex w-full flex-col gap-2 sm:w-80">
                        <label className="text-xs text-ink-600">
                          Note <span className="text-ink-500">(required to reject)</span>
                          <textarea
                            value={drafts[item.ref] ?? ""}
                            onChange={(e) => setDrafts((d) => ({ ...d, [item.ref]: e.target.value }))}
                            rows={2}
                            maxLength={1000}
                            className="mt-1 w-full rounded-lg border border-surface-300 px-2 py-1 text-sm text-ink-900"
                            placeholder="What you checked (ABR lookup, Stripe dashboard, signed contract…)"
                          />
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => decide(item, "accept")}
                            disabled={busy !== null}
                            aria-pressed={item.decision === "accept"}
                            className="min-h-[44px] flex-1 rounded-lg bg-action px-3 text-sm font-medium text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy === item.ref ? "Saving…" : "Accept"}
                          </button>
                          <button
                            type="button"
                            onClick={() => decide(item, "reject")}
                            disabled={busy !== null}
                            aria-pressed={item.decision === "reject"}
                            className="min-h-[44px] flex-1 rounded-lg border border-red-300 bg-white px-3 text-sm font-medium text-red-800 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* ── Notes ───────────────────────────────────────────────── */}
      <section aria-labelledby="notes-heading" className="rounded-xl border border-surface-200 bg-white p-4 sm:p-5">
        <h2 id="notes-heading" className="text-base font-semibold text-ink-900">
          Review notes <span className="text-xs font-normal text-ink-500">(internal — never shown to the buyer)</span>
        </h2>
        <label htmlFor="review-notes" className="sr-only">
          Review notes
        </label>
        <textarea
          id="review-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={5000}
          readOnly={!canDecide}
          className="mt-2 w-full rounded-lg border border-surface-300 px-3 py-2 text-sm text-ink-900 read-only:bg-surface-50"
          placeholder="What you checked, what you could not, follow-ups for the founder…"
        />
        {canDecide && (
          <button
            type="button"
            onClick={saveNotes}
            disabled={busy !== null || !notesDirty}
            className="mt-2 min-h-[44px] rounded-lg border border-brand-navy/40 px-4 text-sm font-medium text-brand-navy hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "notes" ? "Saving…" : notesDirty ? "Save notes" : "Saved"}
          </button>
        )}
      </section>

      {/* ── Mark reviewed ───────────────────────────────────────── */}
      {result ? (
        <section role="status" aria-labelledby="done-heading" className="rounded-xl border border-brand-navy/30 bg-info-soft p-4 sm:p-5">
          <h2 id="done-heading" className="text-base font-semibold text-brand-navy">
            {result.alreadyReviewed ? "Already reviewed — nothing changed" : "Marked reviewed"}
          </h2>
          {!result.alreadyReviewed && (
            <ul className="mt-2 space-y-1 text-sm text-ink-800">
              {result.badgeLabel && <li>Badge: {result.badgeLabel}</li>}
              <li>
                Verification level: L{result.previousLevel ?? "?"} → L{result.verificationLevel ?? "?"} · evidence confidence {result.evidenceConfidence ?? "—"}%
              </li>
              <li>Investor Pack: {result.investorPackBytes ? `${Math.round(result.investorPackBytes / 1024)} KB, attached` : "not generated"}</li>
              <li>Buyer e-mail: {result.emailSent ? "sent" : "not sent"}</li>
              <li>SLA: {result.slaMet === null || result.slaMet === undefined ? "no deadline recorded" : result.slaMet ? "met" : "missed"}</li>
              {result.warnings && result.warnings.length > 0 && <li className="text-amber-900">Warnings: {result.warnings.join(", ")}</li>}
            </ul>
          )}
          {!result.alreadyReviewed && result.warnings && result.warnings.some((w) => w.startsWith("badge:")) && (
            <button
              type="button"
              onClick={markReviewed}
              disabled={busy !== null}
              className="mt-3 mr-3 min-h-[44px] rounded-lg border border-brand-navy/40 bg-white px-4 text-sm font-medium text-brand-navy hover:bg-surface-100 disabled:opacity-50"
            >
              {busy === "mark" ? "Retrying…" : "Retry the failed steps"}
            </button>
          )}
          <Link href="/admin/verified-reviews" className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-brand-navy underline">
            Back to the queue
          </Link>
        </section>
      ) : canDecide ? (
        <section aria-labelledby="mark-heading" className="rounded-xl border border-surface-200 bg-white p-4 sm:p-5">
          <h2 id="mark-heading" className="text-base font-semibold text-ink-900">
            Finish the review
          </h2>
          <p className="mt-1 text-sm text-ink-600">
            {counts.accept} accepted · {counts.reject} rejected · {counts.undecided} undecided.
            {counts.undecided > 0 && " Undecided items keep their current evidence level."}
          </p>
          {!confirming ? (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={busy !== null}
              className="mt-3 min-h-[44px] rounded-lg bg-action px-5 text-sm font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark reviewed…
            </button>
          ) : (
            <div className="mt-3 rounded-lg border border-brand-navy/30 bg-info-soft p-3">
              <p className="text-sm text-ink-800">
                This recomputes the verification level and evidence confidence, adds the &ldquo;BlockID Reviewed&rdquo; badge, generates the Investor Pack and e-mails the
                buyer. It cannot be undone from here.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={markReviewed}
                  disabled={busy !== null}
                  className="min-h-[44px] rounded-lg bg-action px-5 text-sm font-semibold text-on-action hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "mark" ? "Marking reviewed…" : "Confirm — mark reviewed"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={busy === "mark"}
                  className="min-h-[44px] rounded-lg border border-surface-300 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-surface-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
