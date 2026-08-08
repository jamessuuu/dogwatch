#!/usr/bin/env node
/**
 * The CLI entrypoint (SPEC §6). The only place in the whole pipeline with
 * env access / `process.exit` — every command handler below returns a plain
 * exit code (SPEC §6's table) and the `.action()` wrapper is what actually
 * calls `process.exit`, so `runWatch`/`runVerify`/`runRender` stay testable
 * as ordinary functions.
 *
 * `dogwatch gate ls|show|decide` is in SPEC §6's table but is NOT wired
 * here: gates land at M5 (src/effects/README.md) and this build is scoped
 * to M0-M2 — registering a `gate` command with nothing behind it would be
 * a stub that lies about what the CLI can do today.
 */
import { Command } from "commander";
import { registerRenderCommand } from "./render.js";
import { registerVerifyCommand } from "./verify-cmd.js";
import { registerWatchCommand } from "./watch.js";
import { DOGWATCH_VERSION } from "./version.js";

const program = new Command();
program
  .name("dogwatch")
  .description("Night watch over the six public surfaces of the Agent James showcase program.")
  .version(DOGWATCH_VERSION);

registerWatchCommand(program);
registerRenderCommand(program);
registerVerifyCommand(program);

await program.parseAsync(process.argv);
