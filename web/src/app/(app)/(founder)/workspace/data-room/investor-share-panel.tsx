"use client";

// InvestorSharePanel — the founder-facing half of /api/investor-data-room.
//
// Before this, "Share with Investor" minted an anonymous token, showed the URL
// once, and forgot it. The endpoint has always accepted an investor name,
// email and firm, and has always returned an access log — views, first opened,
// last opened, per link. None of it was on screen, so the single most valuable
// signal this product can give a founder ("Blackbird opened your data room on
// Tuesday") was being written to a table nobody could read.
//
// Three things live here now:
//   1. a "who is this for?" form, so the log has names in it;
//   2. the link list with state, views and access times, revocable per row;
//   3. the outstanding-document list — the same gaps the investor will see.

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Eye,
  Loader2,
  Share2,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import { formatRunDateTime } from "@/lib/analyses/summary";
import { EngagementHeatmap } from "./engagement-heatmap";
import { RoomTrustSettings } from "./room-trust-settings";

export type ShareState = "active" | "revoked" | "expired";

export interface ShareLink {
  id: string;
  url: string;
  investorName: string | null;
  investorEmail: string | null;
  investorFirm: string | null;
  state: ShareState;
  views: number;
  firstAccessed: string | null;
  lastAccessed: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  /** S21-A — NDA state per link (absent on responses from before it shipped). */
  ndaRequired?: boolean;
  ndaSignedAt?: string | null;
  ndaSignedVersion?: number | null;
}

export interface DocumentCounts {
  total: number;
  complete: number;
  pending: number;
  missing: number;
  completeness: number;
}

export interface OutstandingDoc {
  section: string;
  label: string;
  status: "missing" | "partial";
}

export interface InvestorSharePanelProps {
  dataRoomId?: string | null;
  documents?: DocumentCounts | null;
  outstanding?: OutstandingDoc[];
  onToast?: (message: string, kind?: "success" | "error") => void;
  /** S18-B — viewer / editor on a shared project: trust settings read-only. */
  readOnly?: boolean;
}

/** "NDA accepted 12 Sep, v2" / "NDA pending" / "" for the link row. */
export function ndaSummary(link: {
  ndaRequired?: boolean;
  ndaSignedAt?: string | null;
  ndaSignedVersion?: number | null;
}): string {
  if (link.ndaSignedAt) {
    const when = formatRunDateTime(link.ndaSignedAt);
    const v = typeof link.ndaSignedVersion === "number" ? ` (v${link.ndaSignedVersion})` : "";
    return when ? `NDA accepted ${when}${v}` : `NDA accepted${v}`;
  }
  if (link.ndaRequired) return "NDA pending";
  return "";
}

// ── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Who a link was minted for, in one line.
 *
 * Every link created before the mint form existed is anonymous, and there is
 * no honest way to attribute those retroactively — they say so, rather than
 * borrowing a name from a neighbouring row.
 */
export function shareRecipient(link: {
  investorName?: string | null;
  investorFirm?: string | null;
  investorEmail?: string | null;
}): string {
  const name = link.investorName?.trim();
  const firm = link.investorFirm?.trim();
  if (name && firm) return `${name} · ${firm}`;
  if (name) return name;
  if (firm) return firm;
  const email = link.investorEmail?.trim();
  if (email) return email;
  return "Anonymous link";
}

/** Human sentence for the access log. Never claims a view that did not occur. */
export function accessSummary(link: {
  views: number;
  firstAccessed?: string | null;
  lastAccessed?: string | null;
}): string {
  const views = Number(link.views ?? 0);
  if (views < 1) return "Not opened yet";
  const last = formatRunDateTime(link.lastAccessed);
  const first = formatRunDateTime(link.firstAccessed);
  const noun = views === 1 ? "1 view" : `${views} views`;
  if (last) return `${noun} · last opened ${last}`;
  if (first) return `${noun} · first opened ${first}`;
  return noun;
}

export const STATE_LABEL: Record<ShareState, string> = {
  active: "Active",
  revoked: "Revoked",
  expired: "Expired",
};

export const STATE_CLASS: Record<ShareState, string> = {
  active: "border-bull/40 bg-bull/10 text-bull",
  revoked: "border-line bg-surface-sunken text-muted",
  expired: "border-warn/40 bg-warn/10 text-warn",
};

