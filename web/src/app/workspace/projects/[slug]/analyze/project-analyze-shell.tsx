"use client";

/**
 * ProjectAnalyzeShell — thin client wrapper around SVIEntrance.
 *
 * Pins the `blockid_project` cookie to this project's slug BEFORE
 * SVIEntrance issues any /api/svi/* request, so:
 *   - svi_analyses.project_id is set correctly
 *   - findOrCreateSVIAccount attaches to the right (email, project_id) row
 *   - Drive folder gets the project name
 *
 * If a `?query=` was passed on the URL we forward it through the address
 * bar so SVIEntrance's own useSearchParams prefill picks it up on mount
 * — no need to duplicate that logic here.
 *
 * The cookie is written from useEffect (document.cookie is a browser
 * side-effect that can't run during render). It lands on the very first
 * paint, long before the user can click submit, so we don't gate the
 * analyser render on it — that would only add a flash of "Preparing…"
 * for zero correctness gain.
 *
 * We do NOT overwrite the cookie back on unmount: the founder navigated
 * here explicitly, so keeping this project active matches how the
 * ProjectSwitcher behaves elsewhere.
 */

import * as React from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { SVIEntrance } from "@/components/svi/svi-entrance";

interface Props {
  projectSlug: string;
  initialQuery: string;
}

const PROJECT_COOKIE = "blockid_project";
const ONE_YEAR = 365 * 24 * 60 * 60;

function setProjectCookie(slug: string): void {
  if (typeof document === "undefined") return;
  document.cookie =
    `${PROJECT_COOKIE}=${encodeURIComponent(slug)};path=/;` +
    `max-age=${ONE_YEAR};samesite=lax`;
}

export function ProjectAnalyzeShell({ projectSlug, initialQuery }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    setProjectCookie(projectSlug);
  }, [projectSlug]);

  React.useEffect(() => {
    if (!initialQuery) return;
    if (searchParams.get("query") === initialQuery) return;
    const url = new URL(window.location.href);
    url.searchParams.set("query", initialQuery);
    router.replace(url.pathname + url.search + url.hash, { scroll: false });
  }, [initialQuery, pathname, router, searchParams]);

  return <SVIEntrance />;
}
