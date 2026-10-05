import { thumbnail, rankedImageGrid, bindResultImages } from './result-images.js';
import { t } from './language.js';
import { IMAGES } from './catalog.js';
import { forestPlot } from './forest.js';
import { groupPreferencesMarkup } from './group-preferences-view.js';
const findImage = (id) => IMAGES.find((image) => image.id === id);
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function renderRanking(target, ratings, title, { provenance } = {}) {
  const winner = ratings[0], image = findImage(winner.id);
  const manual = provenance?.kind === 'manual';
  const estimated = provenance?.intervals === 'estimated-from-screenshot';
  const winLabel = (row) => Number.isFinite(row.wins) && Number.isFinite(row.count) ? `${row.wins} / ${row.count}` : '—';
  target.innerHTML = `<div class="results-layout"><aside class="winner-card"><span class="eyebrow">${t`TOP-RANKED CHARACTER`}</span>${thumbnail(image.id, image.name, { className: 'winner-artwork' })}<div class="winner-info"><h2>${escape(winner.name)}</h2><div class="winner-score">${Math.round(winner.elo)}<span>${t`rating`}</span></div><p class="fine-print">${Number.isFinite(winner.wins) ? t`${winner.wins} wins across ${winner.count} comparisons.` : t('Win counts unavailable.')}</p></div></aside><div class="chart-card"><h2>${t`Character ratings`}</h2><p>${t`Compare all 17 character ratings. A higher rating means a stronger preference within this session.`}</p><div class="chart-legend"><span><i class="legend-mark"></i>${estimated ? t('Rating & estimated 95% interval') : manual ? t('Rating from screenshot') : t('Rating & approximate 95% interval')}</span><span><i class="legend-baseline"></i>${t`Starting rating: 1,000`}</span></div><div class="plot-scroll"></div><p class="fine-print">${estimated ? t`Recovered from a screenshot. Scores are rounded; interval endpoints are estimated to roughly ±${provenance.endpointAccuracy} rating points. Unshown win counts remain unknown.` : manual ? t('Recovered from a screenshot. Scores are rounded; uncertainty and unshown win counts could not be recovered.') : t('Ratings use Image Ranker’s TrueSkill model, shown as 1,000 + 40 × μ. Lines show model uncertainty (± 1.96 × σ on the same scale), not agreement across people. Each participant’s scores belong to their own session.')}</p><details><summary class="fine-print">${t`View the ranking as a table`}</summary><table class="rank-table"><caption class="sr-only">${escape(title)}</caption><thead><tr><th scope="col">${t`Rank`}</th><th scope="col">${t`Colony / state`}</th><th scope="col">${t`Wins`}</th><th scope="col">${t`Rating`}</th>${estimated ? `<th scope="col">${t`Estimated 95% interval`}</th>` : ''}</tr></thead><tbody>${ratings.map((rating, index) => `<tr><td>${index + 1}</td><th scope="row">${escape(rating.name)}</th><td>${winLabel(rating)}</td><td>${Math.round(rating.elo)}</td>${estimated ? `<td>${rating.estimatedInterval.lower}–${rating.estimatedInterval.upper}</td>` : ''}</tr>`).join('')}</tbody></table></details></div></div>${rankedImageGrid(ratings)}`;
  target.querySelector('.plot-scroll').append(forestPlot(ratings, title));
  target.querySelector('.results-layout').insertAdjacentHTML('afterend', groupPreferencesMarkup(ratings, { provenance }));
  bindResultImages(target, ratings);
}
