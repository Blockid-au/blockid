import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { formatAud } from "@/lib/plans-v2";
import { PaygViewProvider } from "@/components/pricing/payg-view-context";
import { PAYG_ON_VIEW } from "@/lib/pricing/payg-copy";
import { RndLockedSection } from "./rnd-locked-section";

// G35 P5 (D27): the "buy credit packs from A$…" line names the smallest pack
// ON SALE — the 5-pack with payg_enabled OFF (today), the 10-pack once the
// flag is ON (the 5-pack is retired from sale).

const props = { lockedPreview: "Preview", lockedSections: ["Market"], pageTitle: "Market" };
const textOf = (html: string) => html.replace(/<!-- -->/g, "");

describe("RndLockedSection — smallest credit pack follows payg_enabled", () => {
  it("flag OFF (no provider): today's smallest pack", () => {
    const html = textOf(renderToStaticMarkup(<RndLockedSection {...props} />));
    expect(html).toContain(`buy credit packs from ${formatAud(CREDIT_PACKS[0]!.price)}`);
  });

  it("flag ON: the smallest pack still on sale (10 credits)", () => {
    const ten = CREDIT_PACKS.find((p) => p.credits === 10)!;
    const html = textOf(
      renderToStaticMarkup(
        <PaygViewProvider value={PAYG_ON_VIEW}>
          <RndLockedSection {...props} />
        </PaygViewProvider>,
      ),
    );
    expect(html).toContain(`buy credit packs from ${formatAud(ten.price)}`);
    expect(html).not.toContain(`buy credit packs from ${formatAud(CREDIT_PACKS[0]!.price)}`);
  });
});
