/**
 * `targets.json` — config, not code (SPEC §3). Zod source of truth for the
 * site/repo/package/artifact declarations every check family reads.
 */
import { z } from "zod";
import { FamilySchema } from "./schema.js";

export const TargetSiteSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.url(),
  repo: z.string().min(1),
  deployed: z.boolean(),
  families: z.array(FamilySchema),
  expectedHeaders: z.array(z.string()),
  weightBudgetBytes: z.number().int().positive(),
  note: z.string().optional(),
});
export type TargetSite = z.infer<typeof TargetSiteSchema>;

export const TargetRepoSchema = z.strictObject({
  id: z.string().min(1),
  repo: z.string().min(1),
});
export type TargetRepo = z.infer<typeof TargetRepoSchema>;

export const TargetPackageSchema = z.strictObject({
  id: z.string().min(1),
  name: z.string().min(1),
  repo: z.string().min(1),
});
export type TargetPackage = z.infer<typeof TargetPackageSchema>;

export const TargetArtifactSchema = z.strictObject({
  id: z.string().min(1),
  url: z.url(),
  repo: z.string().min(1),
  schemaUrl: z.url().optional(),
  cadenceHours: z.number().int().positive().optional(),
});
export type TargetArtifact = z.infer<typeof TargetArtifactSchema>;

export const ActionPolicySchema = z.strictObject({
  issueRepos: z.array(z.string().min(1)),
  confirmations: z.number().int().positive(),
  gateTimeoutHours: z.number().int().positive(),
});
export type ActionPolicy = z.infer<typeof ActionPolicySchema>;

export const TargetsFileSchema = z.strictObject({
  formatVersion: z.literal(1),
  sites: z.array(TargetSiteSchema),
  repos: z.array(TargetRepoSchema),
  packages: z.array(TargetPackageSchema),
  artifacts: z.array(TargetArtifactSchema),
  actionPolicy: ActionPolicySchema,
});
export type TargetsFile = z.infer<typeof TargetsFileSchema>;
