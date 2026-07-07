// tests/crypto.test.js
//
// Unit tests (native node:test, no extra dependency) for the crypto
// core (src/js/crypto/*).
//
// Covers:
//   - AES-GCM round-trip
//   - substitution cipher round-trip (demo)
//
// These modules have no DOM dependency: they import and run as-is
// under Node (Web Crypto is natively available via globalThis.crypto
// since Node 19+).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { concatBuffers, bufToBase64, base64ToBuf } from '../src/js/crypto/buffers.js';
import {
  deriveKey,
  encryptBytes,
  decryptBytes,
  encryptAesGcm,
  decryptAesGcm,
} from '../src/js/crypto/aes-gcm.js';
import { generateSubstitution, substituteTransform } from '../src/js/crypto/legacy-cipher.js';

describe('crypto/buffers.js', () => {
  test('bufToBase64 / base64ToBuf round-trip on arbitrary bytes', () => {
    const original = new Uint8Array([0, 1, 2, 253, 254, 255, 42, 7]);
    const b64 = bufToBase64(original.buffer);
    const back = new Uint8Array(base64ToBuf(b64));
    assert.deepEqual(Array.from(back), Array.from(original));
  });

  test('concatBuffers assembles several buffers in order', () => {
    const a = new Uint8Array([1, 2]).buffer;
    const b = new Uint8Array([3, 4, 5]).buffer;
    const c = new Uint8Array([6]).buffer;
    const out = new Uint8Array(concatBuffers(a, b, c));
    assert.deepEqual(Array.from(out), [1, 2, 3, 4, 5, 6]);
  });

  test('base64ToBuf on an empty string does not break', () => {
    const empty = bufToBase64(new Uint8Array([]).buffer);
    const back = new Uint8Array(base64ToBuf(empty));
    assert.equal(back.length, 0);
  });
});

describe('crypto/aes-gcm.js — AES-256-GCM round-trip', () => {
  test('encryptAesGcm / decryptAesGcm round-trip (plain text)', async () => {
    const plain = 'Secret message 123 — Smart Enigma';
    const password = 'a-test-passphrase';
    const cipher = await encryptAesGcm(plain, password);
    assert.notEqual(cipher, plain);
    const decrypted = await decryptAesGcm(cipher, password);
    assert.equal(decrypted, plain);
  });

  test('encryptAesGcm / decryptAesGcm round-trip (empty text)', async () => {
    const cipher = await encryptAesGcm('', 'password');
    const decrypted = await decryptAesGcm(cipher, 'password');
    assert.equal(decrypted, '');
  });

  test('encryptAesGcm / decryptAesGcm round-trip (unicode / multilingual)', async () => {
    const plain = '日本語テスト — Café Крипто 🔒';
    const cipher = await encryptAesGcm(plain, 'accented-key');
    const decrypted = await decryptAesGcm(cipher, 'accented-key');
    assert.equal(decrypted, plain);
  });

  test('decryptAesGcm fails with the wrong password', async () => {
    const cipher = await encryptAesGcm('sensitive data', 'right-password');
    await assert.rejects(() => decryptAesGcm(cipher, 'wrong-password'));
  });

  test('encryptBytes / decryptBytes round-trip on raw bytes', async () => {
    const plainBytes = new Uint8Array([0, 10, 20, 30, 255, 128, 64]);
    const blob = await encryptBytes(plainBytes, 'password-bytes');
    const decrypted = await decryptBytes(blob, 'password-bytes');
    assert.deepEqual(Array.from(decrypted), Array.from(plainBytes));
  });

  test('two successive encryptions of the same text produce different blobs (random salt/iv)', async () => {
    const c1 = await encryptAesGcm('same text', 'same-password');
    const c2 = await encryptAesGcm('same text', 'same-password');
    assert.notEqual(c1, c2);
  });

  test('deriveKey returns a usable AES-GCM CryptoKey', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey('password', salt);
    assert.equal(key.algorithm.name, 'AES-GCM');
    assert.equal(key.algorithm.length, 256);
  });
});

describe('crypto/legacy-cipher.js — substitution round-trip (demo, not secure)', () => {
  test('substituteTransform(reverse=true) reverses substituteTransform(reverse=false)', () => {
    const keyMap = generateSubstitution('MyTestKey');
    const plain = 'HELLO WORLD 12345';
    const scrambled = substituteTransform(plain, keyMap, false);
    const restored = substituteTransform(scrambled, keyMap, true);
    assert.equal(restored, plain);
  });

  test('preserves case and non-alphanumeric characters', () => {
    const keyMap = generateSubstitution('key');
    const plain = 'Hello, World! - 42%';
    const scrambled = substituteTransform(plain, keyMap, false);
    // Punctuation and spaces unchanged
    assert.equal(scrambled[5], ',');
    assert.equal(scrambled[6], ' ');
    // Original case is preserved letter by letter
    assert.equal(scrambled[0] === scrambled[0].toUpperCase(), true);
  });

  test('two different keys produce different substitutions', () => {
    const mapA = generateSubstitution('keyA');
    const mapB = generateSubstitution('keyB');
    const out = 'ABCDEFG';
    const a = substituteTransform(out, mapA, false);
    const b = substituteTransform(out, mapB, false);
    assert.notEqual(a, b);
  });

  test('round-trip on an empty string', () => {
    const keyMap = generateSubstitution('key');
    assert.equal(substituteTransform('', keyMap, true), '');
  });
});
