/**
 * Deterministic, dependency-free checksum of a save payload.
 *
 * Used to skip pointless network writes when nothing actually changed, and to
 * let a client notice that the cloud row it is holding is byte-identical to
 * its own. FNV-1a: not cryptographic, and not used for anything that needs to
 * be - collision resistance against an adversary is not the job here.
 *
 * Keys are sorted so that two structurally identical payloads always hash the
 * same, regardless of property insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

export function payloadHash(value: unknown): string {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    // 32-bit FNV prime multiply, kept in range with Math.imul.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
