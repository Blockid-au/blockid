"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import type { CfoScenarioResult } from "@/lib/valuation/cfo-scenario";
import type { CfoMethodInput, CfoSourcedNumber } from "@/lib/valuation/cfo-methodology-core";
import { fcffFromOperatingSchedule } from "@/lib/valuation/cfo-methodology-core";

const schedule = [
  ["ebit", "Operating profit (EBIT)"], ["tax", "Cash taxes on operating profit"],
  ["da", "Depreciation and amortisation"], ["capex", "Capital expenditure"],
  ["nwc", "Change in operating working capital"],
] as const;
const fields = [["wacc", "Annual WACC (%)"], ["growth", "Terminal growth (%)"], ["terminal", "Next annual FCFF at steady state"],
  ["cash", "Excess cash"], ["assets", "Non-operating assets"], ["debt", "Debt and debt-like obligations"], ["claims", "Other claims"]] as const;
const inputClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";

export function CfoScenarioClient({ entityId }: { entityId: string }) {
  const [result, setResult] = useState<CfoScenarioResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setResult(null);
    try {
      const form = new FormData(event.currentTarget);
      const text = (name: string) => String(form.get(name) ?? "").trim();
      const amount = (name: string) => {
        if (!text(name)) throw new Error(`Enter ${name}; use 0 only if explicitly applicable.`);
        const value = Number(text(name));
        if (!Number.isFinite(value)) throw new Error(`Invalid ${name}`);
        return value;
      };
      const valuationDate = text("date"), currency = text("currency"), reference = text("source");
      const evidenceRevision = text("revision");
      const sourced = (value: number, locator: string, unit = currency): CfoSourcedNumber => ({ value, unit, evidence: {
        id: locator, entityId, revision: evidenceRevision, observedAt: valuationDate, reference, locator,
        status: "assumed", rationale: `Management scenario: ${locator}. ${text("rationale")}`,
      } });
      const flows = Array.from({ length: 5 }, (_, index) => {
        const values = Object.fromEntries(schedule.map(([key]) => [key, amount(`${key}-${index}`)]));
        const cashFlow = fcffFromOperatingSchedule({ ebit: values.ebit, cashOperatingTaxes: values.tax, depreciation: values.da, capex: values.capex, changeInOperatingWorkingCapital: values.nwc });
        return { year: index + 1, cashFlow: sourced(cashFlow,
          `Year ${index + 1}: EBIT ${values.ebit} - cash operating tax ${values.tax} + D&A ${values.da} - capex ${values.capex} - change NWC ${values.nwc}`) };
      });
      const method: CfoMethodInput = {
        method: "fcff", context: { entityId, evidenceRevision, valuationDate, currency, priceBasis: "nominal" },
        timing: "annual_end_period", cashFlowPriceBasis: "nominal", ratePriceBasis: "nominal", rateBasis: "wacc", flows,
        discountRate: sourced(amount("wacc") / 100, "WACC", "annual_decimal"),
        terminalPolicy: "going_concern",
        terminal: { nextAnnualCashFlow: sourced(amount("terminal"), "Steady-state FCFF"), growthRate: sourced(amount("growth") / 100, "Terminal growth", "annual_decimal"),
          steadyStateEvidence: { ...sourced(0, "Steady-state and reinvestment rationale").evidence, rationale: text("rationale") } },
        bridge: { excessCash: sourced(amount("cash"), "Excess cash"), nonOperatingAssets: sourced(amount("assets"), "Non-operating assets"),
          debt: sourced(amount("debt"), "Debt"), otherClaims: sourced(amount("claims"), "Other claims"), excludesOperatingCashFlows: true },
      };
      const response = await fetch("/api/valuation/scenario", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ methods: [method] }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to calculate scenario");
      setResult(payload.result);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to calculate scenario"); }
    finally { setBusy(false); }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "cfo-valuation-scenario.json"; a.click(); URL.revokeObjectURL(url);
  }
  return <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <Link href="/workspace/valuation/cfo" className="text-sm underline">Back to CFO dashboard</Link>
    <h1 className="text-2xl font-semibold">CFO valuation scenario</h1>
    <p className="max-w-3xl text-sm text-muted-foreground">Explore a five-year cash-flow valuation using your financial assumptions. Enter amounts in one currency, with explicit zeros where appropriate. This preview does not update your official valuation or SVI score.</p>
    <form onSubmit={calculate} className="space-y-6" onChange={() => setResult(null)}>
      <fieldset disabled={busy} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">Valuation date<input className={inputClass} name="date" type="date" required /></label>
        <label className="space-y-1 text-sm">Currency<select name="currency" className={inputClass}><option>AUD</option><option>USD</option><option>EUR</option><option>GBP</option><option>VND</option></select></label>
        <label className="space-y-1 text-sm">Source revision<input name="revision" required className={inputClass} placeholder="Budget version or document date" /></label>
        <label className="space-y-1 text-sm">Source document or assumption memo<input name="source" required className={inputClass} /></label>
      </div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-sm"><caption className="p-3 text-left">Nominal forecasts — full years after the valuation date, with cash flows at each year end</caption>
        <thead><tr><th className="p-3">Financial input</th>{[1,2,3,4,5].map(year => <th className="p-3" key={year}>Year {year}</th>)}</tr></thead>
        <tbody>{schedule.map(([key,label]) => <tr key={key}><th scope="row" className="p-3 font-medium">{label}</th>{[0,1,2,3,4].map(index => <td className="min-w-32 p-2" key={index}><input aria-label={`${label}, year ${index+1}`} className={inputClass} name={`${key}-${index}`} type="number" step="any" min={["tax","da","capex"].includes(key) ? 0 : undefined} required /></td>)}</tr>)}</tbody>
      </table></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{fields.map(([name,label]) => <label key={name} className="space-y-1 text-sm">{label}<input name={name} type="number" step="any" min={name === "growth" ? undefined : 0} required className={inputClass} /></label>)}</div>
      <label className="block space-y-1 text-sm">Discount-rate, steady-state and reinvestment rationale<textarea name="rationale" required rows={3} className={inputClass} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" required />Cash and non-operating assets above are additional to the operating cash flows; debt and claims are counted once. This scenario assumes no special share-class rights.</label>
      <button disabled={busy} className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{busy ? "Calculating…" : "Calculate scenario"}</button>
      </fieldset>
    </form>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {result && <section aria-live="polite" className="space-y-4 rounded-xl border p-5">
      <h2 className="text-lg font-semibold">Scenario result — assumptions require review</h2>
      {result.methods.map((method,index) => <div key={index}>{method.status === "eligible" ? <dl className="grid gap-4 sm:grid-cols-2">{Object.entries(method.values).map(([key,value]) => <div key={key}><dt>{key === "enterpriseValue" ? "Operating enterprise value" : "Equity value"}</dt><dd className="text-2xl font-semibold">{new Intl.NumberFormat("en-AU", { style: "currency", currency: result.context.currency, maximumFractionDigits: 0 }).format(value)}</dd></div>)}</dl> : <ul className="list-disc pl-5">{method.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}</div>)}
      <p className="text-sm">The result is a scenario estimate, subject to the source assumptions, funding feasibility and ownership terms.</p>
      <button type="button" className="rounded border px-4 py-2 text-sm" onClick={download}>Download calculation and sources</button>
    </section>}
  </main>;
}
