import { diagnose, quantile } from './mcmc-diagnostics.js';
export const COMMUNITY_MODEL = 'hierarchical-probit-v1';
export const MODEL_SETTINGS = Object.freeze({ chains: 4, warmup: 1500, draws: 2000, maxDraws: 16000, priorSD: 25 / 3, tastePriorSD: 25 / 3, beta: 25 / 6, minESS: 400, maxRhat: 1.01, diagnosticStride: 8 });
export function randomSource(seed) {
  let state = seed >>> 0, spare = null;
  const uniform = () => { state = (state + 0x6D2B79F5) >>> 0; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return (((t ^ t >>> 14) >>> 0) + .5) / 4294967296; };
  // Keep uniforms strictly within (0,1); Box-Muller reuses the second draw.
  const u = () => { const v = uniform(); return Math.max(Number.EPSILON, Math.min(1 - Number.EPSILON, v)); };
  const normal = () => { if (spare !== null) { const v = spare; spare = null; return v; } const r = Math.sqrt(-2 * Math.log(u())), a = 2 * Math.PI * u(); spare = r * Math.sin(a); return r * Math.cos(a); };
  return { uniform: u, normal };
}
export function positiveNormal(mean, rng) {
  if (mean >= 0) { for (;;) { const x = mean + rng.normal(); if (x > 0) return x; } }
  const a = -mean, lambda = (a + Math.sqrt(a * a + 4)) / 2;
  for (;;) { const x = a - Math.log(rng.uniform()) / lambda; if (Math.log(rng.uniform()) <= -.5 * (x - lambda) ** 2) return x + mean; }
}
// Complete round robins imply L = k I on the sum-zero contrast subspace.
// Blocking g and b avoids the slow common-score/deviation Gibbs random walk.
function createChain(k, sessions, seed, settings, chainIndex) {
  const rng = randomSource(seed), noise = Math.SQRT2 * settings.beta;
  const prior2 = (settings.priorSD / noise) ** 2, tastePrior2 = (settings.tastePriorSD / noise) ** 2;
  let tau = .4 + .6 * chainIndex, g = Array.from({ length: k }, () => rng.normal()), b = sessions.map(() => new Float64Array(k));
  const center = x => { const mean = x.reduce((s, v) => s + v, 0) / k; for (let j = 0; j < k; j++) x[j] -= mean; };
  center(g);
  const r = sessions.map(() => new Float64Array(k));
  const latent = sessions.map(s => new Float64Array(s.pairs.length));
  const dimensions = k - 1, users = sessions.length;
  function step() {
    for (let u = 0; u < sessions.length; u++) {
      r[u].fill(0);
      for (let p = 0; p < sessions[u].pairs.length; p++) { const [w, l] = sessions[u].pairs[p]; const z = positiveNormal(g[w] + b[u][w] - g[l] - b[u][l], rng); latent[u][p] = z; r[u][w] += z; r[u][l] -= z; }
    }
    // Integrate both Gaussian score blocks before updating tau. This avoids
    // the centered hierarchical funnel when testers are nearly unanimous.
    const qbar = Array.from({ length: k }, (_, j) => r.reduce((s, row) => s + row[j] / k, 0) / users);
    let scatter = 0;
    for (const row of r) for (let j = 0; j < k; j++) scatter += (row[j] / k - qbar[j]) ** 2;
    const centerSS = qbar.reduce((s, x) => s + x * x, 0);
    const logp = x => {
      const tau2 = Math.exp(2 * x), within = tau2 + 1 / k, between = prior2 + within / users;
      return x - tau2 / (2 * tastePrior2) - .5 * (users - 1) * dimensions * Math.log(within) - scatter / (2 * within) - .5 * dimensions * Math.log(between) - centerSS / (2 * between);
    };
    const x = Math.log(tau), level = logp(x) + Math.log(rng.uniform());
    let lo = x - rng.uniform(), hi = lo + 1;
    // Randomized finite stepping-out (Neal's slice sampler), then shrinkage.
    let left = Math.floor(rng.uniform() * 50), right = 49 - left;
    while (left-- > 0 && logp(lo) > level) lo--;
    while (right-- > 0 && logp(hi) > level) hi++;
    for (let attempt = 0; ; attempt++) {
      if (attempt > 10000) throw new Error('Slice sampler failed');
      const trial = lo + rng.uniform() * (hi - lo);
      if (logp(trial) >= level) { tau = Math.exp(trial); break; }
      if (trial < x) lo = trial; else hi = trial;
    }
    const marginal = tau * tau + 1 / k, vg = 1 / (1 / prior2 + users / marginal), sg = Math.sqrt(vg);
    for (let j = 0; j < k; j++) g[j] = vg * users * qbar[j] / marginal + sg * rng.normal();
    center(g);
    const vb = 1 / (k + 1 / (tau * tau)), sb = Math.sqrt(vb);
    for (let u = 0; u < users; u++) { for (let j = 0; j < k; j++) b[u][j] = vb * (r[u][j] - k * g[j]) + sb * rng.normal(); center(b[u]); }
    return [...g, tau];
  }
  function monitor() {
    // Monitor every tester deviation and the joint augmented log density too.
    // Thinning these diagnostics bounds memory; published scores use all draws.
    let lp = -.5 * g.reduce((s, x) => s + x * x, 0) / prior2 - .5 * tau * tau / tastePrior2 - users * dimensions * Math.log(tau);
    for (let u = 0; u < users; u++) {
      lp -= .5 * b[u].reduce((s, x) => s + x * x, 0) / (tau * tau);
      for (let p = 0; p < sessions[u].pairs.length; p++) { const [w, l] = sessions[u].pairs[p]; const diff = g[w] + b[u][w] - g[l] - b[u][l]; lp -= .5 * (latent[u][p] - diff) ** 2; }
    }
    return [...b.flatMap(row => [...row]), lp];
  }
  return { step, monitor, samples: Array.from({ length: k + 1 }, () => []), monitors: Array.from({ length: users * k + 1 }, () => []) };
}
export function canonicalSessions(input, k) {
  if (!Number.isInteger(k) || k < 2 || k > 17 || !Array.isArray(input) || input.length < 2) throw new Error('At least two complete sessions are required');
  const seen = new Set();
  return input.map(({ id, pairs }) => {
    if (typeof id !== 'string' || seen.has(id.toLowerCase())) throw new Error('Duplicate or invalid session');
    seen.add(id.toLowerCase());
    if (!Array.isArray(pairs) || pairs.length !== k * (k - 1) / 2) throw new Error('Incomplete comparison history');
    const pairSet = new Set();
    const sorted = pairs.map(pair => {
      if (!Array.isArray(pair) || pair.length !== 2 || pair.some(x => !Number.isInteger(x) || x < 0 || x >= k) || pair[0] === pair[1]) throw new Error('Invalid comparison');
      const key = [Math.min(...pair), Math.max(...pair)].join(':');
      if (pairSet.has(key)) throw new Error('Duplicate comparison'); pairSet.add(key);
      return [...pair];
    }).sort((a, b) => Math.min(...a) - Math.min(...b) || Math.max(...a) - Math.max(...b));
    return { id: id.toLowerCase(), pairs: sorted };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
export function fitCommunity(input, k = 17, { seed = 17341, settings = MODEL_SETTINGS, onProgress = () => {} } = {}) {
  const sessions = canonicalSessions(input, k);
  if (settings.chains !== 4 || ![settings.warmup, settings.draws, settings.maxDraws, settings.diagnosticStride].every(x => Number.isInteger(x) && x > 0) || settings.draws < 200 || settings.maxDraws < settings.draws || ![settings.priorSD, settings.tastePriorSD, settings.beta, settings.minESS, settings.maxRhat].every(x => Number.isFinite(x) && x > 0)) throw new Error('Invalid sampler settings');
  const chains = Array.from({ length: settings.chains }, (_, c) => createChain(k, sessions, (seed + Math.imul(c + 1, 2654435761)) >>> 0, settings, c));
  for (let c = 0; c < chains.length; c++) for (let n = 0; n < settings.warmup; n++) { chains[c].step(); if (n % 250 === 0) onProgress({ stage: 'warmup', chain: c + 1, iteration: n, total: settings.warmup }); }
  let target = settings.draws, diagnostics;
  for (;;) {
    for (let c = 0; c < chains.length; c++) for (let n = chains[c].samples[0].length; n < target; n++) {
      chains[c].step().forEach((v, j) => chains[c].samples[j].push(v));
      if (n % settings.diagnosticStride === 0) chains[c].monitor().forEach((v, j) => chains[c].monitors[j].push(v));
      if (n % 250 === 0) onProgress({ stage: 'sampling', chain: c + 1, iteration: n, total: target });
    }
    onProgress({ stage: 'checking' });
    diagnostics = Array.from({ length: k + 1 }, (_, j) => diagnose(chains.map(c => c.samples[j])));
    diagnostics.push(...Array.from({ length: chains[0].monitors.length }, (_, j) => diagnose(chains.map(c => c.monitors[j]))));
    if (diagnostics.every(d => d.rhat < settings.maxRhat && d.bulkEss >= settings.minESS && d.tailEss >= settings.minESS) || target >= settings.maxDraws) break;
    target = Math.min(target * 2, settings.maxDraws);
  }
  const noise = Math.SQRT2 * settings.beta, scale = 40 * noise;
  const firstCounts = Array(k).fill(0);
  for (const chain of chains) for (let n = 0; n < target; n++) { let top = 0; for (let j = 1; j < k; j++) if (chain.samples[j][n] > chain.samples[top][n]) top = j; firstCounts[top]++; }
  const summarize = (j, multiplier, offset = 0) => { const flat = chains.flatMap(c => c.samples[j]), mean = flat.reduce((s, x) => s + x, 0) / flat.length; return { mean: offset + multiplier * mean, lower: offset + multiplier * quantile(flat, .025), upper: offset + multiplier * quantile(flat, .975) }; };
  const converged = diagnostics.every(d => d.rhat < settings.maxRhat && d.bulkEss >= settings.minESS && d.tailEss >= settings.minESS);
  return { model: COMMUNITY_MODEL, seed: seed >>> 0, sessionCount: sessions.length, comparisonCount: sessions.length * k * (k - 1) / 2, converged,
    rankings: Array.from({ length: k }, (_, j) => ({ index: j, ...summarize(j, scale, 1000), firstProbability: firstCounts[j] / (chains.length * target) })).sort((a, b) => b.mean - a.mean || a.index - b.index),
    tasteSD: summarize(k, scale), diagnostics: { maxRhat: Math.max(...diagnostics.map(d => d.rhat)), minBulkEss: Math.min(...diagnostics.map(d => d.bulkEss)), minTailEss: Math.min(...diagnostics.map(d => d.tailEss)), chains: chains.length, warmup: settings.warmup, draws: target, monitoredParameters: diagnostics.length, diagnosticStride: settings.diagnosticStride }, settings: { ...settings } };
}
