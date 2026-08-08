/**
 * The injected Probe interface (SPEC §4). `src/probe` is the only network
 * code in the whole pipeline; everything downstream (src/checks,
 * src/record's builder) takes a `HttpProbe` as a parameter, so the entire
 * pipeline replays offline from recorded transcripts (SPEC §11) by swapping
 * in `createReplayHttpProbe` instead of `createUndiciHttpProbe`.
 */

export interface ProbeRedirectHop {
  status: number;
  url: string;
}

export interface HttpGetResult {
  status: number;
  finalUrl: string;
  redirects: ProbeRedirectHop[];
  /** Raw, unfiltered response headers as observed. Allowlist filtering into
   * the published `evidence.headers` happens in src/record, never here. */
  headers: Record<string, string>;
  bodyText: string;
  bodyTruncated: boolean;
  /** Bytes actually read of the body (post-truncation if truncated). */
  bytes: number;
  ms: number;
  bodySha256: string;
}

export interface HttpHeadResult {
  status: number;
  finalUrl: string;
  redirects: ProbeRedirectHop[];
  headers: Record<string, string>;
  ms: number;
}

export interface HttpProbeOptions {
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxRedirects?: number;
}

export interface HttpProbe {
  get(url: string, opts?: HttpProbeOptions): Promise<HttpGetResult>;
  head(url: string, opts?: HttpProbeOptions): Promise<HttpHeadResult>;
}

/** Thrown by an `HttpProbe` on transport-level failure (never a 4xx/5xx —
 * those are a normal `HttpGetResult` with that status). */
export class ProbeError extends Error {
  readonly code: "timeout" | "network_error";
  readonly url: string;

  constructor(code: "timeout" | "network_error", message: string, url: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProbeError";
    this.code = code;
    this.url = url;
  }
}
