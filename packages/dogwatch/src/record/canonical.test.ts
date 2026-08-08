import { describe, expect, it } from "vitest";
import { canonicalStringify } from "./canonical.js";

describe("canonicalStringify", () => {
  it("sorts object keys lexicographically at every depth", () => {
    const out = canonicalStringify({ b: 1, a: { d: 2, c: 3 } });
    expect(out).toBe('{\n  "a": {\n    "c": 3,\n    "d": 2\n  },\n  "b": 1\n}\n');
  });

  it("ends with a single trailing LF newline", () => {
    const out = canonicalStringify({ a: 1 });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.endsWith("\n\n")).toBe(false);
  });

  it("is stable across key insertion order", () => {
    const a = canonicalStringify({ x: 1, y: 2 });
    const b = canonicalStringify({ y: 2, x: 1 });
    expect(a).toBe(b);
  });

  it("renders an empty object/array compactly", () => {
    expect(canonicalStringify({})).toBe("{}\n");
    expect(canonicalStringify([])).toBe("[]\n");
  });

  it("omits keys whose value is undefined, rather than emitting null", () => {
    const out = canonicalStringify({ a: 1, b: undefined });
    expect(out).toBe('{\n  "a": 1\n}\n');
  });

  it("throws on undefined inside an array (would silently coerce to null)", () => {
    expect(() => canonicalStringify([1, undefined, 3])).toThrow(/undefined in array/);
  });

  it("throws on a non-finite number", () => {
    expect(() => canonicalStringify({ a: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
    expect(() => canonicalStringify({ a: Number.NaN })).toThrow(/non-finite/);
  });

  it("renders arrays with one entry per line", () => {
    expect(canonicalStringify([1, 2])).toBe("[\n  1,\n  2\n]\n");
  });

  it("round-trips through JSON.parse for ordinary JSON-safe values", () => {
    const value = { z: [1, "two", true, null, { nested: 3 }], a: 0 };
    const out = canonicalStringify(value);
    expect(JSON.parse(out)).toEqual(value);
  });
});
