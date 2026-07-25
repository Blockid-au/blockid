import type { HTMLAttributes } from "react";
import {
  loadPartnersConfig,
  resolveGroup,
  type NormalisedPartner,
  type PartnerGroupKey,
} from "./partners-types";

/**
 * TrustStrip — sponsor / accelerator / investor logo row for the lux hero.
 *
 * Reads from web/config/marketing-partners.json at request time. Renders
 * NOTHING when the config file is missing OR the resolved group is empty —
 * never fabricate affiliations. See partners-types.ts for the guardrail.
 */

interface TrustStripProps extends HTMLAttributes<HTMLDivElement> {
  /** Curator group to render. Omit to fall back to legacy `investors` array. */
  group?: PartnerGroupKey;
}

export function TrustStrip({ className = "", group, ...rest }: TrustStripProps) {
  const config = loadPartnersConfig();
  const resolved = resolveGroup(config, group, "investors", "Working with");
  if (!resolved) return null;

  return (
    <div className={className} {...rest}>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-brand-ink-muted">
        {resolved.label ?? "Working with"}
      </p>
      <ul
        className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12"
        aria-label={`${resolved.label ?? "Partner"} logos`}
      >
        {resolved.entries.map((entry) => (
          <li key={entry.name}>
            <TrustTile entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrustTile({ entry }: { entry: NormalisedPartner }) {
  const tileClass = [
    "inline-flex h-10 items-center justify-center rounded-md",
    "border border-white/5 bg-white/[0.02] px-5",
    "text-sm font-medium tracking-wide text-brand-ink/60",
    "opacity-60 grayscale transition duration-300",
    "hover:opacity-100 hover:text-brand-ink hover:grayscale-0",
    "focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2",
    "focus-visible:ring-offset-brand-navy",
  ].join(" ");

  const inner =
    entry.src !== null ? (
      <img
        src={entry.src}
        alt={entry.alt}
        loading="lazy"
        decoding="async"
        className="h-6 w-auto max-w-[140px]"
      />
    ) : (
      <span>{entry.name}</span>
    );

  if (entry.href) {
    return (
      <a
        href={entry.href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={entry.alt}
        title={entry.name}
        className={tileClass}
      >
        {inner}
      </a>
    );
  }

  return (
    <span className={tileClass} title={entry.name}>
      {inner}
    </span>
  );
}
