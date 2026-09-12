// Render test for /verify/valuation/[no] (S22-A): valid / revoked / unknown
// / hash-mismatch states, the record card, and that no valuation figure
// reaches the markup.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderPage } from "@/test/founder-page-harness";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { SAMPLE_CERTIFICATE as SAMPLE } from "@/lib/valuation-certificate/fixtures";
import { certificateContentHash } from "@/lib/valuation-certificate/hash";

const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

import Page, { generateMetadata } from "./page";

const HASH = certificateContentHash(SAMPLE);

function row(over: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    project_id: "proj-1",
    user_id: "u-1",
    certificate_no: SAMPLE.certificateNo,
    content_hash: HASH,
    payload: SAMPLE,
    startup_name: SAMPLE.startupName,
    svi_score: SAMPLE.sviScore,
    credits_charged: 5,
    issued_at: SAMPLE.issuedAt,
    revoked_at: null,
    revoked_reason: null,
    ...over,
  };
}

function render(no = SAMPLE.certificateNo, search: Record<string, string> = {}) {
  return renderPage(Page({ params: Promise.resolve({ no }), searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  db.sb = fakeSupabase({ valuation_certificates: [row()] });
});

describe("/verify/valuation/[no]", () => {
  it("valid certificate: Verified banner, record card, hash, no figures", async () => {
    const html = await render();
    expect(html).toContain('data-status="valid"');
    expect(html).toContain("Verified");
    expect(html).toContain(SAMPLE.certificateNo);
    expect(html).toContain("Acme Robotics Pty Ltd");
    expect(html).toContain("12 September 2026");
    expect(html).toContain(HASH);
    expect(html).toContain("Not revoked");
    expect(html).toContain("Stored content re-hashes to this value: <strong");
    // No financials, ever.
    expect(html).not.toContain("2,400,000");
    expect(html).not.toContain("A$2.40M");
    expect(html).not.toContain("138");
    // Entity + disclaimer footer.
    expect(html).toContain("Auschain PTY LTD (ACN 659 615 111, ABN 79 659 615 111)");
    expect(html).toContain("not an independent valuation report");
  });

  it("revoked certificate: Revoked banner with date and reason", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ revoked_at: "2026-10-01T00:00:00Z", revoked_reason: "re-scored" })] });
    const html = await render();
    expect(html).toContain('data-status="revoked"');
    expect(html).toContain("re-scored");
    expect(html).toContain("Revoked on");
    expect(html).not.toContain('data-status="valid"');
  });

  it("unknown number: not-on-record state, no record card", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [] });
    const html = await render("VC-ZZZZZ-ZZZZZ");
    expect(html).toContain('data-status="unknown"');
    expect(html).toContain("Not on record");
    expect(html).toContain("VC-ZZZZZ-ZZZZZ");
    expect(html).not.toContain('data-testid="content-hash"');
    // Release QA-1 #16: the invalid-number state had no <h1> (the
    // certificate heading only renders when found). Exactly one now.
    expect(html.match(/<h1\b/g)?.length).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Not on record<\/h1>/);
  });

  it("hash mismatch: red state; ?hash= comparison line renders", async () => {
    db.sb = fakeSupabase({ valuation_certificates: [row({ payload: { ...SAMPLE, sviScore: 1 } })] });
    const html = await render(SAMPLE.certificateNo, { hash: HASH });
    expect(html).toContain('data-status="hash_mismatch"');
    expect(html).toContain('data-testid="supplied-hash-match"');
  });

  it("is noindex", async () => {
    const meta = await generateMetadata({ params: Promise.resolve({ no: SAMPLE.certificateNo }) });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});
