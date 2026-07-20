"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

interface CopySnippetProps {
  text: string;
  label?: string;
}

export function CopySnippet({ text, label }: CopySnippetProps) {
  const [copied, setCopied] = React.useState<boolean>(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      // Reset flag on the next tick so a rapid re-copy re-fires the flash;
      // a plain setTimeout(fn, 0) is enough — no useEffect cascade needed.
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Older browsers / iframes without clipboard permission — silently no-op.
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="absolute top-3 right-3 inline-flex h-7 items-center gap-1.5 rounded-md border border-white/10 bg-white/10 px-2 text-[11px] font-semibold text-slate-200 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
      aria-label={label ? `Copy ${label}` : "Copy to clipboard"}
    >
      {copied ? (
        <>
          <Check strokeWidth={2} className="h-3.5 w-3.5 text-emerald-400" />
          <span>Copied</span>
        </>
      ) : (
        <>
          <Copy strokeWidth={1.75} className="h-3.5 w-3.5" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}
