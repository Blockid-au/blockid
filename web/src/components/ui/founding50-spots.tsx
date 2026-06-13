"use client";

import * as React from "react";
import { Users } from "lucide-react";

interface SpotsData {
  remaining: number;
  taken: number;
  total: number;
}

export function Founding50Spots({ className }: { className?: string }) {
  const [spots, setSpots] = React.useState<SpotsData | null>(null);

  React.useEffect(() => {
    fetch("/api/founding50/spots")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setSpots({ remaining: d.remaining, taken: d.taken, total: d.total });
      })
      .catch(() => {});
  }, []);

  if (!spots) return null;

  const pct = Math.round((spots.taken / spots.total) * 100);
  const urgency = spots.remaining <= 5;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-ink-600">
          <Users className="h-3.5 w-3.5" />
          {spots.taken} of {spots.total} spots claimed
        </span>
        <span className={`text-xs font-bold ${urgency ? "text-red-600" : "text-brand-600"}`}>
          {spots.remaining} left
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${urgency ? "bg-red-500" : "bg-brand-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
