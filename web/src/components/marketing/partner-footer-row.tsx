// PartnerFooterRow — small monochrome logo strip for both footers.
//
// Renders NOTHING when the curator config is missing or the resolved group is
// empty. Uses currentColor SVGs so it inherits ink from whichever surface it
// lands on (site/footer.tsx dark ink, marketing-footer.tsx lux ink).

import {
  loadPartnersConfig,
  resolveGroup,
  type NormalisedPartner,
  type PartnerGroupKey,
} from "@/components/landing/partners-types";

interface PartnerFooterRowProps {
  /** Curator group to render. Defaults to `accepted`. */
  group?: PartnerGroupKey;
  className?: string;
}

export function PartnerFooterRow({
  group = "accepted",
  className = "",
}: PartnerFooterRowProps) {
  const config = loadPartnersConfig();
  const resolved = resolveGroup(config, group, "partners", "Accepted into");
  if (!resolved) return null;

  return (
    <div
      className={`flex flex-col items-center gap-3 py-6 sm:flex-row sm:justify-center sm:gap-6 ${className}`.trim()}
      aria-label={resolved.label ?? "Partner logos"}
    >
      {resolved.label ? (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-70">
          {resolved.label}
        </p>
      ) : null}
      <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
        {resolved.entries.map((entry) => (
          <li key={entry.name}>
            <FooterTile entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FooterTile({ entry }: { entry: NormalisedPartner }) {
  const tileClass = [
    "inline-flex items-center justify-center rounded",
    "opacity-60 transition-opacity duration-200 hover:opacity-100",
    "focus-visible:outline-none focus-visible:ring-2",
    "focus-visible:ring-current focus-visible:ring-offset-2",
    "focus-visible:ring-offset-transparent",
  ].join(" ");

  const inner =
    entry.src !== null ? (
      <img
        src={entry.src}
        alt={entry.alt}
        loading="lazy"
        decoding="async"
        className="h-5 w-auto max-w-[110px]"
      />
    ) : (
      <span className="text-xs font-semibold tracking-wide">{entry.name}</span>
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
