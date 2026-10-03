// Apply the saved/browser preference before styles paint. No tracking is used.
(() => {
  const key = 'ars-color-theme';
  const browser = window.matchMedia('(prefers-color-scheme: dark)');
  let preference = 'system';
  try {
    const saved = localStorage.getItem(key);
    if (['light', 'dark'].includes(saved)) preference = saved;
  } catch { /* Preferences still work when browser storage is unavailable. */ }
  function apply() {
    const theme = preference === 'system' ? (browser.matches ? 'dark' : 'light') : preference;
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.themePreference = preference;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151c19' : '#f5f3ed');
    document.querySelectorAll('[data-theme-picker]').forEach((picker) => { picker.value = preference; });
  }
  browser.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : 'system';
    apply();
  });
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    apply();
    document.querySelectorAll('[data-theme-picker]').forEach((picker) => picker.addEventListener('change', () => {
      preference = ['light', 'dark'].includes(picker.value) ? picker.value : 'system';
      try { if (preference === 'system') localStorage.removeItem(key); else localStorage.setItem(key, preference); } catch { /* Keep the selection for this page. */ }
      apply();
    }));
  });
})();
