import { IMAGES } from './catalog.js';
import { normalizeResult } from './results-data.js';
import { validateHistory } from './ranking.js';
import { COMMUNITY_MODEL, MODEL_SETTINGS } from './community-model.js';
export function cohortKey(participants) {
  const items = participants.filter(item => !item.provenance).map(item => ({ id: item.id.toLowerCase(), model: item.model, catalog: item.catalogVersion,
    rows: IMAGES.map(image => { const row = item.rankings.find(r => r.id === image.id); return [row?.elo, row?.wins, row?.count]; }) })).sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify([COMMUNITY_MODEL, MODEL_SETTINGS, items]);
}
export function sessionFromRecord(record, expected) {
  const normal = normalizeResult(record);
  if (!normal || normal.provenance || normal.id.toLowerCase() !== expected.id.toLowerCase()) throw new Error('Comparison history unavailable');
  validateHistory(record.comparisons, true);
  for (const row of expected.rankings) {
    const other = normal.rankings.find(r => r.id === row.id);
    if (!other || Math.abs(other.elo - row.elo) > 1e-6 || other.wins !== row.wins || other.count !== row.count || record.comparisons.filter(c => c.winner === row.id).length !== row.wins) throw new Error('Comparison history mismatch');
  }
  return { id: normal.id, pairs: record.comparisons.map(({ winner, loser }) => [IMAGES.findIndex(x => x.id === winner), IMAGES.findIndex(x => x.id === loser)]) };
}
export function validCommunityResult(value, count) {
  if (!value || !Number.isInteger(value.seed) || value.seed < 0 || value.seed > 4294967295 || value.model !== COMMUNITY_MODEL || value.converged !== true || value.sessionCount !== count || value.comparisonCount !== count * 136 || count < 2 || JSON.stringify(value.settings) !== JSON.stringify(MODEL_SETTINGS)) return false;
  const d = value.diagnostics;
  if (!d || d.monitoredParameters !== 18 + count * 17 + 1 || d.diagnosticStride !== MODEL_SETTINGS.diagnosticStride || d.chains !== 4 || d.warmup !== MODEL_SETTINGS.warmup || ![2000, 4000, 8000, 16000].includes(d.draws) || ![d.maxRhat, d.minBulkEss, d.minTailEss].every(Number.isFinite) || d.maxRhat >= MODEL_SETTINGS.maxRhat || d.maxRhat <= 0 || d.minBulkEss < MODEL_SETTINGS.minESS || d.minTailEss < MODEL_SETTINGS.minESS) return false;
  const finite = row => row && [row.mean, row.lower, row.upper].every(Number.isFinite) && row.lower < row.upper;
  if (!finite(value.tasteSD) || value.tasteSD.lower < 0 || value.tasteSD.mean <= 0 || !Array.isArray(value.rankings) || value.rankings.length !== 17) return false;
  const indices = new Set();
  for (const row of value.rankings) {
    if (!finite(row) || !Number.isInteger(row.index) || row.index < 0 || row.index >= 17 || indices.has(row.index) || !Number.isFinite(row.firstProbability) || row.firstProbability < 0 || row.firstProbability > 1) return false;
    indices.add(row.index);
  }
  return Math.abs(value.rankings.reduce((s, r) => s + r.mean, 0) / 17 - 1000) < 1e-6 && Math.abs(value.rankings.reduce((s, r) => s + r.firstProbability, 0) - 1) < 1e-6;
}
