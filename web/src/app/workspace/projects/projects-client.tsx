"use client";

import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Briefcase, Plus, Pencil, Archive, X, Loader2, ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Project {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  industry: string | null;
  stage: number;
  isDefault: boolean;
  createdAt: string;
}

interface ProjectsClientProps {
  initialProjects: Project[];
  limit: number;
  plan: string;
}

// ---------------------------------------------------------------------------
// Stage labels
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<number, string> = {
  0: "Pre-idea",
  1: "Idea",
  2: "Validation",
  3: "MVP",
  4: "Early Traction",
  5: "Growth",
  6: "Scale",
  7: "Mature",
};

// ---------------------------------------------------------------------------
// Industry options
// ---------------------------------------------------------------------------

const INDUSTRIES = [
  "SaaS", "Fintech", "Marketplace", "E-commerce", "HealthTech",
  "EdTech", "CleanTech", "PropTech", "DeepTech", "AgTech",
  "Logistics", "Media", "AI/ML", "Cybersecurity", "Other",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProjectsClient({ initialProjects, limit, plan }: ProjectsClientProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [projects, setProjects] = React.useState<Project[]>(initialProjects);
  const [showCreate, setShowCreate] = React.useState(searchParams.get("new") === "1");
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Form state for create
  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [newIndustry, setNewIndustry] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Form state for edit
  const [editName, setEditName] = React.useState("");
  const [editDesc, setEditDesc] = React.useState("");
  const [editIndustry, setEditIndustry] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  // Archiving state
  const [archivingId, setArchivingId] = React.useState<string | null>(null);

  const canCreate = projects.length < limit;

  // Auto-open create modal from URL param
  React.useEffect(() => {
    if (searchParams.get("new") === "1") setShowCreate(true);
  }, [searchParams]);

  function startEdit(project: Project) {
    setEditingId(project.id);
    setEditName(project.name);
    setEditDesc(project.description ?? "");
    setEditIndustry(project.industry ?? "");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
          industry: newIndustry || undefined,
        }),
      });
      const json = await res.json();
      if (json.ok && json.project) {
        setProjects((prev) => [...prev, json.project]);
        setShowCreate(false);
        setNewName("");
        setNewDesc("");
        setNewIndustry("");
        router.refresh();
      } else {
        setCreateError(json.error ?? "Failed to create project");
      }
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId || !editName.trim()) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/projects/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
          industry: editIndustry || null,
        }),
      });
      const json = await res.json();
      if (json.ok && json.project) {
        setProjects((prev) =>
          prev.map((p) => (p.id === editingId ? json.project : p)),
        );
        setEditingId(null);
        router.refresh();
      }
    } catch {
      // Silently fail for now
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(projectId: string) {
    if (!confirm("Archive this startup? You can contact support to restore it later.")) return;
    setArchivingId(projectId);

    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== projectId));
        router.refresh();
      } else {
        alert(json.error ?? "Failed to archive project");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setArchivingId(null);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">My Startups</h1>
          <p className="text-sm text-ink-500 mt-1">
            {projects.length} of {limit} startup{limit !== 1 ? "s" : ""} used
            <span className="mx-1.5 text-surface-300">|</span>
            <span className="capitalize">{plan}</span> plan
          </p>
        </div>
        {canCreate ? (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer shadow-sm"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Create New Startup
          </button>
        ) : (
          <a
            href="/workspace/billing"
            className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-colors cursor-pointer"
          >
            <ArrowUpRight strokeWidth={1.75} className="h-4 w-4" />
            Upgrade for More Startups
          </a>
        )}
      </div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <div className="text-center py-16 bg-surface-50 rounded-2xl border border-surface-200">
          <Briefcase strokeWidth={1.5} className="h-12 w-12 mx-auto text-ink-300 mb-4" />
          <h2 className="text-lg font-semibold text-ink-700 mb-2">No startups yet</h2>
          <p className="text-sm text-ink-500 mb-6 max-w-sm mx-auto">
            Create your first startup to start tracking your SVI score and building investor-ready evidence.
          </p>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Create Your First Startup
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className={cn(
                "rounded-2xl border bg-white p-5 transition-shadow hover:shadow-md relative group",
                project.isDefault ? "border-brand-200 ring-1 ring-brand-100" : "border-surface-200",
              )}
            >
              {/* Default badge */}
              {project.isDefault && (
                <span className="absolute top-3 right-3 text-[10px] font-semibold uppercase tracking-wider text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
                  Default
                </span>
              )}

              {/* Content */}
              <div className="flex items-start gap-3 mb-3">
                <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
                  <Briefcase strokeWidth={1.5} className="h-5 w-5 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-ink-800 truncate">{project.name}</h3>
                  {project.industry && (
                    <p className="text-xs text-ink-500">{project.industry}</p>
                  )}
                </div>
              </div>

              {project.description && (
                <p className="text-xs text-ink-500 mb-3 line-clamp-2">{project.description}</p>
              )}

              <div className="flex items-center gap-3 text-xs text-ink-400 mb-4">
                <span>Stage: {STAGE_LABELS[project.stage] ?? `Stage ${project.stage}`}</span>
                <span className="text-surface-300">|</span>
                <span>{formatDate(project.createdAt)}</span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => startEdit(project)}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-600 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  <Pencil strokeWidth={1.75} className="h-3 w-3" />
                  Edit
                </button>
                {!project.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleArchive(project.id)}
                    disabled={archivingId === project.id}
                    className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {archivingId === project.id ? (
                      <Loader2 strokeWidth={1.75} className="h-3 w-3 animate-spin" />
                    ) : (
                      <Archive strokeWidth={1.75} className="h-3 w-3" />
                    )}
                    Archive
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plan limit info */}
      {!canCreate && projects.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-amber-800">
              You have reached your {plan} plan limit of {limit} startup{limit !== 1 ? "s" : ""}.
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              Upgrade your plan to create more startups.
            </p>
          </div>
          <a
            href="/workspace/billing"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
          >
            Upgrade
            <ArrowUpRight strokeWidth={1.75} className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-surface-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <h2 className="text-lg font-bold text-ink-900">Create New Startup</h2>
              <button
                type="button"
                onClick={() => { setShowCreate(false); setCreateError(null); }}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <X strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="new-name" className="block text-sm font-medium text-ink-700 mb-1">
                  Startup Name *
                </label>
                <input
                  id="new-name"
                  type="text"
                  required
                  maxLength={100}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. My SaaS Idea"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="new-industry" className="block text-sm font-medium text-ink-700 mb-1">
                  Industry
                </label>
                <select
                  id="new-industry"
                  value={newIndustry}
                  onChange={(e) => setNewIndustry(e.target.value)}
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">Select an industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="new-desc" className="block text-sm font-medium text-ink-700 mb-1">
                  Description
                </label>
                <textarea
                  id="new-desc"
                  maxLength={500}
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Briefly describe your startup idea..."
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                />
              </div>
              {createError && (
                <p className="text-sm text-red-600 font-medium">{createError}</p>
              )}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateError(null); }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {creating && <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />}
                  Create Startup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-surface-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <h2 className="text-lg font-bold text-ink-900">Edit Startup</h2>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <X strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleEdit} className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-sm font-medium text-ink-700 mb-1">
                  Startup Name *
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  maxLength={100}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="edit-industry" className="block text-sm font-medium text-ink-700 mb-1">
                  Industry
                </label>
                <select
                  id="edit-industry"
                  value={editIndustry}
                  onChange={(e) => setEditIndustry(e.target.value)}
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  <option value="">Select an industry</option>
                  {INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>{ind}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="edit-desc" className="block text-sm font-medium text-ink-700 mb-1">
                  Description
                </label>
                <textarea
                  id="edit-desc"
                  maxLength={500}
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Briefly describe your startup idea..."
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !editName.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {saving && <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
