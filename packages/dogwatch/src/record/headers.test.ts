import { describe, expect, it } from "vitest";
import { ALLOWED_HEADER_NAMES, allowlistHeaders } from "./headers.js";

describe("allowlistHeaders", () => {
  it("keeps only allowlisted header names", () => {
    const out = allowlistHeaders({
      "strict-transport-security": "max-age=63072000",
      "set-cookie": "session=abc123",
      authorization: "Bearer secret-token",
    });
    expect(out).toEqual({ "strict-transport-security": "max-age=63072000" });
    expect(out).not.toHaveProperty("set-cookie");
    expect(out).not.toHaveProperty("authorization");
  });

  it("truncates a value longer than 200 chars", () => {
    const longValue = "a".repeat(500);
    const out = allowlistHeaders({ server: longValue });
    expect(out.server).toHaveLength(200);
  });

  it("drops a header not present in the raw input", () => {
    const out = allowlistHeaders({});
    expect(Object.keys(out)).toHaveLength(0);
  });

  it("ALLOWED_HEADER_NAMES never contains a credential-shaped header", () => {
    for (const name of ALLOWED_HEADER_NAMES) {
      expect(name).not.toMatch(/authoriz|cookie|token|secret|api-key/i);
    }
  });
});
