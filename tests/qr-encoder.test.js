// tests/qr-encoder.test.js
//
// Unit tests for src/js/qr/qr-encoder.js. Covers a QR encode/decode
// round-trip on a known short string.
//
// The project deliberately only ships a QR ENCODER (no application
// decoder — not a product need). To verify a real round-trip without
// duplicating or modifying the source module, this test file embeds a
// small, independent, MINIMAL decoder used only here for verification:
//   - it only re-imports and calls the module's public `encode()`
//     function;
//   - it deliberately limits itself to strings short enough to fit in
//     version 1 (EC level M, a single Reed-Solomon block — so no block
//     interleaving to handle, and no error correction needed since
//     we're reading back a matrix we just generated, with no channel
//     noise);
//   - it only reverses the standard ISO/IEC 18004 structure (finder
//     patterns, timing, format info area, zigzag data traversal) to
//     recover the maskIndex and then the payload bytes — strictly for
//     verification purposes, never reused or exposed by the
//     application itself.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { encode } from '../src/js/qr/qr-encoder.js';

const MASK_FUNCS = [
  (r, c) => (r + c) % 2 === 0,
  (r, c) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2 + (r * c) % 3) % 2) === 0,
  (r, c) => (((r + c) % 2 + (r * c) % 3) % 2) === 0,
];

// Rebuilds the "function module" mask (non-data) for version 1 only
// (no alignment pattern, no version info): 3 finders + separators,
// timing, format info area, dark module.
function buildIsFnV1(size) {
  const isFn = Array.from({ length: size }, () => new Array(size).fill(false));
  function markFinderBox(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const rr = row + r, cc = col + c;
        if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
        isFn[rr][cc] = true;
      }
    }
  }
  markFinderBox(0, 0);
  markFinderBox(0, size - 7);
  markFinderBox(size - 7, 0);
  for (let i = 8; i < size - 8; i++) {
    isFn[6][i] = true;
    isFn[i][6] = true;
  }
  for (let i = 0; i <= 8; i++) {
    isFn[8][i] = true;
    isFn[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    isFn[8][size - 1 - i] = true;
    isFn[size - 1 - i][8] = true;
  }
  return isFn;
}

// Reads the 15 format info bits (first copy, rows/columns 0-8) and
// decodes them into { maskIndex, ecLevelBits }.
function readFormatInfo(modules) {
  const bitAt = (i) => {
    if (i <= 5) return modules[8][i] ? 1 : 0;
    if (i === 6) return modules[8][7] ? 1 : 0;
    if (i === 7) return modules[8][8] ? 1 : 0;
    if (i === 8) return modules[7][8] ? 1 : 0;
    // i = 9..14 -> modules[14-i][8]
    return modules[14 - i][8] ? 1 : 0;
  };
  let bits = 0;
  for (let i = 0; i <= 14; i++) bits |= bitAt(i) << (14 - i);
  const unmasked = bits ^ 0b101010000010010;
  const data = (unmasked >> 10) & 0x1f; // 5 bits: ecLevel(2) + maskIndex(3)
  const maskIndex = data & 0b111;
  const ecLevelBits = (data >> 3) & 0b11;
  return { maskIndex, ecLevelBits };
}

// Reverses placeData(): reads data bits back in the same zigzag
// order as they were written, unmasking each module on the fly.
function readDataBits(modules, isFn, maskIndex) {
  const size = modules.length;
  const maskFn = MASK_FUNCS[maskIndex];
  const bits = [];
  let col = size - 1;
  let goingUp = true;
  while (col > 0) {
    if (col === 6) col--;
    for (let i = 0; i < size; i++) {
      const row = goingUp ? size - 1 - i : i;
      for (const cc of [col, col - 1]) {
        if (!isFn[row][cc]) {
          const masked = modules[row][cc] ? 1 : 0;
          const unmasked = maskFn(row, cc) ? masked ^ 1 : masked;
          bits.push(unmasked);
        }
      }
    }
    goingUp = !goingUp;
    col -= 2;
  }
  return bits;
}

function bitsToBytes(bits) {
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  return out;
}

// Verification decoder limited to version 1 (sufficient for the
// short strings used in these tests). Returns the original payload
// bytes.
function decodeVersion1QrPayload({ version, size, modules }) {
  assert.equal(version, 1, 'This test decoder only handles version 1 (expects a short string)');
  const isFn = buildIsFnV1(size);
  const { maskIndex } = readFormatInfo(modules);
  const bits = readDataBits(modules, isFn, maskIndex);
  const codewords = bitsToBytes(bits);
  // codewords = [dataCodewords..., ecCodewords...] for a single block
  // (version 1, EC level M: RS_BLOCKS_M[0] = [1,26,16] -> 16 data, 10 EC).
  const mode = (codewords[0] >> 4) & 0xf;
  assert.equal(mode, 0b0100, 'Expected mode: byte mode (0100)');
  const length = ((codewords[0] & 0xf) << 4) | (codewords[1] >> 4);
  const payload = [];
  // Payload bytes are offset by 4 bits (mode) + 8 bits (length) =
  // 12 bits = 1.5 bytes relative to the codeword stream.
  let bitOffset = 12;
  for (let i = 0; i < length; i++) {
    let v = 0;
    for (let j = 0; j < 8; j++) {
      const byteIdx = Math.floor(bitOffset / 8);
      const bitIdx = 7 - (bitOffset % 8);
      const bit = (codewords[byteIdx] >> bitIdx) & 1;
      v = (v << 1) | bit;
      bitOffset++;
    }
    payload.push(v);
  }
  return new Uint8Array(payload);
}

describe('qr/qr-encoder.js — encode() basic structure', () => {
  test('matrix size is consistent with the returned version (size = 4*version + 17)', () => {
    const result = encode(new TextEncoder().encode('HI'));
    assert.equal(result.size, 4 * result.version + 17);
    assert.equal(result.modules.length, result.size);
    assert.equal(result.modules[0].length, result.size);
  });

  test('returns null when the payload exceeds the maximum capacity (version 40, EC M)', () => {
    const tooLong = new Uint8Array(3000).fill(65); // far beyond version 40 / EC M capacity
    const result = encode(tooLong);
    assert.equal(result, null);
  });
});

describe('qr/qr-encoder.js — encode/decode round-trip on a known short string', () => {
  const shortStrings = ['HI', 'Smart Enigma', 'Test123!', 'A'];

  for (const str of shortStrings) {
    test(`round-trip: "${str}"`, () => {
      const bytes = new TextEncoder().encode(str);
      const result = encode(bytes);
      assert.notEqual(result, null);
      const decoded = decodeVersion1QrPayload(result);
      assert.equal(new TextDecoder().decode(decoded), str);
    });
  }
});
