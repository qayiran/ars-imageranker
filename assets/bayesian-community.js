import { loadResultRecord } from './results-data.js';
import { cohortKey, sessionFromRecord, validCommunityResult } from './bayesian-community-data.js';
import { renderBayesianCommunity } from './bayesian-community-view.js';
const STORAGE_KEY = 'ars-bayesian-community-v1';
let fitAttempt = 0;
let key = '', generation = 0, worker = null, timer = null, current = [];
let state = { status: 'empty', manualCount: 0 };
const histories = new Map();
function render() { const target = document.querySelector('#bayesian-community'); if (target) renderBayesianCommunity(target, state, () => void start(true)); }
function maybeStart() {
  if (state.status === 'idle' && document.querySelector('#bayesian-community')?.closest('details')?.open) void start();
}
function stop() { worker?.terminate(); worker = null; clearTimeout(timer); timer = null; }
export function setBayesianCohort(participants) {
  const next = cohortKey(participants);
  current = participants.filter(item => !item.provenance).sort((a, b) => a.id.localeCompare(b.id));
  const manualCount = participants.length - current.length;
  if (next !== key) { key = next; fitAttempt = 0; generation++; stop(); state = { status: 'idle', manualCount }; }
  else state.manualCount = manualCount;
  // Load histories and fit only after the user expands the forest plot.
  render(); maybeStart();
}
export function showBayesianCommunity() {
  render();
  const disclosure = document.querySelector('#bayesian-community')?.closest('details');
  if (disclosure && !disclosure.dataset.bayesianBound) {
    disclosure.dataset.bayesianBound = 'true';
    disclosure.addEventListener('toggle', () => { if (disclosure.isConnected && disclosure.open) maybeStart(); });
  }
  maybeStart();
}
export function suspendBayesianCommunity() { generation++; stop(); key = ''; state = { status: 'empty', manualCount: 0 }; render(); }
async function start(force = false) {
  const retryConvergence = state.status === 'unconverged';
  if (retryConvergence) fitAttempt++;
  const run = ++generation; stop();
  const expectedKey = key, participants = [...current], manualCount = state.manualCount;
  if (participants.length < 2) { state = { status: 'empty', manualCount }; render(); return; }
  if (!force) {
    try { const cached = JSON.parse(localStorage.getItem(STORAGE_KEY)); if (cached?.key === expectedKey && validCommunityResult(cached.result, participants.length)) { state = { status: 'ready', result: cached.result, manualCount }; render(); return; } } catch { /* Recompute if storage is disabled or damaged. */ }
  }
  state = { status: 'loading', loaded: 0, total: participants.length, manualCount }; render();
  try {
    const sessions = [], pending = [...participants];
    await Promise.all(Array.from({ length: Math.min(3, pending.length) }, async () => {
      while (pending.length && run === generation) {
        const item = pending.shift(), fingerprint = cohortKey([item]);
        let session = histories.get(fingerprint);
        if (!session) { session = sessionFromRecord(await loadResultRecord(item.id), item); if (run !== generation) return; histories.set(fingerprint, session); }
        sessions.push(session);
        if (run === generation) { state.loaded = sessions.length; render(); }
      }
    }));
    if (run !== generation) return;
    state = { status: 'fitting', progress: null, manualCount }; render();
    worker = new Worker(new URL('./community-model-worker.js', import.meta.url), { type: 'module' });
    const fail = status => { if (run !== generation) return; generation++; stop(); state = { status, manualCount }; render(); };
    worker.onerror = () => fail('error');
    // Bound a stalled worker without blocking navigation or the existing leaderboard.
    timer = setTimeout(() => fail('error'), 180000);
    worker.onmessage = ({ data }) => {
      if (run !== generation) return;
      if (data.type === 'progress') { state.progress = data.progress; render(); }
      else if (data.type === 'result') {
        stop();
        if (!validCommunityResult(data.result, participants.length)) { state = { status: data.result?.converged === false ? 'unconverged' : 'error', manualCount }; render(); return; }
        state = { status: 'ready', result: data.result, manualCount };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: expectedKey, result: data.result })); } catch { /* A result remains usable without caching. */ }
        render();
      } else fail('error');
    };
    worker.postMessage({ sessions, seed: 17341 + fitAttempt });
  } catch { if (run !== generation) return; generation++; stop(); state = { status: 'error', manualCount }; render(); }
}
