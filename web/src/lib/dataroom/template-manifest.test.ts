import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  DATAROOM_TEMPLATE_MANIFEST,
  templateStoragePath,
} from "./template-manifest";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";

describe("DATAROOM_TEMPLATE_MANIFEST", () => {
  it("carries exactly 10 entries", () => {
    expect(DATAROOM_TEMPLATE_MANIFEST.length).toBe(10);
  });

  it("has unique slugs", () => {
    const slugs = DATAROOM_TEMPLATE_MANIFEST.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("has unique filenames", () => {
    const files = DATAROOM_TEMPLATE_MANIFEST.map((t) => t.filename);
    expect(new Set(files).size).toBe(files.length);
  });

  it("references only categories that exist in DATA_ROOM_STRUCTURE", () => {
    const validNames = new Set(DATA_ROOM_STRUCTURE.map((f) => f.name));
    for (const entry of DATAROOM_TEMPLATE_MANIFEST) {
      expect(
        validNames.has(entry.category),
        `${entry.slug} → "${entry.category}" not in DATA_ROOM_STRUCTURE`,
      ).toBe(true);
    }
  });

  it("uses phaseSlug '1'..'12'", () => {
    for (const entry of DATAROOM_TEMPLATE_MANIFEST) {
      const n = Number.parseInt(entry.phaseSlug, 10);
      expect(Number.isFinite(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(12);
    }
  });

  it("caps size_bytes_max at 200_000", () => {
    for (const entry of DATAROOM_TEMPLATE_MANIFEST) {
      expect(entry.size_bytes_max).toBeLessThanOrEqual(200_000);
    }
  });

  it("versions all entries at v1 initially", () => {
    for (const entry of DATAROOM_TEMPLATE_MANIFEST) {
      expect(entry.version).toBe("v1");
    }
  });

  it("carries the expected 10 canonical slugs", () => {
    const slugs = DATAROOM_TEMPLATE_MANIFEST.map((t) => t.slug).sort();
    expect(slugs).toEqual(
      [
        "board-consent",
        "cap-table",
        "employment-contract",
        "esop-plan",
        "financial-model",
        "ip-assignment",
        "pitch-deck",
        "safe",
        "sha",
        "term-sheet",
      ].sort(),
    );
  });
});

describe("templateStoragePath", () => {
  it("builds startup-{id}/templates/{version}/{filename}", () => {
    const entry = DATAROOM_TEMPLATE_MANIFEST[0];
    expect(templateStoragePath("abc", entry)).toBe(
      `startup-abc/templates/${entry.version}/${entry.filename}`,
    );
  });
});

describe("public/templates/*.{docx,xlsx}", () => {
  const dir = path.join(process.cwd(), "public", "templates");

  it("has every manifested file on disk with size < cap", async () => {
    for (const entry of DATAROOM_TEMPLATE_MANIFEST) {
      const p = path.join(dir, entry.filename);
      const stat = await fs.stat(p);
      expect(stat.isFile()).toBe(true);
      expect(stat.size).toBeGreaterThan(0);
      expect(stat.size).toBeLessThan(entry.size_bytes_max);
    }
  });

  it("total bytes across all 10 templates stays under 2 MB", async () => {
    let total = 0;
    for (const entry of DATAROOM_TEMPLATE_MANIFEST) {
      const stat = await fs.stat(path.join(dir, entry.filename));
      total += stat.size;
    }
    expect(total).toBeLessThan(2_000_000);
  });
});
