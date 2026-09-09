"use client";

// PublishPanel — the founder's control over whether one analysis is public.
//
// Consent-first, and the sequencing is the whole point:
//
//   closed → form → PREVIEW → confirm → published
//
// The preview step renders the real <PublicProfileBody> from the real
// PublicProfile the server will build. It is not a description of the page
// and it is not a summary of the page; it is the page. A founder cannot reach
// the publish button without having seen it.
//
// Default is off. Nothing here fires on mount, on blur, or as a side effect of
// saving anything else — the only way public_visible becomes true is a click
// on a button that says "Publish", on a screen that is showing the finished
// page, with a checkbox ticked next to a sentence about search engines.
//
// Unpublishing is one click behind one confirm, and it takes effect on the
// next request: the page stops resolving and drops out of the sitemap.

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
} from "lucide-react";

import type { CompactSvi } from "@/lib/analyses/payload";
import { SECTOR_LABELS } from "@/lib/svi-analysis";
import {
  MAX_ONE_LINER_CHARS,
  MIN_ONE_LINER_CHARS,
  PUBLISH_SECTORS,
  checkAnalysisDepth,
  normalisePublishFields,
} from "@/lib/publish/eligibility";
import { buildPublicProfile } from "@/lib/publish/profile";
import { PublicProfileBody } from "./public-profile-body";

type Step = "closed" | "form" | "preview" | "published";

export interface PublishPanelProps {
  analysisId: string;
  /** The compact score summary. Null when the run produced no score. */
  svi?: CompactSvi | null;
  /** When the run was analysed — shown on the profile. */
  analysedAt: string;
  /** False for an anonymous run: publishing needs a real account. */
  owned: boolean;
}

interface FormState {
  companyName: string;
  oneLiner: string;
  sector: string;
  websiteUrl: string;
}

interface ServerState {
  published: boolean;
  slug: string | null;
  url: string | null;
  fields: {
    companyName: string;
    oneLiner: string;
    sector: string;
    websiteUrl: string | null;
  } | null;
  suggestedSector: string | null;
}

const EMPTY_FORM: FormState = {
  companyName: "",
  oneLiner: "",
  sector: "",
  websiteUrl: "",
};

function Shell({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "live";
}) {
  return (
    <section
      aria-labelledby="publish-panel-heading"
      data-testid="publish-panel"
      className={`rounded-2xl border p-5 sm:p-6 ${
        tone === "live"
          ? "border-line-strong bg-surface-sunken"
          : "border-line-subtle bg-surface-raised"
      }`}
    >
      {children}
    </section>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      id="publish-panel-heading"
      className="font-display text-lg font-semibold text-strong"
    >
      {children}
    </h2>
  );
}

function Reasons({ reasons }: { reasons: string[] }) {
  if (reasons.length === 0) return null;
  return (
    <ul
      role="alert"
      data-testid="publish-reasons"
      className="mt-4 space-y-2 rounded-xl border border-line bg-surface-sunken p-4"
    >
      {reasons.map((r) => (
        <li key={r} className="flex gap-2 text-sm leading-relaxed text-primary">
          <AlertCircle
            aria-hidden
            strokeWidth={1.75}
            className="mt-0.5 h-4 w-4 shrink-0 text-warn"
          />
          <span>{r}</span>
        </li>
      ))}
    </ul>
  );
}

