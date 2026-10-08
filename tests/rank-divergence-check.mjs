import { testResults } from './result-fixtures.mjs';
// Optional browser checks; all API writes and reads use a test service.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { rankDivergence } from '../assets/rank-divergence.js';
import { CATALOG_VERSION } from '../assets/catalog.js';
import { createQueue, rankingsFrom, MODEL } from '../assets/ranking.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const records = testResults();
const manual = records.find((item) => item.provenance?.kind === 'manual');
const normal = records.find((item) => !item.provenance);
const artifacts = '/tmp/ars-divergence-preview';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], requests = [];
let mode = 'ready', release;
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', colorScheme: 'light' });
context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
await context.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://divergence.test' } }));
await context.route('https://divergence.test/**', async (route) => {
  const req = route.request(), headers = { 'Access-Control-Allow-Origin': new URL(base).origin };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type' } });
  requests.push(req.method());
  if (req.method() === 'POST') return route.fulfill({ json: { id: req.postDataJSON().id, saved: true, completedAt: '2026-10-06T12:00:00.000Z' }, headers });
  if (mode === 'delayed') await new Promise((resolve) => { release = resolve; });
  if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Temporary interruption' }, headers });
  return route.fulfill({ json: mode === 'empty' ? [] : mode === 'solo' ? [normal] : records, headers });
});
const page = await context.newPage();
async function assertDetail(rankings, id, peers = records) {
  await page.locator('[data-divergence]').waitFor();
  const expected = rankDivergence(rankings, peers, { id });
  assert.equal(Number(await page.locator('[data-divergence]').getAttribute('data-divergence')), expected.percent);
  assert.equal(Number(await page.locator('[data-divergence]').getAttribute('data-peer-count')), expected.peerCount);
}
try {
  for (const prefix of ['', '/_site']) {
    for (const record of [normal, manual]) {
      await page.goto(`${base}${prefix}/results.html#${record.id}`);
      await assertDetail(record.rankings, record.id);
      assert.equal(await page.locator('.divergence-move').count(), rankDivergence(record.rankings, records, record).largestMovements.length);
      await page.locator('.divergence-details summary').click();
      assert.equal(await page.locator('.divergence-table tbody tr').count(), 17);
      await page.locator('[data-language-picker]').selectOption('en');
      assert.equal(await page.locator('.divergence-heading h2').textContent(), 'Ranking divergence');
      assert.equal(await page.locator('.divergence-details').getAttribute('open'), '');
      await assertDetail(record.rankings, record.id);
      await page.locator('[data-language-picker]').selectOption('tr');
      assert.equal(await page.locator('.divergence-heading h2').textContent(), 'Sıralama ayrışması');
    }
    await page.goto(`${base}${prefix}/results.html`);
    await page.locator('.result-card').first().waitFor();
    assert.equal(await page.locator('[data-card-divergence]').count(), records.length);
    await page.locator('#results-sort').selectOption('divergent');
    const descending = await page.locator('[data-card-divergence]').evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.cardDivergence)));
    assert.deepEqual(descending, [...descending].sort((a, b) => b - a));
    await page.locator('#results-sort').selectOption('similar');
    const ascending = await page.locator('[data-card-divergence]').evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.cardDivergence)));
    assert.deepEqual(ascending, [...ascending].sort((a, b) => a - b));
    await page.locator('#results-search').fill(manual.id);
    assert.equal(await page.locator('.result-card').count(), 1);
    assert.equal(Number(await page.locator('[data-card-divergence]').getAttribute('data-card-divergence')), rankDivergence(manual.rankings, records, manual).percent);
    await page.locator('[data-language-picker]').selectOption('en');
    assert.equal(await page.locator('#results-sort').inputValue(), 'similar');
  }
  await page.goto(`${base}/_site/results.html#${manual.id}`);
  for (const language of ['tr', 'en']) {
    await page.locator('[data-language-picker]').selectOption(language);
    for (const theme of ['light', 'dark']) {
      await page.locator('[data-theme-picker]').selectOption(theme);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1100 });
        await assertDetail(manual.rankings, manual.id);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${language}/${theme}/${width}: overflow`);
        assert.ok(await page.locator('.ranking-divergence').evaluate((node) => node.scrollWidth <= node.clientWidth));
        await page.locator('.ranking-divergence').screenshot({ path: `${artifacts}/${language}-${theme}-${width}.png` });
      }
    }
  }

  // Completed personal result: a reference error cannot block successful saving.
  const history = createQueue(() => .5).map(([winner, loser]) => ({ winner, loser }));
  const completed = { id: '00112233-4455-4677-8899-aabbccddeeaa', username: 'Divergence check', model: MODEL,
    catalogVersion: CATALOG_VERSION, history, queue: [], published: false };
  await page.goto(`${base}/_site/`);
  await page.evaluate(({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data)); localStorage.setItem('ars-language', 'en');
  }, { key: `showcase-session:${CATALOG_VERSION}`, data: completed });
  mode = 'error'; await page.reload();
  await page.getByRole('button', { name: 'View your results' }).click();
  await page.getByText('Global comparison unavailable. Other rankings could not be loaded.', { exact: true }).waitFor();
  await page.locator('#save-panel').getByText('Your ranking has been saved to the repository.', { exact: true }).waitFor();
  mode = 'ready'; await page.getByRole('button', { name: 'Retry global comparison' }).click();
  await assertDetail(rankingsFrom(history), completed.id);
  await page.locator('#community-tab').click();
  await page.locator('.participant').filter({ has: page.locator('.participant-name', { hasText: manual.username }) }).click();
  await assertDetail(manual.rankings, manual.id);
  await page.locator('[data-language-picker]').selectOption('tr');
  await assertDetail(manual.rankings, manual.id);

  // One result has no peers; it must not compare against itself or claim 0%.
  mode = 'solo'; await page.goto(`${base}/results.html#${normal.id}`);
  await page.getByText('Bu karşılaştırma için kaydedilmiş en az bir başka sıralama gerekiyor.', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-divergence]').count(), 0);

  // Share delayed requests across language rerenders and ignore detached targets.
  mode = 'delayed'; release = undefined;
  await page.goto(`${base}/_site/`);
  await page.getByRole('button', { name: 'Sonuçlarını gör' }).click();
  await page.getByText('Genel sıralama karşılaştırması yükleniyor…', { exact: true }).waitFor();
  const getCount = requests.filter((method) => method === 'GET').length;
  await page.locator('[data-language-picker]').selectOption('en');
  assert.equal(requests.filter((method) => method === 'GET').length, getCount);
  await page.locator('#home').click();
  assert.ok(release); mode = 'ready'; release();
  await page.getByLabel('Username or nickname').waitFor();
  assert.equal(await page.locator('.ranking-divergence').count(), 0);
  await page.getByRole('button', { name: 'View your results' }).click();
  await assertDetail(rankingsFrom(history), completed.id);

  assert.deepEqual(errors, []);
  console.log('PASS: source/Pages divergence and rank table, self-exclusion, card sorting/search, Turkish/English, light/dark 320–1440 px, personal save/reference independence, retry, community details, no-peer state and navigation during delayed loads.');
} finally { await browser.close(); }
