import { CATALOG_VERSION } from './catalog.js';
import { validateSubmission } from './ranking.js';

export const OUTBOX_KEY = `showcase-outbox:${CATALOG_VERSION}`;
// Completed submissions live separately from the editable/current session.
// The server's immutable session ID makes retries safe after a lost receipt.
export function createSaveQueue({ storage, send, onChange = () => {}, onSaved = () => {}, now = Date.now,
  setTimer = setTimeout, clearTimer = clearTimeout, random = Math.random }) {
  let entries = new Map(), volatile = new Map(), timer, running = false, started = false, activeId = null;
  let durable = true;
  function read() {
    try {
      const data = JSON.parse(storage.getItem(OUTBOX_KEY) || '[]');
      if (!Array.isArray(data)) throw new Error('Invalid backup queue');
      entries = new Map(data.flatMap((entry) => {
        try {
          const payload = validateSubmission(entry.payload);
          return [[payload.id, { payload, attempts: Number.isInteger(entry.attempts) && entry.attempts >= 0 ? entry.attempts : 0,
            nextAttemptAt: Number.isFinite(entry.nextAttemptAt) ? entry.nextAttemptAt : 0,
            notBefore: Number.isFinite(entry.notBefore) ? entry.notBefore : 0,
            blocked: entry.blocked === true, error: typeof entry.error === 'string' ? entry.error : '' }]];
        } catch { return []; }
      }));
      for (const [id, entry] of volatile) entries.set(id, entry);
    } catch { durable = false; }
  }
  function write() {
    try { storage.setItem(OUTBOX_KEY, JSON.stringify([...entries.values()])); volatile.clear(); durable = true; }
    catch { volatile = new Map(entries); durable = false; }
  }
  function snapshot() { return { entries: [...entries.values()].map((entry) => structuredClone(entry)), durable, activeId }; }
  function changed() { onChange(snapshot()); }
  function schedule() {
    clearTimer(timer);
    if (!started || running) return;
    const pending = [...entries.values()].filter((entry) => !entry.blocked);
    if (pending.length) timer = setTimer(() => void flush(), Math.max(0, Math.min(...pending.map((entry) => entry.nextAttemptAt)) - now()));
  }
  function enqueue(input) {
    const payload = validateSubmission(input);
    read();
    const existing = entries.get(payload.id);
    if (existing && JSON.stringify(existing.payload) !== JSON.stringify(payload)) throw new Error('This session ID already belongs to a different result.');
    if (!existing) entries.set(payload.id, { payload, attempts: 0, nextAttemptAt: 0, notBefore: 0, blocked: false, error: '' });
    write(); changed(); schedule();
  }
  async function flush() {
    if (running || !started) return;
    read();
    const entry = [...entries.values()].find((item) => !item.blocked && item.nextAttemptAt <= now());
    if (!entry) { schedule(); return; }
    running = true; activeId = entry.payload.id; changed();
    try {
      const receipt = await send(entry.payload);
      if (receipt?.saved !== true || receipt.id !== entry.payload.id || typeof receipt.completedAt !== 'string' || !Number.isFinite(Date.parse(receipt.completedAt))) {
        throw new Error('The service did not confirm that your ranking was saved.');
      }
      read(); entries.delete(entry.payload.id); volatile.delete(entry.payload.id); write();
      onSaved(receipt);
    } catch (error) {
      // Only network/timeout, rate-limit and server failures retry automatically.
      // Validation/configuration errors stay downloadable until explicitly retried.
      entry.attempts++;
      entry.error = error.message || 'Failed to fetch';
      entry.blocked = Number.isInteger(error.status) && ![408, 425, 429].includes(error.status) && error.status < 500;
      const delay = Math.min(300000, 2000 * 2 ** Math.min(entry.attempts - 1, 8)) + Math.floor(random() * 1000);
      entry.notBefore = now() + Math.max(error.status === 429 ? 60000 : 0, error.retryAfterMs || 0);
      entry.nextAttemptAt = Math.max(now() + delay, entry.notBefore);
      read(); entries.set(entry.payload.id, entry); write();
    } finally { running = false; activeId = null; changed(); schedule(); }
  }
  function retry(id) {
    read();
    for (const [key, entry] of entries) if (!id || key === id) {
      entry.blocked = false; entry.nextAttemptAt = Math.max(now(), entry.notBefore);
    }
    write(); changed(); schedule(); return flush();
  }
  function wake() {
    read();
    for (const entry of entries.values()) if (!entry.blocked) entry.nextAttemptAt = Math.max(now(), entry.notBefore);
    write(); changed(); schedule(); return flush();
  }
  read();
  return { enqueue, snapshot, retry, wake, flush,
    start() { started = true; changed(); schedule(); },
    stop() { started = false; clearTimer(timer); },
    refresh() { read(); changed(); schedule(); },
  };
}
