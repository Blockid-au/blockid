// Colocated guard for the one number /features prints about the product.
//
// The page said "17 free tools" while app/tools/ held 16 route directories and
// /tools itself rendered `ALL_TOOLS.length`. A hard-coded count on a marketing
// page drifts silently the moment a tool is added or retired, so this counts
// the directories and fails when the copy stops matching them.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SRC = path.resolve(HERE, "../../..");

function toolRouteCount(): number {
  return readdirSync(path.join(SRC, "app", "tools"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .length;
}

function featuresSource(): string {
  return readFileSync(path.join(HERE, "page.tsx"), "utf8");
}

describe("/features tool count", () => {
  it("names the number of tools that actually ship", () => {
    const count = toolRouteCount();
    const source = featuresSource();
    expect(source).toContain(`${count} free tools`);
    expect(source).toContain(`${count} focused tools`);
  });

  it("claims no blanket 'every capability below is live today'", () => {
    // Several rows on this page describe partly-shipped capabilities. A
    // blanket liveness claim over all of them cannot be kept, so it is gone.
    expect(featuresSource()).not.toContain("every capability below is live");
  });
});
