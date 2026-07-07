// tests/key-strength.test.js
//
// Unit test for src/js/features/key-strength.js. Covers edge cases of
// estimateKeyStrength.
//
// `isSequential` and `estimateKeyStrength` are themselves pure (no
// DOM, no app state), and are the only two functions this test
// targets (refreshKeyStrength and updateWeakWarning read/write the
// DOM and aren't unit-testable under Node without a real
// browser/jsdom).
//
// Note: key-strength.js imports dom.js at the top of the file, and
// dom.js runs `document.querySelector(...)` / `document.documentElement`
// at module scope, right at import time — so even importing just the
// 2 pure functions fails under plain Node (`document is not defined`).
// To test this without adding a dependency (no jsdom, keeping with
// native node:test / zero extra dependency), this file sets up a
// minimal local `document` stub before loading the module. Since
// static ES imports are hoisted to the top of the file (and thus run
// before any other code, even code written above them in the file),
// the stub has to be set up first and the module then loaded via a
// dynamic `import()` — the only reliable way to guarantee execution
// order here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {
  querySelector: () => null,
  documentElement: {},
};

const { isSequential, estimateKeyStrength } = await import('../src/js/features/key-strength.js');

describe('features/key-strength.js — isSequential', () => {
  test('detects an ascending sequence', () => {
    assert.equal(isSequential('abcd'), true);
  });

  test('detects a descending sequence', () => {
    assert.equal(isSequential('dcba'), true);
  });

  test('rejects a non-sequential string', () => {
    assert.equal(isSequential('abda'), false);
  });

  test('returns false for a string shorter than 4 characters', () => {
    assert.equal(isSequential('abc'), false);
    assert.equal(isSequential(''), false);
  });
});

describe('features/key-strength.js — estimateKeyStrength (edge cases)', () => {
  test('empty / falsy key -> weak, score 0', () => {
    assert.deepEqual(estimateKeyStrength(''), { level: 'weak', score: 0 });
  });

  test('known weak key (COMMON_WEAK_KEYS list) -> weak regardless of case', () => {
    assert.equal(estimateKeyStrength('password').level, 'weak');
    assert.equal(estimateKeyStrength('PASSWORD').level, 'weak');
    assert.equal(estimateKeyStrength('123456').level, 'weak');
  });

  test('repeated character (e.g. "aaaaaaaa") -> weak, score 5', () => {
    assert.deepEqual(estimateKeyStrength('aaaaaaaa'), { level: 'weak', score: 5 });
  });

  test('sequential characters (e.g. "abcdefgh") -> weak, score 10', () => {
    assert.deepEqual(estimateKeyStrength('abcdefgh'), { level: 'weak', score: 10 });
  });

  test('short key (< 8 characters) capped at 35 even with maximum diversity', () => {
    const { score, level } = estimateKeyStrength('Ab1!');
    assert.ok(score <= 35);
    assert.equal(level, 'weak');
  });

  test('long and diverse key -> strong (score >= 70)', () => {
    const { level, score } = estimateKeyStrength('C0rrect-Horse-Battery-Staple!42');
    assert.equal(level, 'strong');
    assert.ok(score >= 70);
  });

  test('medium length/diversity key -> medium (40 <= score < 70)', () => {
    const { level, score } = estimateKeyStrength('mnbvcxzl');
    assert.equal(level, 'medium');
    assert.ok(score >= 40 && score < 70);
  });

  test('score always capped at 100 (extreme length + maximum diversity)', () => {
    const { score } = estimateKeyStrength('Aa1!'.repeat(20));
    assert.ok(score <= 100);
  });

  test('character diversity affects the score (more classes -> higher score, at equal length)', () => {
    const lettersOnly = estimateKeyStrength('abcdefgh');
    const mixedClasses = estimateKeyStrength('abcdEF12');
    // 'abcdefgh' is also detected as sequential (weak forced, score 10);
    // so we compare against a string of the same length that isn't sequential.
    const lettersOnlyNonSeq = estimateKeyStrength('abcdzxqh');
    assert.ok(mixedClasses.score >= lettersOnlyNonSeq.score);
  });
});
