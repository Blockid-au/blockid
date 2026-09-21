"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoTooltipProps {
  text: string;
  className?: string;
}

export function InfoTooltip({ text, className }: InfoTooltipProps) {
  const [show, setShow] = React.useState(false);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        type="button"
        className="text-slate-400 hover:text-brand-400 transition-colors cursor-pointer"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow(!show)}
        aria-label="More information"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg bg-surface border border-line px-3 py-2 text-xs text-primary leading-relaxed shadow-2 z-50">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-surface border-r border-b border-line rotate-45" />
        </div>
      )}
    </span>
  );
}
