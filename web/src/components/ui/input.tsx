import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-12 w-full rounded-[var(--radius-sm)] border border-[var(--ds-border)] bg-white px-4 text-ink-800 placeholder:text-ink-500/60 transition-all duration-200 focus:outline-none focus:ring-[3px] focus:ring-[var(--ds-focus-ring)]/60 focus:ring-offset-1 focus:ring-offset-[var(--ds-surface)] focus:border-[var(--ds-accent)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
