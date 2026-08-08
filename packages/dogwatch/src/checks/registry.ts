/**
 * The check catalog (SPEC §12 M2 gate: "the repo/pkg/artifact/watch families
 * are registry entries marked with their landing milestone and reason").
 * This is the single source the future `/checks` page (M6) renders from, so
 * docs cannot drift from what the runner actually does (SPEC §10).
 *
 * `implemented: false` families have no wiring anywhere in the pipeline —
 * not even an attempted-then-skipped check — because there is nothing yet
 * that could honestly attempt them (no token, no deployed sibling to poll).
 * That is a different, stronger statement than `skipped:not_published`,
 * which IS an attempted (and consciously declined) check on a real target.
 */
import type { Family } from "../record/schema.js";
import { HEADER_MISSING, HEADER_VALUE_CHANGED } from "./header.js";
import { BRAND_BACKLINK_MISSING, BRAND_FAVICON_MISSING } from "./brand.js";
import { LINK_BROKEN, LINK_OFFSITE_REDIRECT, LINK_UNVERIFIABLE } from "./link.js";
import { REACH_REDIRECT_CHAIN_CHANGED, REACH_STATUS_NOT_200 } from "./reach.js";
import { WEIGHT_BUDGET_EXCEEDED } from "./weight.js";
import { WATCH_CHAIN_GAP } from "./watch.js";

export interface RuleCatalogEntry {
  ruleId: string;
  asserts: string;
}

export interface FamilyCatalogEntry {
  family: Family;
  implemented: boolean;
  /** SPEC §12 milestone row this family lands in, e.g. "M4". Present
   * whenever `implemented === false`. */
  landingMilestone?: string;
  /** Why it cannot run today — e.g. "needs a fine-grained PAT" (SPEC §14 Q3)
   * or "needs a deployed sibling" (SPEC §12 M1 note). */
  reason?: string;
  rules: RuleCatalogEntry[];
}

export const CHECK_REGISTRY: readonly FamilyCatalogEntry[] = [
  {
    family: "reach",
    implemented: true,
    rules: [
      { ruleId: REACH_STATUS_NOT_200, asserts: "/ responds 200" },
      { ruleId: REACH_REDIRECT_CHAIN_CHANGED, asserts: "final URL + redirect chain unchanged vs. the previous run" },
    ],
  },
  {
    family: "header",
    implemented: true,
    rules: [
      { ruleId: HEADER_MISSING, asserts: "a declared security/policy header is present" },
      { ruleId: HEADER_VALUE_CHANGED, asserts: "a present header's value is unchanged vs. the previous run" },
    ],
  },
  {
    family: "brand",
    implemented: true,
    rules: [
      { ruleId: BRAND_BACKLINK_MISSING, asserts: "the footer links back to agentjames.vercel.app" },
      { ruleId: BRAND_FAVICON_MISSING, asserts: "the chip-mark favicon is reachable" },
    ],
  },
  {
    family: "link",
    implemented: true,
    rules: [
      { ruleId: LINK_BROKEN, asserts: "a crawled link resolves without a 4xx/5xx (or a GET retry confirms it genuinely 404/410s)" },
      { ruleId: LINK_OFFSITE_REDIRECT, asserts: "a same-origin link still resolves on its declared origin" },
      {
        ruleId: LINK_UNVERIFIABLE,
        asserts:
          "a HEAD request that looked bot-blocked (403/406/429/999) stays inconclusive after one GET retry — not asserted broken",
      },
    ],
  },
  {
    family: "weight",
    implemented: true,
    rules: [{ ruleId: WEIGHT_BUDGET_EXCEEDED, asserts: "/ transfer bytes stay within its declared budget" }],
  },
  {
    family: "artifact",
    implemented: false,
    landingMilestone: "M4",
    reason:
      "needs a sibling's own published schema + a deployed artifact to fetch against (SPEC §14 Q6 gates snapgauge's own liveness probe on this too)",
    rules: [
      { ruleId: "artifact.unreachable", asserts: "a sibling's published artifact fetches" },
      { ruleId: "artifact.schema_invalid", asserts: "a fetched artifact parses against its own published schema" },
      { ruleId: "artifact.stale", asserts: "a fetched artifact is within its declared cadence" },
    ],
  },
  {
    family: "repo",
    implemented: false,
    landingMilestone: "M4",
    reason: "needs a scoped GitHub token (SPEC §14 Q3: fine-grained PAT vs GitHub App, undecided)",
    rules: [
      { ruleId: "repo.schedule_disabled", asserts: "a sibling's scheduled workflow is still `active` (D4's 60-day rule)" },
      { ruleId: "repo.schedule_overdue", asserts: "a sibling's last scheduled run succeeded within cadence+slack" },
      { ruleId: "repo.default_branch_red", asserts: "a sibling's default-branch CI is green" },
    ],
  },
  {
    family: "pkg",
    implemented: false,
    landingMilestone: "M4",
    reason:
      "needs `npm i <pkg>@latest` + a smoke command in a clean temp dir — a real install step, not yet wired (SPEC §2)",
    rules: [
      { ruleId: "pkg.install_failed", asserts: "`npm i <pkg>@latest` + its smoke command succeed in a clean temp dir" },
      { ruleId: "pkg.version_tag_mismatch", asserts: "the published version matches the repo's release tag" },
      { ruleId: "pkg.unexpected_publish", asserts: "no publish landed outside a tagged release" },
      { ruleId: "pkg.deprecated", asserts: "the package is not marked deprecated on the registry" },
    ],
  },
  {
    family: "watch",
    implemented: true,
    // `watch.run_missed`/`watch.late` are documented in SPEC §2 but not
    // requested by the M4 milestone (Decision 3's `kind:"gap"` record
    // already covers a slipped schedule at the record level) — left
    // undeclared here rather than listed with no backing rule function,
    // consistent with every other family's "only list what a real rule
    // resolves to" convention (checks/registry.test.ts enforces this).
    rules: [{ ruleId: WATCH_CHAIN_GAP, asserts: "the audit sequence is contiguous across runs" }],
  },
];

export function implementedFamilies(): Family[] {
  return CHECK_REGISTRY.filter((f) => f.implemented).map((f) => f.family);
}
