// src/js/ui/theme.js
//
// Theme logic: light/dark toggle plus initial detection via
// prefers-color-scheme.

import { html, themeToggle } from '../dom.js';

// Applies the dark or light theme on <html data-theme="...">.
export function applyTheme(isDark) {
  html.dataset.theme = isDark ? 'dark' : 'light';
}

// Initial detection: applies the detected theme and syncs the switch.
export function initTheme() {
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(prefersDark);
  themeToggle.checked = prefersDark;
}

// Wires up the theme toggle switch.
export function wireThemeToggle() {
  themeToggle.addEventListener('change', (e) => {
    applyTheme(e.target.checked);
  });
}
