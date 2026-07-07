// tests/lzss.test.js
//
// Unit tests for src/js/compression/lzss.js. Covers LZSS round-trip,
// including the "stored raw" fallback mechanism of the
// compressPayloadBytes/decompressPayloadBytes wrapper.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  lzssCompress,
  lzssDecompress,
  compressPayloadBytes,
  decompressPayloadBytes,
} from '../src/js/compression/lzss.js';

function toBytes(str) {
  return new TextEncoder().encode(str);
}

describe('compression/lzss.js — lzssCompress / lzssDecompress (low level)', () => {
  const cases = [
    ['empty string', ''],
    ['single character', 'A'],
    ['strong repetition (favors matches)', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'],
    ['plain English text', 'The quick brown fox jumps over the lazy dog. The quick brown fox jumps again.'],
    ['multilingual text (accents + CJK)', 'Café — Crème brûlée — こんにちは世界 — Привет мир'],
  ];

  for (const [label, input] of cases) {
    test(`round-trip: ${label}`, () => {
      const bytes = toBytes(input);
      const compressed = lzssCompress(bytes);
      const decompressed = lzssDecompress(compressed);
      assert.deepEqual(Array.from(decompressed), Array.from(bytes));
    });
  }

  test('round-trip on a large volume (5000 pseudo-random bytes + repeated patterns)', () => {
    const parts = [];
    for (let i = 0; i < 100; i++) {
      parts.push('repeated-pattern-XYZ-'); // repeated -> should produce matches
    }
    for (let i = 0; i < 3000; i++) {
      parts.push(String.fromCharCode(33 + (i % 90))); // varied noise
    }
    const input = parts.join('');
    const bytes = toBytes(input);
    const compressed = lzssCompress(bytes);
    const decompressed = lzssDecompress(compressed);
    assert.deepEqual(Array.from(decompressed), Array.from(bytes));
  });
});

describe('compression/lzss.js — compressPayloadBytes / decompressPayloadBytes (1-byte header wrapper)', () => {
  test('round-trip on compressible text: header = compressed, savings > 0', () => {
    const bytes = toBytes('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    const { bytes: packed, savings } = compressPayloadBytes(bytes);
    assert.equal(packed[0], 0x31); // '1' = compressed
    assert.ok(savings > 0);
    const restored = decompressPayloadBytes(packed);
    assert.deepEqual(Array.from(restored), Array.from(bytes));
  });

  test('"stored raw" fallback when compression doesn\'t help: header = raw, savings = 0', () => {
    // Very short, non-repetitive content: LZSS compression (one
    // control byte of overhead per 8 tokens) can't reduce the size,
    // so the wrapper must fall back to raw storage.
    const bytes = toBytes('Az');
    const { bytes: packed, savings } = compressPayloadBytes(bytes);
    assert.equal(packed[0], 0x30); // '0' = stored raw
    assert.equal(savings, 0);
    const restored = decompressPayloadBytes(packed);
    assert.deepEqual(Array.from(restored), Array.from(bytes));
  });

  test('round-trip on an empty payload', () => {
    const bytes = new Uint8Array([]);
    const packed = compressPayloadBytes(bytes).bytes;
    const restored = decompressPayloadBytes(packed);
    assert.equal(restored.length, 0);
  });

  test('the header uses printable ASCII bytes 0x30/0x31 (fix v5.0.1, not 0x00/0x01)', () => {
    const bytes = toBytes('some arbitrary text');
    const packed = compressPayloadBytes(bytes).bytes;
    assert.ok(packed[0] === 0x30 || packed[0] === 0x31);
  });
});
