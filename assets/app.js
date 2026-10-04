import { t, translateError } from './language.js';
import { IMAGES, TOTAL_PAIRS, CATALOG_VERSION, imageUrl } from './catalog.js';
import { MODEL, createQueue, autoShuffle, rankingsFrom, normalizeUsername, validateHistory, validateSubmission, pairKey, summaryFrom } from './ranking.js';
import { renderRanking } from './results-view.js';
import { openCharacter } from './viewer.js';
import { resultCode } from './result-identity.js';
import { manualNote, resultDate } from './result-meta.js';
import { normalizeResults } from './results-data.js';
import { createSaveQueue, OUTBOX_KEY } from './save-queue.js';
const app = document.querySelector('#app');
const STORAGE_KEY = `showcase-session:${CATALOG_VERSION}`;
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const findImage = (id) => IMAGES.find((image) => image.id === id);
let config = { resultsApiUrl: '' };
let session = null, view = 'welcome', tab = 'personal', busy = false, ready = false, renderId = 0;
let saveMessage = '', saveTone = '', saving = false, configError = '', storageWarning = '';
let community = [], communityError = '', communityLoaded = false, communitySelection = null;
let comparisonNote = '';
const outbox = createSaveQueue({
  storage: { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
  send: (payload) => requestJson(apiPath('/results'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
  onChange: updatePendingSaves,
  onSaved: (receipt) => {
    communityLoaded = false;
    if (session?.id === receipt.id) {
      session.published = true; session.completedAt = receipt.completedAt;
      session.commitUrl = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/commit\/[a-f0-9]{40}$/.test(receipt.commitUrl || '') ? receipt.commitUrl : '';
      persist(); saveTone = ''; saveMessage = 'Your ranking has been saved to the repository.';
      announce(translateError(saveMessage));
      if (view === 'results' && tab === 'community') void renderCommunity(true);
    }
  },
});
function updatePendingSaves() {
  const state = outbox.snapshot(), current = state.entries.find((entry) => entry.payload.id === session?.id);
  saving = state.activeId === session?.id;
  if (current) {
    saveTone = current.error ? 'error' : '';
    saveMessage = saving ? 'Saving your completed ranking to the repository…' : current.blocked
      ? 'Saving needs attention. Download a backup and try saving again.'
      : 'Saving is pending. Your ranking is backed up on this device and will retry automatically while the site is open.';
  }
  updateSavePanel();
  const target = document.querySelector('#pending-saves');
  if (!target) return;
  target.innerHTML = state.entries.length ? `<div class="resume-box pending-saves"><p>${t`Pending saves: ${state.entries.length}. Completed rankings stay on this device until the repository confirms saving.`}</p><p class="fine-print">${state.durable ? t('Keep the site open to retry automatically. Returning to this site will resume pending saves.') : t('This browser cannot store the backup queue. Download a backup before closing this tab.')}</p><div class="button-row"><button class="secondary" id="retry-pending" ${!config.resultsApiUrl ? 'disabled' : ''}>${t`Retry pending saves`}</button><button class="secondary" id="download-pending">${t`Download pending backups ↓`}</button></div></div>` : '';
  document.querySelector('#retry-pending')?.addEventListener('click', () => void outbox.retry());
  document.querySelector('#download-pending')?.addEventListener('click', () => downloadJson(state.entries.map(({ payload }) => payload), 'pending-rankings.json'));
}

function announce(message) { document.querySelector('#announcer').textContent = message; }
function focusHeading() { const heading = app.querySelector('h1'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }
function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(session)); storageWarning = ''; }
  catch { storageWarning = 'This browser cannot save progress. Keep this tab open until you finish.'; }
}
function loadSession() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!data || data.catalogVersion !== CATALOG_VERSION || data.model !== MODEL) return null;
    normalizeUsername(data.username);
    validateHistory(data.history);
    if (!/^[0-9a-f-]{36}$/i.test(data.id) || !Array.isArray(data.queue)) return null;
    const seen = new Set(data.history.map(({ winner, loser }) => pairKey(winner, loser)));
    const ids = new Set(IMAGES.map(({ id }) => id));
    for (const pair of data.queue) {
      if (!Array.isArray(pair) || pair.length !== 2 || !ids.has(pair[0]) || !ids.has(pair[1]) || pair[0] === pair[1] || seen.has(pairKey(...pair))) return null;
      seen.add(pairKey(...pair));
    }
    if (seen.size !== TOTAL_PAIRS) return null;
    // Publication is only confirmed by this page's API response, never storage.
    data.published = false;
    return data;
  } catch { return null; }
}
function newId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(25000) });
  let data;
  try { data = await response.json(); } catch { if (response.ok) throw new Error('The results service returned an unreadable response.'); }
  if (!response.ok) {
    const error = new Error(data?.error || `The results service is unavailable (${response.status}). Try again shortly.`);
    error.status = response.status;
    const retry = response.headers.get('Retry-After');
    error.retryAfterMs = retry ? (/^\d+$/.test(retry) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - Date.now())) : 0;
    throw error;
  }
  return data;
}
function apiPath(path) { return `${config.resultsApiUrl.replace(/\/$/, '')}${path}`; }
function submission() {
  return validateSubmission({ id: session.id, username: session.username, model: MODEL, catalogVersion: CATALOG_VERSION, comparisons: session.history });
}
function renderWelcome() {
  view = 'welcome'; ready = false; renderId++;
  const front = IMAGES[0], back = IMAGES[9];
  app.innerHTML = `<div class="welcome view-enter"><section class="welcome-copy"><span class="eyebrow">HIROTONFA’S AMERICAN REVOLUTION SMUGGLER</span><h1>${t`Character`}<br><em>${t`rankings.`}</em></h1><p class="description">${t`Rank the characters in HIROTONFA’s American Revolution Smuggler by comparing their designs in pairs. The collection represents the thirteen colonies that founded the United States, along with Florida, Louisiana, Maine, and Vermont.`}</p><a class="secondary gallery-link" href="gallery.html">${t`View all 17 characters ↗`}</a><form class="welcome-form" id="start-form"><label class="field-label" for="username">${t`Username or nickname`}</label><input id="username" name="username" placeholder="${t`Choose a nickname`}" minlength="2" maxlength="30" required autocomplete="off" spellcheck="false" aria-describedby="username-help username-error"><p id="username-error" class="error form-error" role="alert"></p><button class="primary full-width" type="submit">${t`Start comparing`} <span class="arrow" aria-hidden="true">→</span></button><p class="fine-print" id="username-help">${t`Use a made-up name. No account or email needed.`}<br>${t`Your nickname and finished ranking will be public. Each result has a unique code, so nicknames can be shared.`}</p><details class="privacy-note"><summary>${t`Participation &amp; privacy`}</summary><p>${t`Use a pseudonym to keep your identity out of your ranking. We save your nickname, comparison choices, ratings and completion time publicly. No email, account, IP address or device information is saved with your result. Progress is kept in this browser. The hosting providers still receive ordinary network information when you visit.`}</p></details></form>${session ? `<div class="resume-box"><p>${t`You have ${session.history.length === TOTAL_PAIRS ? t("a completed ranking") : t("an unfinished session")} as`} <strong>${escape(session.username)}</strong> ${t`· ${session.history.length} of ${TOTAL_PAIRS} comparisons.`}</p><button class="secondary" id="resume">${session.history.length === TOTAL_PAIRS ? t("View your results") : t("Continue your session")} <span aria-hidden="true">↗</span></button></div>` : ''}<div id="pending-saves"></div><div class="welcome-stats"><div><span class="stat-value">17</span><span class="stat-label">${t`Characters`}</span></div><div><span class="stat-value">136</span><span class="stat-label">${t`Comparisons`}</span></div><div><span class="stat-value">${t`~10 min`}</span><span class="stat-label">${t`Estimated time`}</span></div></div></section><div class="preview-stage" aria-label="${t`Character artwork by HIROTONFA`}"><div class="preview-card back"><img src="${imageUrl(back)}" alt="${t`${escape(back.name)} character artwork`}"><div class="preview-label"><span>${escape(back.name)}</span><span>10 / 17</span></div></div><div class="preview-card front"><img src="${imageUrl(front)}" alt="${t`${escape(front.name)} character artwork`}"><div class="preview-label"><span>${escape(front.name)}</span><span>01 / 17</span></div></div></div></div><div class="collection-line"><strong>${t`COLONIES & STATES`}</strong><span>${IMAGES.map(({ name }) => escape(name)).join(' · ')}</span></div>`;
  document.querySelector('#start-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const username = normalizeUsername(document.querySelector('#username').value);
      if (session?.history.length === TOTAL_PAIRS && !session.published) outbox.enqueue(submission());
      if (session && session.history.length > 0 && !window.confirm(t("Start a new ranking? This will replace the session saved in this browser. Download any completed ranking first if you want to keep it."))) return;
      session = { id: newId(), username, catalogVersion: CATALOG_VERSION, model: MODEL, queue: createQueue(), history: [], published: false };
      saveMessage = ''; persist(); renderComparison(); focusHeading();
    } catch (error) { document.querySelector('#username-error').textContent = translateError(error.message); }
  });
  updatePendingSaves();
  document.querySelector('#resume')?.addEventListener('click', () => {
    if (session.history.length === TOTAL_PAIRS) { renderResults(); void publish(); } else renderComparison();
    focusHeading();
  });
}
function imageCard(id, side) {
  const image = findImage(id), letter = side === 0 ? 'A' : 'B', key = side === 0 ? '← / 1' : '2 / →';
  return `<article class="image-card"><div class="card-top"><span class="card-letter">${letter}</span><span>${t`CHARACTER ${String(IMAGES.indexOf(image) + 1).padStart(2, '0')} / 17`}</span><button class="zoom-button" data-zoom="${image.id}" aria-label="${t`Enlarge ${escape(image.name)}`}">${t`Enlarge ↗`}</button></div><button class="image-area" data-zoom="${image.id}" aria-label="${t`Enlarge ${escape(image.name)}`}"><img id="comparison-image-${side}" src="${imageUrl(image)}" alt="${t`${escape(image.name)} character artwork`}" draggable="false"></button><div class="card-bottom"><h2 class="card-name">${escape(image.name)}</h2><button class="choose-button" data-choice="${side}" disabled aria-label="${t`Choose ${escape(image.name)}`}">${t`Choose ${letter}`} <kbd>${key}</kbd></button></div></article>`;
}
function waitForImage(img) {
  if (img.complete) return Promise.resolve(img.naturalWidth > 0);
  return new Promise((resolve) => { img.addEventListener('load', () => resolve(true), { once: true }); img.addEventListener('error', () => resolve(false), { once: true }); });
}
async function renderComparison(note = '') {
  comparisonNote = note;
  if (!session.queue.length) { renderResults(); void publish(); return; }
  view = 'compare'; ready = false; busy = false;
  const version = ++renderId, count = session.history.length;
  app.innerHTML = `<section><div class="section-header comparison-header"><div><span class="eyebrow">${t`CHARACTER COMPARISON`}</span><h1>${t`Which design do you prefer?`}</h1><p class="muted">${t`Select one character to record your preference.`}</p></div><span class="user-chip"><span class="status-dot"></span>${escape(session.username)}</span></div><div class="progress-panel"><span class="progress-label"><strong>${count}</strong> ${t`of ${TOTAL_PAIRS} comparisons`} <span aria-hidden="true">·</span> ${Math.round(count / TOTAL_PAIRS * 100)}%</span><label class="locked-shuffle"><input type="checkbox" checked disabled aria-label="${t`Auto-shuffle every three comparisons, always enabled`}"> ${t`Auto-shuffle every 3 comparisons`} <span aria-hidden="true">⌑</span></label><div class="progress-track" role="progressbar" aria-label="${t`Comparisons completed`}" aria-valuemin="0" aria-valuemax="${TOTAL_PAIRS}" aria-valuenow="${count}"><div class="progress-fill" style="width:${count / TOTAL_PAIRS * 100}%"></div></div></div><div class="compare-grid">${imageCard(session.queue[0][0], 0)}<span class="vs-badge" aria-hidden="true">${t`vs.`}</span>${imageCard(session.queue[0][1], 1)}</div><div class="compare-tools"><div class="tool-buttons"><button id="undo" ${count ? '' : 'disabled'}>${t`↶ Undo`} <kbd>${t`Z`}</kbd></button><button id="skip" ${session.queue.length < 2 ? 'disabled' : ''}>${t`Decide later`} <kbd>${t`S`}</kbd></button><button id="pause">${t`Pause`}</button></div><span class="session-hint">${storageWarning ? escape(translateError(storageWarning)) : t("Progress saved on this device.")}</span></div><div id="comparison-notice" class="comparison-live" role="status">${escape(translateError(note))}</div></section>`;
  app.querySelectorAll('[data-choice]').forEach((button) => button.addEventListener('click', () => choose(Number(button.dataset.choice))));
  app.querySelectorAll('[data-zoom]').forEach((button) => button.addEventListener('click', () => zoom(button.dataset.zoom)));
  document.querySelector('#undo').addEventListener('click', undo);
  document.querySelector('#skip').addEventListener('click', skip);
  document.querySelector('#pause').addEventListener('click', renderWelcome);
  const loaded = await Promise.all([0, 1].map((side) => waitForImage(document.querySelector(`#comparison-image-${side}`))));
  if (version !== renderId || view !== 'compare') return;
  if (loaded.some((ok) => !ok)) {
    document.querySelector('#comparison-notice').classList.add('error');
    document.querySelector('#comparison-notice').textContent = t("A character image could not load. Check your connection and reload the page; your progress is saved.");
    return;
  }
  ready = true; app.querySelectorAll('[data-choice]').forEach((button) => { button.disabled = false; });
}
function choose(side) {
  if (view !== 'compare' || !ready || busy || document.querySelector('dialog[open]')) return;
  busy = true; ready = false;
  const pair = session.queue.shift();
  session.history.push({ winner: pair[side], loser: pair[1 - side], left: pair[0], right: pair[1] });
  const shuffle = session.history.length % 3 === 0;
  if (shuffle) session.queue = autoShuffle(session.queue, session.history);
  persist();
  if (!session.queue.length) { session.completedAt = new Date().toISOString(); persist(); tab = 'personal'; renderResults(); focusHeading(); void publish(); }
  else { void renderComparison(shuffle ? 'Remaining pairs reshuffled automatically.' : ''); announce(t`Choice saved. ${session.history.length} of ${TOTAL_PAIRS} complete.`); }
}
function undo() {
  if (view !== 'compare' || !session.history.length || busy) return;
  const last = session.history.pop();
  session.queue.unshift([last.left || last.winner, last.right || last.loser]);
  persist(); void renderComparison('Last choice undone.');
}
function skip() {
  if (view !== 'compare' || !ready || busy || session.queue.length < 2) return;
  session.queue.push(session.queue.shift()); persist(); void renderComparison('Pair moved to the end of the remaining comparisons.');
}
function zoom(id) {
  openCharacter(findImage(id));
}

