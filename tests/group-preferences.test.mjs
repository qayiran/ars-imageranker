import { manualFixture } from './result-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES } from '../assets/catalog.js';
import { groupPreferences, FACTIONS, REGIONS, UNALIGNED } from '../assets/group-preferences.js';

const ratings = (value = 1000) => IMAGES.map(({ id }, index) => ({ id, elo: typeof value === 'function' ? value(id, index) : value }));
const mean = (data, id) => [...data.factions, ...data.regions].find((group) => group.id === id).mean;

test('character assignments partition factions plus neither, and all geographic regions', () => {
  const catalog = IMAGES.map(({ id }) => id).sort();
  assert.deepEqual([...FACTIONS.flatMap(({ members }) => members), ...UNALIGNED].sort(), catalog);
  assert.deepEqual(REGIONS.flatMap(({ members }) => members).sort(), catalog);
  assert.deepEqual(FACTIONS.map(({ members }) => members.length), [11, 4]);
  assert.deepEqual(REGIONS.map(({ members }) => members.length), [6, 4, 7]);
  assert.deepEqual(FACTIONS.map(({ leader }) => leader), ['masachusetts', 'new-york']);
});

test('equal ratings give equal faction and regional scores regardless of different group sizes', () => {
  const data = groupPreferences(ratings());
  assert.equal(data.factionLeader, null);
  assert.equal(data.difference, 0);
  assert.equal(data.regionalLeaders.length, 3);
  assert.ok([...data.factions, ...data.regions].every(({ mean }) => mean === 1000));
  assert.ok(data.scale.maximum > data.scale.minimum);
});

test('factions use per-character means, omit unaligned characters and do not boost leaders', () => {
  const data = groupPreferences(ratings((id) => UNALIGNED.includes(id) ? 9000 : FACTIONS[0].members.includes(id) ? 1200 : 800));
  assert.equal(mean(data, 'patriots'), 1200);
  assert.equal(mean(data, 'loyalists'), 800);
  assert.equal(data.difference, 400);
  assert.equal(data.factionLeader, 'patriots');
  const leaderOnly = groupPreferences(ratings((id) => id === 'new-york' ? 1400 : 1000));
  assert.equal(mean(leaderOnly, 'loyalists'), 1100);
  assert.equal(leaderOnly.difference, -100);
  assert.equal(leaderOnly.factionLeader, 'loyalists');
});

test('regional means cover all seventeen characters, preserve fractional scores and ignore rank order', () => {
  const rows = ratings((id) => REGIONS[0].members.includes(id) ? 1300.25 : REGIONS[1].members.includes(id) ? 1100.5 : 900.125);
  const data = groupPreferences(rows);
  assert.equal(mean(data, 'new-england'), 1300.25);
  assert.equal(mean(data, 'middle'), 1100.5);
  assert.equal(mean(data, 'southern'), 900.125);
  assert.deepEqual(data.regionalLeaders, ['new-england']);
  assert.deepEqual(groupPreferences([...rows].reverse()), data);
  const tiny = groupPreferences(ratings((id) => id === 'new-york' ? 1000.04 : 1000));
  assert.equal(tiny.factionLeader, 'loyalists');
  assert.deepEqual(tiny.regionalLeaders, ['middle']);
});

test('screenshot ratings produce honest averages without needing missing wins or model uncertainty', () => {
  const manual = structuredClone(manualFixture);
  const data = groupPreferences(manual.rankings);
  assert.equal(mean(data, 'patriots'), 10042 / 11);
  assert.equal(mean(data, 'loyalists'), 4680 / 4);
  assert.equal(mean(data, 'new-england'), 6251 / 6);
  assert.equal(mean(data, 'middle'), 3203 / 4);
  assert.equal(mean(data, 'southern'), 7856 / 7);
  assert.equal(data.factionLeader, 'loyalists');
  assert.deepEqual(data.regionalLeaders, ['southern']);
  assert.deepEqual(groupPreferences(manual.rankings.map(({ id, elo }) => ({ id, elo }))), data);
});

test('missing, duplicate, unknown or non-finite ratings never invent group estimates', () => {
  assert.equal(groupPreferences(null), null);
  assert.equal(groupPreferences(ratings().slice(1)), null);
  for (const replacement of [{ id: 'unknown', elo: 1000 }, { id: IMAGES[1].id, elo: 1000 },
    { id: IMAGES[0].id, elo: NaN }, { id: IMAGES[0].id, elo: Infinity }, { id: IMAGES[0].id, elo: '1000' }, null]) {
    const rows = ratings(); rows[0] = replacement;
    assert.equal(groupPreferences(rows), null);
  }
});
