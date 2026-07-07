// src/js/compression/lzss.js
//
// Homemade LZSS-style compressor/decompressor (sliding window +
// literal/match tokens), written from scratch, no external library.
// Only touches the plaintext bytes BEFORE encryption — the crypto core
// (aes-gcm.js / legacy-cipher.js) stays fully independent of this
// module.

/* -------- Compression --------
   Homemade LZSS-style compressor (sliding window + literal/match
   tokens), written from scratch, no external library. A homemade
   algorithm will have a modest compression ratio compared to gzip,
   which is an accepted tradeoff for keeping the app dependency-free.
   Built ENTIRELY OUTSIDE the crypto core: it only
   reshapes the PLAINTEXT bytes before they reach the untouched
   encryptBytes()/decryptBytes(), exactly like the file-payload
   wrapper (file-payload.js) already does. A 1-byte self-describing
   header (0 = stored raw, 1 = LZSS-compressed) lets the encoder fall
   back to storing the original bytes untouched whenever compression
   would not actually help (e.g. already-random-looking short text),
   so the reported savings are always honest. Existing AES/substitution
   ciphertexts produced without this toggle are completely unaffected:
   this path is only used when the "compress before encrypting" switch
   is enabled on BOTH ends, exactly like the existing Max-Enigma toggle
   already requires matching state on both sides to decrypt. */
const LZSS_WINDOW_SIZE = 4095; // fits exactly in the 12-bit offset field
const LZSS_MIN_MATCH = 3;
const LZSS_MAX_MATCH = 18; // 4-bit length field encodes (length - 3)

/**
 * Compresses bytes using a homemade LZSS-style sliding-window scheme.
 * @param {Uint8Array} bytes - Raw bytes to compress.
 * @returns {Uint8Array} Compressed bytes (control-byte + literal/match tokens).
 */
export function lzssCompress(bytes) {
  const out = [];
  let controlByte = 0;
  let controlCount = 0;
  let controlPos = -1;

  function flushControl() { if (controlPos >= 0) out[controlPos] = controlByte; }
  function startControlIfNeeded() {
    if (controlCount === 0) { controlPos = out.length; out.push(0); controlByte = 0; }
  }
  function pushLiteral(byte) {
    startControlIfNeeded();
    out.push(byte);
    controlCount++;
    if (controlCount === 8) { flushControl(); controlCount = 0; }
  }
  function pushMatch(offset, length) {
    startControlIfNeeded();
    controlByte |= (1 << controlCount);
    out.push((offset >> 4) & 0xFF);
    out.push(((offset & 0xF) << 4) | (length - LZSS_MIN_MATCH));
    controlCount++;
    if (controlCount === 8) { flushControl(); controlCount = 0; }
  }

  let pos = 0;
  const n = bytes.length;
  while (pos < n) {
    let bestLen = 0, bestOffset = 0;
    const windowStart = Math.max(0, pos - LZSS_WINDOW_SIZE);
    const maxLen = Math.min(LZSS_MAX_MATCH, n - pos);
    if (maxLen >= LZSS_MIN_MATCH) {
      for (let cand = pos - 1; cand >= windowStart; cand--) {
        let len = 0;
        while (len < maxLen && bytes[cand + len] === bytes[pos + len]) len++;
        if (len > bestLen) { bestLen = len; bestOffset = pos - cand; }
        if (bestLen === maxLen) break;
      }
    }
    if (bestLen >= LZSS_MIN_MATCH) { pushMatch(bestOffset, bestLen); pos += bestLen; }
    else { pushLiteral(bytes[pos]); pos += 1; }
  }
  flushControl();
  return new Uint8Array(out);
}

/**
 * Decompresses bytes previously produced by lzssCompress().
 * @param {Uint8Array} bytes - Compressed bytes to decompress.
 * @returns {Uint8Array} The original, decompressed bytes.
 */
export function lzssDecompress(bytes) {
  const out = [];
  let i = 0;
  const n = bytes.length;
  while (i < n) {
    const control = bytes[i++];
    for (let bit = 0; bit < 8 && i < n; bit++) {
      if ((control >> bit) & 1) {
        const b1 = bytes[i++], b2 = bytes[i++];
        const offset = (b1 << 4) | (b2 >> 4);
        const length = (b2 & 0xF) + LZSS_MIN_MATCH;
        const start = out.length - offset;
        for (let k = 0; k < length; k++) out.push(out[start + k]);
      } else {
        out.push(bytes[i++]);
      }
    }
  }
  return new Uint8Array(out);
}

/* Fix (v5.0.1): the header byte used to be a raw 0x00/0x01 control
   byte. 0x00 is a perfectly legal, INVISIBLE UTF-8 NUL character, so
   decrypting a compressed-and-flagged blob through the WRONG
   (non-compression) path could silently reconstruct "\u0000 + the
   original text" — indistinguishable from a real success in most
   text fields. Using the printable ASCII digits '0'/'1' instead
   keeps the format exactly as self-describing and 1-byte, but now
   ANY toggle mismatch produces a visibly wrong leading character
   instead of a silent, invisible one. Confirmed by manual testing
   (TEST.md, test 1.4) before this fix. */
const COMPRESS_FLAG_RAW = 0x30;        // ASCII '0'
const COMPRESS_FLAG_COMPRESSED = 0x31; // ASCII '1'

// 1-byte header ('0' = raw, '1' = compressed) + payload, always
// picking whichever is smaller so the reported savings are never overstated.
/**
 * Compresses bytes with a 1-byte self-describing header, falling back to storing them
 * raw whenever compression would not actually reduce their size.
 * @param {Uint8Array} bytes - Plaintext bytes to compress.
 * @returns {{bytes: Uint8Array, savings: number}} Header-prefixed bytes and the percentage saved (0 if stored raw).
 */
export function compressPayloadBytes(bytes) {
  const compressed = lzssCompress(bytes);
  if (compressed.length < bytes.length) {
    const out = new Uint8Array(1 + compressed.length);
    out[0] = COMPRESS_FLAG_COMPRESSED;
    out.set(compressed, 1);
    const savings = bytes.length > 0 ? Math.round((1 - compressed.length / bytes.length) * 100) : 0;
    return { bytes: out, savings };
  }
  const out = new Uint8Array(1 + bytes.length);
  out[0] = COMPRESS_FLAG_RAW;
  out.set(bytes, 1);
  return { bytes: out, savings: 0 };
}

/**
 * Reverses compressPayloadBytes(), reading the header byte to decide whether to decompress.
 * @param {Uint8Array} bytes - Header-prefixed bytes produced by compressPayloadBytes().
 * @returns {Uint8Array} The original plaintext bytes.
 */
export function decompressPayloadBytes(bytes) {
  const flag = bytes[0];
  const rest = bytes.slice(1);
  return flag === COMPRESS_FLAG_COMPRESSED ? lzssDecompress(rest) : rest;
}
