// Rank-normalized split/folded R-hat and Geyer's paired-sequence ESS.
// Definitions: Vehtari et al. (2021), as used in the Stan reference manual.
export function quantile(values, p) {
  const a = [...values].sort((x, y) => x - y), x = (a.length - 1) * p, i = Math.floor(x);
  return a[i] + (a[Math.min(i + 1, a.length - 1)] - a[i]) * (x - i);
}
export function normalQuantile(p) {
  if (!(p > 0 && p < 1)) throw new Error('Invalid probability');
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-.00778489400243029, -.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [.00778469570904146, .32246712907004, 2.445134137143, 3.75440866190742];
  const poly = (coeff, x) => coeff.reduce((v, k) => v * x + k, 0);
  if (p < .02425) { const q = Math.sqrt(-2 * Math.log(p)); return poly(c, q) / (poly(d, q) * q + 1); }
  if (p > .97575) return -normalQuantile(1 - p);
  const q = p - .5, r = q * q;
  return poly(a, r) * q / (poly(b, r) * r + 1);
}
function rankNormalize(chains) {
  const flat = chains.flat(), sorted = flat.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v), result = [];
  for (let i = 0; i < sorted.length;) {
    let j = i + 1; while (j < sorted.length && sorted[j].v === sorted[i].v) j++;
    const z = normalQuantile(((i + 1 + j) / 2 - .375) / (flat.length + .25));
    for (let k = i; k < j; k++) result[sorted[k].i] = z;
    i = j;
  }
  return chains.map((row, i) => result.slice(i * row.length, (i + 1) * row.length));
}
function moments(chains) {
  const m = chains.length, n = chains[0].length;
  const means = chains.map(c => c.reduce((s, x) => s + x, 0) / n);
  const mean = means.reduce((s, x) => s + x, 0) / m;
  const variance = chains.map((c, i) => c.reduce((s, x) => s + (x - means[i]) ** 2, 0) / (n - 1));
  const w = variance.reduce((s, x) => s + x, 0) / m;
  const b = n * means.reduce((s, x) => s + (x - mean) ** 2, 0) / (m - 1);
  return { means, w, v: (n - 1) / n * w + b / n, n, m };
}
function rhat(chains) {
  const { w, v } = moments(chains);
  return w > 0 ? Math.sqrt(v / w) : Infinity;
}
function ess(chains) {
  const { means, w, v, n, m } = moments(chains);
  if (!(v > 0)) return 0;
  const rho = lag => {
    let cov = 0;
    for (let c = 0; c < m; c++) for (let i = 0; i < n - lag; i++) cov += (chains[c][i] - means[c]) * (chains[c][i + lag] - means[c]);
    return 1 - (w - cov / (m * n)) / v;
  };
  let previous = 1 + rho(1), sum = previous;
  // Positive then monotone adjacent autocorrelation pairs, including lag 0.
  for (let lag = 2; lag + 1 < n; lag += 2) {
    const pair = rho(lag) + rho(lag + 1);
    if (pair < 0) break;
    previous = Math.min(previous, pair); sum += previous;
  }
  const tau = Math.max(1 / Math.log10(m * n), -1 + 2 * sum);
  return Math.min(m * n * Math.log10(m * n), m * n / tau);
}
export function diagnose(chains) {
  if (chains.length < 4 || chains.some(c => c.length !== chains[0].length || c.length < 20 || c.some(x => !Number.isFinite(x)))) throw new Error('Invalid MCMC chains');
  const half = Math.floor(chains[0].length / 2), split = chains.flatMap(c => [c.slice(0, half), c.slice(-half)]), flat = split.flat();
  const ranks = rankNormalize(split), median = quantile(flat, .5);
  const folded = rankNormalize(split.map(c => c.map(x => Math.abs(x - median))));
  const q05 = quantile(flat, .05), q95 = quantile(flat, .95);
  return { rhat: Math.max(rhat(ranks), rhat(folded)), bulkEss: ess(ranks), tailEss: Math.min(ess(split.map(c => c.map(x => +(x <= q05)))), ess(split.map(c => c.map(x => +(x <= q95))))) };
}
