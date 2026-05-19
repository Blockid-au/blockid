import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-surface-200 bg-surface-100 text-ink-600",
        brand:
          "border-brand-100 bg-brand-50 text-brand-700",
        teal:
          "border-brand-200 bg-brand-50 text-brand-700",
        amber:
          "border-amber-200 bg-amber-50 text-amber-700",
        success:
          "border-emerald-100 bg-emerald-50 text-emerald-700",
        danger:
          "border-red-200 bg-red-50 text-red-700",
        outline:
          "border-surface-300 bg-transparent text-ink-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
