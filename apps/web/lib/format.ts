/** Shared formatting helpers (SPEC §8: cost rendered to four decimals —
 * rounding $0.0055 to "$0.01" would overstate it by 2x). Pure, no I/O. */

export function formatUsd(microUsd: number): string {
  return `$${(microUsd / 1_000_000).toFixed(4)}`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
