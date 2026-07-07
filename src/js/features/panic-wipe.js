// src/js/features/panic-wipe.js
//
// Emergency wipe (panic wipe). Same fields cleared, same deliberate
// absence of a toast/confirmation (discretion), same best-effort
// clipboard clearing.
//
// The trigger (triple Escape press within 1.2s, listened to at the
// document level) is wired up in main.js, alongside this function.

import { t } from '../i18n/index.js';
import { stopSoundListening } from '../sound/sound-transfer.js';
import { hideFingerprint } from './fingerprint.js';
import { refreshKeyStrength } from './key-strength.js';
import { setSelectedFile } from './file-actions.js';
import { state } from '../state.js';
import {
  keyInput, inputArea, output, toggleSecretIcon, toggleSecret,
  toast, fileInput, qrDisplay, compressionSavingsText
} from '../dom.js';

/* -------- Panic wipe (v3.0.0) --------
   Triggered by pressing Escape three times in a row (see below).
   Deliberately has no confirmation dialog or toast: the instant
   clearing of the fields IS the visual feedback, to stay discreet
   if someone is watching over your shoulder. Discoverability of the
   shortcut is handled by panicWipeHintText (text provided by
   SMART-ENIGMA-i18n). Known limitation: cannot clear browser
   history or the clipboard of other apps already open elsewhere —
   the browser clipboard is cleared on a best-effort basis only. */
export async function panicWipe() {
  keyInput.value = '';
  inputArea.value = '';
  state.hasResult = false;
  output.textContent = t().outputPlaceholder;
  output.classList.add('placeholder');

  if (keyInput.type === 'text') {
    keyInput.type = 'password';
    toggleSecretIcon.setAttribute('href', '#icon-eye');
    toggleSecret.setAttribute('aria-label', t().toggleShowKey);
  }

  hideFingerprint();
  refreshKeyStrength();
  toast.hidden = true;

  // A selected/encrypted file is sensitive too — wipe it.
  fileInput.value = '';
  setSelectedFile(null);

  // The QR code and any in-progress sound listening are
  // transient representations of the same sensitive output — clear them too.
  stopSoundListening();
  qrDisplay.hidden = true;
  if (state.qrDownloadBlobUrl) { URL.revokeObjectURL(state.qrDownloadBlobUrl); state.qrDownloadBlobUrl = null; }
  compressionSavingsText.hidden = true;
  state.lastCompressionSavings = null;

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText('');
    }
  } catch (e) { /* best-effort only, silently ignored */ }

  keyInput.blur();
  inputArea.blur();
}
