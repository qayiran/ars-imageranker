import { darkHorseFavorites, ratingFingerprint } from './taste-insights.js';
import { thumbnail, bindResultImages } from './result-images.js';
import { t, locale } from './language.js';
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (value) => value.toLocaleString(locale(), { maximumFractionDigits: 1 });
const signed = (value) => (Math.abs(value) < .05 ? 0 : value).toLocaleString(locale(), { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
function darkHorseMarkup(rankings, options) {
  const data = options.comparisonStatus === 'loading' || options.comparisonStatus === 'error' ? null : darkHorseFavorites(rankings, options.participants, options);
  const message = options.comparisonStatus === 'loading' ? t('Loading dark-horse favorites…') : options.comparisonStatus === 'error'
    ? t('Other rankings could not be loaded. Retry the global comparison to find dark-horse favorites.') : t('At least one other saved ranking is needed to find dark-horse favorites.');
  return `<section class="insight-panel dark-horse-favorites"><span class="eyebrow">${t('DISTINCTIVE FAVORITES')}</span><h2>${t('Dark-horse favorites')}</h2><p class="insight-intro">${t('Your top-five characters that sit in the bottom five of the other participants’ combined ranking.')}</p>${data?.status === 'ready' ? `${data.favorites.length ? `<ul class="dark-horse-list">${data.favorites.map((row) => `<li data-dark-horse="${row.id}">${thumbnail(row.id, row.name, { className: 'dark-horse-art' })}<div><a href="character.html#${row.id}">${row.name}</a><span>${t`This result: rank ${number(row.personalRank)} · Others: rank ${number(row.globalRank)}`}</span></div></li>`).join('')}</ul>` : `<p class="insight-empty">${t('No characters meet both conditions in this result.')}</p>`}<p class="fine-print">${t`Other rankings used: ${data.peerCount}. This result is excluded from their average.`}</p>` : `<p class="insight-empty" role="status">${message}</p>`}<details class="insight-details"><summary>${t('How dark-horse favorites are selected')}</summary><p>${t('Others are ranked by their mean character ratings, excluding this result code. A tied group qualifies only when all its positions fit inside the top five or bottom five. This describes the saved sample and can change as results arrive.')}</p>${options.provenance || data?.manualPeerCount ? `<p>${t('Recovered screenshot ratings are included; rounding can affect nearly tied characters.')}</p>` : ''}</details></section>`;
}

function fingerprintMobileMarkup({ rows, extent }) {
  return `<div class="fingerprint-mobile" aria-label="${t('Rating fingerprint chart')}">${rows.map((row) => `<a class="fingerprint-mobile-row" href="character.html#${row.id}"><span>${row.name}</span><span class="fingerprint-mobile-track" aria-hidden="true"><i class="${row.difference >= 0 ? 'fingerprint-mobile-positive' : 'fingerprint-mobile-negative'}" style="width:${Math.abs(row.difference) / extent * 50}%"></i></span><span>${signed(row.difference)}</span></a>`).join('')}<div class="fingerprint-mobile-axis" aria-hidden="true"><span></span><span><i>${signed(-extent)}</i><i>0</i><i>${signed(extent)}</i></span><span></span></div></div>`;
}

function fingerprintMarkup(rankings, options) {
  const data = ratingFingerprint(rankings);
  if (!data) return '';
  const { mean, extent, rows } = data, center = 446, half = 235, x = (value) => center + half * value / extent;
  return `<section class="insight-panel rating-fingerprint" data-fingerprint-mean="${mean}"><span class="eyebrow">${t('RATING PATTERN')}</span><h2>${t('Rating fingerprint')}</h2><p class="insight-intro">${t('Each character’s score minus the average score in this result. Character order stays the same across participants.')}</p><div class="fingerprint-legend"><span>${t('Below this result’s average')}</span><strong>${t`Average: ${number(mean)}`}</strong><span>${t('Above this result’s average')}</span></div><div class="fingerprint-scroll" tabindex="0" role="region" aria-label="${t('Rating fingerprint chart')}"><svg viewBox="0 0 800 634" role="group" aria-label="${t('Rating fingerprint chart')}"><title>${t('Rating fingerprint')}</title><desc>${t('Lines extend left or right from zero. Values show rating points below or above this result’s average; they do not show model uncertainty.')}</desc>${[-1, -.5, 0, .5, 1].map((part) => `<line class="fingerprint-grid ${part === 0 ? 'fingerprint-zero' : ''}" x1="${x(extent * part)}" x2="${x(extent * part)}" y1="30" y2="597"></line><text class="fingerprint-tick" x="${x(extent * part)}" y="622" text-anchor="middle">${signed(extent * part)}</text>`).join('')}${rows.map((row, i) => { const y = 48 + i * 33; return `<g data-fingerprint-id="${row.id}" data-fingerprint-difference="${row.difference}" class="${row.difference >= 0 ? 'fingerprint-positive' : 'fingerprint-negative'}"><a href="character.html#${row.id}" aria-label="${escape(t`${row.name}: ${signed(row.difference)} rating points from this result’s average`)}"><rect x="0" y="${y - 15}" width="800" height="31" fill="transparent"></rect><title>${row.name}: ${signed(row.difference)}</title><text class="fingerprint-name" x="12" y="${y + 4}">${row.name}</text><line class="fingerprint-stem" x1="${center}" x2="${x(row.difference)}" y1="${y}" y2="${y}"></line><circle class="fingerprint-dot" cx="${x(row.difference)}" cy="${y}" r="5"></circle><text class="fingerprint-value" x="778" y="${y + 4}" text-anchor="end">${signed(row.difference)}</text></a></g>`; }).join('')}</svg></div>${fingerprintMobileMarkup(data)}<p class="fine-print">${t('Zero is this result’s mean, not the starting rating or the community average. The horizontal range adjusts to this result; use the printed values when comparing participants. This is a score pattern, not a personality measure.')}${options.provenance ? ` ${t('Recovered screenshot ratings are included; rounding can affect nearly tied characters.')}` : ''}</p><details class="insight-details"><summary>${t('View the fingerprint as a table')}</summary><div class="insight-table-scroll"><table class="divisive-table"><thead><tr><th>${t('Colony / state')}</th><th>${t('Rating')}</th><th>${t('Difference from own average')}</th></tr></thead><tbody>${rows.map((row) => `<tr><th scope="row"><a href="character.html#${row.id}">${row.name}</a></th><td>${number(row.rating)}</td><td>${signed(row.difference)}</td></tr>`).join('')}</tbody></table></div></details></section>`;
}


function renderInsight(target, markup) {
  const open = [...target.querySelectorAll('details')].map((detail) => detail.open);
  target.innerHTML = markup;
  target.querySelectorAll('details').forEach((detail, i) => { detail.open = open[i] || false; });
}

export function renderDarkHorseFavorites(target, rankings, options = {}) {
  renderInsight(target, darkHorseMarkup(rankings, options));
  bindResultImages(target, rankings);
}

export function renderRatingFingerprint(target, rankings, options = {}) {
  renderInsight(target, fingerprintMarkup(rankings, options));
}
