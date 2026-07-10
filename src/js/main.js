// src/js/main.js
//
// Application entry point.
//
// Imports every feature module and wires up:
//   - all DOM event listeners;
//   - the `DOMContentLoaded` initialization block,
// in a single, readable place.
//
// Shared state (`hasResult`, `fingerprintVisible`, `fileResultBlobUrl`,
// `qrDownloadBlobUrl`, ...) is accessed through `state.*`
// (src/js/state.js).

import { state } from './state.js';
import {
  langSelect, keyInput, copyKeyBtn, clearKeyBtn,
  useStrong, encryptBtn, decryptBtn, clearBtn, output,
  copyOutput, backToTop, toggleSecret, toggleSecretIcon,
  fingerprintToggle, fingerprintValue, fingerprintToggleText,
  fingerprintToggleIcon, dropzone, fileInput, fileDropLabelText,
  fileClearBtn, fileEncryptBtn, fileDecryptBtn,
  qrGenerateBtn, soundEmitBtn, soundListenBtn,
  shamirSplitBtn, shamirCombineBtn,
  cascadeAddKeyBtn, cascadeEncryptBtn, cascadeDecryptBtn
} from './dom.js';

import { t, detectLang, translateUI } from './i18n/index.js';
import { showToast } from './ui/toast.js';
import { copyToClipboard } from './ui/clipboard.js';
import { initTheme, wireThemeToggle } from './ui/theme.js';
import { updateWeakWarning, refreshKeyStrength } from './features/key-strength.js';
import { computeKeyFingerprint, hideFingerprint } from './features/fingerprint.js';
import { encryptAction, decryptAction, clearAll } from './features/text-actions.js';
import { handleFileSelected, setSelectedFile, fileEncryptAction, fileDecryptAction } from './features/file-actions.js';
import { qrGenerateAction, wireCompressToggle } from './features/airgap-actions.js';
import { panicWipe } from './features/panic-wipe.js';
import { shamirSplitAction, shamirCombineAction } from './features/shamir-actions.js';
import {
  initCascadeKeyRows, addCascadeKeyRow, cascadeEncryptAction, cascadeDecryptAction
} from './features/cascade-actions.js';

// sound/sound-transfer.js (and, transitively, sound/fsk-codec.js) is
// loaded lazily via dynamic import() on the first click of either sound
// button, instead of being bundled into the initial page load — most
// users never touch the sound-transfer feature. `loadSoundModule()`
// caches the module promise so a repeated click doesn't re-trigger
// resolution, and so `beforeunload` can reach `stopSoundListening` if
// the module was already loaded (see below).
let soundModulePromise = null;
function loadSoundModule() {
  if (!soundModulePromise) soundModulePromise = import('./sound/sound-transfer.js');
  return soundModulePromise;
}

/* -------- Event wiring -------- */
// translateUI() is async (see src/js/i18n/index.js) — not awaited here,
// the UI updates as soon as the matching locale dictionary is loaded,
// without blocking this listener.
langSelect.addEventListener('change', (e) => translateUI(e.target.value));
wireThemeToggle();
useStrong.addEventListener('change', updateWeakWarning);

encryptBtn.addEventListener('click', () => encryptAction());
decryptBtn.addEventListener('click', () => decryptAction());
clearBtn.addEventListener('click', () => clearAll());

copyKeyBtn.addEventListener('click', () => copyToClipboard(keyInput.value));
copyOutput.addEventListener('click', () => copyToClipboard(state.hasResult ? output.textContent : ''));

backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
clearKeyBtn.addEventListener('click', () => { keyInput.value = ''; showToast(t().keyCleared); });

keyInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) encryptAction();
});

keyInput.addEventListener('input', () => {
  refreshKeyStrength();
  if (state.fingerprintVisible) hideFingerprint();
});

fingerprintToggle.addEventListener('click', async () => {
  const d = t();
  if (state.fingerprintVisible) {
    hideFingerprint();
    return;
  }
  if (!keyInput.value) { showToast(d.noKey); return; }
  try {
    const fp = await computeKeyFingerprint(keyInput.value);
    fingerprintValue.textContent = fp;
    fingerprintValue.hidden = false;
    state.fingerprintVisible = true;
    fingerprintToggle.setAttribute('aria-label', d.fingerprintHide);
    fingerprintToggleText.textContent = d.fingerprintHide;
    fingerprintToggleIcon.setAttribute('href', '#icon-eye-off');
  } catch (err) {
    console.error(err);
    showToast(d.genericError);
  }
});

