/* Light / dark / system appearance. */
const systemLight = window.matchMedia('(prefers-color-scheme: light)');

export function resolveTheme(pref) {
  if (pref === 'system') return systemLight.matches ? 'light' : 'dark';
  return pref === 'light' ? 'light' : 'dark';
}

export function applyTheme(pref) {
  const theme = resolveTheme(pref);
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f2f4f9' : '#06070a');
  // Mirror the choice so index.html can paint the right theme before the database opens
  try { localStorage.setItem('ld.theme', pref); } catch { /* storage unavailable */ }
}

/** Re-apply when the system appearance changes and the user picked "System". */
export function watchSystemTheme(getPref) {
  systemLight.addEventListener('change', () => {
    if (getPref() === 'system') applyTheme('system');
  });
}
