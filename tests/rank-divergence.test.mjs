import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES, TOTAL_PAIRS } from '../assets/catalog.js';
import { compareRankOrders, rankDivergence } from '../assets/rank-divergence.js';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
const rows = (score = (_, index) => 2000 - index * 50) => IMAGES.map(({ id }, index) => ({ id, elo: score(id, index) }));
function session(index, rankings = rows()) {
  const record = structuredClone(fixtures[0]);
  const scores = new Map(rankings.map(({ id, elo }) => [id, elo]));
  return { ...record, example: false, id: `00112233-4455-4677-8899-aabbccddee0${index}`, username: 'Same nickname',
    rankings: record.rankings.map((row) => ({ ...row, elo: scores.get(row.id) })) };
}

test('matching and reversed orders have exactly 0% and 100% divergence', () => {
  const own = rows();
  const matching = compareRankOrders(own, [...own].reverse());
  assert.equal(matching.percent, 0); assert.equal(matching.disagreements, 0);
  assert.equal(matching.averageMovement, 0); assert.deepEqual(matching.largestMovements, []);
  const reversed = compareRankOrders(own, rows((_, index) => 1000 + index * 50));
  assert.equal(reversed.percent, 100); assert.equal(reversed.reversed, TOTAL_PAIRS);
  assert.equal(reversed.averageMovement, 144 / 17);
});

test('one adjacent swap reverses exactly one of 136 pairs and moves only the two affected characters', () => {
  const own = rows(), reference = structuredClone(own);
  [reference[0].elo, reference[1].elo] = [reference[1].elo, reference[0].elo];
  const data = compareRankOrders(own, reference);
  assert.equal(data.reversed, 1); assert.equal(data.percent, 100 / 136);
  assert.equal(data.averageMovement, 2 / 17);
  assert.equal(data.movements[0].difference, 1);
  assert.equal(data.movements[1].difference, -1);
  assert.equal(data.largestMovements.length, 2);
});

test('divergence measures order instead of rating strength and does not mutate its inputs', () => {
  const own = rows(), before = structuredClone(own);
  const transformed = rows((_, index) => (2000 - index * 50) * 3 + 700);
  assert.equal(compareRankOrders(own, transformed).percent, 0);
  assert.deepEqual(own, before);
});

test('ties receive half weight in one ranking, no disagreement in both, and shared average positions', () => {
  const own = rows(), tied = rows(); tied[0].elo = tied[1].elo;
  const data = compareRankOrders(own, tied);
  assert.equal(data.disagreements, .5); assert.equal(data.oneSidedTies, 1);
  assert.equal(data.movements[0].globalRank, 1.5);
  assert.equal(data.movements[1].globalRank, 1.5);
  assert.equal(data.movements[0].difference, .5);
  assert.equal(compareRankOrders(tied, tied).percent, 0);
  const flat = rows(() => 1000);
  assert.equal(compareRankOrders(own, flat).percent, 50);
  assert.equal(compareRankOrders(flat, flat).sharedTies, TOTAL_PAIRS);
  assert.equal(compareRankOrders(flat, flat).percent, 0);
});

test('global reference uses other sessions only, deduplicates UUIDs and retains people with the same nickname', () => {
  const own = session(1), other = session(2, rows((_, index) => 1000 + index * 50));
  const data = rankDivergence(own.rankings, [own, { ...own, id: own.id.toUpperCase() }, other, structuredClone(other)], { id: own.id.toUpperCase() });
  assert.equal(data.percent, 100); assert.equal(data.peerCount, 1);
  assert.equal(rankDivergence(own.rankings, [own], own).status, 'empty');
  assert.equal(rankDivergence(own.rankings, [], own).status, 'empty');
  assert.equal(rankDivergence(own.rankings, [own, session(3)], own).percent, 0);
});

test('reference ordering matches mean character ratings, with equal weight across complete sessions', () => {
  const a = session(1), b = session(2, rows((_, index) => 1800 - index * 20));
  const data = rankDivergence(rows(), [a, b]);
  assert.equal(data.peerCount, 2); assert.equal(data.percent, 0);
  for (const [index, image] of IMAGES.entries()) {
    assert.equal(data.globalRankings.find(({ id }) => id === image.id).elo, 1900 - index * 35);
  }
});

test('manual recovered ratings work without win counts and identify rounded reference sessions', () => {
  const manual = JSON.parse(readFileSync(new URL('../results/c686f7b4-9284-453e-801f-899de0b7aa0b.json', import.meta.url), 'utf8'));
  const own = session(1);
  const data = rankDivergence(own.rankings, [own, manual], own);
  assert.equal(data.peerCount, 1); assert.equal(data.manualPeerCount, 1);
  assert.deepEqual(compareRankOrders(manual.rankings, manual.rankings).percent, 0);
  assert.equal(rankDivergence(manual.rankings, [own, manual], manual).manualPeerCount, 0);
});

test('invalid catalogs or invalid shared records do not produce invented comparisons', () => {
  assert.equal(compareRankOrders(rows().slice(1), rows()), null);
  for (const replacement of [null, { id: 'unknown', elo: 1000 }, { id: IMAGES[1].id, elo: 1000 },
    { id: IMAGES[0].id, elo: Infinity }, { id: IMAGES[0].id, elo: '1000' }]) {
    const invalid = rows(); invalid[0] = replacement;
    assert.equal(rankDivergence(invalid, [session(1)]), null);
  }
  assert.equal(rankDivergence(rows(), [{ ...session(1), comparisonCount: 1 }]).status, 'empty');
});
