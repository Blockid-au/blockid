// /checkout/review — see ./checkout-review-page.tsx (G25-D review before pay).

import type { Metadata } from "next";
import { CheckoutReviewPage, checkoutReviewMetadata, type SearchParams } from "./checkout-review-page";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  return checkoutReviewMetadata("en");
}

export default function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return <CheckoutReviewPage searchParams={searchParams} locale="en" />;
}
