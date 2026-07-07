// src/js/crypto/legacy-cipher.js
//
// Crypto core (no DOM dependency).
//
// ⚠️ NOT secure — demo only. A mono-alphabetic substitution cipher
// trivially derived from the key, kept purely for educational/demo
// purposes in the UI. Never use this for real confidentiality — see
// aes-gcm.js for the app's actually secure encryption mode.

/**
 * Builds a mono-alphabetic substitution map (letters and digits) derived from a key.
 * NOT secure — demo mode only, see module warning above.
 * @param {string} key - Key string the substitution is derived from.
 * @returns {{map: Object<string,string>, numMap: Object<string,string>}} Letter and digit substitution maps.
 */
export function generateSubstitution(key) {
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum += key.charCodeAt(i);
  const letterShift = sum % 26;
  const numberShift = sum % 10;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const map = {}, numMap = {};
  for (let i = 0; i < 26; i++) map[alphabet[i]] = alphabet[(i + letterShift) % 26];
  for (let i = 0; i < 10; i++) numMap[digits[i]] = digits[(i + numberShift) % 10];
  return { map, numMap };
}

/**
 * Applies (or reverses) the substitution cipher to a text string, letter/digit by letter/digit.
 * NOT secure — demo mode only, see module warning above.
 * @param {string} text - Text to transform.
 * @param {{map: Object<string,string>, numMap: Object<string,string>}} keyMap - Substitution maps from generateSubstitution().
 * @param {boolean} [reverse=false] - When true, applies the inverse mapping (decryption).
 * @returns {string} The transformed text.
 */
export function substituteTransform(text, keyMap, reverse = false) {
  const { map, numMap } = keyMap;
  const rMap = reverse ? Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k])) : map;
  const rNum = reverse ? Object.fromEntries(Object.entries(numMap).map(([k, v]) => [v, k])) : numMap;
  let out = '';
  for (const ch of text) {
    if (/[A-Z]/.test(ch)) out += rMap[ch] || ch;
    else if (/[a-z]/.test(ch)) {
      const up = ch.toUpperCase();
      out += (rMap[up] || up).toLowerCase();
    } else if (/[0-9]/.test(ch)) out += rNum[ch] || ch;
    else out += ch;
  }
  return out;
}
