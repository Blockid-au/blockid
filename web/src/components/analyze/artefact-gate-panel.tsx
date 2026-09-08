"use client";

// ArtefactGatePanel — what an account adds to a run that has already finished.
//
// THE RULE THIS ENFORCES
// ----------------------
// Gate the artefacts, not the analysis. A signed-out visitor keeps the whole
// substance of the run — score, valuation, next actions — because someone who
// has SEEN the value converts far better than someone stopped before seeing
// anything. What an account adds is the durable, shareable output:
//
//   * the permalink that keeps the run (owned by SavedAnalysisPanel, which
//     sits directly above this one — not repeated here);
//   * an unwatermarked export;
//   * the data room and its investor share links.
//
// WHY THIS PANEL EXISTS AT ALL
// ----------------------------
// Before it, these entry points were not "gated" — they were absent. The
// signed-out visitor never learned the export or the data room existed, so
// the account had nothing visible to offer. The alternative failure is worse:
// rendering live buttons that hand back a raw 401 or 402 from
// /api/svi/pdf when pressed. Both are silent. This says the plain thing
// instead: here is what an account adds, it is free, here is the link.
//
// Nothing here charges anything and nothing here may imply it does.

import * as React from "react";
import Link from "next/link";
import { FileDown, FolderLock, Lock } from "lucide-react";

export interface ArtefactGateItem {
  key: "export" | "data-room";
  label: string;
  detail: string;
  /** Where a signed-in founder actually goes. */
  href: string;
}

/** The account-only artefacts, in the order a founder needs them. */
export const ARTEFACT_ITEMS: ArtefactGateItem[] = [
  {
    key: "export",
    label: "Unwatermarked export",
    detail:
      "Download the full analysis as a clean PDF you can send to an investor without a preview watermark across it.",
    href: "/workspace/analyses",
  },
  {
    key: "data-room",
    label: "Data room and investor links",
    detail:
      "Turn this analysis into a data room, then share a private link with a specific investor and see what they opened.",
    href: "/workspace/data-room",
  },
];

export interface ArtefactGatePanelProps {
  /** Server-resolved session state. Anything but `true` is treated as guest. */
  authenticated?: boolean;
  /** Permalink path for this run, used as the post-signup destination. */
  analysisPath?: string | null;
  className?: string;
}

export function ArtefactGatePanel({
  authenticated,
  analysisPath,
  className,
}: ArtefactGatePanelProps) {
  const signedIn = authenticated === true;
  const next = analysisPath ?? "/analyze";
  const registerHref = `/auth/login?mode=register&next=${encodeURIComponent(next)}`;

  return (
    <section
      className={[
        "rounded-2xl border border-line-subtle bg-surface-sunken p-4 sm:p-5",
        className ?? "",
      ]
        .join(" ")
        .trim()}
      aria-labelledby="artefact-gate-heading"
      data-testid="analyze-artefact-gate"
    >
      <h2
        id="artefact-gate-heading"
        className="text-sm font-semibold text-primary"
      >
        {signedIn ? "Take this further" : "What a free account adds"}
      </h2>
      <p className="mt-1 text-sm text-secondary">
        {signedIn
          ? "Your score, valuation and next actions are above. These turn them into something you can send."
          : "Your score, valuation and next actions above are yours to read either way. An account is what turns them into something you can send — it is free, and there is nothing to pay."}
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {ARTEFACT_ITEMS.map((item) => {
          const Icon = item.key === "export" ? FileDown : FolderLock;
          return (
            <li key={item.key} className="flex items-start gap-3">
              <Icon
                aria-hidden
                strokeWidth={1.75}
                className="mt-0.5 h-4 w-4 shrink-0 text-tertiary"
              />
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-primary">
                  {signedIn ? (
                    <Link
                      href={item.href}
                      className="text-action hover:underline"
                      data-testid={`analyze-artefact-${item.key}-link`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span>{item.label}</span>
                  )}
                  {!signedIn && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-tertiary"
                      data-testid={`analyze-artefact-${item.key}-badge`}
                    >
                      <Lock aria-hidden strokeWidth={2} className="h-3 w-3" />
                      Account
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-sm text-secondary">{item.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {!signedIn && (
        <div className="mt-4">
          <Link
            href={registerHref}
            className="inline-flex items-center justify-center rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action transition-opacity hover:opacity-90"
            data-testid="analyze-artefact-gate-register"
          >
            Create a free account
          </Link>
        </div>
      )}
    </section>
  );
}

export default ArtefactGatePanel;
