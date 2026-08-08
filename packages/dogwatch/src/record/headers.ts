/**
 * `evidence.headers` capture is allowlist-only (SPEC docs/SECURITY.md,
 * R15's other half): only declared, non-secret policy/identity headers are
 * ever copied into a published evidence object. `Authorization`,
 * `Set-Cookie`, and anything unlisted is dropped before evidence is built —
 * not redacted after the fact. Values are truncated to 200 chars (SPEC §8's
 * truncation convention for anything model-adjacent — applied here too,
 * defensively, since a header value is attacker/operator controlled).
 */
const ALLOWED_HEADERS = [
  "strict-transport-security",
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "content-type",
  "cache-control",
  "server",
  "x-vercel-cache",
  "x-vercel-id",
  "content-length",
  "etag",
  "location",
];

/** Exported so src/verify (R15) can independently confirm a published
 * record never carries a header outside this same allowlist. */
export const ALLOWED_HEADER_NAMES: ReadonlySet<string> = new Set(ALLOWED_HEADERS);

const MAX_HEADER_VALUE_LENGTH = 200;

export function allowlistHeaders(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ALLOWED_HEADERS) {
    const value = raw[name];
    if (value !== undefined) {
      out[name] = value.length > MAX_HEADER_VALUE_LENGTH ? value.slice(0, MAX_HEADER_VALUE_LENGTH) : value;
    }
  }
  return out;
}
