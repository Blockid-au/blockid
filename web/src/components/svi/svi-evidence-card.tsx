"use client";

import { CheckCircle2, XCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface SviEvidenceCardProps {
  evidenceType: string;
  label: string;
  present: boolean;
  impact: number;
  onAdd?: () => void;
  className?: string;
}

export function SviEvidenceCard({
  label,
  present,
  impact,
  onAdd,
  className,
}: SviEvidenceCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 py-1.5 px-2 rounded-md text-xs",
        present
          ? "bg-green-50"
          : "bg-red-50",
        className
      )}
    >
      {present ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-500" />
      ) : (
        <XCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
      )}
      <span
        className={cn(
          "flex-1 leading-tight",
          present
            ? "text-green-800"
            : "text-red-700"
        )}
      >
        {label}
      </span>
      <span className="tabular-nums font-medium text-muted">
        +{impact}
      </span>
      {!present && onAdd && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs gap-1 ml-1 shrink-0"
          onClick={onAdd}
        >
          <Plus className="h-3 w-3" />
          Add
        </Button>
      )}
    </div>
  );
}
