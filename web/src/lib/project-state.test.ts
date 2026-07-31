// Colocated vitest for the pure surfaces of `project-state.ts` — the module
// that is the single source of truth for the CEO-led self-upgrade loop
// (version bumps, plan tasks, milestones, and the two human-readable
// markdown mirrors written into content/reports on every save).
//
// The IO surfaces (`loadProjectState`, `saveProjectState`, `syncPackageVersion`)
// resolve their target paths at module load from `BLOCKID_WEB_DIR`, so they
// are only safe to exercise with hoisted env stubbing + a real tmpdir — out
// of scope for this pin. The pure functions below back every downstream
// consumer (CEO plan renderer, agent-deploy versioning, architecture doc)
// and are the correctness contract this file locks in.
//
// Contract pinned here:
//
//   • bumpVersion — patch/minor/major follow strict semver reset rules (a
//     minor bump zeros the patch; a major bump zeros minor + patch). Missing
//     or non-numeric segments coerce to 0 via `parseInt(_, 10) || 0`, so
//     "abc.def.ghi" patch → "0.0.1" and "1.02.03" patch → "1.2.4" (no leading
//     zeros preserved). Extra segments past the third are silently ignored.
//
//   • maxImpact — reduces to the highest-rank impact using
//     IMPACT_RANK = { patch: 0, minor: 1, major: 2 }; an empty array
//     defaults to "patch" (the reducer's initial value).
//
//   • nextTaskId — deterministic (no Math.random): counts EVERY task ever
//     recorded (plan.tasks + sum of milestone.taskIds), adds 1, zero-pads to
//     4 digits with `T` prefix. Padding does not truncate on overflow, so
//     10000 → "T10000". Milestone tasks count even after being moved out
//     of plan.tasks — the id space is monotonic.
//
//   • nextMilestoneId — `M` + zero-padded (3) count-plus-one. Same
//     non-truncating padding contract as tasks.
//
//   • renderPlanMarkdown — active section = pending+in_progress only (done
//     and failed are excluded); recent section = last 10 done/failed in
//     reverse chronological order; milestones section = last 12 in reverse
//     order; decidedAt renders as "—" when blank. Empty-state fallbacks are
//     the exact human strings "_None — awaiting next CEO decision._",
//     "_Nothing shipped yet._", "_No milestones yet._". Commit shas render
//     backticked when present on a shipped task.
//
//   • renderArchitectureMarkdown — lastReviewedAt "" renders as "—";
//     empty summary → "_Not yet summarised._"; empty notes → "_No
//     architecture changes recorded._"; notes cap at last 20, reversed.

import { describe, expect, it } from "vitest";
import {
  bumpVersion,
  maxImpact,
  nextMilestoneId,
  nextTaskId,
  renderArchitectureMarkdown,
  renderPlanMarkdown,
  type Milestone,
  type PlanTask,
  type ProjectState,
  type TaskStatus,
  type VersionImpact,
} from "./project-state";

// ─── fixture builders ────────────────────────────────────────────────────

function makeTask(overrides: Partial<PlanTask> = {}): PlanTask {
  return {
    id: "T0001",
    agent: "ceo",
    title: "Ship the CEO loop",
    rationale: "Because the loop needs shipping",
    versionImpact: "patch",
    status: "pending",
    createdAt: "2026-07-31T00:00:00.000Z",
    ...overrides,
  };
}

function makeMilestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    id: "M001",
    title: "First milestone",
    version: "0.1.0",
    completedAt: "2026-07-31T00:00:00.000Z",
    taskIds: ["T0001"],
    ...overrides,
  };
}

function makeState(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    version: "0.1.0",
    updatedAt: "2026-07-31T00:00:00.000Z",
    architecture: { summary: "", lastReviewedAt: "", notes: [] },
    plan: { decidedAt: "", decidedBy: "ceo", tasks: [] },
    milestones: [],
    history: [],
    ...overrides,
  };
}

