import { describe, expect, it } from "vitest";
import { CHECK_REGISTRY, implementedFamilies } from "./registry.js";
import { RULES_BY_ID } from "./index.js";

describe("CHECK_REGISTRY", () => {
  it("marks reach/header/brand/link/weight/watch as implemented (M4 wires watch.chain_gap)", () => {
    expect(implementedFamilies().sort()).toEqual(["brand", "header", "link", "reach", "watch", "weight"]);
  });

  it("marks artifact/repo/pkg as not implemented, each with a milestone and reason", () => {
    const stubs = CHECK_REGISTRY.filter((f) => !f.implemented);
    expect(stubs.map((f) => f.family).sort()).toEqual(["artifact", "pkg", "repo"]);
    for (const entry of stubs) {
      expect(entry.landingMilestone, `${entry.family} needs a landingMilestone`).toBeTruthy();
      expect(entry.reason, `${entry.family} needs a reason`).toBeTruthy();
    }
  });

  it("every implemented family's declared rule ids resolve to a real rule function", () => {
    for (const entry of CHECK_REGISTRY) {
      if (!entry.implemented) continue;
      for (const rule of entry.rules) {
        if (entry.family === "link") continue; // link's rule set is discovered per-crawl, not a fixed catalog entry
        expect(RULES_BY_ID[rule.ruleId], `${rule.ruleId} has no registered rule function`).toBeDefined();
      }
    }
  });

  it("covers all nine SPEC §2 families exactly once", () => {
    const families = CHECK_REGISTRY.map((f) => f.family).sort();
    expect(families).toEqual(["artifact", "brand", "header", "link", "pkg", "reach", "repo", "watch", "weight"]);
  });
});
