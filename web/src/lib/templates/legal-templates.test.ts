import { describe, it, expect, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

import {
  LEGAL_TEMPLATES,
  getTemplate,
  listTemplates,
  applySubstitutions,
} from "./legal-templates";

describe("LEGAL_TEMPLATES registry", () => {
  it("exposes each shipped template file on disk", () => {
    for (const tpl of LEGAL_TEMPLATES) {
      const abs = path.join(
        process.cwd(),
        tpl.file_path.replace(/^web\//, ""),
      );
      expect(existsSync(abs), `${tpl.slug} → ${abs}`).toBe(true);
    }
  });

  it("uses unique slugs and known categories", () => {
    const slugs = LEGAL_TEMPLATES.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const tpl of LEGAL_TEMPLATES) {
      expect(["corporate", "employment", "fundraising"]).toContain(
        tpl.category,
      );
      expect(tpl.disclaimer).toMatch(/NOT LEGAL ADVICE/i);
      expect(tpl.sources.length).toBeGreaterThan(0);
    }
  });
});

describe("au-employment-contract template", () => {
  const tpl = getTemplate("au-employment-contract");

  it("is registered", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("employment");
    expect(tpl?.phase_slug).toBe("phase-8");
    expect(listTemplates().some((t) => t.slug === "au-employment-contract"))
      .toBe(true);
  });

  it("declares the Fair Work anchors reviewers need", () => {
    const abs = path.join(
      process.cwd(),
      (tpl?.file_path ?? "").replace(/^web\//, ""),
    );
    const body = readFileSync(abs, "utf8");
    // NES + Award-slot are the two things a naive US template would miss.
    expect(body).toMatch(/National Employment Standards/);
    expect(body).toMatch(/Modern Award/);
    expect(body).toMatch(/Fair Work Act 2009/);
    // Superannuation guarantee reference — required for any AU contract.
    expect(body).toMatch(/Superannuation Guarantee/);
    // Div-8 IP-assignment carve-out (this is the reason we don't just link to LawPath).
    expect(body).toMatch(/moral rights/i);
  });

  it("declares every placeholder that appears in the body", () => {
    const abs = path.join(
      process.cwd(),
      (tpl?.file_path ?? "").replace(/^web\//, ""),
    );
    const body = readFileSync(abs, "utf8");
    const tokenRe = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const inBody = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(body)) !== null) inBody.add(m[1]);
    // Strip section-toggle tokens like {{#employment_type_casual}} — those
    // are registered by having their `_casual` variant surfaced separately.
    const sectionRe = /\{\{#([a-zA-Z0-9_]+)\}\}/g;
    const sections = new Set<string>();
    while ((m = sectionRe.exec(body)) !== null) sections.add(m[1]);
    const declared = new Set(tpl?.placeholders ?? []);
    for (const token of inBody) {
      if (sections.has(token)) continue;
      expect(declared.has(token), `undeclared {{${token}}}`).toBe(true);
    }
  });

  it("substitutes placeholders + honours section toggles", () => {
    const source = [
      "Employer: {{company_name}} Pty Ltd (ACN {{acn}})",
      "{{#employment_type_casual}}CASUAL LOADING APPLIES{{/employment_type_casual}}",
      "{{#employment_type_casual}}NOT SHOWN{{/employment_type_casual}}",
    ].join("\n");
    const withCasual = applySubstitutions(source, {
      company_name: "Acme",
      acn: "659 615 111",
      employment_type_casual: "true",
    });
    expect(withCasual).toContain("Employer: Acme Pty Ltd (ACN 659 615 111)");
    expect(withCasual).toContain("CASUAL LOADING APPLIES");

    const withoutCasual = applySubstitutions(source, {
      company_name: "Acme",
      acn: "659 615 111",
    });
    expect(withoutCasual).not.toContain("CASUAL LOADING APPLIES");
    expect(withoutCasual).not.toContain("NOT SHOWN");
  });
});

describe("au-pty-ltd-constitution template", () => {
  const tpl = getTemplate("au-pty-ltd-constitution");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-1 corporate template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("corporate");
    expect(tpl?.phase_slug).toBe("phase-1");
    expect(listTemplates().some((t) => t.slug === "au-pty-ltd-constitution"))
      .toBe(true);
  });

  it("declares the Corporations Act anchors reviewers need", () => {
    // s136 = adoption power; s135 = displaced replaceable rules; s140 = contract effect.
    expect(body).toMatch(/section 136|s136/i);
    expect(body).toMatch(/s135/);
    expect(body).toMatch(/s140/);
    // s254T solvency test — required before dividend declarations.
    expect(body).toMatch(/s254T/);
    // Drag/tag + pre-emptive rights are the raise-blocking clauses investors expect.
    expect(body).toMatch(/[Dd]rag-along/);
    expect(body).toMatch(/[Tt]ag-along/);
    expect(body).toMatch(/[Pp]re-emptive/);
    // Proprietary company scope — the reason this template exists (vs Pty replaceable rules).
    expect(body).toMatch(/[Pp]roprietary company limited by shares/);
    // AFSL disclaimer must appear at the top.
    expect(body).toMatch(/NOT LEGAL ADVICE/);
  });

  it("declares every placeholder that appears in the body", () => {
    const tokenRe = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const inBody = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(body)) !== null) inBody.add(m[1]);
    const sectionRe = /\{\{#([a-zA-Z0-9_]+)\}\}/g;
    const sections = new Set<string>();
    while ((m = sectionRe.exec(body)) !== null) sections.add(m[1]);
    const declared = new Set(tpl?.placeholders ?? []);
    for (const token of inBody) {
      if (sections.has(token)) continue;
      expect(declared.has(token), `undeclared {{${token}}}`).toBe(true);
    }
  });

  it("substitutes the drag threshold + honours casting-vote variant", () => {
    const rendered = applySubstitutions(body, {
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      adoption_date: "1 July 2026",
      share_classes: "Ordinary + Seed Preferred",
      first_directors: "Alice Founder; Bob Founder",
      first_director_signature_name: "Alice Founder",
      drag_along_threshold: "75",
      reserved_matter_threshold: "75",
      debt_ceiling: "500,000",
      casting_vote_yes: "true",
      revision_date: "2026-07-24",
    });
    expect(rendered).toContain("Acme Innovation Pty Ltd");
    expect(rendered).toContain("ACN:** 659 615 111");
    // Drag threshold token substitutes into the drag clause.
    expect(rendered).toMatch(/at least \*\*75%\*\*/);
    // Casting-vote-YES variant kept; NO variant stripped.
    // The template has two same-numbered "8.7 Casting vote" headings — one
    // enabled variant, one disabled. Only the enabled body must survive.
    expect(rendered).not.toMatch(/casting_vote_no/);
  });
});