// ─── bumpVersion ─────────────────────────────────────────────────────────

describe("bumpVersion", () => {
  it("patch bump increments only the patch segment", () => {
    expect(bumpVersion("1.2.3", "patch")).toBe("1.2.4");
  });

  it("minor bump increments minor and resets patch to 0", () => {
    expect(bumpVersion("1.2.3", "minor")).toBe("1.3.0");
  });

  it("major bump increments major and resets both minor and patch to 0", () => {
    expect(bumpVersion("1.2.3", "major")).toBe("2.0.0");
  });

  it("patch on 0.0.0 → 0.0.1", () => {
    expect(bumpVersion("0.0.0", "patch")).toBe("0.0.1");
  });

  it("minor on 0.0.0 → 0.1.0", () => {
    expect(bumpVersion("0.0.0", "minor")).toBe("0.1.0");
  });

  it("major on 0.0.0 → 1.0.0", () => {
    expect(bumpVersion("0.0.0", "major")).toBe("1.0.0");
  });

  it("patch on 9.9.9 → 9.9.10 (no carry)", () => {
    expect(bumpVersion("9.9.9", "patch")).toBe("9.9.10");
  });

  it("minor on 9.9.9 → 9.10.0 (no carry into major)", () => {
    expect(bumpVersion("9.9.9", "minor")).toBe("9.10.0");
  });

  it("single-segment version — major is the only impact that fully round-trips", () => {
    // `.split(".").map(parseInt||0)` runs on present indices only, so the
    // destructured `min`/`pat` for "1" are literal `undefined`, not 0. Major
    // bump is safe because it hard-codes ".0.0". Minor/patch leak the
    // undefined-arithmetic result — pinned here so a defensive fix in the
    // source (e.g. `[maj = 0, min = 0, pat = 0]`) shows up as a diff here too.
    expect(bumpVersion("1", "major")).toBe("2.0.0");
    expect(bumpVersion("1", "minor")).toBe("1.NaN.0");
    expect(bumpVersion("1", "patch")).toBe("1.undefined.NaN");
  });

  it("two-segment version — patch bump leaks NaN because pat is undefined", () => {
    expect(bumpVersion("2.5", "minor")).toBe("2.6.0");
    expect(bumpVersion("2.5", "patch")).toBe("2.5.NaN");
    expect(bumpVersion("2.5", "major")).toBe("3.0.0");
  });

  it("non-numeric segments coerce to 0 via `parseInt(_, 10) || 0`", () => {
    expect(bumpVersion("abc.def.ghi", "patch")).toBe("0.0.1");
    expect(bumpVersion("abc.def.ghi", "minor")).toBe("0.1.0");
    expect(bumpVersion("abc.def.ghi", "major")).toBe("1.0.0");
  });

  it("leading zeros in segments are stripped by parseInt", () => {
    // "1.02.03" → parseInt("02",10)=2, parseInt("03",10)=3 → then patch bump → "1.2.4"
    expect(bumpVersion("1.02.03", "patch")).toBe("1.2.4");
  });

  it("extra segments beyond the third are silently ignored", () => {
    // destructuring `[maj,min,pat]` only takes the first three
    expect(bumpVersion("1.2.3.4.5", "patch")).toBe("1.2.4");
    expect(bumpVersion("1.2.3.4.5", "minor")).toBe("1.3.0");
  });

  it("empty string version → 0 baseline (only major fully round-trips)", () => {
    // "" split = [""]; parseInt("",10)=NaN; NaN||0 = 0 → [0]. Destructure
    // yields maj=0, min=undefined, pat=undefined. Same undefined-leak as the
    // single-segment case above.
    expect(bumpVersion("", "major")).toBe("1.0.0");
    expect(bumpVersion("", "minor")).toBe("0.NaN.0");
    expect(bumpVersion("", "patch")).toBe("0.undefined.NaN");
  });

  it("mixed numeric+garbage: garbage segments coerce individually", () => {
    // "1.x.3" → maj=1, min=NaN||0=0, pat=3 → minor bump → "1.1.0"
    expect(bumpVersion("1.x.3", "minor")).toBe("1.1.0");
    expect(bumpVersion("1.x.3", "patch")).toBe("1.0.4");
  });
});

