import { testResults } from './result-fixtures.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IMAGES } from '../assets/catalog.js';
import { rankingsFrom } from '../assets/ranking.js';
import { preferenceConsistency } from '../assets/community-insights.js';
import { darkHorseFavorites, ratingFingerprint, circularPreferenceExamples, loadRecordedChoices } from '../assets/taste-insights.js';
const real = testResults();
function session(id, scores) {
  return { ...structuredClone(real.find((item) => !item.provenance)), id: `00112233-4455-4677-8899-aabbccddee0${id}`,
    rankings: real.find((item) => !item.provenance).rankings.map((row) => ({ ...row, elo: scores(IMAGES.findIndex(({ id }) => id === row.id)) })) };
}
function history(reverseEdge = false) {
  const result = [];
  for (let a = 0; a < 17; a++) for (let b = a + 1; b < 17; b++) {
    const [winner, loser] = reverseEdge && a === 0 && b === 16 ? [b, a] : [a, b];
    result.push({ winner: IMAGES[winner].id, loser: IMAGES[loser].id });
  }
  return result;
}
test('dark horses exclude own UUID and deduplicate peers, using the top-five/bottom-five intersection', () => {
  const own = session(1, (i) => 2000 - i * 50), reverse = session(2, (i) => 1000 + i * 50);
  const data = darkHorseFavorites(own.rankings, [own, reverse, reverse, { ...own, id: own.id.toUpperCase() }], own);
  assert.equal(data.peerCount, 1); assert.equal(data.favorites.length, 5);
  assert.deepEqual(data.favorites.map(({ personalRank, globalRank }) => [personalRank, globalRank]), [[1,17],[2,16],[3,15],[4,14],[5,13]]);
  assert.equal(darkHorseFavorites(own.rankings, [own], own).status, 'empty');
  assert.equal(darkHorseFavorites(own.rankings.slice(1), [reverse], own), null);
});
test('cutoff-spanning ties never qualify and identical preferences have no dark horses', () => {
  const own = session(1, (i) => 2000 - (i === 5 ? 4 : i) * 50), reverse = session(2, (i) => 1000 + (i === 5 ? 4 : i) * 50);
  assert.equal(darkHorseFavorites(own.rankings, [reverse], own).favorites.length, 4);
  const boundary = session(3, (i) => 1000 + (i >= 3 && i <= 5 ? 4 : i) * 50);
  assert.equal(darkHorseFavorites(session(4,(i)=>2000-i*50).rankings,[boundary]).favorites.length,3);
  const equal = session(5, () => 1000);
  assert.deepEqual(darkHorseFavorites(equal.rankings, [reverse], equal).favorites, []);
  assert.deepEqual(darkHorseFavorites(own.rankings, [own]).favorites, []);
  const manual = real.find((item) => item.provenance);
  assert.equal(darkHorseFavorites(own.rankings, [manual], own).manualPeerCount, 1);
});
test('fingerprints center all 17 scores, preserve catalog order and are invariant to a rating offset', () => {
  const own = session(1, (i) => 2000 - i * 50), data = ratingFingerprint(own.rankings);
  assert.equal(data.mean, 1600); assert.equal(data.extent, 400);
  assert.deepEqual(data.rows.map(({ id }) => id), IMAGES.map(({ id }) => id));
  assert.equal(data.rows[0].difference, 400); assert.equal(data.rows.at(-1).difference, -400);
  assert.equal(data.rows.reduce((sum, row) => sum + row.difference, 0), 0);
  assert.deepEqual(ratingFingerprint(own.rankings.map((row) => ({ ...row, elo: row.elo + 730 }))).rows.map(({ difference }) => difference), data.rows.map(({ difference }) => difference));
  assert.ok(ratingFingerprint(session(2, () => 1000).rankings).rows.every(({ difference }) => difference === 0));
  assert.equal(ratingFingerprint([...own.rankings.slice(1),own.rankings[1]]), null);
});
test('circular examples enumerate actual directed cycles and agree with exact counts for every stored normal result', () => {
  assert.deepEqual(circularPreferenceExamples(history()), []);
  const choices = history(true), cycles = circularPreferenceExamples(choices, rankingsFrom(choices));
  assert.equal(cycles.length, 15);
  for (const cycle of cycles) for (let i=0;i<3;i++) assert.ok(choices.some(({winner,loser})=>winner===cycle[i].id&&loser===cycle[(i+1)%3].id));
  for (const item of real.filter((item)=>!item.provenance)) {
    const record=JSON.parse(readFileSync(new URL(`../results/${item.id}.json`, import.meta.url)));
    assert.equal(circularPreferenceExamples(record.comparisons,item.rankings).length,preferenceConsistency(item.rankings).cyclic);
  }
  assert.equal(circularPreferenceExamples(choices.slice(1)), null);
  assert.equal(circularPreferenceExamples([...choices.slice(1),choices[1]]), null);
  const mismatched=rankingsFrom(choices); mismatched[0].wins--;
  assert.equal(circularPreferenceExamples(choices,mismatched),null);
  assert.equal(circularPreferenceExamples(undefined,real.find((item)=>item.provenance).rankings),null);
});
test('unconfigured previews load fixed local histories and reject mismatching or incomplete records', async () => {
  const normal=real.find((item)=>!item.provenance), record=JSON.parse(readFileSync(new URL(`../results/${normal.id}.json`,import.meta.url)));
  const previous=globalThis.fetch; let payload=record;
  globalThis.fetch=async(url)=>{ if (url.pathname.endsWith('/config.json')) return Response.json({resultsApiUrl:''}); assert.ok(url.pathname.endsWith(`/results/${normal.id}.json`)); return Response.json(payload); };
  try {
    assert.equal((await loadRecordedChoices(normal.id,normal.rankings)).length,preferenceConsistency(normal.rankings).cyclic);
    payload={...record,id:'00112233-4455-4677-8899-aabbccddeeaa'};
    await assert.rejects(loadRecordedChoices(normal.id,normal.rankings));
    payload={...record,comparisons:record.comparisons.slice(1)};
    await assert.rejects(loadRecordedChoices(normal.id,normal.rankings));
    await assert.rejects(loadRecordedChoices('../index',normal.rankings));
  } finally { globalThis.fetch=previous; }
});
test('configured histories use the live service with no static-file fallback or credentials', async (t) => {
  const normal=real.find((item)=>!item.provenance), record=JSON.parse(readFileSync(new URL(`../results/${normal.id}.json`,import.meta.url)));
  let api='https://history.test/', mode='ready', reads=0;
  t.mock.method(globalThis,'fetch',async (url,options)=>{
    assert.equal(options.credentials,'omit'); assert.equal(options.referrerPolicy,'no-referrer'); assert.equal(options.cache,'no-store');
    if (String(url).endsWith('/config.json')) return Response.json({resultsApiUrl:api});
    assert.equal(String(url),`https://history.test/results/${normal.id}`); reads++;
    if(mode==='failure') return Response.json({error:'Unavailable'},{status:503});
    return Response.json(mode==='invalid'?{...record,comparisons:record.comparisons.slice(1)}:record);
  });
  assert.equal((await loadRecordedChoices(normal.id.toUpperCase(),normal.rankings)).length,preferenceConsistency(normal.rankings).cyclic);
  mode='failure'; await assert.rejects(loadRecordedChoices(normal.id,normal.rankings));
  mode='invalid'; await assert.rejects(loadRecordedChoices(normal.id,normal.rankings));
  for(const invalid of ['http://history.test','https://user:pass@history.test','https://history.test?key=secret','https://history.test#fragment']) {
    api=invalid; await assert.rejects(loadRecordedChoices(normal.id,normal.rankings));
  }
  assert.equal(reads,3);
});
