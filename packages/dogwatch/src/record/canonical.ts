/**
 * Canonical JSON for the ON-DISK run-record file (snapgauge Decision 2
 * convention, mirrored here): keys sorted lexicographically at every depth,
 * 2-space indent, LF endings, trailing newline. Git-diff legibility beats
 * byte-canonical JCS for the committed file — the compact hash-input form
 * used for `chain.recordHash` is a *different* serialization, computed by
 * sluice's own `canonicalJson` (see hash.ts), not this one.
 *
 * Pure function, zero I/O — safe for src/checks, src/verify, and the M6
 * browser Verify button.
 */

export function canonicalStringify(value: unknown): string {
  return `${serialize(value, 0, [])}\n`;
}

function serialize(value: unknown, depth: number, path: (string | number)[]): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(`canonicalStringify: non-finite number at ${formatPath(path)}`);
      }
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) {
        const items = (value as unknown[]).map((v, i) => {
          if (v === undefined) {
            throw new TypeError(`canonicalStringify: undefined in array at ${formatPath([...path, i])}`);
          }
          return serialize(v, depth + 1, [...path, i]);
        });
        if (items.length === 0) return "[]";
        const pad = "  ".repeat(depth + 1);
        return `[\n${items.map((s) => pad + s).join(",\n")}\n${"  ".repeat(depth)}]`;
      }
      const record = value as Record<string, unknown>;
      const keys = Object.keys(record).sort();
      const entries: string[] = [];
      for (const key of keys) {
        const v = record[key];
        if (v === undefined) continue; // absent, not null
        entries.push(`${JSON.stringify(key)}: ${serialize(v, depth + 1, [...path, key])}`);
      }
      if (entries.length === 0) return "{}";
      const pad = "  ".repeat(depth + 1);
      return `{\n${entries.map((s) => pad + s).join(",\n")}\n${"  ".repeat(depth)}}`;
    }
    default:
      throw new TypeError(`canonicalStringify: unsupported ${typeof value} at ${formatPath(path)}`);
  }
}

function formatPath(path: (string | number)[]): string {
  return path.length === 0 ? "$" : `$.${path.join(".")}`;
}
