"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import type { SVIAnalysis } from "@/lib/svi-analysis";

interface PDFDownloadButtonProps {
  /** Pass a slug to load the analysis server-side (requires auth cookie). */
  slug?: string;
  /** Alternatively pass the analysis directly to render in the browser. */
  analysis?: SVIAnalysis;
  /** Email shown in the confidential footer. */
  email?: string;
  /** Additional CSS classes. */
  className?: string;
  /** Button variant style. */
  variant?: "default" | "primary" | "icon";
}

export function PDFDownloadButton({
  slug,
  analysis,
  email,
  className,
  variant = "default",
}: PDFDownloadButtonProps) {
  const [loading, setLoading] = React.useState(false);

  const handleDownload = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const body: Record<string, unknown> = {};
      if (slug) body.slug = slug;
      if (analysis) body.analysis = analysis;
      if (email) body.email = email;

      const res = await fetch("/api/svi/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("[pdf-download]", errorData);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = slug
        ? `BlockID-SVI-Report-${slug}.pdf`
        : `BlockID-SVI-Report-${analysis?.totalSVI ?? "report"}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      trackEvent("investor_pdf_downloaded", { slug: slug ?? "inline" });
    } catch (err) {
      console.error("[pdf-download]", err);
    } finally {
      setLoading(false);
    }
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className={cn(
          "inline-flex h-9 w-9 items-center justify-center rounded-xl border border-surface-200 bg-white text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer disabled:opacity-50",
          className,
        )}
        aria-label="Download PDF Report"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    );
  }

  if (variant === "primary") {
    return (
      <button
        type="button"
        onClick={handleDownload}
        disabled={loading}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-all duration-200 cursor-pointer disabled:opacity-50 active:scale-[0.98]",
          className,
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {loading ? "Generating..." : "Download PDF Report"}
      </button>
    );
  }

  // default variant
  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={loading}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-surface-200 bg-white px-4 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer disabled:opacity-50",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {loading ? "Generating..." : "Download PDF"}
    </button>
  );
}
