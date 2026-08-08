import { describe, expect, it } from "vitest";
import { reproduceCurl } from "./reproduce.js";

describe("reproduceCurl", () => {
  it("builds a plain GET as curl -sS <url>", () => {
    expect(reproduceCurl({ method: "GET", url: "https://agentjames.vercel.app", headersSent: [] })).toBe(
      'curl -sS "https://agentjames.vercel.app"'
    );
  });

  it("uses -I for HEAD instead of -X HEAD", () => {
    const out = reproduceCurl({ method: "HEAD", url: "https://agentjames.vercel.app", headersSent: [] });
    expect(out).toBe('curl -sS -I "https://agentjames.vercel.app"');
  });

  it("adds -X for any other method", () => {
    const out = reproduceCurl({ method: "POST", url: "https://agentjames.vercel.app", headersSent: [] });
    expect(out).toBe('curl -sS -X POST "https://agentjames.vercel.app"');
  });

  it("includes every sent header as a -H flag, in order", () => {
    const out = reproduceCurl({
      method: "GET",
      url: "https://agentjames.vercel.app",
      headersSent: ["Accept: text/html", "X-Test: 1"],
    });
    expect(out).toBe('curl -sS -H "Accept: text/html" -H "X-Test: 1" "https://agentjames.vercel.app"');
  });

  it("always produces a non-empty string (SPEC §3: reproduce MUST be non-empty)", () => {
    expect(reproduceCurl({ method: "GET", url: "https://x.test", headersSent: [] }).length).toBeGreaterThan(0);
  });
});
