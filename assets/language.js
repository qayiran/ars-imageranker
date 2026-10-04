import { TURKISH } from './translations.js';
const browser = typeof document !== 'undefined';
export const locale = () => typeof document !== 'undefined' && document.documentElement.lang === 'tr' ? 'tr-TR' : 'en-US';
// English source strings are stable keys. Tagged templates keep user data out of
// translated messages; callers escape interpolated values when producing HTML.
export function t(source, ...values) {
  const key = Array.isArray(source) ? source.reduce((text, part, index) => text + (index ? `{${index - 1}}` : '') + part, '') : source;
  const message = locale() === 'tr-TR' ? (TURKISH[key] ?? key) : key;
  return message.replace(/\{(\d+)\}/g, (_, index) => String(values[index] ?? ''));
}
export function translateError(message) {
  for (const [pattern, key] of [
    [/^Your result has not been confirmed saved to GitHub\. (.*?) Your choices are still saved on this device\. Retry or download a copy\.$/s, 'Your result has not been confirmed saved to GitHub. {0} Your choices are still saved on this device. Retry or download a copy.'],
    [/^(.*?) Your ranking can still be downloaded, but shared saving is unavailable\.$/s, '{0} Your ranking can still be downloaded, but shared saving is unavailable.'],
    [/^The results service is unavailable \((\d+)\)\. Try again shortly\.$/, 'The results service is unavailable ({0}). Try again shortly.'],
    [/^Results are unavailable \((\d+)\)\.$/, 'Results are unavailable ({0}).'],
  ]) {
    const match = message.match(pattern);
    if (match) return t(key, translateError(match[1]));
  }
  return t(message);
}
function applyStatic() {
  document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
  for (const attribute of ['aria-label', 'alt', 'placeholder', 'content']) {
    document.querySelectorAll(`[data-i18n-${attribute}]`).forEach((node) => { node.setAttribute(attribute, t(node.getAttribute(`data-i18n-${attribute}`))); });
  }
  document.querySelectorAll('[data-language-picker]').forEach((picker) => { picker.value = document.documentElement.lang; });
}
if (browser) {
  applyStatic();
  document.querySelectorAll('[data-language-picker]').forEach((picker) => picker.addEventListener('change', () => {
    document.documentElement.lang = picker.value === 'en' ? 'en' : 'tr';
    try { localStorage.setItem('ars-language', document.documentElement.lang); } catch { /* Keep this page usable without storage. */ }
    applyStatic();
    window.dispatchEvent(new Event('languagechange'));
  }));
  window.addEventListener('storage', (event) => {
    if (event.key !== 'ars-language' && event.key !== null) return;
    document.documentElement.lang = event.newValue === 'en' ? 'en' : 'tr';
    applyStatic(); window.dispatchEvent(new Event('languagechange'));
  });
}
