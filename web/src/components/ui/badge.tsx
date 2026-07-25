import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — split into `variant` (solid|subtle|outline) × `tone`
 * (default|primary|success|warning|danger|info).
 *
 * All legacy variant names (default/brand/teal/amber/success/danger/outline)
 * are preserved via the `LEGACY_VARIANT_ALIASES` mapper so that every current
 * consumer keeps its exact previous class string and hex output.
 */

const badgeBase =
  "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors";

const badgeVariants = cva(badgeBase, {
  variants: {
    // Shape/fill treatment.
    variant: {
      // Legacy variants — preserved byte-for-byte.
      default: "rounded-lg border-surface-200 bg-surface-100 text-ink-600",
      brand: "rounded-lg border-brand-100 bg-brand-50 text-brand-700",
      teal: "rounded-lg border-brand-200 bg-brand-50 text-brand-700",
      amber: "rounded-lg border-amber-200 bg-amber-50 text-amber-700",
      success: "rounded-lg border-emerald-100 bg-emerald-50 text-emerald-700",
      danger: "rounded-lg border-red-200 bg-red-50 text-red-700",
      outline: "rounded-lg border-surface-300 bg-transparent text-ink-600",
      // Design-system additions — used together with `tone` for the
      // 3-shape × 6-tone matrix.
      solid: "rounded-full border-transparent",
      subtle: "rounded-md",
      "outline-tone": "rounded-md bg-transparent",
    },
    tone: {
      default: "",
      primary: "",
      success: "",
      warning: "",
      danger: "",
      info: "",
    },
  },
  compoundVariants: [
    // solid × tone → filled pill.
    { variant: "solid", tone: "default", class: "bg-surface-200 text-ink-800" },
    { variant: "solid", tone: "primary", class: "bg-brand-600 text-white" },
    { variant: "solid", tone: "success", class: "bg-emerald-600 text-white" },
    { variant: "solid", tone: "warning", class: "bg-amber-500 text-white" },
    { variant: "solid", tone: "danger", class: "bg-red-600 text-white" },
    { variant: "solid", tone: "info", class: "bg-sky-600 text-white" },
    // subtle × tone → tinted chip.
    {
      variant: "subtle",
      tone: "default",
      class: "border-surface-200 bg-surface-100 text-ink-700",
    },
    {
      variant: "subtle",
      tone: "primary",
      class: "border-brand-100 bg-brand-50 text-brand-700",
    },
    {
      variant: "subtle",
      tone: "success",
      class: "border-emerald-100 bg-emerald-50 text-emerald-700",
    },
    {
      variant: "subtle",
      tone: "warning",
      class: "border-amber-200 bg-amber-50 text-amber-700",
    },
    {
      variant: "subtle",
      tone: "danger",
      class: "border-red-200 bg-red-50 text-red-700",
    },
    {
      variant: "subtle",
      tone: "info",
      class: "border-sky-200 bg-sky-50 text-sky-700",
    },
    // outline-tone × tone → transparent bordered chip.
    {
      variant: "outline-tone",
      tone: "default",
      class: "border-surface-300 text-ink-600",
    },
    {
      variant: "outline-tone",
      tone: "primary",
      class: "border-brand-300 text-brand-700",
    },
    {
      variant: "outline-tone",
      tone: "success",
      class: "border-emerald-300 text-emerald-700",
    },
    {
      variant: "outline-tone",
      tone: "warning",
      class: "border-amber-300 text-amber-700",
    },
    {
      variant: "outline-tone",
      tone: "danger",
      class: "border-red-300 text-red-700",
    },
    {
      variant: "outline-tone",
      tone: "info",
      class: "border-sky-300 text-sky-700",
    },
  ],
  defaultVariants: {
    variant: "default",
    tone: "default",
  },
});

type Variant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;
type Tone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({
  className,
  variant,
  tone,
  ...props
}: BadgeProps) {
  return (
    <span
      data-tone={tone ?? undefined}
      className={cn(badgeVariants({ variant, tone }), className)}
      {...props}
    />
  );
}

export { badgeVariants };
export type { Variant as BadgeVariant, Tone as BadgeTone };
