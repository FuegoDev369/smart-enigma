// src/js/crypto/aes-gcm.js
//
// Crypto core (no DOM dependency).
//
// AES-256-GCM via the Web Crypto API. PBKDF2 with 600,000 SHA-256
// iterations, AES-GCM 256, 16-byte salt, 12-byte IV, blob format is
// salt + iv + ciphertext.

import { concatBuffers, bufToBase64, base64ToBuf } from './buffers.js';

/**
 * Derives an AES-256-GCM CryptoKey from a password via PBKDF2 (SHA-256).
 * @param {string} password - User-supplied passphrase.
 * @param {Uint8Array} salt - Random salt (16 bytes) used for key derivation.
 * @param {number} [iterations=600000] - Number of PBKDF2 iterations.
 * @returns {Promise<CryptoKey>} The derived AES-GCM key.
 */
export async function deriveKey(password, salt, iterations = 600000) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/* Byte-level core. encryptAesGcm/decryptAesGcm below are thin text
   wrappers around this core, which is also used directly by
   byte-oriented features (file encryption, QR, sound transfer). */
/**
 * Encrypts raw bytes with AES-256-GCM, deriving a fresh key from the password each call.
 * @param {Uint8Array} plainBytes - Plaintext bytes to encrypt.
 * @param {string} password - Passphrase used to derive the encryption key.
 * @returns {Promise<Uint8Array>} Blob formatted as salt(16) + iv(12) + ciphertext.
 */
export async function encryptBytes(plainBytes, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  return new Uint8Array(concatBuffers(salt.buffer, iv.buffer, ct));
}

/**
 * Decrypts a salt+iv+ciphertext blob previously produced by encryptBytes().
 * @param {Uint8Array|ArrayBuffer} blobBytes - Blob formatted as salt(16) + iv(12) + ciphertext.
 * @param {string} password - Passphrase used to re-derive the decryption key.
 * @returns {Promise<Uint8Array>} The decrypted plaintext bytes.
 */
export async function decryptBytes(blobBytes, password) {
  const arr = blobBytes instanceof Uint8Array ? blobBytes : new Uint8Array(blobBytes);
  const salt = arr.slice(0, 16).buffer;
  const iv = arr.slice(16, 28).buffer;
  const ct = arr.slice(28).buffer;
  const key = await deriveKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ct);
  return new Uint8Array(plainBuf);
}

/**
 * Encrypts a text string with AES-256-GCM and returns it as a base64 string.
 * @param {string} plain - Plaintext to encrypt.
 * @param {string} password - Passphrase used to derive the encryption key.
 * @returns {Promise<string>} Base64-encoded salt+iv+ciphertext blob.
 */
export async function encryptAesGcm(plain, password) {
  const enc = new TextEncoder();
  const cipherBytes = await encryptBytes(enc.encode(plain), password);
  return bufToBase64(cipherBytes.buffer);
}

/**
 * Decrypts a base64-encoded AES-256-GCM blob back into a text string.
 * @param {string} b64blob - Base64-encoded salt+iv+ciphertext blob.
 * @param {string} password - Passphrase used to re-derive the decryption key.
 * @returns {Promise<string>} The decrypted plaintext string.
 */
export async function decryptAesGcm(b64blob, password) {
  const blob = base64ToBuf(b64blob);
  const plainBytes = await decryptBytes(blob, password);
  return new TextDecoder().decode(plainBytes);
}
