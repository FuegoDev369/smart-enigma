// src/js/features/shamir-actions.js
//
// DOM orchestration for Shamir key splitting/combining (Phase D,
// v6.0.0). All the actual GF(256) math and share encoding lives in
// src/js/shamir/shamir-gf256.js (pure, no DOM) — this module only
// reads/writes the DOM and calls it, same split as qr/ and sound/.

import { t } from '../i18n/index.js';
import { showToast } from '../ui/toast.js';
import { copyToClipboard } from '../ui/clipboard.js';
import { refreshKeyStrength } from './key-strength.js';
import { splitSecretToShareStrings, combineShareStringsToSecret } from '../shamir/shamir-gf256.js';
import {
  keyInput, shamirThresholdInput, shamirSharesInput, shamirSplitBtn,
  shamirSharesOutput, shamirCombineTextarea, shamirCombineBtn
} from '../dom.js';

/**
 * Builds one read-only share display row (label, value, copy button).
 * @param {string} shareString
 * @param {number} index - 1-based display index (matches shamirShareLabel's {index}).
 * @returns {HTMLDivElement}
 */
function renderShareRow(shareString, index) {
  const d = t();
  const row = document.createElement('div');
  row.className = 'shamir-share-row';

  const label = document.createElement('span');
  label.className = 'shamir-share-label';
  label.textContent = d.shamirShareLabel.replace('{index}', String(index));

  const value = document.createElement('code');
  value.className = 'shamir-share-value';
  value.textContent = shareString;

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn tiny icon-only';
  copyBtn.setAttribute('aria-label', d.shamirShareCopyAria);
  copyBtn.innerHTML = '<svg class="icon" aria-hidden="true" focusable="false"><use href="#icon-copy"></use></svg>';
  copyBtn.addEventListener('click', () => copyToClipboard(shareString));

  row.appendChild(label);
  row.appendChild(value);
  row.appendChild(copyBtn);
  return row;
}

/**
 * Re-applies translated labels/aria to already-rendered share rows —
 * called from translateUI() on language change.
 */
export function retranslateShamirShares() {
  const d = t();
  const rows = shamirSharesOutput.querySelectorAll('.shamir-share-row');
  rows.forEach((row, i) => {
    const label = row.querySelector('.shamir-share-label');
    if (label) label.textContent = d.shamirShareLabel.replace('{index}', String(i + 1));
    const btn = row.querySelector('button');
    if (btn) btn.setAttribute('aria-label', d.shamirShareCopyAria);
  });
}

export async function shamirSplitAction() {
  const d = t();
  const key = keyInput.value || '';
  if (!key) { showToast(d.noKey); return; }

  const threshold = parseInt(shamirThresholdInput.value, 10);
  const totalShares = parseInt(shamirSharesInput.value, 10);
  if (!Number.isInteger(threshold) || threshold < 2 ||
      !Number.isInteger(totalShares) || totalShares < threshold || totalShares > 255) {
    showToast(d.genericError);
    return;
  }

  try {
    shamirSplitBtn.disabled = true;
    const shareStrings = await splitSecretToShareStrings(key, threshold, totalShares);
    shamirSharesOutput.innerHTML = '';
    shareStrings.forEach((s, i) => shamirSharesOutput.appendChild(renderShareRow(s, i + 1)));
    shamirSharesOutput.hidden = false;
    showToast(d.shamirSplitDone);
  } catch (err) {
    console.error(err);
    showToast(d.genericError);
  } finally {
    shamirSplitBtn.disabled = false;
  }
}

export async function shamirCombineAction() {
  const d = t();
  const raw = shamirCombineTextarea.value || '';
  const shareStrings = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (shareStrings.length === 0) { showToast(d.noInput); return; }

  try {
    shamirCombineBtn.disabled = true;
    const secret = await combineShareStringsToSecret(shareStrings);
    keyInput.value = secret;
    refreshKeyStrength();
    showToast(d.shamirCombineDone);
  } catch (err) {
    if (err && typeof err.needed === 'number') {
      showToast(d.shamirNeedMore.replace('{needed}', String(err.needed)));
    } else {
      console.error(err);
      showToast(d.shamirCombineFail);
    }
  } finally {
    shamirCombineBtn.disabled = false;
  }
}
