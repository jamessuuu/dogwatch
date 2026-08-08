/**
 * Wraps an `HttpProbe` so every single HTTP call goes through
 * `sluice.run()` with `circuitKey = host` (SPEC §5 Neon wiring section,
 * applied here against `MemoryStore` for M0-M2 per the sequencing note —
 * Postgres + gates land at M4/M5). A host that is failing hard trips the
 * breaker and the wrapped call throws `SluiceError("E_CIRCUIT_OPEN")`
 * instead of retrying into ten timeouts (SPEC §9); the caller translates
 * that into `skipped:circuit_open`.
 */
import { ProbeError, type HttpGetResult, type HttpHeadResult, type HttpProbe, type HttpProbeOptions } from "../probe/types.js";
import type { Json, Sluice } from "@jamessuuu/sluice";

/**
 * `sluice.run<T extends Json>` needs `T` to structurally satisfy `Json`.
 * `HttpGetResult`/`HttpHeadResult` are plain JSON-safe data (strings,
 * numbers, nested records of the same) but are declared as named
 * interfaces, not the open `Record<string, Json>` shape `Json` demands —
 * so the value is round-tripped through `unknown` at the boundary rather
 * than trying to coerce the interfaces themselves into `Json`.
 */
export function wrapProbeWithSluice(probe: HttpProbe, sluice: Sluice, runId: string): HttpProbe {
  return {
    async get(url: string, opts?: HttpProbeOptions) {
      const host = new URL(url).host;
      const outcome = await sluice.run<Json>(
        { key: `probe:${runId}:GET:${url}`, circuitKey: host, retentionMs: 60_000 },
        async () => (await probe.get(url, opts)) as unknown as Json
      );
      requireResult(outcome.value, url);
      return outcome.value as unknown as HttpGetResult;
    },
    async head(url: string, opts?: HttpProbeOptions) {
      const host = new URL(url).host;
      const outcome = await sluice.run<Json>(
        { key: `probe:${runId}:HEAD:${url}`, circuitKey: host, retentionMs: 60_000 },
        async () => (await probe.head(url, opts)) as unknown as Json
      );
      requireResult(outcome.value, url);
      return outcome.value as unknown as HttpHeadResult;
    },
  };
}

/**
 * `outcome.value` is `undefined` exactly when sluice omitted a
 * too-large result (`resultOmitted: true`, above `maxResultBytes` — raised
 * in `build-run.ts` well past any real page size, but never assumed
 * infinite). Surfacing that as a typed `ProbeError` keeps the failure
 * honest (`errorCode` in `notChecked`, SPEC §9) instead of an unhandled
 * `TypeError` reading `.finalUrl` off `undefined` deep in the caller.
 */
function requireResult(value: Json | undefined, url: string): asserts value is Json {
  if (value === undefined) {
    throw new ProbeError("network_error", `probe result for ${url} exceeded sluice's maxResultBytes and was omitted`, url);
  }
}
