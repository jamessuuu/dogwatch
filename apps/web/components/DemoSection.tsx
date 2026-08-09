/**
 * DESIGN-DIRECTION.md §3: a scripted Playwright run against the REAL
 * deployed site (scripts/record-demo.mjs), recorded to video — never a
 * screencast of a person clicking. Autoplay, muted, looped, no browser
 * chrome (no `controls`), a poster frame, and a real adjacent text
 * alternative. `prefers-reduced-motion` gets the poster frame and a direct
 * link instead, decided in pure CSS (globals.css's `.demo-motion` /
 * `.demo-reduced`) so it works with no JS and no hydration flash.
 */
export function DemoSection() {
  return (
    <section className="flex flex-col gap-4 border-t border-rule pt-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Watch a real run get published</h2>
        <p className="max-w-prose text-sm text-ink">
          Recorded against the live site, not a mockup: the recording opens on <code className="font-mono text-xs">/runs</code>,
          opens the newest run, and scrolls through its checks, its findings with their sources, and
          its cost — the same page a visitor reaches by clicking through themselves.
        </p>
      </div>

      <div className="demo-motion border border-rule">
        {/* Silent, decorative loop — the paragraph below is the real text
         * alternative (DESIGN-DIRECTION: "adjacent, not hidden in a caption"). */}
        <video
          className="block w-full"
          autoPlay
          muted
          loop
          playsInline
          poster="/demo/dogwatch-poster.png"
          aria-hidden="true"
        >
          <source src="/demo/dogwatch-demo.webm" type="video/webm" />
        </video>
      </div>

      <div className="demo-reduced flex flex-col gap-3 border border-rule p-4">
        {/* static asset, no image optimizer (SPEC §10 D3) */}
        <img src="/demo/dogwatch-poster.png" alt="" className="w-full border border-rule" />
        <p className="text-sm text-ink">
          Motion is turned off in your browser, so the recording isn&apos;t playing automatically.{" "}
          <a
            href="/demo/dogwatch-demo.webm"
            className="text-ink underline decoration-rule underline-offset-2 hover:decoration-ink"
          >
            Watch the recording (.webm, has motion)
          </a>
          .
        </p>
      </div>

      <p className="text-sm text-ink-muted">
        What it shows: the runs index, the newest published run, its checks grouped by family, its
        findings with sources, and the cost line — no narration, no cuts.
      </p>
    </section>
  );
}
