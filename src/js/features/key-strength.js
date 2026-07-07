// src/js/features/key-strength.js
//
// Key strength indicator. Same heuristics, same score thresholds,
// same COMMON_WEAK_KEYS list.

import { t } from '../i18n/index.js';
import { keyInput, useStrong, weakWarning, keyStrengthLevelText, strengthFill, strengthMeter } from '../dom.js';

/* -------- Key strength indicator (v3.0.0) --------
   Homegrown heuristic, purely indicative (see keyStrengthHint in
   each language): no external library, no remote service. This is
   NOT a certified entropy measurement — just a local signal
   encouraging better key hygiene. */
const COMMON_WEAK_KEYS = [
  'password', '123456', '12345678', '123456789', 'qwerty', 'azerty',
  'letmein', 'admin', 'iloveyou', '111111', '000000', 'abc123',
  'password1', 'welcome', 'sunshine', 'princess', 'dragon'
];

export function isSequential(str) {
  if (str.length < 4) return false;
  let asc = true, desc = true;
  for (let i = 1; i < str.length; i++) {
    const diff = str.charCodeAt(i) - str.charCodeAt(i - 1);
    if (diff !== 1) asc = false;
    if (diff !== -1) desc = false;
  }
  return asc || desc;
}

export function estimateKeyStrength(key) {
  if (!key) return { level: 'weak', score: 0 };
  const lower = key.toLowerCase();
  if (COMMON_WEAK_KEYS.includes(lower)) return { level: 'weak', score: 5 };
  if (/^(.)\1+$/.test(key)) return { level: 'weak', score: 5 };
  if (isSequential(key)) return { level: 'weak', score: 10 };

  let diversity = 0;
  if (/[a-z]/.test(key)) diversity++;
  if (/[A-Z]/.test(key)) diversity++;
  if (/[0-9]/.test(key)) diversity++;
  if (/[^a-zA-Z0-9]/.test(key)) diversity++;

  const lengthScore = Math.min(key.length * 6, 60);
  const diversityScore = Math.min(diversity * 10, 40);
  let score = Math.min(lengthScore + diversityScore, 100);
  if (key.length < 8) score = Math.min(score, 35);

  let level = 'weak';
  if (score >= 70) level = 'strong';
  else if (score >= 40) level = 'medium';

  return { level, score };
}

export function refreshKeyStrength() {
  const d = t();
  const { level, score } = estimateKeyStrength(keyInput.value);
  const levelLabel = level === 'strong' ? d.keyStrengthStrong
    : level === 'medium' ? d.keyStrengthMedium
    : d.keyStrengthWeak;
  keyStrengthLevelText.textContent = levelLabel;
  strengthFill.style.width = keyInput.value ? Math.max(score, 6) + '%' : '0%';
  strengthMeter.dataset.level = level;
}

export function updateWeakWarning() {
  weakWarning.hidden = useStrong.checked;
}
