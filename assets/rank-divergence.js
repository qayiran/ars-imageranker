import { IMAGES, TOTAL_PAIRS } from './catalog.js';
import { normalizeResults } from './results-data.js';
import { buildLeaderboard } from './leaderboard.js';

const EPSILON = 1e-9;
const direction = (difference) => Math.abs(difference) <= EPSILON ? 0 : Math.sign(difference);
export function ratingMap(rankings) {
  if (!Array.isArray(rankings) || rankings.length !== IMAGES.length) return null;
  const known = new Set(IMAGES.map(({ id }) => id)), rows = new Map();
  for (const row of rankings) {
    if (!row || !known.has(row.id) || rows.has(row.id) || !Number.isFinite(row.elo)) return null;
    rows.set(row.id, row.elo);
  }
  return rows;
}
function ranks(rows) {
  const ordered = [...rows].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const result = new Map();
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && direction(ordered[start][1] - ordered[end][1]) === 0) end++;
    const averagePosition = (start + 1 + end) / 2;
    for (let index = start; index < end; index++) result.set(ordered[index][0], averagePosition);
    start = end;
  }
  return result;
}
export function characterRanks(rankings) {
  const rows = ratingMap(rankings);
  return rows ? ranks(rows) : null;
}

// A normalized pair-order distance, not a significance test or a rating gap.
// A tie in only one ranking counts half; a shared tie counts as agreement.
export function compareRankOrders(personal, reference) {
  const own = ratingMap(personal), global = ratingMap(reference);
  if (!own || !global) return null;
  let reversed = 0, oneSidedTies = 0, sharedTies = 0;
  for (let first = 0; first < IMAGES.length; first++) {
    for (let second = first + 1; second < IMAGES.length; second++) {
      const a = IMAGES[first].id, b = IMAGES[second].id;
      const ownOrder = direction(own.get(a) - own.get(b));
      const globalOrder = direction(global.get(a) - global.get(b));
      if (!ownOrder && !globalOrder) sharedTies++;
      else if (!ownOrder || !globalOrder) oneSidedTies++;
      else if (ownOrder !== globalOrder) reversed++;
    }
  }
  const ownRanks = ranks(own), globalRanks = ranks(global);
  const movements = IMAGES.map(({ id, name }) => ({ id, name,
    personalRank: ownRanks.get(id), globalRank: globalRanks.get(id),
    // Positive means the participant places the character higher than others.
    difference: globalRanks.get(id) - ownRanks.get(id),
  }));
  const disagreements = reversed + oneSidedTies / 2;
  return { percent: 100 * disagreements / TOTAL_PAIRS, disagreements, pairCount: TOTAL_PAIRS,
    reversed, oneSidedTies, sharedTies, movements,
    averageMovement: movements.reduce((sum, row) => sum + Math.abs(row.difference), 0) / IMAGES.length,
    largestMovements: movements.filter(({ difference }) => difference !== 0)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || a.name.localeCompare(b.name)).slice(0, 3) };
}

export function rankDivergence(rankings, results, { id } = {}) {
  if (!ratingMap(rankings)) return null;
  const ownId = typeof id === 'string' ? id.toLowerCase() : null;
  const peers = normalizeResults(Array.isArray(results) ? results : [])
    .filter((item) => item.id.toLowerCase() !== ownId);
  if (!peers.length) return { status: 'empty', peerCount: 0 };
  const board = buildLeaderboard(peers);
  return { ...compareRankOrders(rankings, board.rankings), status: 'ready', peerCount: peers.length,
    manualPeerCount: board.manualCount, globalRankings: board.rankings };
}
