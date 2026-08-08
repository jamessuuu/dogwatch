/**
 * `dogwatch gate ls|show|decide` (SPEC §6): operator break-glass. `decide`
 * is decision channel (c) — "`dogwatch gate decide` locally (break-glass,
 * recorded as such)" — and calls the SAME `decide.ts` wrapper every other
 * channel uses, with `channel: "cli"`.
 */
import { createSluice, systemClock } from "@jamessuuu/sluice";
import type { Command } from "commander";
import { userInfo } from "node:os";
import { decideGate } from "../effects/decide.js";
import type { DecisionChannel } from "../record/schema.js";
import { createDogwatchStore } from "../store/index.js";
import { EXIT } from "./exit-codes.js";

const KNOWN_CHANNELS: readonly DecisionChannel[] = ["token", "workflow_dispatch", "cli"];

async function withSluice<T>(fn: (sluice: ReturnType<typeof createSluice>) => Promise<T>): Promise<T> {
  const databaseUrl = process.env.DATABASE_URL;
  const dogwatchStore = await createDogwatchStore({ databaseUrl });
  try {
    const approvalSecret = process.env.APPROVAL_SECRET;
    const sluice = createSluice({
      store: dogwatchStore.store,
      namespace: "dogwatch",
      owner: `dogwatch:cli:${String(process.pid)}`,
      clock: systemClock,
      ...(approvalSecret === undefined ? {} : { approvalSecret }),
    });
    return await fn(sluice);
  } finally {
    await dogwatchStore.close();
  }
}

function currentOsUser(): string {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}

export function registerGateCommand(program: Command): void {
  const gate = program.command("gate").description("operator break-glass for gates (SPEC §6)");

  gate
    .command("ls")
    .description("list pending gates")
    .action(async () => {
      const code = await withSluice(async (sluice) => {
        const pending = await sluice.gates.pending();
        if (pending.length === 0) {
          console.log("no pending gates.");
          return EXIT.CLEAN;
        }
        for (const g of pending) {
          console.log(`${g.id}  key=${g.key}  expires=${new Date(g.expiresAt).toISOString()}  ${g.presentation?.title ?? ""}`);
        }
        return EXIT.CLEAN;
      });
      process.exit(code);
    });

  gate
    .command("show <id>")
    .description("show one gate's full record")
    .action(async (id: string) => {
      const code = await withSluice(async (sluice) => {
        const record = await sluice.gates.get(id);
        if (record === null) {
          console.error(`no such gate: ${id}`);
          return EXIT.USAGE;
        }
        console.log(JSON.stringify(record, null, 2));
        return EXIT.CLEAN;
      });
      process.exit(code);
    });

  gate
    .command("decide <id> <decision>")
    .description('decide a gate: decision is "approve" or "reject" (default channel: "cli" break-glass)')
    .option("--reason <text>", "decision reason")
    .option(
      "--channel <channel>",
      'decisionChannel to record — "cli" (default, local break-glass) or "workflow_dispatch" (resume.yml\'s own handler, invoked with the triggering GitHub Actor as --actor)'
    )
    .option("--actor <actor>", "override the recorded actor (default: the OS user)")
    .action(async (id: string, decision: string, opts: { reason?: string; channel?: string; actor?: string }) => {
      if (decision !== "approve" && decision !== "reject") {
        console.error(`usage error: decision must be "approve" or "reject", got "${decision}"`);
        process.exit(EXIT.USAGE);
      }
      const channel = opts.channel ?? "cli";
      if (!KNOWN_CHANNELS.includes(channel as DecisionChannel)) {
        console.error(`usage error: --channel must be one of ${KNOWN_CHANNELS.join(", ")}, got "${channel}"`);
        process.exit(EXIT.USAGE);
      }
      const code = await withSluice(async (sluice) => {
        const record = await decideGate({
          sluice,
          gateId: id,
          decision,
          channel: channel as DecisionChannel,
          actor: opts.actor ?? currentOsUser(),
          ...(opts.reason === undefined ? {} : { reason: opts.reason }),
        });
        console.log(`gate ${id} -> ${record.status} (decidedBy: ${record.decidedBy ?? "?"})`);
        console.log('Run "dogwatch resume" to execute/refuse the underlying action.');
        return EXIT.CLEAN;
      });
      process.exit(code);
    });
}
