// src/js/features/cascade-actions.js
//
// Cascading rotors (Phase D, v6.0.0): sequential multi-key encryption.
// Reuses the untouched byte-level crypto core (encryptBytes/
// decryptBytes) in a loop — no new cryptographic algorithm is
// introduced here, same "zone interdite" respected as everywhere else
// in the app.
//
// Encryption applies each key currently in the list, top to bottom,
// re-wrapping the AES-GCM blob (salt+iv+ciphertext) of the previous
// layer each time. Decryption applies whatever keys currently sit in
// the list, in that same top-to-bottom order — it is NOT reversed
// automatically. The UI (cascadeOrderHint) tells the person this must
// be the exact reverse of the encryption order; they re-order the
// rows themselves before decrypting.

import { t } from '../i18n/index.js';
import { showToast } from '../ui/toast.js';
import { encryptBytes, decryptBytes } from '../crypto/aes-gcm.js';
import { bufToBase64, base64ToBuf } from '../crypto/buffers.js';
import {
  cascadeKeysList, cascadeInputArea, cascadeOutput,
  cascadeEncryptBtn, cascadeDecryptBtn
} from '../dom.js';

const MIN_CASCADE_KEYS = 2;

/**
 * Builds one removable key-input row for the cascade key list.
 * @returns {HTMLDivElement}
 */
function makeCascadeKeyRow() {
  const d = t();
  const row = document.createElement('div');
  row.className = 'cascade-key-row';

  const input = document.createElement('input');
  input.type = 'password';
  input.autocomplete = 'new-password';
  input.className = 'cascade-key-input';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn tiny icon-only';
  removeBtn.setAttribute('aria-label', d.cascadeRemoveKeyAria);
  removeBtn.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#icon-x"></use></svg>';
  removeBtn.addEventListener('click', () => {
    // Never drop below MIN_CASCADE_KEYS rows — clear the field instead
    // of removing the row, so the list always stays usable.
    if (cascadeKeysList.children.length > MIN_CASCADE_KEYS) {
      row.remove();
    } else {
      input.value = '';
    }
  });

  row.appendChild(input);
  row.appendChild(removeBtn);
  return row;
}

/** Appends one new (empty) key row to the cascade key list. */
export function addCascadeKeyRow() {
  cascadeKeysList.appendChild(makeCascadeKeyRow());
}

/** Resets the cascade key list to its initial two empty rows. */
export function initCascadeKeyRows() {
  cascadeKeysList.innerHTML = '';
  addCascadeKeyRow();
  addCascadeKeyRow();
}

/**
 * Re-applies translated aria-labels to already-rendered key rows —
 * called from translateUI() on language change so existing rows don't
 * keep a stale language's aria-label.
 */
export function retranslateCascadeRows() {
  const d = t();
  cascadeKeysList.querySelectorAll('.cascade-key-row button').forEach(btn => {
    btn.setAttribute('aria-label', d.cascadeRemoveKeyAria);
  });
}

function getCascadeKeys() {
  return Array.from(cascadeKeysList.querySelectorAll('.cascade-key-input'))
    .map(el => el.value)
    .filter(v => v.length > 0);
}

function setCascadeOutput(text) {
  cascadeOutput.textContent = text;
  cascadeOutput.classList.remove('placeholder');
}

export async function cascadeEncryptAction() {
  const d = t();
  const text = cascadeInputArea.value || '';
  if (!text) { showToast(d.noInput); return; }
  const keys = getCascadeKeys();
  if (keys.length < MIN_CASCADE_KEYS) { showToast(d.cascadeMinKeys); return; }

  try {
    cascadeEncryptBtn.disabled = true;
    let bytes = new TextEncoder().encode(text);
    for (const key of keys) {
      bytes = await encryptBytes(bytes, key);
    }
    setCascadeOutput(bufToBase64(bytes.buffer));
    showToast(d.cascadeEncryptDone);
  } catch (err) {
    console.error(err);
    showToast(d.genericError);
  } finally {
    cascadeEncryptBtn.disabled = false;
  }
}

export async function cascadeDecryptAction() {
  const d = t();
  const text = cascadeInputArea.value || '';
  if (!text) { showToast(d.noInput); return; }
  const keys = getCascadeKeys();
  if (keys.length < MIN_CASCADE_KEYS) { showToast(d.cascadeMinKeys); return; }

  try {
    cascadeDecryptBtn.disabled = true;
    let bytes = new Uint8Array(base64ToBuf(text));
    for (const key of keys) {
      bytes = await decryptBytes(bytes, key);
    }
    setCascadeOutput(new TextDecoder().decode(bytes));
    showToast(d.cascadeDecryptDone);
  } catch (err) {
    console.error(err);
    setCascadeOutput('');
    showToast(d.cascadeDecryptFail);
  } finally {
    cascadeDecryptBtn.disabled = false;
  }
}
