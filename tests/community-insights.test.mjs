import { testResults } from './result-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES } from '../assets/catalog.js';
import { rankingsFrom } from '../assets/ranking.js';
import { FACTIONS, UNALIGNED } from '../assets/group-preferences.js';
import { closestMatches, preferenceConsistency, communityInsights } from '../assets/community-insights.js';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
const real = testResults();
function session(index, score = (_, i) => 2000 - i * 50) {
  const original = structuredClone(fixtures[0]);
  return { ...original, example: false, id: `00112233-4455-4677-8899-aabbccddee0${index}`, username: 'Shared nickname',
    rankings: original.rankings.map((row) => ({ ...row, elo: score(row.id, IMAGES.findIndex(({ id }) => id === row.id)) })) };
}
function comparisons(wins) {
  const history = [];
  for (let a = 0; a < IMAGES.length; a++) for (let b = a + 1; b < IMAGES.length; b++) {
    const [winner, loser] = wins(a, b) ? [a, b] : [b, a];
    history.push({ winner: IMAGES[winner].id, loser: IMAGES[loser].id });
  }
  return history;
}
function enumerateCycles(history) {
  const choices = new Set(history.map(({ winner, loser }) => `${winner}|${loser}`));
  let cycles = 0;
  for (let a = 0; a < IMAGES.length; a++) for (let b = a + 1; b < IMAGES.length; b++) for (let c = b + 1; c < IMAGES.length; c++) {
    const ids = [a, b, c].map((index) => IMAGES[index].id);
    if (ids.every((id) => ids.filter((other) => id !== other && choices.has(`${id}|${other}`)).length === 1)) cycles++;
  }
  return cycles;
}

test('taste matching excludes only the same session, keeps duplicate nicknames, and deduplicates repeated UUIDs', () => {
  const own = session(1), same = session(2), reverse = session(3, (_, i) => 1000 + i * 50);
  const matches = closestMatches(own.rankings, [own, { ...own, id: own.id.toUpperCase() }, reverse, same, same], own);
  assert.equal(matches.length, 2); assert.equal(matches[0].id, same.id);
  assert.equal(matches[0].agreement, 100); assert.equal(matches[1].agreement, 0);
  assert.deepEqual(closestMatches(own.rankings, [own], own), []);
});

test('equal similarity scores are tied with stable date/code order, and recovered scores are eligible', () => {
  const own = session(1), older = session(2), newer = { ...session(3), completedAt: '2026-10-05T12:00:00Z' };
  const matches = closestMatches(own.rankings, [older, newer], own);
  assert.equal(matches[0].agreement, matches[1].agreement); assert.equal(matches[0].id, newer.id);
  const manual = real.find((item) => item.provenance);
  assert.equal(closestMatches(manual.rankings, [manual, older], manual)[0].id, older.id);
  assert.equal(closestMatches(older.rankings, [manual], older)[0].provenance.kind, 'manual');
});

test('transitive choices have zero cycles and a single reversed extreme edge yields fifteen cycles', () => {
  const ordered = comparisons(() => true);
  const exact = preferenceConsistency(rankingsFrom(ordered));
  assert.equal(exact.triplets, 680); assert.equal(exact.cyclic, 0); assert.equal(exact.transitivePercent, 100);
  const reverseExtreme = comparisons((a, b) => !(a === 0 && b === 16));
  const data = preferenceConsistency(rankingsFrom(reverseExtreme));
  assert.equal(data.cyclic, 15); assert.equal(data.cyclic, enumerateCycles(reverseExtreme));
});

test('regular tournament reaches 204 cycles and the formula agrees with enumerating actual stored votes', () => {
  const regular = comparisons((a, b) => (b - a + 17) % 17 <= 8);
  const value = preferenceConsistency(rankingsFrom(regular));
  assert.equal(value.cyclic, 204); assert.equal(value.transitivePercent, 70);
  assert.equal(value.cyclic, enumerateCycles(regular));
  for (const item of real.filter((record) => !record.provenance)) {
    const full = JSON.parse(readFileSync(new URL(`../results/${item.id}.json`, import.meta.url), 'utf8'));
    assert.equal(preferenceConsistency(item.rankings).cyclic, enumerateCycles(full.comparisons), item.id);
  }
});

test('consistency cannot be inferred from screenshot scores or impossible win sequences', () => {
  assert.equal(preferenceConsistency(real.find((item) => item.provenance).rankings), null);
  const own = rankingsFrom(comparisons(() => true));
  const impossible = [...Array(17).keys()]; impossible[1] = 0; impossible[15] = 16;
  assert.equal(preferenceConsistency(own.map((row, index) => ({ ...row, wins: impossible[index] }))), null);
  assert.equal(preferenceConsistency(own.map((row) => ({ ...row, count: 15 }))), null);
});

test('rank spread measures participant differences, is zero for identical rankings and uses the full saved cohort', () => {
  const a = session(1), b = session(2, (_, i) => 1000 + i * 50);
  const data = communityInsights([a, b, a]);
  assert.equal(data.sessionCount, 2);
  for (const [index, image] of IMAGES.entries()) {
    const row = data.characters.find(({ id }) => id === image.id);
    assert.equal(row.meanRank, 9); assert.equal(row.spread, Math.abs(index - 8));
    assert.equal(row.bestRank, Math.min(index + 1, 17 - index));
    assert.equal(row.worstRank, Math.max(index + 1, 17 - index));
  }
  assert.ok(communityInsights([a, session(3)]).characters.every(({ spread }) => spread === 0));
  const solo = communityInsights([a]); assert.equal(solo.sessionCount, 1);
  assert.ok(solo.characters.every(({ spread }) => spread === 0));
  assert.equal(communityInsights([]).groups, null);
});

test('group means give equal session weight and normalize unequal faction sizes, including recovered scores', () => {
  const a = session(1, (id) => UNALIGNED.includes(id) ? 3000 : FACTIONS[0].members.includes(id) ? 1200 : 800);
  const b = session(2, (id) => UNALIGNED.includes(id) ? 5000 : FACTIONS[0].members.includes(id) ? 800 : 1200);
  const data = communityInsights([a, b]);
  assert.equal(data.groups.factions[0].mean, 1000); assert.equal(data.groups.factions[1].mean, 1000);
  assert.equal(data.groups.factionLeader, null);
  const complete = communityInsights(real);
  assert.equal(complete.manualCount, 1); assert.equal(complete.sessionCount, real.length);
});

test('invalid catalogs and corrupt shared records cannot invent match or community statistics', () => {
  assert.equal(closestMatches(session(1).rankings.slice(1), real), null);
  assert.equal(communityInsights([{ ...session(1), comparisonCount: 1 }]).sessionCount, 0);
});