// File dropzone (click, keyboard, and drag & drop)
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dropzone--active');
  fileDropLabelText.textContent = t().fileDropActive;
});
dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dropzone--active');
  fileDropLabelText.textContent = t().fileDropLabel;
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dropzone--active');
  fileDropLabelText.textContent = t().fileDropLabel;
  const f = e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFileSelected(f);
});
fileInput.addEventListener('change', () => {
  const f = fileInput.files && fileInput.files[0];
  if (f) handleFileSelected(f);
});
fileClearBtn.addEventListener('click', () => {
  fileInput.value = '';
  setSelectedFile(null);
});
fileEncryptBtn.addEventListener('click', () => fileEncryptAction());
fileDecryptBtn.addEventListener('click', () => fileDecryptAction());

// Offline transfer controls
wireCompressToggle();
qrGenerateBtn.addEventListener('click', () => qrGenerateAction());
// Lazy-loaded sound-transfer.js — see note above.
soundEmitBtn.addEventListener('click', async () => {
  const { soundEmitAction } = await loadSoundModule();
  soundEmitAction();
});
soundListenBtn.addEventListener('click', async () => {
  const { soundListenAction } = await loadSoundModule();
  soundListenAction();
});

// Multi-party controls (Phase D, v6.0.0)
shamirSplitBtn.addEventListener('click', () => shamirSplitAction());
shamirCombineBtn.addEventListener('click', () => shamirCombineAction());
cascadeAddKeyBtn.addEventListener('click', () => addCascadeKeyRow());
cascadeEncryptBtn.addEventListener('click', () => cascadeEncryptAction());
cascadeDecryptBtn.addEventListener('click', () => cascadeDecryptAction());

toggleSecret.addEventListener('click', () => {
  const showing = keyInput.type === 'text';
  keyInput.type = showing ? 'password' : 'text';
  toggleSecretIcon.setAttribute('href', showing ? '#icon-eye' : '#icon-eye-off');
  toggleSecret.setAttribute('aria-label', showing ? t().toggleShowKey : t().toggleHideKey);
});

// Panic wipe: triple press of Escape within 1.2s.
// Listens at the document level so it stays active regardless of focus.
let panicEscapePresses = [];
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const now = Date.now();
  panicEscapePresses = panicEscapePresses.filter(ts => now - ts < 1200);
  panicEscapePresses.push(now);
  if (panicEscapePresses.length >= 3) {
    panicEscapePresses = [];
    panicWipe();
  }
});

window.addEventListener('beforeunload', () => {
  try { keyInput.value = ''; } catch (e) {}
  try { if (state.fileResultBlobUrl) URL.revokeObjectURL(state.fileResultBlobUrl); } catch (e) {}
  try { if (state.qrDownloadBlobUrl) URL.revokeObjectURL(state.qrDownloadBlobUrl); } catch (e) {}
  // `stopSoundListening` lives in the lazily-loaded sound-transfer.js
  // module (see loadSoundModule() above). If it was never loaded (the
  // user never clicked a sound button), there's no listening session to
  // stop, so only call `soundModulePromise.then(...)` when it exists —
  // this avoids an unnecessary import() during page unload. If the
  // module is already loaded, its promise is already resolved and the
  // `.then()` runs on the next microtask tick, before the page actually
  // unloads in nearly all cases.
  try {
    if (soundModulePromise) {
      soundModulePromise.then(({ stopSoundListening }) => stopSoundListening());
    }
  } catch (e) {}
});

document.addEventListener('DOMContentLoaded', () => {
  const initialLang = detectLang();
  langSelect.value = initialLang;
  initCascadeKeyRows();
  // translateUI() is async (it lazily loads the detected language's
  // dictionary if it isn't 'en' — see src/js/i18n/index.js). Not
  // awaited here: the rest of initialization (updateWeakWarning,
  // initTheme) doesn't depend on the translation result and can run
  // immediately.
  translateUI(initialLang);
  updateWeakWarning();

  initTheme();
});
