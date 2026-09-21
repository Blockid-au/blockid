// demo-cohort-labels — the server-side read of the demo cohort copy (G24-C):
// the active locale from the `blockid_lang` cookie (the same rule the
// founder settings page uses), EN under it so a missing VI key still reads
// in English. Pages pass the result to the client components as props.

import "server-only";
import { cookies } from "next/headers";
import { getMessages } from "@/lib/i18n/t";
import { DEMO_COHORT_LABELS_EN, demoCohortLabels, type DemoCohortLabels } from "./demo-cohort-shared";

export async function loadDemoCohortLabels(): Promise<DemoCohortLabels> {
  try {
    const store = await cookies();
    const locale = store.get("blockid_lang")?.value === "vi" ? "vi" : "en";
    const [en, local] = await Promise.all([getMessages("en"), getMessages(locale)]);
    return demoCohortLabels(local, en);
  } catch {
    return DEMO_COHORT_LABELS_EN;
  }
}
