import type { Family } from "../record/schema.js";
import type { TargetsFile } from "../record/targets-schema.js";

/** `--only <family>` (SPEC §6): restrict every site's declared families to
 * just the one requested, for local debugging of a single check family. */
export function restrictToFamily(targets: TargetsFile, family: Family): TargetsFile {
  return {
    ...targets,
    sites: targets.sites.map((site) => ({
      ...site,
      families: site.families.filter((f) => f === family),
    })),
  };
}
