/**
 * Build the `curl` reproduction line for a check's request (SPEC §3: every
 * check's `reproduce` field MUST be non-empty — a visitor reproduces the
 * exact request in one command). Pure, zero I/O.
 */
export function reproduceCurl(request: { method: string; url: string; headersSent: string[] }): string {
  const parts = ["curl", "-sS"];
  if (request.method === "HEAD") parts.push("-I");
  else if (request.method !== "GET") parts.push("-X", request.method);
  for (const h of request.headersSent) {
    parts.push("-H", `"${h}"`);
  }
  parts.push(`"${request.url}"`);
  return parts.join(" ");
}