describe("au-esop-scheme-rules template", () => {
  const tpl = getTemplate("au-esop-scheme-rules");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-8 employment template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("employment");
    expect(tpl?.phase_slug).toBe("phase-8");
    expect(listTemplates().some((t) => t.slug === "au-esop-scheme-rules"))
      .toBe(true);
  });

  it("declares the Div 83A anchors the checker validates against", () => {
    // The eight-point qualifying set from startup-journey.ts:621-641 all live
    // in Division 83A ITAA97; the scheme rules must cite the specific
    // subsections the ATO looks for during an ESS audit.
    expect(body).toMatch(/Division 83A/);
    expect(body).toMatch(/Subdivision 83A-B/);
    expect(body).toMatch(/Subdivision 83A-C/);
    // Interest-condition anchors — Exercise Price ≥ FMV, 3-year hold, 75% test.
    expect(body).toMatch(/s83A-33/);
    // Company-condition anchors — unlisted, <10y old, ≤A$50m turnover, AU tax resident.
    expect(body).toMatch(/s83A-45/);
    // 10-year Options expiry cap (s83A-33(1)(d)) and 10% shareholding cap
    // (s83A-45(6)) are the two hard numeric limits the checker enforces.
    expect(body).toMatch(/10 years/);
    expect(body).toMatch(/10%/);
    // A$50m aggregated-turnover ceiling — the raise-blocking one investors
    // will ask about at Phase 8-9.
    expect(body).toMatch(/A\$50 million/);
    // Real-risk-of-forfeiture language keys ITAA97 s83A-105(6).
    expect(body).toMatch(/real risk of forfeiture/i);
    // Good Leaver / Bad Leaver split is what makes this AU scheme investor-defensible.
    expect(body).toMatch(/Good Leaver/);
    expect(body).toMatch(/Bad Leaver/);
    // Reserve pool + refresh mechanics — the reason we mint vs link out.
    expect(body).toMatch(/Reserve Pool/);
    // Corps Act disclosure relief pathway — Chapter 6D + ASIC Instrument 2022/1021.
    expect(body).toMatch(/Chapter 6D/);
    expect(body).toMatch(/2022\/1021/);
    // AFSL disclaimer at top-of-doc.
    expect(body).toMatch(/NOT LEGAL ADVICE/);
  });

  it("declares every placeholder that appears in the body", () => {
    const tokenRe = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const inBody = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(body)) !== null) inBody.add(m[1]);
    const sectionRe = /\{\{#([a-zA-Z0-9_]+)\}\}/g;
    const sections = new Set<string>();
    while ((m = sectionRe.exec(body)) !== null) sections.add(m[1]);
    const declared = new Set(tpl?.placeholders ?? []);
    for (const token of inBody) {
      if (sections.has(token)) continue;
      expect(declared.has(token), `undeclared {{${token}}}`).toBe(true);
    }
  });

  it("substitutes scheme identity fields and preserves unknown tokens", () => {
    const rendered = applySubstitutions(body, {
      scheme_name: "Acme ESOP 2026",
      company_name: "Acme Innovation",
      acn: "659 615 111",
      adoption_date: "1 July 2026",
      reserve_pool_pct: "10",
      default_cliff_months: "12",
      default_vest_months: "48",
      revision_date: "2026-07-24",
    });
    // Scheme identity is what investors read first on the cover page.
    expect(rendered).toContain("Acme ESOP 2026");
    expect(rendered).toContain("Acme Innovation Pty Ltd");
    expect(rendered).toContain("ACN 659 615 111");
    // Reserve-pool percentage substitutes into the clause 3.1 sentence.
    expect(rendered).toMatch(/\*\*10%\*\*/);
    // Cliff / vest months substitute into the definitions block.
    expect(rendered).toContain("default 12 months");
    // Absent value → token must be left intact so the founder can see the gap.
    const missing = applySubstitutions(body, { company_name: "Acme" });
    expect(missing).toContain("{{scheme_name}}");
  });
});

