import { IMAGES, TOTAL_PAIRS } from './catalog.js';
import { normalizeResults } from './results-data.js';
import { buildLeaderboard } from './leaderboard.js';
import { groupPreferences } from './group-preferences.js';
import { compareRankOrders, characterRanks } from './rank-divergence.js';

export function closestMatches(rankings, results, { id } = {}) {
  if (!characterRanks(rankings)) return null;
  const ownId = typeof id === 'string' ? id.toLowerCase() : null;
  return normalizeResults(Array.isArray(results) ? results : []).filter((item) => item.id.toLowerCase() !== ownId)
    .map((item) => { const comparison = compareRankOrders(rankings, item.rankings);
      return { ...item, divergence: comparison.percent, agreement: 100 - comparison.percent,
        disagreements: comparison.disagreements, averageMovement: comparison.averageMovement }; })
    .sort((a, b) => a.divergence - b.divergence || b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
}

// All 680 triplets in a complete 17-character comparison graph are either
// transitive or cyclic. Each transitive triplet has exactly one double winner,
// so its count is sum C(wins, 2), regardless of which characters it contains.
export function preferenceConsistency(rankings) {
  if (!characterRanks(rankings)) return null;
  const n = IMAGES.length;
  if (rankings.some(({ wins, count }) => count !== n - 1 || !Number.isInteger(wins) || wins < 0 || wins > count)
    || rankings.reduce((sum, { wins }) => sum + wins, 0) !== TOTAL_PAIRS) return null;
  // Reject impossible tournament score sequences (Landau's inequalities).
  const degrees = rankings.map(({ wins }) => wins).sort((a, b) => a - b);
  let cumulative = 0;
  for (let k = 1; k < n; k++) { cumulative += degrees[k - 1]; if (cumulative < k * (k - 1) / 2) return null; }
  const triplets = n * (n - 1) * (n - 2) / 6;
  const transitive = degrees.reduce((sum, wins) => sum + wins * (wins - 1) / 2, 0);
  const cyclic = triplets - transitive;
  return { triplets, transitive, cyclic, transitivePercent: 100 * transitive / triplets, cyclicPercent: 100 * cyclic / triplets };
}

export function communityInsights(results) {
  const sessions = normalizeResults(Array.isArray(results) ? results : []);
  const board = buildLeaderboard(sessions);
  if (!sessions.length) return { sessionCount: 0, board, characters: [], groups: null };
  const ranks = sessions.map(({ rankings }) => characterRanks(rankings));
  const characters = IMAGES.map(({ id, name }) => {
    const positions = ranks.map((row) => row.get(id));
    const meanRank = positions.reduce((sum, rank) => sum + rank, 0) / sessions.length;
    const spread = Math.sqrt(positions.reduce((sum, rank) => sum + (rank - meanRank) ** 2, 0) / sessions.length);
    return { id, name, meanRank, spread, bestRank: Math.min(...positions), worstRank: Math.max(...positions) };
  }).sort((a, b) => b.spread - a.spread || a.name.localeCompare(b.name));
  return { sessionCount: sessions.length, manualCount: board.manualCount, board, characters, groups: groupPreferences(board.rankings) };
}
