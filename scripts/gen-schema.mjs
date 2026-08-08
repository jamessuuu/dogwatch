// Generates schemas/run-record.v1.json FROM the Zod source of truth
// (packages/dogwatch/src/record/schema.ts), per SPEC §3/§12 M0. `--check`
// regenerates into memory and diffs against the committed file instead of
// writing (CI drift gate, SPEC §11.5).
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { RunRecordSchema } from "../packages/dogwatch/src/record/schema.ts";

const outPath = fileURLToPath(new URL("../schemas/run-record.v1.json", import.meta.url));
const jsonSchema = z.toJSONSchema(RunRecordSchema, { target: "draft-2020-12" });
const text = `${JSON.stringify(jsonSchema, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const existing = readFileSync(outPath, "utf8");
  if (existing !== text) {
    console.error(
      `schemas/run-record.v1.json is out of date with the Zod source of truth (src/record/schema.ts). Run "pnpm schema:gen".`
    );
    process.exit(1);
  }
  console.log("schemas/run-record.v1.json is up to date.");
} else {
  writeFileSync(outPath, text, "utf8");
  console.log(`wrote ${outPath}`);
}
