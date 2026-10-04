// Turkish is the default; a visitor's explicit choice takes precedence.
(() => {
  let language = 'tr';
  try { if (localStorage.getItem('ars-language') === 'en') language = 'en'; } catch { /* The default works without storage. */ }
  document.documentElement.lang = language;
})();
