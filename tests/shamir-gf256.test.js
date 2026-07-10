// tests/shamir-gf256.test.js
//
// Unit tests (native node:test, no extra dependency) for
// src/js/shamir/shamir-gf256.js (Phase D, v6.0.0).
//
// Covers:
//   - low-level split/combine round-trip on raw bytes (various M-of-N)
//   - share string encode/decode round-trip
//   - full split/combine round-trip with embedded fingerprint
//   - below-threshold detection (`.needed`)
//   - checksum mismatch on wrong/mismatched shares
//   - malformed share strings

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitSecretBytes,
  combineSharesBytes,
  shareToString,
  stringToShare,
  splitSecretToShareStrings,
  combineShareStringsToSecret,
} from '../src/js/shamir/shamir-gf256.js';

describe('shamir-gf256.js — low-level split/combine on raw bytes', () => {
  test('3-of-5: any 3 of 5 shares reconstruct the secret', () => {
    const secret = new Uint8Array([0, 1, 2, 253, 254, 255, 42, 7, 100]);
    const shares = splitSecretBytes(secret, 3, 5);
    assert.equal(shares.length, 5);

    const subsets = [
      [0, 1, 2],
      [0, 2, 4],
      [1, 3, 4],
      [2, 3, 4],
    ];
    for (const idxs of subsets) {
      const chosen = idxs.map(i => shares[i]);
      const recovered = combineSharesBytes(chosen);
      assert.deepEqual(Array.from(recovered), Array.from(secret));
    }
  });

  test('2-of-2 (minimum threshold): both shares required and sufficient', () => {
    const secret = new TextEncoder().encode('correct-horse-battery-staple');
    const shares = splitSecretBytes(secret, 2, 2);
    const recovered = combineSharesBytes(shares);
    assert.deepEqual(Array.from(recovered), Array.from(secret));
  });

  test('threshold-1 shares alone do NOT reliably reconstruct the secret', () => {
    const secret = new Uint8Array([9, 9, 9, 9]);
    const shares = splitSecretBytes(secret, 4, 6);
    // Any 3 of the 4-of-6 shares is below threshold: combining still
    // "succeeds" mathematically (interpolation always returns
    // something) but must not equal the original secret in general.
    const below = combineSharesBytes([shares[0], shares[1], shares[2]]);
    assert.notDeepEqual(Array.from(below), Array.from(secret));
  });

  test('empty secret bytes round-trip', () => {
    const secret = new Uint8Array([]);
    const shares = splitSecretBytes(secret, 2, 3);
    const recovered = combineSharesBytes([shares[0], shares[2]]);
    assert.equal(recovered.length, 0);
  });

  test('rejects threshold < 2', () => {
    assert.throws(() => splitSecretBytes(new Uint8Array([1]), 1, 3));
  });

  test('rejects totalShares < threshold', () => {
    assert.throws(() => splitSecretBytes(new Uint8Array([1]), 3, 2));
  });

  test('rejects totalShares > 255', () => {
    assert.throws(() => splitSecretBytes(new Uint8Array([1]), 2, 256));
  });

  test('combineSharesBytes rejects fewer than 2 shares', () => {
    const shares = splitSecretBytes(new Uint8Array([1, 2, 3]), 2, 3);
    assert.throws(() => combineSharesBytes([shares[0]]));
  });

  test('duplicate share index: last one wins, does not crash', () => {
    const secret = new Uint8Array([5, 6, 7]);
    const shares = splitSecretBytes(secret, 2, 3);
    const withDup = [shares[0], shares[0], shares[1]];
    const recovered = combineSharesBytes(withDup);
    assert.deepEqual(Array.from(recovered), Array.from(secret));
  });
});

describe('shamir-gf256.js — share string encode/decode', () => {
  test('shareToString / stringToShare round-trip', () => {
    const share = { threshold: 3, index: 7, bytes: new Uint8Array([0, 255, 16, 1]) };
    const str = shareToString(share);
    const back = stringToShare(str);
    assert.equal(back.threshold, 3);
    assert.equal(back.index, 7);
    assert.deepEqual(Array.from(back.bytes), [0, 255, 16, 1]);
  });

  test('stringToShare is case-insensitive and trims whitespace', () => {
    const share = { threshold: 2, index: 1, bytes: new Uint8Array([171, 205]) };
    const str = shareToString(share);
    const back = stringToShare('  ' + str.toUpperCase() + '  ');
    assert.equal(back.threshold, 2);
    assert.equal(back.index, 1);
    assert.deepEqual(Array.from(back.bytes), [171, 205]);
  });

  test('stringToShare rejects malformed input (bad charset)', () => {
    assert.throws(() => stringToShare('02-01-zznotvalidhex'));
  });

  test('stringToShare rejects odd-length hex', () => {
    assert.throws(() => stringToShare('0201abc'));
  });

  test('stringToShare rejects too-short input', () => {
    assert.throws(() => stringToShare('0201'));
  });

  test('stringToShare rejects out-of-range threshold/index', () => {
    // threshold byte 0x01 (=1, below minimum of 2)
    assert.throws(() => stringToShare('0101aabb'));
    // index byte 0x00 (invalid, indices start at 1)
    assert.throws(() => stringToShare('0200aabb'));
  });
});

describe('shamir-gf256.js — full split/combine with embedded fingerprint', () => {
  test('round-trip: split a passphrase, combine threshold shares back to the same string', async () => {
    const secret = 'correct-horse-battery-staple';
    const shareStrings = await splitSecretToShareStrings(secret, 3, 5);
    assert.equal(shareStrings.length, 5);

    const recovered = await combineShareStringsToSecret([shareStrings[0], shareStrings[2], shareStrings[4]]);
    assert.equal(recovered, secret);
  });

  test('round-trip preserves unicode/multilingual secrets', async () => {
    const secret = '日本語テスト — Café Крипто 🔒';
    const shareStrings = await splitSecretToShareStrings(secret, 2, 4);
    const recovered = await combineShareStringsToSecret([shareStrings[1], shareStrings[3]]);
    assert.equal(recovered, secret);
  });

  test('below-threshold combine throws with a numeric `.needed` matching the threshold', async () => {
    const shareStrings = await splitSecretToShareStrings('some-secret-key', 4, 6);
    await assert.rejects(
      () => combineShareStringsToSecret([shareStrings[0], shareStrings[1]]),
      (err) => {
        assert.equal(err.needed, 4);
        return true;
      }
    );
  });

  test('mismatched shares (different splits) fail the checksum check', async () => {
    const sharesA = await splitSecretToShareStrings('secret-A', 2, 3);
    const sharesB = await splitSecretToShareStrings('secret-B-different-length!!', 2, 3);
    // Same declared threshold (2) so the "not enough shares" pre-check
    // passes, but mixing shares from two different splits must fail
    // the fingerprint checksum rather than silently returning garbage.
    await assert.rejects(() => combineShareStringsToSecret([sharesA[0], sharesB[1]]));
  });

  test('combining shares from two different thresholds is rejected', async () => {
    const sharesA = await splitSecretToShareStrings('secret-A', 2, 3);
    const sharesB = await splitSecretToShareStrings('secret-A', 3, 4);
    await assert.rejects(() => combineShareStringsToSecret([sharesA[0], sharesB[1]]));
  });

  test('garbage share strings are rejected cleanly', async () => {
    await assert.rejects(() => combineShareStringsToSecret(['not-a-real-share', 'also-garbage']));
  });
});
