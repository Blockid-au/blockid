import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-ink-700 bg-ink-800 text-slate-300",
        teal: "border-brand-500/30 bg-brand-500/10 text-brand-300",
        brand: "border-brand-500/30 bg-brand-500/10 text-brand-300",
        amber:
          "border-amber-500/30 bg-amber-500/10 text-amber-300",
        success:
          "border-green-500/30 bg-green-500/10 text-green-400",
        outline: "border-white/10 bg-transparent text-slate-300",
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
