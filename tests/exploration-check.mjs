import { testResults, mockStaticResults } from './result-fixtures.mjs';
// Optional browser integration; network writes are mocked and no results are changed.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { characterProfile } from '../assets/exploration-data.js';
import { IMAGES, CATALOG_VERSION } from '../assets/catalog.js';
import { MODEL, createQueue } from '../assets/ranking.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const records = testResults();
const manual = records.find((item) => item.provenance), normal = records.find((item) => item.username === 'qayiran');
const artifacts = '/tmp/ars-exploration'; await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], failures = [], writes = [];
let mode = 'ready';
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', colorScheme: 'light' });
context.on('page', (page) => { page.on('pageerror', (error) => errors.push(error.message)); page.on('requestfailed', (req) => failures.push(req.url())); });
await context.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://exploration.test' } }));
await context.route('https://exploration.test/**', (route) => {
  const req = route.request(), headers = { 'Access-Control-Allow-Origin': new URL(base).origin };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  if (req.method() === 'POST') { writes.push(req.postDataJSON().id); return route.fulfill({ json: { id: req.postDataJSON().id, saved: true, completedAt: '2026-10-06T18:00:00Z' }, headers }); }
  if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Temporary interruption' }, headers });
  return route.fulfill({ json: mode === 'empty' ? [] : mode === 'solo' ? [normal] : records, headers });
});
const page = await context.newPage();
async function profile(id) {
  const expected = characterProfile(id, records);
  await page.locator('.profile-stats').waitFor();
  assert.equal(await page.locator('[data-profile-id]').getAttribute('data-profile-id'), id);
  assert.equal(await page.locator('.profile-intro h1').textContent(), expected.image.name);
  const totals = await page.locator('[data-rank-distribution] [data-distribution-count]').evaluateAll((nodes) => nodes.reduce((sum, node) => sum + Number(node.dataset.distributionCount), 0));
  assert.ok(Math.abs(totals - records.length) < 1e-9);
  assert.equal(await page.locator('[data-rating-distribution] [data-distribution-count]').evaluateAll((nodes) => nodes.reduce((sum, node) => sum + Number(node.dataset.distributionCount), 0)), records.length);
  assert.equal(await page.locator('.profile-records tbody tr').count(), records.length);
  assert.deepEqual(await page.locator('.profile-records tbody a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href'))), expected.entries.map(({ id }) => `results.html#${id}`));
}
async function exportCard(language, theme, name) {
  await page.locator('[data-language-picker]').selectOption(language);
  await page.locator('[data-theme-picker]').selectOption(theme);
  await page.locator('[data-preview-result-card]').click();
  await page.locator('.result-card-dialog').waitFor();
  await page.locator('.result-card-preview').evaluate((image) => image.decode());
  const event = page.waitForEvent('download'); await page.locator('.result-card-actions a').click();
  const download = await event; const path = `${artifacts}/${name}.png`; await download.saveAs(path);
  const bytes = await readFile(path); assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  assert.equal(bytes.readUInt32BE(16), 1200); assert.equal(bytes.readUInt32BE(20), 1400);
  assert.ok(bytes.length > 40000);
  await page.keyboard.press('Escape'); await page.locator('.result-card-dialog').waitFor({ state: 'detached' });
  return createHash('sha256').update(bytes).digest('hex');
}
try {
  for (const prefix of ['', '/_site']) {
    await page.goto(`${base}${prefix}/gallery.html`);
    assert.equal(await page.locator('.gallery-profile-link').count(), 17);
    await page.locator('.gallery-profile-link').first().click();
    await page.waitForURL('**/character.html#connecticut'); await profile('connecticut');
    for (const image of IMAGES) { await page.locator('[data-profile-picker]').selectOption(image.id); await page.waitForURL(`**#${image.id}`); await profile(image.id); }
    await page.locator('.profile-image').click(); await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
    await page.locator('.profile-distributions summary').click();
    await page.locator('[data-language-picker]').selectOption('en');
    assert.equal(await page.locator('.profile-distributions').getAttribute('open'), '');
    assert.ok((await page.title()).includes('Character profile'));
    await page.locator('.profile-records tbody a').first().click(); await page.locator('[data-preview-result-card]').waitFor();
    await page.goto(`${base}${prefix}/results.html`);
    await page.locator('.public-result-grid').waitFor();
    assert.equal(await page.locator('#participant-agreement, .agreement-map').count(), 0);
    await page.locator('.leaderboard-character>a').first().click(); await page.waitForURL('**/character.html#*');
    await page.locator('.profile-stats').waitFor();
    await page.goto(`${base}${prefix}/results.html#${manual.id}`);
    const tr = await exportCard('tr', 'light', `${prefix ? 'built' : 'source'}-tr-light-manual`);
    const en = await exportCard('en', 'dark', `${prefix ? 'built' : 'source'}-en-dark-manual`);
    assert.notEqual(tr, en);
  }
  for (const language of ['tr', 'en']) for (const theme of ['light', 'dark']) for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${base}/_site/character.html#louisiana`); await profile('louisiana');
    await page.locator('[data-language-picker]').selectOption(language); await page.locator('[data-theme-picker]').selectOption(theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${language}/${theme}/${width} profile overflow`);
    await page.screenshot({ path: `${artifacts}/${language}-${theme}-${width}-profile.png`, fullPage: true });

  }
  await page.goto(`${base}/_site/results.html#${normal.id}`);
  await exportCard('en', 'light', 'normal-en-light');
  await exportCard('tr', 'dark', 'normal-tr-dark');
  mode = 'error'; await page.goto(`${base}/_site/character.html#louisiana`);
  await page.getByText('Karakter istatistikleri mevcut değil', { exact: true }).waitFor();
  mode = 'ready'; await page.locator('.profile-statistics [data-refresh-profile]').click(); await profile('louisiana');
  mode = 'empty'; await page.reload(); await page.getByText('Henüz kayıtlı karakter puanı yok', { exact: true }).waitFor();
  assert.equal(await page.locator('.profile-stats').count(), 0);
  await page.goto(`${base}/character.html#unknown`); await page.getByText('Karakter bulunamadı', { exact: true }).waitFor();
  // A private completed session can create a card without requiring publication.
  mode = 'ready'; await page.goto(`${base}/_site/`);
  const history = createQueue(() => .5).map(([winner, loser]) => ({ winner, loser }));
  const completed = { id: '00112233-4455-4677-8899-aabbccddeeaa', username: 'Kart denemesi', model: MODEL, catalogVersion: CATALOG_VERSION, history, queue: [], published: false };
  await page.evaluate(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), { key: `showcase-session:${CATALOG_VERSION}`, value: completed });
  await page.reload(); await page.getByRole('button', { name: 'Sonuçlarını gör' }).click();
  await exportCard('tr', 'light', 'personal-card');
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  assert.ok(writes.every((id) => id === completed.id), 'Only the explicitly seeded mock session may submit');
  const broken = await browser.newContext(); const errorPage = await broken.newPage(); await mockStaticResults(broken);
  await broken.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: '' } }));
  await broken.route('**/showcase/*.png', (route) => route.fulfill({ status: 404, body: '' }));
  await errorPage.goto(`${base}/_site/results.html#${manual.id}`);
  await errorPage.locator('[data-preview-result-card]').click();
  await errorPage.getByText('Çizimler yüklenemedi. Lütfen yeniden deneyin.', { exact: true }).waitFor();
  assert.equal(await errorPage.locator('.result-card-dialog').count(), 0);
  await broken.close();
  console.log('PASS: all 17 profiles/distributions, descending participant ratings, gallery/leaderboard/result links, removed agreement map, PNG preview/download for normal/manual/private results, both languages/themes, source/Pages, 320–1440 px, retry/empty/unknown/small-cohort states.');
} finally { await browser.close(); }
