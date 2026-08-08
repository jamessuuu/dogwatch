/**
 * Aggregate export + the rule dispatch table `--rerun-rules` (R13) uses to
 * re-derive a finding from nothing but a check's own recorded `family` +
 * `ruleId` + `evidence` (SPEC §7). Every function here is pure: same
 * evidence in, same `RuleOutcome` out, forever.
 */
import type { RuleContext } from "./context.js";
import { evaluateBrandBacklink, evaluateBrandFavicon, BRAND_BACKLINK_MISSING, BRAND_FAVICON_MISSING } from "./brand.js";
import { evaluateHeaderDrift, evaluateHeaderPresence, HEADER_MISSING, HEADER_VALUE_CHANGED } from "./header.js";
import {
  evaluateLinkBroken,
  evaluateLinkOffsiteRedirect,
  evaluateLinkUnverifiable,
  LINK_BROKEN,
  LINK_OFFSITE_REDIRECT,
  LINK_UNVERIFIABLE,
} from "./link.js";
import {
  evaluateReachRedirectChain,
  evaluateReachStatus,
  REACH_REDIRECT_CHAIN_CHANGED,
  REACH_STATUS_NOT_200,
} from "./reach.js";
import { evaluateWeightBudget, WEIGHT_BUDGET_EXCEEDED } from "./weight.js";
import type { CheckEvidence } from "../record/schema.js";
import type { RuleOutcome } from "./types.js";

export * from "./context.js";
export * from "./types.js";
export * from "./registry.js";
export * from "./reach.js";
export * from "./header.js";
export * from "./brand.js";
export * from "./link.js";
export * from "./weight.js";

export type RuleFn = (evidence: CheckEvidence, ctx: RuleContext) => RuleOutcome;

export const RULES_BY_ID: Readonly<Record<string, RuleFn>> = {
  [REACH_STATUS_NOT_200]: evaluateReachStatus,
  [REACH_REDIRECT_CHAIN_CHANGED]: evaluateReachRedirectChain,
  [HEADER_MISSING]: evaluateHeaderPresence,
  [HEADER_VALUE_CHANGED]: evaluateHeaderDrift,
  [BRAND_BACKLINK_MISSING]: evaluateBrandBacklink,
  [BRAND_FAVICON_MISSING]: evaluateBrandFavicon,
  [LINK_BROKEN]: evaluateLinkBroken,
  [LINK_OFFSITE_REDIRECT]: evaluateLinkOffsiteRedirect,
  [LINK_UNVERIFIABLE]: evaluateLinkUnverifiable,
  [WEIGHT_BUDGET_EXCEEDED]: evaluateWeightBudget,
};
