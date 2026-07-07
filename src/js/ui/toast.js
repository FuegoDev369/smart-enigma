// src/js/ui/toast.js
//
// showToast(): shows a brief toast notification. Default duration is
// 2200ms; a pending toast's timer is cancelled via toast._timer.

import { toast, toastText } from '../dom.js';

export function showToast(msg, ms = 2200) {
  toast.hidden = false;
  toastText.textContent = msg;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.hidden = true; }, ms);
}
