// src/js/i18n/index.js
//
// i18n orchestration: language registry, t(), detectLang(), translateUI().
//
// Locales are lazy-loaded: only `en` is a static import (a guaranteed
// fallback, needed even before detectLang() can run). The other 8
// languages are resolved via dynamic import(), triggered either by
// translateUI(initialLang) at startup (if the detected language isn't
// English) or by a manual language change in the selector. Each locale
// is imported at most once — its dictionary is cached in `translations`
// after the first successful load.
//
// A necessary consequence: translateUI() is async, since it must await
// the locale import before applying the translation.

import en from './locales/en.js';
import { state } from '../state.js';
import { refreshKeyStrength } from '../features/key-strength.js';
import {
  $, html, langSelect, themeToggle, keyLabelText, keyInput, copyKeyBtn,
  clearKeyBtn, toggleSecret, strongLabel, weakWarningText, inputArea,
  encryptBtnText, decryptBtnText, clearBtnText, resultTitleText,
  copyOutputText, backToTop, output, keyStrengthLabelText,
  keyStrengthHintText, fingerprintLabelText, fingerprintHintText,
  fingerprintToggle, fingerprintToggleText, panicWipeHintText,
  fileSectionLabelText, fileDropLabelText, fileSizeLimitHintText,
  fileEncryptBtnText, fileDecryptBtnText, downloadResultText,
  fileClearBtn, fileSelectedRow, airgapSectionLabelText, airgapIntroText,
  compressToggleLabelText, compressionHintText, compressionSavingsText,
  qrSectionLabelText, qrGenerateBtnText, qrDownloadBtnText, qrScanHintText,
  soundSectionLabelText, soundEmitBtnText, soundListenBtnText,
  soundMicPermissionText, soundCaveatText
} from '../dom.js';

// `en` is always resolved (guaranteed fallback). The other 8 languages
// are added to this object only once their dynamic import() resolves
// (see loadLocale() / translateUI() below) — until a language has been
// loaded, `t()` falls back to `en`, same as for any unsupported
// language.
const translations = { en };

// One loader per supported language not yet loaded by default (except
// `en`, already static above). SUPPORTED_LOADERS also acts as a
// registry to validate that a requested language exists (translateUI).
const SUPPORTED_LOADERS = {
  fr: () => import('./locales/fr.js'),
  zh: () => import('./locales/zh.js'),
  es: () => import('./locales/es.js'),
  ru: () => import('./locales/ru.js'),
  de: () => import('./locales/de.js'),
  pt: () => import('./locales/pt.js'),
  it: () => import('./locales/it.js'),
  ko: () => import('./locales/ko.js')
};

/**
 * Loads (once, with caching) the dictionary for the requested language
 * if not already loaded. No-op for `en`, always statically available.
 * @param {string} lang - Language code to load.
 * @returns {Promise<void>}
 */
async function loadLocale(lang) {
  if (translations[lang] || !SUPPORTED_LOADERS[lang]) return;
  const mod = await SUPPORTED_LOADERS[lang]();
  translations[lang] = mod.default;
}

/**
 * Returns the translation dictionary for the current language,
 * falling back to English if the current language is unknown or not
 * yet loaded (see loadLocale()).
 * @returns {object} Translation dictionary.
 */
export function t() {
  return translations[state.currentLang] || translations.en;
}

/**
 * Detects the browser language among the 9 supported languages,
 * falling back to 'en' if unsupported.
 * @returns {string} Detected language code ('en' by default).
 */
export function detectLang() {
  const SUPPORTED = ['en', 'fr', 'zh', 'es', 'ru', 'de', 'pt', 'it', 'ko'];
  const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
  const prefix = nav.slice(0, 2);
  return SUPPORTED.includes(prefix) ? prefix : 'en';
}

/**
 * Applies the `lang` translation across the entire UI.
 * @param {string} lang - Language code to apply.
 * @returns {Promise<void>}
 */
