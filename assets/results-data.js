import { IMAGES, CATALOG_VERSION, TOTAL_PAIRS } from './catalog.js';
import { MODEL, normalizeUsername } from './ranking.js';
import { resultCode } from './result-identity.js';
export function normalizeResult(item) {
  if (!item || item.catalogVersion !== CATALOG_VERSION || item.model !== MODEL || item.comparisonCount !== TOTAL_PAIRS || typeof item.id !== 'string' || typeof item.username !== 'string' || typeof item.completedAt !== 'string' || !Array.isArray(item.rankings) || item.rankings.length !== IMAGES.length) return null;
  if (item.example === true || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)) return null;
  if (!Number.isFinite(Date.parse(item.completedAt))) return null;
  try { normalizeUsername(item.username); } catch { return null; }
  const manual = item.provenance?.kind === 'manual';
  if (manual && item.provenance.source !== 'screenshot') return null;
  const estimated = manual && item.provenance.intervals === 'estimated-from-screenshot';
  if (manual && item.provenance.intervals !== undefined && !estimated) return null;
  if (estimated && (!Number.isFinite(item.provenance.endpointAccuracy) || item.provenance.endpointAccuracy <= 0)) return null;
  const seen = new Set(), rankings = [];
  for (const row of item.rankings) {
    const image = IMAGES.find(({ id }) => id === row?.id);
    if (!image || seen.has(row.id) || !Number.isFinite(row.elo)) return null;
    if (manual) {
      // Screenshot scores are rounded; missing statistics stay explicitly unknown.
      if (!Number.isInteger(row.elo) || row.uncertainty !== null) return null;
      if (!(row.wins === null && row.count === null) && !(row.count === IMAGES.length - 1 && Number.isInteger(row.wins) && row.wins >= 0 && row.wins <= row.count)) return null;
    } else if (![row.uncertainty, row.wins, row.count].every(Number.isFinite) || row.uncertainty <= 0 || row.count !== IMAGES.length - 1 || !Number.isInteger(row.wins) || row.wins < 0 || row.wins > row.count) return null;
    if (estimated) {
      const bounds = row.estimatedInterval;
      if (!bounds || ![bounds.lower, bounds.upper].every(Number.isInteger) || bounds.lower >= row.elo || bounds.upper <= row.elo || Math.abs((bounds.lower + bounds.upper) / 2 - row.elo) > item.provenance.endpointAccuracy) return null;
    } else if (row.estimatedInterval != null) return null;
    seen.add(row.id); rankings.push({ ...row, name: image.name, ...(estimated ? { estimatedInterval: { lower: row.estimatedInterval.lower, upper: row.estimatedInterval.upper } } : {}) });
  }
  if (!manual && rankings.reduce((sum, row) => sum + row.wins, 0) !== TOTAL_PAIRS) return null;
  rankings.sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
  return { id: item.id, resultCode: resultCode(item.id), username: item.username, completedAt: item.completedAt, model: MODEL, catalogVersion: CATALOG_VERSION, comparisonCount: TOTAL_PAIRS, rankings, ...(manual ? { provenance: { kind: 'manual', source: 'screenshot', ...(estimated ? { intervals: 'estimated-from-screenshot', endpointAccuracy: item.provenance.endpointAccuracy } : {}) } } : {}) };
}
export function normalizeResults(data) {
  const seen = new Set();
  return data.map((item) => normalizeResult(item)).filter((item) => {
    if (!item || seen.has(item.id.toLowerCase())) return false;
    seen.add(item.id.toLowerCase()); return true;
  }).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
}
export async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(20000) });
  let body;
  try { body = await response.json(); } catch { throw new Error('The results source returned an unreadable response.'); }
  if (!response.ok) throw new Error(typeof body?.error === 'string' ? body.error : `Results are unavailable (${response.status}).`);
  return body;
}
export async function loadPublicResults() {
  const config = await fetchJson(new URL('../config.json', import.meta.url));
  let endpoint = new URL('../results/index.json', import.meta.url);
  if (config.resultsApiUrl) {
    const base = new URL(config.resultsApiUrl);
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('The results service must use HTTPS.');
    if (base.username || base.password || base.search || base.hash) throw new Error('The results service URL is invalid.');
    endpoint = `${base.href.replace(/\/$/, '')}/results`;
  }
  const data = await fetchJson(endpoint);
  if (!Array.isArray(data)) throw new Error('The participant results index is invalid.');
  return normalizeResults(data);
}
