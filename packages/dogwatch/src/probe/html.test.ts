import { describe, expect, it } from "vitest";
import { containsBacklink, extractHrefs, findFaviconHref, resolveLinks } from "./html.js";

describe("extractHrefs", () => {
  it("extracts every href from anchor tags", () => {
    const html = '<a href="/a">A</a><a href="https://x.test/b">B</a>';
    expect(extractHrefs(html)).toEqual(["/a", "https://x.test/b"]);
  });

  it("ignores anchors with no href or a bare #", () => {
    const html = '<a name="x">no href</a><a href="#top">top</a>';
    expect(extractHrefs(html)).toEqual([]);
  });
});

describe("containsBacklink", () => {
  const pageUrl = "https://sluice.vercel.app/";

  it("finds an absolute link to the given host", () => {
    const html = '<footer><a href="https://agentjames.vercel.app">Agent James</a></footer>';
    expect(containsBacklink(html, "agentjames.vercel.app", pageUrl)).toBe(true);
  });

  it("returns false when the only link is site-relative (resolves to the page's OWN host)", () => {
    const html = '<footer><a href="/about">About</a></footer>';
    expect(containsBacklink(html, "agentjames.vercel.app", pageUrl)).toBe(false);
  });

  it("does not false-positive on a substring host match", () => {
    const html = '<a href="https://notagentjames.vercel.app.evil.test">x</a>';
    expect(containsBacklink(html, "agentjames.vercel.app", pageUrl)).toBe(false);
  });
});

describe("findFaviconHref", () => {
  it("finds an explicit icon link tag", () => {
    const html = '<link rel="icon" href="/brand/favicon.svg">';
    expect(findFaviconHref(html)).toBe("/brand/favicon.svg");
  });

  it("falls back to /favicon.ico when no icon link is declared", () => {
    expect(findFaviconHref("<html><head></head></html>")).toBe("/favicon.ico");
  });
});

describe("resolveLinks", () => {
  it("resolves relative hrefs against the base URL", () => {
    const out = resolveLinks("https://x.test/dir/page.html", ["../a", "/b", "https://y.test/c"]);
    expect(out).toEqual(["https://x.test/a", "https://x.test/b", "https://y.test/c"]);
  });

  it("silently skips a genuinely malformed href instead of throwing", () => {
    const out = resolveLinks("https://x.test/", ["http://[not-a-valid-host", "/ok"]);
    expect(out).toEqual(["https://x.test/ok"]);
  });

  it("resolves mailto:/javascript: hrefs as absolute URLs, unmodified", () => {
    // WHATWG URL treats these as syntactically valid absolute references —
    // the caller (crawlSite) is what filters by origin, not this function.
    const out = resolveLinks("https://x.test/", ["mailto:a@x.test"]);
    expect(out).toEqual(["mailto:a@x.test"]);
  });
});
