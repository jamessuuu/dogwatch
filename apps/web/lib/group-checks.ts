/** Groups a record's checks by family, in the check registry's own declared
 * order (SPEC §10: "checks grouped by family... rendered from the same
 * registry the runner uses"), so `/runs/<id>` and `/checks` never disagree
 * about family order. Pure, no I/O. */
import { CHECK_REGISTRY, type Check, type Family } from "../../../packages/dogwatch/dist/index.js";

export interface FamilyGroup {
  family: Family;
  checks: Check[];
}

export function groupChecksByFamily(checks: readonly Check[]): FamilyGroup[] {
  const order = CHECK_REGISTRY.map((f) => f.family);
  const byFamily = new Map<Family, Check[]>();
  for (const c of checks) {
    const bucket = byFamily.get(c.family);
    if (bucket === undefined) byFamily.set(c.family, [c]);
    else bucket.push(c);
  }
  const groups: FamilyGroup[] = [];
  for (const family of order) {
    const bucket = byFamily.get(family);
    if (bucket !== undefined) groups.push({ family, checks: bucket });
  }
  return groups;
}
