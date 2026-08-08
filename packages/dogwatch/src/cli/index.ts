#!/usr/bin/env node
/**
 * The CLI entrypoint (SPEC §6). The only place in the whole pipeline with
 * env access / `process.exit` — every command handler below returns a plain
 * exit code (SPEC §6's table) and the `.action()` wrapper is what actually
 * calls `process.exit`, so `runWatch`/`runVerify`/`runRender`/
 * `runResumeCommand` stay testable as ordinary functions.
 */
import { Command } from "commander";
import { registerGateCommand } from "./gate.js";
import { registerRenderCommand } from "./render.js";
import { registerResumeCommand } from "./resume.js";
import { registerVerifyCommand } from "./verify-cmd.js";
import { registerWatchCommand } from "./watch.js";
import { DOGWATCH_VERSION } from "./version.js";

const program = new Command();
program
  .name("dogwatch")
  .description("Night watch over the six public surfaces of the Agent James showcase program.")
  .version(DOGWATCH_VERSION);

registerWatchCommand(program);
registerResumeCommand(program);
registerRenderCommand(program);
registerVerifyCommand(program);
registerGateCommand(program);

await program.parseAsync(process.argv);
