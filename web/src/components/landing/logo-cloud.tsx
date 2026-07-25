// LogoCloud — curator-controlled sponsor/accelerator strip.
//
// Reads from web/config/marketing-partners.json at request time. Renders
// NOTHING when the config file is missing, unreadable, or the resolved group
// is empty. Never fabricate affiliations — see partners-types.ts for the
// guardrail.

import {
  loadPartnersConfig,
  resolveGroup,
  type NormalisedPartner,
  type PartnerGroupKey,
} from "./partners-types";

interface LogoCloudProps {
  /** Curator group to render. Omit to fall back to legacy `partners` array. */
  group?: PartnerGroupKey;
  /** Compact density trims vertical padding + tile height for above-CTA use. */
  density?: "default" | "compact";
  className?: string;
}

export function LogoCloud({
  group,
  density = "default",
  className = "",
}: LogoCloudProps) {
  const config = loadPartnersConfig();
  const resolved = resolveGroup(config, group, "partners", "Working with");
  if (!resolved) return null;

  const compact = density === "compact";
  const sectionPadding = compact ? "py-8" : "py-12";
  const gridGap = compact ? "gap-x-6 gap-y-4 mt-6" : "gap-x-6 gap-y-6 mt-8";

  return (
    <section
      aria-labelledby="logo-cloud-title"
      className={`border-y border-surface-200 bg-surface-100 ${className}`.trim()}
    >
      <div className={`mx-auto max-w-7xl px-6 ${sectionPadding}`}>
        <p
          id="logo-cloud-title"
          className="text-center text-xs uppercase tracking-[0.2em] text-ink-600 font-medium"
        >
          {resolved.label ?? "Working with"}
        </p>
        <ul
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 items-center ${gridGap}`}
        >
          {resolved.entries.map((entry) => (
            <li key={entry.name} className="flex items-center justify-center">
              <PartnerTile entry={entry} compact={compact} tone="light" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

interface PartnerTileProps {
  entry: NormalisedPartner;
  compact: boolean;
  tone: "light" | "lux";
}

function PartnerTile({ entry, compact, tone }: PartnerTileProps) {
  const height = compact ? "h-8" : "h-10";
  // Focus ring / hover contrast pair — light for surface-100 bands, fintech
  // accent for the lux hero.
  const ringToken =
    tone === "lux"
      ? "focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-[var(--fintech-bg-primary)]"
      : "focus-visible:ring-brand-500 focus-visible:ring-offset-surface-100";
  const inkClass =
    tone === "lux"
      ? "text-brand-ink/70 hover:text-brand-ink"
      : "text-ink-600 hover:text-ink-800";
  const linkClass = [
    "inline-flex items-center justify-center rounded-md px-3 py-1",
    "opacity-60 transition duration-200 hover:opacity-100",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    ringToken,
    inkClass,
  ].join(" ");

  const content =
    entry.src !== null ? (
      <img
        src={entry.src}
        alt={entry.alt}
        loading="lazy"
        decoding="async"
        className={`${height} w-auto max-w-full`}
      />
    ) : (
      <span
        className={`text-center text-sm md:text-base font-semibold tracking-tight`}
      >
        {entry.name}
      </span>
    );

  if (entry.href) {
    return (
      <a
        href={entry.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={entry.alt}
        title={entry.name}
        className={linkClass}
      >
        {content}
      </a>
    );
  }

  return (
    <span className={linkClass} title={entry.name}>
      {content}
    </span>
  );
}
