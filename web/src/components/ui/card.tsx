import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * The `default` variant is pinned to the exact class string the previous
 * plain-Card render used so every existing consumer keeps its pixel output.
 * All other variants + the `size` density knob are additive.
 */
const cardVariants = cva("", {
  variants: {
    variant: {
      default: "rounded-3xl border border-surface-200/80 bg-white shadow-sm",
      elevated:
        "rounded-2xl bg-[var(--ds-surface-elevated)] border border-transparent shadow-[var(--shadow-lg)]",
      subtle:
        "rounded-xl bg-[var(--ds-surface-sunken)] border border-[var(--ds-border)]",
      interactive:
        "rounded-3xl border border-surface-200/80 bg-white shadow-sm card-hover cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ds-focus-ring)]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ds-surface)]",
      outline:
        "rounded-2xl bg-transparent border border-[var(--ds-border-strong)]",
    },
  },
  defaultVariants: { variant: "default" },
});

type CardSize = "sm" | "md" | "lg";

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  size?: CardSize;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, size, ...props }, ref) => (
    <div
      ref={ref}
      data-size={size}
      className={cn(cardVariants({ variant }), className)}
      {...props}
    />
  ),
);
Card.displayName = "Card";

/**
 * Density: `data-size` is reflected on the Card root as a metadata hook.
 * Downstream consumers (or later utilities) can key off it. Header/Content/
 * Footer keep the default p-6 for byte-identical rendering with the pre-pass
 * markup; override via `className` if a denser variant is needed.
 */

export const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col gap-1.5 p-6", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-lg font-bold leading-snug text-ink-900", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm leading-relaxed text-ink-500", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
));
CardContent.displayName = "CardContent";

export const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";

export { cardVariants };