/** The token in a share URL, for the revoke call. Empty when unparseable. */
export function tokenFromUrl(url: string): string {
  const match = /\/s\/dr\/([^/?#]+)/.exec(url ?? "");
  return match ? match[1] : "";
}

const EXPIRY_CHOICES: { value: number | null; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
  { value: null, label: "No expiry" },
];

// ── Component ────────────────────────────────────────────────────────────

export function InvestorSharePanel({
  dataRoomId,
  documents,
  outstanding = [],
  onToast,
  readOnly = false,
}: InvestorSharePanelProps) {
  const [links, setLinks] = React.useState<ShareLink[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [minting, setMinting] = React.useState(false);
  const [revokingToken, setRevokingToken] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  const [investorName, setInvestorName] = React.useState("");
  const [investorEmail, setInvestorEmail] = React.useState("");
  const [investorFirm, setInvestorFirm] = React.useState("");
  const [expiresInDays, setExpiresInDays] = React.useState<number | null>(30);

  const toast = React.useCallback(
    (message: string, kind: "success" | "error" = "success") => {
      onToast?.(message, kind);
    },
    [onToast],
  );

  const loadLinks = React.useCallback(async () => {
    try {
      const res = await fetch("/api/investor-data-room", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setLoadFailed(true);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; links?: ShareLink[] };
      if (!data.ok || !Array.isArray(data.links)) {
        setLoadFailed(true);
        return;
      }
      setLinks(data.links);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void (async () => {
      await loadLinks();
    })();
  }, [loadLinks]);

  React.useEffect(() => {
    if (!copiedId) return;
    const t = setTimeout(() => setCopiedId(null), 2000);
    return () => clearTimeout(t);
  }, [copiedId]);

  async function handleMint(e: React.FormEvent) {
    e.preventDefault();
    if (minting) return;
    setMinting(true);
    try {
      const res = await fetch("/api/investor-data-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          investorName: investorName.trim() || undefined,
          investorEmail: investorEmail.trim() || undefined,
          investorFirm: investorFirm.trim() || undefined,
          expiresInDays,
          dataRoomId: dataRoomId ?? undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; url?: string; error?: string; message?: string }
        | null;
      if (!res.ok || !data?.ok) {
        toast(
          data?.message ?? data?.error ?? "Could not create the link.",
          "error",
        );
        return;
      }
      const who = investorName.trim() || investorFirm.trim();
      toast(
        who
          ? `Link created for ${who} — read-only, and you will see when it is opened.`
          : "Link created — read-only. Add a name next time and the access log will tell you who opened it.",
      );
      setInvestorName("");
      setInvestorEmail("");
      setInvestorFirm("");
      await loadLinks();
    } catch {
      toast("Could not create the link. Please try again.", "error");
    } finally {
      setMinting(false);
    }
  }

  async function handleRevoke(link: ShareLink) {
    const token = tokenFromUrl(link.url);
    if (!token || revokingToken) return;
    setRevokingToken(token);
    try {
      const res = await fetch(
        `/api/investor-data-room?token=${encodeURIComponent(token)}`,
        { method: "DELETE", credentials: "same-origin" },
      );
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !data?.ok) {
        toast(data?.error ?? "Could not revoke the link.", "error");
        return;
      }
      toast("Link revoked — it now 404s for anyone holding it.");
      await loadLinks();
    } catch {
      toast("Could not revoke the link. Please try again.", "error");
    } finally {
      setRevokingToken(null);
    }
  }

  async function handleCopy(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiedId(link.id);
    } catch {
      toast("Copy blocked by the browser — select the link and copy it.", "error");
    }
  }

  return (
    <section
      className="mb-6 rounded-2xl border border-line-subtle bg-surface-raised"
      aria-labelledby="investor-share-heading"
      data-testid="investor-share-panel"
    >
      <div className="border-b border-line-subtle px-5 py-4">
        <h2
          id="investor-share-heading"
          className="flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <Share2 aria-hidden strokeWidth={1.75} className="h-4 w-4" />
          Investor access
        </h2>
        <p className="mt-1 text-xs text-secondary">
          Mint a read-only link per investor. Once they open it you will see it
          here, with the time.
        </p>
      </div>

      {/* ── Who is this for? ─────────────────────────────────────────── */}
      <form onSubmit={handleMint} className="border-b border-line-subtle px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label
              htmlFor="investor-name"
              className="block text-xs font-medium text-muted"
            >
              Investor name
            </label>
            <input
              id="investor-name"
              type="text"
              value={investorName}
              onChange={(e) => setInvestorName(e.target.value)}
              placeholder="Jane Chen"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-primary placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            />
          </div>
          <div>
            <label
              htmlFor="investor-firm"
              className="block text-xs font-medium text-muted"
            >
              Firm
            </label>
            <input
              id="investor-firm"
              type="text"
              value={investorFirm}
              onChange={(e) => setInvestorFirm(e.target.value)}
              placeholder="Blackbird"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-primary placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            />
          </div>
          <div>
            <label
              htmlFor="investor-email"
              className="block text-xs font-medium text-muted"
            >
              Email
            </label>
            <input
              id="investor-email"
              type="email"
              value={investorEmail}
              onChange={(e) => setInvestorEmail(e.target.value)}
              placeholder="jane@blackbird.vc"
              className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-primary placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <label
              htmlFor="investor-expiry"
              className="block text-xs font-medium text-muted"
            >
              Link expires
            </label>
            <select
              id="investor-expiry"
              value={expiresInDays === null ? "none" : String(expiresInDays)}
              onChange={(e) =>
                setExpiresInDays(
                  e.target.value === "none" ? null : Number(e.target.value),
                )
              }
              className="mt-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              {EXPIRY_CHOICES.map((c) => (
                <option
                  key={c.label}
                  value={c.value === null ? "none" : String(c.value)}
                >
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={minting}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 disabled:opacity-60"
            data-testid="investor-share-mint"
          >
            {minting ? (
              <>
                <Loader2
                  aria-hidden
                  strokeWidth={1.75}
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                />
                Creating link…
              </>
            ) : (
              <>
                <Share2 aria-hidden strokeWidth={1.75} className="h-4 w-4" />
                Create investor link
              </>
            )}
          </button>
        </div>
        <p className="mt-2 text-xs text-tertiary">
          Names are optional, but a link with no name gives you an access log
          you cannot read.
        </p>
      </form>

      {/* ── The links ────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        {loading && (
          <p className="flex items-center gap-2 text-sm text-secondary" role="status">
            <Loader2
              aria-hidden
              strokeWidth={1.75}
              className="h-4 w-4 animate-spin motion-reduce:animate-none"
            />
            Loading your investor links…
          </p>
        )}

        {!loading && loadFailed && (
          <p className="text-sm text-secondary">
            We could not load your investor links just now. Reload the page —
            any link you have already sent still works.
          </p>
        )}

        {!loading && !loadFailed && links.length === 0 && (
          <p className="text-sm text-secondary" data-testid="investor-share-empty">
            No investor links yet. Create one above and this becomes your access
            log — who has the room, and when they opened it.
          </p>
        )}

        {!loading && !loadFailed && links.length > 0 && (
          <ul className="space-y-3" data-testid="investor-share-list">
            {links.map((link) => (
              <li
                key={link.id}
                className="rounded-xl border border-line-subtle bg-surface p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-primary">
                      <span className="truncate">{shareRecipient(link)}</span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATE_CLASS[link.state]}`}
                      >
                        {STATE_LABEL[link.state]}
                      </span>
                    </p>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <Eye aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
                      {accessSummary(link)}
                    </p>
                    {ndaSummary(link) && (
                      <p
                        className={`mt-0.5 flex items-center gap-1.5 text-xs ${link.ndaSignedAt ? "text-bull" : "text-warn"}`}
                        data-testid="investor-share-nda"
                      >
                        <ShieldCheck aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
                        {ndaSummary(link)}
                      </p>
                    )}
                    {link.expiresAt && (
                      <p className="mt-0.5 text-xs text-tertiary">
                        Expires {formatRunDateTime(link.expiresAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleCopy(link)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line-subtle px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-line-strong"
                    >
                      {copiedId === link.id ? (
                        <Check aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                      ) : (
                        <Copy aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                      )}
                      {copiedId === link.id ? "Copied" : "Copy"}
                    </button>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg border border-line-subtle px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:border-line-strong"
                    >
                      Preview
                    </a>
                    {link.state === "active" && (
                      <button
                        type="button"
                        onClick={() => void handleRevoke(link)}
                        disabled={revokingToken === tokenFromUrl(link.url)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-bear/40 px-2.5 py-1.5 text-xs font-semibold text-bear transition-colors hover:bg-bear/10 disabled:opacity-60"
                        data-testid="investor-share-revoke"
                      >
                        <Trash2 aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                        {revokingToken === tokenFromUrl(link.url)
                          ? "Revoking…"
                          : "Revoke"}
                      </button>
                    )}
                  </div>
                </div>
                <p className="mt-2 truncate font-mono text-[11px] text-tertiary">
                  {link.url}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── S21-A: NDA + watermark settings, and what each investor read ── */}
      <RoomTrustSettings
        dataRoomId={dataRoomId}
        readOnly={readOnly}
        onToast={onToast}
        linkLabels={Object.fromEntries(links.map((l) => [l.id, shareRecipient(l)]))}
      />
      <EngagementHeatmap dataRoomId={dataRoomId} />

      {/* ── What the investor will find missing ──────────────────────── */}
      {documents && documents.total > 0 && (
        <div
          className="border-t border-line-subtle px-5 py-4"
          data-testid="investor-share-documents"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
            <AlertTriangle aria-hidden strokeWidth={1.75} className="h-4 w-4" />
            What an investor sees as missing
          </h3>
          <p className="mt-1 text-xs text-secondary">
            {documents.complete} of {documents.total} documents are written.{" "}
            {documents.missing} are missing and {documents.pending} still need
            you.
          </p>
          <div
            className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
            role="img"
            aria-label={`Data room ${documents.completeness}% complete`}
          >
            <div
              className="h-full rounded-full bg-action"
              style={{ width: `${Math.max(0, Math.min(100, documents.completeness))}%` }}
            />
          </div>
          {outstanding.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {outstanding.map((doc) => (
                <li
                  key={`${doc.section}-${doc.label}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs"
                >
                  <span
                    className={
                      doc.status === "missing"
                        ? "font-semibold text-bear"
                        : "font-semibold text-warn"
                    }
                  >
                    {doc.status === "missing" ? "Missing" : "Partial"}
                  </span>
                  <span className="text-primary">{doc.label}</span>
                  <span className="text-tertiary">{doc.section}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default InvestorSharePanel;
