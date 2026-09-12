/**
 * Per-recipient PDF watermark (S21-A).
 *
 * A `fixed` layer that @react-pdf repeats on every page of the `<Page>` it
 * sits in: a diagonal, low-opacity line of text reading
 *
 *   Prepared for <investor name or email> · <date> · BlockID.au
 *
 * so a leaked copy traces back to the disclosure it came from. This is the
 * consumer that `share_packages.watermark` (migration 0251) and
 * `data_room_access_tokens.watermark` (0339) were waiting for — pass the
 * column's value as `recipient`.
 *
 * Why a React layer and not a post-process: `pdf-lib` is not a dependency
 * (`disclaimer-footer.ts` soft-imports it and falls back to nothing), and a
 * layer inside the renderer means every document produced from
 * `@react-pdf` — this one, the investor pack, the SVI report — can carry it
 * with one element and no second pass over the bytes.
 *
 * Rendering notes:
 *   - `fixed` makes it repeat per page; absolute positioning takes it out of
 *     the flow so page content is untouched;
 *   - the text is drawn three times down the page so an A4 page has a
 *     watermark under every third of its content, not one line in the
 *     middle a crop would remove;
 *   - opacity 0.12 on the brand blue reads on white and on the light-grey
 *     cards without hiding body text (contrast of underlying text stays
 *     above 4.5:1 — the layer is behind, not blended over).
 */

import { Text, View } from "@react-pdf/renderer";

export interface WatermarkInput {
  /** Investor name, firm or email — whatever identifies the disclosure. */
  recipient: string | null | undefined;
  /** en-AU date; defaults to today. */
  date?: Date | string;
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Australia/Sydney",
});

export function watermarkDate(date?: Date | string): string {
  const d = date instanceof Date ? date : date ? new Date(date) : new Date();
  return AU_DATE.format(Number.isNaN(d.getTime()) ? new Date() : d);
}

/**
 * The line burned onto every page. Returns null when there is no recipient
 * — a blank watermark is worse than none because it looks like a bug.
 */
export function watermarkLabel(input: WatermarkInput): string | null {
  const who = (input.recipient ?? "").replace(/\s+/g, " ").trim();
  if (!who) return null;
  return `Prepared for ${who.slice(0, 80)} · ${watermarkDate(input.date)} · BlockID.au`;
}

export const WATERMARK_COLOR = "#1d4ed8";
export const WATERMARK_OPACITY = 0.12;

/** Place inside every `<Page>` that should carry the mark. No-op when `label` is null. */
export function WatermarkLayer({ label }: { label: string | null }) {
  if (!label) return null;
  const line = (top: string) => (
    <View
      key={top}
      style={{
        position: "absolute",
        top,
        left: -60,
        right: -60,
        alignItems: "center",
        transform: "rotate(-32deg)",
      }}
    >
      <Text
        style={{
          fontFamily: "Helvetica-Bold",
          fontSize: 22,
          letterSpacing: 1.2,
          color: WATERMARK_COLOR,
          opacity: WATERMARK_OPACITY,
        }}
      >
        {label}
      </Text>
    </View>
  );
  return (
    <View
      fixed
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {line("18%")}
      {line("50%")}
      {line("82%")}
    </View>
  );
}
