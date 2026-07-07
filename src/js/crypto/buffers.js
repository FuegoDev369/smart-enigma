// src/js/crypto/buffers.js
//
// Crypto core (no DOM dependency).
//
// Low-level binary buffer helpers used by aes-gcm.js and other
// byte-oriented modules (files, QR, sound).

/**
 * Concatenates several binary buffers (ArrayBuffer or typed array) into one.
 * @param {...(ArrayBuffer|ArrayBufferView)} buffers - Buffers to concatenate, in order.
 * @returns {ArrayBuffer} A single buffer containing all input bytes back-to-back.
 */
export function concatBuffers(...buffers) {
  const total = buffers.reduce((s, b) => s + (b.byteLength || b.length), 0);
  const tmp = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    const u = new Uint8Array(b);
    tmp.set(u, offset);
    offset += u.length;
  }
  return tmp.buffer;
}

/**
 * Encodes a binary buffer to a base64 string, chunked to avoid call-stack overflow on large inputs.
 * @param {ArrayBuffer|ArrayBufferView} buf - Buffer to encode.
 * @returns {string} Base64-encoded representation of the buffer.
 */
export function bufToBase64(buf) {
  // Chunked conversion: spreading a large Uint8Array into
  // String.fromCharCode(...) can overflow the call stack on long
  // messages. Processing in fixed-size chunks avoids that limit.
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Decodes a base64 string back into a binary buffer.
 * @param {string} b64 - Base64-encoded string to decode.
 * @returns {ArrayBuffer} The decoded bytes.
 */
export function base64ToBuf(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr.buffer;
}
