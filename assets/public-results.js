import { IMAGES, imageUrl } from './catalog.js';
import { loadPublicResults } from './results-data.js';
import { renderRanking } from './results-view.js';
import { buildLeaderboard } from './leaderboard.js';
import { renderLeaderboard } from './leaderboard-view.js';
const root = document.querySelector('#results-browser');
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let participants = [], sharedLoaded = false;
let sharedError = '', query = '', order = 'newest', refreshId = 0;
let participantBoard = buildLeaderboard([]);
function dateLabel(date) { return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
function filtered(items) {
  const search = query.trim().toLocaleLowerCase();
  return items.filter((item) => !search || `${item.username} ${item.resultCode} ${item.rankings[0].name}`.toLocaleLowerCase().includes(search))
    .sort(order === 'name' ? (a, b) => a.username.localeCompare(b.username) : (a, b) => b.completedAt.localeCompare(a.completedAt) || a.username.localeCompare(b.username));
}
function card(item) {
  const winner = item.rankings[0], artwork = IMAGES.find(({ id }) => id === winner.id);
  return `<a class="result-card" href="#${encodeURIComponent(item.id)}" aria-label="View ${escape(item.username)} ranking, result code ${item.resultCode}"><div class="result-card-header"><span class="participant-name">${escape(item.username)}</span><span class="result-arrow" aria-hidden="true">↗</span></div><p class="result-code">Result code <code>${item.resultCode}</code></p><p class="participant-meta">${escape(dateLabel(item.completedAt))} · ${item.comparisonCount} comparisons</p><div class="result-card-winner"><img src="${imageUrl(artwork)}" alt="${escape(winner.name)} character artwork" loading="lazy"><div><span class="result-card-label">TOP CHARACTER</span><h3>${escape(winner.name)}</h3><span class="result-card-score">${Math.round(winner.elo)} rating</span></div></div><ol class="result-top-three">${item.rankings.slice(0, 3).map((row) => `<li><span>${escape(row.name)}</span><span>${Math.round(row.elo)}</span></li>`).join('')}</ol><span class="result-card-link">View ranking & forest plot <span aria-hidden="true">→</span></span></a>`;
}
function renderGlobalLeaderboard() {
  const target = document.querySelector('#global-leaderboard');
  if (!target) return;
  target.innerHTML = `<div class="leaderboard-header"><div><h2 id="global-leaderboard-title">Global leaderboard</h2><p>Combined colony/state scores, with equal weight for each completed ranking.</p></div></div><div id="leaderboard-content"></div>`;
  const content = document.querySelector('#leaderboard-content');
  if (sharedError) content.innerHTML = `<div class="empty-state"><h3>Leaderboard unavailable</h3><p>Participant results could not be loaded. ${escape(sharedError)}</p></div>`;
  else if (!sharedLoaded) content.innerHTML = '<p class="muted" role="status">Loading leaderboard…</p>';
  else if (!participantBoard.sessionCount) content.innerHTML = '<div class="empty-state"><h3>No participant scores yet</h3><p>The global leaderboard will combine completed rankings as they are saved.</p></div>';
  else renderLeaderboard(content, participantBoard);
}
function renderPanels() {
  // Search/sorting only affect individual cards, so leave the global view intact.
  const target = document.querySelector('#public-result-panels');
  if (!target) return;
  const real = filtered(participants);
  target.innerHTML = `<section class="public-result-section" aria-labelledby="participant-results-title"><div class="community-header"><div><h2 id="participant-results-title">Participant rankings</h2><p>${participants.length} saved ${participants.length === 1 ? 'ranking' : 'rankings'} · Every result has a unique code; nicknames can be shared.</p></div></div>${sharedError ? `<div class="results-error" role="alert"><p>Participant results could not be loaded. ${escape(sharedError)}</p><button class="secondary" id="retry-public-results">Retry</button></div>` : !sharedLoaded ? '<p class="muted" role="status">Loading participant results…</p>' : real.length ? `<div class="public-result-grid">${real.map(card).join('')}</div>` : `<div class="empty-state"><h3>${query ? 'No matching participant rankings' : 'No participant rankings yet'}</h3><p>${query ? 'Try a different nickname, result code or character name.' : 'Completed rankings will appear here after they are saved to the repository.'}</p></div>`}</section>`;
  document.querySelector('#retry-public-results')?.addEventListener('click', refreshParticipants);
}
function renderList() {
  root.innerHTML = `<section id="global-leaderboard" class="global-leaderboard" aria-labelledby="global-leaderboard-title"></section><div class="results-toolbar"><label class="result-search"><span class="field-label">Find a ranking</span><input id="results-search" type="search" placeholder="Search nickname, result code or top character" value="${escape(query)}" autocomplete="off"></label><label class="result-sort"><span class="field-label">Sort by</span><select id="results-sort"><option value="newest" ${order === 'newest' ? 'selected' : ''}>Newest first</option><option value="name" ${order === 'name' ? 'selected' : ''}>Name A–Z</option></select></label><button class="secondary" id="refresh-public-results" ${sharedLoaded ? '' : 'disabled'}>Refresh ↻</button></div><div id="public-result-panels"></div>`;
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
    if (!sharedLoaded) root.innerHTML = '<p class="muted" role="status">Loading the requested ranking…</p>';
    else root.innerHTML = '<div class="empty-state"><h3>Ranking not found</h3><p>This link does not match an available result.</p><a class="text-button" href="#">Browse all results</a></div>';
    return;
  }
  root.innerHTML = `<a class="text-button all-results-link" href="#">← All results</a><div class="detail-header"><div><h2>${escape(item.username)}’s ranking</h2><p class="result-code">Result code <code>${item.resultCode}</code></p><p>${escape(dateLabel(item.completedAt))} · ${item.comparisonCount} comparisons</p></div></div><div id="public-ranking-detail"></div>`;
  renderRanking(document.querySelector('#public-ranking-detail'), item.rankings, `${item.username}’s ranking, result code ${item.resultCode}`);
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
  try { const data = await loadPublicResults(); if (revision !== refreshId) return; participants = data; participantBoard = buildLeaderboard(data); }
  catch (error) { if (revision !== refreshId) return; participants = []; participantBoard = buildLeaderboard([]); sharedError = error.message; }
  sharedLoaded = true; updateView();
}
window.addEventListener('hashchange', () => {
  renderSelection();
  const heading = root.querySelector('h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  root.scrollIntoView({ block: 'start' });
});
renderSelection();
void refreshParticipants();
