// Serializable props for the client-side SignalChipStrip (G34 BT3).
// The dashboard-v4 strings object carries functions (e.g. unlockMissing,
// signalPopoverAria), and functions cannot cross the server → client
// boundary (prerender of /tbr/demo failed on 2026-09-26). The server builds
// this plain object; the client component only renders it.

import type { DashboardV4, V4SignalChip } from "./dashboard-v4";

export interface SignalChipStripData {
  chips: V4SignalChip[];
  labels: {
    signalsTitle: string;
    signalsNote: string;
    signalCriteria: string;
    signalNoCriteria: string;
    signalLockedDetail: string;
    signalOpenCard: string;
  };
  /** Pre-rendered popover aria-label per chip key. */
  popoverAria: Record<string, string>;
}

export function signalChipStripData(v4: DashboardV4): SignalChipStripData {
  const s = v4.strings;
  return {
    chips: v4.signalChips,
    labels: {
      signalsTitle: s.signalsTitle,
      signalsNote: s.signalsNote,
      signalCriteria: s.signalCriteria,
      signalNoCriteria: s.signalNoCriteria,
      signalLockedDetail: s.signalLockedDetail,
      signalOpenCard: s.signalOpenCard,
    },
    popoverAria: Object.fromEntries(v4.signalChips.map((chip) => [chip.key, s.signalPopoverAria(chip.label)])),
  };
}
