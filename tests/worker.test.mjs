import test from 'node:test';
import assert from 'node:assert/strict';
import { manualFixture } from './result-fixtures.mjs';
import worker from '../server/worker.js';
import { createQueue, MODEL } from '../assets/ranking.js';
import { CATALOG_VERSION } from '../assets/catalog.js';
const env = { GITHUB_TOKEN: 'server-secret', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo', GITHUB_BRANCH: 'main', ALLOWED_ORIGIN: 'https://owner.github.io' };
const body = (id = '00112233-4455-4677-8899-aabbccddeeff') => ({ id, username: 'A pseudonym', model: MODEL, catalogVersion: CATALOG_VERSION, comparisons: createQueue(() => .3).map(([winner, loser]) => ({ winner, loser })), ip: 'must-not-save', rankings: [{ elo: 99999 }] });
function request(data, origin = env.ALLOWED_ORIGIN) { return new Request('https://results.example/results', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); }
function mockRepo(t, options = {}) {
  const files = new Map(); let nextSha = 0, writes = 0, indexConflict = options.indexConflict, failIndex = options.failIndex;
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(init.headers.Authorization, 'Bearer server-secret');
    const path = new URL(url).pathname.split('/contents/')[1];
    assert.ok(path, `unexpected API path ${url}`);
    if (init.method === 'PUT') {
      const data = JSON.parse(init.body);
      const existing = files.get(path);
      if (path === 'results/index.json' && failIndex) return Response.json({ message: 'token-secret-must-not-leak' }, { status: 500 });
      if (path === 'results/index.json' && indexConflict) {
        indexConflict = false;
        const other = { id: 'other-session', completedAt: '2026-01-01T00:00:00Z', username: 'Concurrent participant' };
        files.set(path, { sha: 'concurrent-sha', content: [other] });
        return Response.json({}, { status: 409 });
      }
      if ((existing && data.sha !== existing.sha) || (!existing && data.sha)) return Response.json({}, { status: 409 });
      const content = JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
      const sha = String(++nextSha).padStart(40, '0'); files.set(path, { sha, content }); writes++;
      return Response.json({ commit: { sha, html_url: `https://github.com/owner/repo/commit/${sha}` } }, { status: 201 });
    }
    const file = files.get(path);
    return file ? Response.json({ type: 'file', sha: file.sha, encoding: 'base64', content: Buffer.from(JSON.stringify(file.content)).toString('base64') }) : Response.json({}, { status: 404 });
  });
  return { files, writes: () => writes, repair: () => { failIndex = false; } };
}
test('save persists a recomputed record and a public index, with no personal metadata', async (t) => {
  const repo = mockRepo(t), data = body();
  data.resultCode = 'client-supplied-code';
  data.provenance = { kind: 'manual', source: 'screenshot' };
  const response = await worker.fetch(request(data), env); assert.equal(response.status, 201);
  const receipt = await response.json(); assert.equal(receipt.saved, true); assert.equal(receipt.id, data.id);
  const record = repo.files.get(`results/${data.id}.json`).content;
  assert.equal(record.rankings.length, 17); assert.notEqual(record.rankings[0].elo, 99999); assert.equal(record.ip, undefined);
  assert.equal(record.resultCode, data.id.toUpperCase());
  assert.equal(record.provenance, undefined);
  assert.equal(repo.files.get('results/index.json').content[0].resultCode, record.resultCode);
  assert.equal(repo.files.get('results/index.json').content.length, 1);
  const list = await worker.fetch(new Request('https://results.example/results'), env); assert.equal((await list.json()).length, 1);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
});
test('retry is idempotent and cannot overwrite an existing session', async (t) => {
  const repo = mockRepo(t), data = body();
  await worker.fetch(request(data), env);
  const count = repo.writes();
  assert.equal((await worker.fetch(request(data), env)).status, 201); assert.equal(repo.writes(), count);
  assert.equal((await worker.fetch(request({ ...data, username: 'different name' }), env)).status, 409);
});
test('concurrent index updates are merged using SHA retries', async (t) => {
  const repo = mockRepo(t, { indexConflict: true });
  assert.equal((await worker.fetch(request(body()), env)).status, 201);
  assert.equal(repo.files.get('results/index.json').content.length, 2);
  assert.ok(repo.files.get('results/index.json').content.some((item) => item.id === 'other-session'));
});
test('a partial save is repaired on retry without duplicate records', async (t) => {
  const repo = mockRepo(t, { failIndex: true }), data = body();
  const failed = await worker.fetch(request(data), env); assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('token-secret-must-not-leak')); assert.ok(repo.files.has(`results/${data.id}.json`));
  repo.repair(); assert.equal((await worker.fetch(request(data), env)).status, 201);
  assert.equal(repo.files.get('results/index.json').content.length, 1); assert.equal(repo.writes(), 2);
});
test('CORS rejects unexpected origins and supports preflight', async () => {
  assert.equal((await worker.fetch(request(body(), 'https://outside.example'), env)).status, 403);
  const preflight = await worker.fetch(new Request('https://results.example/results', { method: 'OPTIONS', headers: { Origin: env.ALLOWED_ORIGIN } }), env);
  assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  const absent = request(body()); absent.headers.delete('Origin'); assert.equal((await worker.fetch(absent, env)).status, 403);
});
test('invalid or unfinished sessions, oversized payloads and wrong media types are rejected', async () => {
  const data = body();
  assert.equal((await worker.fetch(request({ ...data, comparisons: data.comparisons.slice(1) }), env)).status, 400);
  assert.equal((await worker.fetch(request({ ...data, extra: 'a'.repeat(70000) }), env)).status, 413);
  const wrongType = request(data); wrongType.headers.set('Content-Type', 'text/plain');
  assert.equal((await worker.fetch(wrongType, env)).status, 415);
  assert.equal((await worker.fetch(new Request('https://results.example/results'), {})).status, 503);
});
test('the native rate limiter returns retryable errors without writing a result', async () => {
  const limited = { ...env, SUBMISSIONS_LIMITER: { limit: async () => ({ success: false }) } };
  const response = await worker.fetch(request(body()), limited);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal(response.headers.get('Access-Control-Expose-Headers'), 'Retry-After');
});
test('a newly saved history is readable immediately without Pages publication or repository writes', async (t) => {
  const repo = mockRepo(t), data = body();
  await worker.fetch(request(data), env);
  const stored = repo.files.get(`results/${data.id}.json`).content;
  stored.privateMetadata = 'must-not-expose'; stored.rankings[0].extra = 'must-not-expose';
  stored.comparisons[0].ip = 'must-not-expose';
  const before = repo.writes();
  const limited = { ...env, SUBMISSIONS_LIMITER: { limit: () => { throw new Error('Reads must not consume save limits'); } } };
  const response = await worker.fetch(new Request(`https://results.example/results/${data.id.toUpperCase()}`, { headers: { Origin: env.ALLOWED_ORIGIN } }), limited);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), env.ALLOWED_ORIGIN);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const record = await response.json();
  assert.equal(record.id, data.id); assert.equal(record.rankings.length, 17);
  assert.deepEqual(record.comparisons, data.comparisons);
  assert.equal(record.privateMetadata, undefined); assert.equal(record.rankings[0].extra, undefined);
  assert.equal(repo.writes(), before);
});
test('history routes reject unknown IDs, wrong methods, unexpected origins and invalid stored choices', async (t) => {
  const repo = mockRepo(t), data = body(), url = `https://results.example/results/${data.id}`;
  assert.equal((await worker.fetch(new Request(url), env)).status, 404);
  assert.equal((await worker.fetch(new Request(url, { method: 'POST' }), env)).status, 405);
  assert.equal((await worker.fetch(new Request(url, { headers: { Origin: 'https://outside.example' } }), env)).status, 403);
  for (const path of ['/results/index.json', '/results/not-a-uuid', `/results/${data.id}/extra`]) {
    assert.equal((await worker.fetch(new Request(`https://results.example${path}`), env)).status, 404);
  }
  await worker.fetch(request(data), env);
  const stored = repo.files.get(`results/${data.id}.json`).content;
  stored.comparisons.pop();
  const invalid = await worker.fetch(new Request(url), env);
  assert.equal(invalid.status, 503); assert.ok(!(await invalid.text()).includes('server-secret'));
  stored.id = '00112233-4455-4677-8899-aabbccddeeaa';
  assert.equal((await worker.fetch(new Request(url), env)).status, 503);
  assert.equal(repo.writes(), 2);
});
test('manual histories remain explicitly absent, and repository failures stay retryable', async (t) => {
  const repo = mockRepo(t);
  const manual = structuredClone(manualFixture);
  repo.files.set(`results/${manual.id}.json`, { sha: 'manual-sha', content: { ...manual, comparisons: [{ winner: 'fake' }] } });
  const response = await worker.fetch(new Request(`https://results.example/results/${manual.id}`), env);
  assert.equal(response.status, 200);
  const record = await response.json();
  assert.equal(record.provenance.kind, 'manual'); assert.equal(record.comparisons, undefined);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'server-secret' }, { status: 503 }));
  const failed = await worker.fetch(new Request(`https://results.example/results/${body().id}`), env);
  assert.equal(failed.status, 503); assert.ok(!(await failed.text()).includes('server-secret'));
});