describe("au-safe template", () => {
  const tpl = getTemplate("au-safe");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-9 fundraising template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("fundraising");
    expect(tpl?.phase_slug).toBe("phase-9");
    expect(listTemplates().some((t) => t.slug === "au-safe")).toBe(true);
  });

  it("declares the AU-specific anchors that differentiate it from a US YC SAFE", () => {
    // Governing law is NSW, not Delaware — the whole point of this mint vs a link-out.
    expect(body).toMatch(/New South Wales/);
    // Corporations Act refs replace Delaware GCL — sophisticated + professional investor tests.
    expect(body).toMatch(/s708\(8\)/);
    expect(body).toMatch(/s708\(11\)/);
    // s254T solvency test guards the Dissolution Event payout.
    expect(body).toMatch(/s254T/);
    // s127 execution block — investors expect this signing convention on AU deeds.
    expect(body).toMatch(/s127/);
    // Chapter 6D disclosure regime (the reason wholesale-only reps matter).
    expect(body).toMatch(/Chapter 6D/);
    // GST + stamp-duty clauses — the two AU tax carve-outs absent from a YC SAFE.
    expect(body).toMatch(/GST/);
    expect(body).toMatch(/[Ss]tamp duty/);
    // Electronic Transactions Act — AU e-signing anchor.
    expect(body).toMatch(/Electronic Transactions Act/);
    // AFSL disclaimer must be prominent (the top-of-doc warning).
    expect(body).toMatch(/NOT LEGAL ADVICE/);
    // ACICA / mediation-first dispute resolution seated in Sydney.
    expect(body).toMatch(/ACICA/);
  });

  it("declares every placeholder that appears in the body", () => {
    const tokenRe = /\{\{([a-zA-Z0-9_]+)\}\}/g;
    const inBody = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = tokenRe.exec(body)) !== null) inBody.add(m[1]);
    const sectionRe = /\{\{#([a-zA-Z0-9_]+)\}\}/g;
    const sections = new Set<string>();
    while ((m = sectionRe.exec(body)) !== null) sections.add(m[1]);
    const declared = new Set(tpl?.placeholders ?? []);
    for (const token of inBody) {
      if (sections.has(token)) continue;
      expect(declared.has(token), `undeclared {{${token}}}`).toBe(true);
    }
  });

  it("substitutes purchase + cap fields and keeps only the selected variant", () => {
    const rendered = applySubstitutions(body, {
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      investor_name: "Angel Alice",
      investor_address: "Melbourne VIC 3000",
      investor_abn: "12 345 678 901",
      purchase_amount_aud: "250,000",
      valuation_cap_aud: "5,000,000",
      discount_rate: "20",
      issue_date: "1 July 2026",
      governing_state: "New South Wales",
      variant_cap_and_discount: "true",
      revision_date: "2026-07-24",
    });
    // Header + parties render with concrete amounts, not raw tokens.
    expect(rendered).toContain("A$250,000");
    expect(rendered).toContain("A$5,000,000");
    expect(rendered).toContain("Acme Innovation Pty Ltd");
    // Only the cap+discount variant heading survives — cap-only and
    // discount-only variant bodies must be stripped.
    expect(rendered).toMatch(/Variant selected: \*\*Valuation Cap and Discount\*\*/);
    expect(rendered).not.toMatch(/Variant selected: \*\*Valuation Cap Only\*\*/);
    expect(rendered).not.toMatch(/Variant selected: \*\*Discount Only\*\*/);
    // Section-toggle tokens must not leak into rendered output.
    expect(rendered).not.toMatch(/variant_cap_only/);
    expect(rendered).not.toMatch(/variant_discount_only/);
  });
});
