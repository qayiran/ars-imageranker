import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { studentTCritical95, meanConfidenceInterval95 } from '../assets/confidence-interval.js';
import { buildLeaderboard } from '../assets/leaderboard.js';
const reference = JSON.parse(readFileSync(new URL('./fixtures/confidence-reference.json', import.meta.url)));
const fixture = JSON.parse(readFileSync(new URL('./fixtures/participant-results.json', import.meta.url)))[0];
function session(index, score) {
  return { ...structuredClone(fixture), example: false, id: `00112233-4455-4677-8899-${String(index).padStart(12, '0')}`,
    rankings: fixture.rankings.map(row => ({ ...row, elo: score })) };
}
test('95% Student-t critical values agree with independent SciPy references for small and large cohorts', () => {
  for (const { df, value } of reference.criticals) assert.ok(Math.abs(studentTCritical95(df) - value) < 3e-8, `df=${df}`);
  for (const df of [0, -1, NaN, Infinity, 1.5]) assert.equal(studentTCritical95(df), null);
});
test('mean intervals match SciPy, use sample variance and retain score offset/scale', () => {
  const interval = meanConfidenceInterval95(reference.scores);
  assert.equal(interval.n, 5); assert.equal(interval.level, .95);
  assert.ok(Math.abs(interval.lower - reference.bounds[0]) < 1e-8);
  assert.ok(Math.abs(interval.upper - reference.bounds[1]) < 1e-8);
  const shifted = meanConfidenceInterval95(reference.scores.map(value => value + 100));
  assert.ok(Math.abs(shifted.lower - interval.lower - 100) < 1e-8);
  const scaled = meanConfidenceInterval95(reference.scores.map(value => value * 2));
  assert.ok(Math.abs(scaled.upper - interval.upper * 2) < 1e-8);
});
test('small cohorts do not invent certainty; constant scores have zero observed sampling variance', () => {
  for (const values of [[], [1000], [1000, NaN], [Infinity, 1200], null]) assert.equal(meanConfidenceInterval95(values), null);
  const constant = meanConfidenceInterval95([1000,1000,1000]);
  assert.equal(constant.lower, 1000); assert.equal(constant.upper, 1000);
  const small = meanConfidenceInterval95([1000, 1200]);
  assert.ok(small.lower < 1000 && small.upper > 1200, 'Do not clip a small-sample interval to observed scores');
});
test('global intervals use complete sessions equally, deduplicate UUIDs and leave means and win statistics intact', () => {
  const sessions = reference.scores.map((score,index) => session(index, score));
  const before = structuredClone(sessions), board = buildLeaderboard([...sessions, sessions[0], { ...sessions[0], id: sessions[0].id.toUpperCase() }]);
  assert.equal(board.sessionCount, 5); assert.deepEqual(sessions, before);
  for (const row of board.rankings) {
    assert.equal(row.elo, 1200); assert.equal(row.confidenceInterval.n, 5);
    assert.ok(Math.abs(row.confidenceInterval.lower - reference.bounds[0]) < 1e-8);
    assert.equal(row.count, 80);
  }
  assert.ok(buildLeaderboard([sessions[0]]).rankings.every(row => row.confidenceInterval === null));
});
