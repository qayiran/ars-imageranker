import { testResults } from './result-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES } from '../assets/catalog.js';
import { characterProfile } from '../assets/exploration-data.js';
import { resultCardData } from '../assets/result-card.js';
const real = testResults();
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
function session(index, score = (_, i) => 2000 - i * 50) {
  const item = structuredClone(fixtures[0]);
  return { ...item, example: false, id: `00112233-4455-4677-8899-aabbccddee0${index}`,
    rankings: item.rankings.map((row) => ({ ...row, elo: score(row.id, IMAGES.findIndex(({ id }) => id === row.id)) })) };
}
test('character profiles show actual mean, median positions and distributions over deduplicated complete sessions', () => {
  const a = session(1), b = session(2, (_, i) => 1000 + i * 50);
  const profile = characterProfile('connecticut', [a, b, a]);
  assert.deepEqual(profile.entries.map(({ row }) => row.elo), [2000, 1000]);
  assert.deepEqual(characterProfile('connecticut', [b, a]).entries.map(({ id }) => id), profile.entries.map(({ id }) => id));
  assert.equal(profile.sessionCount, 2); assert.equal(profile.mean, 1500); assert.equal(profile.medianRank, 9);
  assert.equal(profile.positions[0], 1); assert.equal(profile.positions[16], 1);
  assert.equal(profile.firstCount, 1); assert.equal(profile.histogram.reduce((sum, row) => sum + row.count, 0), 2);
  assert.equal(profile.faction.id, 'patriots'); assert.equal(profile.region.id, 'new-england');
  assert.equal(characterProfile('vermont', [a]).faction, null);
  assert.equal(characterProfile('unknown', [a]), null);
});
test('tied positions split result weight equally and count shared first places without alphabetical bias', () => {
  const tied = session(1, () => 1000);
  const data = characterProfile('connecticut', [tied]);
  assert.equal(data.medianRank, 9); assert.equal(data.firstCount, 1);
  assert.ok(data.positions.every((value) => value === 1 / 17));
  assert.ok(Math.abs(data.positions.reduce((a, b) => a + b) - 1) < 1e-12);
  assert.equal(data.histogram[0].count, 1);
});
test('histogram boundary values are assigned once, including the maximum edge', () => {
  const cases = [1000, 1050, 1100, 1150, 1200, 1250, 1300].map((value, index) => session(index, () => value));
  const data = characterProfile('connecticut', cases);
  assert.deepEqual(data.histogram.map(({ count }) => count), [1, 1, 1, 1, 1, 2]);
  assert.equal(data.histogram.at(-1).upper, 1300);
});
test('profiles include recovered ratings but exclude partial win statistics and handle honest empty states', () => {
  const manual = real.find((item) => item.provenance), normal = real.find((item) => !item.provenance);
  const data = characterProfile('louisiana', [manual, normal]);
  const row = normal.rankings.find(({ id }) => id === 'louisiana');
  assert.equal(data.manualCount, 1); assert.equal(data.completeCount, 1);
  assert.equal(data.mean, (1711 + row.elo) / 2); assert.equal(data.wins, row.wins); assert.equal(data.comparisons, 16);
  const empty = characterProfile('louisiana', []);
  assert.equal(empty.mean, null); assert.equal(empty.winRate, null); assert.deepEqual(empty.histogram, []);
});
test('result card uses canonical top three, full result code and unchanged group normalization', () => {
  const manual = real.find((item) => item.provenance);
  const data = resultCardData([...manual.rankings].reverse(), manual);
  assert.equal(data.username, 'Recovered fixture'); assert.equal(data.code, manual.id.toUpperCase());
  assert.deepEqual(data.top.map(({ id }) => id), ['louisiana', 'connecticut', 'south-carolina']);
  assert.equal(data.faction.id, 'loyalists'); assert.equal(data.region.id, 'southern'); assert.ok(data.provenance);
  assert.equal(resultCardData(manual.rankings, { ...manual, id: 'bad' }), null);
  assert.equal(resultCardData(manual.rankings.slice(1), manual), null);
});
