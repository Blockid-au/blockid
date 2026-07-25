import * as React from "react";
import { cn } from "@/lib/utils";

export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        "block text-[length:var(--text-body-sm)] font-medium text-[var(--ds-ink-subtle)]",
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = "Label";
