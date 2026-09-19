/**
 * /product content constants (G17 D4). Kept out of page.tsx because Next
 * only allows the route-segment exports there.
 */

/** The section ids the old homepage anchors map to — `/#worth` → `/product#worth`. */
export const PRODUCT_SECTION_IDS = ["worth", "state", "journey", "next", "unlock"] as const;
export type ProductSectionId = (typeof PRODUCT_SECTION_IDS)[number];

/** `/product#<id>` for a legacy homepage anchor. */
export function productAnchor(id: ProductSectionId): string {
  return `/product#${id}`;
}
