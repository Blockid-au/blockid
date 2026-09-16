import { Suspense } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AccessTierBadge } from "@/components/mentor/access-tier-badge";
import {
  CONSENT_LIFETIME_DAYS,
  MENTOR_ACCESS_TIERS,
  type MentorAccessTier,
  tierDisclosure,
  tierLabel,
} from "@/lib/mentor/access-tiers";
import { MentorInviteForm } from "./form";

// Mentor invite — section (5) of /workspace/investors/access (S-IA2). Ex
// /dashboard/mentor-invite/page.tsx: the founder-side magic-link approval
// screen, keyed on `?grant_request= | ?upgrade= | ?renew= | ?cohort=`. The
// composed page renders it only when one of those params is present, so the
// emailed /dashboard/mentor-invite?grant_request=… links (308 → here) keep
// working. See docs/plans/mentor-consent-model.md; the mentor-side "request"
// flow lives inside components/mentor/access-request-banner.tsx.

// ─── Types ─────────────────────────────────────────────────────────────

export interface MentorInviteParams {
  grant_request?: string;
  upgrade?: string;
  renew?: string;
  cohort?: string;
}

/** True when the query string carries one of the four invite keys. */
export function hasMentorInviteParams(sp: MentorInviteParams): boolean {
  return Boolean(sp.grant_request || sp.upgrade || sp.renew || sp.cohort);
}

interface GrantRequestSummary {
  id: string;
  mode: "new" | "upgrade" | "renew" | "cohort";
  mentorLabel: string;
  mentorEmail: string;
  resellerName: string;
  resellerId: string;
  requestedTier: MentorAccessTier;
  currentTier: MentorAccessTier | null;
  projectId: string | null;
  cohortName: string | null;
  expiresAt: string | null;
}

// ─── Server loader ─────────────────────────────────────────────────────

async function loadRequest(sp: MentorInviteParams): Promise<GrantRequestSummary | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const mode: GrantRequestSummary["mode"] = sp.upgrade
    ? "upgrade"
    : sp.renew
      ? "renew"
      : sp.cohort
        ? "cohort"
        : "new";

  // The three shapes differ in which table we resolve from. All are guarded
  // by application-layer joins — we never trust query-string tier claims.
  try {
    if (sp.grant_request) {
      const { data } = await supabase
        .from("mentor_grant_requests")
        .select(
          "id, mentor_user_id, reseller_id, requested_tier, project_id, mentor_email, mentor_label, reseller_name",
        )
        .eq("id", sp.grant_request)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        id: string;
        mentor_user_id: string;
        reseller_id: string;
        requested_tier: MentorAccessTier;
        project_id: string | null;
        mentor_email: string;
        mentor_label: string | null;
        reseller_name: string | null;
      };
      return {
        id: row.id,
        mode: "new",
        mentorLabel: row.mentor_label ?? row.mentor_email,
        mentorEmail: row.mentor_email,
        resellerName: row.reseller_name ?? "Your mentor",
        resellerId: row.reseller_id,
        requestedTier: row.requested_tier,
        currentTier: null,
        projectId: row.project_id,
        cohortName: null,
        expiresAt: null,
      };
    }

    const grantId = sp.upgrade ?? sp.renew;
    if (grantId) {
      const { data } = await supabase
        .from("mentor_access_grants")
        .select(
          "id, mentor_user_id, reseller_id, tier, project_id, expires_at",
        )
        .eq("id", grantId)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        id: string;
        mentor_user_id: string;
        reseller_id: string;
        tier: MentorAccessTier;
        project_id: string | null;
        expires_at: string | null;
      };
      // Requested tier defaults to next-up for upgrade, same for renew.
      const requested: MentorAccessTier =
        mode === "renew"
          ? row.tier
          : row.tier === "attributed_only"
            ? "reports_shared"
            : "full_mentor";
      return {
        id: row.id,
        mode,
        mentorLabel: "Existing mentor",
        mentorEmail: "",
        resellerName: "Existing mentor",
        resellerId: row.reseller_id,
        requestedTier: requested,
        currentTier: row.tier,
        projectId: row.project_id,
        cohortName: null,
        expiresAt: row.expires_at,
      };
    }

    if (sp.cohort) {
      const { data } = await supabase
        .from("mentor_cohorts")
        .select("id, name, reseller_id, default_tier")
        .eq("id", sp.cohort)
        .maybeSingle();
      if (!data) return null;
      const row = data as {
        id: string;
        name: string;
        reseller_id: string;
        default_tier: MentorAccessTier;
      };
      return {
        id: row.id,
        mode: "cohort",
        mentorLabel: `${row.name} cohort`,
        mentorEmail: "",
        resellerName: row.name,
        resellerId: row.reseller_id,
        requestedTier: row.default_tier,
        currentTier: null,
        projectId: null,
        cohortName: row.name,
        expiresAt: null,
      };
    }
  } catch {
    // Table may not exist yet in local dev — degrade to null so we render
    // the "invalid link" state rather than crashing the page.
    return null;
  }

  return null;
}

// ─── Section ───────────────────────────────────────────────────────────

