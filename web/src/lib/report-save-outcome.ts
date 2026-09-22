/** Generation, durable saving and delivery are separate outcomes. Optional on old streams. */
export type ReportSaveStatus = "saved" | "save_failed" | "not_requested";

/** A section retry cannot repair a failed full-document save. Full runs reset first. */
export function retainReportSaveOutcome(previous: ReportSaveStatus | undefined, incoming: ReportSaveStatus | undefined): ReportSaveStatus | undefined {
  return previous === "save_failed" && incoming !== "saved" ? previous : incoming;
}
