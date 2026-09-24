import { createHash } from "node:crypto";
import { CFO_METHOD_REGISTRY, evaluateCfoMethod, type CfoMethodInput } from "./cfo-methodology-core";
import { calculateCfoProjection, type CfoProjectionInput } from "./cfo-projection-core";
import { evaluateCfoProjectionValuation, type CfoProjectionValuationInput } from "./cfo-projection-valuation";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Non-finite input");
  return JSON.stringify(value);
}

export interface CfoScenarioInput {
  methods: CfoMethodInput[];
  projection?: CfoProjectionInput;
  projectionValuation?: Omit<CfoProjectionValuationInput, "projection" | "context">;
}

/** Preview only. A client-supplied source label never becomes an accepted
 * evidence record. Persisted official publication requires a separate trusted
 * producer/reviewer path; this endpoint cannot overwrite scores or reports. */
export function calculateCfoScenario(input: CfoScenarioInput) {
  if (!Array.isArray(input.methods) || input.methods.length < 1 || input.methods.length > 12) throw new Error("Supply 1–12 method scenarios");
  const context = input.methods[0]?.context;
  if (!context) throw new Error("Explicit valuation context required");
  for (const method of input.methods) {
    if (canonicalJson(method.context) !== canonicalJson(context)) throw new Error("All methods must use the same entity, evidence revision, date, currency and price basis");
  }
  if (input.projection && (input.projection.currency !== context.currency || input.projection.scenario.evidenceSetHash !== context.evidenceRevision)) {
    throw new Error("Projection and valuation evidence revision/currency must match");
  }
  const projection = input.projection ? calculateCfoProjection(input.projection) : null;
  if (input.projectionValuation && !projection) throw new Error("A projection is required for linked cash-flow valuation");
  const linkedProjectionValuation = input.projectionValuation && projection
    ? evaluateCfoProjectionValuation({ ...input.projectionValuation, projection, context }) : null;
  const methods = input.methods.map(method => {
    const result = evaluateCfoMethod(method as unknown);
    if (!("method" in result)) throw new Error(result.issues.join("; "));
    return result;
  });
  const payload = {
    schemaVersion: "cfo-scenario/1" as const,
    status: "scenario_only" as const,
    context: { ...context },
    inputs: JSON.parse(canonicalJson(input)) as CfoScenarioInput,
    methods,
    projection,
    linkedProjectionValuation,
    limitations: [
      "User-supplied sources and assumptions have not been independently admitted or reviewed.",
      "Method results are not automatically blended or accepted as the company's official value.",
      "Assessment scores and historical ownership rights are unchanged.",
      ...(projection ? ["Projection schedules and supplied method cash flows must be reconciled before publication."] : []),
    ],
  };
  // Includes inputs, outputs and methodology versions; excludes wall-clock time
  // so an unchanged scenario gets the same digest on reload/export.
  return { ...payload, resultHash: createHash("sha256").update(canonicalJson(payload)).digest("hex") };
}

export type CfoScenarioResult = ReturnType<typeof calculateCfoScenario>;

/** Export uses the computed snapshot, never another AI request. */
export function cfoScenarioCsv(result: CfoScenarioResult): string {
  const escape = (v: unknown) => `"${String(v ?? "").replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""')}"`;
  const rows: unknown[][] = [["result_hash", "status", "method", "method_version", "currency", "enterprise_value", "equity_value", "pre_money", "post_money", "issues"]];
  const exportMethods = [...result.methods, ...(result.linkedProjectionValuation?.status === "scenario_only" ? [result.linkedProjectionValuation.methodResult] : [])];
  for (const method of exportMethods) {
    const values = method.status === "eligible" ? method.values : {};
    rows.push([result.resultHash, result.status, method.method, method.methodVersion, result.context.currency,
      values.enterpriseValue, values.equityValue, values.preMoney, values.postMoney, method.issues.join("; ")]);
  }
  if (result.linkedProjectionValuation?.status === "not_estimable") rows.push([
    result.resultHash, result.status, "fcfe", CFO_METHOD_REGISTRY.fcfe.version, result.context.currency,
    "", "", "", "", result.linkedProjectionValuation.issues.join("; "),
  ]);
  return rows.map(row => row.map(escape).join(",")).join("\r\n");
}