export function PublishPanel({
  analysisId,
  svi,
  analysedAt,
  owned,
}: PublishPanelProps) {
  const [step, setStep] = React.useState<Step>("closed");
  const [server, setServer] = React.useState<ServerState | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [reasons, setReasons] = React.useState<string[]>([]);
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [confirmingUnpublish, setConfirmingUnpublish] = React.useState(false);

  const depth = React.useMemo(() => checkAnalysisDepth(svi), [svi]);

  React.useEffect(() => {
    if (!owned) {
      setLoaded(true);
      return;
    }
    let live = true;
    void (async () => {
      try {
        const res = await fetch(
          `/api/analyses/${encodeURIComponent(analysisId)}/publish`,
          { credentials: "same-origin" },
        );
        if (!live) return;
        const body = res.ok
          ? ((await res.json().catch(() => null)) as {
              ok?: boolean;
              state?: ServerState;
            } | null)
          : null;
        if (!live) return;
        if (body?.ok && body.state) {
          setServer(body.state);
          if (body.state.fields) {
            setForm({
              companyName: body.state.fields.companyName,
              oneLiner: body.state.fields.oneLiner,
              sector: body.state.fields.sector,
              websiteUrl: body.state.fields.websiteUrl ?? "",
            });
          } else if (body.state.suggestedSector) {
            setForm((f) => ({ ...f, sector: body.state!.suggestedSector! }));
          }
          if (body.state.published) setStep("published");
        }
      } catch {
        // Leave the panel in its closed state — a founder can retry.
      } finally {
        if (live) setLoaded(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [analysisId, owned]);

  const previewProfile = React.useMemo(() => {
    if (!svi) return null;
    const normalised = normalisePublishFields(form);
    if (!normalised.ok) return null;
    return buildPublicProfile({
      slug: server?.slug ?? "your-company",
      companyName: normalised.fields.companyName,
      oneLiner: normalised.fields.oneLiner,
      sector: normalised.fields.sector,
      websiteUrl: normalised.fields.websiteUrl,
      svi,
      analysedAt,
    });
  }, [form, svi, analysedAt, server?.slug]);

  // ── Anonymous run ──────────────────────────────────────────────────────
  if (!owned) {
    return (
      <Shell>
        <Heading>Make this profile public</Heading>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          Publishing puts a company profile on the open web under your name, so
          it needs an account rather than this browser session. Create one — it
          is free, and it keeps this analysis.
        </p>
        <Link
          href="/signup"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Create a free account
        </Link>
      </Shell>
    );
  }

  if (!loaded) {
    return (
      <Shell>
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-secondary"
        >
          <Loader2
            aria-hidden
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
          />
          Checking whether this profile is public…
        </p>
      </Shell>
    );
  }

  // ── Too thin to publish ────────────────────────────────────────────────
  if (!depth.ok) {
    return (
      <Shell>
        <Heading>Not ready to publish</Heading>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          A public profile has to be worth landing on. This run does not carry
          enough yet, and a directory of thin pages would hurt every founder
          already in it.
        </p>
        <Reasons reasons={depth.reasons} />
        <Link
          href="/analyze"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          Run a stronger analysis
        </Link>
      </Shell>
    );
  }

  // ── Live ───────────────────────────────────────────────────────────────
  if (step === "published" && server?.url) {
    return (
      <Shell tone="live">
        <div className="flex items-start gap-3">
          <Globe
            aria-hidden
            strokeWidth={1.75}
            className="mt-1 h-5 w-5 shrink-0 text-bull"
          />
          <div className="min-w-0 flex-1">
            <Heading>This profile is public</Heading>
            <p className="mt-2 text-sm text-secondary">
              Anyone with the link can read it, and search engines may index it.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={server.url}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="publish-live-url"
                className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                <span className="truncate">
                  {server.url.replace(/^https?:\/\//, "")}
                </span>
                <ExternalLink aria-hidden strokeWidth={2} className="h-3.5 w-3.5 shrink-0" />
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(server.url ?? "");
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                {copied ? (
                  <Check aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                ) : (
                  <Copy aria-hidden strokeWidth={2} className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>

            <Reasons reasons={reasons} />

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line-subtle pt-4">
              <button
                type="button"
                onClick={() => {
                  setReasons([]);
                  setConsent(false);
                  setStep("form");
                }}
                className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              >
                Edit the details
              </button>
              {confirmingUnpublish ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-primary">
                    Take it off the web?
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    data-testid="publish-unpublish-confirm"
                    onClick={async () => {
                      setBusy(true);
                      setReasons([]);
                      try {
                        const res = await fetch(
                          `/api/analyses/${encodeURIComponent(analysisId)}/publish`,
                          { method: "DELETE", credentials: "same-origin" },
                        );
                        if (res.ok) {
                          setServer((s) =>
                            s ? { ...s, published: false, url: null } : s,
                          );
                          setStep("closed");
                          setConfirmingUnpublish(false);
                        } else {
                          setReasons(["Could not unpublish. Try again."]);
                        }
                      } catch {
                        setReasons(["Could not unpublish. Try again."]);
                      } finally {
                        setBusy(false);
                      }
                    }}
                    className="rounded-lg bg-action px-3 py-2 text-xs font-semibold text-on-action transition-opacity hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    {busy ? "Removing…" : "Yes, unpublish"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingUnpublish(false)}
                    className="rounded-lg px-2 py-2 text-xs font-semibold text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                  >
                    Keep it public
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="publish-unpublish"
                  onClick={() => setConfirmingUnpublish(true)}
                  className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
                >
                  Unpublish
                </button>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-secondary">
              Unpublishing takes effect straight away: the page stops loading
              and drops out of our sitemap. Search engines take a few days to
              catch up on their side.
            </p>
          </div>
        </div>
      </Shell>
    );
  }

  // ── Preview + confirm ──────────────────────────────────────────────────
  if (step === "preview" && previewProfile) {
    return (
      <Shell>
        <Heading>This is the page</Heading>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          Everything inside the frame becomes public at{" "}
          <span className="font-mono text-xs text-primary">
            blockid.au/listings/{server?.slug ?? "…"}
          </span>
          . Your email address, the file you uploaded, the link you pasted and
          the text you typed are not on it and never will be.
        </p>

        <div
          data-testid="publish-preview"
          className="mt-4 overflow-hidden rounded-2xl border-2 border-line-strong bg-surface"
        >
          <p className="border-b border-line-subtle bg-surface-sunken px-4 py-2 text-xs font-semibold uppercase tracking-wider text-tertiary">
            Public preview
          </p>
          <PublicProfileBody profile={previewProfile} preview />
        </div>

        <Reasons reasons={reasons} />

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-sunken p-4">
          <input
            type="checkbox"
            checked={consent}
            data-testid="publish-consent"
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-current text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          />
          <span className="text-sm leading-relaxed text-primary">
            I want this profile published on the open web. I understand search
            engines may index it, and that I can unpublish it at any time.
          </span>
        </label>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setReasons([]);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line px-4 py-2.5 text-sm font-semibold text-primary hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <ArrowLeft aria-hidden strokeWidth={2} className="h-4 w-4" />
            Back to edit
          </button>
          <button
            type="button"
            disabled={!consent || busy}
            data-testid="publish-confirm"
            onClick={async () => {
              setBusy(true);
              setReasons([]);
              try {
                const res = await fetch(
                  `/api/analyses/${encodeURIComponent(analysisId)}/publish`,
                  {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ ...form, confirm: true }),
                  },
                );
                const body = (await res.json().catch(() => null)) as {
                  ok?: boolean;
                  slug?: string;
                  url?: string;
                  reasons?: string[];
                } | null;
                if (res.ok && body?.ok && body.url) {
                  setServer((s) => ({
                    published: true,
                    slug: body.slug ?? null,
                    url: body.url ?? null,
                    fields: {
                      companyName: form.companyName,
                      oneLiner: form.oneLiner,
                      sector: form.sector,
                      websiteUrl: form.websiteUrl || null,
                    },
                    suggestedSector: s?.suggestedSector ?? null,
                  }));
                  setStep("published");
                } else {
                  setReasons(body?.reasons ?? ["Could not publish. Try again."]);
                }
              } catch {
                setReasons(["Could not publish. Try again."]);
              } finally {
                setBusy(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            {busy ? (
              <Loader2
                aria-hidden
                className="h-4 w-4 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <Globe aria-hidden strokeWidth={2} className="h-4 w-4" />
            )}
            {busy ? "Publishing…" : "Publish this profile"}
          </button>
        </div>
      </Shell>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────
  if (step === "form") {
    const oneLinerLen = form.oneLiner.trim().replace(/\s+/g, " ").length;
    return (
      <Shell>
        <Heading>What goes on the public page</Heading>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          These are the only words of yours that become public. Your score,
          valuation range and next steps come from this analysis; nothing is
          taken from the file, link or text you gave us.
        </p>

        <div className="mt-5 grid gap-4">
          <div>
            <label
              htmlFor="publish-company-name"
              className="block text-sm font-medium text-primary"
            >
              Company name
            </label>
            <input
              id="publish-company-name"
              type="text"
              value={form.companyName}
              maxLength={80}
              onChange={(e) =>
                setForm((f) => ({ ...f, companyName: e.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              placeholder="Corella Health"
            />
          </div>

          <div>
            <label
              htmlFor="publish-one-liner"
              className="block text-sm font-medium text-primary"
            >
              What the company does
            </label>
            <textarea
              id="publish-one-liner"
              rows={3}
              value={form.oneLiner}
              maxLength={MAX_ONE_LINER_CHARS}
              onChange={(e) =>
                setForm((f) => ({ ...f, oneLiner: e.target.value }))
              }
              aria-describedby="publish-one-liner-help"
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm leading-relaxed text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              placeholder="A GP-first triage tool that cuts avoidable emergency-department referrals for regional clinics."
            />
            <p
              id="publish-one-liner-help"
              className="mt-1.5 text-xs text-secondary"
            >
              <span className="font-mono tabular-nums">{oneLinerLen}</span> /{" "}
              {MIN_ONE_LINER_CHARS} characters minimum. Write it in your own
              words — it is what makes your page worth reading rather than one
              more template.
            </p>
          </div>

          <div>
            <label
              htmlFor="publish-sector"
              className="block text-sm font-medium text-primary"
            >
              Sector
            </label>
            <select
              id="publish-sector"
              value={form.sector}
              onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              <option value="">Choose a sector…</option>
              {PUBLISH_SECTORS.map((key) => (
                <option key={key} value={key}>
                  {SECTOR_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="publish-website"
              className="block text-sm font-medium text-primary"
            >
              Website{" "}
              <span className="font-normal text-secondary">(optional)</span>
            </label>
            <input
              id="publish-website"
              type="url"
              inputMode="url"
              value={form.websiteUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, websiteUrl: e.target.value }))
              }
              className="mt-1.5 w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
              placeholder="https://example.com.au"
            />
          </div>
        </div>

        <Reasons reasons={reasons} />

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            data-testid="publish-preview-button"
            onClick={() => {
              const normalised = normalisePublishFields(form);
              if (!normalised.ok) {
                setReasons(normalised.reasons);
                return;
              }
              setReasons([]);
              setConsent(false);
              setStep("preview");
            }}
            className="rounded-xl bg-action px-5 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Preview what will be public
          </button>
          <button
            type="button"
            onClick={() => {
              setReasons([]);
              setStep(server?.published ? "published" : "closed");
            }}
            className="rounded-xl px-3 py-2.5 text-sm font-semibold text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            Cancel
          </button>
        </div>
      </Shell>
    );
  }

  // ── Closed (the default, always) ───────────────────────────────────────
  return (
    <Shell>
      <div className="flex items-start gap-3">
        <Lock
          aria-hidden
          strokeWidth={1.75}
          className="mt-1 h-5 w-5 shrink-0 text-muted"
        />
        <div className="min-w-0 flex-1">
          <Heading>This analysis is private</Heading>
          <p className="mt-2 text-sm leading-relaxed text-secondary">
            Only you can see it. If you want it found — by an investor
            searching your sector, a customer checking you out, a journalist —
            you can publish a company profile built from this score. You choose
            the name and the description, you see the finished page before it
            goes anywhere, and you can take it down whenever you like.
          </p>
          <button
            type="button"
            data-testid="publish-open"
            onClick={() => {
              setReasons([]);
              setStep("form");
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-action px-4 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
          >
            <Globe aria-hidden strokeWidth={2} className="h-4 w-4" />
            Publish a public profile
          </button>
        </div>
      </div>
    </Shell>
  );
}

export default PublishPanel;
