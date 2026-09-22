"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { activeHubTab, hubForPathname, hubTabHref } from "@/lib/nav/hubs";
import { navText, type NavGroup } from "./nav-groups";

type Crumb = { label: string; href?: string };

/** Only catalogue routes become links; dynamic identifiers never become labels. */
export function workspaceLocation(pathname: string, landingHref: string, groups: readonly NavGroup[], locale: "en" | "vi", includeHubs: boolean): Crumb[] {
  const path = pathname.split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  const vi = locale === "vi";
  const crumbs: Crumb[] = [{ label: vi ? "Trang chủ" : "Home", href: "/" }];
  crumbs.push({ label: vi ? "Tổng quan" : "Overview", href: path === landingHref ? undefined : landingHref });
  if (path === landingHref) return crumbs;

  const hub = includeHubs ? hubForPathname(path) : null;
  const leaves = groups.flatMap(group => group.items)
    .filter(item => !item.href.includes("?") && item.href !== landingHref && (path === item.href || path.startsWith(`${item.href}/`)))
    .sort((a, b) => b.href.length - a.href.length);
  if (hub) {
    crumbs.push({ label: navText(hub.label, locale), href: path === hub.root ? undefined : hub.root });
    if (path === hub.root) return crumbs;
    const tab = activeHubTab(hub, path);
    if (tab) {
      const href = hubTabHref(hub, tab);
      if (href !== hub.root) {
        crumbs.push({ label: navText(tab.label, locale), href: path === href ? undefined : href });
        if (path === href) return crumbs;
      }
    }
  } else if (leaves[0]) {
    const item = leaves[0];
    crumbs.push({ label: navText(item.label, locale), href: path === item.href ? undefined : item.href });
    if (path === item.href) return crumbs;
  }
  crumbs.push({ label: vi ? "Chi tiết" : "Details" });
  return crumbs;
}

export function WorkspaceLocation(props: { pathname: string; landingHref: string; groups: readonly NavGroup[]; locale: "en" | "vi"; includeHubs: boolean }) {
  const crumbs = workspaceLocation(props.pathname, props.landingHref, props.groups, props.locale, props.includeHubs);
  return (
    <nav aria-label={props.locale === "vi" ? "Vị trí trong không gian làm việc" : "Workspace location"} className="border-b border-line-subtle bg-surface px-4 sm:px-6">
      <ol className="flex min-w-0 flex-wrap items-center gap-x-1 text-sm">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.href ?? "current"}-${index}`} className="flex min-w-0 max-w-full items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted" />}
            {crumb.href ? (
              <Link href={crumb.href} prefetch={false} className="inline-flex min-h-11 min-w-11 items-center rounded-md px-2 text-muted underline decoration-line-subtle underline-offset-4 hover:bg-surface-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
                <span className="break-words">{crumb.label}</span>
              </Link>
            ) : <span aria-current="page" className="inline-flex min-h-11 items-center px-2 font-medium text-primary">{crumb.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