// ─── maxImpact ───────────────────────────────────────────────────────────

describe("maxImpact", () => {
  it("empty array defaults to patch (reducer initial value)", () => {
    expect(maxImpact([])).toBe("patch");
  });

  it("all-patch input returns patch", () => {
    expect(maxImpact(["patch", "patch", "patch"])).toBe("patch");
  });

  it("returns minor when the highest is minor", () => {
    expect(maxImpact(["patch", "minor"])).toBe("minor");
    expect(maxImpact(["minor", "patch"])).toBe("minor");
    expect(maxImpact(["minor", "minor"])).toBe("minor");
  });

  it("returns major when any impact is major", () => {
    expect(maxImpact(["major"])).toBe("major");
    expect(maxImpact(["patch", "major"])).toBe("major");
    expect(maxImpact(["major", "patch"])).toBe("major");
    expect(maxImpact(["minor", "major", "patch"])).toBe("major");
  });

  it("single-element array returns that element", () => {
    (["patch", "minor", "major"] as VersionImpact[]).forEach((impact) => {
      expect(maxImpact([impact])).toBe(impact);
    });
  });

  it("uses strict `>` on IMPACT_RANK — ties keep the current accumulator", () => {
    // patch=0, minor=1, major=2. Ties should not swap. Behaviour is stable.
    expect(maxImpact(["minor", "minor"])).toBe("minor");
    expect(maxImpact(["major", "major"])).toBe("major");
  });
});

// ─── nextTaskId ──────────────────────────────────────────────────────────

describe("nextTaskId", () => {
  it("empty state produces T0001", () => {
    expect(nextTaskId(makeState())).toBe("T0001");
  });

  it("counts plan tasks only when no milestones exist", () => {
    const state = makeState({
      plan: {
        decidedAt: "",
        decidedBy: "ceo",
        tasks: [makeTask({ id: "T0001" }), makeTask({ id: "T0002" }), makeTask({ id: "T0003" })],
      },
    });
    expect(nextTaskId(state)).toBe("T0004");
  });

  it("counts every taskId recorded across milestones (monotonic id space)", () => {
    const state = makeState({
      milestones: [makeMilestone({ id: "M001", taskIds: ["T0001", "T0002"] })],
    });
    // 0 plan tasks + 2 milestone tasks + 1 = T0003
    expect(nextTaskId(state)).toBe("T0003");
  });

  it("sums plan tasks and milestone taskIds together", () => {
    const state = makeState({
      plan: {
        decidedAt: "",
        decidedBy: "ceo",
        tasks: [makeTask({ id: "T0004" }), makeTask({ id: "T0005" }), makeTask({ id: "T0006" })],
      },
      milestones: [
        makeMilestone({ id: "M001", taskIds: ["T0001"] }),
        makeMilestone({ id: "M002", taskIds: ["T0002", "T0003"] }),
      ],
    });
    // 3 plan + (1+2) milestone + 1 = 7
    expect(nextTaskId(state)).toBe("T0007");
  });

  it("zero-pads to 4 digits", () => {
    const state = makeState({
      plan: {
        decidedAt: "",
        decidedBy: "ceo",
        tasks: Array.from({ length: 8 }, (_, i) => makeTask({ id: `T${i + 1}` })),
      },
    });
    expect(nextTaskId(state)).toBe("T0009");
  });

  it("padStart does not truncate — overflow past 9999 grows the id", () => {
    const state = makeState({
      milestones: [makeMilestone({ id: "M001", taskIds: Array.from({ length: 9999 }, (_, i) => `T${i + 1}`) })],
    });
    expect(nextTaskId(state)).toBe("T10000");
  });

  it("counts done + pending tasks equally (status is irrelevant)", () => {
    const state = makeState({
      plan: {
        decidedAt: "",
        decidedBy: "ceo",
        tasks: [
          makeTask({ id: "T0001", status: "done" }),
          makeTask({ id: "T0002", status: "failed" }),
          makeTask({ id: "T0003", status: "in_progress" }),
        ],
      },
    });
    expect(nextTaskId(state)).toBe("T0004");
  });
});

