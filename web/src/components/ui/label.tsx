import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        // Base class preserved so every existing label render is byte-identical.
        // The paired Input controls the visible focus ring
        // (ring-2 ring-brand-500/50) — labels stay style-neutral.
        "block text-sm font-medium text-ink-700",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";
