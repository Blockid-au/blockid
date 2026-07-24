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
