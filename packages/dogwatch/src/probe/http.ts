/**
 * Real HTTP probe (SPEC §4: undici). The ONLY implementation of `HttpProbe`
 * that touches the network. Redirects are followed manually — undici's base
 * `request()` does not auto-follow redirects (that requires an explicit
 * `interceptors.redirect()`), so a bare `request()` call already hands back
 * the 30x response itself — so every hop is captured into `redirects[]`;
 * `reach.redirect_chain_changed` needs the whole chain, not just the final
 * status.
 */
import { createHash } from "node:crypto";
import { request } from "undici";
import { ProbeError, type HttpGetResult, type HttpHeadResult, type HttpProbe, type HttpProbeOptions, type ProbeRedirectHop } from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BODY_BYTES = 2_000_000;
const DEFAULT_MAX_REDIRECTS = 10;

type UndiciBody = Awaited<ReturnType<typeof request>>["body"];

function flattenHeaders(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (v === undefined) continue;
    out[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
  }
  return out;
}

/** Drain a body stream without reading it, so the underlying socket can be
 * reused — undici's `BodyReadable` exposes `.dump()` for this, but we drain
 * by async iteration instead so the type stays the portable async-iterable
 * shape rather than undici's own class. */
async function drain(body: UndiciBody): Promise<void> {
  try {
    for await (const _chunk of body) {
      // discard
    }
  } catch {
    // best-effort drain; a failure here must never fail the probe call
  }
}

async function followRedirects(
  method: "GET" | "HEAD",
  startUrl: string,
  opts: Required<HttpProbeOptions>
): Promise<{
  status: number;
  finalUrl: string;
  redirects: ProbeRedirectHop[];
  headers: Record<string, string>;
  bodyStream: UndiciBody | undefined;
}> {
  let url = startUrl;
  const redirects: ProbeRedirectHop[] = [];
  for (let hop = 0; ; hop++) {
    if (hop > opts.maxRedirects) {
      throw new ProbeError("network_error", `exceeded ${String(opts.maxRedirects)} redirects`, startUrl);
    }
    let response: Awaited<ReturnType<typeof request>>;
    try {
      response = await request(url, {
        method,
        headersTimeout: opts.timeoutMs,
        bodyTimeout: opts.timeoutMs,
      });
    } catch (cause) {
      const isTimeout =
        cause instanceof Error && (cause.name === "HeadersTimeoutError" || cause.name === "BodyTimeoutError");
      throw new ProbeError(isTimeout ? "timeout" : "network_error", `${method} ${url} failed`, url, { cause });
    }
    const headers = flattenHeaders(response.headers);
    if (response.statusCode >= 300 && response.statusCode < 400 && typeof headers.location === "string") {
      redirects.push({ status: response.statusCode, url });
      // Drain the (empty-ish) redirect body so the socket can be reused.
      await drain(response.body);
      url = new URL(headers.location, url).toString();
      continue;
    }
    return { status: response.statusCode, finalUrl: url, redirects, headers, bodyStream: response.body };
  }
}

function withDefaults(opts?: HttpProbeOptions): Required<HttpProbeOptions> {
  return {
    timeoutMs: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxBodyBytes: opts?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES,
    maxRedirects: opts?.maxRedirects ?? DEFAULT_MAX_REDIRECTS,
  };
}

export function createUndiciHttpProbe(): HttpProbe {
  return {
    async get(url, options): Promise<HttpGetResult> {
      const opts = withDefaults(options);
      const startedAt = Date.now();
      const { status, finalUrl, redirects, headers, bodyStream } = await followRedirects("GET", url, opts);
      const chunks: Buffer[] = [];
      let bytes = 0;
      let truncated = false;
      if (bodyStream !== undefined) {
        // undici's `BodyReadable` extends `stream.Readable`, whose
        // `@types/node` async-iterator type is the loose `AsyncIterableIterator<any>`
        // (a Readable can run in object mode) — narrow it to the `Buffer`
        // every non-object-mode HTTP body actually yields.
        for await (const chunk of bodyStream as AsyncIterable<Buffer>) {
          if (bytes >= opts.maxBodyBytes) {
            truncated = true;
            continue;
          }
          const remaining = opts.maxBodyBytes - bytes;
          const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
          if (chunk.length > remaining) truncated = true;
          chunks.push(slice);
          bytes += slice.length;
        }
      }
      const body = Buffer.concat(chunks);
      const ms = Date.now() - startedAt;
      return {
        status,
        finalUrl,
        redirects,
        headers,
        bodyText: body.toString("utf8"),
        bodyTruncated: truncated,
        bytes,
        ms,
        bodySha256: createHash("sha256").update(body).digest("hex"),
      };
    },
    async head(url, options): Promise<HttpHeadResult> {
      const opts = withDefaults(options);
      const startedAt = Date.now();
      const { status, finalUrl, redirects, headers, bodyStream } = await followRedirects("HEAD", url, opts);
      if (bodyStream !== undefined) await drain(bodyStream);
      return { status, finalUrl, redirects, headers, ms: Date.now() - startedAt };
    },
  };
}
