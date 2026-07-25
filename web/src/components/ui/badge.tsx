import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warn"
  | "danger"
  | "info";
type BadgeShape = "solid" | "subtle" | "outline";

/** Legacy variant names — mapped to (shape, tone) so existing consumers keep
 *  their exact color output. */
type LegacyVariant =
  | "default"
  | "brand"
  | "teal"
  | "amber"
  | "success"
  | "danger"
  | "outline";

const LEGACY_MAP: Record<LegacyVariant, { shape: BadgeShape; tone: BadgeTone }> = {
  default: { shape: "subtle", tone: "neutral" },
  brand: { shape: "subtle", tone: "brand" },
  teal: { shape: "subtle", tone: "brand" },
  amber: { shape: "subtle", tone: "warn" },
  success: { shape: "subtle", tone: "success" },
  danger: { shape: "subtle", tone: "danger" },
  outline: { shape: "outline", tone: "neutral" },
};

const BASE =
  "inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-medium transition-colors";

const SUBTLE_TONE: Record<BadgeTone, string> = {
  neutral: "border-surface-200 bg-surface-100 text-ink-600",
  brand: "border-brand-100 bg-brand-50 text-brand-700",
  success: "border-emerald-100 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
};

const SOLID_TONE: Record<BadgeTone, string> = {
  neutral: "border-transparent bg-ink-800 text-white",
  brand: "border-transparent bg-brand-600 text-white",
  success: "border-transparent bg-emerald-600 text-white",
  warn: "border-transparent bg-amber-500 text-white",
  danger: "border-transparent bg-red-500 text-white",
  info: "border-transparent bg-sky-500 text-white",
};

const OUTLINE_TONE: Record<BadgeTone, string> = {
  neutral: "border-surface-300 bg-transparent text-ink-600",
  brand: "border-brand-300 bg-transparent text-brand-700",
  success: "border-emerald-300 bg-transparent text-emerald-700",
  warn: "border-amber-300 bg-transparent text-amber-700",
  danger: "border-red-300 bg-transparent text-red-700",
  info: "border-sky-300 bg-transparent text-sky-700",
};

function shapeClass(shape: BadgeShape) {
  return shape === "solid" ? "rounded-full" : "rounded-lg";
}

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Legacy variant OR modern shape. Accepts both to stay backward compatible. */
  variant?: LegacyVariant | BadgeShape;
  tone?: BadgeTone;
}

export function Badge({
  className,
  variant = "default",
  tone,
  ...props
}: BadgeProps) {
  let shape: BadgeShape;
  let resolvedTone: BadgeTone;
  if (variant === "solid" || variant === "subtle" || variant === "outline") {
    shape = variant;
    resolvedTone = tone ?? "neutral";
  } else {
    const legacy = LEGACY_MAP[variant];
    shape = legacy.shape;
    resolvedTone = tone ?? legacy.tone;
  }
  const toneClass =
    shape === "solid"
      ? SOLID_TONE[resolvedTone]
      : shape === "outline"
        ? OUTLINE_TONE[resolvedTone]
        : SUBTLE_TONE[resolvedTone];

  return (
    <span
      className={cn(BASE, shapeClass(shape), toneClass, className)}
      {...props}
    />
  );
}
