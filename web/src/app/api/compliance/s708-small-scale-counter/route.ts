// POST /api/compliance/s708-small-scale-counter — run the s708(1) small-scale
// personal-offer counter for a founder's event stream (optionally with a
// "what if we accept this next tranche" preview) and return the classifier
// result. Auth-gated to keep the counter behind the workspace boundary but
// STATELESS — no persistence, no schema — because a durable events source
// belongs to the sibling share-register-schema tick (P1n-share-register).
//
// Legal ref: Corporations Act 2001 (Cth) s708(1)/(3) + ASIC small-scale
// personal-offer guidance
// https://asic.gov.au/regulatory-resources/fundraising/small-scale-offers/
//
// Every response carries S708_SMALL_SCALE_DISCLAIMER — not legal advice.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import {
  assessS708SmallScale,
  S708_SMALL_SCALE_DISCLAIMER,
  type S708CounterInput,
  type S708OfferEvent,
  type S708OfferType,
} from "@/lib/compliance/s708-small-scale-counter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_OFFER_TYPES: readonly S708OfferType[] = [
  "primary",
  "secondary_on_sale",
];

function isS708Event(row: unknown): row is S708OfferEvent {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  if (typeof r.offer_date !== "string") return false;
  if (typeof r.investor_id !== "string") return false;
  if (typeof r.amount_aud !== "number") return false;
  if (
    r.offer_type !== undefined &&
    !VALID_OFFER_TYPES.includes(r.offer_type as S708OfferType)
  ) {
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthenticated",
        disclaimer: S708_SMALL_SCALE_DISCLAIMER,
      },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_json",
        disclaimer: S708_SMALL_SCALE_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  if (!raw || typeof raw !== "object") {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_body",
        disclaimer: S708_SMALL_SCALE_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  const body = raw as Partial<S708CounterInput>;
  if (!Array.isArray(body.events)) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_events",
        required: ["events"],
        disclaimer: S708_SMALL_SCALE_DISCLAIMER,
      },
      { status: 400 },
    );
  }

  // Pass through only well-typed rows; the pure counter tolerates junk but we
  // reject at the boundary so a bad client cannot inflate the count via
  // duplicate-key attacks or malformed amount fields.
  const events = body.events.filter(isS708Event);

  const input: S708CounterInput = { events };
  if (
    body.preview &&
    typeof body.preview === "object" &&
    typeof (body.preview as { new_investors?: unknown }).new_investors ===
      "number" &&
    typeof (body.preview as { amount_aud?: unknown }).amount_aud === "number"
  ) {
    input.preview = {
      new_investors: (body.preview as { new_investors: number }).new_investors,
      amount_aud: (body.preview as { amount_aud: number }).amount_aud,
    };
  }

  const result = assessS708SmallScale(input);
  return NextResponse.json({ ok: true, result });
}
