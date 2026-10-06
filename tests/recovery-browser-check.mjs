// Optional browser checks. No requests or writes to the real results service.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CATALOG_VERSION } from '../assets/catalog.js';
import { MODEL, createQueue } from '../assets/ranking.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const artifacts = '/tmp/ars-recovery-preview';
await mkdir(artifacts, { recursive: true });
const results = JSON.parse(await readFile(new URL('../results/index.json', import.meta.url), 'utf8'));
const manual = results.find((item) => item.username === 'nisacx' && item.provenance?.kind === 'manual');
assert.ok(manual);
const key = `showcase-session:${CATALOG_VERSION}`, outboxKey = `showcase-outbox:${CATALOG_VERSION}`;
const completed = { id: '00112233-4455-4677-8899-aabbccddeeaa', username: 'Recovery test', model: MODEL, catalogVersion: CATALOG_VERSION,
  history: createQueue(() => .5).map(([winner, loser]) => ({ winner, loser })), queue: [], published: false };
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
async function context(options = {}) {
  const value = await browser.newContext({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'reduce', ...options });
  value.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  return value;
}
async function seed(page) {
  await page.goto(base);
  await page.evaluate(({ key, data }) => { localStorage.setItem(key, JSON.stringify(data)); localStorage.setItem('ars-language', 'en'); }, { key, data: completed });
  await page.reload();
}
try {
  // First request commits, but its response is lost. Retry must reuse the UUID.
  const recovery = await context(), records = new Map(); let attempts = 0;
  await recovery.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://recovery.test' } }));
  await recovery.route('https://recovery.test/**', async (route) => {
    const req = route.request(), headers = { 'Access-Control-Allow-Origin': new URL(base).origin };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (req.method() === 'GET') return route.fulfill({ json: [], headers });
    const body = req.postDataJSON(); attempts++; records.set(body.id, body);
    if (attempts === 1) return route.abort('failed');
    return route.fulfill({ json: { id: body.id, saved: true, completedAt: '2026-10-04T18:37:00.000Z' }, headers });
  });
  const page = await recovery.newPage(); await seed(page);
  await page.getByText('Pending saves: 1.', { exact: false }).waitFor();
  await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).length === 0, outboxKey);
  await page.getByRole('button', { name: 'View your results' }).click();
  await page.locator('#save-panel').getByText('Your ranking has been saved to the repository.', { exact: true }).waitFor();
  assert.equal(records.size, 1); assert.equal(attempts, 2);
  assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), outboxKey), []);
  await recovery.close();

  // A failed old result survives a new session and reload, then resumes at home.
  const replacement = await context(); let available = false, savedId;
  await replacement.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://queue.test' } }));
  await replacement.route('https://queue.test/**', async (route) => {
    const req = route.request(), headers = { 'Access-Control-Allow-Origin': new URL(base).origin };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type' } });
    if (!available) return route.fulfill({ status: 503, json: { error: 'Temporary interruption' }, headers });
    const body = req.postDataJSON(); savedId = body.id;
    return route.fulfill({ json: { id: body.id, saved: true, completedAt: '2026-10-04T18:37:00.000Z' }, headers });
  });
  const next = await replacement.newPage(); await seed(next);
  await next.getByText('Pending saves: 1.', { exact: false }).waitFor();
  next.on('dialog', (dialog) => dialog.accept());
  await next.getByLabel('Username or nickname').fill('New ranking');
  await next.getByRole('button', { name: 'Start comparing' }).click();
  const newId = await next.evaluate((key) => JSON.parse(localStorage.getItem(key)).id, key);
  assert.notEqual(newId, completed.id);
  await next.reload();
  assert.equal(await next.evaluate((key) => JSON.parse(localStorage.getItem(key))[0].payload.id, outboxKey), completed.id);
  const downloadEvent = next.waitForEvent('download'); await next.getByRole('button', { name: 'Download pending backups' }).click();
  const download = await downloadEvent; await download.saveAs(`${artifacts}/pending-backups.json`);
  assert.equal(JSON.parse(await readFile(`${artifacts}/pending-backups.json`, 'utf8'))[0].id, completed.id);
  available = true; await next.evaluate(() => window.dispatchEvent(new Event('online')));
  await next.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).length === 0, outboxKey);
  assert.equal(savedId, completed.id);
  assert.equal(await next.evaluate((key) => JSON.parse(localStorage.getItem(key)).published, key), false);
  await replacement.close();

  // Review the actual recovered result on source and generated Pages URLs.
  const visuals = await context(); const preview = await visuals.newPage();
  for (const prefix of ['', '/_site']) {
    await preview.goto(`${base}${prefix}/results.html#${manual.id}`);
    await preview.locator('#public-ranking-detail .plot-scroll svg').waitFor();
    assert.equal(await preview.locator('.manual-note').textContent(), 'Elle eklendi');
    assert.ok(!(await preview.locator('.detail-header').textContent()).includes('21:37'));
    assert.equal(await preview.locator('.plot-value').count(), 17);
    assert.equal(await preview.locator('.plot-value line').count(), 51);
    assert.ok((await preview.locator('.chart-card .fine-print').first().textContent()).includes('±5'));
    await preview.getByText('Sıralamayı tablo olarak göster', { exact: true }).click();
    assert.ok((await preview.locator('.rank-table tbody tr').first().textContent()).includes('1421–2000'));
    assert.equal(await preview.locator('.ranked-artwork-grid [data-result-image]').count(), 17);
    assert.equal(await preview.locator('.plot-scroll svg').evaluate((node) => /NaN|Infinity/.test(node.outerHTML)), false);
    for (const img of await preview.locator('.ranked-artwork-grid img').all()) {
      await img.scrollIntoViewIfNeeded();
      await img.evaluate((node) => node.decode());
      assert.ok(await img.evaluate((node) => node.naturalWidth > 0));
    }
    await preview.evaluate(() => scrollTo(0, 0));
    await preview.screenshot({ path: `${artifacts}/${prefix ? 'built' : 'source'}-turkish-light.png`, fullPage: true });
    await preview.locator('[data-language-picker]').selectOption('en');
    assert.equal(await preview.locator('.manual-note').textContent(), 'Manually added');
    assert.ok((await preview.locator('.chart-legend').textContent()).includes('estimated 95% interval'));
    await preview.locator('.ranked-artwork-grid [data-result-image]').last().click();
    assert.ok((await preview.getByRole('dialog').textContent()).includes('Pennsylvania'));
    await preview.keyboard.press('Escape');
    await preview.locator('[data-language-picker]').selectOption('tr');
  }
  await preview.setViewportSize({ width: 390, height: 844 });
  await preview.emulateMedia({ colorScheme: 'dark' });
  await preview.reload(); await preview.locator('#public-ranking-detail .plot-scroll svg').waitFor();
  assert.ok(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await preview.screenshot({ path: `${artifacts}/nisacx-turkish-dark-phone.png`, fullPage: true });
  await preview.goto(`${base}/results.html`);
  await preview.locator('.leaderboard-table').waitFor();
  assert.equal(await preview.locator('.result-card').count(), results.length);
  assert.equal(await preview.locator('.manual-note').count(), 1);
  assert.ok((await preview.locator('.manual-stat-note').textContent()).includes(String(results.filter((item) => !item.provenance).length)));
  await preview.screenshot({ path: `${artifacts}/leaderboard-turkish-dark-phone.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log('PASS: lost receipts, automatic retries, durable old-session backups, reload/online recovery, backup download, source/Pages preview, manual statistics, Turkish/English, expandable images and phone layout.');
} finally { await browser.close(); }
