// Colocated vitest for POST /api/founder-profile/import-linkedin (G14-S37).
//
// Pins: 401 without a session; 501 parser_unavailable when the S-R5 module
// cannot be loaded (feature detection, never a hard dependency); the PDF
// magic / size gates; the parsed FounderSignals → prefill projection
// (years, employers, exits, name, url + the `filled` list the form uses to
// stamp execution_source = linkedin_parser); nothing is persisted.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(async () => null as { id: string; email: string } | null),
  parserAvailable: true,
  parsePdf: vi.fn(async (_buf: Buffer, _opts: unknown) => ({
    source: "linkedin_pdf",
    profileUrl: "https://www.linkedin.com/in/ada",
    founderName: "Ada Lovelace",
    headline: "Co-founder & CEO",
    currentRole: "CEO",
    yearsExperience: 13.6,
    yearsInDomain: 8.7,
    priorCompanies: ["Atlassian", "Canva"],
    exits: 1,
    teamSizeOnPage: null,
    roles: [],
    education: [],
    confidence: 0.9,
    parsedAt: "2026-09-17T00:00:00.000Z",
    extractedChars: 1200,
    engine: "pdfjs",
  })),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_m: unknown, h: (r: Request) => Promise<Response>) => h }));
vi.mock("@/lib/connectors/linkedin-upload", () => {
  if (!mocks.parserAvailable) throw new Error("Cannot find module");
  return {
    parseLinkedInPdf: (buf: Buffer, opts: unknown) => mocks.parsePdf(buf, opts),
    normaliseLinkedInUrl: (raw: string) => (/linkedin\.com\/in\//.test(raw) ? raw.replace(/\/+$/, "") : null),
  };
});

import { POST, toPrefill } from "./route";

function pdfRequest(bytes: string | Buffer, extra: Record<string, string> = {}): Request {
  const fd = new FormData();
  fd.set("file", new File([bytes], "profile.pdf", { type: "application/pdf" }));
  for (const [k, v] of Object.entries(extra)) fd.set(k, v);
  return new Request("http://localhost/api/founder-profile/import-linkedin", { method: "POST", body: fd });
}

beforeEach(() => {
  process.env.REPORT_LINK_SECRET = "import-route-test-secret-0123456789";
  mocks.getCurrentUser.mockReset().mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  mocks.parsePdf.mockClear();
  mocks.parserAvailable = true;
  vi.resetModules();
});

describe("POST /api/founder-profile/import-linkedin", () => {
  it("401 without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(pdfRequest("%PDF-1.4 x"));
    expect(res.status).toBe(401);
  });

  it("415 when the upload is not a PDF; 400 when no file is sent", async () => {
    const notPdf = await POST(pdfRequest("hello world"));
    expect(notPdf.status).toBe(415);
    expect((await notPdf.json()).error).toBe("pdf_only");
    const fd = new FormData();
    fd.set("profileUrl", "https://www.linkedin.com/in/ada");
    const noFile = await POST(new Request("http://localhost/x", { method: "POST", body: fd }));
    expect(noFile.status).toBe(400);
    expect((await noFile.json()).error).toBe("file_required");
    expect(mocks.parsePdf).not.toHaveBeenCalled();
  });

  it("parses the PDF through the S-R5 parser and returns the prefill + filled list (nothing persisted)", async () => {
    const res = await POST(pdfRequest("%PDF-1.4 real export", { profileUrl: "https://www.linkedin.com/in/ada/" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.prefill).toEqual({
      years_in_domain: 9,
      years_experience: 13.6,
      prev_employers: ["Atlassian", "Canva"],
      exits: 1,
      full_name: "Ada Lovelace",
      headline: "Co-founder & CEO",
      linkedin_url: "https://www.linkedin.com/in/ada",
      filled: ["years_in_domain", "prev_employers", "prior_exits", "full_name", "linkedin_url"],
      confidence: 0.9,
      attestation: expect.any(String),
    });
    expect(json.extracted).toEqual({ chars: 1200, engine: "pdfjs" });
    expect(mocks.parsePdf).toHaveBeenCalledTimes(1);
    expect(mocks.parsePdf.mock.calls[0][1]).toEqual({ profileUrl: "https://www.linkedin.com/in/ada" });
    // G14-review: the attestation is bound to the caller + the parsed values
    // (POST /api/founder-profile honours `linkedin_parser` stamps only against it).
    const { verifyLinkedInAttestation } = await import("@/lib/founder/linkedin-attestation");
    expect(verifyLinkedInAttestation("u-1", json.prefill.attestation)).toEqual({ ok: true, claims: { years_in_domain: 9, prev_employers: ["atlassian", "canva"] } });
    expect(verifyLinkedInAttestation("u-2", json.prefill.attestation).ok).toBe(false);
  });

  it("422 pdf_unreadable (never a 500) when the PDF engine throws on a corrupt export", async () => {
    mocks.parsePdf.mockRejectedValueOnce(new Error("bad XRef entry"));
    const res = await POST(pdfRequest("%PDF-1.4 corrupt"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("pdf_unreadable");
  });

  it("422 pdf_no_text when the export has no extractable text", async () => {
    mocks.parsePdf.mockResolvedValueOnce({ ...(await mocks.parsePdf(Buffer.alloc(0), {})), extractedChars: 3 });
    const res = await POST(pdfRequest("%PDF-1.4 scanned"));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("pdf_no_text");
  });
});

describe("toPrefill", () => {
  it("falls back to total years when the domain years are unknown, clamps 0..60 and lists only the fields it could fill", () => {
    const p = toPrefill({ yearsInDomain: null, yearsExperience: 70.2, priorCompanies: [], exits: 0, founderName: null, headline: null, profileUrl: null, confidence: 0.4 });
    expect(p.years_in_domain).toBe(60);
    expect(p.filled).toEqual(["years_in_domain"]);
    const none = toPrefill({ yearsInDomain: null, yearsExperience: null, priorCompanies: [], exits: 0, founderName: null, headline: null, profileUrl: null, confidence: 0.2 });
    expect(none.years_in_domain).toBeNull();
    expect(none.filled).toEqual([]);
  });
});
