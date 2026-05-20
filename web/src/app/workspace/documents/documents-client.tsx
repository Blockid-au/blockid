"use client";

import * as React from "react";
import {
  FolderOpen, Plus, ExternalLink, RefreshCw, Trash2, Check, X,
  FileText, Loader2, ToggleLeft, ToggleRight, FolderPlus, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/* ---------- types ---------- */

interface SourceFolder {
  id: string;
  folder_type: string;
  folder_id: string;
  folder_url: string;
  label: string;
  svi_dimension: string | null;
  is_active: boolean;
  created_at: string;
}

interface DataroomFile {
  id: string;
  svi_dimension: string;
  file_name: string;
  drive_file_url: string | null;
  mime_type: string | null;
  status: string;
}

interface DataroomDimension {
  dimension: string;
  label: string;
  description: string;
  filePatterns: string[];
  folderId?: string;
  folderUrl?: string;
}

interface BlockidFolder {
  folderId: string;
  folderUrl: string;
  files: Array<{ id: string; name: string; webViewLink: string; mimeType: string }>;
}

/* ---------- constants ---------- */

const SVI_DIMENSIONS = [
  { value: "", label: "Auto-classify" },
  { value: "ftv", label: "01 - Team & Founders" },
  { value: "mpc", label: "02 - Market & Competitive" },
  { value: "ptd", label: "03 - Product & Technical" },
  { value: "tre", label: "04 - Traction & Revenue" },
  { value: "cgh", label: "05 - Cap Table & Governance" },
  { value: "iri", label: "06 - Investor Readiness" },
  { value: "lco", label: "07 - Legal & Compliance" },
  { value: "svm", label: "08 - Strategic Value & Moat" },
];

const FOLDER_TYPE_BADGE: Record<string, { label: string; className: string }> = {
  drive: { label: "Drive", className: "bg-blue-50 text-blue-700 border-blue-200" },
  blockid: { label: "BlockID", className: "bg-brand-50 text-brand-700 border-brand-200" },
  dataroom: { label: "Data Room", className: "bg-amber-50 text-amber-700 border-amber-200" },
};

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "text-ink-500" },
  indexed: { label: "Indexed", className: "text-blue-600" },
  analyzed: { label: "Analyzed", className: "text-emerald-600" },
};

/* ---------- component ---------- */

