import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { IMAGES } from '../assets/catalog.js';
import { normalizeResult } from '../assets/results-data.js';
import { buildLeaderboard } from '../assets/leaderboard.js';
import { validateSubmission } from '../assets/ranking.js';
import { makeScreenshotResult, importScreenshotResult } from '../scripts/import-result.mjs';
const input = () => ({ id: 'c686f7b4-9284-453e-801f-899de0b7aa0b', username: 'nisacx', completedAt: '2026-10-04T21:37:00+03:00', rankings: IMAGES.map(({ id }, index) => ({ id, elo: 1700 - index * 70 })) });
test('owner screenshot imports preserve rounded scores, local completion time and explicitly unknown statistics', () => {
  const record = makeScreenshotResult(input());
  assert.equal(record.completedAt, '2026-10-04T18:37:00.000Z');
  assert.equal(record.provenance.kind, 'manual');
  assert.ok(record.rankings.every((row) => row.uncertainty === null && row.wins === null && row.count === null));
  assert.deepEqual(normalizeResult(record), record);
  assert.throws(() => makeScreenshotResult({ ...input(), completedAt: '2026-10-04T21:37:00' }), /timezone/);
  assert.throws(() => makeScreenshotResult({ ...input(), rankings: input().rankings.slice(1) }), /17/);
  assert.throws(() => validateSubmission({ ...record, comparisons: [] }), /incomplete/);
});
test('mixed leaderboards include manual score means and first-place votes but exclude partial wins from totals', async () => {
  const [normal] = JSON.parse(await readFile(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
  const manualInput = input(); manualInput.rankings[0].wins = 16; manualInput.rankings[0].count = 16;
  const manual = makeScreenshotResult(manualInput), board = buildLeaderboard([normal, manual]);
  assert.equal(board.sessionCount, 2); assert.equal(board.manualCount, 1); assert.equal(board.comparisonCount, 272);
  for (const row of board.rankings) {
    const original = normal.rankings.find(({ id }) => id === row.id), recovered = manual.rankings.find(({ id }) => id === row.id);
    assert.equal(row.elo, (original.elo + recovered.elo) / 2);
    assert.equal(row.wins, original.wins); assert.equal(row.count, 16);
  }
  assert.ok(buildLeaderboard([manual]).rankings.every((row) => row.winRate === null && row.count === 0));
});
test('screenshot interval estimates stay distinct from exact uncertainty and require explicit provenance', () => {
  const measured = input(); measured.endpointAccuracy = 5;
  for (const row of measured.rankings) row.estimatedInterval = { lower: row.elo - 200, upper: row.elo + 200 };
  const record = makeScreenshotResult(measured);
  assert.equal(record.provenance.intervals, 'estimated-from-screenshot');
  assert.equal(record.provenance.endpointAccuracy, 5);
  assert.ok(record.rankings.every((row) => row.uncertainty === null && row.estimatedInterval.lower === row.elo - 200));
  assert.deepEqual(normalizeResult(record), record);
  const unmarked = structuredClone(record); delete unmarked.provenance.intervals;
  assert.equal(normalizeResult(unmarked), null);
  for (const interval of [{ lower: NaN, upper: 1900 }, { lower: 1700, upper: 1500 }, { lower: 100, upper: 2000 }, null]) {
    const invalid = structuredClone(record); invalid.rankings[0].estimatedInterval = interval;
    assert.equal(normalizeResult(invalid), null);
  }
  const exact = structuredClone(record); exact.rankings[0].uncertainty = 100;
  assert.equal(normalizeResult(exact), null);
});
test('nisacx estimated boundaries reproduce a calibrated screenshot axis within pixel resolution', async () => {
  const data = JSON.parse(await readFile(new URL('./fixtures/nisacx-interval-measurements.json', import.meta.url), 'utf8'));
  const meanScore = data.rows.reduce((sum, row) => sum + row.elo, 0) / data.rows.length;
  const meanPixel = data.rows.reduce((sum, row) => sum + row.dotPixel, 0) / data.rows.length;
  const slope = data.rows.reduce((sum, row) => sum + (row.elo - meanScore) * (row.dotPixel - meanPixel), 0) / data.rows.reduce((sum, row) => sum + (row.elo - meanScore) ** 2, 0);
  const intercept = meanPixel - slope * meanScore;
  assert.ok(Math.abs(1 / slope - 3.2) < .01);
  for (const row of data.rows) {
    assert.equal(Math.round((row.leftPixel - intercept) / slope), row.lowerEstimate);
    assert.equal(Math.round((row.rightPixel - intercept) / slope), row.upperEstimate);
    assert.ok(Math.abs(row.dotPixel - (intercept + slope * row.elo)) < 1);
    assert.ok(Math.abs((row.lowerEstimate + row.upperEstimate) / 2 - row.elo) < 2);
  }
});
test('owner import keeps existing participants, is idempotent, and rejects overwriting a result code', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ars-import-test-'));
  const fixtures = JSON.parse(await readFile(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
  await writeFile(join(directory, 'index.json'), JSON.stringify(fixtures));
  const record = await importScreenshotResult(input(), directory);
  await importScreenshotResult(input(), directory);
  const results = JSON.parse(await readFile(join(directory, 'index.json'), 'utf8'));
  assert.equal(results.length, fixtures.length + 1); assert.ok(results.some((item) => item.id === record.id));
  await assert.rejects(importScreenshotResult({ ...input(), username: 'Different' }, directory), /different data/);
  const invalid = structuredClone(record); invalid.rankings[0].uncertainty = 10;
  assert.equal(normalizeResult(invalid), null);
});
