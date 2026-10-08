import { t, locale } from './language.js';
import { IMAGES } from './catalog.js';
import { forestPlot } from './forest.js';
const score = x => x.toLocaleString(locale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const percent = x => (100 * x).toLocaleString(locale(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }) + '%';
function methods(result) {
  return `<details class="bayesian-method"><summary>${t('About the Bayesian model')}</summary><p>${t('Each recorded choice contributes to a shared character score and a tester-specific deviation. Partial pooling allows people to disagree while estimating the community preference.')}</p><p>${t('The model uses Gaussian score priors and a probit comparison likelihood derived from TrueSkill’s Gaussian performance model. A shared, estimated taste variation controls how much testers differ. Scores are centered at 1,000.')}</p><p>${t('The bars contain 95% of posterior draws for each shared character score. They describe uncertainty under this model; a new person’s preferences can vary more widely. The first-place probability is the share of posterior draws in which a character has the highest community score.')}</p><p>${t('Sessions are treated as independent testers. Repeat participation, a small sample and voluntary participation can affect the estimates. Intervals are calculated separately for each character. Priors matter most when little data is available.')}</p><p class="fine-print">${t('This is a custom hierarchical model inspired by TrueSkill. Individual results and arithmetic averages retain their existing calculations.')}</p><p class="fine-print"><a href="https://www.microsoft.com/en-us/research/wp-content/uploads/2006/01/TR-2006-80.pdf" target="_blank" rel="noopener noreferrer">TrueSkill</a> · <a href="https://www.stat.cmu.edu/~brian/905-2009/all-papers/albert-chib-1993.pdf" target="_blank" rel="noopener noreferrer">Albert &amp; Chib</a> · <a href="https://mc-stan.org/docs/2_40/reference-manual/analysis.html" target="_blank" rel="noopener noreferrer">${t('MCMC diagnostics')}</a></p>${result ? `<p class="fine-print bayesian-diagnostics">${t`Four chains · ${result.diagnostics.draws.toLocaleString(locale())} draws per chain · max R-hat ${result.diagnostics.maxRhat.toFixed(4)} · min bulk ESS ${Math.floor(result.diagnostics.minBulkEss)} · min tail ESS ${Math.floor(result.diagnostics.minTailEss)}`}</p>` : ''}</details>`;
}
export function renderBayesianCommunity(target, state, onRetry) {
  const open = new Set([...target.querySelectorAll('details[open]')].map(n => n.className));
  const heading = `<h2 id="bayesian-title">${t('Global rating comparison')}</h2><p class="fine-print">${t('Bayesian community scores are inferred from recorded choices and account for individual tastes. The leaderboard table above shows average individual ratings.')}</p>`;
  const manualNote = state.manualCount ? `<p class="fine-print">${t`${state.manualCount} screenshot-recovered rankings are excluded because their recorded choices are unavailable.`}</p>` : '';
  let body;
  if (state.status === 'ready') {
    const result = state.result;
    const rankings = result.rankings.map(row => ({ ...IMAGES[row.index], elo: row.mean, credibleInterval: { lower: row.lower, upper: row.upper }, firstProbability: row.firstProbability }));
    body = `<div class="chart-legend"><span><i class="legend-mark"></i>${t('Community score & 95% credible interval')}</span><span><i class="legend-baseline"></i>${t('Baseline: 1,000')}</span></div><div class="bayesian-plot"></div><p class="fine-print">${t('A 95% credible interval contains 95% of the estimated posterior for that character’s community score, conditional on the model and recorded choices.')}</p><details class="bayesian-table-details"><summary>${t('View Bayesian scores and first-place probabilities')}</summary><div class="insight-table-scroll"><table class="rank-table bayesian-table"><thead><tr><th scope="col">${t('Colony / state')}</th><th scope="col">${t('Community score')}</th><th scope="col">${t('Lower bound')}</th><th scope="col">${t('Upper bound')}</th><th scope="col">${t('Probability of first place')}</th></tr></thead><tbody>${rankings.map(r => `<tr data-bayesian-id="${r.id}"><th scope="row"><a href="character.html#${r.id}">${r.name}</a></th><td>${score(r.elo)}</td><td>${score(r.credibleInterval.lower)}</td><td>${score(r.credibleInterval.upper)}</td><td>${percent(r.firstProbability)}</td></tr>`).join('')}</tbody></table></div></details><p class="fine-print">${t`Estimated taste variation: ${score(result.tasteSD.mean)} points, 95% credible interval ${score(result.tasteSD.lower)} to ${score(result.tasteSD.upper)}.`}</p><p class="fine-print">${t`Based on ${result.sessionCount} complete choice histories and ${result.comparisonCount.toLocaleString(locale())} comparisons.`}</p>${manualNote}${methods(result)}`;
    target.innerHTML = heading + body;
    target.querySelector('.bayesian-plot').append(forestPlot(rankings, t('Bayesian community character scores'), { interval: 'credible' }));
  } else {
    let message;
    if (state.status === 'loading') message = t`Loading complete choice histories… ${state.loaded} / ${state.total}`;
    else if (state.status === 'fitting') {
      const p = state.progress;
      message = p?.stage === 'checking' ? t('Checking sampling convergence…') : p ? t`${p.stage === 'warmup' ? t('Warmup') : t('Posterior sampling')} · chain ${p.chain} / 4 · ${p.iteration.toLocaleString(locale())} / ${p.total.toLocaleString(locale())}` : t('Estimating community scores…');
    } else if (state.status === 'unconverged') message = t('The sampler did not meet the convergence checks. Bayesian scores are unavailable for this dataset; the average leaderboard remains available.');
    else if (state.status === 'error') message = t('The Bayesian ranking could not be calculated. Check your connection and try again. All complete choice histories are needed.');
    else message = t('At least two complete choice histories are needed for the Bayesian ranking.');
    const busy = ['loading', 'fitting'].includes(state.status);
    body = `<div class="bayesian-status" ${busy ? 'aria-busy="true"' : ''}><p role="status">${message}</p>${busy ? `<p class="fine-print">${t('Calculation runs on this device and can take a moment. You can continue browsing.')}</p>` : ''}${['error', 'unconverged'].includes(state.status) ? `<button type="button" class="secondary bayesian-retry">${t('Retry')}</button>` : ''}</div>${manualNote}${methods()}`;
    target.innerHTML = heading + body;
    target.querySelector('.bayesian-retry')?.addEventListener('click', onRetry);
  }
  target.querySelectorAll('details').forEach(n => { if (open.has(n.className)) n.open = true; });
}
