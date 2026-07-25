import * as React from "react";
import { cn } from "@/lib/utils";

type HeadingLevel = "display-2xl" | "display-xl" | "h1" | "h2" | "h3" | "h4";
type HeadingTone = "default" | "muted" | "accent" | "inherit";
type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span" | "div";

const LEVEL: Record<HeadingLevel, string> = {
  "display-2xl":
    "text-[length:var(--text-display-2xl)] leading-[var(--text-display-2xl--line-height)] tracking-[var(--text-display-2xl--letter-spacing)] font-extrabold",
  "display-xl":
    "text-[length:var(--text-display-xl)] leading-[var(--text-display-xl--line-height)] tracking-[var(--text-display-xl--letter-spacing)] font-extrabold",
  h1: "text-[length:var(--text-h1)] leading-[var(--text-h1--line-height)] tracking-[var(--text-h1--letter-spacing)] font-bold",
  h2: "text-[length:var(--text-h2)] leading-[var(--text-h2--line-height)] tracking-[var(--text-h2--letter-spacing)] font-bold",
  h3: "text-[length:var(--text-h3)] leading-[var(--text-h3--line-height)] font-semibold",
  h4: "text-[length:var(--text-h4)] leading-[var(--text-h4--line-height)] font-semibold",
};
const TONE: Record<HeadingTone, string> = {
  default: "text-[var(--ds-ink)]",
  muted: "text-[var(--ds-ink-muted)]",
  accent: "text-[var(--ds-accent)]",
  inherit: "",
};
const DEFAULT_TAG: Record<HeadingLevel, HeadingTag> = {
  "display-2xl": "h1", "display-xl": "h1", h1: "h1", h2: "h2", h3: "h3", h4: "h4",
};

export interface HeadingProps extends React.HTMLAttributes<HTMLElement> {
  level?: HeadingLevel;
  tone?: HeadingTone;
  as?: HeadingTag;
  /** text-wrap:balance — default true. */
  balance?: boolean;
}

export const Heading = React.forwardRef<HTMLElement, HeadingProps>(
  ({ className, level = "h2", tone = "default", as, balance = true, children, ...props }, ref) => {
    const Tag = (as ?? DEFAULT_TAG[level]) as React.ElementType;
    return (
      <Tag
        ref={ref}
        className={cn(LEVEL[level], TONE[tone], balance && "text-balance", className)}
        {...props}
      >
        {children}
      </Tag>
    );
  },
);
Heading.displayName = "Heading";
