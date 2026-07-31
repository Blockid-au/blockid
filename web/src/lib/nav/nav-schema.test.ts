/**
 * Colocated tests for the dependency-free nav-schema module.
 *
 * The module carries the shared type contracts for the nested sidebar +
 * a single runtime helper — `freezeNavTree` — that defensively freezes a
 * NavGroupV2[] tree so downstream consumers cannot accidentally mutate the
 * canonical NAV_GROUPS_V2 fixture at runtime.
 *
 * These tests pin the deep-freeze contract:
 *   - top-level tree, each group, each subgroup, each subgroup.items[], and
 *     each group.items[] end up frozen.
 *   - the same reference is returned (helper is non-cloning).
 *   - groups without subgroups only freeze items (and vice versa) — the
 *     helper never invents an empty array on the group.
 *   - mixed shapes (group with both items and subgroups) freeze both branches.
 *
 * LucideIcon values are only used at the type level here; a stub cast is
 * sufficient because freezeNavTree never touches the icon.
 */

import { describe, expect, it } from "vitest";
import type { LucideIcon } from "lucide-react";
import { freezeNavTree, type NavGroupV2, type NavLeaf } from "./nav-schema";

const ICON = (() => null) as unknown as LucideIcon;

function leaf(href: string, label = href): NavLeaf {
  return { href, label, icon: ICON };
}

