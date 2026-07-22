// Pure helpers for building Subscription Schedule phases when cancelling a
// share-management add-on at the end of the current billing cycle.
//
// Stripe's `subscriptionItems.del(id, { proration_behavior: 'none' })` removes
// the item IMMEDIATELY (the customer loses access mid-cycle). The end-of-cycle
// pattern is a two-phase Subscription Schedule: phase 0 keeps the current item
// set for the remainder of the paid period; phase 1 kicks in at
// `current_period_end` with the reduced item set. `end_behavior: 'release'`
// then hands the subscription back to normal Stripe renewal.

export type PhaseItemInput = {
  price: string;
  quantity?: number;
};

export type SchedulePhaseInput = {
  start_date: number;
  end_date?: number;
  items: PhaseItemInput[];
  proration_behavior: "none";
  iterations?: number;
};

type PhaseItemLike = {
  price: string | { id: string };
  quantity?: number | null;
};

export type CurrentPhaseLike = {
  start_date: number;
  end_date: number;
  items: PhaseItemLike[];
};

export type BuildRemovalResult =
  | { ok: true; phases: [SchedulePhaseInput, SchedulePhaseInput] }
  | { ok: false; reason: "target_not_in_phase" | "no_items_after_removal" };

export function buildAddonRemovalSchedulePhases(args: {
  currentPhase: CurrentPhaseLike;
  removePriceId: string;
}): BuildRemovalResult {
  const { currentPhase, removePriceId } = args;

  const mapped: PhaseItemInput[] = currentPhase.items.map((it) => {
    const price = typeof it.price === "string" ? it.price : it.price.id;
    const item: PhaseItemInput = { price };
    if (typeof it.quantity === "number" && it.quantity > 0) {
      item.quantity = it.quantity;
    }
    return item;
  });

  if (!mapped.some((it) => it.price === removePriceId)) {
    return { ok: false, reason: "target_not_in_phase" };
  }

  const reduced = mapped.filter((it) => it.price !== removePriceId);
  if (reduced.length === 0) {
    return { ok: false, reason: "no_items_after_removal" };
  }

  return {
    ok: true,
    phases: [
      {
        start_date: currentPhase.start_date,
        end_date: currentPhase.end_date,
        items: mapped,
        proration_behavior: "none",
      },
      {
        start_date: currentPhase.end_date,
        items: reduced,
        proration_behavior: "none",
        iterations: 1,
      },
    ],
  };
}
