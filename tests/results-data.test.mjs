import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeResult, normalizeResults } from '../assets/results-data.js';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
test('retired preview records are rejected from public results', () => {
  assert.equal(normalizeResult({ ...fixtures[0], example: true }), null);
  assert.equal(normalizeResult({ ...fixtures[0], id: 'example-a' }), null);
});
test('public summaries retain valid participant results but reject corrupt or incomplete ratings', () => {
  const participant = { ...fixtures[0], username: 'A participant' };
  assert.ok(normalizeResult(participant));
  assert.equal(normalizeResult({ ...participant, comparisonCount: 1 }), null);
  assert.equal(normalizeResult({ ...participant, rankings: participant.rankings.slice(1) }), null);
  const broken = structuredClone(participant); broken.rankings[0].elo = Infinity;
  assert.equal(normalizeResult(broken), null);
  const duplicate = structuredClone(participant); duplicate.rankings[1] = duplicate.rankings[0];
  assert.equal(normalizeResult(duplicate), null);
});
test('same nicknames retain distinct full result codes, including legacy records and colliding prefixes', () => {
  const first = { ...fixtures[0], username: 'Same nickname', resultCode: 'untrusted-code' };
  const second = { ...fixtures[1], username: first.username };
  assert.equal(first.id.slice(0, 8), second.id.slice(0, 8));
  const results = normalizeResults([first, { ...first, id: first.id.toUpperCase() }, second]);
  assert.equal(results.length, 2);
  assert.equal(new Set(results.map((item) => item.resultCode)).size, 2);
  for (const item of results) {
    assert.equal(item.resultCode, item.id.toUpperCase());
    assert.equal(item.username, 'Same nickname');
    assert.equal(item.resultCode.length, 36);
  }
});