describe("freezeNavTree", () => {
  it("returns the same reference (does not clone)", () => {
    const tree: NavGroupV2[] = [
      { id: "overview", label: "Overview", pillar: "overview", items: [] },
    ];
    const frozen = freezeNavTree(tree);
    expect(frozen).toBe(tree);
  });

  it("freezes an empty tree", () => {
    const tree: NavGroupV2[] = [];
    const frozen = freezeNavTree(tree);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  it("freezes each top-level group", () => {
    const tree: NavGroupV2[] = [
      { id: "a", label: "A", pillar: "now", items: [] },
      { id: "b", label: "B", pillar: "later", items: [] },
    ];
    freezeNavTree(tree);
    expect(Object.isFrozen(tree[0])).toBe(true);
    expect(Object.isFrozen(tree[1])).toBe(true);
  });

  it("freezes group.items[] when present", () => {
    const items: NavLeaf[] = [leaf("/x"), leaf("/y")];
    const tree: NavGroupV2[] = [
      { id: "flat", label: "Flat", pillar: "now", items },
    ];
    freezeNavTree(tree);
    expect(Object.isFrozen(items)).toBe(true);
  });

  it("does not touch groups without items[] or subgroups[]", () => {
    // A group carrying neither array is degenerate but legal per the type —
    // the helper should still freeze the group itself without throwing.
    const tree: NavGroupV2[] = [
      { id: "empty", label: "Empty", pillar: "account" },
    ];
    expect(() => freezeNavTree(tree)).not.toThrow();
    expect(Object.isFrozen(tree[0])).toBe(true);
  });

  it("freezes group.subgroups[] and each subgroup + subgroup.items[]", () => {
    const sgItems: NavLeaf[] = [leaf("/nested")];
    const subgroup = { id: "sg", label: "SG", items: sgItems };
    const tree: NavGroupV2[] = [
      {
        id: "nested",
        label: "Nested",
        pillar: "now",
        subgroups: [subgroup],
      },
    ];
    freezeNavTree(tree);
    expect(Object.isFrozen(tree[0].subgroups)).toBe(true);
    expect(Object.isFrozen(subgroup)).toBe(true);
    expect(Object.isFrozen(sgItems)).toBe(true);
  });

  it("freezes both branches when a group carries items[] AND subgroups[]", () => {
    // Backwards-compat + nested shape can coexist — helper must not skip
    // one branch when the other is present.
    const flatItems: NavLeaf[] = [leaf("/flat")];
    const sgItems: NavLeaf[] = [leaf("/sub")];
    const subgroup = { id: "sg", label: "SG", items: sgItems };
    const tree: NavGroupV2[] = [
      {
        id: "mixed",
        label: "Mixed",
        pillar: "now",
        items: flatItems,
        subgroups: [subgroup],
      },
    ];
    freezeNavTree(tree);
    expect(Object.isFrozen(flatItems)).toBe(true);
    expect(Object.isFrozen(sgItems)).toBe(true);
    expect(Object.isFrozen(subgroup)).toBe(true);
    expect(Object.isFrozen(tree[0].subgroups)).toBe(true);
  });

  it("freezes every subgroup when a group carries multiple subgroups", () => {
    const sg1 = { id: "sg1", label: "SG1", items: [leaf("/a")] };
    const sg2 = { id: "sg2", label: "SG2", items: [leaf("/b")] };
    const tree: NavGroupV2[] = [
      {
        id: "multi",
        label: "Multi",
        pillar: "now",
        subgroups: [sg1, sg2],
      },
    ];
    freezeNavTree(tree);
    expect(Object.isFrozen(sg1)).toBe(true);
    expect(Object.isFrozen(sg2)).toBe(true);
    expect(Object.isFrozen(sg1.items)).toBe(true);
    expect(Object.isFrozen(sg2.items)).toBe(true);
  });

  it("prevents runtime mutation of the top-level tree", () => {
    const tree: NavGroupV2[] = [
      { id: "a", label: "A", pillar: "now", items: [] },
    ];
    const frozen = freezeNavTree(tree);
    // strict-mode throws on write to a frozen array; non-strict silently
    // no-ops. Assert the post-condition either way.
    try {
      (frozen as NavGroupV2[]).push({
        id: "b",
        label: "B",
        pillar: "now",
        items: [],
      });
    } catch {
      /* strict-mode TypeError swallowed — asserted via length below */
    }
    expect(frozen.length).toBe(1);
  });

  it("prevents mutation of a group's items[]", () => {
    const items: NavLeaf[] = [leaf("/only")];
    const tree: NavGroupV2[] = [
      { id: "g", label: "G", pillar: "now", items },
    ];
    freezeNavTree(tree);
    try {
      items.push(leaf("/new"));
    } catch {
      /* strict-mode TypeError swallowed */
    }
    expect(items.length).toBe(1);
    expect(items[0].href).toBe("/only");
  });

  it("prevents mutation of a subgroup's items[]", () => {
    const sgItems: NavLeaf[] = [leaf("/nested")];
    const tree: NavGroupV2[] = [
      {
        id: "n",
        label: "N",
        pillar: "now",
        subgroups: [{ id: "sg", label: "SG", items: sgItems }],
      },
    ];
    freezeNavTree(tree);
    try {
      sgItems.push(leaf("/extra"));
    } catch {
      /* strict-mode TypeError swallowed */
    }
    expect(sgItems.length).toBe(1);
  });

  it("prevents field-level mutation of a frozen group", () => {
    const tree: NavGroupV2[] = [
      { id: "orig", label: "Original", pillar: "now", items: [] },
    ];
    freezeNavTree(tree);
    try {
      tree[0].label = "Hacked";
    } catch {
      /* strict-mode TypeError swallowed */
    }
    expect(tree[0].label).toBe("Original");
  });

  it("prevents field-level mutation of a frozen subgroup", () => {
    const sg = { id: "sg", label: "Original", items: [] as NavLeaf[] };
    const tree: NavGroupV2[] = [
      { id: "g", label: "G", pillar: "now", subgroups: [sg] },
    ];
    freezeNavTree(tree);
    try {
      sg.label = "Hacked";
    } catch {
      /* strict-mode TypeError swallowed */
    }
    expect(sg.label).toBe("Original");
  });

  it("preserves optional gate metadata on the frozen shape", () => {
    // The freeze pass must not strip optional fields the renderer keys off.
    const tree: NavGroupV2[] = [
      {
        id: "g",
        label: "G",
        pillar: "role",
        minTier: "starter",
        segments: ["founder"],
        role: ["advisor"],
        minPhase: 3,
        defaultCollapsed: true,
        items: [
          {
            href: "/x",
            label: "X",
            icon: ICON,
            requiredFeature: "beta_widget",
            minTier: "growth",
            growthPhase: 4,
            segments: ["investor_angel"],
            role: ["advisor"],
            lifecycle: "beta",
            addOnKey: "extra_credits",
          },
        ],
      },
    ];
    const frozen = freezeNavTree(tree);
    const [group] = frozen;
    expect(group.minTier).toBe("starter");
    expect(group.segments).toEqual(["founder"]);
    expect(group.role).toEqual(["advisor"]);
    expect(group.minPhase).toBe(3);
    expect(group.defaultCollapsed).toBe(true);
    const [only] = group.items!;
    expect(only.requiredFeature).toBe("beta_widget");
    expect(only.minTier).toBe("growth");
    expect(only.growthPhase).toBe(4);
    expect(only.lifecycle).toBe("beta");
    expect(only.addOnKey).toBe("extra_credits");
  });

  it("is idempotent — freezing an already-frozen tree is a no-op", () => {
    const tree: NavGroupV2[] = [
      {
        id: "g",
        label: "G",
        pillar: "now",
        items: [leaf("/x")],
        subgroups: [{ id: "sg", label: "SG", items: [leaf("/y")] }],
      },
    ];
    const first = freezeNavTree(tree);
    const second = freezeNavTree(first);
    expect(second).toBe(first);
    expect(Object.isFrozen(second)).toBe(true);
  });
});
