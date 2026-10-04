import { t, locale } from './language.js';

export const manualNote = (item) => item.provenance?.kind === 'manual' ? `<span class="manual-note">${t('Manually added')}</span>` : '';
export function resultDate(item) {
  const manual = item.provenance?.kind === 'manual';
  return new Date(item.completedAt).toLocaleDateString(locale(), { year: 'numeric', month: 'short', day: 'numeric',
    ...(manual ? { timeZone: 'Europe/Istanbul' } : {}) });
}
