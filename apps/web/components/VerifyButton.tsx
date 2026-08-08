"use client";

import { useState } from "react";
// See lib/data.ts's comment: relative import to the compiled package, not
// the bare "dogwatch" specifier.
import {
  RunRecordSchema,
  verifyEvents,
  verifyRecord,
  type RunRecord,
  type Violation,
} from "../../../packages/dogwatch/dist/index.js";

interface VerifyButtonProps {
  record: RunRecord;
}

type VerifyState =
  | { status: "idle" }
  | { status: "ok"; chainChecked: number }
  | { status: "fail"; violations: Violation[]; chainOk: boolean };

/**
 * SPEC §10: re-derives findings from evidence in the browser AND re-checks
 * the audit hash chain via sluice's pure `verifyEvents` — zero server, the
 * exact same code CI already runs offline (`dogwatch verify --rerun-rules`).
 * `verifyRecord(..., {rerunRules:true})` already calls `verifyEvents`
 * internally as its R11 half; this component also calls it a second time,
 * directly, so the UI can show "chain re-verified" as its own labelled
 * fact rather than burying it inside a generic pass/fail.
 */
export function VerifyButton({ record }: VerifyButtonProps) {
  const [state, setState] = useState<VerifyState>({ status: "idle" });

  function handleClick() {
    const parsed = RunRecordSchema.safeParse(record);
    if (!parsed.success) {
      setState({
        status: "fail",
        violations: [{ rule: "schema", code: "E_SCHEMA_INVALID", message: "This record does not parse against schemas/run-record.v1.json." }],
        chainOk: false,
      });
      return;
    }
    // Re-derives every finding from its check's own stored evidence via the
    // SAME rule functions the runner used (R13), and independently
    // recomputes chain.recordHash (R12). No prevRecord is available to a
    // static page rendering one record in isolation, so R11/R12's
    // cross-run half degrades to its documented single-record form.
    const violations = verifyRecord(parsed.data, { rerunRules: true });
    const chainResult = verifyEvents(
      parsed.data.audit.events as Parameters<typeof verifyEvents>[0],
      parsed.data.audit.prevHead
    );
    const chainOk = parsed.data.audit.events.length === 0 || (chainResult.ok && chainResult.ok === parsed.data.audit.verified);

    if (violations.length === 0 && chainOk) {
      setState({ status: "ok", chainChecked: chainResult.checked });
    } else {
      setState({ status: "fail", violations, chainOk });
    }
  }

  return (
    <div className="flex flex-col gap-3" data-verify-state={state.status}>
      <button
        type="button"
        onClick={handleClick}
        className="w-fit border border-ink px-4 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-paper"
      >
        Verify this record
      </button>
      {state.status === "ok" && (
        <p className="border border-green-700 bg-green-700/10 px-4 py-3 text-sm text-green-900" data-testid="verify-result">
          Verified. Every finding re-derives byte-for-byte from its check&apos;s own recorded
          evidence, and the audit hash chain ({state.chainChecked} events) re-verifies — computed
          just now, in this browser, from the JSON already on this page.
        </p>
      )}
      {state.status === "fail" && (
        <div className="border border-red-700 bg-red-700/10 px-4 py-3 text-sm text-red-900" data-testid="verify-result">
          <p className="font-medium">Verification failed.</p>
          <ul className="mt-2 list-inside list-disc font-mono text-xs">
            {state.violations.map((v, i) => (
              <li key={i}>
                {v.code}: {v.message}
              </li>
            ))}
            {!state.chainOk && <li>E_CHAIN_BROKEN: the audit hash chain did not re-verify.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
