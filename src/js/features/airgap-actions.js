// src/js/features/airgap-actions.js
//
// QR code generation and the compression toggle wiring. The sound
// emit/listen actions live separately in
// src/js/sound/sound-transfer.js.
//
// `encode` (qr-encoder.js) and `drawQrToCanvas` (qr-canvas.js) are
// lazy-loaded via dynamic import() inside `qrGenerateAction`, on first
// call, so the QR engine isn't bundled into the initial page load for
// users who never generate a QR code. esbuild emits these two modules
// as a separate chunk, fetched by the browser on demand.

import { t } from '../i18n/index.js';
import { showToast } from '../ui/toast.js';
import { state } from '../state.js';
import {
  output, qrCanvas, qrDisplay, qrDownloadLink,
  compressToggle, compressionSavingsText
} from '../dom.js';

/* -------- QR code actions — operates on whatever is currently
   shown in #output, not on the crypto core. -------- */
export async function qrGenerateAction() {
  const d = t();
  const text = state.hasResult ? output.textContent : '';
  if (!text) { showToast(d.noInput); return; }
  // Lazy-loaded QR engine (encode) and canvas renderer (drawQrToCanvas)
  // — see note at the top of this file.
  const [{ encode }, { drawQrToCanvas }] = await Promise.all([
    import('../qr/qr-encoder.js'),
    import('../qr/qr-canvas.js')
  ]);
  const bytes = Array.from(new TextEncoder().encode(text));
  const result = encode(bytes);
  if (!result) { showToast(d.qrTooLong); return; }
  drawQrToCanvas(qrCanvas, result);
  qrCanvas.setAttribute('aria-label', d.qrScanHint);
  qrDisplay.hidden = false;
  qrCanvas.toBlob((blob) => {
    if (!blob) return;
    if (state.qrDownloadBlobUrl) URL.revokeObjectURL(state.qrDownloadBlobUrl);
    state.qrDownloadBlobUrl = URL.createObjectURL(blob);
    qrDownloadLink.href = state.qrDownloadBlobUrl;
    qrDownloadLink.download = 'smart-enigma-qr.png';
  });
}

// Wires up the compression toggle.
export function wireCompressToggle() {
  compressToggle.addEventListener('change', () => {
    if (!compressToggle.checked) {
      compressionSavingsText.hidden = true;
      state.lastCompressionSavings = null;
    }
  });
}
