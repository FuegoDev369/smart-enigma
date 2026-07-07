// src/js/qr/qr-canvas.js
//
// QR rendering on <canvas> — touches the DOM, kept separate from the
// pure computation in qr-encoder.js.
//
// This file doesn't depend on qr-encoder.js: `drawQrToCanvas` receives
// the already-computed result from `encode()` (called elsewhere, in
// airgap-actions.js) as a parameter, so no import is needed here.

/**
 * Renders a QR matrix (as produced by qr-encoder.js's encode()) onto a canvas element.
 * @param {HTMLCanvasElement} canvas - Target canvas to draw on (resized to fit the QR code).
 * @param {{size: number, modules: boolean[][]}} result - QR matrix to render.
 * @returns {void}
 */
export function drawQrToCanvas(canvas, result) {
  const { size, modules } = result;
  const quiet = 4;
  const totalModules = size + quiet * 2;
  const px = Math.max(2, Math.floor(512 / totalModules));
  const pixelSize = totalModules * px;
  canvas.width = pixelSize;
  canvas.height = pixelSize;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, pixelSize, pixelSize);
  ctx.fillStyle = '#000000';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (modules[r][c]) {
        ctx.fillRect((c + quiet) * px, (r + quiet) * px, px, px);
      }
    }
  }
}
