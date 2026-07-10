// src/js/shamir/shamir-gf256.js
//
// Crypto-adjacent core (no DOM dependency) introduced in Phase D
// (v6.0.0). This is NOT part of the project's frozen "zone interdite"
// (deriveKey/encryptBytes/decryptBytes/generateSubstitution) — it is a
// new, independent algorithm layered entirely on top of that untouched
// core, never modifying it.
//
// Shamir's Secret Sharing over GF(256), built on the same
// multiplicative field construction as AES (generator 0x03, modulus
// 0x11B = x^8+x^4+x^3+x+1) — a classic, well-documented construction
// (the same field used by tools like `ssss`), not an invented one.
//
// Share wire format (hex string, case-insensitive on read):
//   [threshold: 1 byte hex][index: 1 byte hex][data: N bytes hex]
// `threshold` and `index` are share metadata, not secret data:
// embedding the threshold lets the UI tell the person up front how
// many more shares are needed (`shamirNeedMore`) instead of only
// failing after a full interpolation attempt.
//
// Integrity: the split payload is [4-byte SHA-256 prefix of the
// secret][secret bytes]. On combine, the prefix is recomputed from the
// reconstructed secret and compared — a below-threshold subset, or
// shares from different splits, will fail this check (with
// overwhelming probability) rather than silently returning garbage as
// "the key".

// GF(256) log/exp tables, generator 0x03, modulus 0x11B (AES's field).
// Note: 2 (0x02) is NOT a primitive element of this field (its
// multiplicative order is only 51, not 255) — 3 (0x02 XOR 0x01) is,
// so the table is built by repeated multiplication by 3, not 2.
const EXP = new Uint8Array(256);
const LOG = new Uint8Array(256);
(function buildTables() {
  let p = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = p;
    LOG[p] = i;
    // p = p * 3 = xtime(p) XOR p, reduced mod 0x11B if it overflows 8 bits.
    let doubled = p << 1;
    if (doubled & 0x100) doubled ^= 0x11b;
    p = doubled ^ p;
  }
  EXP[255] = EXP[0];
})();

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] + LOG[b]) % 255];
}

function gfDiv(a, b) {
  if (a === 0) return 0;
  if (b === 0) throw new Error('shamir: division by zero in GF(256)');
  return EXP[(LOG[a] - LOG[b] + 255) % 255];
}

// Horner's method; all arithmetic in GF(256) (addition/subtraction === XOR).
function evalPoly(coeffs, x) {
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = gfMul(result, x) ^ coeffs[i];
  }
  return result;
}

/**
 * Splits raw secret bytes into `totalShares` shares, any `threshold`
 * of which reconstruct the original bytes exactly via GF(256)
 * polynomial evaluation (one random polynomial of degree
 * threshold-1 per byte, constant term = that byte).
 * @param {Uint8Array} secretBytes - Raw bytes to split.
 * @param {number} threshold - Minimum shares required to reconstruct (>= 2).
 * @param {number} totalShares - Total shares to generate (>= threshold, <= 255).
 * @returns {{index:number, threshold:number, bytes:Uint8Array}[]}
 */
export function splitSecretBytes(secretBytes, threshold, totalShares) {
  if (!Number.isInteger(threshold) || threshold < 2) {
    throw new Error('shamir: threshold must be an integer >= 2');
  }
  if (!Number.isInteger(totalShares) || totalShares < threshold) {
    throw new Error('shamir: totalShares must be an integer >= threshold');
  }
  if (totalShares > 255) throw new Error('shamir: totalShares must be <= 255');

  const shares = [];
  for (let s = 1; s <= totalShares; s++) {
    shares.push({ index: s, threshold, bytes: new Uint8Array(secretBytes.length) });
  }

  for (let byteIdx = 0; byteIdx < secretBytes.length; byteIdx++) {
    const coeffs = new Uint8Array(threshold);
    coeffs[0] = secretBytes[byteIdx];
    if (threshold > 1) {
      const rnd = crypto.getRandomValues(new Uint8Array(threshold - 1));
      coeffs.set(rnd, 1);
    }
    for (const share of shares) {
      share.bytes[byteIdx] = evalPoly(coeffs, share.index);
    }
  }
  return shares;
}

/**
 * Reconstructs the original secret bytes from >= threshold shares via
 * Lagrange interpolation at x = 0. Does not know or check the
 * "intended" threshold itself — callers wanting the friendlier
 * "need N more shares" UX should check share.threshold before calling
 * this (see combineShareStringsToSecret() below).
 * @param {{index:number, bytes:Uint8Array}[]} shares
 * @returns {Uint8Array}
 */
