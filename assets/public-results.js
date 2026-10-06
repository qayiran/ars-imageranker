import { t, locale, translateError } from './language.js';
import { IMAGES, imageUrl } from './catalog.js';
import { loadPublicResults } from './results-data.js';
import { renderRanking } from './results-view.js';
import { manualNote, resultDate } from './result-meta.js';
import { buildLeaderboard } from './leaderboard.js';
import { renderLeaderboard } from './leaderboard-view.js';
import { rankDivergence } from './rank-divergence.js';
import { divergencePercent } from './rank-divergence-view.js';
import { preferenceConsistency } from './community-insights.js';
import { renderCommunityInsights } from './community-insights-view.js';
const root = document.querySelector('#results-browser');
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let participants = [], sharedLoaded = false;
let sharedError = '', query = '', order = 'newest', refreshId = 0;
let participantBoard = buildLeaderboard([]);
let divergences = new Map();
function filtered(items) {
  const search = query.trim().toLocaleLowerCase(locale());
  return items.filter((item) => !search || `${item.username} ${item.resultCode} ${item.rankings[0].name}`.toLocaleLowerCase(locale()).includes(search))
    .sort((a, b) => {
      if (order === 'name') return a.username.localeCompare(b.username);
      if (order === 'divergent' || order === 'similar') {
        const first = divergences.get(a.id)?.percent, second = divergences.get(b.id)?.percent;
        if (first == null && second != null) return 1;
        if (second == null && first != null) return -1;
        if (first != null && second != null && first !== second) return order === 'divergent' ? second - first : first - second;
      }
      return b.completedAt.localeCompare(a.completedAt) || a.username.localeCompare(b.username);
    });
}
function card(item) {
  const winner = item.rankings[0], artwork = IMAGES.find(({ id }) => id === winner.id);
  const divergence = divergences.get(item.id);
  const consistency = item.provenance ? null : preferenceConsistency(item.rankings);
  const divergenceLabel = divergence?.status === 'ready' ? t`${divergencePercent(divergence.percent)} divergence` : t('Global comparison needs another ranking');
  return `<a class="result-card" href="#${encodeURIComponent(item.id)}" aria-label="${t`View ${escape(item.username)} ranking, result code ${item.resultCode}`}"><div class="result-card-header"><span class="participant-name">${escape(item.username)}</span><span class="result-arrow" aria-hidden="true">↗</span></div><p class="result-code">${t`Result code`} <code>${item.resultCode}</code></p><p class="participant-meta">${t`${escape(resultDate(item))} · ${item.comparisonCount} comparisons`}</p>${manualNote(item)}<div class="result-card-winner"><img src="${imageUrl(artwork)}" alt="${t`${escape(winner.name)} character artwork`}" loading="lazy"><div><span class="result-card-label">${t`TOP CHARACTER`}</span><h3>${escape(winner.name)}</h3><span class="result-card-score">${t`${Math.round(winner.elo)} rating`}</span></div></div><ol class="result-top-three">${item.rankings.slice(0, 3).map((row) => `<li><span>${escape(row.name)}</span><span>${Math.round(row.elo)}</span></li>`).join('')}</ol><p class="result-card-consistency" data-card-consistency="${consistency?.transitivePercent ?? ''}" title="${consistency ? t('non-circular triplets') : t('Consistency is unavailable because complete win counts could not be recovered.')}">${t('Preference consistency')}: ${consistency ? divergencePercent(consistency.transitivePercent) : t('Unavailable')}</p><p class="result-card-divergence" data-card-divergence="${divergence?.percent ?? ''}">${divergenceLabel}</p><span class="result-card-link">${t`View ranking & forest plot`} <span aria-hidden="true">→</span></span></a>`;
}
function renderGlobalLeaderboard() {
  const target = document.querySelector('#global-leaderboard');
  if (!target) return;
  target.innerHTML = `<div class="leaderboard-header"><div><h2 id="global-leaderboard-title">${t`Global leaderboard`}</h2><p>${t`Combined colony/state scores, with equal weight for each completed ranking.`}</p></div></div><div id="leaderboard-content"></div>`;
  const content = document.querySelector('#leaderboard-content');
  if (sharedError) content.innerHTML = `<div class="empty-state"><h3>${t`Leaderboard unavailable`}</h3><p>${t`Participant results could not be loaded. ${escape(translateError(sharedError))}`}</p></div>`;
  else if (!sharedLoaded) content.innerHTML = `<p class="muted" role="status">${t`Loading leaderboard…`}</p>`;
  else if (!participantBoard.sessionCount) content.innerHTML = `<div class="empty-state"><h3>${t`No participant scores yet`}</h3><p>${t`The global leaderboard will combine completed rankings as they are saved.`}</p></div>`;
  else renderLeaderboard(content, participantBoard);
  const insights = document.querySelector('#community-insights');
  if (insights) {
    if (sharedLoaded && !sharedError) renderCommunityInsights(insights, participants);
    else insights.innerHTML = '';
  }
}
function renderPanels() {
  // Search/sorting only affect individual cards, so leave the global view intact.
  const target = document.querySelector('#public-result-panels');
  if (!target) return;
  const real = filtered(participants);
  target.innerHTML = `<section class="public-result-section" aria-labelledby="participant-results-title"><div class="community-header"><div><h2 id="participant-results-title">${t`Participant rankings`}</h2><p>${t`${participants.length} saved ${participants.length === 1 ? 'ranking' : 'rankings'} · Every result has a unique code; nicknames can be shared.`}</p></div></div>${sharedError ? `<div class="results-error" role="alert"><p>${t`Participant results could not be loaded. ${escape(translateError(sharedError))}`}</p><button class="secondary" id="retry-public-results">${t`Retry`}</button></div>` : !sharedLoaded ? `<p class="muted" role="status">${t`Loading participant results…`}</p>` : real.length ? `<div class="public-result-grid">${real.map(card).join('')}</div>` : `<div class="empty-state"><h3>${query ? t("No matching participant rankings") : t("No participant rankings yet")}</h3><p>${query ? t("Try a different nickname, result code or character name.") : t("Completed rankings will appear here after they are saved to the repository.")}</p></div>`}</section>`;
  document.querySelector('#retry-public-results')?.addEventListener('click', refreshParticipants);
}
function renderList() {
  root.innerHTML = `<section id="global-leaderboard" class="global-leaderboard" aria-labelledby="global-leaderboard-title"></section><div id="community-insights"></div><div class="results-toolbar"><label class="result-search"><span class="field-label">${t`Find a ranking`}</span><input id="results-search" type="search" placeholder="${t`Search nickname, result code or top character`}" value="${escape(query)}" autocomplete="off"></label><label class="result-sort"><span class="field-label">${t`Sort by`}</span><select id="results-sort"><option value="newest" ${order === 'newest' ? 'selected' : ''}>${t`Newest first`}</option><option value="name" ${order === 'name' ? 'selected' : ''}>${t`Name A–Z`}</option><option value="divergent" ${order === 'divergent' ? 'selected' : ''}>${t`Most divergent first`}</option><option value="similar" ${order === 'similar' ? 'selected' : ''}>${t`Most similar first`}</option></select></label><button class="secondary" id="refresh-public-results" ${sharedLoaded ? '' : 'disabled'}>${t`Refresh ↻`}</button></div><div id="public-result-panels"></div>`;
  document.querySelector('#results-search').addEventListener('input', (event) => { query = event.target.value; renderPanels(); });
  document.querySelector('#results-sort').addEventListener('change', (event) => { order = event.target.value; renderPanels(); });
  document.querySelector('#refresh-public-results').addEventListener('click', refreshParticipants);
  renderGlobalLeaderboard();
  renderPanels();
}
function renderSelection() {
  const id = location.hash.slice(1);
  if (!id || id === 'leaderboard') { renderList(); return; }
  const item = participants.find((result) => result.id === id);
  if (!item) {
    if (!sharedLoaded) root.innerHTML = `<p class="muted" role="status">${t`Loading the requested ranking…`}</p>`;
    else root.innerHTML = `<div class="empty-state"><h3>${t`Ranking not found`}</h3><p>${t`This link does not match an available result.`}</p><a class="text-button" href="#">${t`Browse all results`}</a></div>`;
    return;
  }
  root.innerHTML = `<a class="text-button all-results-link" href="#">${t`← All results`}</a><div class="detail-header"><div><h2>${t`${escape(item.username)}’s ranking`}</h2><p class="result-code">${t`Result code`} <code>${item.resultCode}</code></p><p>${t`${escape(resultDate(item))} · ${item.comparisonCount} comparisons`}</p>${manualNote(item)}</div></div><div id="public-ranking-detail"></div>`;
  renderRanking(document.querySelector('#public-ranking-detail'), item.rankings, t`${item.username}’s ranking, result code ${item.resultCode}`, { ...item, participants,
    comparisonStatus: !sharedLoaded ? 'loading' : sharedError ? 'error' : 'ready', onRetry: refreshParticipants });
}
function updateView() {
  if (location.hash && location.hash !== '#leaderboard') renderSelection();
  else if (document.querySelector('#public-result-panels')) {
    renderGlobalLeaderboard();
    renderPanels();
    const refresh = document.querySelector('#refresh-public-results'); if (refresh) refresh.disabled = !sharedLoaded;
  } else renderList();
}
async function refreshParticipants() {
  const revision = ++refreshId;
  sharedLoaded = false; sharedError = ''; updateView();
  try { const data = await loadPublicResults(); if (revision !== refreshId) return; participants = data; participantBoard = buildLeaderboard(data);
    divergences = new Map(data.map((item) => [item.id, rankDivergence(item.rankings, data, item)])); }
  catch (error) { if (revision !== refreshId) return; participants = []; participantBoard = buildLeaderboard([]); divergences = new Map(); sharedError = error.message; }
  sharedLoaded = true; updateView();
}
window.addEventListener('hashchange', () => {
  renderSelection();
  const heading = root.querySelector('h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  root.scrollIntoView({ block: 'start' });
});
renderSelection();
void refreshParticipants();

window.addEventListener('languagechange', () => {
  const openDetails = [...root.querySelectorAll('details')].map((detail) => detail.open);
  renderSelection();
  root.querySelectorAll('details').forEach((detail, index) => { detail.open = openDetails[index] || false; });
});