function updateSavePanel() {
  const target = document.querySelector('#save-panel'); if (!target) return;
  target.innerHTML = `<p class="${saveTone === 'error' ? 'error' : 'save-status'}" role="status">${escape(translateError(saveMessage || 'Your ranking is ready.'))}</p>${outbox.snapshot().entries.find((entry) => entry.payload.id === session.id)?.error ? `<p class="fine-print">${escape(translateError(outbox.snapshot().entries.find((entry) => entry.payload.id === session.id).error))}</p>` : ''}${!outbox.snapshot().durable ? `<p class="error">${t`This browser cannot store the backup queue. Download a backup before closing this tab.`}</p>` : ''}<div class="button-row">${!session.published && config.resultsApiUrl ? `<button class="secondary" id="retry-save" ${saving ? 'disabled' : ''}>${saving ? t("Saving…") : t("Save to repository")}</button>` : ''}<button class="secondary" id="download">${t`Download your results ↓`}</button>${session.published && session.commitUrl ? `<a class="text-button" href="${escape(session.commitUrl)}" target="_blank" rel="noopener noreferrer">${t`View saved commit ↗`}</a>` : ''}</div>`;
  document.querySelector('#retry-save')?.addEventListener('click', () => void publish());
  document.querySelector('#download').addEventListener('click', download);
}
function renderResults() {
  view = 'results'; ready = false; busy = false; renderId++;
  const ratings = rankingsFrom(session.history);
  app.innerHTML = `<section class="view-enter"><div class="section-header"><div><div class="results-top"><span class="success-icon" aria-hidden="true">✓</span><span class="eyebrow" style="margin:0">${t`${TOTAL_PAIRS} COMPARISONS COMPLETED`}</span></div><h1>${t`Your character ranking.`}</h1><p class="muted">${t`All 17 characters, ranked by ${escape(session.username)}.`}</p><p class="result-code">${t`Result code`} <code>${resultCode(session.id)}</code></p></div><button id="home" class="secondary">${t`Back to start ↗`}</button></div><div id="save-panel" class="save-panel"></div><div id="pending-saves"></div><div class="tabs" role="tablist" aria-label="${t`Results`}"><button class="tab" id="personal-tab" role="tab" aria-controls="results-content" aria-selected="${tab === 'personal'}">${t`Your ranking`}</button><button class="tab" id="community-tab" role="tab" aria-controls="results-content" aria-selected="${tab === 'community'}">${t`Other rankings`} <span aria-hidden="true">↗</span></button></div><div id="results-content" role="tabpanel" aria-labelledby="${tab}-tab"></div></section>`;
  document.querySelector('#home').addEventListener('click', renderWelcome);
  for (const value of ['personal', 'community']) document.querySelector(`#${value}-tab`).addEventListener('click', () => { tab = value; communitySelection = null; renderResults(); document.querySelector(`#${value}-tab`).focus(); });
  const tabs = app.querySelector('[role="tablist"]');
  tabs.addEventListener('keydown', (event) => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); tab = event.key === 'Home' ? 'personal' : event.key === 'End' ? 'community' : tab === 'personal' ? 'community' : 'personal'; renderResults(); document.querySelector(`#${tab}-tab`).focus(); } });
  updatePendingSaves();
  if (tab === 'personal') renderRanking(document.querySelector('#results-content'), ratings, t('Your ranking'));
  else void renderCommunity();
}

