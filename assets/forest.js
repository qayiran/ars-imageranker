import { t } from './language.js';
// Personal TrueSkill intervals and global intervals for the mean stay distinct.
let plotId = 0;
const NS = 'http://www.w3.org/2000/svg';
function element(tag, attrs = {}, text) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
}
export function forestPlot(rankings, title = t('Character ratings'), { interval = 'posterior' } = {}) {
  const range = interval === 'range';
  const confidence = interval === 'confidence';
  const credible = interval === 'credible';
  const aggregate = range || confidence || credible;
  const hasInterval = (row) => credible ? Boolean(row.credibleInterval) : confidence ? Boolean(row.confidenceInterval) : range || Number.isFinite(row.uncertainty) || row.estimatedInterval;
  const estimatedIntervals = !aggregate && rankings.some((row) => row.estimatedInterval);
  const completeIntervals = rankings.every(hasInterval);
  const bounds = (row) => credible ? [row.credibleInterval.lower, row.credibleInterval.upper] : confidence ? row.confidenceInterval ? [row.confidenceInterval.lower, row.confidenceInterval.upper] : [row.elo, row.elo] : range ? [row.minimum, row.maximum] : row.estimatedInterval ? [row.estimatedInterval.lower, row.estimatedInterval.upper] : hasInterval(row) ? [row.elo - 1.96 * row.uncertainty, row.elo + 1.96 * row.uncertainty] : [row.elo, row.elo];
  const compact = window.matchMedia('(max-width: 720px)').matches;
  const width = compact ? 360 : 880;
  const left = compact ? 110 : 190;
  const right = compact ? 310 : 790;
  const top = 48, rowHeight = 39;
  const bottom = top + rankings.length * rowHeight;
  const titleId = `forest-title-${++plotId}`, descId = `forest-desc-${plotId}`;
  const svg = element('svg', { viewBox: `0 0 ${width} ${bottom + 62}`, class: compact ? 'plot-compact' : '', role: 'img', 'aria-labelledby': `${titleId} ${descId}` });
  svg.append(element('title', { id: titleId }, title));
  svg.append(element('desc', { id: descId }, credible ? t('Dots show Bayesian community scores. Lines show 95% credible intervals for shared preferences. The dashed line marks the baseline of 1000.') : confidence ? completeIntervals ? t('Dots show the mean rating across completed sessions. Lines show 95% confidence intervals for the mean. The dashed line marks the initial rating of 1000.') : t('Dots show the mean rating. Confidence intervals need at least two completed sessions. The dashed line marks the initial rating of 1000.') : range ? t("Dots show the average Elo-style rating across completed rankings. Lines show the lowest to highest submitted rating. The dashed line marks the initial rating of 1000.") : estimatedIntervals ? t('Dots show recovered ratings. Lines estimate the original 95% intervals from screenshot pixels. The dashed line marks the initial rating of 1000.') : !completeIntervals ? t('Dots show recovered ratings. Uncertainty intervals are unavailable. The dashed line marks the initial rating of 1000.') : t("Dots show Elo-style TrueSkill ratings. Lines show approximate 95 percent posterior intervals. The dashed line marks the initial rating of 1000.")));
  const low = Math.floor(Math.min(1000, ...rankings.map((r) => bounds(r)[0])) / 100) * 100;
  const high = Math.ceil(Math.max(1000, ...rankings.map((r) => bounds(r)[1])) / 100) * 100;
  const x = (score) => left + (score - low) / (high - low || 1) * (right - left);
  for (let i = 0; i <= 4; i++) {
    const score = low + (high - low) * i / 4;
    svg.append(element('line', { x1: x(score), x2: x(score), y1: top - 15, y2: bottom, class: 'plot-grid' }));
    svg.append(element('text', { x: x(score), y: bottom + 28, 'text-anchor': 'middle', class: 'plot-tick' }, Math.round(score)));
  }
  svg.append(element('line', { x1: x(1000), x2: x(1000), y1: top - 15, y2: bottom, class: 'plot-baseline' }));
  svg.append(element('text', { x: left, y: 19, class: 'plot-heading' }, credible ? compact ? t('95% CrI') : t('95% CREDIBLE INTERVAL') : confidence ? completeIntervals ? compact ? t('95% CI') : t('95% CONFIDENCE INTERVAL') : t('MEAN RATINGS') : range ? t("SUBMITTED-SCORE RANGE") : estimatedIntervals ? t('ESTIMATED 95% INTERVAL') : completeIntervals ? t("95% POSTERIOR INTERVAL") : t('RECOVERED RATINGS')));
  svg.append(element('text', { x: width - 13, y: 19, 'text-anchor': 'end', class: 'plot-heading' }, credible ? t("COMMUNITY SCORE") : aggregate ? t("MEAN RATING") : t("RATING")));
  rankings.forEach((rating, index) => {
    const y = top + index * rowHeight;
    if (index % 2 === 0) svg.append(element('rect', { x: 0, y: y - 17, width, height: rowHeight, rx: 4, class: 'plot-stripe' }));
    svg.append(element('text', { x: 12, y: y + 5, class: 'plot-label' }, rating.name));
    const group = element('g', { class: index === 0 ? 'plot-value plot-first' : 'plot-value', ...(confidence ? { 'data-confidence-id': rating.id } : {}) });
    const [minimum, maximum] = bounds(rating);
    group.append(element('title', {}, hasInterval(rating) ? t`${rating.name}: ${credible ? t("community score ") : aggregate ? t("average ") : ''}${Math.round(rating.elo)}, ${credible ? t('95% credible interval') : confidence ? t('95% confidence interval') : range ? t("submitted range") : rating.estimatedInterval ? t('estimated interval') : t("interval")} ${Math.round(minimum)} to ${Math.round(maximum)}` : confidence ? t`${rating.name}: average ${Math.round(rating.elo)}. Confidence interval unavailable.` : t`${rating.name}: ${Math.round(rating.elo)}. Uncertainty unavailable.`));
    const lo = x(minimum), hi = x(maximum);
    if (hasInterval(rating)) {
      group.append(element('line', { x1: lo, x2: hi, y1: y, y2: y }));
      for (const edge of [lo, hi]) group.append(element('line', { x1: edge, x2: edge, y1: y - 5, y2: y + 5 }));
    }
    group.append(element('circle', { cx: x(rating.elo), cy: y, r: 5 }));
    svg.append(group);
    svg.append(element('text', { x: width - 13, y: y + 5, 'text-anchor': 'end', class: 'plot-score' }, Math.round(rating.elo)));
  });
  svg.append(element('text', { x: (left + right) / 2, y: bottom + 54, 'text-anchor': 'middle', class: 'plot-tick' }, credible ? t("Bayesian community rating →") : aggregate ? t("Average Elo-style rating →") : t("Elo-style rating →")));
  return svg;
}
