import { IMAGES, TOTAL_PAIRS } from './catalog.js';
import { normalizeResult } from './results-data.js';
import { meanConfidenceInterval95 } from './confidence-interval.js';

// Every completed ranking covers all 17 characters and gives each equal weight.
// Do not pool sequential TrueSkill sessions as if they were one rating history.
export function buildLeaderboard(results) {
  const seen = new Set(), sessions = [];
  for (const item of results) {
    const session = normalizeResult(item);
    if (!session || seen.has(session.id.toLowerCase())) continue;
    seen.add(session.id.toLowerCase()); sessions.push(session);
  }
  const sessionCount = sessions.length;
  if (!sessionCount) return { rankings: [], sessionCount: 0, comparisonCount: 0 };
  const rankings = IMAGES.map(({ id, name }) => {
    const rows = sessions.map((session) => session.rankings.find((row) => row.id === id));
    const elo = rows.reduce((sum, row) => sum + row.elo, 0) / sessionCount;
    // Partial screenshot statistics would bias win rates. Use full histories only.
    const completeRows = sessions.filter((session) => !session.provenance).map((session) => session.rankings.find((row) => row.id === id));
    const wins = completeRows.reduce((sum, row) => sum + row.wins, 0);
    const count = completeRows.reduce((sum, row) => sum + row.count, 0);
    return {
      id, name, elo, wins, count, winRate: count ? 100 * wins / count : null,
      topVotes: sessions.filter((session) => session.rankings[0].id === id).length,
      minimum: Math.min(...rows.map((row) => row.elo)),
      maximum: Math.max(...rows.map((row) => row.elo)),
      confidenceInterval: meanConfidenceInterval95(rows.map((row) => row.elo)),
    };
  }).sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name));
  return { rankings, sessionCount, comparisonCount: sessionCount * TOTAL_PAIRS, manualCount: sessions.filter((session) => session.provenance).length };
}
