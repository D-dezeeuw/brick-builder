import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { validateCreation, type Creation } from './schema';

/** URL-hash param name used when embedding a creation. `#c=<encoded>`. */
export const SHARE_HASH_PARAM = 'c';

/** lz-string's URI-safe variant — produces base64url-ish output, no trailing `=` padding. */
export function encodeCreation(creation: Creation): string {
  return compressToEncodedURIComponent(JSON.stringify(creation));
}

/** Decode + validate. Returns null on decompression / parse / schema failure. */
export function decodeCreation(encoded: string): Creation | null {
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const parsed = JSON.parse(json) as unknown;
    return validateCreation(parsed);
  } catch {
    return null;
  }
}

/** Read `#c=<encoded>` from a URL (defaults to current location). */
export function readCreationFromHash(hash: string = typeof location !== 'undefined' ? location.hash : ''): Creation | null {
  if (!hash || hash.length <= 1) return null;
  // URLSearchParams expects no leading `#` — strip it.
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const encoded = params.get(SHARE_HASH_PARAM);
  if (!encoded) return null;
  return decodeCreation(encoded);
}

/** Build a full shareable URL for a given creation. */
export function buildShareUrl(creation: Creation, origin?: string, pathname?: string): string {
  const o = origin ?? (typeof location !== 'undefined' ? location.origin : '');
  const p = pathname ?? (typeof location !== 'undefined' ? location.pathname : '/');
  return `${o}${p}#${SHARE_HASH_PARAM}=${encodeCreation(creation)}`;
}
