# src/effects — lands at M5

sluice wiring for anything that leaves the dogwatch repo: `gates.open`,
`gates.claimDecided`, action executors (GitHub issue open/comment), audit
export, and notifiers (self-repo issue + optional `NOTIFY_WEBHOOK_URL`
token path). See [docs/SPEC.md §5](../../../../docs/SPEC.md) ("Gate flow,
end to end") and §12's M5 row.

M0-M2 never propose an action or open a gate — `actions: []` and
`gates: []` in every run record through M2 are correct, not a placeholder
bug. Wiring this module in without `sluice`'s gate contract frozen (blocked
on `1.0.0-rc.1`, per this repo's own SPEC preamble) would mean re-deriving
policy this repo does not own yet.
