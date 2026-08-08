#!/usr/bin/env node
/**
 * The CLI entrypoint (SPEC §6). The only place in the whole pipeline with
 * env access / `process.exit` — every command handler below returns a plain
 * exit code (SPEC §6's table) and the `.action()` wrapper is what actually
 * calls `process.exit`, so `runWatch`/`runRender` stay testable as ordinary
 * functions.
 *
 * M1 walking skeleton: only `watch` and `render` are registered.
 * `dogwatch verify` lands at M2 with the rubric (`src/verify/rubric.ts`);
 * `dogwatch gate ls|show|decide` is in SPEC §6's table but lands at M5 with
 * the gate machinery (`src/effects/README.md`) — registering either command
 * with nothing behind it would be a stub that lies about what the CLI can
 * do today.
 */
import { Command } from "commander";
import { registerRenderCommand } from "./render.js";
import { registerWatchCommand } from "./watch.js";
import { DOGWATCH_VERSION } from "./version.js";

const program = new Command();
program
  .name("dogwatch")
  .description("Night watch over the six public surfaces of the Agent James showcase program.")
  .version(DOGWATCH_VERSION);

registerWatchCommand(program);
registerRenderCommand(program);

await program.parseAsync(process.argv);
