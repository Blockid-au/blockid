"use client";

import React from "react";
import { Check, Copy } from "lucide-react";

interface CopyButtonProps {
  text: string;
  className?: string;
}

export function CopyButton({ text, className }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // fallback: the code element is select-all so user can copy manually
    }
  };

  return (
    <button
      type="button"
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-500 transition-colors hover:bg-surface-100 hover:text-ink-700 active:bg-surface-200 shrink-0"
      }
      onClick={handleCopy}
    >
      {copied ? (
        <>
          <Check strokeWidth={1.75} className="h-3.5 w-3.5 text-emerald-500" />
          Copied
        </>
      ) : (
        <>
          <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
          Copy
        </>
      )}
    </button>
  );
}
