// src/js/sound/fsk-codec.js
//
// Pure FSK codec (computation only, no direct DOM/Web Audio dependency
// beyond the `audioCtx` parameter it's passed).
//
// Homemade FSK modem over Web Audio — Goertzel detection, bit<->byte
// conversions, frame construction, tone emission and decoding. This
// module never touches the DOM; AudioContext/microphone orchestration
// (opening the stream, permissions, polling loop) lives in
// sound-transfer.js.

/* -------- Data-over-sound --------
   Homemade FSK modem over Web Audio (OscillatorNode to emit,
   AnalyserNode-free Goertzel detection on raw samples to receive) —
   no external library. A sustained carrier tone marks transmission
   start (simpler and more robust to implement correctly than trying
   to phase-lock onto alternating data bits), followed immediately by
   a 16-bit length header, the payload bytes and an 8-bit checksum.
   Deliberately "best effort", as documented in every language block
   (soundCaveat): sensitive to ambient noise and speaker/mic quality,
   not a guaranteed transport. */

const FSK_SYNC_FREQ = 1800;
const FSK_FREQ_0 = 1000;
const FSK_FREQ_1 = 1400;
const FSK_BIT_DURATION = 0.03;
const FSK_SYNC_DURATION = 0.3;

function fskGoertzelMagnitude(samples, offset, length, freq, sampleRate) {
  const k = Math.round((length * freq) / sampleRate);
  const omega = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0, s1 = 0, s2 = 0;
  for (let i = 0; i < length; i++) {
    s0 = samples[offset + i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
}
function fskBytesToBits(bytes) {
  const bits = [];
  for (const b of bytes) for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  return bits;
}
function fskBitsToBytes(bits) {
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0;
    for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
    out.push(v);
  }
  return out;
}
function fskBuildFramePayload(bytes) {
  const len = bytes.length;
  const checksum = bytes.reduce((a, b) => (a + b) & 0xFF, 0);
  const header = [(len >> 8) & 0xFF, len & 0xFF];
  return fskBytesToBits([...header, ...bytes, checksum]);
}
/**
 * Emits a framed payload as an FSK-modulated audio tone sequence (sync tone + bit tones).
 * @param {AudioContext} audioCtx - Web Audio context used to generate the tones.
 * @param {Uint8Array} bytes - Payload bytes to transmit.
 * @returns {Promise<void>} Resolves once the oscillator has finished playing.
 */
export function fskPlayTones(audioCtx, bytes) {
  const bits = fskBuildFramePayload(bytes);
  const startTime = audioCtx.currentTime + 0.05;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0.85; // raised from 0.5 (v5.0.2) — real air + phone speaker
  // attenuation is much higher than the synthetic loopback this was first tuned on.
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.setValueAtTime(FSK_SYNC_FREQ, startTime);
  let t = startTime + FSK_SYNC_DURATION;
  for (const bit of bits) {
    osc.frequency.setValueAtTime(bit ? FSK_FREQ_1 : FSK_FREQ_0, t);
    t += FSK_BIT_DURATION;
  }
  osc.start(startTime);
  osc.stop(t + 0.05);
  return new Promise(resolve => { osc.onended = resolve; });
}
function fskFindSyncEnd(samples, sampleRate) {
  const hop = Math.round(0.01 * sampleRate);
  const win = Math.round(0.02 * sampleRate);
  const minArmedHops = Math.round((FSK_SYNC_DURATION * 0.5) / 0.01);
  const weakDebounce = 3;
  let armedRun = 0, armed = false, weakStreak = 0, weakStartIdx = -1;
  // Fix (v5.0.2): the previous fixed threshold (0.2) was calibrated on
  // a full-scale (±1) synthetic signal. Real air + phone-speaker
  // attenuation makes the actual received amplitude unpredictable, so
  // the threshold now adapts to the ambient noise floor instead of
  // assuming a fixed absolute level.
  let noiseFloor = 0.001;
  const NOISE_RATIO = 5;   // sync tone must clear 5x the recent ambient energy
  const ABS_MIN = 0.01;    // guards against false-arming on near-total silence
  for (let pos = 0; pos + win <= samples.length; pos += hop) {
    const mag = fskGoertzelMagnitude(samples, pos, win, FSK_SYNC_FREQ, sampleRate);
    const energy = mag / win;
    const threshold = Math.max(ABS_MIN, noiseFloor * NOISE_RATIO);
    const strong = energy > threshold;
    if (strong) {
      armedRun = Math.min(minArmedHops, armedRun + 1);
      weakStreak = 0; weakStartIdx = -1;
      if (armedRun >= minArmedHops) armed = true;
    } else {
      armedRun = Math.max(0, armedRun - 2);
      noiseFloor = noiseFloor * 0.9 + energy * 0.1;
      if (armed) {
        if (weakStreak === 0) weakStartIdx = pos;
        weakStreak++;
        if (weakStreak >= weakDebounce) return weakStartIdx;
      }
    }
  }
  return -1;
}
/**
 * Decodes an FSK-modulated audio sample buffer back into the original payload bytes.
 * @param {Float32Array} samples - Raw audio samples captured from the microphone.
 * @param {number} sampleRate - Sample rate (Hz) of the captured audio.
 * @returns {Uint8Array|null} The decoded payload bytes, or null if no valid frame was found.
 */
export function fskDecodeFromSamples(samples, sampleRate) {
  const start = fskFindSyncEnd(samples, sampleRate);
  if (start < 0) return null;
  const bitLen = Math.round(FSK_BIT_DURATION * sampleRate);
  function readBit(bitIndex) {
    const pos = start + bitIndex * bitLen;
    if (pos + bitLen > samples.length) return null;
    const m0 = fskGoertzelMagnitude(samples, pos, bitLen, FSK_FREQ_0, sampleRate);
    const m1 = fskGoertzelMagnitude(samples, pos, bitLen, FSK_FREQ_1, sampleRate);
    return m1 > m0 ? 1 : 0;
  }
  const headerBits = [];
  for (let i = 0; i < 16; i++) {
    const b = readBit(i);
    if (b === null) return null;
    headerBits.push(b);
  }
  const headerBytes = fskBitsToBytes(headerBits);
  const len = (headerBytes[0] << 8) | headerBytes[1];
  if (len > 100000) return null;
  const totalBits = 16 + len * 8 + 8;
  const allBits = headerBits.slice();
  for (let i = 16; i < totalBits; i++) {
    const b = readBit(i);
    if (b === null) return null;
    allBits.push(b);
  }
  const allBytes = fskBitsToBytes(allBits);
  const payload = allBytes.slice(2, 2 + len);
  const checksum = allBytes[2 + len];
  const expected = payload.reduce((a, b) => (a + b) & 0xFF, 0);
  if (checksum !== expected) return null;
  return new Uint8Array(payload);
}
