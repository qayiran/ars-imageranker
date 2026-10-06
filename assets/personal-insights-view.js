import { closestMatches, preferenceConsistency } from './community-insights.js';
import { t, locale } from './language.js';
import { renderCircularExamples } from './circular-examples-view.js';
import { divergencePercent } from './rank-divergence-view.js';
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pages = new Map();
const number = (value) => value.toLocaleString(locale(), { maximumFractionDigits: 1 });

export function personalInsightsMarkup(rankings, { participants = [], id, provenance, comparisonStatus = 'ready' } = {}) {
  const matches = comparisonStatus === 'ready' ? closestMatches(rankings, participants, { id }) : null;
  const consistency = provenance ? null : preferenceConsistency(rankings);
  const matchMessage = comparisonStatus === 'loading' ? t('Loading closest matches…') : comparisonStatus === 'error'
    ? t('Closest matches unavailable. Retry the global comparison to load them.') : t('At least one other saved ranking is needed to find a match.');
  const shown = matches?.slice(0, 3) ?? [];
  const key = String(id ?? 'local').replace(/[^a-z0-9-]/gi, ''), page = pages.get(key) ?? 'summary';
  return `<div class="personal-insights"><section class="insight-panel closest-matches" aria-label="${t('Closest taste matches')}"><span class="eyebrow">${t('PARTICIPANT COMPARISON')}</span><h2>${t('Closest taste matches')}</h2><p class="insight-intro">${t('Participants whose final character order most resembles this result.')}</p>${shown.length ? `<ol class="taste-match-list">${shown.map((item) => `<li data-match-id="${item.id}" data-match-agreement="${item.agreement}"><a href="results.html#${item.id}"><div class="taste-match-person"><strong>${escape(item.username)}</strong><code>${escape(item.resultCode)}</code>${item.provenance ? `<span class="manual-note">${t('Manually added')}</span>` : ''}</div><div class="taste-match-score"><strong>${divergencePercent(item.agreement)}</strong><span>${t('pair-order agreement')}</span></div></a></li>`).join('')}</ol><p class="fine-print insight-note">${t`Other rankings compared: ${matches.length}. This session is excluded; separate sessions sharing a nickname still count.`}</p>` : `<p class="insight-empty" role="status">${matchMessage}</p>`}<details class="insight-details"><summary>${t('How matches are calculated')}</summary><p>${t('Agreement is 100% minus pair-order divergence between two individual rankings. It compares all 136 character pairs, with half weight for ties in only one ranking. Equal scores are tied; tied matches are displayed by date and result code.')}</p>${provenance || matches?.some((item) => item.provenance) ? `<p>${t('Recovered screenshot ratings are included; rounding can affect nearly tied characters.')}</p>` : ''}</details></section><section class="insight-panel preference-consistency" aria-label="${t('Preference consistency')}"><span class="eyebrow">${t('COMPARISON CHOICES')}</span><h2>${t('Preference consistency')}</h2><div class="consistency-pages" role="tablist" aria-label="${t('Preference consistency pages')}"><button type="button" role="tab" id="consistency-summary-tab-${key}" aria-controls="consistency-summary-${key}" aria-selected="${page === 'summary'}" tabindex="${page === 'summary' ? '0' : '-1'}" data-consistency-page="summary">${t('Consistency summary')}</button><button type="button" role="tab" id="consistency-examples-tab-${key}" aria-controls="consistency-examples-${key}" aria-selected="${page === 'examples'}" tabindex="${page === 'examples' ? '0' : '-1'}" data-consistency-page="examples">${t('Circular examples')}</button></div><div id="consistency-summary-${key}" role="tabpanel" aria-labelledby="consistency-summary-tab-${key}" data-consistency-panel="summary" ${page === 'summary' ? '' : 'hidden'}><p class="insight-intro">${t('How often choices among three characters form a consistent order.')}</p>${consistency ? `<div class="consistency-score" data-cyclic-triplets="${consistency.cyclic}" data-transitive-percent="${consistency.transitivePercent}">${divergencePercent(consistency.transitivePercent)}<span>${t('non-circular triplets')}</span></div><div class="consistency-bar" aria-hidden="true"><span style="width:${consistency.transitivePercent}%"></span></div><div class="consistency-counts"><div><strong>${number(consistency.transitive)}</strong><span>${t('Consistent triplets')}</span></div><div><strong>${number(consistency.cyclic)}</strong><span>${t('Circular triplets')}</span></div></div><p class="fine-print insight-note">${t`${number(consistency.cyclic)} of ${number(consistency.triplets)} triplets are circular (${divergencePercent(consistency.cyclicPercent)}).`}</p>` : `<p class="insight-empty">${t('Consistency is unavailable because complete win counts could not be recovered.')}</p>`}<details class="insight-details"><summary>${t('What counts as a circular choice?')}</summary><p>${t('A circular triplet is A beating B, B beating C, and C beating A. There are 680 possible three-character groups. Each remaining group has a consistent order.')}</p><p>${t('Because all 136 pairs are compared once, consistent triplets = sum of wins × (wins − 1) ÷ 2 across characters. Circular triplets = 680 minus that sum. Complete recorded win counts give the exact total; final rating order is not used.')}</p><p>${t('This is a description of recorded choices, not a measure of taste quality. Random independent choices average 75% non-circular triplets; the percentage is not rescaled to a 0–100 skill score.')}</p></details></div><div id="consistency-examples-${key}" class="circular-examples" role="tabpanel" aria-labelledby="consistency-examples-tab-${key}" data-consistency-panel="examples" ${page === 'examples' ? '' : 'hidden'}></div></section></div>`;
}

export function renderPersonalInsights(target, rankings, options = {}) {
  const open = [...target.querySelectorAll('details')].map((detail) => detail.open);
  target.innerHTML = personalInsightsMarkup(rankings, options);
  target.querySelectorAll('details').forEach((detail, index) => { detail.open = open[index] || false; });
  const key = String(options.id ?? 'local').replace(/[^a-z0-9-]/gi, '');
  const selectPage = (page, focus = false) => {
    pages.set(key, page);
    target.querySelectorAll('[data-consistency-page]').forEach((button) => {
      const selected = button.dataset.consistencyPage === page;
      button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    target.querySelectorAll('[data-consistency-panel]').forEach((panel) => { panel.hidden = panel.dataset.consistencyPanel !== page; });
  };
  target.querySelectorAll('[data-consistency-page]').forEach((button) => button.addEventListener('click', () => selectPage(button.dataset.consistencyPage)));
  target.querySelector('.consistency-pages').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const page = event.key === 'Home' ? 'summary' : event.key === 'End' ? 'examples' : target.querySelector('[data-consistency-page="summary"]').getAttribute('aria-selected') === 'true' ? 'examples' : 'summary';
    selectPage(page, true);
  });
  renderCircularExamples(target.querySelector('.circular-examples'), rankings, options);
}
