import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES } from '../assets/catalog.js';
import { buildLeaderboard } from '../assets/leaderboard.js';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
function participant(index) {
  return { ...structuredClone(fixtures[index % fixtures.length]), id: `00112233-4455-4677-8899-aabbccddee0${index}`, example: false, username: `Participant ${index}` };
}
test('leaderboard averages all complete ratings by character, independent of individual rank order', () => {
  const first = participant(1), second = participant(2);
  for (const row of first.rankings) row.elo = 1000 + IMAGES.findIndex(({ id }) => id === row.id) * 10;
  for (const row of second.rankings) row.elo = 1000 + (16 - IMAGES.findIndex(({ id }) => id === row.id)) * 20;
  const board = buildLeaderboard([first, second]);
  assert.equal(board.sessionCount, 2); assert.equal(board.comparisonCount, 272); assert.equal(board.rankings.length, 17);
  assert.equal(board.rankings[0].id, 'connecticut'); assert.equal(board.rankings[0].elo, 1160);
  for (const [index, image] of IMAGES.entries()) {
    const row = board.rankings.find(({ id }) => id === image.id);
    assert.equal(row.elo, 1160 - index * 5);
    const a = first.rankings.find(({ id }) => id === image.id), b = second.rankings.find(({ id }) => id === image.id);
    assert.equal(row.wins, a.wins + b.wins); assert.equal(row.count, 32);
    assert.equal(row.winRate, 100 * (a.wins + b.wins) / 32);
    assert.equal(row.minimum, Math.min(a.elo, b.elo)); assert.equal(row.maximum, Math.max(a.elo, b.elo));
  }
  assert.equal(board.rankings.reduce((sum, row) => sum + row.topVotes, 0), 2);
  assert.equal(board.rankings.find(({ id }) => id === 'connecticut').topVotes, 1);
  assert.equal(board.rankings.find(({ id }) => id === 'virginia').topVotes, 1);
});
test('retired preview records never contribute to participant totals', () => {
  const real = participant(1);
  assert.equal(buildLeaderboard([{ ...participant(2), example: true }, { ...participant(3), id: 'example-c' }, real]).sessionCount, 1);
});
test('duplicate session IDs count once, while different sessions sharing a nickname count separately', () => {
  const a = participant(1), b = participant(2); b.username = a.username;
  const board = buildLeaderboard([a, structuredClone(a), { ...a, id: a.id.toUpperCase() }, b]);
  assert.equal(board.sessionCount, 2);
  assert.equal(board.rankings.reduce((sum, row) => sum + row.wins, 0), 272);
});
test('empty or invalid submissions do not invent scores; single sessions retain their ratings', () => {
  assert.deepEqual(buildLeaderboard([]).rankings, []);
  assert.equal(buildLeaderboard([{ ...participant(1), comparisonCount: 1 }]).sessionCount, 0);
  const a = participant(1), board = buildLeaderboard([a]);
  for (const row of board.rankings) {
    assert.equal(row.elo, a.rankings.find(({ id }) => id === row.id).elo);
    assert.equal(row.minimum, row.elo); assert.equal(row.maximum, row.elo);
  }
});
