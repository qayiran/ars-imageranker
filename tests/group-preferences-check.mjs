import { testResults } from './result-fixtures.mjs';
// Optional browser verification; all API traffic is mocked, never submitted live.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { groupPreferences } from '../assets/group-preferences.js';
import { CATALOG_VERSION } from '../assets/catalog.js';
import { createQueue, rankingsFrom, MODEL } from '../assets/ranking.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const records = testResults();
const manual = records.find((item) => item.username === 'Recovered fixture' && item.provenance?.kind === 'manual');
const normal = records.find((item) => !item.provenance);
const artifacts = '/tmp/ars-group-preferences';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], failed = [];
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', colorScheme: 'light' });
context.on('page', (page) => {
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => failed.push(request.url()));
});
await context.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://group-preview.test' } }));
await context.route('https://group-preview.test/**', (route) => {
  const req = route.request(), headers = { 'Access-Control-Allow-Origin': new URL(base).origin };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'POST, GET', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method() === 'GET') return route.fulfill({ json: records, headers });
  return route.fulfill({ json: { id: req.postDataJSON().id, saved: true, completedAt: '2026-10-05T10:00:00.000Z' }, headers });
});
const page = await context.newPage();
async function assertMeans(rankings) {
  await page.locator('.group-preferences').waitFor();
  const data = groupPreferences(rankings);
  assert.equal(await page.locator('[data-preference-group]').count(), 5);
  for (const group of [...data.factions, ...data.regions]) {
    const actual = Number(await page.locator(`[data-preference-group="${group.id}"]`).getAttribute('data-mean-rating'));
    assert.ok(Math.abs(actual - group.mean) < 1e-9, `${group.id} mean differs`);
  }
}
try {
  for (const prefix of ['', '/_site']) {
    for (const item of [manual, normal]) {
      await page.goto(`${base}${prefix}/results.html#${item.id}`);
      await assertMeans(item.rankings);
      assert.equal(await page.locator('.group-preference-recovery').count(), item.provenance ? 1 : 0);
      assert.equal(await page.locator('.ranked-artwork-grid [data-result-image]').count(), 17);
      await page.locator('[data-language-picker]').selectOption('tr');
      assert.equal(await page.locator('.group-preferences h2').textContent(), 'Taraf ve bölge tercihleri');
      assert.ok((await page.locator('[data-preference-group="loyalists"] .group-preference-score').textContent()).includes('ortalama puan'));
      await page.locator('.group-preference-members summary').click();
      assert.ok((await page.locator('.group-preference-members').textContent()).includes('17 karakterin tamamını'));
      await page.locator('[data-language-picker]').selectOption('en');
      assert.equal(await page.locator('.group-preference-members').getAttribute('open'), '');
      assert.equal(await page.locator('.group-preferences h2').textContent(), 'Faction & region preferences');
      const members = await page.locator('.group-preference-members li').allTextContents();
      assert.equal(members.length, 6);
      assert.ok(members[0].includes('Leader: Massachusetts'));
      assert.ok(members[1].includes('Leader: New York'));
      assert.ok(members[2].includes('Louisiana, Vermont'));
      assert.ok(members[3].includes('Maine') && members[3].includes('Vermont'));
      assert.ok(members[5].includes('Florida') && members[5].includes('Louisiana') && members[5].includes('Maryland'));
      await assertMeans(item.rankings);
      await page.locator('.group-preference-members summary').click();
    }
  }
  await page.goto(`${base}/_site/results.html#${manual.id}`);
  for (const language of ['tr', 'en']) {
    await page.locator('[data-language-picker]').selectOption(language);
    for (const theme of ['light', 'dark']) {
      await page.locator('[data-theme-picker]').selectOption(theme);
      for (const width of [1440, 390, 320]) {
        await page.setViewportSize({ width, height: 1100 });
        await assertMeans(manual.rankings);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${language}/${theme}/${width}: page overflow`);
        assert.ok(await page.locator('.group-preferences').evaluate((node) => node.scrollWidth <= node.clientWidth), `${language}/${theme}/${width}: summary overflow`);
        await page.locator('.group-preferences').screenshot({ path: `${artifacts}/${language}-${theme}-${width}.png` });
      }
    }
  }

  // A completed private session and its community detail use the same summaries.
  const history = createQueue(() => .5).map(([winner, loser]) => ({ winner, loser }));
  const completed = { id: '00112233-4455-4677-8899-aabbccddeeaa', username: 'Preference test', model: MODEL,
    catalogVersion: CATALOG_VERSION, history, queue: [], published: false };
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto(`${base}/_site/`);
  await page.evaluate(({ key, data }) => {
    localStorage.setItem(key, JSON.stringify(data)); localStorage.setItem('ars-language', 'en');
  }, { key: `showcase-session:${CATALOG_VERSION}`, data: completed });
  await page.reload();
  await page.getByRole('button', { name: 'View your results' }).click();
  await assertMeans(rankingsFrom(history));
  await page.locator('[data-language-picker]').selectOption('tr');
  await assertMeans(rankingsFrom(history));
  await page.locator('#community-tab').click();
  await page.locator('.participant').filter({ has: page.locator('.participant-name', { hasText: 'Recovered fixture' }) }).click();
  await assertMeans(manual.rankings);
  assert.equal(await page.locator('.group-preference-recovery').count(), 1);
  await page.locator('[data-language-picker]').selectOption('en');
  await assertMeans(manual.rankings);

  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log('PASS: faction/region means, manual and normal rankings, group membership, private/community/public views, source and Pages build, Turkish/English, light/dark and 320–1440 px layouts.');
} finally { await browser.close(); }
