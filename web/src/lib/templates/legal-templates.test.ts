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
      expect([
        "corporate",
        "employment",
        "fundraising",
        "ip",
        "commercial",
      ]).toContain(tpl.category);
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


describe("au-ip-assignment-deed-founder template", () => {
  const tpl = getTemplate("au-ip-assignment-deed-founder");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-1 ip template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("ip");
    expect(tpl?.phase_slug).toBe("phase-1");
    expect(listTemplates().some((t) => t.slug === "au-ip-assignment-deed-founder"))
      .toBe(true);
  });

  it("declares the AU IP-statute anchors reviewers need", () => {
    // Executed-as-deed is what makes the founder→own-company assignment
    // enforceable without consideration; must appear on the doc.
    expect(body).toMatch(/[Ee]xecuted as a deed/);
    // Copyright + Patents + Designs + Trade Marks + Circuit Layouts + PBR —
    // the six-statute stack that gives an AU company complete IP coverage.
    expect(body).toMatch(/Copyright Act 1968/);
    expect(body).toMatch(/Patents Act 1990/);
    expect(body).toMatch(/Designs Act 2003/);
    expect(body).toMatch(/Trade Marks Act 1995/);
    expect(body).toMatch(/Circuit Layouts Act 1989/);
    expect(body).toMatch(/Plant Breeder's Rights Act 1994/);
    // Retrospective-effect + trust-until-perfected — the two mechanics
    // investors' lawyers look for to close pre-incorporation IP gaps.
    expect(body).toMatch(/[Rr]etrospective/);
    expect(body).toMatch(/on trust for the Company/);
    // Moral-rights consent under s195AW / s195AWA — this is what a US
    // template misses.
    expect(body).toMatch(/section 195AW|s195AW/);
    expect(body).toMatch(/moral rights/i);
    // s127 Corporations Act execution block — the AU-standard signing convention.
    expect(body).toMatch(/section 127|s127/);
    // Electronic Transactions Act e-signing anchor — closes the "not e-signable" gap.
    expect(body).toMatch(/Electronic Transactions Act 1999/);
    // PPSR consent for any Foreground IP that is personal property.
    expect(body).toMatch(/Personal Property Securities Act 2009/);
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

  it("substitutes party fields and strips the second-director block when solo", () => {
    const rendered = applySubstitutions(body, {
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      company_business_description: "cap-table + valuation SaaS",
      founder_name: "Alice Founder",
      founder_address: "Sydney NSW 2000",
      effective_date: "1 July 2026",
      director_name: "Alice Founder",
      excluded_ip_description: "None.",
      annexure_a_disclosures: "None.",
      annexure_b_ip_description: "All source code + copy in the acme/main repo.",
      restraint_period_months: "6",
      restraint_geography: "Australia",
      restraint_scope: "SaaS cap-table tools",
      governing_state: "New South Wales",
      sole_director: "true",
      revision_date: "2026-07-24",
    });
    expect(rendered).toContain("Acme Innovation Pty Ltd");
    expect(rendered).toContain("ACN 659 615 111");
    expect(rendered).toContain("Alice Founder");
    // Sole-director variant kept, second-director block stripped.
    expect(rendered).toMatch(/Sole director/);
    expect(rendered).not.toMatch(/second_director_name/);
    // Absent value → token stays visible so the founder sees the gap.
    const missing = applySubstitutions(body, { founder_name: "Alice" });
    expect(missing).toContain("{{company_name}}");
  });
});

describe("au-ip-assignment-deed-contractor template", () => {
  const tpl = getTemplate("au-ip-assignment-deed-contractor");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-4 ip template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("ip");
    expect(tpl?.phase_slug).toBe("phase-4");
    expect(listTemplates().some((t) => t.slug === "au-ip-assignment-deed-contractor"))
      .toBe(true);
  });

  it("declares the contractor-specific anchors reviewers need", () => {
    // s35(6) is the single line that explains why this deed is necessary
    // for contractors (but not for employees).
    expect(body).toMatch(/section 35\(6\)|s35\(6\)/);
    expect(body).toMatch(/Copyright Act 1968/);
    // Foreground IP / Background IP split — the reason we don't just reuse
    // the founder template.
    expect(body).toMatch(/Foreground IP/);
    expect(body).toMatch(/Background IP/);
    // Background-IP licence must be perpetual + royalty-free + sublicensable
    // to survive the "we bought a startup that can't ship without paying its
    // old contractor" acquirer-diligence question.
    expect(body).toMatch(/perpetual/);
    expect(body).toMatch(/royalty-free/);
    expect(body).toMatch(/sublicensable/);
    // Sham-contracting representation — the Personnel Contracting / Jamsek
    // anchor that closes the "were they really a contractor?" risk.
    expect(body).toMatch(/[Ss]ham.contracting/);
    expect(body).toMatch(/Personnel Contracting|Jamsek/);
    expect(body).toMatch(/Fair Work Act 2009/);
    // Moral-rights procurement clause for contractor-as-entity (not just
    // contractor-as-individual) — closes the agency / studio case.
    expect(body).toMatch(/procure.*consent|written moral-rights consent/i);
    // s127 + Electronic Transactions Act — e-signing anchor.
    expect(body).toMatch(/section 127|s127/);
    expect(body).toMatch(/Electronic Transactions Act 1999/);
    // Deed form + AFSL disclaimer.
    expect(body).toMatch(/[Ee]xecuted as a deed/);
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

  it("honours contractor-as-entity vs contractor-as-individual toggles", () => {
    const entity = applySubstitutions(body, {
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      contractor_name: "Widget Studios Pty Ltd",
      contractor_abn: "12 345 678 901",
      contractor_address: "Melbourne VIC 3000",
      contractor_signatory_name: "Sam Studio",
      contractor_signatory_title: "Director",
      services_agreement_date: "1 June 2026",
      services_description: "Annexure B",
      effective_date: "1 July 2026",
      director_name: "Alice Founder",
      annexure_a_disclosures: "None.",
      annexure_b_deliverables_description: "Marketing site source code.",
      governing_state: "New South Wales",
      contractor_is_entity: "true",
      sole_director: "true",
      revision_date: "2026-07-24",
    });
    // Entity block present with ABN line; individual witness block stripped.
    expect(entity).toContain("Widget Studios Pty Ltd");
    expect(entity).toContain("ABN 12 345 678 901");
    expect(entity).toContain("Sam Studio");
    expect(entity).not.toMatch(/Witness signature/);

    const individual = applySubstitutions(body, {
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      contractor_name: "Frida Freelancer",
      contractor_abn: "",
      contractor_address: "Brisbane QLD 4000",
      contractor_signatory_name: "",
      contractor_signatory_title: "",
      services_agreement_date: "1 June 2026",
      services_description: "Annexure B",
      effective_date: "1 July 2026",
      director_name: "Alice Founder",
      annexure_a_disclosures: "None.",
      annexure_b_deliverables_description: "React components.",
      governing_state: "New South Wales",
      contractor_is_individual: "true",
      sole_director: "true",
      revision_date: "2026-07-24",
    });
    // Individual block present with witness line; entity ABN block stripped.
    expect(individual).toMatch(/Witness signature/);
    expect(individual).not.toMatch(/Sam Studio/);
    // Section-toggle tokens must never leak.
    expect(individual).not.toMatch(/contractor_is_entity/);
    expect(individual).not.toMatch(/contractor_is_individual/);
  });
});

describe("au-customer-loi template", () => {
  const tpl = getTemplate("au-customer-loi");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-2 commercial template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("commercial");
    expect(tpl?.phase_slug).toBe("phase-2");
    expect(listTemplates().some((t) => t.slug === "au-customer-loi")).toBe(
      true,
    );
  });

  it("declares the AU misleading-conduct anchors an investor's lawyer looks for", () => {
    // s18 ACL + s1041H Corps Act are the two statutes that make it unsafe to
    // dress a soft LOI up as committed revenue in a data room; both must be
    // named on the face of the doc.
    expect(body).toMatch(/s18/);
    expect(body).toMatch(/Australian Consumer Law/);
    expect(body).toMatch(/s1041H/);
    // Explicit non-binding + which paragraphs are binding — the reason the
    // whole document is safe to circulate.
    expect(body).toMatch(/[Nn]on-binding/);
    expect(body).toMatch(/Confidentiality/);
    // s127 execution block for the Supplier side is what makes this LOI
    // signable by an AU Pty Ltd without needing a common seal.
    expect(body).toMatch(/section 127|s127/);
    // GST tax-invoice anchor — the "amounts are exclusive of GST" clause
    // that stops the founder accidentally overstating ACV net-of-GST.
    expect(body).toMatch(/s29-70/);
    // Electronic Transactions Act — e-signing.
    expect(body).toMatch(/Electronic Transactions Act 1999/);
    // AFSL disclaimer must appear at the top of the doc.
    expect(body).toMatch(/NOT LEGAL ADVICE/);
    // Confirms binding vs non-binding paragraph split is spelled out.
    expect(body).toMatch(/legally binding/);
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

  it("substitutes party + commercial fields and honours signatory toggles", () => {
    const withCoSignatory = applySubstitutions(body, {
      customer_name: "Big Bank AU",
      customer_abn_line: "ABN 12 345 678 901",
      customer_address: "Sydney NSW 2000",
      customer_signatory_name: "Charlie Buyer",
      customer_signatory_title: "Head of Procurement",
      customer_stakeholders: "Head of Procurement; CTO; Legal Counsel",
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      director_name: "Alice Founder",
      second_signatory_name: "Bob Founder",
      second_signatory_title: "Director",
      product_name: "Acme Cap Table Cloud",
      loi_date: "1 July 2026",
      intended_use_case: "Replace legacy spreadsheet cap-table workflow.",
      indicative_acv_aud: "180,000",
      indicative_seats: "50 seats",
      preferred_start_date: "1 October 2026",
      preferred_payment_terms: "Net 30",
      target_definitive_date: "1 September 2026",
      governing_state: "New South Wales",
      acceptance_criteria: "See attached technical scope.",
      statutory_approvals: "None identified.",
      second_signatory: "true",
      revision_date: "2026-07-24",
    });
    // Commercial figures render into the ACV table.
    expect(withCoSignatory).toContain("A$180,000");
    expect(withCoSignatory).toContain("50 seats");
    expect(withCoSignatory).toContain("Big Bank AU");
    expect(withCoSignatory).toContain("Acme Innovation Pty Ltd");
    // Co-signatory block kept; sole-director block stripped.
    expect(withCoSignatory).toContain("Bob Founder");
    expect(withCoSignatory).not.toMatch(/Sole director and sole company secretary/);

    const soleDirector = applySubstitutions(body, {
      customer_name: "Small SME",
      customer_abn_line: "",
      customer_address: "Melbourne VIC 3000",
      customer_signatory_name: "Dee Owner",
      customer_signatory_title: "Owner",
      customer_stakeholders: "Owner",
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      director_name: "Alice Founder",
      product_name: "Acme Cap Table Cloud",
      loi_date: "1 July 2026",
      intended_use_case: "Track founder equity.",
      indicative_acv_aud: "6,000",
      indicative_seats: "3 seats",
      preferred_start_date: "1 August 2026",
      preferred_payment_terms: "Annual up-front",
      target_definitive_date: "1 August 2026",
      governing_state: "New South Wales",
      acceptance_criteria: "Standard onboarding.",
      statutory_approvals: "None identified.",
      sole_director: "true",
      revision_date: "2026-07-24",
    });
    // Sole-director variant kept; co-signatory block stripped.
    expect(soleDirector).toMatch(/Sole director and sole company secretary/);
    expect(soleDirector).not.toMatch(/second_signatory_name/);
    // Section-toggle names must never leak.
    expect(soleDirector).not.toMatch(/\{\{#sole_director\}\}/);
  });
});

describe("au-customer-discovery-interview-log template", () => {
  const tpl = getTemplate("au-customer-discovery-interview-log");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-2 commercial template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("commercial");
    expect(tpl?.phase_slug).toBe("phase-2");
    expect(
      listTemplates().some(
        (t) => t.slug === "au-customer-discovery-interview-log",
      ),
    ).toBe(true);
  });

  it("declares the APP + misleading-conduct anchors an investor's lawyer looks for", () => {
    // Privacy Act 1988 + APPs — informed-consent block sits on top of the
    // interview capture, so an investor / OAIC auditor can trace the chain.
    expect(body).toMatch(/Privacy Act 1988/);
    expect(body).toMatch(/Australian Privacy Principles/);
    // The specific APPs the log invokes (collection notice, use, storage,
    // access, correction).
    expect(body).toMatch(/APP\s?1/);
    expect(body).toMatch(/APP\s?5/);
    expect(body).toMatch(/APP\s?11/);
    expect(body).toMatch(/APP\s?12/);
    expect(body).toMatch(/APP\s?13/);
    // Misleading-conduct guardrails: this is the difference between a
    // discovery log and a raise-safe evidence artefact.
    expect(body).toMatch(/s18/);
    expect(body).toMatch(/Australian Consumer Law/);
    expect(body).toMatch(/s1041H/);
    // Mom-Test past-behaviour discipline — the reason we mint this rather
    // than let founders freestyle a Google Doc.
    expect(body).toMatch(/[Mm]om.?[Tt]est/);
    expect(body).toMatch(/past.?behaviour|past behaviour|past-behaviour/i);
    // AFSL / not-legal-advice disclaimer at the top of the doc.
    expect(body).toMatch(/NOT LEGAL ADVICE/);
    // Compensation-disclosure guardrail — if founder paid the interviewee
    // they must disclose that alongside every quote used in an investor
    // pack, or the artefact becomes misleading under s18 ACL.
    expect(body).toMatch(/[Cc]ompensation offered/);
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

  it("renders the recording-consent branch matrix and never leaks section-toggle tokens", () => {
    const base: Record<string, string> = {
      interviewer_name: "Alice Founder",
      interviewer_email: "alice@example.com.au",
      company_name: "Acme Innovation",
      acn: "659 615 111",
      product_hypothesis:
        "AU seed-stage founders will pay A$99/mo to auto-generate raise-ready data rooms.",
      interview_number: "3 of 5",
      interview_date: "12 July 2026",
      interview_channel: "Zoom video call",
      current_workflow_short: "cap-table + investor updates",
      consent_written_log: "Yes — verbal consent recorded 00:00-00:45",
      consent_named_reference: "Yes — attributed as name + role",
      consent_verbatim_quote: "Yes — with approval before publication",
      consent_recording_response: "Yes",
      recording_storage_location: "Google Drive — Founders/Discovery/2026Q3",
      interviewee_name: "Charlie Buyer",
      interviewee_role: "Head of Ops",
      interviewee_company: "Big Bank AU",
      interviewee_company_abn_line: "ABN 12 345 678 901",
      interviewee_email: "charlie@bigbank.example",
      sourcing_channel: "Warm intro via mutual investor",
      prior_relationship: "None",
      compensation_offered: "None",
      last_time_prompt: "prepare a monthly investor update for your board",
      answer_past_behaviour:
        "Two Sundays ago I spent 4 hours copying numbers from Xero into Google Slides.",
      answer_current_workflow: "Xero export → Google Sheets → Google Slides.",
      pain_frequency_words: "Every month, right before the board meeting.",
      pain_frequency_normalised: "Monthly",
      pain_time_words: "Half a Sunday, so 4 hours.",
      pain_time_hours: "4",
      pain_cost_words: "About my Sunday afternoon, times twelve.",
      pain_cost_estimate_aud: "12,000",
      pain_rating_words: "It's a 7 — annoying but survivable.",
      pain_rating: "7",
      answer_prior_attempts:
        "Tried Fathom last year — cancelled after 3 months because setup was too heavy.",
      answer_purchase_authority: "Me plus the CFO; no procurement below A$5k.",
      answer_willingness_to_test:
        "Happy to try a 2-week pilot with real Xero data.",
      pilot_scope: "2-week Xero-live pilot",
      pilot_start_date: "1 August 2026",
      pricing_unit: "user per month",
      answer_price_indication: "A$50/user/month feels fair for a team of 8.",
      quote_1:
        "I would pay real money to never open Google Slides for the board pack again.",
      quote_1_context: "Answering 3.6, unprompted",
      quote_2: "The blocker is Xero categorisation, not the slide design.",
      quote_2_context: "Answering 3.2",
      quote_3: "Yes I'd pilot it — send me a Calendly.",
      quote_3_context: "End of interview, on record",
      signal_specific_past: "Present",
      signal_specific_past_evidence: "Named a specific Sunday two weeks ago.",
      signal_prior_spend: "Present",
      signal_prior_spend_evidence: "Paid for Fathom for 3 months.",
      signal_introduction: "Present",
      signal_introduction_evidence:
        "Volunteered to intro CFO at Big Bank + peer at Small Bank.",
      signal_budget_line: "Present",
      signal_budget_line_evidence:
        "Named delegated authority up to A$5k without procurement.",
      red_flag_hypothetical: "Absent",
      red_flag_hypothetical_evidence:
        "Every answer referenced a specific past event.",
      red_flag_leading: "Absent",
      red_flag_leading_evidence:
        "Open past-behaviour questions only; no product features named until 3.6.",
      confidence_level: "Partially validated",
      followup_evidence_needed:
        "2 more interviews with founders running >A$1M ARR to test upmarket boundary",
      pivot_direction: "n/a",
      followup_commitment: "Send pilot proposal + Calendly link",
      followup_date: "18 July 2026",
      storage_location: "Google Drive — Founders/Discovery/2026Q3 (RBAC)",
      retention_period_days: "365",
      access_control_list:
        "Alice Founder (interviewer); Bob Founder (co-founder); Legal Counsel",
      sample_size_context: "n = 5 discovery interviews to date",
      reviewer_name: "Bob Founder",
      reviewer_date: "13 July 2026",
      governing_state: "New South Wales",
      revision_date: "2026-07-24",
      recording_consent_yes: "true",
      willing_to_pilot: "true",
    };
    const withRecording = applySubstitutions(body, base);
    // Recording-yes branch kept; recording-no branch stripped.
    expect(withRecording).toMatch(/verifiable consent to\s+audio recording/);
    expect(withRecording).not.toMatch(/No audio or video recording was made/);
    // Verbatim commercial + party fields render into the body.
    expect(withRecording).toContain("Charlie Buyer");
    expect(withRecording).toContain("Big Bank AU");
    expect(withRecording).toContain("Acme Innovation Pty Ltd");
    expect(withRecording).toContain("A$12,000");
    expect(withRecording).toContain("7 / 10");
    expect(withRecording).toContain("2-week Xero-live pilot");
    // Section-toggle names must never leak into the rendered doc.
    expect(withRecording).not.toMatch(/\{\{#recording_consent_yes\}\}/);
    expect(withRecording).not.toMatch(/\{\{#willing_to_pilot\}\}/);

    // Flip to the no-recording branch and confirm the language flips too.
    const noRecording = applySubstitutions(body, {
      ...base,
      recording_consent_yes: "false",
      recording_consent_no: "true",
      willing_to_pilot: "false",
      disconfirmed_hypothesis: "true",
    });
    expect(noRecording).toMatch(/No audio or video recording was made/);
    expect(noRecording).not.toMatch(/verifiable consent to\s+audio recording/);
    // Pilot block stripped; disconfirmation block kept.
    expect(noRecording).not.toMatch(/Pilot commitment captured/);
    expect(noRecording).toMatch(/Disconfirmation note/);
    // Confirm section-toggle tokens never appear either way.
    expect(noRecording).not.toMatch(/\{\{#recording_consent_no\}\}/);
    expect(noRecording).not.toMatch(/\{\{#disconfirmed_hypothesis\}\}/);
  });
});

describe("au-ga4-measurement-plan template", () => {
  const tpl = getTemplate("au-ga4-measurement-plan");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-7 commercial template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.category).toBe("commercial");
    expect(tpl?.phase_slug).toBe("phase-7");
    expect(
      listTemplates().some((t) => t.slug === "au-ga4-measurement-plan"),
    ).toBe(true);
  });

  it("declares the Privacy Act + ACL + GST anchors reviewers need", () => {
    // Privacy Act 1988 + Australian Privacy Principles — GA4 collects
    // personal information (IP, device identifiers, hashed IDs) and the
    // plan must anchor its handling to the APPs.
    expect(body).toMatch(/Privacy Act 1988/);
    expect(body).toMatch(/Australian Privacy Principles/);
    expect(body).toMatch(/APP 1/);
    expect(body).toMatch(/APP 3/);
    expect(body).toMatch(/APP 5/);
    expect(body).toMatch(/APP 8/);
    expect(body).toMatch(/APP 11/);
    // Cross-border disclosure carve-out — GA4 processing sits on Google
    // US / EU servers, so an APP 8 statement is required.
    expect(body).toMatch(/cross-border/i);
    // Consent Mode v2 is the Google-supplied mechanism that keeps GA4
    // off the wire until the user opts in.
    expect(body).toMatch(/Consent Mode v2/);
    // GST hygiene — the single biggest source of accidental revenue
    // over-reporting in AU GA4 pipelines.
    expect(body).toMatch(/GST-exclusive/);
    expect(body).toMatch(/s9-70/);
    // Misleading-conduct guardrails — the difference between an internal
    // dashboard and an investor-safe measurement plan.
    expect(body).toMatch(/s18/);
    expect(body).toMatch(/Australian Consumer Law/);
    expect(body).toMatch(/s1041H/);
    // Wilson-CI + cohort floor + A/B decision rule — statistical
    // guardrails that stop a small-n activation rate being quoted as a
    // headline in a deck.
    expect(body).toMatch(/Wilson/);
    expect(body).toMatch(/cohort/i);
    // NDB Scheme trigger — Part IIIC of the Privacy Act — is what makes
    // loading GA4 without a valid consent banner an ongoing risk, not
    // just a one-off complaint.
    expect(body).toMatch(/Notifiable[\s\n>]+Data Breaches/);
    // Top-of-doc disclaimer.
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

  it("substitutes plan identity fields and keeps unfilled tokens visible", () => {
    const rendered = applySubstitutions(body, {
      product_name: "Acme Cap Table Cloud",
      plan_version: "1.0",
      effective_date: "1 August 2026",
      plan_owner_name: "Alice Founder",
      plan_owner_email: "alice@example.com.au",
      company_name: "Acme Innovation",
      acn: "659 615 111",
      ga4_measurement_id: "G-ABCDE12345",
      revenue_reconciliation_tolerance_pct: "3",
      cohort_min_n: "40",
      revision_date: "2026-07-25",
    });
    // Concrete plan identity fields render into the header.
    expect(rendered).toContain("Acme Cap Table Cloud");
    expect(rendered).toContain("Acme Innovation Pty Ltd");
    expect(rendered).toContain("ACN 659 615 111");
    expect(rendered).toContain("G-ABCDE12345");
    // Tolerance + cohort floor render into the guardrail sections.
    expect(rendered).toMatch(/±3%/);
    expect(rendered).toMatch(/n < 40/);
    // Absent tokens stay visible so a founder sees the gap.
    expect(rendered).toContain("{{ga4_property_id}}");
  });
});

describe("au-founder-agreement template", () => {
  const tpl = getTemplate("au-founder-agreement");
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
    expect(listTemplates().some((t) => t.slug === "au-founder-agreement")).toBe(
      true,
    );
  });

  it("declares the AU co-founder anchors an investor's lawyer looks for", () => {
    // Vesting norms Blackbird / AirTree / Square Peg term sheets expect.
    expect(body).toMatch(/reverse-vesting/i);
    expect(body).toMatch(/1-year cliff|cliff/);
    expect(body).toMatch(/double-trigger/);
    // Corporations Act anchors — s127 execution, s254T solvency, s168 Register,
    // s12 associate definition (Reserved Matters), Part 2J.1 buy-back.
    expect(body).toMatch(/section 127|s 127/);
    expect(body).toMatch(/s 254T|section 254T/);
    expect(body).toMatch(/s 168|section 168/);
    expect(body).toMatch(/s 12/);
    expect(body).toMatch(/Part 2J\.1/);
    // Good Leaver / Bad Leaver split is what makes this AU agreement
    // investor-defensible.
    expect(body).toMatch(/Good Leaver/);
    expect(body).toMatch(/Bad Leaver/);
    // Restraints of Trade Act 1976 (NSW) read-down power — the reason we ship
    // cascading restraints rather than a single fixed period.
    expect(body).toMatch(/Restraints of Trade Act 1976/);
    // Moral rights consent — Copyright Act 1968 (Cth) Part IX.
    expect(body).toMatch(/moral rights/i);
    expect(body).toMatch(/195AW/);
    // Div 83A cross-reference — Founder ESOP grants sit on the separate scheme.
    expect(body).toMatch(/Division 83A/);
    // Deadlock mechanic + Change-of-Control definition — the two clauses that
    // separate a founder-only agreement from a shareholders' agreement.
    expect(body).toMatch(/Russian Roulette/);
    expect(body).toMatch(/Change of Control/);
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

  it("substitutes party fields and honours the third-founder toggle", () => {
    const base: Record<string, string> = {
      company_name: "Acme Innovation",
      acn: "659 615 111",
      registered_office_address: "Sydney NSW 2000",
      company_business_description:
        "AI-driven investor-readiness workspace for AU founders",
      effective_date: "1 July 2026",
      founder_1_name: "Alice Founder",
      founder_1_address: "Sydney NSW",
      founder_1_shares: "5,000,000",
      founder_1_pct: "50",
      founder_1_role: "CEO",
      founder_1_commitment: "Full-time",
      founder_2_name: "Bob Founder",
      founder_2_address: "Melbourne VIC",
      founder_2_shares: "5,000,000",
      founder_2_pct: "50",
      founder_2_role: "CTO",
      founder_2_commitment: "Full-time",
      issue_price_per_share_aud: "0.0001",
      vesting_total_months: "48",
      vesting_cliff_months: "12",
      unvested_buyback_price_aud: "0.0001",
      permitted_other_hours_per_week: "5",
      first_priced_raise_aud: "1,500,000",
      founder_stipend_aud_per_month: "6,000",
      bad_leaver_price_aud: "0.0001",
      restraint_period_1_months: "12",
      restraint_period_2_months: "6",
      restraint_period_3_months: "3",
      restraint_area_1: "Australia and New Zealand",
      restraint_area_2: "Australia",
      restraint_area_3: "New South Wales",
      related_party_threshold_aud: "10,000",
      debt_threshold_aud: "100,000",
      governing_state: "New South Wales",
      director_name: "Alice Founder",
      annexure_a_disclosures:
        "Nil disclosed — no pre-existing IP or side arrangements.",
      revision_date: "2026-07-25",
    };
    // Two-founder path: has_third_founder omitted → third row stripped
    // AND third-founder signature block stripped.
    const twoFounder = applySubstitutions(body, base);
    expect(twoFounder).toContain("Acme Innovation Pty Ltd");
    expect(twoFounder).toContain("ACN 659 615 111");
    expect(twoFounder).toContain("Alice Founder");
    expect(twoFounder).toContain("Bob Founder");
    expect(twoFounder).not.toContain("Founder 3");
    expect(twoFounder).not.toContain("{{founder_3_name}}");
    expect(twoFounder).not.toMatch(/\{\{#has_third_founder\}\}/);
    // Vesting numbers substitute into the reverse-vesting clause.
    expect(twoFounder).toMatch(/48 months/);
    expect(twoFounder).toMatch(/12-month cliff/);
    // Governing law flows into section 9.2.
    expect(twoFounder).toContain("New South Wales, Australia");

    // Three-founder path: has_third_founder=true keeps the row and the
    // execution block for Founder 3.
    const threeFounder = applySubstitutions(body, {
      ...base,
      founder_1_pct: "40",
      founder_2_pct: "40",
      founder_3_name: "Carol Founder",
      founder_3_address: "Brisbane QLD",
      founder_3_shares: "2,000,000",
      founder_3_pct: "20",
      founder_3_role: "COO",
      founder_3_commitment: "Full-time",
      has_third_founder: "true",
    });
    expect(threeFounder).toContain("Carol Founder");
    expect(threeFounder).toMatch(/Brisbane QLD/);
    // 40/40/20 split renders into the equity-split table.
    expect(threeFounder).toMatch(/40%/);
    expect(threeFounder).toMatch(/20%/);
    expect(threeFounder).not.toMatch(/\{\{#has_third_founder\}\}/);
  });
});

describe("au-esic-self-assessment template", () => {
  const tpl = getTemplate("au-esic-self-assessment");
  const body = tpl
    ? readFileSync(
        path.join(process.cwd(), tpl.file_path.replace(/^web\//, "")),
        "utf8",
      )
    : "";

  it("is registered as a phase-9 fundraising template", () => {
    expect(tpl).toBeDefined();
    expect(tpl?.slug).toBe("au-esic-self-assessment");
    expect(tpl?.category).toBe("fundraising");
    expect(tpl?.phase_slug).toBe("phase-9");
    expect(
      listTemplates().some((t) => t.slug === "au-esic-self-assessment"),
    ).toBe(true);
  });

  it("declares the Div 360 ITAA97 statutory anchors reviewers need", () => {
    // Every substring below must appear verbatim in the template body so that
    // a grep-based diligence check (or a founder scanning for the anchor)
    // can locate it without ambiguity.
    for (const needle of [
      "Division 360",
      "s360-40",
      "s360-45",
      "ITAA 1997",
      "100",
      "A$200,000",
      "A$1,000,000",
      "A$50,000",
      "principles-based",
      "Tax Agent Services Act 2009",
      "s923B",
      "s286",
      "APP 11",
      "NOT LEGAL ADVICE",
      "Electronic Transactions Act",
      "s127",
    ]) {
      expect(body, `missing statutory anchor: ${needle}`).toContain(needle);
    }
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

  it("cites at least 6 statutory + industry sources with https URLs", () => {
    expect(tpl?.sources.length ?? 0).toBeGreaterThanOrEqual(6);
    for (const src of tpl?.sources ?? []) {
      expect(src.label, "source label must be non-empty").toBeTruthy();
      expect(src.label.trim().length).toBeGreaterThan(0);
      expect(src.url, `source URL must be https: ${src.label}`).toMatch(
        /^https:\/\//,
      );
    }
  });
});
