// src/js/features/fingerprint.js
//
// Key fingerprint / safety number. Same SHA-256 hash truncated to
// 10 bytes, same hexadecimal formatting in blocks of 4.

import { t } from '../i18n/index.js';
import { fingerprintValue, fingerprintToggle, fingerprintToggleText, fingerprintToggleIcon } from '../dom.js';
import { state } from '../state.js';

/* -------- Key fingerprint / safety number (v3.0.0) --------
   Local SHA-256 hash of the key, truncated and formatted into
   hexadecimal blocks — used only to verbally confirm that two
   people are using the same key, WITHOUT ever revealing or
   transmitting it. Computed on demand only (never shown by
   default), and automatically hidden if the key changes meanwhile. */
export async function computeKeyFingerprint(key) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(key));
  const bytes = new Uint8Array(digest).slice(0, 10);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('');
  return hex.match(/.{1,4}/g).join(' ');
}

export function hideFingerprint() {
  state.fingerprintVisible = false;
  fingerprintValue.hidden = true;
  fingerprintValue.textContent = '';
  const d = t();
  fingerprintToggle.setAttribute('aria-label', d.fingerprintShow);
  fingerprintToggleText.textContent = d.fingerprintShow;
  fingerprintToggleIcon.setAttribute('href', '#icon-eye');
}
