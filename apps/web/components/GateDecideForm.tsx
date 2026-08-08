"use client";

import { useState } from "react";

interface GateDecideFormProps {
  gateId: string;
  token: string | null;
}

type DecideState =
  | { status: "idle" }
  | { status: "pending" }
  | { status: "ok"; gateStatus: string }
  | { status: "error"; message: string };

/**
 * The only page in the product that POSTs (SPEC §10 `/gate`). Talks to the
 * ONE write route, `/api/gate/decide` — Zod-validated, timing-safe token
 * verify server-side; this component does no validation of its own beyond
 * "a reason is optional text".
 */
export function GateDecideForm({ gateId, token }: GateDecideFormProps) {
  const [state, setState] = useState<DecideState>({ status: "idle" });
  const [reason, setReason] = useState("");

  async function decide(decision: "approve" | "reject") {
    if (token === null) {
      setState({ status: "error", message: "This link has no approval token — decide via the GitHub issue's workflow_dispatch link, or `dogwatch gate decide` locally instead." });
      return;
    }
    setState({ status: "pending" });
    try {
      const res = await fetch("/api/gate/decide", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gateId, decision, token, reason: reason.length > 0 ? reason : undefined }),
      });
      const body: unknown = await res.json();
      if (!res.ok) {
        const message = body !== null && typeof body === "object" && "message" in body ? String(body.message) : `HTTP ${String(res.status)}`;
        setState({ status: "error", message });
        return;
      }
      const gateStatus = body !== null && typeof body === "object" && "status" in body ? String(body.status) : "unknown";
      setState({ status: "ok", gateStatus });
    } catch {
      setState({ status: "error", message: "network error — the decision was not recorded" });
    }
  }

  if (state.status === "ok") {
    return (
      <p className="border border-green-700 bg-green-700/10 px-4 py-3 text-sm text-green-900" data-testid="gate-decide-result">
        Recorded: this gate is now <strong>{state.gateStatus}</strong>. `dogwatch resume` (every 30 minutes, or run it now)
        executes or refuses the underlying action and closes the notification issue.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="gate-decide-form">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Reason (optional)
        <textarea
          className="border border-rule bg-transparent px-2 py-1 text-sm"
          rows={2}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
          }}
        />
      </label>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={state.status === "pending"}
          onClick={() => void decide("approve")}
          className="border border-ink px-4 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-paper disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={state.status === "pending"}
          onClick={() => void decide("reject")}
          className="border border-red-800 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-800 hover:text-paper disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {state.status === "error" && (
        <p className="border border-red-700 bg-red-700/10 px-4 py-3 text-sm text-red-900" data-testid="gate-decide-result">
          {state.message}
        </p>
      )}
      <p className="text-xs text-ink-muted">
        Also decidable via <code>workflow_dispatch</code> on <code>resume.yml</code> (no token needed, works from the
        GitHub mobile app) or <code>dogwatch gate decide</code> locally.
      </p>
    </div>
  );
}
