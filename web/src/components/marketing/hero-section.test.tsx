import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HOMEPAGE_COPY_VERSION, HOMEPAGE_HERO } from "@/lib/marketing/homepage-hero";
import type { SmartIntakeProps, SmartIntakeSubmission } from "@/components/analyze/smart-intake";
import { clearPendingIntake, takePendingIntake, pendingIntakeQuery } from "@/lib/analyze/pending-intake";
const doubles = vi.hoisted(() => ({ push: vi.fn(), track: vi.fn(), intake: null as SmartIntakeProps | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: doubles.push }) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: doubles.track }));
vi.mock("@/components/analyze/smart-intake", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/analyze/smart-intake")>();
  return { ...actual, SmartIntake: (props: SmartIntakeProps) => {
    doubles.intake = props;
    return <actual.SmartIntake {...props} />;
  } };
});
import { HeroSection } from "./hero-section";
beforeEach(() => { vi.clearAllMocks(); clearPendingIntake(); });
describe("homepage hero", () => {
  it.each(["en", "vi"] as const)("renders one investor message and localized intake for %s", (locale) => {
    const copy = HOMEPAGE_HERO[locale];
    const html = renderToStaticMarkup(<HeroSection locale={locale} />);
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    for (const value of [copy.title, copy.sub, copy.label, copy.submit, copy.upload]) expect(html).toContain(value);
    expect(html).toContain(`data-hero-arm="${HOMEPAGE_COPY_VERSION}"`);
    expect(html).toContain(`placeholder="${copy.placeholder}"`);
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp"');
    expect(html.indexOf('type="submit"')).toBeLessThan(html.indexOf('href="/tbr/demo"'));
    for (const stale of ["Start a cohort", "Score my startup", "Classify my idea", 'href="/analyze"']) expect(html).not.toContain(stale);
  });
  it.each(["en", "vi"] as const)("hands URL, text and File through unchanged for %s", (locale) => {
    const file = new File(["sample"], "company.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    const submissions: SmartIntakeSubmission[] = [
      { variant: "url", text: "https://example.test", url: "https://example.test" },
      { variant: "idea", text: "A business helping local retailers reconcile their daily customer payments." },
      { variant: "deck", file },
    ];
    renderToStaticMarkup(<HeroSection locale={locale} />);
    for (const payload of submissions) {
      doubles.intake!.onSubmit!(payload);
      expect(takePendingIntake()).toBe(payload);
      expect(takePendingIntake()).toBeNull();
      expect(doubles.push).toHaveBeenLastCalledWith(pendingIntakeQuery(payload));
      expect(doubles.track).toHaveBeenLastCalledWith("svi_submitted", {
        method: payload.file ? "file" : "text", has_file: !!payload.file,
        arm: HOMEPAGE_COPY_VERSION,
      });
    }
    expect(JSON.stringify(doubles.track.mock.calls)).not.toMatch(/example.test|company.docx/);
  });
  it("ignores historical query arms", () => {
    vi.stubGlobal("window", { location: { search: "?hero=F1" } });
    try { expect(renderToStaticMarkup(<HeroSection />)).toContain(HOMEPAGE_HERO.en.title); }
    finally { vi.unstubAllGlobals(); }
  });
});
