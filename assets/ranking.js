import { resultCode } from './result-identity.js';
import { IMAGES, TOTAL_PAIRS, CATALOG_VERSION } from './catalog.js';

// Browser port of image-ranker/elo.py's sequential trueskill.rate_1vs1.
// Same defaults: mu=0, sigma=8.33, beta=25/6, tau=25/300,
// draw_probability=0.1. Decisive outcomes only; every update affects two items.
export const MODEL = 'trueskill-1v1-v1';
const BETA = 25 / 6;
const TAU = 25 / 300;
const DRAW_MARGIN = 0.12566134685507402 * Math.SQRT2 * BETA;
const gaussianPdf = (x) => Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI);
function gaussianCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const tail = gaussianPdf(x) * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x < 0 ? tail : 1 - tail;
}
export const pairKey = (a, b) => [a, b].sort().join('|');
export function initialRatings() {
  return Object.fromEntries(IMAGES.map(({ id }) => [id, { mu: 0, sigma: 8.33, wins: 0, losses: 0, count: 0 }]));
}
export function rate(ratings, winner, loser) {
  if (winner === loser || !ratings[winner] || !ratings[loser]) throw new Error('Invalid showcase pair.');
  const a = ratings[winner];
  const b = ratings[loser];
  const va = a.sigma ** 2 + TAU ** 2;
  const vb = b.sigma ** 2 + TAU ** 2;
  const c = Math.sqrt(va + vb + 2 * BETA ** 2);
  const t = (a.mu - b.mu - DRAW_MARGIN) / c;
  const v = t < -10 ? -t + 1 / -t : gaussianPdf(t) / gaussianCdf(t);
  const w = Math.min(1 - Number.EPSILON, v * (v + t));
  ratings[winner] = { mu: a.mu + va / c * v, sigma: Math.sqrt(va * (1 - va / c ** 2 * w)), wins: a.wins + 1, losses: a.losses, count: a.count + 1 };
  ratings[loser] = { mu: b.mu - vb / c * v, sigma: Math.sqrt(vb * (1 - vb / c ** 2 * w)), wins: b.wins, losses: b.losses + 1, count: b.count + 1 };
  return ratings;
}
export function ratingsFrom(history) {
  const ratings = initialRatings();
  for (const { winner, loser } of history) rate(ratings, winner, loser);
  return ratings;
}
export function rankingsFrom(history) {
  const ratings = ratingsFrom(history);
  return IMAGES.map(({ id, name }) => {
    const rating = ratings[id];
    return { id, name, ...rating, elo: 1000 + 40 * rating.mu, uncertainty: 40 * rating.sigma };
  }).sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
}
export function shuffled(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
export function createQueue(random = Math.random) {
  const ids = shuffled(IMAGES.map(({ id }) => id), random);
  const ring = ids.map((id, i) => [id, ids[(i + 1) % ids.length]]);
  const ringKeys = new Set(ring.map(([a, b]) => pairKey(a, b)));
  const rest = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    if (!ringKeys.has(pairKey(ids[i], ids[j]))) rest.push([ids[i], ids[j]]);
  }
  return [...shuffled(ring, random), ...shuffled(rest, random)].map((pair) => random() < 0.5 ? pair : [...pair].reverse());
}
export function autoShuffle(queue, history, random = Math.random) {
  const ratings = ratingsFrom(history);
  const score = ([a, b]) => Math.abs(ratings[a].mu - ratings[b].mu) + 0.8 * (ratings[a].count + ratings[b].count);
  return shuffled(queue, random).sort((a, b) => score(a) - score(b));
}
export function normalizeUsername(value) {
  if (typeof value !== 'string') throw new Error('Enter a username.');
  const name = value.trim().normalize('NFC');
  if (!/^[\p{L}\p{N}][\p{L}\p{N} _.\-]{1,29}$/u.test(name)) throw new Error('Use 2–30 letters, numbers, spaces, dots, underscores or hyphens.');
  return name;
}
export function validateHistory(history, complete = false) {
  if (!Array.isArray(history) || history.length > TOTAL_PAIRS || (complete && history.length !== TOTAL_PAIRS)) throw new Error('The comparison session is incomplete or invalid.');
  const ids = new Set(IMAGES.map(({ id }) => id));
  const seen = new Set();
  for (const entry of history) {
    if (!entry || !ids.has(entry.winner) || !ids.has(entry.loser) || entry.winner === entry.loser) throw new Error('Only showcase images can be compared.');
    const key = pairKey(entry.winner, entry.loser);
    if (seen.has(key)) throw new Error('Each showcase pair must be compared exactly once.');
    seen.add(key);
  }
  return true;
}
export function validateSubmission(body) {
  if (!body || body.catalogVersion !== CATALOG_VERSION || body.model !== MODEL) throw new Error('This session uses a different showcase or rating model.');
  if (typeof body.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id)) throw new Error('Invalid session ID.');
  const username = normalizeUsername(body.username);
  validateHistory(body.comparisons, true);
  return { id: body.id, username, catalogVersion: CATALOG_VERSION, model: MODEL, comparisons: body.comparisons.map(({ winner, loser }) => ({ winner, loser })) };
}
export function summaryFrom(submission, completedAt = new Date().toISOString()) {
  return { id: submission.id, resultCode: resultCode(submission.id), username: submission.username, completedAt, catalogVersion: CATALOG_VERSION, model: MODEL, comparisonCount: submission.comparisons.length, rankings: rankingsFrom(submission.comparisons) };
}