export function DocumentsClient() {
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  // State: blockid folder
  const [blockidFolder, setBlockidFolder] = React.useState<BlockidFolder | null>(null);
  const [sourceFoldersEnabled, setSourceFoldersEnabled] = React.useState(false);
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [togglingEnabled, setTogglingEnabled] = React.useState(false);

  // State: source folders
  const [folders, setFolders] = React.useState<SourceFolder[]>([]);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [addFolderId, setAddFolderId] = React.useState("");
  const [addLabel, setAddLabel] = React.useState("");
  const [addDimension, setAddDimension] = React.useState("");
  const [addLoading, setAddLoading] = React.useState(false);

  // State: data room
  const [dataroomStructure, setDataroomStructure] = React.useState<DataroomDimension[]>([]);
  const [dataroomFiles, setDataroomFiles] = React.useState<DataroomFile[]>([]);
  const [creatingDataroom, setCreatingDataroom] = React.useState(false);
  const [cloningFiles, setCloningFiles] = React.useState(false);
  const [cloneSourceId, setCloneSourceId] = React.useState("");

  // State: toast
  const [toast, setToast] = React.useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = React.useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ---------- data loading ---------- */

  const loadData = React.useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const [sfRes, drRes] = await Promise.all([
        fetch("/api/source-folders"),
        fetch("/api/dataroom/clone"),
      ]);
      const sfData = await sfRes.json();
      const drData = await drRes.json();

      if (sfData.ok) {
        setBlockidFolder(sfData.blockidFolder);
        setSourceFoldersEnabled(sfData.sourceFoldersEnabled);
        setFolders(sfData.folders ?? []);
        setDataroomFiles(sfData.dataroomFiles ?? []);
      }
      if (drData.ok) {
        setDataroomStructure(drData.structure ?? []);
      }
    } catch {
      showToast("Failed to load data", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  React.useEffect(() => { void loadData(); }, [loadData]);

  /* ---------- actions ---------- */

  const handleCreateBlockidFolder = async () => {
    setCreatingFolder(true);
    try {
      const res = await fetch("/api/source-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_blockid_folder" }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("BlockID Drive folder created");
        await loadData(true);
      } else {
        showToast(data.error ?? "Failed to create folder", "error");
      }
    } catch {
      showToast("Failed to create folder", "error");
    } finally {
      setCreatingFolder(false);
    }
  };

  const handleToggleEnabled = async () => {
    setTogglingEnabled(true);
    try {
      const res = await fetch("/api/source-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_source_folders" }),
      });
      const data = await res.json();
      if (data.ok !== undefined) {
        setSourceFoldersEnabled(data.enabled);
        showToast(data.enabled ? "Source folders enabled for SVI analysis" : "Source folders disabled");
      }
    } catch {
      showToast("Failed to toggle", "error");
    } finally {
      setTogglingEnabled(false);
    }
  };

  const handleAddFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFolderId.trim() || !addLabel.trim()) return;
    setAddLoading(true);
    try {
      const res = await fetch("/api/source-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId: addFolderId.trim(),
          label: addLabel.trim(),
          sviDimension: addDimension || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast("Source folder added");
        setAddFolderId("");
        setAddLabel("");
        setAddDimension("");
        setShowAddForm(false);
        await loadData(true);
      } else {
        showToast(data.error ?? "Failed to add folder", "error");
      }
    } catch {
      showToast("Failed to add folder", "error");
    } finally {
      setAddLoading(false);
    }
  };

  const handleToggleFolder = async (folder: SourceFolder) => {
    try {
      const res = await fetch("/api/source-folders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: folder.id, is_active: !folder.is_active }),
      });
      const data = await res.json();
      if (data.ok) {
        setFolders((prev) => prev.map((f) => f.id === folder.id ? { ...f, is_active: !f.is_active } : f));
      }
    } catch {
      showToast("Failed to update folder", "error");
    }
  };

  const handleDeleteFolder = async (folder: SourceFolder) => {
    try {
      const res = await fetch("/api/source-folders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: folder.id }),
      });
      const data = await res.json();
      if (data.ok) {
        setFolders((prev) => prev.filter((f) => f.id !== folder.id));
        showToast("Folder removed");
      }
    } catch {
      showToast("Failed to delete folder", "error");
    }
  };

  const handleCreateDataroom = async () => {
    setCreatingDataroom(true);
    try {
      const res = await fetch("/api/dataroom/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Data room structure created (${data.structure?.length ?? 8} folders)`);
        await loadData(true);
      } else {
        showToast(data.error ?? "Failed to create data room", "error");
      }
    } catch {
      showToast("Failed to create data room", "error");
    } finally {
      setCreatingDataroom(false);
    }
  };

  const handleCloneFiles = async () => {
    if (!cloneSourceId) return;
    setCloningFiles(true);
    try {
      const res = await fetch("/api/dataroom/clone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceFolderId: cloneSourceId }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(`Cloned ${data.clonedFiles ?? 0} files into data room`);
        await loadData(true);
      } else {
        showToast(data.error ?? "Failed to clone files", "error");
      }
    } catch {
      showToast("Failed to clone files", "error");
    } finally {
      setCloningFiles(false);
    }
  };

  /* ---------- render ---------- */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 text-brand-600 animate-spin" />
      </div>
    );
  }

  const filesByDimension = dataroomFiles.reduce<Record<string, DataroomFile[]>>((acc, f) => {
    (acc[f.svi_dimension] ??= []).push(f);
    return acc;
  }, {});

  return (
    <>
      {/* Toast */}
      {toast && (
        <div className={`mb-4 flex items-center justify-between rounded-xl border px-5 py-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300 ${
          toast.type === "success" ? "border-teal-200 bg-teal-50" : "border-red-200 bg-red-50"
        }`}>
          <p className={`text-sm font-semibold ${toast.type === "success" ? "text-teal-700" : "text-red-700"}`}>
            {toast.message}
          </p>
          <button type="button" onClick={() => setToast(null)} className="text-ink-500 hover:text-ink-700 cursor-pointer text-xs font-medium ml-4">
            Dismiss
          </button>
        </div>
      )}

      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Source Documents</h1>
          <p className="text-sm text-ink-600 mt-1">
            Manage your document folders and data room structure for SVI analysis.
          </p>
        </div>
        <Button variant="ghost" size="xs" onClick={() => loadData(true)} disabled={refreshing}>
          <RefreshCw strokeWidth={1.75} className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ========== Section A: BlockID Drive Folder ========== */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-ink-700 uppercase tracking-wide mb-3">BlockID Drive Folder</h2>
        <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
          {blockidFolder ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center">
                    <FolderOpen strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-800">BlockID Documents</p>
                    <p className="text-xs text-ink-500 font-mono">{blockidFolder.folderId}</p>
                  </div>
                </div>
                <a
                  href={blockidFolder.folderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                >
                  <ExternalLink strokeWidth={1.75} className="h-4 w-4" />
                  Open in Drive
                </a>
              </div>

              {/* Toggle: include in SVI */}
              <div className="flex items-center justify-between pt-3 border-t border-surface-200">
                <div>
                  <p className="text-sm font-medium text-ink-700">Include documents in SVI analysis</p>
                  <p className="text-xs text-ink-500">When enabled, files in source folders are analyzed for your SVI score.</p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleEnabled}
                  disabled={togglingEnabled}
                  className="cursor-pointer disabled:opacity-50"
                >
                  {sourceFoldersEnabled ? (
                    <ToggleRight strokeWidth={1.75} className="h-7 w-7 text-brand-600" />
                  ) : (
                    <ToggleLeft strokeWidth={1.75} className="h-7 w-7 text-ink-400" />
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <FolderOpen className="h-10 w-10 text-surface-300 mx-auto mb-2" />
              <p className="text-sm text-ink-600 mb-3">No BlockID Drive folder yet.</p>
              <Button variant="primary" size="sm" onClick={handleCreateBlockidFolder} disabled={creatingFolder}>
                {creatingFolder ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus strokeWidth={1.75} className="h-4 w-4" />}
                Create Your Document Folder
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ========== Section B: Source Folders ========== */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink-700 uppercase tracking-wide">Source Folders</h2>
          <Button variant="secondary" size="xs" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? <X strokeWidth={1.75} className="h-4 w-4" /> : <Plus strokeWidth={1.75} className="h-4 w-4" />}
            {showAddForm ? "Cancel" : "Add Source Folder"}
          </Button>
        </div>

        {/* Add folder form */}
        {showAddForm && (
          <form onSubmit={handleAddFolder} className="rounded-xl border border-brand-200 bg-brand-50/30 p-5 mb-4 space-y-4">
            <div>
              <Label htmlFor="folder-id">Google Drive Folder ID</Label>
              <Input
                id="folder-id"
                value={addFolderId}
                onChange={(e) => setAddFolderId(e.target.value)}
                placeholder="e.g. 1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="folder-label">Label</Label>
              <Input
                id="folder-label"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="e.g. Pitch Deck Folder"
                className="mt-1"
                required
              />
            </div>
            <div>
              <Label htmlFor="folder-dimension">SVI Dimension (optional)</Label>
              <select
                id="folder-dimension"
                value={addDimension}
                onChange={(e) => setAddDimension(e.target.value)}
                className="mt-1 h-12 w-full rounded-2xl border border-surface-300 bg-white px-4 text-sm text-ink-800 transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-100"
              >
                {SVI_DIMENSIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
            <Button type="submit" variant="primary" size="sm" disabled={addLoading}>
              {addLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check strokeWidth={1.75} className="h-4 w-4" />}
              Save
            </Button>
          </form>
        )}

        {/* Folder list */}
        {folders.length > 0 ? (
          <div className="space-y-3">
            {folders.map((folder) => {
              const badge = FOLDER_TYPE_BADGE[folder.folder_type] ?? FOLDER_TYPE_BADGE.drive;
              return (
                <div
                  key={folder.id}
                  className="flex items-center gap-4 rounded-xl border border-surface-200 bg-white px-5 py-4 hover:border-brand-200 transition-colors shadow-sm"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-100 border border-surface-200">
                    <FolderOpen strokeWidth={1.5} className="h-4 w-4 text-brand-600" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink-800 truncate">{folder.label}</p>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-xs text-ink-500 mt-0.5 font-mono truncate">{folder.folder_id}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Active/Inactive toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleFolder(folder)}
                      className="cursor-pointer"
                      title={folder.is_active ? "Active - click to deactivate" : "Inactive - click to activate"}
                    >
                      {folder.is_active ? (
                        <ToggleRight strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
                      ) : (
                        <ToggleLeft strokeWidth={1.75} className="h-6 w-6 text-ink-400" />
                      )}
                    </button>

                    {/* External link */}
                    <a
                      href={folder.folder_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-brand-600 hover:bg-surface-50 transition-colors"
                    >
                      <ExternalLink strokeWidth={1.75} className="h-4 w-4" />
                    </a>

                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => handleDeleteFolder(folder)}
                      className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 strokeWidth={1.75} className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-surface-200 bg-white p-6 text-center shadow-sm">
            <FolderOpen className="h-8 w-8 text-surface-300 mx-auto mb-2" />
            <p className="text-sm text-ink-500">No source folders added yet.</p>
          </div>
        )}
      </section>

      {/* ========== Section C: Data Room Structure ========== */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-ink-700 uppercase tracking-wide">Data Room Structure</h2>
          <Button variant="primary" size="xs" onClick={handleCreateDataroom} disabled={creatingDataroom || !blockidFolder}>
            {creatingDataroom ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus strokeWidth={1.75} className="h-4 w-4" />}
            Create Data Room Structure
          </Button>
        </div>

        {!blockidFolder && (
          <p className="text-xs text-ink-500 mb-3">Create a BlockID Drive folder first to enable data room creation.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {dataroomStructure.map((dim) => (
            <div
              key={dim.dimension}
              className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-surface-100 border border-surface-200 flex items-center justify-center shrink-0">
                  <FolderOpen strokeWidth={1.5} className="h-4 w-4 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800">{dim.label}</p>
                  <p className="text-xs text-ink-500 mt-0.5">{dim.description}</p>
                  {dim.folderUrl && (
                    <a href={dim.folderUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 mt-1">
                      <ExternalLink strokeWidth={1.75} className="h-3 w-3" />
                      Open
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Clone files control */}
        {blockidFolder && folders.length > 0 && (
          <div className="mt-4 rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-ink-700 mb-3">Clone &amp; Organize Files</p>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label htmlFor="clone-source">Source Folder</Label>
                <select
                  id="clone-source"
                  value={cloneSourceId}
                  onChange={(e) => setCloneSourceId(e.target.value)}
                  className="mt-1 h-12 w-full rounded-2xl border border-surface-300 bg-white px-4 text-sm text-ink-800 transition-all duration-200 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-100"
                >
                  <option value="">Select a folder...</option>
                  {folders.filter((f) => f.is_active).map((f) => (
                    <option key={f.id} value={f.folder_id}>{f.label}</option>
                  ))}
                </select>
              </div>
              <Button variant="primary" size="sm" onClick={handleCloneFiles} disabled={cloningFiles || !cloneSourceId}>
                {cloningFiles ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy strokeWidth={1.75} className="h-4 w-4" />}
                Clone &amp; Organize
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* ========== Section D: Files in Data Room ========== */}
      {dataroomFiles.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-ink-700 uppercase tracking-wide mb-3">Files in Data Room</h2>
          <div className="space-y-4">
            {dataroomStructure.map((dim) => {
              const files = filesByDimension[dim.dimension];
              if (!files || files.length === 0) return null;
              return (
                <div key={dim.dimension}>
                  <p className="text-xs font-semibold text-ink-600 mb-2">{dim.label}</p>
                  <div className="space-y-2">
                    {files.map((file) => {
                      const st = STATUS_LABEL[file.status] ?? STATUS_LABEL.pending;
                      return (
                        <div
                          key={file.id}
                          className="flex items-center gap-3 rounded-lg border border-surface-200 bg-white px-4 py-3 shadow-sm"
                        >
                          <FileText strokeWidth={1.5} className="h-4 w-4 text-ink-500 shrink-0" />
                          <p className="text-sm text-ink-800 truncate flex-1">{file.file_name}</p>
                          <span className={`text-xs font-medium ${st.className}`}>{st.label}</span>
                          {file.drive_file_url && (
                            <a
                              href={file.drive_file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:text-brand-700"
                            >
                              <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
