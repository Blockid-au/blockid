// S8-A: every funding title ≤ 60 chars, every description 140–160, no
// duplicate titles across the 53 indexable grants + 199 programs, and the
// capital pages name their satellite cities. Runs over the real seed files
// so a new row that breaks the window fails here, not in Search Console.

import { describe, expect, it } from "vitest";
import grantsSeed from "../../../content/data/grants-au.seed.json";
import programsSeed from "../../../content/data/programs-au.seed.json";
import manifest from "../../../content/insights/manifest.json";
import { CAPITALS, CAPITAL_SATELLITES, capitalForCity, mapGrantSeeds, mapProgramSeeds } from "./seed-map";
import {
  DEMO_DESCRIPTION_TEXT,
  DEMO_TITLE_CORE,
  FUNDING_CRUMBS,
  FUNDING_KEYWORDS,
  GRANTS_DESCRIPTION,
  GRANTS_TITLE,
  GRANT_GUIDES,
  LANDING_DESCRIPTION,
  LANDING_TITLE,
  PROGRAMS_DESCRIPTION,
  PROGRAMS_TITLE,
  PROGRAM_GUIDES,
  capitalSeo,
  grantDescription,
  grantTitle,
  grantsStateSeo,
  guidesForGrant,
  programDescription,
  programTitle,
  satelliteList,
  stateForCapital,
} from "./seo";
import { BRAND_SUFFIX, DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from "@/lib/seo/page-meta";
import { AU_STATES } from "./seed-map";

const grants = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants).filter((g) => !g.exclude_from_matching);
const programs = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs);

const inWindow = (s: string) => s.length >= DESCRIPTION_MIN && s.length <= DESCRIPTION_MAX;

describe("funding SEO — seed coverage", () => {
  it("the seeds carry 56 grants (3 excluded from matching → 53 indexable) and 199 programs", () => {
    expect((grantsSeed as { grants: unknown[] }).grants).toHaveLength(56);
    expect(grants).toHaveLength(53);
    expect(programs).toHaveLength(199);
  });
});

describe("grant detail titles + descriptions", () => {
  it("every title is ≤ 60 chars, carries the state or 'Australia' (plus the funding noun when it fits), and is unique", () => {
    const titles = grants.map(grantTitle);
    for (const [i, t] of titles.entries()) {
      expect(t.length, `${grants[i].id}: "${t}"`).toBeLessThanOrEqual(TITLE_MAX);
      expect(t, grants[i].id).toMatch(/ — (Australia|NSW|Victoria|Queensland|WA|South Australia|Tasmania|ACT|NT)( |$)/);
      expect(t, grants[i].id).not.toContain("undefined");
    }
    expect(new Set(titles).size, "duplicate grant titles").toBe(titles.length);
  });

  it("RDTI and ESIC titles carry their searched-for names", () => {
    const rdti = grants.find((g) => g.id === "rdti")!;
    const esic = grants.find((g) => g.id === "esic")!;
    expect(grantTitle(rdti)).toMatch(/R&D Tax Incentive/i);
    expect(grantTitle(rdti)).toContain("tax incentive");
    expect(grantTitle(esic)).toMatch(/ESIC/);
    expect(FUNDING_KEYWORDS.rdti).toBe("r&d tax incentive startup");
  });

  it("every description is 140–160 chars, never the bare summary, and names the grant", () => {
    for (const g of grants) {
      const d = grantDescription(g);
      expect(inWindow(d), `${g.id}: ${d.length} "${d}"`).toBe(true);
      expect(d).not.toBe(g.summary);
      expect(d.startsWith(g.name.slice(0, 20)), g.id).toBe(true);
      expect(d).not.toMatch(/undefined|null|NaN/);
    }
  });

  it("guides: R&D / tax-offset rows lead with the RDTI guide; every guide slug exists in the insights manifest", () => {
    const slugs = new Set((manifest as { articles?: { slug: string }[] }).articles?.map((a) => a.slug) ?? []);
    for (const c of [...GRANT_GUIDES, ...PROGRAM_GUIDES]) expect(slugs.has(c.slug), c.slug).toBe(true);
    const rdti = grants.find((g) => g.id === "rdti")!;
    expect(guidesForGrant(rdti)[0].slug).toBe("r-and-d-tax-incentive-startups-australia");
    const esic = grants.find((g) => g.id === "esic")!;
    expect(guidesForGrant(esic)[0].slug).toBe("esic-and-rnd-tax-incentive-guide-2026");
  });
});