// ─── nextMilestoneId ─────────────────────────────────────────────────────

describe("nextMilestoneId", () => {
  it("empty state produces M001", () => {
    expect(nextMilestoneId(makeState())).toBe("M001");
  });

  it("increments by 1 based on milestones.length", () => {
    const state = makeState({
      milestones: [makeMilestone({ id: "M001" })],
    });
    expect(nextMilestoneId(state)).toBe("M002");
  });

  it("zero-pads to 3 digits", () => {
    const state = makeState({
      milestones: Array.from({ length: 8 }, (_, i) => makeMilestone({ id: `M${i + 1}` })),
    });
    expect(nextMilestoneId(state)).toBe("M009");
  });

  it("does not consider taskIds inside milestones (only the count of milestones matters)", () => {
    const state = makeState({
      milestones: [
        makeMilestone({ id: "M001", taskIds: ["T0001", "T0002", "T0003", "T0004"] }),
      ],
    });
    expect(nextMilestoneId(state)).toBe("M002");
  });

  it("padStart does not truncate at 4 digits", () => {
    const state = makeState({
      milestones: Array.from({ length: 999 }, (_, i) => makeMilestone({ id: `M${i + 1}` })),
    });
    expect(nextMilestoneId(state)).toBe("M1000");
  });
});

// ─── renderPlanMarkdown ──────────────────────────────────────────────────

