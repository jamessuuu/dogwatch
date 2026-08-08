/**
 * Per-site check building (SPEC §2/§3): fetch once via the injected,
 * sluice-wrapped probe, then hand the recorded evidence to the pure rule
 * functions in src/checks. This is the only module that bridges I/O
 * (src/probe) and pure judgment (src/checks) for the `sites[]` targets.
 */
import {
  BRAND_BACKLINK_MISSING,
  BRAND_FAVICON_MISSING,
  evaluateBrandBacklink,
  evaluateBrandFavicon,
  evaluateHeaderDrift,
  evaluateHeaderPresence,
  evaluateLinkBroken,
  evaluateLinkOffsiteRedirect,
  evaluateReachRedirectChain,
  evaluateReachStatus,
  evaluateWeightBudget,
  HEADER_MISSING,
  HEADER_VALUE_CHANGED,
  LINK_BROKEN,
  LINK_OFFSITE_REDIRECT,
  REACH_REDIRECT_CHAIN_CHANGED,
  REACH_STATUS_NOT_200,
  WEIGHT_BUDGET_EXCEEDED,
  type RuleContext,
  type RuleOutcome,
} from "../checks/index.js";
import { crawlSite } from "../probe/crawl.js";
import { containsBacklink, findFaviconHref } from "../probe/html.js";
import type { HttpProbe } from "../probe/types.js";
import { headerBaselineValueOf, redirectChainBaselineOf } from "./baseline.js";
import { allowlistHeaders } from "./headers.js";
import { checkId } from "./ids.js";
import { classifyProbeFailure } from "./probe-outcome.js";
import { reproduceCurl } from "./reproduce.js";
import type { Check, CheckEvidence, CheckRequest, ErrorReasonCode, Metric, RunRecord, SkipReasonCode } from "./schema.js";
import type { TargetSite } from "./targets-schema.js";

export interface BuildSiteContext {
  probe: HttpProbe;
  prevRecord: RunRecord | null;
  observedAt: string;
  timeoutMs: number;
}

export interface BuildSiteResult {
  checks: Check[];
  metrics: Metric[];
}

function requestOf(url: string, method: "GET" | "HEAD", timeoutMs: number): CheckRequest {
  return { method, url, headersSent: [], timeoutMs };
}

function emptyEvidence(): CheckEvidence {
  return { redirects: [], headers: {} };
}

function skippedCheck(
  id: string,
  family: Check["family"],
  targetId: string,
  ruleId: string,
  title: string,
  request: CheckRequest,
  observedAt: string,
  skipReason: SkipReasonCode
): Check {
  return {
    id,
    family,
    targetId,
    ruleId,
    title,
    request,
    observedAt,
    verdict: "skipped",
    skipReason,
    evidence: emptyEvidence(),
    reproduce: reproduceCurl(request),
  };
}

function errorCheck(
  id: string,
  family: Check["family"],
  targetId: string,
  ruleId: string,
  title: string,
  request: CheckRequest,
  observedAt: string,
  errorCode: ErrorReasonCode
): Check {
  return {
    id,
    family,
    targetId,
    ruleId,
    title,
    request,
    observedAt,
    verdict: "error",
    errorCode,
    evidence: emptyEvidence(),
    reproduce: reproduceCurl(request),
  };
}

function fromOutcome(
  id: string,
  family: Check["family"],
  targetId: string,
  request: CheckRequest,
  observedAt: string,
  outcome: RuleOutcome
): Check {
  return {
    id,
    family,
    targetId,
    ruleId: outcome.ruleId,
    title: outcome.title,
    request,
    observedAt,
    verdict: outcome.verdict,
    ...(outcome.skipReason === undefined ? {} : { skipReason: outcome.skipReason }),
    ...(outcome.errorCode === undefined ? {} : { errorCode: outcome.errorCode }),
    evidence: outcome.evidence,
    reproduce: reproduceCurl(request),
  };
}

/** Every rule id declared for the `implemented: true` families this module
 * knows how to build, keyed by family — used to emit the full skip set for
 * an undeployed site (SPEC §9: "a sibling artifact 404s -> skipped", here
 * applied a level earlier: not deployed at all, so never even requested). */
