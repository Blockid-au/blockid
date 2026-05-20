"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, ChevronDown, Plus, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  isDefault: boolean;
}

interface ProjectsResponse {
  ok: boolean;
  projects: Project[];
  limit: number;
  used: number;
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

function getProjectCookie(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)blockid_project=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setProjectCookie(slug: string) {
  document.cookie = `blockid_project=${encodeURIComponent(slug)};path=/;max-age=${365 * 24 * 60 * 60};samesite=lax`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectSwitcher() {
  const router = useRouter();
  const [data, setData] = React.useState<ProjectsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [activeSlug, setActiveSlug] = React.useState<string | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);

  // Fetch projects on mount.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const json = (await res.json()) as ProjectsResponse;
        if (!cancelled && json.ok) {
          setData(json);
          // Determine active project from cookie or default
          const cookie = getProjectCookie();
          const matchesCookie = json.projects.find((p) => p.slug === cookie);
          const defaultProject = json.projects.find((p) => p.isDefault);
          const active = matchesCookie ?? defaultProject ?? json.projects[0];
          if (active) {
            setActiveSlug(active.slug);
            if (!matchesCookie) setProjectCookie(active.slug);
          }
        }
      } catch {
        // Silently ignore — component stays hidden if fetch fails.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close dropdown on outside click.
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function switchProject(slug: string) {
    setActiveSlug(slug);
    setProjectCookie(slug);
    setOpen(false);
    // Refresh the page to reload data in the new project context
    router.refresh();
  }

  // Don't render if loading or single project (no need for switcher)
  if (loading) {
    return (
      <div className="h-8 w-8 flex items-center justify-center">
        <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin text-ink-400" />
      </div>
    );
  }

  if (!data || data.projects.length === 0) return null;

  const activeProject = data.projects.find((p) => p.slug === activeSlug) ?? data.projects[0];
  const canCreate = data.used < data.limit;

  return (
    <div ref={ref} className="relative">
      {/* Active project pill */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors cursor-pointer select-none hover:bg-surface-100"
      >
        <Briefcase strokeWidth={1.75} className="h-4 w-4 text-brand-600 shrink-0" />
        <span className="font-semibold text-ink-800 truncate max-w-[160px]">
          {activeProject.name}
        </span>
        {data.projects.length > 1 && (
          <ChevronDown
            strokeWidth={1.75}
            className={cn(
              "h-3.5 w-3.5 text-ink-400 transition-transform",
              open && "rotate-180",
            )}
          />
        )}
        {data.limit > 1 && (
          <span className="ml-0.5 text-[10px] font-medium text-ink-400 bg-surface-100 rounded-full px-1.5 py-0.5">
            {data.used}/{data.limit}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-surface-200 bg-white shadow-lg z-50 overflow-hidden animate-fade-in">
          {/* Header */}
          <div className="px-4 py-2.5 border-b border-surface-200 bg-surface-50">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-ink-400 uppercase tracking-wider">
                My Startups
              </span>
              <span className="text-xs font-medium text-ink-500">
                {data.used} of {data.limit}
              </span>
            </div>
          </div>

          {/* Project list */}
          <div className="py-1 max-h-60 overflow-y-auto">
            {data.projects.map((project) => {
              const isActive = project.slug === activeSlug;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => switchProject(project.slug)}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-2.5 text-left text-sm transition-colors cursor-pointer",
                    isActive
                      ? "bg-brand-50 text-brand-700"
                      : "text-ink-700 hover:bg-surface-50",
                  )}
                >
                  <Briefcase
                    strokeWidth={1.75}
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-brand-600" : "text-ink-400",
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn("font-medium truncate", isActive && "font-semibold")}>
                      {project.name}
                    </p>
                    {project.industry && (
                      <p className="text-[10px] text-ink-400 truncate">{project.industry}</p>
                    )}
                  </div>
                  {isActive && (
                    <Check strokeWidth={2} className="h-4 w-4 text-brand-600 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>

          {/* New Startup CTA */}
          <div className="px-3 py-2.5 border-t border-surface-200">
            {canCreate ? (
              <a
                href="/workspace/projects?new=1"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-sm font-medium text-brand-600 hover:bg-brand-50 transition-colors"
              >
                <Plus strokeWidth={1.75} className="h-4 w-4" />
                New Startup
              </a>
            ) : (
              <a
                href="/workspace/billing"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-xs font-medium text-ink-500 hover:bg-surface-50 transition-colors"
              >
                <Plus strokeWidth={1.75} className="h-3.5 w-3.5" />
                Upgrade to add more startups
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
