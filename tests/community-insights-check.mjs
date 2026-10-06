// Optional browser integration; no real submissions or service writes.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { closestMatches, preferenceConsistency, communityInsights } from '../assets/community-insights.js';
import { CATALOG_VERSION } from '../assets/catalog.js';
import { MODEL, createQueue, rankingsFrom } from '../assets/ranking.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const records = JSON.parse(await readFile(new URL('../results/index.json', import.meta.url), 'utf8'));
const normal = records.find((item) => !item.provenance), manual = records.find((item) => item.provenance);
const aggregate = communityInsights(records);
const artifacts = '/tmp/ars-community-insights'; await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], failures = [], methods = [];
let mode = 'ready', release;
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', colorScheme: 'light' });
context.on('page', (page) => { page.on('pageerror', (error) => errors.push(error.message)); page.on('requestfailed', (req) => failures.push(req.url())); });
await context.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://insights.test' } }));
await context.route('https://insights.test/**', async (route) => {
  const req = route.request(), headers = { 'Access-Control-Allow-Origin': new URL(base).origin };
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  methods.push(req.method());
  if (req.method() === 'POST') return route.fulfill({ json: { id: req.postDataJSON().id, saved: true, completedAt: '2026-10-06T16:00:00Z' }, headers });
  if (mode === 'delayed') await new Promise((resolve) => { release = resolve; });
  if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'Temporary interruption' }, headers });
  return route.fulfill({ json: mode === 'empty' ? [] : mode === 'solo' ? [normal] : records, headers });
});
const page = await context.newPage();
async function assertMatches(rankings, id, peers = records) {
  const expected = closestMatches(rankings, peers, { id }).slice(0, 3);
  await page.locator('[data-match-id]').first().waitFor();
  assert.deepEqual(await page.locator('[data-match-id]').evaluateAll((nodes) => nodes.map((node) => node.dataset.matchId)), expected.map(({ id }) => id));
  for (const item of expected) assert.equal(Number(await page.locator(`[data-match-id="${item.id}"]`).getAttribute('data-match-agreement')), item.agreement);
}
async function assertCardConsistency() {
  const language = await page.evaluate(() => document.documentElement.lang);
  const cards = page.locator('.result-card');
  for (const card of await cards.all()) {
    const id = (await card.getAttribute('href')).slice(1), record = records.find((item) => item.id === id);
    const expected = record.provenance ? null : preferenceConsistency(record.rankings);
    const metric = card.locator('[data-card-consistency]');
    assert.equal(await metric.getAttribute('data-card-consistency'), expected ? String(expected.transitivePercent) : '');
    assert.ok((await metric.textContent()).startsWith(language === 'tr' ? 'Tercih tutarlılığı:' : 'Preference consistency:'));
    if (!expected) assert.ok((await metric.textContent()).includes(language === 'tr' ? 'Hesaplanamıyor' : 'Unavailable'));
    assert.equal(await metric.evaluate(node => node.nextElementSibling.matches('[data-card-divergence]')), true);
  }
}
async function assertAggregate() {
  await page.locator('.community-group-preferences').waitFor();
  await assertCardConsistency();
  assert.equal(Number(await page.locator('.community-group-preferences').getAttribute('data-community-sessions')), records.length);
  assert.deepEqual(await page.locator('.most-divisive .divisive-table').first().locator('tbody tr').evaluateAll((nodes) => nodes.map((node) => node.dataset.divisiveCharacter)), aggregate.characters.slice(0, 5).map(({ id }) => id));
  for (const group of [...aggregate.groups.factions, ...aggregate.groups.regions]) assert.equal(Number(await page.locator(`.community-group-preferences [data-preference-group="${group.id}"]`).getAttribute('data-mean-rating')), group.mean);
}
try {
  for (const prefix of ['', '/_site']) {
    for (const item of [normal, manual]) {
      await page.goto(`${base}${prefix}/results.html#${item.id}`);
      await assertMatches(item.rankings, item.id);
      if (!item.provenance) assert.equal(Number(await page.locator('[data-cyclic-triplets]').getAttribute('data-cyclic-triplets')), preferenceConsistency(item.rankings).cyclic);
      else { assert.equal(await page.locator('[data-cyclic-triplets]').count(), 0); assert.ok((await page.locator('.preference-consistency').textContent()).includes('Eksiksiz galibiyet')); }
      await page.locator('.closest-matches details summary').click();
      await page.locator('[data-language-picker]').selectOption('en');
      assert.equal(await page.locator('.closest-matches h2').textContent(), 'Closest taste matches');
      assert.equal(await page.locator('.closest-matches details').getAttribute('open'), '');
      const first = closestMatches(item.rankings, records, item)[0];
      await page.locator('[data-match-id]').first().getByRole('link').click();
      await page.waitForURL(`**#${first.id}`);
      await assertMatches(first.rankings, first.id);
      await page.locator('[data-language-picker]').selectOption('tr');
    }
    await page.goto(`${base}${prefix}/results.html`);
    await assertAggregate();
    await page.getByText('17 karakterin tamamını göster', { exact: true }).click();
    assert.equal(await page.locator('.most-divisive .divisive-table').last().locator('tbody tr').count(), 17);
    await page.locator('.most-divisive [data-result-image]').first().click();
    await page.getByRole('dialog').waitFor(); await page.keyboard.press('Escape');
    await page.locator('#results-search').fill(manual.id);
    await page.locator('#results-sort').selectOption('divergent');
    assert.equal(await page.locator('.result-card').count(), 1); await assertAggregate();
    await page.locator('[data-language-picker]').selectOption('en'); await assertAggregate();
    assert.equal(await page.locator('.most-divisive details').getAttribute('open'), '');
    await page.locator('[data-language-picker]').selectOption('tr');
  }
  for (const language of ['tr', 'en']) for (const theme of ['light', 'dark']) for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${base}/_site/results.html#${normal.id}`); await assertMatches(normal.rankings, normal.id);
    await page.locator('[data-language-picker]').selectOption(language); await page.locator('[data-theme-picker]').selectOption(theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.result-insights-grid').screenshot({ path: `${artifacts}/${language}-${theme}-${width}-personal.png` });
    await page.goto(`${base}/_site/results.html`); await assertAggregate();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.locator('.most-divisive').screenshot({ path: `${artifacts}/${language}-${theme}-${width}-divisive.png` });
    await assertCardConsistency();
    await page.locator('.result-card').filter({ hasText: 'nisacx' }).screenshot({ path: `${artifacts}/${language}-${theme}-${width}-manual-card.png` });
    await page.locator(`.result-card[href="#${normal.id}"]`).screenshot({ path: `${artifacts}/${language}-${theme}-${width}-normal-card.png` });
  }
  mode = 'solo'; await page.goto(`${base}/results.html#${normal.id}`);
  await page.getByText('At least one other saved ranking is needed to find a match.', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-match-id]').count(), 0);
  await page.goto(`${base}/results.html`);
  await page.getByText('At least two saved rankings are needed to measure disagreement between participants.', { exact: true }).waitFor();
  assert.equal(await page.locator('.most-divisive .divisive-table').count(), 0);
  assert.equal(Number(await page.locator('.community-group-preferences').getAttribute('data-community-sessions')), 1);
  mode = 'empty'; await page.reload();
  await page.getByText('No participant rankings yet', { exact: true }).waitFor();
  assert.equal(await page.locator('.most-divisive').count(), 0);

  // Personal choices have exact win counts even when references fail to load.
  const history = createQueue(() => .5).map(([winner, loser]) => ({ winner, loser }));
  const completed = { id: '00112233-4455-4677-8899-aabbccddeeaa', username: 'Insight test', model: MODEL,
    catalogVersion: CATALOG_VERSION, history, queue: [], published: false };
  await page.goto(`${base}/_site/`);
  await page.evaluate(({ key, data }) => { localStorage.setItem(key, JSON.stringify(data)); localStorage.setItem('ars-language', 'en'); },
    { key: `showcase-session:${CATALOG_VERSION}`, data: completed });
  mode = 'error'; await page.reload();
  await page.getByRole('button', { name: 'View your results' }).click();
  await page.getByText('Closest matches unavailable. Retry the global comparison to load them.', { exact: true }).waitFor();
  assert.equal(Number(await page.locator('[data-cyclic-triplets]').getAttribute('data-cyclic-triplets')), preferenceConsistency(rankingsFrom(history)).cyclic);
  await page.locator('#save-panel').getByText('Your ranking has been saved to the repository.', { exact: true }).waitFor();
  mode = 'ready'; await page.getByRole('button', { name: 'Retry global comparison' }).click();
  await assertMatches(rankingsFrom(history), completed.id);
  await page.locator('#community-tab').click();
  await page.locator('.participant').filter({ has: page.locator('.participant-name', { hasText: manual.username }) }).click();
  await assertMatches(manual.rankings, manual.id);
  assert.equal(await page.locator('[data-cyclic-triplets]').count(), 0);
  // Language changes and navigation during reference loading must not alter the view.
  mode = 'delayed'; release = undefined; await page.goto(`${base}/_site/`);
  await page.getByRole('button', { name: 'View your results' }).click();
  await page.getByText('Loading closest matches…', { exact: true }).waitFor();
  await page.locator('[data-language-picker]').selectOption('tr');
  await page.locator('#home').click(); assert.ok(release); mode = 'ready'; release();
  await page.getByLabel('Kullanıcı adı veya takma ad').waitFor();
  assert.equal(await page.locator('.personal-insights').count(), 0);
  assert.deepEqual(errors, []); assert.deepEqual(failures, []);
  console.log('PASS: closest-match ranking/links, exact and unavailable consistency, divisive ranks and community weighting, 17-character expansion/zoom, search/sort independence, Turkish/English, light/dark 320–1440 px, personal/community/public/source/Pages views, small cohorts, save independence, retry and delayed navigation.');
} finally { await browser.close(); }