describe("renderPlanMarkdown", () => {
  it("empty state renders the three empty-state fallback strings verbatim", () => {
    const md = renderPlanMarkdown(makeState());
    expect(md).toContain("# Implementing Plan — BlockID.au");
    expect(md).toContain("**Version:** v0.1.0");
    expect(md).toContain("**Decided by:** ceo");
    // decidedAt "" → renders as "—"
    expect(md).toContain("(—)");
    expect(md).toContain("_None — awaiting next CEO decision._");
    expect(md).toContain("_Nothing shipped yet._");
    expect(md).toContain("_No milestones yet._");
  });

  it("renders decidedAt when set (no dash fallback)", () => {
    const md = renderPlanMarkdown(
      makeState({ plan: { decidedAt: "2026-07-31T05:47:00.000Z", decidedBy: "ceo", tasks: [] } }),
    );
    expect(md).toContain("(2026-07-31T05:47:00.000Z)");
    expect(md).not.toContain("(—)");
  });

  it("active tasks (pending + in_progress) render in the pipe table with correct icons", () => {
    const md = renderPlanMarkdown(
      makeState({
        plan: {
          decidedAt: "",
          decidedBy: "ceo",
          tasks: [
            makeTask({ id: "T0001", agent: "cto", title: "Wire nudge engine", status: "pending", versionImpact: "minor" }),
            makeTask({ id: "T0002", agent: "cmo", title: "Draft launch copy", status: "in_progress", versionImpact: "patch" }),
          ],
        },
      }),
    );
    expect(md).toContain("| ID | Agent | Task | Impact | Status |");
    expect(md).toContain("| T0001 | CTO | Wire nudge engine | minor | ⬜ pending |");
    expect(md).toContain("| T0002 | CMO | Draft launch copy | patch | 🔄 in_progress |");
    expect(md).not.toContain("_None — awaiting next CEO decision._");
  });

  it("done + failed tasks are excluded from the active section", () => {
    const md = renderPlanMarkdown(
      makeState({
        plan: {
          decidedAt: "",
          decidedBy: "ceo",
          tasks: [
            makeTask({ id: "T0001", status: "done" }),
            makeTask({ id: "T0002", status: "failed" }),
          ],
        },
      }),
    );
    // no active tasks → empty-state marker present in the active section
    expect(md).toContain("_None — awaiting next CEO decision._");
  });

  it("recent section shows done + failed tasks with icons + backticked commit", () => {
    const md = renderPlanMarkdown(
      makeState({
        plan: {
          decidedAt: "",
          decidedBy: "ceo",
          tasks: [
            makeTask({ id: "T0001", agent: "ceo", title: "Ship v1", status: "done", commit: "abc1234" }),
            makeTask({ id: "T0002", agent: "cto", title: "Break v2", status: "failed" }),
          ],
        },
      }),
    );
    expect(md).toContain("✅ `T0001` **CEO** — Ship v1 (`abc1234`)");
    expect(md).toContain("❌ `T0002` **CTO** — Break v2");
    expect(md).not.toContain("_Nothing shipped yet._");
  });

  it("recent section caps at last 10, reversed (newest first)", () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      makeTask({ id: `T${String(i + 1).padStart(4, "0")}`, title: `Task ${i + 1}`, status: "done" }),
    );
    const md = renderPlanMarkdown(makeState({ plan: { decidedAt: "", decidedBy: "ceo", tasks } }));
    // last 10 (T0003..T0012) reversed → T0012 first, T0003 last
    // T0001 and T0002 dropped (only last 10 kept)
    expect(md).not.toContain("`T0001`");
    expect(md).not.toContain("`T0002`");
    expect(md).toContain("`T0003`");
    expect(md).toContain("`T0012`");
    const idx12 = md.indexOf("`T0012`");
    const idx3 = md.indexOf("`T0003`");
    expect(idx12).toBeGreaterThan(-1);
    expect(idx3).toBeGreaterThan(-1);
    expect(idx12).toBeLessThan(idx3); // reversed order
  });

  it("milestones section caps at last 12, reversed", () => {
    const milestones = Array.from({ length: 15 }, (_, i) =>
      makeMilestone({
        id: `M${String(i + 1).padStart(3, "0")}`,
        title: `Milestone ${i + 1}`,
        version: `0.0.${i + 1}`,
        completedAt: "2026-07-31T00:00:00.000Z",
        taskIds: [`T${i + 1}`],
      }),
    );
    const md = renderPlanMarkdown(makeState({ milestones }));
    // M001..M003 dropped (only last 12 kept), M015 shown first
    expect(md).not.toContain("**M001**");
    expect(md).not.toContain("**M003**");
    expect(md).toContain("**M004**");
    expect(md).toContain("**M015**");
    const idx15 = md.indexOf("**M015**");
    const idx4 = md.indexOf("**M004**");
    expect(idx15).toBeLessThan(idx4);
  });

  it("milestone row includes version, title, completedAt slice(0,10), and task count", () => {
    const md = renderPlanMarkdown(
      makeState({
        milestones: [
          makeMilestone({
            id: "M042",
            title: "Ship the nudge engine",
            version: "1.2.3",
            completedAt: "2026-07-31T05:47:00.000Z",
            taskIds: ["T0001", "T0002", "T0003"],
          }),
        ],
      }),
    );
    expect(md).toContain("**M042** v1.2.3 — Ship the nudge engine (2026-07-31, 3 tasks)");
  });

  it("shipped task without a commit renders without the backticked commit suffix", () => {
    const md = renderPlanMarkdown(
      makeState({
        plan: {
          decidedAt: "",
          decidedBy: "ceo",
          tasks: [makeTask({ id: "T0001", agent: "ceo", title: "Ship v1", status: "done" })],
        },
      }),
    );
    expect(md).toContain("✅ `T0001` **CEO** — Ship v1");
    // no trailing backtick pair after the title
    expect(md).not.toMatch(/Ship v1 \(`.*?`\)/);
  });

  it("all four TaskStatus icons render distinctly", () => {
    const icons: Record<TaskStatus, string> = { pending: "⬜", in_progress: "🔄", done: "✅", failed: "❌" };
    const state = makeState({
      plan: {
        decidedAt: "",
        decidedBy: "ceo",
        tasks: [
          makeTask({ id: "T0001", status: "pending" }),
          makeTask({ id: "T0002", status: "in_progress" }),
          makeTask({ id: "T0003", status: "done" }),
          makeTask({ id: "T0004", status: "failed" }),
        ],
      },
    });
    const md = renderPlanMarkdown(state);
    // pending + in_progress render in the active table
    expect(md).toContain(`${icons.pending} pending`);
    expect(md).toContain(`${icons.in_progress} in_progress`);
    // done + failed render in the recent section
    expect(md).toContain(icons.done);
    expect(md).toContain(icons.failed);
  });
});

