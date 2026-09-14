// S31-D — first-party inline snippets + the document inline-script hasher.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GTAG_CONSENT_DEFAULT_SCRIPT,
  THEME_RESTORE_SCRIPT,
  firstPartyInlineScripts,
  gaConfigScript,
  gtmInitScript,
  safeAnalyticsId,
} from "./inline-scripts";
import {
  cspHashSource,
  extractInlineScriptHashes,
  extractInlineScripts,
  firstPartyInlineScriptHashes,
} from "./inline-script-hashes";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

describe("first-party inline scripts", () => {
  it("pins the exact snippet text (the layout renders these constants verbatim — an edited copy would be blocked)", () => {
    expect(THEME_RESTORE_SCRIPT).toBe(
      `(function(){try{var t=localStorage.getItem("blockid_theme");if(t==="dark"){document.documentElement.classList.add("dark")}}catch(e){}})()`,
    );
    expect(GTAG_CONSENT_DEFAULT_SCRIPT).toContain("gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied'");
    expect(GTAG_CONSENT_DEFAULT_SCRIPT).toContain("wait_for_update:500");
    expect(gtmInitScript("GTM-ABC123")).toContain("'https://www.googletagmanager.com/gtm.js?id='+i+dl");
    expect(gtmInitScript("GTM-ABC123")).toMatch(/'dataLayer','GTM-ABC123'\);$/);
    expect(gaConfigScript("G-XYZ")).toContain("gtag('config','G-XYZ',{send_page_view:true");
    expect(gaConfigScript("G-XYZ")).toContain("dimension4:'article_reading_time'");
  });

  it("only interpolates safe ids into script text", () => {
    expect(safeAnalyticsId("G-ABC123")).toBe("G-ABC123");
    expect(safeAnalyticsId(" GTM-1 ")).toBe("GTM-1");
    expect(safeAnalyticsId("")).toBeNull();
    expect(safeAnalyticsId(undefined)).toBeNull();
    expect(safeAnalyticsId("G-1');alert(1);//")).toBeNull();
  });

  it("lists theme + consent always, GTM / GA only when configured", () => {
    expect(firstPartyInlineScripts({ gaMeasurementId: null, gtmId: null })).toEqual([THEME_RESTORE_SCRIPT, GTAG_CONSENT_DEFAULT_SCRIPT]);
    expect(firstPartyInlineScripts({ gaMeasurementId: "G-1", gtmId: "GTM-1" })).toEqual([
      THEME_RESTORE_SCRIPT,
      GTAG_CONSENT_DEFAULT_SCRIPT,
      gtmInitScript("GTM-1"),
      gaConfigScript("G-1"),
    ]);
  });

  it("hashes are CSP `'sha256-<base64>'` sources of the exact text, memoised per env", () => {
    expect(cspHashSource("alert(1)")).toBe(sha("alert(1)"));
    const a = firstPartyInlineScriptHashes({ gaMeasurementId: "G-1", gtmId: null });
    expect(a).toEqual([sha(THEME_RESTORE_SCRIPT), sha(GTAG_CONSENT_DEFAULT_SCRIPT), sha(gaConfigScript("G-1"))]);
    expect(firstPartyInlineScriptHashes({ gaMeasurementId: "G-1", gtmId: null })).toBe(a);
    expect(firstPartyInlineScriptHashes({ gaMeasurementId: "G-2", gtmId: null })).not.toBe(a);
    for (const h of a) expect(h).toMatch(/^'sha256-[A-Za-z0-9+/]+=*'$/);
  });
});

describe("extractInlineScripts() — what the browser will hash", () => {
  it("returns executable inline bodies in order, raw (no entity decoding), skipping src= and data blocks", () => {
    const html = [
      `<!DOCTYPE html><html><head>`,
      `<script>${THEME_RESTORE_SCRIPT}</script>`,
      `<script id="gtag-consent-default">${GTAG_CONSENT_DEFAULT_SCRIPT}</script>`,
      `<script src="/_next/static/chunks/webpack-abc.js" async=""></script>`,
      `<script type="application/ld+json">{"@context":"https://schema.org","x":"<b>"}</script>`,
      `<script type="application/json" id="__NEXT_DATA__">{"a":1}</script>`,
      `<script type="module">import("/x.js")</script>`,
      `<SCRIPT TYPE="text/javascript" nonce="abc">console.log("&amp;")</SCRIPT>`,
      `<script></script>`,
      `</head><body><script>self.__next_f.push([1,"1:\\"$Sreact.fragment\\"\\n"])</script></body></html>`,
    ].join("");
    expect(extractInlineScripts(html)).toEqual([
      THEME_RESTORE_SCRIPT,
      GTAG_CONSENT_DEFAULT_SCRIPT,
      `import("/x.js")`,
      `console.log("&amp;")`,
      `self.__next_f.push([1,"1:\\"$Sreact.fragment\\"\\n"])`,
    ]);
  });

  it("is quote-aware in attributes and tolerant of unterminated tags", () => {
    expect(extractInlineScripts(`<script data-x=">">a()</script>`)).toEqual(["a()"]);
    expect(extractInlineScripts(`<script data-x='>'>b()</script>`)).toEqual(["b()"]);
    expect(extractInlineScripts(`<script>unterminated`)).toEqual([]);
    expect(extractInlineScripts(`<scripts>no</scripts>`)).toEqual([]);
    expect(extractInlineScripts(``)).toEqual([]);
  });

  it("extractInlineScriptHashes() dedupes and matches the browser hash of a real Next flight script", () => {
    const flight = `self.__next_f.push([1,"0:{\\"P\\":null}\\n"])`;
    const html = `<script>${flight}</script><script>${flight}</script><script>${THEME_RESTORE_SCRIPT}</script>`;
    expect(extractInlineScriptHashes(html)).toEqual([sha(flight), sha(THEME_RESTORE_SCRIPT)]);
  });
});
