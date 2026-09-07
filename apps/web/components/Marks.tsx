/**
 * Decorative marks as inline SVG, not as characters.
 *
 * The three vendored faces are subset to the Google Fonts "latin" range and
 * their `@font-face` blocks declare that range, so any character outside it
 * is never attempted in Archivo/Commit Mono/Newsreader at all — the browser
 * falls straight through to whatever system font the visitor happens to
 * have. For common punctuation that is fine. For U+2691 BLACK FLAG, which
 * this page used 16 times beside the rubric's fixture links, it is tofu on
 * any machine without a symbol font covering it.
 *
 * That failure is invisible from a development machine, because a
 * development machine has the glyph. `scripts/glyph-check.mjs` catches it by
 * checking rendered text against the DECLARED unicode-range rather than
 * against what happens to render locally.
 *
 * Both marks below size in `em` so they scale with their line, and fill with
 * `currentColor` so they inherit the link's tint exactly as the character
 * did. `aria-hidden` throughout: each one sits beside text that already says
 * what it means.
 */

export function FlagMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 14"
      width="1em"
      height="1em"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: "inline-block", verticalAlign: "-0.12em", flexShrink: 0 }}
    >
      <path d="M2.6 0v14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M3.6 1.1h7.2L8.6 4.3l2.2 3.2H3.6z" fill="currentColor" />
    </svg>
  );
}

/** The disclosure marker. Rotates to point down when its <details> is open;
 * the rotation is a transition, so it stops under reduced motion with
 * everything else. */
export function DisclosureMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 10 12"
      width="0.7em"
      height="0.7em"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: "inline-block", flexShrink: 0 }}
    >
      <path d="M2 1.2 8 6l-6 4.8z" fill="currentColor" />
    </svg>
  );
}