async function loadCommunity() {
  communityError = '';
  try {
    const payload = await requestJson(config.resultsApiUrl ? apiPath('/results') : new URL('../results/index.json', import.meta.url).href, { cache: 'no-store' });
    if (!Array.isArray(payload)) throw new Error('The shared results index is invalid.');
    community = normalizeResults(payload);
    communityLoaded = true;
  } catch (error) { communityError = error.message; communityLoaded = false; }
}
async function renderCommunity(refresh = false) {
  const version = renderId;
  const target = document.querySelector('#results-content');
  if (!communityLoaded || refresh) {
    target.innerHTML = `<div class="empty-state"><p>${t`Loading other rankings…`}</p></div>`;
    await loadCommunity();
  }
  if (view !== 'results' || tab !== 'community' || version !== renderId) return;
  const others = community.filter((item) => item.id !== session.id);
  target.innerHTML = `<div class="community-header"><div><h2>${t`Other rankings.`}</h2><a class="text-button" href="results.html">${t`Browse all results ↗`}</a><p>${t`${others.length} completed ${others.length === 1 ? 'ranking' : 'rankings'} · Select a participant to view their ranking and forest plot.`}</p></div><button class="secondary" id="refresh-results">${t`Refresh ↻`}</button></div>${communityError ? `<div class="empty-state"><h3>${t`Results could not load.`}</h3><p class="error">${escape(translateError(communityError))}</p></div>` : others.length ? `<div class="participant-list">${others.map((item, index) => `<button class="participant" data-participant="${index}"><span class="participant-name">${escape(item.username)}</span><span class="result-code">${t`Result code`} <code>${resultCode(item.id)}</code></span><span class="participant-meta">${t`${resultDate(item)} · ${TOTAL_PAIRS} comparisons`}</span>${manualNote(item)}<span class="participant-winner"><span>${t`Top character: ${escape(item.rankings[0].name)}`}</span><span aria-hidden="true">↗</span></span></button>`).join('')}</div>` : `<div class="empty-state"><h3>${t`No shared rankings yet`}</h3><p>${t`No other completed rankings yet.${session.published ? t(" Yours is the first saved ranking.") : t(" Shared rankings will appear here once participants save them.")}`}</p></div>`}`;
  document.querySelector('#refresh-results').addEventListener('click', () => void renderCommunity(true));
  target.querySelectorAll('[data-participant]').forEach((button) => button.addEventListener('click', () => {
    communitySelection = others[Number(button.dataset.participant)];
    renderCommunitySelection();
  }));
  if (communitySelection) renderCommunitySelection();
}
function renderCommunitySelection() {
  const item = communitySelection, target = document.querySelector('#results-content');
  target.innerHTML = `<div class="detail-header"><div><h2>${t`${escape(item.username)}’s ranking`}</h2><p class="result-code">${t`Result code`} <code>${resultCode(item.id)}</code></p><p>${t`${resultDate(item)} · ${TOTAL_PAIRS} comparisons`}</p>${manualNote(item)}</div><button class="secondary" id="back-to-list">${t`← All results`}</button></div><div id="participant-ranking"></div>`;
  renderRanking(document.querySelector('#participant-ranking'), item.rankings, t`${item.username}’s ranking`, item);
  document.querySelector('#back-to-list').addEventListener('click', () => { communitySelection = null; void renderCommunity(); });
}

