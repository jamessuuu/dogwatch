/**
 * Replay probe (SPEC §11) — an `HttpProbe` implementation with zero network
 * I/O, backing every response from a recorded transcript keyed by
 * `METHOD url`. This is what lets the real pipeline (record builder +
 * checks, unmodified) replay a `fixtures/transcripts/*.json` file with a
 * frozen clock and seeded ids into a byte-identical record.
 */
import { ProbeError, type HttpGetResult, type HttpHeadResult, type HttpProbe } from "./types.js";

export interface HttpTranscript {
  get?: Record<string, HttpGetResult>;
  head?: Record<string, HttpHeadResult>;
}

export function createReplayHttpProbe(transcript: HttpTranscript): HttpProbe {
  return {
    // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with the live probe
    async get(url) {
      const rec = transcript.get?.[url];
      if (rec === undefined) {
        throw new ProbeError("network_error", `no recorded GET transcript entry for ${url}`, url);
      }
      return rec satisfies HttpGetResult;
    },
    // eslint-disable-next-line @typescript-eslint/require-await -- interface parity with the live probe
    async head(url) {
      const rec = transcript.head?.[url];
      if (rec === undefined) {
        throw new ProbeError("network_error", `no recorded HEAD transcript entry for ${url}`, url);
      }
      return rec satisfies HttpHeadResult;
    },
  };
}
