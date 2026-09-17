// G14-S37: the execution.* subset of the i18n catalogue handed to the
// founder profile client (EN merged under the active locale so a missing VI
// string still reads in English; the client bundle never carries the whole
// catalogue). Pure.

export function pickExecutionLabels(en: Record<string, string>, local: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(en)) if (k.startsWith("execution.")) out[k] = v;
  for (const [k, v] of Object.entries(local)) if (k.startsWith("execution.") && v) out[k] = v;
  return out;
}
