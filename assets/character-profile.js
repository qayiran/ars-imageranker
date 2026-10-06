import { IMAGES } from './catalog.js';
import { characterProfile } from './exploration-data.js';
import { loadPublicResults } from './results-data.js';
import { characterCategory } from './character-details.js';
import { thumbnail, bindResultImages } from './result-images.js';
import { t, locale } from './language.js';
const root = document.querySelector('#character-profile');
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (value) => value.toLocaleString(locale(), { maximumFractionDigits: 1 });
let results = [], state = 'loading', revision = 0;
function histogram(rows, label) {
  const width = 840, height = 245, maximum = Math.max(1, ...rows.map(({ count }) => count));
  const step = 770 / rows.length;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escape(label)}"><title>${escape(label)}</title>${[0, .5, 1].map((part) => `<line class="profile-grid" x1="45" x2="815" y1="${195 - part * 155}" y2="${195 - part * 155}"></line><text class="profile-tick" x="35" y="${199 - part * 155}" text-anchor="end">${number(maximum * part)}</text>`).join('')}${rows.map((row, index) => `<g data-distribution-count="${row.count}"><rect class="profile-bar" x="${45 + index * step + step * .16}" y="${195 - row.count / maximum * 155}" width="${step * .68}" height="${row.count / maximum * 155}"><title>${escape(row.label)}: ${number(row.count)}</title></rect><text class="profile-tick" x="${45 + index * step + step / 2}" y="220" text-anchor="middle">${escape(row.label)}</text></g>`).join('')}</svg>`;
}
function render() {
  const id = location.hash.slice(1) || IMAGES[0].id;
  const data = characterProfile(id, results);
  if (!data) { root.innerHTML = `<div class="empty-state"><h1>${t('Character not found')}</h1><a href="character.html">${t('Browse character profiles')}</a></div>`; return; }
  const { image } = data;
  document.title = `${image.name} · ${t('Character profile')} — American Revolution Smuggler`;
  const stats = state === 'loading' ? `<p class="insight-empty" role="status">${t('Loading character statistics…')}</p>` : state === 'error'
    ? `<div class="empty-state" role="status"><h2>${t('Character statistics unavailable')}</h2><p>${t('Participant results could not be loaded. Try again.')}</p><button class="secondary" data-refresh-profile>${t('Retry')}</button></div>` : !data.sessionCount
    ? `<div class="empty-state"><h2>${t('No saved character ratings yet')}</h2><p>${t('Statistics will appear after participants save their rankings.')}</p></div>`
    : `<div class="profile-stats"><div><strong>${number(data.mean)}</strong><span>${t('Average rating')}</span></div><div><strong>${number(data.medianRank)}</strong><span>${t('Median rank')}</span></div><div><strong>${data.firstCount} / ${data.sessionCount}</strong><span>${t('First or tied first')}</span></div><div><strong>${data.winRate == null ? '—' : (data.winRate / 100).toLocaleString(locale(), { style: 'percent', maximumFractionDigits: 1 })}</strong><span>${t('Win rate')}</span></div></div><p class="fine-print profile-cohort">${t`${data.sessionCount} saved rankings. Win statistics use ${data.completeCount} results with complete win counts.`}</p><div class="profile-charts"><section class="insight-panel"><h2>${t('Rating distribution')}</h2><p class="insight-intro">${t('How many saved results give this character a rating in each interval.')}</p><div class="profile-chart-scroll" data-rating-distribution>${histogram(data.histogram.map((row) => ({ ...row, label: `${number(row.lower)}–${number(row.upper)}` })), t('Rating distribution'))}</div></section><section class="insight-panel"><h2>${t('Rank distribution')}</h2><p class="insight-intro">${t('How often this character finishes at each position, from first to seventeenth.')}</p><div class="profile-chart-scroll" data-rank-distribution>${histogram(data.positions.map((count, index) => ({ label: String(index + 1), count })), t('Rank distribution'))}</div></section></div><p class="fine-print insight-note">${t('Equal ratings share an average rank. In the position chart, each tied result is split equally among its occupied positions. Rating intervals include their lower bound; only the final interval includes its upper bound.')}${data.manualCount ? ` ${t('Recovered screenshot ratings are included; rounding can affect nearly tied characters.')}` : ''}</p><details class="profile-distributions"><summary>${t('View distributions as tables')}</summary><div class="profile-distribution-tables"><table><caption>${t('Rating distribution')}</caption><thead><tr><th>${t('Rating interval')}</th><th>${t('Saved rankings')}</th></tr></thead><tbody>${data.histogram.map((row) => `<tr><td>${number(row.lower)}–${number(row.upper)}</td><td>${row.count}</td></tr>`).join('')}</tbody></table><table><caption>${t('Rank distribution')}</caption><thead><tr><th>${t('Rank')}</th><th>${t('Weighted rankings')}</th></tr></thead><tbody>${data.positions.map((count, index) => `<tr><td>${index + 1}</td><td>${number(count)}</td></tr>`).join('')}</tbody></table></div></details><section class="profile-records insight-panel"><h2>${t('Participant ratings for this character')}</h2><div class="insight-table-scroll"><table class="divisive-table"><thead><tr><th>${t('Participant')}</th><th>${t('Rating')}</th><th>${t('Rank')}</th></tr></thead><tbody>${data.entries.map((item) => `<tr><th scope="row"><a href="results.html#${item.id}">${escape(item.username)}<code>${item.resultCode}</code></a>${item.provenance ? `<span class="manual-note">${t('Manually added')}</span>` : ''}</th><td>${number(item.row.elo)}</td><td>${number(item.rank)}</td></tr>`).join('')}</tbody></table></div></section>`;
  root.innerHTML = `<div class="profile-toolbar"><a href="gallery.html" class="text-button">${t('← Character gallery')}</a><label><span class="field-label">${t('Choose a character')}</span><select data-profile-picker>${IMAGES.map((item) => `<option value="${item.id}" ${item.id === id ? 'selected' : ''}>${item.name}</option>`).join('')}</select></label><button class="secondary" data-refresh-profile>${t('Refresh ↻')}</button></div><div class="profile-overview"><div class="profile-art">${thumbnail(image.id, image.name, { className: 'profile-image' })}</div><section class="profile-intro"><span class="eyebrow">${t('CHARACTER PROFILE')}</span><h1>${image.name}</h1><p class="description">${t('Explore this character’s ratings and rank across saved results.')}</p><dl class="profile-facts"><div><dt>${t('Historical status')}</dt><dd>${t(characterCategory(image))}</dd></div><div><dt>${t('Assigned faction')}</dt><dd>${t(data.faction?.name ?? 'Neither faction')}${data.faction?.leader === id ? ` · ${t('Faction leader')}` : ''}</dd></div><div><dt>${t('Region')}</dt><dd>${t(data.region.name)}</dd></div></dl><p class="fine-print">${t('Factions follow this site’s character assignments. Regional groups include all 17 characters geographically.')}</p></section></div><div class="profile-statistics" data-profile-id="${id}" data-profile-sessions="${data.sessionCount}">${stats}</div>`;
  bindResultImages(root.querySelector('.profile-art'), IMAGES);
  root.querySelector('[data-profile-picker]').addEventListener('change', (event) => { location.hash = event.target.value; });
  root.querySelectorAll('[data-refresh-profile]').forEach((button) => button.addEventListener('click', refresh));
}
async function refresh() {
  const current = ++revision; state = 'loading'; render();
  try { const data = await loadPublicResults(); if (current !== revision) return; results = data; state = 'ready'; }
  catch { if (current !== revision) return; results = []; state = 'error'; }
  render();
}
window.addEventListener('hashchange', render);
window.addEventListener('languagechange', () => {
  const open = [...root.querySelectorAll('details')].map((detail) => detail.open);
  render(); root.querySelectorAll('details').forEach((detail, index) => { detail.open = open[index] || false; });
});
void refresh();
