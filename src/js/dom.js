// src/js/dom.js
//
// Cross-cutting UI layer: every DOM reference used by the app, grouped
// in one place.
//
// One named export per DOM reference. No value, selector, or ordering
// is meaningful beyond matching the markup in index.html.
//
// Does NOT contain mutable app state (hasResult, currentLang,
// fingerprintVisible, selectedFile, fileResultBlobUrl,
// qrDownloadBlobUrl, lastCompressionSavings, soundListenState) — that
// lives in src/js/state.js, not here.

export const $ = sel => document.querySelector(sel);
export const html = document.documentElement;
export const langSelect = $('#langSelect');
export const themeToggle = $('#themeToggle');
export const keyInput = $('#keyInput');
export const copyKeyBtn = $('#copyKey');
export const clearKeyBtn = $('#clearKey');
export const useStrong = $('#useStrong');
export const weakWarning = $('#weakWarning');
export const weakWarningText = $('#weakWarningText');
export const inputArea = $('#inputArea');
export const encryptBtn = $('#encryptBtn');
export const decryptBtn = $('#decryptBtn');
export const clearBtn = $('#clearBtn');
export const output = $('#output');
export const resultTitleText = $('#resultTitleText');
export const copyOutput = $('#copyOutput');
export const backToTop = $('#backToTop');
export const toast = $('#toast');
export const toastText = $('#toastText');
export const strongLabel = $('#strongLabel');
export const toggleSecret = $('#toggleSecret');
export const toggleSecretIcon = $('#toggleSecretIcon');
export const keyLabel = $('#keyLabel');
export const keyLabelText = $('#keyLabelText');
export const encryptBtnText = $('#encryptBtnText');
export const decryptBtnText = $('#decryptBtnText');
export const clearBtnText = $('#clearBtnText');
export const copyOutputText = $('#copyOutputText');

export const keyStrengthLabelText = $('#keyStrengthLabelText');
export const keyStrengthLevelText = $('#keyStrengthLevelText');
export const keyStrengthHintText = $('#keyStrengthHintText');
export const strengthFill = $('#strengthFill');
export const strengthMeter = $('#strengthMeter');
export const fingerprintLabelText = $('#fingerprintLabelText');
export const fingerprintHintText = $('#fingerprintHintText');
export const fingerprintValue = $('#fingerprintValue');
export const fingerprintToggle = $('#fingerprintToggle');
export const fingerprintToggleIcon = $('#fingerprintToggleIcon');
export const fingerprintToggleText = $('#fingerprintToggleText');
export const panicWipeHintText = $('#panicWipeHintText');

// File encryption fields
export const fileSectionLabelText = $('#fileSectionLabelText');
export const dropzone = $('#dropzone');
export const fileInput = $('#fileInput');
export const fileDropLabelText = $('#fileDropLabelText');
export const fileSizeLimitHintText = $('#fileSizeLimitHintText');
export const fileSelectedRow = $('#fileSelectedRow');
export const fileSelectedName = $('#fileSelectedName');
export const fileClearBtn = $('#fileClearBtn');
export const fileEncryptBtn = $('#fileEncryptBtn');
export const fileDecryptBtn = $('#fileDecryptBtn');
export const fileEncryptBtnText = $('#fileEncryptBtnText');
export const fileDecryptBtnText = $('#fileDecryptBtnText');
export const fileResultRow = $('#fileResultRow');
export const fileDownloadLink = $('#fileDownloadLink');
export const downloadResultText = $('#downloadResultText');

// Offline transfer fields (compression, QR, sound)
export const airgapSectionLabelText = $('#airgapSectionLabelText');
export const airgapIntroText = $('#airgapIntroText');
export const compressToggle = $('#compressToggle');
export const compressToggleLabelText = $('#compressToggleLabelText');
export const compressionHintText = $('#compressionHintText');
export const compressionSavingsText = $('#compressionSavingsText');
export const qrSectionLabelText = $('#qrSectionLabelText');
export const qrGenerateBtn = $('#qrGenerateBtn');
export const qrGenerateBtnText = $('#qrGenerateBtnText');
export const qrDisplay = $('#qrDisplay');
export const qrCanvas = $('#qrCanvas');
export const qrDownloadLink = $('#qrDownloadLink');
export const qrDownloadBtnText = $('#qrDownloadBtnText');
export const qrScanHintText = $('#qrScanHintText');
export const soundSectionLabelText = $('#soundSectionLabelText');
export const soundEmitBtn = $('#soundEmitBtn');
export const soundEmitBtnText = $('#soundEmitBtnText');
export const soundListenBtn = $('#soundListenBtn');
export const soundListenBtnText = $('#soundListenBtnText');
export const soundStatusText = $('#soundStatusText');
export const soundMicPermissionText = $('#soundMicPermissionText');
export const soundCaveatText = $('#soundCaveatText');
