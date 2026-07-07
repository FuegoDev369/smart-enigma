// src/js/features/file-actions.js
//
// File encryption/decryption orchestration. Same MAX_FILE_SIZE
// (25 MB), same full in-memory read (File.arrayBuffer()), same
// wrapping via encodeFilePayload/decodeFilePayload around the
// untouched crypto core.

import { t } from '../i18n/index.js';
import { showToast } from '../ui/toast.js';
import { encryptBytes, decryptBytes } from '../crypto/aes-gcm.js';
import { encodeFilePayload, decodeFilePayload } from './file-payload.js';
import { state } from '../state.js';
import {
  keyInput, fileInput, fileSelectedRow, fileSelectedName,
  fileEncryptBtn, fileDecryptBtn, fileResultRow, fileDownloadLink
} from '../dom.js';

/* -------- File encryption (v4.0.0) --------
   Files are read fully into memory (File.arrayBuffer()), wrapped
   with encodeFilePayload(), then passed to the existing byte-level
   encryptBytes()/decryptBytes() core untouched. Kept in memory only
   (no streaming), hence MAX_FILE_SIZE below. */
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — reasonable in-memory limit

export function clearFileResult() {
  if (state.fileResultBlobUrl) {
    URL.revokeObjectURL(state.fileResultBlobUrl);
    state.fileResultBlobUrl = null;
  }
  fileResultRow.hidden = true;
  fileDownloadLink.removeAttribute('href');
  fileDownloadLink.removeAttribute('download');
}

export function setSelectedFile(file) {
  state.selectedFile = file;
  const d = t();
  if (file) {
    fileSelectedRow.hidden = false;
    fileSelectedName.textContent = file.name;
    fileSelectedName.title = file.name;
    fileSelectedRow.setAttribute('aria-label', d.fileSelectedAria.replace('{filename}', file.name));
  } else {
    fileSelectedRow.hidden = true;
    fileSelectedName.textContent = '';
    fileSelectedName.removeAttribute('title');
    fileSelectedRow.removeAttribute('aria-label');
  }
  clearFileResult();
}

export function handleFileSelected(file) {
  const d = t();
  if (!file) return;
  if (file.size > MAX_FILE_SIZE) {
    showToast(d.fileTooLarge);
    fileInput.value = '';
    return;
  }
  setSelectedFile(file);
}

export function presentFileResult(blob, filename) {
  if (state.fileResultBlobUrl) URL.revokeObjectURL(state.fileResultBlobUrl);
  state.fileResultBlobUrl = URL.createObjectURL(blob);
  fileDownloadLink.href = state.fileResultBlobUrl;
  fileDownloadLink.download = filename;
  fileResultRow.hidden = false;
}

export async function fileEncryptAction() {
  const d = t();
  const key = keyInput.value || '';
  if (!key) { showToast(d.noKey); return; }
  if (!state.selectedFile) { showToast(d.fileNoFile); return; }
  try {
    fileEncryptBtn.disabled = true;
    showToast(d.fileEncrypting);
    const buf = await state.selectedFile.arrayBuffer();
    const payload = encodeFilePayload(state.selectedFile, new Uint8Array(buf));
    const cipherBytes = await encryptBytes(payload, key);
    const blob = new Blob([cipherBytes], { type: 'application/octet-stream' });
    presentFileResult(blob, state.selectedFile.name + '.enigma');
    showToast(d.fileEncryptDone);
  } catch (err) {
    console.error(err);
    showToast(d.genericError);
  } finally {
    fileEncryptBtn.disabled = false;
  }
}

export async function fileDecryptAction() {
  const d = t();
  const key = keyInput.value || '';
  if (!key) { showToast(d.noKey); return; }
  if (!state.selectedFile) { showToast(d.fileNoFile); return; }
  try {
    fileDecryptBtn.disabled = true;
    showToast(d.fileDecrypting);
    const buf = await state.selectedFile.arrayBuffer();
    const plainBytes = await decryptBytes(new Uint8Array(buf), key);
    const { name, content } = decodeFilePayload(plainBytes);
    const blob = new Blob([content], { type: 'application/octet-stream' });
    presentFileResult(blob, name);
    showToast(d.fileDecryptDone);
  } catch (err) {
    console.error(err);
    clearFileResult();
    showToast(d.fileDecryptFail);
  } finally {
    fileDecryptBtn.disabled = false;
  }
}
