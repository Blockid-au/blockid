// Trust strip — reads from web/config/marketing-partners.json at build time.
//
// Rendering rule: if the config file is missing OR the `partners` array is
// empty (no verified partnership yet), the component renders NOTHING. Never
// fabricate affiliations — the user has explicitly asked that unverified
// partner logos (Startmate/Antler/BlueChilli/Stone & Chalk/Cicada/AWS for
// Startups) never appear here. Fill the config once partnerships are real.

import { readFileSync } from "node:fs";
import { join } from "node:path";

interface PartnersConfig {
  headline?: string;
  partners: string[];
}

function loadPartners(): PartnersConfig | null {
  try {
    const path = join(process.cwd(), "config", "marketing-partners.json");
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as PartnersConfig;
    if (!Array.isArray(parsed.partners) || parsed.partners.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function LogoCloud() {
  const config = loadPartners();
  if (!config) return null;
  const headline = config.headline ?? "Working with";

  return (
    <section
      aria-labelledby="logo-cloud-title"
      className="border-y border-surface-200 bg-surface-100"
    >
      <div className="mx-auto max-w-7xl px-6 py-12">
        <p
          id="logo-cloud-title"
          className="text-center text-xs uppercase tracking-[0.2em] text-ink-600 font-medium"
        >
          {headline}
        </p>
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 md:grid-cols-6 items-center">
          {config.partners.map((name) => (
            <li
              key={name}
              className="text-center text-sm md:text-base font-semibold tracking-tight text-ink-600 opacity-60 transition-opacity duration-200 hover:opacity-100 hover:text-ink-800"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
