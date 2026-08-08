# Security

dogwatch is pre-release. This policy is committed at M0, before most of the
surface it governs exists, so the build is held to it rather than retrofitted
(same discipline as the sibling projects). Each heading is the binding
checklist item from [SPEC.md §13](SPEC.md) and is marked with the milestone
where its enforcement surface lands.

## Fixed outbound allowlist — no user-supplied URL, no SSRF surface — lands at M1

There is no code path anywhere in this product that accepts a URL from a
visitor, a webhook body, or any other untrusted input and then fetches it.
Every outbound request target comes from `targets.json`, a file committed to
this repo and reviewed like code. `src/probe` is the only network code in the
pipeline (SPEC §4) and it is injected everywhere else, so the request set is
closed and auditable by reading one file.

## Crawler rules — lands at M2

The `link`/`brand` families run a bounded same-origin crawl (≤30 pages/site)
against dogwatch's own operated sites only (SPEC §2 non-goal 1: never a
third-party surface). External links are HEAD-checked only, capped at 60/site,
with a 7-day result cache read from the previous published record — dogwatch
is not a link-checking service for the wider web, only a fidelity check on
pages it already operates.

## Token scoping — lands at M4 (`repo`/`pkg` families)

Planned: a fine-grained GitHub PAT with `issues:write` on the five sibling
repos (to open/close gate-notification issues there is never in scope — only
dogwatch's own repo gets issues; siblings are read-only for `repo`/`pkg`
checks) and `contents:write` on dogwatch only (to publish the nightly commit).
No token is ever a published artifact (see Redaction below); SPEC §14 Q3
tracks the fine-grained-PAT-vs-GitHub-App decision.

## Redaction allowlist — header capture is allowlist-only — lands at M1

`evidence.headers` in a published check only ever contains headers on an
explicit allowlist (`Strict-Transport-Security`, `Content-Security-Policy`,
`X-Content-Type-Options`, and similar declared, non-secret policy headers).
`Authorization`, `Set-Cookie`, and anything not on the allowlist is dropped
before the evidence object is constructed — not redacted after the fact.
`dogwatch verify` (R15) independently scans every published record against a
secret-shape denylist (`ghp_`, `sk-`, JWT-shaped strings, AWS-key-shaped
strings, private-key PEM headers) and fails CI if anything matches.

## Approval-token threat note — lands at M5

The single gated write path (`POST /api/gate/decide`) is authenticated by a
single-use HMAC-SHA256 token (sluice `mintToken`), timing-safe compared, with
the nonce burned by the same conditional update that records the decision and
a 48h expiry. A stolen or replayed token can decide at most one already-open
gate once; it cannot mint a new one, list gates, or read anything else. The
token is typed out of every public artifact by construction (SPEC §4: the
notification composer for public artifacts takes a `PublicGateSummary` that
has no token field) — it can reach an operator's private channel
(`NOTIFY_WEBHOOK_URL`) but never a public issue or the published record.

## Reverse threat: dogwatch is a public repo that publishes its own operational data

Every run record is public by design (that is the product). `dogwatch verify`
R15 is the backstop against a probe response accidentally carrying a secret
into a published artifact (e.g. a misconfigured sibling leaking an env var in
a response header) — allowlist capture at write time, denylist scan at CI
time, two independent layers.

## Disclosure

Email jameslorenzsantos@gmail.com. No bug bounty; honest credit given.
