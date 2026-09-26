// G34 DC10 — the onboarding wizard surfaces the autosave it already runs.

import { describe, expect, it } from "vitest";
import { initialWizardV4State, type WizardV4State } from "@/components/onboarding/wizard-v4";
import { wizardSaveState } from "./onboarding-wizard";

const a: WizardV4State = initialWizardV4State({}, null, null);
const b: WizardV4State = { ...a, step: 2 };

describe("wizardSaveState", () => {
  it("is saving until an outcome for this exact state arrives", () => {
    expect(wizardSaveState(a, null)).toBe("saving");
    expect(wizardSaveState(b, { for: a, server: true, local: true })).toBe("saving");
  });

  it("is saved when the server copy was written", () => {
    expect(wizardSaveState(a, { for: a, server: true, local: true })).toBe("saved");
    expect(wizardSaveState(a, { for: a, server: true, local: false })).toBe("saved");
  });

  it("falls back to saved-on-this-device, then unsaved", () => {
    expect(wizardSaveState(a, { for: a, server: false, local: true })).toBe("saved-local");
    expect(wizardSaveState(a, { for: a, server: false, local: false })).toBe("unsaved");
  });
});