describe("program detail titles + descriptions", () => {
  it("every title is ≤ 60 chars, ends with the city + state (Remote: '— online …'), and is unique", () => {
    const titles = programs.map(programTitle);
    for (const [i, t] of titles.entries()) {
      const p = programs[i];
      expect(t.length, `${p.id}: "${t}"`).toBeLessThanOrEqual(TITLE_MAX);
      if (p.capital === "Remote") expect(t, p.id).toMatch(/ — online/);
      else if (p.state === "national") expect(t, p.id).toMatch(new RegExp(` ${p.city}$`));
      else expect(t, p.id).toMatch(new RegExp(` ${p.city}, ${p.state}$`));
      expect(t, p.id).not.toContain("undefined");
    }
    expect(new Set(titles).size, "duplicate program titles").toBe(titles.length);
  });

  it("every description is 140–160 chars and names the program", () => {
    for (const p of programs) {
      const d = programDescription(p);
      expect(inWindow(d), `${p.id}: ${d.length} "${d}"`).toBe(true);
      expect(d.startsWith(p.name.slice(0, 20)), p.id).toBe(true);
      expect(d).not.toMatch(/undefined|null|NaN/);
    }
  });

  it("satellite cities in the seed all resolve to their capital, and the seed cities are all covered", () => {
    for (const cap of CAPITALS) {
      for (const city of CAPITAL_SATELLITES[cap]) expect(capitalForCity(city), city).toBe(cap);
    }
    const nonCapitalCities = new Set(programs.map((p) => p.city).filter((c) => !(CAPITALS as readonly string[]).includes(c)));
    const covered = new Set(Object.values(CAPITAL_SATELLITES).flat().map((c) => c.toLowerCase()));
    for (const c of nonCapitalCities) {
      expect(covered.has(c.toLowerCase()) || c.toLowerCase() === "regional qld", c).toBe(true);
    }
  });
});

describe("directory + capital + landing metadata", () => {
  it("static titles fit the template budget and descriptions the window", () => {
    for (const t of [GRANTS_TITLE, PROGRAMS_TITLE, LANDING_TITLE, DEMO_TITLE_CORE]) {
      expect(`${t}${BRAND_SUFFIX}`.length, t).toBeLessThanOrEqual(TITLE_MAX);
    }
    for (const d of [GRANTS_DESCRIPTION, PROGRAMS_DESCRIPTION, LANDING_DESCRIPTION, DEMO_DESCRIPTION_TEXT]) {
      expect(inWindow(d), `${d.length} "${d}"`).toBe(true);
    }
    expect(GRANTS_TITLE.toLowerCase()).toContain("startup grants");
    expect(PROGRAMS_TITLE.toLowerCase()).toContain("accelerators");
    expect(LANDING_TITLE.toLowerCase()).toContain("startup funding");
  });

  it("every capital page: title ≤ 60 with brand, description in window, Brisbane names Gold Coast + Sunshine Coast + Regional Queensland", () => {
    const titles = new Set<string>();
    for (const cap of CAPITALS) {
      const s = capitalSeo(cap);
      expect(`${s.title}${BRAND_SUFFIX}`.length, `${cap}: "${s.title}"`).toBeLessThanOrEqual(TITLE_MAX);
      expect(inWindow(s.description), `${cap}: ${s.description.length} "${s.description}"`).toBe(true);
      expect(s.h1.toLowerCase(), cap).toContain("accelerators");
      titles.add(s.title);
      if (cap === "Remote") {
        expect(s.coverage).toBeNull();
        expect(s.title.toLowerCase()).toContain("online");
      } else {
        expect(s.title).toContain(cap);
      }
    }
    expect(titles.size).toBe(CAPITALS.length);
    const bris = capitalSeo("Brisbane");
    expect(bris.description).toContain("Gold Coast");
    expect(bris.description).toContain("Sunshine Coast");
    expect(bris.coverage).toContain("Gold Coast, Sunshine Coast and Regional Queensland");
    expect(bris.coverage).toContain("Queensland startup ecosystem");
    expect(satelliteList("Perth")).toBe("");
    expect(capitalSeo("Perth").coverage).toBeNull();
    expect(satelliteList("Hobart")).toBe("Launceston");
    expect(stateForCapital("Brisbane")).toBe("QLD");
  });

  it("every state filter view has its own ≤ 60 title, H1 and 140–160 description", () => {
    const titles = new Set<string>();
    for (const st of AU_STATES) {
      const s = grantsStateSeo(st);
      expect(`${s.title}${BRAND_SUFFIX}`.length, `${st}: "${s.title}"`).toBeLessThanOrEqual(TITLE_MAX);
      expect(inWindow(s.description), `${st}: ${s.description.length} "${s.description}"`).toBe(true);
      expect(s.h1.toLowerCase()).toContain("startup grants");
      titles.add(s.title);
    }
    expect(titles.size).toBe(AU_STATES.length);
    expect(grantsStateSeo("NSW").title).toBe("NSW startup grants open right now");
    expect(grantsStateSeo("QLD").title).toContain("Queensland startup grants");
    expect(FUNDING_KEYWORDS.grantsState("VIC")).toBe("Victoria startup grants");
  });

  it("breadcrumb trails start at Home and end on the current page", () => {
    const g = grants[0];
    const p = programs[0];
    expect(FUNDING_CRUMBS.grant(g).at(-1)?.href).toBe(`/funding/grants/${g.id}`);
    expect(FUNDING_CRUMBS.program(p).at(-1)?.href).toBe(`/funding/programs/${p.capital.toLowerCase()}/${p.id}`);
    expect(FUNDING_CRUMBS.program(p)[3].href).toBe(`/funding/programs/${p.capital.toLowerCase()}`);
    expect(FUNDING_CRUMBS.demo.at(-1)?.href).toBe("/funding/report/demo");
    expect(FUNDING_CRUMBS.capital("Remote")[3].name).toBe("Australia-wide / online");
  });
});
