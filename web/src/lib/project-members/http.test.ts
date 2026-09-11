// Colocated tests for the S17-A HTTP adapter around ProjectAccessError.

import { describe, expect, it } from "vitest";
import { isProjectAccessError, projectAccessResponse } from "./http";
import { ProjectAccessError } from "@/lib/projects";

describe("projectAccessResponse", () => {
  it("maps the real ProjectAccessError class to 404 / 403 / 503 envelopes", async () => {
    const nf = projectAccessResponse(new ProjectAccessError("x", "not_found"))!;
    expect(nf.status).toBe(404);
    expect(await nf.json()).toEqual({ ok: false, error: "Project not found", code: "not_found" });

    const fb = projectAccessResponse(new ProjectAccessError("x", "forbidden"))!;
    expect(fb.status).toBe(403);
    expect((await fb.json()).code).toBe("forbidden");

    const su = projectAccessResponse(new ProjectAccessError("x", "service_unavailable"))!;
    expect(su.status).toBe(503);
  });

  it("is duck-typed so mocked errors (name + code) work without the class", () => {
    const err = Object.assign(new Error("below"), { name: "ProjectAccessError", code: "forbidden" });
    expect(isProjectAccessError(err)).toBe(true);
    expect(projectAccessResponse(err)!.status).toBe(403);
  });

  it("returns null for anything else so callers rethrow", () => {
    expect(projectAccessResponse(new Error("boom"))).toBeNull();
    expect(projectAccessResponse(null)).toBeNull();
    expect(projectAccessResponse({ name: "ProjectAccessError", code: "weird" })).toBeNull();
  });
});
