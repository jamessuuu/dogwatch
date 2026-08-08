/**
 * POST /api/gate/decide — the ONLY write path in the entire product (SPEC
 * §6). Decision channel (a) of three (SPEC §5 step 4): the single-use HMAC
 * token. Zod-parsed body, timing-safe token verify (sluice's own
 * `verifyToken`, not reimplemented here — SPEC §1 non-goal 4), the
 * `dogwatch_budget.decide_attempts` app-level counter (200/day → 429,
 * checked BEFORE the decide attempt), and the Hobby WAF rate-limit rule
 * this route is the reason for (5 req/min per IP — documented in
 * docs/OPERATIONS.md, enforced by Vercel's firewall config, not this file).
 *
 * Node runtime (not Edge): needs the real `pg` driver for `DATABASE_URL`.
 */
import { NextResponse } from "next/server";
import {
  createDogwatchStore,
  createPgPoolSqlExecutor,
  createSluice,
  dayBucket,
  decideGate,
  decisionChannelOf,
  PostgresDecideAttemptStore,
  SluiceError,
  systemClock,
  z,
  type DecideAttemptStore,
} from "../../../../../../packages/dogwatch/dist/server.js";

export const runtime = "nodejs";

const DECIDE_ATTEMPTS_PER_DAY_CAP = 200;

const DecideBodySchema = z.strictObject({
  gateId: z.string().min(1),
  decision: z.enum(["approve", "reject"]),
  token: z.string().min(1),
  reason: z.string().max(2000).optional(),
});

function errorResponse(status: number, code: string, message: string): NextResponse {
  // HARD RULE (feasibility §4.2): typed error taxonomy, no stacks or
  // provider strings — every branch below hands this function a short,
  // pre-written code+message, never `String(cause)` from a driver error.
  return NextResponse.json({ code, message }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  let bodyJson: unknown;
  try {
    bodyJson = await request.json();
  } catch {
    return errorResponse(400, "E_BAD_REQUEST", "request body is not valid JSON");
  }
  const parsed = DecideBodySchema.safeParse(bodyJson);
  if (!parsed.success) {
    return errorResponse(400, "E_BAD_REQUEST", "request body does not match {gateId, decision, token, reason?}");
  }
  const { gateId, decision, token, reason } = parsed.data;

  const databaseUrl = process.env.DATABASE_URL;
  const approvalSecret = process.env.APPROVAL_SECRET;
  if (databaseUrl === undefined || databaseUrl.length === 0 || approvalSecret === undefined || approvalSecret.length === 0) {
    // Fail closed, never fail silent (SPEC §9) — a misconfigured deployment
    // must not accept decisions it cannot durably record or authenticate.
    return errorResponse(503, "E_STORE", "gate decisions are not available right now");
  }

  const dogwatchStore = await createDogwatchStore({ databaseUrl });
  if (dogwatchStore.kind !== "postgres" || dogwatchStore.pool === undefined) {
    await dogwatchStore.close();
    return errorResponse(503, "E_STORE", "gate decisions are not available right now");
  }

  try {
    // App-level counter, checked BEFORE the decide attempt (SPEC §6): every
    // POST counts, successful or not — this bounds request volume, not
    // successful decisions.
    const attemptStore: DecideAttemptStore = new PostgresDecideAttemptStore(createPgPoolSqlExecutor(dogwatchStore.pool));
    const day = dayBucket(Date.now());
    const attempts = await attemptStore.recordAttempt(day);
    if (attempts > DECIDE_ATTEMPTS_PER_DAY_CAP) {
      return errorResponse(429, "E_RATE_LIMIT", "too many gate-decide attempts today");
    }

    const sluice = createSluice({
      store: dogwatchStore.store,
      namespace: "dogwatch",
      owner: "dogwatch:api",
      clock: systemClock,
      approvalSecret,
    });

    try {
      const gate = await decideGate({
        sluice,
        gateId,
        decision,
        channel: "token",
        token,
        ...(reason === undefined ? {} : { reason }),
      });
      return NextResponse.json({
        gateId: gate.id,
        status: gate.status,
        decisionChannel: decisionChannelOf(gate.decidedBy) ?? "token",
      });
    } catch (cause) {
      if (cause instanceof SluiceError && cause.code === "E_BAD_TOKEN") {
        return errorResponse(401, "E_BAD_TOKEN", "the approval token is invalid, expired, or already used");
      }
      if (cause instanceof SluiceError) {
        return errorResponse(400, cause.code, "the gate could not be decided");
      }
      return errorResponse(500, "E_INTERNAL", "an internal error occurred");
    }
  } finally {
    await dogwatchStore.close();
  }
}

// A client that GETs this route (a bookmark, a link-preview crawler) gets a
// typed 405 instead of Next's generic one.
export function GET(): NextResponse {
  return errorResponse(405, "E_METHOD_NOT_ALLOWED", "POST only");
}
