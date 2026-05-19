"use client";

import { cn } from "@/lib/utils";

interface RndStatusBarProps {
  status: string | null;
  isActive: boolean;
}

export function RndStatusBar({ status, isActive }: RndStatusBarProps) {
  if (!isActive || !status) return null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50/50 px-4 py-3 mt-4 animate-in fade-in duration-300">
      <span className="relative flex h-3 w-3">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500" />
      </span>
      <span className="text-sm font-medium text-brand-700">{status}</span>
    </div>
  );
}
