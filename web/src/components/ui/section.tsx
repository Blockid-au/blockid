import * as React from "react";
import { cn } from "@/lib/utils";

type SectionSpacing = "xs" | "sm" | "md" | "lg";
type SectionTone = "surface" | "sunken" | "elevated" | "inverse";

const SPACING: Record<SectionSpacing, string> = {
  xs: "py-[var(--spacing-section-xs)]",
  sm: "py-[var(--spacing-section-sm)]",
  md: "py-[var(--spacing-section-md)]",
  lg: "py-[var(--spacing-section-lg)]",
};
const TONE: Record<SectionTone, string> = {
  surface: "bg-[var(--ds-surface)] text-[var(--ds-ink)]",
  sunken: "bg-[var(--ds-surface-sunken)] text-[var(--ds-ink)]",
  elevated: "bg-[var(--ds-surface-elevated)] text-[var(--ds-ink)]",
  inverse:
    "bg-[var(--ds-ink)] text-[var(--ds-accent-contrast)] [--ds-ink:var(--ds-accent-contrast)]",
};

export interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  spacing?: SectionSpacing;
  tone?: SectionTone;
  as?: "section" | "div" | "article" | "aside" | "main";
}

export const Section = React.forwardRef<HTMLElement, SectionProps>(
  ({ className, spacing = "md", tone = "surface", as = "section", children, ...props }, ref) => {
    const Tag = as as React.ElementType;
    return (
      <Tag ref={ref} className={cn(SPACING[spacing], TONE[tone], className)} {...props}>
        {children}
      </Tag>
    );
  },
);
Section.displayName = "Section";

type ContainerSize = "prose" | "md" | "lg" | "xl";
type ContainerGutter = "default" | "compact";

const CSIZE: Record<ContainerSize, string> = {
  prose: "max-w-3xl", md: "max-w-4xl", lg: "max-w-6xl", xl: "max-w-7xl",
};
const CGUTTER: Record<ContainerGutter, string> = {
  default: "px-6 lg:px-8", compact: "px-4 sm:px-6",
};

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
  gutter?: ContainerGutter;
}

export const Container = React.forwardRef<HTMLDivElement, ContainerProps>(
  ({ className, size = "lg", gutter = "default", ...props }, ref) => (
    <div ref={ref} className={cn("mx-auto w-full", CSIZE[size], CGUTTER[gutter], className)} {...props} />
  ),
);
Container.displayName = "Container";