// ─── renderArchitectureMarkdown ──────────────────────────────────────────

describe("renderArchitectureMarkdown", () => {
  it("empty state renders both fallback strings and lastReviewedAt as `—`", () => {
    const md = renderArchitectureMarkdown(makeState());
    expect(md).toContain("# Architecture — BlockID.au (living)");
    expect(md).toContain("**Version:** v0.1.0");
    expect(md).toContain("**Last reviewed:** —");
    expect(md).toContain("_Not yet summarised._");
    expect(md).toContain("_No architecture changes recorded._");
  });

  it("renders lastReviewedAt when set (no dash fallback)", () => {
    const md = renderArchitectureMarkdown(
      makeState({ architecture: { summary: "", lastReviewedAt: "2026-07-31", notes: [] } }),
    );
    expect(md).toContain("**Last reviewed:** 2026-07-31");
    expect(md).not.toContain("**Last reviewed:** —");
  });

  it("renders a non-empty summary in place of the fallback", () => {
    const md = renderArchitectureMarkdown(
      makeState({
        architecture: {
          summary: "Standalone Next.js on port 4000 behind Cloudflare + system nginx",
          lastReviewedAt: "",
          notes: [],
        },
      }),
    );
    expect(md).toContain("Standalone Next.js on port 4000 behind Cloudflare + system nginx");
    expect(md).not.toContain("_Not yet summarised._");
  });

  it("renders notes reversed (newest first), one bullet per line", () => {
    const md = renderArchitectureMarkdown(
      makeState({
        architecture: {
          summary: "",
          lastReviewedAt: "",
          notes: ["oldest", "middle", "newest"],
        },
      }),
    );
    expect(md).toContain("- newest");
    expect(md).toContain("- middle");
    expect(md).toContain("- oldest");
    // reversed order
    expect(md.indexOf("- newest")).toBeLessThan(md.indexOf("- middle"));
    expect(md.indexOf("- middle")).toBeLessThan(md.indexOf("- oldest"));
    expect(md).not.toContain("_No architecture changes recorded._");
  });

  it("notes section caps at last 20, reversed", () => {
    const notes = Array.from({ length: 25 }, (_, i) => `note-${String(i + 1).padStart(2, "0")}`);
    const md = renderArchitectureMarkdown(
      makeState({ architecture: { summary: "", lastReviewedAt: "", notes } }),
    );
    // first 5 dropped, last 20 kept and reversed
    expect(md).not.toContain("- note-01");
    expect(md).not.toContain("- note-05");
    expect(md).toContain("- note-06");
    expect(md).toContain("- note-25");
    // reversed → note-25 above note-06
    expect(md.indexOf("- note-25")).toBeLessThan(md.indexOf("- note-06"));
  });

  it("version segment always reflects state.version", () => {
    const md = renderArchitectureMarkdown(makeState({ version: "42.7.1" }));
    expect(md).toContain("**Version:** v42.7.1");
  });
});
