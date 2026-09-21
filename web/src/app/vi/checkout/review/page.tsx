// /vi/checkout/review — Vietnamese mirror of /checkout/review (G25-D). Same
// order model, same <CheckoutReviewCard>; every string comes from the VI
// catalogue through `checkoutReviewStrings(m, "vi")`.

import type { Metadata } from "next";
import { CheckoutReviewPage, checkoutReviewMetadata, type SearchParams } from "../../../checkout/review/checkout-review-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  return checkoutReviewMetadata("vi");
}

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <CheckoutReviewPage searchParams={searchParams} locale="vi" />;
}
