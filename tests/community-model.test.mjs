import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fitCommunity, canonicalSessions, positiveNormal, randomSource, MODEL_SETTINGS } from '../assets/community-model.js';
import { diagnose, normalQuantile } from '../assets/mcmc-diagnostics.js';
import { cohortKey, sessionFromRecord, validCommunityResult } from '../assets/bayesian-community-data.js';
const reference = JSON.parse(await readFile(new URL('./fixtures/bayesian-reference.json', import.meta.url), 'utf8'));
const diagnosticReference = JSON.parse(await readFile(new URL('./fixtures/mcmc-reference.json', import.meta.url), 'utf8'));
const input = Array.from({ length: 20 }, (_, i) => ({ id: String(i).padStart(3, '0'), pairs: [i < 14 ? [0, 1] : [1, 0]] }));
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} versus ${expected}`);
test('rank-normalized split/folded R-hat and bulk/tail ESS match independent SciPy references', () => {
  for (const fixture of diagnosticReference) { const actual = diagnose(fixture.chains); for (const field of ['rhat', 'bulkEss', 'tailEss']) close(actual[field], fixture.expected[field], 1e-5); }
  close(normalQuantile(.025), -1.959963984540054, 5e-9);
  close(normalQuantile(.9999), 3.719016485455709, 5e-9);
  assert.ok(diagnose(diagnosticReference.find(f => f.name === 'shifted').chains).rhat > 1.1);
  assert.ok(diagnose(diagnosticReference.find(f => f.name === 'different-scales').chains).rhat > 1.1);
  assert.equal(diagnose(Array.from({ length: 4 }, () => Array(100).fill(1))).rhat, Infinity);
});
test('truncated normal draws match analytical moments including a far positive tail cutoff', () => {
  // SciPy scipy.stats.truncnorm.stats(-mean, inf, loc=mean).
  for (const [mean, expectedMean, expectedVariance] of [[0,.7978845608028654,.3633802276324186],[-2,.37321553282284015,.11427910041408329],[-10,.09809323396256353,.009445377825130441],[2,2.05524786267899,.8864519483114236]]) {
    const rng = randomSource(498), draws = Array.from({ length: 80000 }, () => positiveNormal(mean, rng));
    const average = draws.reduce((s, x) => s + x, 0) / draws.length;
    const variance = draws.reduce((s, x) => s + (x - average) ** 2, 0) / draws.length;
    assert.ok(draws.every(x => x > 0 && Number.isFinite(x)));
    close(average, expectedMean, .01); close(variance, expectedVariance, .015);
  }
});
test('Bayesian score posterior agrees with independent observed-data quadrature', () => {
  const result = fitCommunity(input, 2);
  assert.equal(result.converged, true); assert.ok(result.diagnostics.maxRhat < 1.01);
  const first = result.rankings.find(r => r.index === 0);
  close(first.mean, reference.score.mean, 10); close(first.lower, reference.score.lower, 15); close(first.upper, reference.score.upper, 20);
  close(result.tasteSD.mean, reference.tau.mean, 20); close(result.tasteSD.lower, reference.tau.lower, 15); close(result.tasteSD.upper, reference.tau.upper, 40);
  close(first.firstProbability, reference.firstProbability, .015);
  close(result.rankings.reduce((s, r) => s + r.mean, 0), 2000, 1e-8);
  assert.equal(result.diagnostics.monitoredParameters, 3 + 20 * 2 + 1);
});
test('complete pairs are canonical and sessions or pair ordering cannot bias the fit', () => {
  const three = [{ id: 'B', pairs: [[1,0],[2,1],[0,2]] }, { id: 'a', pairs: [[2,1],[0,2],[1,0]] }];
  assert.deepEqual(canonicalSessions(three, 3), canonicalSessions(three.toReversed().map(s => ({ ...s, pairs: s.pairs.toReversed() })), 3));
  const settings = { ...MODEL_SETTINGS, warmup: 200, draws: 400, maxDraws: 400 };
  assert.deepEqual(fitCommunity(three,3,{settings}),fitCommunity(three.toReversed(),3,{settings}));
  assert.throws(() => canonicalSessions([...input, input[0]],2),/Duplicate/);
  assert.throws(() => canonicalSessions([{id:'a',pairs:[[0,0]]},input[0]],2),/Invalid comparison/);
  assert.throws(() => canonicalSessions([{id:'a',pairs:[]},input[0]],2),/Incomplete/);
  assert.throws(() => canonicalSessions(three.map(s => ({...s,pairs:[[0,1],[1,0],[0,2]]})),3),/Duplicate comparison/);
});
test('snapshot validation rejects mismatched, missing and forged comparison histories', async () => {
  const index=JSON.parse(await readFile(new URL('../results/index.json',import.meta.url),'utf8'));
  const item=index[0], record=JSON.parse(await readFile(new URL(`../results/${item.id}.json`,import.meta.url),'utf8'));
  assert.equal(sessionFromRecord(record,item).pairs.length,136);
  const corrupt=structuredClone(record); [corrupt.comparisons[0].winner,corrupt.comparisons[0].loser]=[corrupt.comparisons[0].loser,corrupt.comparisons[0].winner];
  assert.throws(()=>sessionFromRecord(corrupt,item),/mismatch/);
  assert.throws(()=>sessionFromRecord({...record,comparisons:record.comparisons.slice(1)},item));
  assert.throws(()=>sessionFromRecord({...record,id:index[1].id},item),/unavailable/);
  assert.equal(cohortKey(index),cohortKey(index.toReversed()));
  const manual=JSON.parse(await readFile(new URL('./fixtures/manual-result.json',import.meta.url),'utf8'));
  assert.equal(cohortKey([...index,manual]),cohortKey(index));
  const changed=structuredClone(index);changed[0].rankings[0].elo++;
  assert.notEqual(cohortKey(changed),cohortKey(index));
  assert.equal(validCommunityResult(null,15),false);assert.equal(validCommunityResult({converged:false},15),false);
});
test('tester deviations distinguish unanimous preferences from two opposing taste groups', () => {
  const pairs=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]];
  const same=Array.from({length:8},(_,i)=>({id:String(i),pairs}));
  const consensus=fitCommunity(same,4), mixed=fitCommunity(same.map((s,i)=>({...s,pairs:i%2?pairs.map(p=>p.toReversed()):pairs})),4);
  assert.equal(consensus.converged,true);assert.equal(mixed.converged,true);
  assert.deepEqual(consensus.rankings.map(r=>r.index),[0,1,2,3]);
  assert.ok(mixed.tasteSD.mean>consensus.tasteSD.mean*4);
  assert.ok(mixed.rankings.every(r=>Math.abs(r.mean-1000)<20));
  assert.ok(mixed.rankings.every(r=>r.lower<1000&&r.upper>1000));
});
