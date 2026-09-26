// G34 DC10 — the one purpose line at every user-data capture point.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import { DATA_PURPOSE_COPY, dataPurposeCopy, type SaveState } from "@/lib/privacy/data-purpose-copy";
import { DataPurposeNote } from "./data-purpose-note";

const EN = en as Record<string, string>;
const VI = vi as Record<string, string>;

describe("DATA_PURPOSE_COPY", () => {
  it("EN and VI carry the same keys and save states, none empty", () => {
    const shape = (o: object): string[] => Object.keys(o).sort();
    expect(shape(DATA_PURPOSE_COPY.vi)).toEqual(shape(DATA_PURPOSE_COPY.en));
    expect(shape(DATA_PURPOSE_COPY.vi.save)).toEqual(shape(DATA_PURPOSE_COPY.en.save));
    for (const loc of ["en", "vi"] as const) {
      const c = DATA_PURPOSE_COPY[loc];
      for (const v of [c.analysis, c.account, c.privacyLink, c.privacyHref, ...Object.values(c.save)]) {
        expect(v.trim().length, loc).toBeGreaterThan(0);
      }
    }
  });

  it("reuses the approved data-principle first sentence verbatim in both languages", () => {
    const firstSentence = (s: string) => s.split(". ")[0]! + ".";
    const enPrinciple = firstSentence(EN["solutions.principle.data"]!);
    const viPrinciple = firstSentence(VI["solutions.principle.data"]!);
    expect(enPrinciple).toBe("Your data belongs to your startup.");
    for (const k of ["analysis", "account"] as const) {
      expect(DATA_PURPOSE_COPY.en[k].endsWith(enPrinciple), `en ${k}`).toBe(true);
      expect(DATA_PURPOSE_COPY.vi[k].endsWith(viPrinciple), `vi ${k}`).toBe(true);
    }
  });

  it("makes no training claim either way", () => {
    expect(JSON.stringify(DATA_PURPOSE_COPY)).not.toMatch(/\btrain(ing|ed|s)?\b/i);
  });

  it("points both languages at the one privacy policy (VI at its Vietnamese clause)", () => {
    expect(DATA_PURPOSE_COPY.en.privacyHref).toBe("/legal/privacy");
    expect(DATA_PURPOSE_COPY.vi.privacyHref).toBe("/legal/privacy#automated-decisions-vi");
    const mdx = readFileSync(join(process.cwd(), "content", "legal", "privacy-v2.mdx"), "utf8");
    expect(mdx).toContain("{#automated-decisions-vi}");
  });

  it("falls back to English for an unknown locale", () => {
    expect(dataPurposeCopy("fr")).toBe(DATA_PURPOSE_COPY.en);
    expect(dataPurposeCopy(null)).toBe(DATA_PURPOSE_COPY.en);
    expect(dataPurposeCopy("vi")).toBe(DATA_PURPOSE_COPY.vi);
  });
});

describe("<DataPurposeNote>", () => {
  it("renders the analysis line and a privacy link (default EN on the server snapshot)", () => {
    const html = renderToStaticMarkup(<DataPurposeNote />);
    expect(html).toContain(DATA_PURPOSE_COPY.en.analysis);
    expect(html).toContain('href="/legal/privacy"');
    expect(html).toContain("Privacy policy");
    expect(html).toContain('data-testid="data-purpose-note"');
    expect(html).not.toContain('role="status"');
  });

  it("renders the account line in Vietnamese when asked", () => {
    const html = renderToStaticMarkup(<DataPurposeNote context="account" locale="vi" testId="x" />);
    expect(html).toContain(DATA_PURPOSE_COPY.vi.account);
    expect(html).toContain("Chính sách quyền riêng tư");
    expect(html).toContain('href="/legal/privacy#automated-decisions-vi"');
  });

  it.each<SaveState>(["saving", "saved", "saved-local", "unsaved"])("surfaces the %s autosave state as a live status", (state) => {
    const html = renderToStaticMarkup(<DataPurposeNote saveState={state} testId="w" />);
    expect(html).toContain('role="status"');
    expect(html).toContain(`data-save-state="${state}"`);
    expect(html).toContain(DATA_PURPOSE_COPY.en.save[state]);
  });

  it("uses light-theme tokens only", () => {
    const html = renderToStaticMarkup(<DataPurposeNote saveState="unsaved" />);
    expect(html).not.toMatch(/bg-brand-navy|#[0-9a-f]{3,6}\b|text-white/i);
  });
});
