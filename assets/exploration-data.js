import { IMAGES } from './catalog.js';
import { normalizeResults } from './results-data.js';
import { characterRanks } from './rank-divergence.js';
import { FACTIONS, REGIONS } from './group-preferences.js';

export function characterProfile(id, results) {
  const image = IMAGES.find((item) => item.id === id);
  if (!image) return null;
  const sessions = normalizeResults(Array.isArray(results) ? results : []);
  const entries = sessions.map((session) => {
    const ranks = characterRanks(session.rankings), rank = ranks.get(id);
    const tiedCount = [...ranks.values()].filter((position) => position === rank).length;
    return { ...session, row: session.rankings.find((row) => row.id === id), rank, tiedCount,
      firstPosition: rank - (tiedCount - 1) / 2 };
  }).sort((a, b) => b.row.elo - a.row.elo || b.completedAt.localeCompare(a.completedAt) || a.id.localeCompare(b.id));
  const positions = Array(17).fill(0);
  for (const item of entries) for (let offset = 0; offset < item.tiedCount; offset++) positions[item.firstPosition - 1 + offset] += 1 / item.tiedCount;
  const scores = entries.map(({ row }) => row.elo), orderedRanks = entries.map(({ rank }) => rank).sort((a, b) => a - b);
  const n = sessions.length;
  const mean = n ? scores.reduce((sum, value) => sum + value, 0) / n : null;
  const medianRank = !n ? null : n % 2 ? orderedRanks[(n - 1) / 2] : (orderedRanks[n / 2 - 1] + orderedRanks[n / 2]) / 2;
  const complete = entries.filter((item) => !item.provenance);
  const wins = complete.reduce((sum, { row }) => sum + row.wins, 0), comparisons = complete.reduce((sum, { row }) => sum + row.count, 0);
  const histogram = [];
  if (n) {
    const lower = Math.floor(Math.min(...scores) / 50) * 50;
    const width = Math.max(50, Math.ceil((Math.max(...scores) - lower) / 6 / 50) * 50);
    for (let index = 0; index < 6; index++) histogram.push({ lower: lower + index * width, upper: lower + (index + 1) * width, count: 0 });
    for (const score of scores) histogram[Math.min(5, Math.floor((score - lower) / width))].count++;
  }
  return { image, faction: FACTIONS.find(({ members }) => members.includes(id)) ?? null,
    region: REGIONS.find(({ members }) => members.includes(id)), entries, positions, histogram,
    sessionCount: n, manualCount: entries.filter((item) => item.provenance).length,
    mean, medianRank, firstCount: entries.filter(({ firstPosition }) => firstPosition === 1).length,
    wins, comparisons, winRate: comparisons ? 100 * wins / comparisons : null, completeCount: complete.length };
}
