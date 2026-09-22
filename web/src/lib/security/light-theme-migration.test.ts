import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { THEME_RESTORE_SCRIPT } from "./inline-scripts";
import { cspHashSource, firstPartyInlineScriptHashes } from "./inline-script-hashes";

describe("G30 light-only bootstrap", () => {
  for (const blocked of [false, true]) {
    it(`normalizes legacy dark before paint when storage is ${blocked ? "blocked" : "available"}`, () => {
      const classes = new Set(["dark", "font-class"]);
      const attributes = new Map([["data-theme", "dark"]]);
      const storage = new Map([["blockid_theme", "dark"], ["intake-draft", "keep"], ["consent", "keep"]]);
      const root = {
        classList: { remove: (key: string) => classes.delete(key) },
        setAttribute: (key: string, value: string) => attributes.set(key, value),
        style: { colorScheme: "dark" },
      };
      runInNewContext(THEME_RESTORE_SCRIPT, {
        document: { documentElement: root },
        localStorage: {
          removeItem(key: string) { if (blocked) throw new Error("blocked"); storage.delete(key); },
          setItem(key: string, value: string) { if (blocked) throw new Error("blocked"); storage.set(key, value); },
        },
      });
      expect(classes.has("dark")).toBe(false);
      expect(classes.has("font-class")).toBe(true);
      expect(attributes.get("data-theme")).toBe("light");
      expect(root.style.colorScheme).toBe("light");
      expect(storage.get("intake-draft")).toBe("keep");
      expect(storage.get("consent")).toBe("keep");
      if (!blocked) {
        expect(storage.has("blockid_theme")).toBe(false);
        expect(storage.get("blockid_theme_version")).toBe("light-v1");
      }
    });
  }
  it("authorizes exactly the new bootstrap through the existing CSP catalogue", () => {
    expect(firstPartyInlineScriptHashes({ gaMeasurementId: null, gtmId: null })).toContain(cspHashSource(THEME_RESTORE_SCRIPT));
    expect(THEME_RESTORE_SCRIPT).not.toContain('classList.add("dark")');
  });
});