export function combineSharesBytes(shares) {
  if (!shares || shares.length < 2) throw new Error('shamir: at least 2 shares are required');
  const len = shares[0].bytes.length;
  const dedup = new Map();
  for (const s of shares) {
    if (s.bytes.length !== len) throw new Error('shamir: shares have inconsistent lengths');
    if (!Number.isInteger(s.index) || s.index < 1 || s.index > 255) {
      throw new Error('shamir: invalid share index');
    }
    dedup.set(s.index, s); // duplicate index → last one wins
  }
  const list = Array.from(dedup.values());
  if (list.length < 2) throw new Error('shamir: at least 2 distinct shares are required');

  const secret = new Uint8Array(len);
  for (let byteIdx = 0; byteIdx < len; byteIdx++) {
    let acc = 0;
    for (let i = 0; i < list.length; i++) {
      const xi = list[i].index;
      const yi = list[i].bytes[byteIdx];
      let li = 1;
      for (let j = 0; j < list.length; j++) {
        if (j === i) continue;
        const xj = list[j].index;
        // Lagrange basis at x=0: L_i(0) = prod_{j!=i} x_j / (x_j XOR x_i)
        // (subtraction === addition === XOR in this field).
        li = gfMul(li, gfDiv(xj, xj ^ xi));
      }
      acc ^= gfMul(yi, li);
    }
    secret[byteIdx] = acc;
  }
  return secret;
}

function byteToHex(b) { return b.toString(16).padStart(2, '0'); }

/**
 * Encodes a share as a hex string: threshold(1B) + index(1B) + data(N B).
 * @param {{index:number, threshold:number, bytes:Uint8Array}} share
 * @returns {string}
 */
export function shareToString(share) {
  return byteToHex(share.threshold) + byteToHex(share.index) +
    Array.from(share.bytes).map(byteToHex).join('');
}

/**
 * Parses a hex share string back into { threshold, index, bytes }.
 * Throws on any malformed input (wrong charset, odd length, too
 * short, or out-of-range threshold/index).
 * @param {string} str
 * @returns {{threshold:number, index:number, bytes:Uint8Array}}
 */
export function stringToShare(str) {
  const clean = String(str || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!/^[0-9a-f]+$/.test(clean) || clean.length < 6 || clean.length % 2 !== 0) {
    throw new Error('shamir: malformed share');
  }
  const threshold = parseInt(clean.slice(0, 2), 16);
  const index = parseInt(clean.slice(2, 4), 16);
  if (threshold < 2 || index < 1 || index > 255) throw new Error('shamir: malformed share metadata');
  const dataHex = clean.slice(4);
  const bytes = new Uint8Array(dataHex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(dataHex.substr(i * 2, 2), 16);
  return { threshold, index, bytes };
}

const FINGERPRINT_LEN = 4;

/**
 * Splits a UTF-8 secret string into share strings, with an embedded
 * SHA-256-derived fingerprint so combineShareStringsToSecret() can
 * detect a below-threshold or mismatched combination instead of
 * returning silent garbage as "the key".
 * @param {string} secretText - The secret (e.g. the encryption key) to split.
 * @param {number} threshold
 * @param {number} totalShares
 * @returns {Promise<string[]>}
 */
export async function splitSecretToShareStrings(secretText, threshold, totalShares) {
  const secretBytes = new TextEncoder().encode(secretText);
  const digest = await crypto.subtle.digest('SHA-256', secretBytes);
  const fp = new Uint8Array(digest).slice(0, FINGERPRINT_LEN);
  const payload = new Uint8Array(fp.length + secretBytes.length);
  payload.set(fp, 0);
  payload.set(secretBytes, fp.length);
  const shares = splitSecretBytes(payload, threshold, totalShares);
  return shares.map(shareToString);
}

/**
 * Combines share strings back into the original secret string.
 * Throws an Error with a numeric `.needed` property if fewer shares
 * than the embedded threshold were supplied (checked before
 * attempting interpolation). Throws a plain Error if the shares are
 * malformed, come from different splits (threshold mismatch), or the
 * reconstructed fingerprint doesn't match (wrong/corrupted shares).
 * @param {string[]} shareStrings
 * @returns {Promise<string>}
 */
export async function combineShareStringsToSecret(shareStrings) {
  const parsed = (shareStrings || [])
    .map(s => (s || '').trim())
    .filter(Boolean)
    .map(stringToShare);

  if (parsed.length === 0) throw new Error('shamir: no shares provided');
  const threshold = parsed[0].threshold;
  if (!parsed.every(s => s.threshold === threshold)) {
    throw new Error('shamir: shares come from different splits (threshold mismatch)');
  }
  if (parsed.length < threshold) {
    const err = new Error('shamir: not enough shares');
    err.needed = threshold;
    throw err;
  }

  const payload = combineSharesBytes(parsed);
  if (payload.length < FINGERPRINT_LEN) throw new Error('shamir: reconstructed payload too short');
  const fp = payload.slice(0, FINGERPRINT_LEN);
  const secretBytes = payload.slice(FINGERPRINT_LEN);
  const digest = await crypto.subtle.digest('SHA-256', secretBytes);
  const expectedFp = new Uint8Array(digest).slice(0, FINGERPRINT_LEN);
  const ok = fp.length === FINGERPRINT_LEN && expectedFp.every((b, i) => b === fp[i]);
  if (!ok) throw new Error('shamir: checksum mismatch — invalid or mismatched shares');
  return new TextDecoder().decode(secretBytes);
}
