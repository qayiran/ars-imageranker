import test from 'node:test';
import assert from 'node:assert/strict';
import { createSaveQueue, OUTBOX_KEY } from '../assets/save-queue.js';
import { createQueue, MODEL } from '../assets/ranking.js';
import { CATALOG_VERSION } from '../assets/catalog.js';
const payload = (suffix = '00') => ({ id: `00112233-4455-4677-8899-aabbccddee${suffix}`, username: 'A nickname', model: MODEL,
  catalogVersion: CATALOG_VERSION, comparisons: createQueue(() => .5).map(([winner, loser]) => ({ winner, loser })) });
const receipt = (body) => ({ saved: true, id: body.id, completedAt: '2026-10-04T18:37:00.000Z' });
function harness(send, storage = new Map()) {
  let time = 0, delay;
  const saved = [];
  const queue = createSaveQueue({ send, onSaved: (value) => saved.push(value),
    storage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    now: () => time, random: () => 0, setTimer: (_, ms) => { delay = ms; return 1; }, clearTimer: () => {},
  });
  return { queue, storage, saved, advance: (ms) => { time += ms; }, delay: () => delay };
}
test('network failures retry with backoff and clear a backup only after a matching receipt', async () => {
  let calls = 0;
  const h = harness(async (body) => { if (++calls < 3) throw new TypeError('Failed to fetch'); return receipt(body); });
  h.queue.enqueue(payload()); h.queue.start(); await h.queue.flush();
  assert.equal(h.queue.snapshot().entries.length, 1); assert.equal(h.delay(), 2000);
  await h.queue.flush(); assert.equal(calls, 1);
  h.advance(2000); await h.queue.flush(); assert.equal(calls, 2); assert.equal(h.delay(), 4000);
  h.advance(4000); await h.queue.flush(); assert.equal(calls, 3);
  assert.equal(h.queue.snapshot().entries.length, 0); assert.equal(h.saved.length, 1);
  assert.deepEqual(JSON.parse(h.storage.get(OUTBOX_KEY)), []);
});
test('a failed completed ranking survives reload and another ranking without overwriting either', async () => {
  const first = harness(async () => { throw new Error('Temporary interruption'); });
  first.queue.enqueue({ ...payload(), ip: 'strip', rankings: [9999] }); first.queue.start(); await first.queue.flush(); first.queue.stop();
  const second = harness(async (body) => receipt(body), first.storage);
  second.queue.enqueue(payload('01')); second.queue.start();
  await second.queue.flush(); // New ranking may save while the older one is in backoff.
  second.advance(2000); await second.queue.flush();
  assert.equal(second.saved.length, 2); assert.equal(second.queue.snapshot().entries.length, 0);
  assert.equal(new Set(second.saved.map((item) => item.id)).size, 2);
  assert.equal(JSON.parse(first.storage.get(OUTBOX_KEY)).length, 0);
});
test('lost or invalid receipts retry the same immutable ID instead of inventing a new result', async () => {
  const bodies = []; let attempts = 0;
  const h = harness(async (body) => { bodies.push(body); if (++attempts === 1) throw new Error('Response lost after commit'); if (attempts === 2) return { ...receipt(body), id: payload('01').id }; return receipt(body); });
  h.queue.enqueue(payload()); h.queue.start(); await h.queue.flush();
  await h.queue.retry(); assert.equal(h.queue.snapshot().entries.length, 1); assert.equal(h.saved.length, 0);
  await h.queue.retry(); assert.equal(h.saved.length, 1);
  assert.deepEqual(bodies, [payload(), payload(), payload()]);
});
test('rate limits honor Retry-After even when the user presses retry repeatedly', async () => {
  let calls = 0;
  const h = harness(async (body) => { if (++calls === 1) throw Object.assign(new Error('Rate limited'), { status: 429, retryAfterMs: 90000 }); return receipt(body); });
  h.queue.enqueue(payload()); h.queue.start(); await h.queue.flush(); assert.equal(h.delay(), 90000);
  await h.queue.retry(); assert.equal(calls, 1);
  h.advance(89999); await h.queue.retry(); assert.equal(calls, 1);
  h.advance(1); await h.queue.flush(); assert.equal(calls, 2);
});
test('permanent errors retain a downloadable backup and need explicit retry', async () => {
  const h = harness(async () => { throw Object.assign(new Error('Invalid configuration'), { status: 403 }); });
  h.queue.enqueue(payload()); h.queue.start(); await h.queue.flush();
  assert.equal(h.queue.snapshot().entries[0].blocked, true);
  assert.deepEqual(h.queue.snapshot().entries[0].payload, payload());
  h.advance(300000); await h.queue.flush(); assert.equal(h.queue.snapshot().entries[0].attempts, 1);
  await h.queue.wake(); assert.equal(h.queue.snapshot().entries[0].attempts, 1);
  await h.queue.retry(); assert.equal(h.queue.snapshot().entries[0].attempts, 2);
});
test('storage failure reports an undurable backup, but retains the in-memory payload for downloading and retries', async () => {
  const queue = createSaveQueue({ storage: { getItem: () => { throw new Error('Disabled'); }, setItem: () => { throw new Error('Quota'); } }, send: async (body) => receipt(body), setTimer: () => 1, clearTimer: () => {} });
  queue.enqueue(payload()); assert.equal(queue.snapshot().durable, false);
  assert.deepEqual(queue.snapshot().entries[0].payload, payload());
  queue.start(); await queue.flush(); assert.equal(queue.snapshot().entries.length, 0);
});
test('single flight prevents simultaneous saves and changed payloads cannot reuse a pending ID', async () => {
  let finish, calls = 0;
  const h = harness((body) => { calls++; return new Promise((resolve) => { finish = () => resolve(receipt(body)); }); });
  h.queue.enqueue(payload()); h.queue.start(); const pending = h.queue.flush(); await h.queue.flush();
  assert.equal(calls, 1);
  assert.throws(() => h.queue.enqueue({ ...payload(), username: 'Someone else' }), /different result/);
  finish(); await pending; assert.equal(h.saved.length, 1);
});
