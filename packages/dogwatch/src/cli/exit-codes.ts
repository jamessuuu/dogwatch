/** SPEC §6. 1 vs 3 is deliberate — different owner, different fix. */
export const EXIT = {
  CLEAN: 0,
  FINDINGS: 1,
  PROBE: 2,
  RUBRIC: 3,
  USAGE: 4,
  INTERNAL: 5,
} as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];
