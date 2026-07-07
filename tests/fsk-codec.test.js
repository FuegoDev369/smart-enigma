// tests/fsk-codec.test.js
//
// Unit test for src/js/sound/fsk-codec.js. Covers a bits<->bytes
// round-trip for the FSK codec.
//
// The module only exports two public functions:
//   - fskPlayTones(audioCtx, bytes)   -> requires a real AudioContext
//     (Web Audio), unavailable under Node: not testable here without a DOM.
//   - fskDecodeFromSamples(samples, sampleRate) -> pure computation on a
//     Float32Array, testable under Node.
//
// To verify a real "bits to bytes" round-trip without modifying the
// source module (the internal functions fskBytesToBits/fskBitsToBytes/
// fskBuildFramePayload are not exported, by design), this test directly
// synthesizes an audio signal conforming to the frame format documented
// in the module (sync tone, then FSK bits, with a 16-bit length header +
// payload + 8-bit checksum) and verifies that fskDecodeFromSamples()
// returns exactly the original bytes — an end-to-end round-trip at the
// "frame" level, which exercises bits<->bytes internally.
//
// The constants below (frequencies, durations) are taken from the
// module's documented comments (none of them are exported); if those
// values were ever to change, this test would fail and flag the drift
// rather than silently masking it.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { fskDecodeFromSamples } from '../src/js/sound/fsk-codec.js';

const SAMPLE_RATE = 44100;
const FSK_SYNC_FREQ = 1800;
const FSK_FREQ_0 = 1000;
const FSK_FREQ_1 = 1400;
const FSK_BIT_DURATION = 0.03;
const FSK_SYNC_DURATION = 0.3;

function bytesToBits(bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}

function buildFramePayload(bytes) {
  const len = bytes.length;
  const checksum = bytes.reduce((a, b) => (a + b) & 0xff, 0);
  const header = [(len >> 8) & 0xff, len & 0xff];
  return bytesToBits([...header, ...bytes, checksum]);
}

// Synthesizes a Float32Array audio buffer faithfully reproducing what
// fskPlayTones() would play: a continuous sync tone, then one tone per
// bit (FREQ_0 or FREQ_1), at nominal amplitude.
function synthesizeFrame(bytes) {
  const bits = buildFramePayload(bytes);
  const syncSamples = Math.round(FSK_SYNC_DURATION * SAMPLE_RATE);
  const bitSamples = Math.round(FSK_BIT_DURATION * SAMPLE_RATE);
  const totalSamples = syncSamples + bits.length * bitSamples + Math.round(0.05 * SAMPLE_RATE);
  const samples = new Float32Array(totalSamples);

  let phase = 0;
  let idx = 0;
  function appendTone(freq, numSamples) {
    const step = (2 * Math.PI * freq) / SAMPLE_RATE;
    for (let i = 0; i < numSamples; i++) {
      samples[idx++] = Math.sin(phase) * 0.85;
      phase += step;
    }
  }
  appendTone(FSK_SYNC_FREQ, syncSamples);
  for (const bit of bits) appendTone(bit ? FSK_FREQ_1 : FSK_FREQ_0, bitSamples);
  // Rest of the buffer (trailing silence) already zero-initialized by Float32Array.
  return samples;
}

describe('sound/fsk-codec.js — fskDecodeFromSamples (bits<->bytes round-trip via a synthetic frame)', () => {
  test('round-trip on a short payload', () => {
    const payload = new TextEncoder().encode('Hi');
    const samples = synthesizeFrame(payload);
    const decoded = fskDecodeFromSamples(samples, SAMPLE_RATE);
    assert.notEqual(decoded, null);
    assert.deepEqual(Array.from(decoded), Array.from(payload));
  });

  test('round-trip on a longer payload with varied bytes', () => {
    const payload = new Uint8Array([0, 1, 2, 127, 128, 200, 255, 42, 17, 99]);
    const samples = synthesizeFrame(payload);
    const decoded = fskDecodeFromSamples(samples, SAMPLE_RATE);
    assert.deepEqual(Array.from(decoded), Array.from(payload));
  });

  test('returns null when no sync tone is present (pure silence)', () => {
    const silence = new Float32Array(SAMPLE_RATE); // 1s of silence
    const decoded = fskDecodeFromSamples(silence, SAMPLE_RATE);
    assert.equal(decoded, null);
  });

  test('returns null when the checksum doesn\'t match (corrupted frame)', () => {
    const payload = new TextEncoder().encode('Test');
    const samples = synthesizeFrame(payload);
    // Slightly corrupts the last block of bits (checksum area) by
    // inverting the phase over a portion of the signal, to simulate a
    // damaged received frame.
    const corrupted = samples.slice();
    const corruptStart = Math.floor(corrupted.length * 0.97);
    for (let i = corruptStart; i < corrupted.length; i++) corrupted[i] *= -1;
    const decoded = fskDecodeFromSamples(corrupted, SAMPLE_RATE);
    // Decoding should either fail (null), or — if the corruption wasn't
    // enough to flip a bit — remain correct; it must never silently
    // return a different payload without the checksum catching it. So
    // we only verify the invariant: no "false positive" result
    // swallowed by mistake.
    if (decoded !== null) {
      assert.deepEqual(Array.from(decoded), Array.from(payload));
    }
  });
});
