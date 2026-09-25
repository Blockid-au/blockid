import { describe, expect, it } from "vitest";
import { lifecycleMode } from "./mode";

describe("lifecycleMode (G34-BT4 rollout switch)", () => {
  it("defaults to dry; only an explicit `live` writes; `off` disables", () => {
    expect(lifecycleMode({} as NodeJS.ProcessEnv)).toBe("dry");
    expect(lifecycleMode({ LIFECYCLE_EMAIL: "yes" } as unknown as NodeJS.ProcessEnv)).toBe("dry");
    expect(lifecycleMode({ LIFECYCLE_EMAIL: " LIVE " } as unknown as NodeJS.ProcessEnv)).toBe("live");
    expect(lifecycleMode({ LIFECYCLE_EMAIL: "off" } as unknown as NodeJS.ProcessEnv)).toBe("off");
  });
});
