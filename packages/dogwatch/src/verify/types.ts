/** The honesty rubric's shared result shape (SPEC §7). Pure, zero I/O. */

export interface Violation {
  /** The exact error code from SPEC §7's table (e.g. "E_NO_CHECKS"). */
  code: string;
  /** Which rule fired (e.g. "R1") — documentation/debugging aid, the
   * `code` is what CI and fixtures assert on. */
  rule: string;
  message: string;
  /** Best-effort locator inside the record, for humans. */
  path?: string;
}

export interface VerifyOutcome {
  ok: boolean;
  violations: Violation[];
}

export function violation(rule: string, code: string, message: string, path?: string): Violation {
  return path === undefined ? { rule, code, message } : { rule, code, message, path };
}
