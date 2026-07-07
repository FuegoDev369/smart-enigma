// src/js/ui/clipboard.js
//
// copyToClipboard(): a generic UI utility (clipboard access), grouped
// with toast.js and theme.js rather than the feature/action modules.
// Uses the Clipboard API in a secure context, falling back to
// `execCommand('copy')` otherwise.

import { t } from '../i18n/index.js';
import { showToast } from './toast.js';

export async function copyToClipboard(text) {
  const d = t();
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast(d.copied);
  } catch {
    showToast(d.copyFail);
  }
}
