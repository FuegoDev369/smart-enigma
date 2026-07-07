// src/js/features/text-actions.js
//
// Core text encrypt/decrypt actions plus clearAll. Same empty-field
// checks, same AES-256/substitution toggle via `useStrong`, same
// compression toggle via `compressToggle`, same QR/sound/compression
// cleanup in clearAll. Dependencies:
//   - `t()`                                              → src/js/i18n/index.js
//   - `showToast`                                        → src/js/ui/toast.js
//   - `generateSubstitution`, `substituteTransform`      → src/js/crypto/legacy-cipher.js
//   - `encryptBytes`, `decryptBytes`,
//     `encryptAesGcm`, `decryptAesGcm`                   → src/js/crypto/aes-gcm.js
//   - `bufToBase64`, `base64ToBuf`                       → src/js/crypto/buffers.js
//   - `compressPayloadBytes`, `decompressPayloadBytes`   → src/js/compression/lzss.js
//   - `stopSoundListening`                               → src/js/sound/sound-transfer.js
//   - all DOM references used                            → src/js/dom.js

import { t } from '../i18n/index.js';
import { showToast } from '../ui/toast.js';
import { generateSubstitution, substituteTransform } from '../crypto/legacy-cipher.js';
import { encryptBytes, decryptBytes, encryptAesGcm, decryptAesGcm } from '../crypto/aes-gcm.js';
import { bufToBase64, base64ToBuf } from '../crypto/buffers.js';
import { compressPayloadBytes, decompressPayloadBytes } from '../compression/lzss.js';
import { stopSoundListening } from '../sound/sound-transfer.js';
import { state } from '../state.js';
import {
  output, keyInput, inputArea, useStrong, compressToggle,
  encryptBtn, decryptBtn, compressionSavingsText, qrDisplay
} from '../dom.js';

export function setOutput(text) {
  state.hasResult = true;
  output.classList.remove('placeholder');
  output.textContent = text;
}

/* -------- Core actions -------- */
export async function encryptAction() {
  const d = t();
  try {
    const key = keyInput.value || '';
    if (!key) { showToast(d.noKey); return; }
    const text = inputArea.value || '';
    if (!text) { showToast(d.noInput); return; }

    if (useStrong.checked && window.crypto && crypto.subtle) {
      encryptBtn.disabled = true;
      setOutput(d.encrypting);
      if (compressToggle.checked) {
        // Compress the plaintext bytes before they reach the untouched
        // encryptBytes() core — same pattern as the file-payload wrapper
        // (file-payload.js), just a different plaintext byte layout.
        const plainBytes = new TextEncoder().encode(text);
        const { bytes: payload, savings } = compressPayloadBytes(plainBytes);
        const cipherBytes = await encryptBytes(payload, key);
        setOutput(bufToBase64(cipherBytes));
        state.lastCompressionSavings = savings;
        compressionSavingsText.textContent = d.compressionSavings.replace('{percent}', savings);
        compressionSavingsText.hidden = false;
      } else {
        const cipher = await encryptAesGcm(text, key);
        setOutput(cipher);
      }
      showToast(d.encryptedAes);
    } else {
      const keyMap = generateSubstitution(key);
      setOutput(substituteTransform(text, keyMap, false));
      showToast(d.encryptedSub);
    }
  } catch (err) {
    console.error(err);
    showToast(d.genericError);
  } finally {
    encryptBtn.disabled = false;
  }
}

export async function decryptAction() {
  const d = t();
  try {
    const key = keyInput.value || '';
    if (!key) { showToast(d.noKey); return; }
    const text = inputArea.value || '';
    if (!text) { showToast(d.noInput); return; }

    if (useStrong.checked && window.crypto && crypto.subtle) {
      decryptBtn.disabled = true;
      setOutput(d.decrypting);
      try {
        if (compressToggle.checked) {
          const blob = base64ToBuf(text);
          const plainBytesWithFlag = await decryptBytes(blob, key);
          const plainBytes = decompressPayloadBytes(plainBytesWithFlag);
          setOutput(new TextDecoder().decode(plainBytes));
        } else {
          const plain = await decryptAesGcm(text, key);
          setOutput(plain);
        }
        showToast(d.decryptedAes);
      } catch (e) {
        setOutput('');
        state.hasResult = false;
        showToast(d.decryptFail);
      }
    } else {
      const keyMap = generateSubstitution(key);
      setOutput(substituteTransform(text, keyMap, true));
      showToast(d.decryptedSub);
    }
  } catch (err) {
    console.error(err);
    showToast(d.genericError);
  } finally {
    decryptBtn.disabled = false;
  }
}

/* -------- Utilities -------- */
export function clearAll() {
  const d = t();
  if (!confirm(d.clearConfirm)) return;
  inputArea.value = '';
  state.hasResult = false;
  output.textContent = d.outputPlaceholder;
  output.classList.add('placeholder');

  // Fix (v5.0.1): the "Clear" button left the QR code and any sound
  // state untouched — same cleanup as panic wipe, minus the key/file
  // fields which clearAll never touched even before offline transfer
  // existed.
  stopSoundListening();
  qrDisplay.hidden = true;
  if (state.qrDownloadBlobUrl) { URL.revokeObjectURL(state.qrDownloadBlobUrl); state.qrDownloadBlobUrl = null; }
  compressionSavingsText.hidden = true;
  state.lastCompressionSavings = null;
}
