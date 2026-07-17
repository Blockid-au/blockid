import type { HTMLAttributes } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TrustStrip — investor/accelerator logo row for the luxury hero.
 *
 * Reads from web/config/marketing-partners.json at request time. If the
 * config file is missing OR the `investors` array is empty, the strip
 * renders NOTHING — never fabricate affiliations. User has explicitly
 * asked that unverified partner logos never appear on the landing page.
 */

interface PartnersConfig {
  investors_headline?: string;
  investors?: string[];
}

function loadInvestors(): PartnersConfig | null {
  try {
    const path = join(process.cwd(), "config", "marketing-partners.json");
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as PartnersConfig;
    if (!Array.isArray(parsed.investors) || parsed.investors.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

type TrustStripProps = HTMLAttributes<HTMLDivElement>;

export function TrustStrip({ className = "", ...rest }: TrustStripProps) {
  const config = loadInvestors();
  if (!config?.investors) return null;
  const headline = config.investors_headline ?? "Working with";

  return (
    <div className={className} {...rest}>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-brand-ink-muted">
        {headline}
      </p>
      <ul
        className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12"
        aria-label="Verified partner logos"
      >
        {config.investors.map((name) => (
          <li key={name}>
            <span
              className="inline-flex h-10 items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-5 text-sm font-medium tracking-wide text-brand-ink/60 opacity-60 grayscale transition duration-300 hover:opacity-100 hover:text-brand-ink hover:grayscale-0"
              title={name}
            >
              {name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