const RULES_OF_FAMILY: Record<string, string[]> = {
  reach: [REACH_STATUS_NOT_200, REACH_REDIRECT_CHAIN_CHANGED],
  weight: [WEIGHT_BUDGET_EXCEEDED],
  brand: [BRAND_BACKLINK_MISSING, BRAND_FAVICON_MISSING],
};

export async function buildSiteChecks(site: TargetSite, ctx: BuildSiteContext): Promise<BuildSiteResult> {
  const checks: Check[] = [];
  const metrics: Metric[] = [];
  const homeRequest = requestOf(site.url, "GET", ctx.timeoutMs);

  if (!site.deployed) {
    for (const family of site.families) {
      const rules = RULES_OF_FAMILY[family] ?? [];
      for (const ruleId of rules) {
        const id = checkId(family, site.id, ruleId);
        checks.push(
          skippedCheck(id, family, site.id, ruleId, ruleId, homeRequest, ctx.observedAt, "not_published")
        );
      }
      // header checks are per declared header name, not a fixed rule list.
      if (family === "header") {
        for (const headerName of site.expectedHeaders) {
          for (const ruleId of [HEADER_MISSING, HEADER_VALUE_CHANGED]) {
            const id = checkId(family, site.id, ruleId, headerName);
            checks.push(
              skippedCheck(id, family, site.id, ruleId, `header "${headerName}"`, homeRequest, ctx.observedAt, "not_published")
            );
          }
        }
      }
      // link's rule set is discovered by crawling — an undeployed site has
      // no discoverable links, so it gets one representative skip instead
      // of an enumerable rule list.
      if (family === "link") {
        const id = checkId(family, site.id, LINK_BROKEN);
        checks.push(
          skippedCheck(id, family, site.id, LINK_BROKEN, "crawled links resolve", homeRequest, ctx.observedAt, "not_published")
        );
      }
    }
    return { checks, metrics };
  }

  let getResult: Awaited<ReturnType<HttpProbe["get"]>> | null = null;
  let failure: ReturnType<typeof classifyProbeFailure> | null = null;
  try {
    getResult = await ctx.probe.get(site.url, { timeoutMs: ctx.timeoutMs });
  } catch (cause) {
    failure = classifyProbeFailure(cause);
  }

  const ruleCtx: RuleContext = { targetId: site.id, checkId: "", request: { method: "GET", url: site.url }, observedAt: ctx.observedAt };

  if (site.families.includes("reach")) {
    if (getResult === null) {
      pushFailure(checks, failure, "reach", site.id, REACH_STATUS_NOT_200, "/ reachable", homeRequest, ctx.observedAt);
      pushFailure(
        checks,
        failure,
        "reach",
        site.id,
        REACH_REDIRECT_CHAIN_CHANGED,
        "final URL + redirect chain unchanged",
        homeRequest,
        ctx.observedAt
      );
    } else {
      const evidence: CheckEvidence = {
        status: getResult.status,
        finalUrl: getResult.finalUrl,
        redirects: getResult.redirects,
        headers: allowlistHeaders(getResult.headers),
        bytes: getResult.bytes,
        ms: getResult.ms,
        bodySha256: getResult.bodySha256,
      };
      const idStatus = checkId("reach", site.id, REACH_STATUS_NOT_200);
      const outcomeStatus = evaluateReachStatus(evidence, { ...ruleCtx, checkId: idStatus });
      checks.push(fromOutcome(idStatus, "reach", site.id, homeRequest, ctx.observedAt, outcomeStatus));

      const idRedirect = checkId("reach", site.id, REACH_REDIRECT_CHAIN_CHANGED);
      const baseline = redirectChainBaselineOf(ctx.prevRecord, idRedirect);
      const evidenceRedirect: CheckEvidence = { ...evidence, json: { baseline } };
      const outcomeRedirect = evaluateReachRedirectChain(evidenceRedirect, { ...ruleCtx, checkId: idRedirect });
      checks.push(fromOutcome(idRedirect, "reach", site.id, homeRequest, ctx.observedAt, outcomeRedirect));

      metrics.push({
        id: `metric:${site.id}:reach.ms`,
        targetId: site.id,
        name: "response_time_ms",
        value: getResult.ms,
        unit: "ms",
        note: "recorded, not judged",
      });
    }
  }

  if (site.families.includes("header")) {
    for (const headerName of site.expectedHeaders) {
      const idMissing = checkId("header", site.id, HEADER_MISSING, headerName);
      const idDrift = checkId("header", site.id, HEADER_VALUE_CHANGED, headerName);
      if (getResult === null) {
        pushFailure(checks, failure, "header", site.id, HEADER_MISSING, `header "${headerName}"`, homeRequest, ctx.observedAt, headerName);
        pushFailure(checks, failure, "header", site.id, HEADER_VALUE_CHANGED, `header "${headerName}"`, homeRequest, ctx.observedAt, headerName);
        continue;
      }
      const headers = allowlistHeaders(getResult.headers);
      const evidenceMissing: CheckEvidence = { redirects: [], headers, json: { headerName } };
      const outcomeMissing = evaluateHeaderPresence(evidenceMissing, { ...ruleCtx, checkId: idMissing });
      checks.push(fromOutcome(idMissing, "header", site.id, homeRequest, ctx.observedAt, outcomeMissing));

      const baselineValue = headerBaselineValueOf(ctx.prevRecord, idMissing, headerName);
      const evidenceDrift: CheckEvidence = { redirects: [], headers, json: { headerName, baselineValue } };
      const outcomeDrift = evaluateHeaderDrift(evidenceDrift, { ...ruleCtx, checkId: idDrift });
      checks.push(fromOutcome(idDrift, "header", site.id, homeRequest, ctx.observedAt, outcomeDrift));
    }
  }

  if (site.families.includes("weight")) {
    const id = checkId("weight", site.id, WEIGHT_BUDGET_EXCEEDED);
    if (getResult === null) {
      pushFailure(checks, failure, "weight", site.id, WEIGHT_BUDGET_EXCEEDED, "transfer size within budget", homeRequest, ctx.observedAt);
    } else {
      const evidence: CheckEvidence = {
        redirects: [],
        headers: {},
        bytes: getResult.bytes,
        json: { budgetBytes: site.weightBudgetBytes },
      };
      const outcome = evaluateWeightBudget(evidence, { ...ruleCtx, checkId: id });
      checks.push(fromOutcome(id, "weight", site.id, homeRequest, ctx.observedAt, outcome));
    }
  }

  if (site.families.includes("brand")) {
    const idBacklink = checkId("brand", site.id, BRAND_BACKLINK_MISSING);
    const idFavicon = checkId("brand", site.id, BRAND_FAVICON_MISSING);
    if (getResult === null) {
      pushFailure(checks, failure, "brand", site.id, BRAND_BACKLINK_MISSING, "footer backlink present", homeRequest, ctx.observedAt);
      pushFailure(checks, failure, "brand", site.id, BRAND_FAVICON_MISSING, "chip-mark favicon reachable", homeRequest, ctx.observedAt);
    } else {
      const hasBacklink = containsBacklink(getResult.bodyText, "agentjames.vercel.app", getResult.finalUrl);
      const evidenceBacklink: CheckEvidence = {
        redirects: [],
        headers: {},
        json: { page: site.url, bodyContainsBacklink: hasBacklink },
      };
      const outcomeBacklink = evaluateBrandBacklink(evidenceBacklink, { ...ruleCtx, checkId: idBacklink });
      checks.push(fromOutcome(idBacklink, "brand", site.id, homeRequest, ctx.observedAt, outcomeBacklink));

      const faviconHref = findFaviconHref(getResult.bodyText);
      const faviconUrl = new URL(faviconHref, getResult.finalUrl).toString();
      const faviconRequest = requestOf(faviconUrl, "GET", ctx.timeoutMs);
      try {
        const faviconResult = await ctx.probe.get(faviconUrl, { timeoutMs: ctx.timeoutMs, maxBodyBytes: 1 });
        const evidenceFavicon: CheckEvidence = {
          status: faviconResult.status,
          finalUrl: faviconResult.finalUrl,
          redirects: faviconResult.redirects,
          headers: {},
        };
        const outcomeFavicon = evaluateBrandFavicon(evidenceFavicon, { ...ruleCtx, checkId: idFavicon, request: { method: "GET", url: faviconUrl } });
        checks.push(fromOutcome(idFavicon, "brand", site.id, faviconRequest, ctx.observedAt, outcomeFavicon));
      } catch (cause) {
        const faviconFailure = classifyProbeFailure(cause);
        pushFailureCheck(checks, faviconFailure, "brand", site.id, BRAND_FAVICON_MISSING, "chip-mark favicon reachable", faviconRequest, ctx.observedAt);
      }
    }
  }

  if (site.families.includes("link")) {
    if (getResult === null) {
      pushFailure(checks, failure, "link", site.id, LINK_BROKEN, "crawled links resolve", homeRequest, ctx.observedAt);
    } else {
      const crawl = await crawlSite(ctx.probe, site.url, { timeoutMs: ctx.timeoutMs });

      for (const page of crawl.pages) {
        const id = checkId("link", site.id, LINK_OFFSITE_REDIRECT, page.url);
        const evidence: CheckEvidence = {
          finalUrl: page.finalUrl,
          redirects: [],
          headers: {},
          json: { linkUrl: page.url, sourcePage: site.url, sourceOrigin: crawl.origin },
        };
        const outcome = evaluateLinkOffsiteRedirect(evidence, { ...ruleCtx, checkId: id });
        checks.push(fromOutcome(id, "link", site.id, requestOf(page.url, "GET", ctx.timeoutMs), ctx.observedAt, outcome));
      }

      for (const link of crawl.externalLinks) {
        const id = checkId("link", site.id, LINK_BROKEN, link.url);
        const linkRequest = requestOf(link.url, "HEAD", ctx.timeoutMs);
        try {
          const headResult = await ctx.probe.head(link.url, { timeoutMs: ctx.timeoutMs });
          const evidence: CheckEvidence = {
            status: headResult.status,
            finalUrl: headResult.finalUrl,
            redirects: headResult.redirects,
            headers: {},
            json: { linkUrl: link.url, sourcePage: link.sourcePage },
          };
          const outcome = evaluateLinkBroken(evidence, { ...ruleCtx, checkId: id, request: { method: "HEAD", url: link.url } });
          checks.push(fromOutcome(id, "link", site.id, linkRequest, ctx.observedAt, outcome));
        } catch (cause) {
          const linkFailure = classifyProbeFailure(cause);
          pushFailureCheck(checks, linkFailure, "link", site.id, LINK_BROKEN, `link ${link.url} resolves`, linkRequest, ctx.observedAt);
        }
      }
    }
  }

  return { checks, metrics };
}

function pushFailure(
  checks: Check[],
  failure: ReturnType<typeof classifyProbeFailure> | null,
  family: Check["family"],
  targetId: string,
  ruleId: string,
  title: string,
  request: CheckRequest,
  observedAt: string,
  discriminator?: string
): void {
  const id = checkId(family, targetId, ruleId, discriminator);
  pushFailureCheck(checks, failure, family, targetId, ruleId, title, request, observedAt, id);
}

function pushFailureCheck(
  checks: Check[],
  failure: ReturnType<typeof classifyProbeFailure> | null,
  family: Check["family"],
  targetId: string,
  ruleId: string,
  title: string,
  request: CheckRequest,
  observedAt: string,
  idOverride?: string
): void {
  const id = idOverride ?? checkId(family, targetId, ruleId);
  if (failure?.kind === "skipped") {
    checks.push(skippedCheck(id, family, targetId, ruleId, title, request, observedAt, failure.skipReason));
  } else {
    checks.push(errorCheck(id, family, targetId, ruleId, title, request, observedAt, failure?.errorCode ?? "network_error"));
  }
}
