import { circularPreferenceExamples, loadRecordedChoices } from './taste-insights.js';
import { thumbnail, bindResultImages } from './result-images.js';
import { t } from './language.js';
const states = new WeakMap(), cache = new Map(), pending = new Map(), positions = new Map(), failed = new Set();

async function finishLoading(state, rankings, options, request) {
  const key = options.id?.toLowerCase();
  try { state.cycles = await request; cache.set(key, state.cycles); state.error = false; failed.delete(key); }
  catch { state.error = true; failed.add(key); }
  finally { if (pending.get(key) === request) pending.delete(key); }
  state.loading = false;
  if (state.node?.isConnected) renderCycles(state.node, rankings, options, state);
}

function renderCycles(target, rankings, options, state) {
  state.node = target;
  const cycles = state.cycles, cycle = cycles?.[state.index];
  target.innerHTML = `<h3 class="cycle-page-title">${t('Circular preference examples')}</h3><p class="insight-intro">${t('Three recorded choices that form a loop: A over B, B over C, and C over A.')}</p>${options.provenance ? `<p class="insight-empty">${t('Examples are unavailable for screenshot-recovered results because the comparison choices were not recovered.')}</p>` : cycles ? cycle ? `<div class="cycle-triangle" data-cycle-ids="${cycle.map(({ id }) => id).join('|')}"><svg viewBox="0 0 400 280" aria-hidden="true"><path d="M160 85 L108 166 M123 219 L277 219 M292 166 L240 85" class="cycle-path"></path><path d="M108 166 l2 -13 m-2 13 l12 -5 M277 219 l-11 -6 m11 6 l-11 6 M240 85 l-2 13 m2 -13 l12 5" class="cycle-arrow"></path></svg>${cycle.map((row, i) => `<div class="cycle-character cycle-position-${i}">${thumbnail(row.id, row.name, { className: 'cycle-art' })}<a href="character.html#${row.id}">${row.name}</a></div>`).join('')}</div><ol class="cycle-choices">${cycle.map((row, i) => `<li>${t`Chose ${row.name} over ${cycle[(i + 1) % 3].name}`}</li>`).join('')}</ol><div class="cycle-navigation"><button class="secondary" data-cycle-previous ${state.index === 0 ? 'disabled' : ''} aria-label="${t('Previous circular example')}">←</button><span role="status">${t`Example ${state.index + 1} of ${cycles.length}`}</span><button class="secondary" data-cycle-next ${state.index === cycles.length - 1 ? 'disabled' : ''} aria-label="${t('Next circular example')}">→</button></div>` : `<p class="insight-empty">${t('No circular triplets were found in the recorded choices.')}</p>` : `<p class="fine-print" role="status">${state.loading ? t('Loading recorded choices…') : state.error ? t('Recorded choices could not be loaded. A newly saved result may become available after the next site update. Try again later.') : t('Recorded choices are unavailable for this result.')}</p>${state.error ? `<button class="secondary" data-retry-cycles>${t('Retry')}</button>` : ''}`}<p class="fine-print insight-note">${t('These examples use recorded comparisons, not the final rating order. Circular preferences are possible and are not treated as errors.')}</p>`;
  bindResultImages(target, rankings);
  for (const [selector, change] of [['[data-cycle-previous]', -1], ['[data-cycle-next]', 1]]) target.querySelector(selector)?.addEventListener('click', () => {
    state.index += change; positions.set(options.id?.toLowerCase(), state.index); renderCycles(target, rankings, options, state); target.querySelector(selector)?.focus();
  });
  target.querySelector('[data-retry-cycles]')?.addEventListener('click', () => startLoading(state, rankings, options));
}

function startLoading(state, rankings, options) {
  state.loading = true; state.error = false;
  renderCycles(state.node, rankings, options, state);
  const key = options.id?.toLowerCase(), request = pending.get(key) ?? loadRecordedChoices(options.id, rankings);
  pending.set(key, request);
  void finishLoading(state, rankings, options, request);
}

export function renderCircularExamples(target, rankings, options = {}) {
  const key = options.id?.toLowerCase(), previous = states.get(target);
  const local = !options.provenance && options.history ? circularPreferenceExamples(options.history, rankings) : null;
  const state = previous && previous.id === options.id ? previous : { id: options.id, index: positions.get(key) ?? 0,
    loading: false, error: failed.has(key), cycles: options.provenance ? null : local ?? cache.get(key) ?? null };
  if (local) { state.cycles = local; state.error = false; }
  states.set(target, state);
  const request = !options.provenance && pending.get(key);
  if (request && !state.cycles) state.loading = true;
  renderCycles(target, rankings, options, state);
  if (request && !state.cycles) void finishLoading(state, rankings, options, request);
  else if (!options.provenance && options.id && !state.cycles && !state.loading && !state.error) startLoading(state, rankings, options);
}