async function publish() {
  if (session.published || session.history.length !== TOTAL_PAIRS) return;
  outbox.enqueue(submission());
  if (!config.resultsApiUrl) {
    saveTone = 'error'; saveMessage = configError || 'Shared saving is not configured yet. Your result is saved on this device; download a copy below. The site owner needs to connect the results service before rankings can be saved to GitHub.'; updateSavePanel(); return;
  }
  outbox.start(); await outbox.retry(session.id);
}
function downloadJson(data, filename) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob), anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function download() {
  const body = submission();
  const data = { ...body, ...summaryFrom(body, session.completedAt || new Date().toISOString()), publication: session.published ? 'confirmed' : 'not-confirmed' };
  downloadJson(data, `american-revolution-smuggler-ranking-${session.id}.json`);
}
document.addEventListener('keydown', (event) => {
  if (view !== 'compare' || event.repeat || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('dialog[open]') || /INPUT|TEXTAREA|SELECT|BUTTON/.test(event.target.tagName)) return;
  if (['ArrowLeft', '1', 'ArrowRight', '2', 'z', 'Z', 's', 'S'].includes(event.key)) event.preventDefault();
  if (['ArrowLeft', '1'].includes(event.key)) choose(0);
  if (['ArrowRight', '2'].includes(event.key)) choose(1);
  if (['z', 'Z'].includes(event.key)) undo();
  if (['s', 'S'].includes(event.key)) skip();
});
try {
  const response = await fetch(new URL('../config.json', import.meta.url), { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Could not load site configuration.');
  const data = await response.json();
  if (data.resultsApiUrl) {
    const url = new URL(data.resultsApiUrl);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('The results service must use HTTPS.');
    if (url.username || url.password || url.search || url.hash) throw new Error('The results service URL is invalid.');
    config.resultsApiUrl = url.href.replace(/\/$/, '');
  }
} catch (error) { configError = `${error.message} Your ranking can still be downloaded, but shared saving is unavailable.`; }
session = loadSession();
if (session?.history.length === TOTAL_PAIRS) outbox.enqueue(submission());
renderWelcome();
if (config.resultsApiUrl) outbox.start();
window.addEventListener('online', () => { if (config.resultsApiUrl) void outbox.wake(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && config.resultsApiUrl) void outbox.wake(); });
window.addEventListener('storage', (event) => { if (event.key === OUTBOX_KEY) outbox.refresh(); });

window.addEventListener('languagechange', () => {
  const username = document.querySelector('#username')?.value;
  const openDetails = [...app.querySelectorAll('details')].map((detail) => detail.open);
  if (view === 'welcome') {
    renderWelcome();
    document.querySelector('#username').value = username || '';
  } else if (view === 'compare') void renderComparison(comparisonNote);
  else renderResults();
  app.querySelectorAll('details').forEach((detail, index) => { detail.open = openDetails[index] || false; });
});
