import type { HTMLAttributes } from "react";
import { Rocket, LineChart, GraduationCap, type LucideIcon } from "lucide-react";

/**
 * ValueProps — 3-column value proposition grid below the hero.
 *
 * Server component. Each column is a `.lux-card` that gains a cyan
 * glow on hover, keeping the palette consistent with the rest of the
 * luxury dark theme.
 */

type ValueProp = {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
};

const PROPS: readonly ValueProp[] = [
  {
    icon: Rocket,
    title: "For Founders",
    body: "SVI + cap table + AI reports. From idea to fundable in 7 days.",
  },
  {
    icon: LineChart,
    title: "For Investors",
    body: "Verified deal flow + portfolio transparency. Deals you can trust, at a glance.",
  },
  {
    icon: GraduationCap,
    title: "For Accelerators",
    body: "Cohort SVI + LP quarterly reports. Score every founder, prove program ROI.",
  },
];

type ValuePropsProps = HTMLAttributes<HTMLDivElement>;

export function ValueProps({ className = "", ...rest }: ValuePropsProps) {
  return (
    <div
      className={`grid grid-cols-1 gap-8 md:grid-cols-3 ${className}`}
      {...rest}
    >
      {PROPS.map(({ icon: Icon, title, body }) => (
        <article
          key={title}
          className="lux-card group relative overflow-hidden p-8 transition duration-300 hover:-translate-y-1 hover:lux-glow-cyan"
        >
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan transition duration-300 group-hover:border-brand-cyan/60 group-hover:bg-brand-cyan/20">
            <Icon strokeWidth={1.75} className="h-6 w-6" aria-hidden="true" />
          </span>

          <h3 className="mt-6 text-xl font-semibold text-brand-ink">
            {title}
          </h3>

          <p className="mt-3 text-base leading-relaxed text-brand-ink-muted">
            {body}
          </p>

          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-lux-gold-line opacity-0 transition duration-300 group-hover:opacity-60"
          />
        </article>
      ))}
    </div>
  );
}
