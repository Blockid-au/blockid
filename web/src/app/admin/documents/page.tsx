"use client";

import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { UploadCloud, CheckCircle, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function AdminDocumentsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [driveLink, setDriveLink] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setUploadStatus("idle");
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadStatus("idle");
    setErrorMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/admin/drive/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadStatus("success");
      if (data.webViewLink) {
        setDriveLink(data.webViewLink);
      }
    } catch (err) {
      setUploadStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Logo variant="dark" />
          <span className="text-xs font-medium text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">ADMIN</span>
        </div>
        <Link href="/admin" className="text-xs text-ink-700 hover:text-ink-800 transition-colors">
          Back to Admin
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-800">Upload Documents</h1>
          <p className="text-sm text-ink-700 mt-1">Upload project documents directly to Google Drive.</p>
        </div>

        <div className="rounded-2xl border border-surface-200 bg-white p-8 text-center space-y-6 shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-surface-100 border border-surface-200">
            <UploadCloud className="h-8 w-8 text-brand-600" />
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 bg-brand-600 text-white hover:bg-brand-700 h-10 px-4 py-2">
                Select File
              </label>
              <input
                id="file-upload"
                type="file"
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
              />
            </div>

            {file && (
              <div className="text-sm text-ink-600 bg-surface-100 rounded py-2 px-3 border border-surface-200 inline-block">
                Selected: <span className="font-semibold text-ink-800">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-50 border border-surface-200 bg-surface-100 hover:bg-surface-50 h-10 px-4 py-2 text-ink-800"
          >
            {isUploading ? "Uploading..." : "Upload to Google Drive"}
          </button>

          {uploadStatus === "success" && (
            <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle className="h-5 w-5" />
                <span className="text-sm font-medium">Upload successful!</span>
              </div>
              {driveLink && (
                <a href={driveLink} target="_blank" rel="noopener noreferrer" className="text-xs text-green-600 hover:text-green-700 underline underline-offset-2">
                  View file on Google Drive
                </a>
              )}
            </div>
          )}

          {uploadStatus === "error" && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
