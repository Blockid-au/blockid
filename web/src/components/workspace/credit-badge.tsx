"use client";
import * as React from "react";
import Link from "next/link";
import { Coins } from "lucide-react";
import { cn } from "@/lib/utils";

export function CreditBadge() {
  const [balance, setBalance] = React.useState<number | null>(null);

  React.useEffect(() => {
    fetch("/api/credits")
      .then(r => r.json())
      .then(d => { if (d.ok) setBalance(d.balance ?? 0); })
      .catch(() => {});
  }, []);

  if (balance === null) return null;

  const isLow = balance < 2;
  const isEmpty = balance <= 0;

  return (
    <Link href="/workspace/billing#credits" className={cn(
      "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
      isEmpty ? "bg-red-100 text-red-700" :
      isLow ? "bg-amber-100 text-amber-700" :
      "bg-surface-100 text-ink-600 hover:bg-surface-200"
    )}>
      <Coins className="h-3.5 w-3.5" />
      <span>{balance.toFixed(balance % 1 === 0 ? 0 : 1)} credits</span>
      {isEmpty && <span className="text-[10px]">· Buy more</span>}
      {isLow && !isEmpty && <span className="text-[10px]">· Low</span>}
    </Link>
  );
}
