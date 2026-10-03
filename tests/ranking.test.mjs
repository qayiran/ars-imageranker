import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES, TOTAL_PAIRS, CATALOG_VERSION } from '../assets/catalog.js';
import { MODEL, initialRatings, rate, createQueue, autoShuffle, ratingsFrom, rankingsFrom, validateHistory, validateSubmission, normalizeUsername, pairKey } from '../assets/ranking.js';
function seeded(seed = 42) { return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const fullHistory = () => createQueue(seeded()).map(([winner, loser]) => ({ winner, loser }));
test('the fixed catalog has every unique showcase pair and an initial coverage ring', () => {
  const queue = createQueue(seeded());
  assert.equal(IMAGES.length, 17); assert.equal(TOTAL_PAIRS, 136); assert.equal(queue.length, 136);
  assert.equal(new Set(queue.map(([a, b]) => pairKey(a, b))).size, 136);
  const counts = Object.fromEntries(IMAGES.map(({ id }) => [id, 0]));
  for (const [a, b] of queue.slice(0, 17)) { counts[a]++; counts[b]++; }
  assert.ok(Object.values(counts).every((count) => count === 2));
});
test('TrueSkill matches upstream Python rate_1vs1 reference', () => {
  const ratings = initialRatings(); rate(ratings, 'connecticut', 'delaware');
  assert.ok(Math.abs(ratings.connecticut.mu - 4.3937836984746825) < 1e-5);
  assert.ok(Math.abs(ratings.connecticut.sigma - 7.168800920500324) < 1e-5);
  assert.equal(ratings.delaware.mu, -ratings.connecticut.mu);
  assert.equal(ratings.connecticut.count, 1);
  assert.ok(ratings.connecticut.sigma < 8.33);
});
test('all 136 sequential updates agree with the original Python TrueSkill implementation', () => {
  const reference = JSON.parse(readFileSync(new URL('./trueskill-reference.json', import.meta.url), 'utf8'));
  const ratings = ratingsFrom(reference.history);
  for (const [id, expected] of Object.entries(reference.ratings)) {
    assert.ok(Math.abs(ratings[id].mu - expected.mu) < 1e-5, `${id} rating diverged`);
    assert.ok(Math.abs(ratings[id].sigma - expected.sigma) < 1e-5, `${id} uncertainty diverged`);
  }
});
test('auto-shuffle preserves pairs and orders them by upstream priority', () => {
  const queue = createQueue(seeded());
  const history = queue.slice(0, 3).map(([winner, loser]) => ({ winner, loser }));
  const before = queue.slice(3), after = autoShuffle(before, history, seeded(100));
  assert.deepEqual(after.map((pair) => pairKey(...pair)).sort(), before.map((pair) => pairKey(...pair)).sort());
  const ratings = ratingsFrom(history);
  const score = ([a, b]) => Math.abs(ratings[a].mu - ratings[b].mu) + .8 * (ratings[a].count + ratings[b].count);
  for (let i = 1; i < after.length; i++) assert.ok(score(after[i - 1]) <= score(after[i]));
});
test('complete rankings contain all images and finite model uncertainty', () => {
  const history = fullHistory(); validateHistory(history, true);
  const rankings = rankingsFrom(history); assert.equal(rankings.length, 17);
  for (const rating of rankings) {
    assert.ok(Number.isFinite(rating.elo)); assert.ok(rating.sigma > 0);
    assert.equal(rating.count, 16); assert.equal(rating.wins + rating.losses, 16);
  }
  assert.equal(rankings.reduce((sum, row) => sum + row.wins, 0), 136);
  assert.deepEqual(ratingsFrom(history.slice(0, -1)), ratingsFrom([...history].slice(0, 135)));
});
test('reject incomplete, duplicate, external and self comparison histories', () => {
  const full = fullHistory();
  assert.throws(() => validateHistory(full.slice(1), true));
  assert.throws(() => validateHistory([full[0], { winner: full[0].loser, loser: full[0].winner }]));
  assert.throws(() => validateHistory([{ winner: 'outside', loser: 'connecticut' }]));
  assert.throws(() => validateHistory([{ winner: 'connecticut', loser: 'connecticut' }]));
});
test('usernames accept pseudonyms and reject executable markup and controls', () => {
  assert.equal(normalizeUsername('  sea bird_23  '), 'sea bird_23');
  assert.equal(normalizeUsername('İpek'), 'İpek');
  for (const value of ['', 'x', '<img onerror=alert(1)>', 'name\nother', 'a'.repeat(31), null]) assert.throws(() => normalizeUsername(value));
});
test('submission ignores client ratings and removes unexpected personal fields', () => {
  const payload = { id: '00112233-4455-4677-8899-aabbccddeeff', username: 'Nickname', catalogVersion: CATALOG_VERSION, model: MODEL, comparisons: fullHistory().map((item) => ({ ...item, ip: 'discard' })), rankings: [{ elo: Infinity }], email: 'discard' };
  const validated = validateSubmission(payload);
  assert.deepEqual(Object.keys(validated).sort(), ['id', 'username', 'catalogVersion', 'model', 'comparisons'].sort());
  assert.ok(validated.comparisons.every((item) => Object.keys(item).length === 2));
  assert.throws(() => validateSubmission({ ...payload, catalogVersion: 'other' }));
  assert.throws(() => validateSubmission({ ...payload, id: '../../attack' }));
});