export async function MentorInviteSection({ params }: { params: MentorInviteParams }) {
  const req = await loadRequest(params);

  return (
    <section id="mentor-invite" aria-labelledby="mentor-invite-heading" data-access-section="mentor-invite" className="scroll-mt-24">
      <h2 id="mentor-invite-heading" className="text-2xl font-bold text-ink-900">Mentor invite</h2>
      <p className="mt-1 text-sm text-ink-500">Approve, upgrade, renew, or decline a mentor&apos;s access to your startup.</p>
      <div className="mt-4 max-w-2xl">
        <Suspense fallback={<InviteSkeleton />}>
          {req ? (
            <InviteContent req={req} />
          ) : (
            <InvalidLink />
          )}
        </Suspense>
      </div>
    </section>
  );
}

// ─── Rendered pieces ───────────────────────────────────────────────────

function InviteContent({ req }: { req: GrantRequestSummary }) {
  const modeCopy: Record<GrantRequestSummary["mode"], string> = {
    new: "wants access to your startup",
    upgrade: "is asking to raise their access tier",
    renew: "is asking to renew their access for another 12 months",
    cohort: "cohort wants access to your startup",
  };

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-brand-700">
          Mentor access
        </p>
        <h3 className="mt-1 text-xl font-bold text-ink-900">
          {req.resellerName} {modeCopy[req.mode]}
        </h3>
        <p className="mt-2 text-sm text-ink-600">
          Approving grants access for {CONSENT_LIFETIME_DAYS / 30} months. You
          can revoke any time from{" "}
          <Link
            href="/workspace/investors/access#mentor-access"
            className="font-semibold text-brand-700 underline underline-offset-2"
          >
            Mentor access
          </Link>
          .
        </p>
      </header>

      {/* Identity card */}
      <section className="rounded-3xl border border-surface-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface-100">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-500">
              Requesting
            </p>
            <p className="mt-1 text-lg font-semibold text-ink-900 dark:text-ink-100">
              {req.mentorLabel}
            </p>
            {req.mentorEmail ? (
              <p className="text-sm text-ink-600 dark:text-ink-300">
                {req.mentorEmail}
              </p>
            ) : null}
          </div>
          <AccessTierBadge tier={req.requestedTier} showTooltip />
        </div>
        {req.expiresAt ? (
          <p className="mt-4 text-xs text-ink-500">
            Current grant expires{" "}
            <time dateTime={req.expiresAt}>
              {new Date(req.expiresAt).toLocaleDateString()}
            </time>
          </p>
        ) : null}
      </section>

      {/* Tier diff */}
      <section className="mt-6 rounded-3xl border border-surface-200 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-surface-100">
        <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-500">
          What changes if you approve
        </h4>
        <ul className="mt-4 space-y-3">
          {MENTOR_ACCESS_TIERS.map((t) => {
            const isCurrent = req.currentTier === t;
            const isRequested = req.requestedTier === t;
            return (
              <li
                key={t}
                className={`flex items-start gap-3 rounded-2xl border p-3 ${
                  isRequested
                    ? "border-brand-300 bg-brand-50/60 dark:border-brand-800/40 dark:bg-brand-900/20"
                    : "border-surface-200 bg-white dark:border-white/10 dark:bg-surface-100"
                }`}
              >
                <div className="mt-0.5">
                  {isRequested ? (
                    <ArrowRight
                      aria-hidden="true"
                      className="h-4 w-4 text-brand-600"
                    />
                  ) : isCurrent ? (
                    <CheckCircle2
                      aria-hidden="true"
                      className="h-4 w-4 text-emerald-600"
                    />
                  ) : (
                    <ShieldCheck
                      aria-hidden="true"
                      className="h-4 w-4 text-muted"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-100">
                    {tierLabel(t)}
                    {isCurrent ? (
                      <span className="ml-2 text-xs font-normal text-ink-500">
                        (current)
                      </span>
                    ) : null}
                    {isRequested ? (
                      <span className="ml-2 text-xs font-semibold text-brand-700">
                        (after approval)
                      </span>
                    ) : null}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-600 dark:text-ink-300">
                    {tierDisclosure(t)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Approve / decline form (client) */}
      <MentorInviteForm
        grantRequestId={req.id}
        mode={req.mode}
        resellerId={req.resellerId}
        requestedTier={req.requestedTier}
        currentTier={req.currentTier}
        projectId={req.projectId}
      />

      {/* Legal link */}
      <p className="mt-6 text-xs text-ink-500">
        By approving, you agree to the{" "}
        <a
          href="/legal/mentor-access-policy"
          className="font-semibold text-brand-700 underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          Mentor Access Policy
        </a>
        . Consent for Reports Shared and Full Mentor tiers expires
        automatically after {CONSENT_LIFETIME_DAYS / 30} months.
      </p>
    </>
  );
}

function InvalidLink() {
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
      <div className="mb-2 flex items-center gap-2 font-semibold">
        <AlertTriangle aria-hidden="true" className="h-5 w-5" />
        This invite link is not valid.
      </div>
      <p>
        It may have already been accepted, revoked, or expired. Check with the
        mentor who sent it, or visit{" "}
        <Link
          href="/workspace/investors/access#mentor-access"
          className="underline underline-offset-2"
        >
          Mentor access
        </Link>{" "}
        to see who currently has access to your startup.
      </p>
    </div>
  );
}

function InviteSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-6 w-1/3 rounded bg-surface-200" />
      <div className="h-24 rounded-3xl bg-surface-100" />
      <div className="h-48 rounded-3xl bg-surface-100" />
      <div className="flex justify-end gap-2">
        <div className="h-10 w-24 rounded-xl bg-surface-100" />
        <div className="h-10 w-32 rounded-xl bg-surface-200" />
      </div>
    </div>
  );
}

