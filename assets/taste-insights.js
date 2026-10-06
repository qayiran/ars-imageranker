import { IMAGES } from './catalog.js';
import { ratingMap, characterRanks, rankDivergence } from './rank-divergence.js';
import { validateHistory } from './ranking.js';
import { loadResultRecord, normalizeResult } from './results-data.js';

export function darkHorseFavorites(rankings, results, { id } = {}) {
  const comparison = rankDivergence(rankings, results, { id });
  if (!comparison || comparison.status !== 'ready') return comparison;
  const personal = characterRanks(rankings), others = characterRanks(comparison.globalRankings);
  const bounds = (ranks, id) => {
    const midpoint = ranks.get(id), size = [...ranks.values()].filter((rank) => rank === midpoint).length;
    return { first: midpoint - (size - 1) / 2, last: midpoint + (size - 1) / 2 };
  };
  const favorites = comparison.movements.filter(({ id }) => bounds(personal, id).last <= 5 && bounds(others, id).first >= IMAGES.length - 4)
    .sort((a, b) => a.personalRank - b.personalRank || a.name.localeCompare(b.name));
  return { status: 'ready', favorites, peerCount: comparison.peerCount, manualPeerCount: comparison.manualPeerCount };
}

export function ratingFingerprint(rankings) {
  const ratings = ratingMap(rankings);
  if (!ratings) return null;
  const mean = [...ratings.values()].reduce((sum, score) => sum + score, 0) / IMAGES.length;
  const rows = IMAGES.map(({ id, name }) => ({ id, name, rating: ratings.get(id), difference: ratings.get(id) - mean }));
  const extent = Math.max(100, Math.ceil(Math.max(...rows.map(({ difference }) => Math.abs(difference))) / 100) * 100);
  return { mean, rows, extent };
}

export function circularPreferenceExamples(history, rankings) {
  try { validateHistory(history, true); } catch { return null; }
  const choices = new Set(history.map(({ winner, loser }) => `${winner}|${loser}`));
  if (rankings) {
    if (!ratingMap(rankings)) return null;
    for (const row of rankings) {
      const wins = history.filter(({ winner }) => winner === row.id).length;
      if (row.count !== IMAGES.length - 1 || row.wins !== wins) return null;
    }
  }
  const cycles = [];
  for (let a = 0; a < IMAGES.length; a++) for (let b = a + 1; b < IMAGES.length; b++) for (let c = b + 1; c < IMAGES.length; c++) {
    const [first, second, third] = [IMAGES[a], IMAGES[b], IMAGES[c]];
    if (choices.has(`${first.id}|${second.id}`) && choices.has(`${second.id}|${third.id}`) && choices.has(`${third.id}|${first.id}`)) cycles.push([first, second, third]);
    else if (choices.has(`${first.id}|${third.id}`) && choices.has(`${third.id}|${second.id}`) && choices.has(`${second.id}|${first.id}`)) cycles.push([first, third, second]);
  }
  return cycles;
}

export async function loadRecordedChoices(id, rankings) {
  const record = await loadResultRecord(id);
  const normalized = normalizeResult(record), expected = ratingMap(rankings);
  if (!normalized || normalized.provenance || normalized.id.toLowerCase() !== id.toLowerCase() || !expected
    || normalized.rankings.some((row) => Math.abs(row.elo - expected.get(row.id)) > 1e-6)) throw new Error('Recorded choices do not match this result');
  const cycles = circularPreferenceExamples(record.comparisons, rankings);
  if (!cycles) throw new Error('Complete recorded choices are unavailable');
  return cycles;
}
