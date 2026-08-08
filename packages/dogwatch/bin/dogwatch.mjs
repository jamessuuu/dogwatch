#!/usr/bin/env node
// Private bin shim (SPEC §4: "only place with env / process.exit" is
// src/cli — this file just gets a TS entrypoint running under plain node
// without a separate build step, via tsx's programmatic ESM loader).
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("tsx/esm", pathToFileURL("./"));
await import("../src/cli/index.ts");