export async function translateUI(lang) {
  const targetLang = (lang === 'en' || SUPPORTED_LOADERS[lang]) ? lang : 'en';
  await loadLocale(targetLang);
  state.currentLang = translations[targetLang] ? targetLang : 'en';
  const d = t();
  html.lang = state.currentLang;

  $('#langSelectLabel').textContent = d.langSelectLabel;
  langSelect.setAttribute('aria-label', d.langSelectAria);
  themeToggle.setAttribute('aria-label', d.themeAria);

  keyLabelText.textContent = d.labelKey;
  keyInput.placeholder = d.labelKey;
  copyKeyBtn.setAttribute('aria-label', d.copyKeyAria);
  clearKeyBtn.title = d.clearKeyTitle;
  clearKeyBtn.setAttribute('aria-label', d.clearKeyTitle);
  toggleSecret.setAttribute('aria-label', keyInput.type === 'password' ? d.toggleShowKey : d.toggleHideKey);

  strongLabel.textContent = d.strongLabel;
  weakWarningText.textContent = d.weakWarning;

  inputArea.placeholder = d.inputPlaceholder;
  encryptBtnText.textContent = d.buttonEncrypt;
  decryptBtnText.textContent = d.buttonDecrypt;
  clearBtnText.textContent = d.buttonClear;
  resultTitleText.textContent = d.resultTitle;
  copyOutputText.textContent = d.copyResult;
  backToTop.title = d.backToTopTitle;
  backToTop.setAttribute('aria-label', d.backToTopTitle);

  if (!state.hasResult) {
    output.textContent = d.outputPlaceholder;
    output.classList.add('placeholder');
  }

  $('#aboutTitle').textContent = d.aboutTitle;
  $('#aboutContent').textContent = d.aboutContent;
  $('#howTitle').textContent = d.howTitle;

  const stepsList = $('#howSteps');
  stepsList.innerHTML = '';
  d.howSteps.forEach(s => {
    const li = document.createElement('li');
    li.textContent = s;
    stepsList.appendChild(li);
  });
  $('#howNote').textContent = d.howNote;

  keyStrengthLabelText.textContent = d.keyStrengthLabel;
  keyStrengthHintText.textContent = d.keyStrengthHint;
  fingerprintLabelText.textContent = d.fingerprintLabel;
  fingerprintHintText.textContent = d.fingerprintHint;
  fingerprintToggle.setAttribute('aria-label', state.fingerprintVisible ? d.fingerprintHide : d.fingerprintShow);
  fingerprintToggleText.textContent = state.fingerprintVisible ? d.fingerprintHide : d.fingerprintShow;
  panicWipeHintText.textContent = d.panicWipeHint;
  refreshKeyStrength();

  // File encryption
  fileSectionLabelText.textContent = d.fileSectionLabel;
  fileDropLabelText.textContent = d.fileDropLabel;
  fileSizeLimitHintText.textContent = d.fileSizeLimitHint;
  fileEncryptBtnText.textContent = d.fileEncryptAction;
  fileDecryptBtnText.textContent = d.fileDecryptAction;
  downloadResultText.textContent = d.downloadResult;
  fileClearBtn.title = d.fileClearAction;
  fileClearBtn.setAttribute('aria-label', d.fileClearAction);
  if (state.selectedFile) {
    fileSelectedRow.setAttribute('aria-label', d.fileSelectedAria.replace('{filename}', state.selectedFile.name));
  }

  // Offline transfer
  airgapSectionLabelText.textContent = d.airgapSectionLabel;
  airgapIntroText.textContent = d.airgapIntro;
  compressToggleLabelText.textContent = d.compressToggleLabel;
  compressionHintText.textContent = d.compressionHint;
  if (state.lastCompressionSavings !== null) {
    compressionSavingsText.textContent = d.compressionSavings.replace('{percent}', state.lastCompressionSavings);
  }
  qrSectionLabelText.textContent = d.qrSectionLabel;
  qrGenerateBtnText.textContent = d.qrGenerateAction;
  qrDownloadBtnText.textContent = d.qrDownloadAction;
  qrScanHintText.textContent = d.qrScanHint;
  soundSectionLabelText.textContent = d.soundSectionLabel;
  soundEmitBtnText.textContent = d.soundEmitAction;
  soundListenBtnText.textContent = d.soundListenAction;
  soundMicPermissionText.textContent = d.soundMicPermission;
  soundCaveatText.textContent = d.soundCaveat;
}
