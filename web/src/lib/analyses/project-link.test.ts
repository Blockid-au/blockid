// G34 DC01 / AF13 — a signed-in /analyze run is linked to the active project
// only when it is about that company; never guessed, never created.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const scopeMock = vi.fn();
vi.mock("@/lib/projects", () => ({ getProjectScope: () => scopeMock() }));

import { isSameCompany, normaliseCompanyName, projectForAnalysis } from "./project-link";

beforeEach(() => scopeMock.mockReset());

describe("normaliseCompanyName / isSameCompany", () => {
  it("ignores case, punctuation and legal suffixes", () => {
    expect(normaliseCompanyName("Acme Compliance Pty Ltd.")).toBe("acme compliance");
    expect(isSameCompany("ACME Compliance", "Acme Compliance Pty Ltd")).toBe(true);
  });
  it("never matches placeholders, short names or different companies", () => {
    expect(isSameCompany("Your startup", "Your Startup")).toBe(false);
    expect(isSameCompany("AB", "ab")).toBe(false);
    expect(isSameCompany("Acme", "Acme Compliance")).toBe(false);
    expect(isSameCompany(null, "Acme")).toBe(false);
  });
});

describe("projectForAnalysis", () => {
  it("links to the active project when the run is about it and the caller can write", async () => {
    scopeMock.mockResolvedValue({ projectId: "p-1", role: "owner", project: { name: "BlockID" } });
    expect(await projectForAnalysis("BlockID Pty Ltd")).toBe("p-1");
  });
  it("a different company, a viewer or no scope → null", async () => {
    scopeMock.mockResolvedValue({ projectId: "p-1", role: "owner", project: { name: "BlockID" } });
    expect(await projectForAnalysis("Canva")).toBeNull();
    scopeMock.mockResolvedValue({ projectId: "p-1", role: "viewer", project: { name: "BlockID" } });
    expect(await projectForAnalysis("BlockID")).toBeNull();
    scopeMock.mockResolvedValue(null);
    expect(await projectForAnalysis("BlockID")).toBeNull();
  });
});
