// Optional local browser check. Requires PLAYWRIGHT_MODULE and a preview server.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const out = '/tmp/ars-public-results-check'; await mkdir(out, { recursive: true });
// Synthetic records are test-only; the Pages build never copies tests/.
const fixtures = JSON.parse(await readFile(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
const participants = fixtures.map((item, i) => ({ ...item, username: i < 2 ? 'Same nickname' : 'Other nickname', completedAt: `2026-10-03T08:0${i}:00Z` }));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], requests = [];
const card = (page, id) => page.locator(`.result-card[href="#${id}"]`);
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: 'light', reducedMotion: 'reduce' }); await context.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  context.on('page', (page) => { page.on('pageerror', (error) => errors.push(error.message)); page.on('request', (request) => requests.push(request.url())); });
  const page = await context.newPage();
  await page.goto(base);
  await page.getByRole('link', { name: 'Results', exact: true }).click();
  await page.getByRole('heading', { name: 'No participant scores yet' }).waitFor();
  assert.equal(await page.locator('.result-card').count(), 0);
  assert.equal(await page.getByLabel('Username or nickname').count(), 0);
  assert.equal(await page.locator('input[type=checkbox]').count(), 0);
  assert.equal(await page.locator('#leaderboard-source').count(), 0);
  assert.ok(!(await page.locator('main').textContent()).toLowerCase().includes('example'));
  await noOverflow(page);
  await page.screenshot({ path: `${out}/results-empty-light-desktop.png`, fullPage: true });
  assert.equal((await page.request.get(`${base}/results/examples.json`)).status(), 404);
  assert.equal((await page.request.get(`${base}/_site/results/examples.json`)).status(), 404);
  assert.equal((await page.request.get(`${base}/_site/tests/fixtures/participant-results.json`)).status(), 404);
  assert.ok(requests.every((url) => !url.includes('examples.json')));
  const liveContext = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: 'light', reducedMotion: 'reduce' }); await liveContext.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  await liveContext.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://results.test' } }));
  let unavailable = false;
  await liveContext.route('https://results.test/results', (route) => route.fulfill(unavailable ? { status: 503, json: { error: 'Service unavailable for this test.' } } : { json: participants }));
  const live = await liveContext.newPage(); live.on('pageerror', (error) => errors.push(error.message));
  await live.goto(`${base}/results.html`);
  await card(live, participants[0].id).waitFor();
  assert.equal(await live.locator('.result-card').count(), 3);
  for (const item of participants) assert.equal(await card(live, item.id).locator('.result-code code').textContent(), item.id.toUpperCase());
  await live.getByLabel('Find a ranking').fill('Same nickname');
  assert.equal(await live.locator('.result-card').count(), 2);
  await live.getByLabel('Find a ranking').fill(participants[1].id.toUpperCase());
  assert.equal(await live.locator('.result-card').count(), 1);
  assert.equal(await live.locator('.result-card').getAttribute('href'), `#${participants[1].id}`);
  await live.getByLabel('Find a ranking').fill('not-a-ranking'); assert.equal(await live.locator('.result-card').count(), 0);
  await live.getByLabel('Find a ranking').fill(''); await live.getByLabel('Sort by').selectOption('name');
  assert.equal(await live.locator('.result-card .participant-name').first().textContent(), 'Other nickname');
  await live.screenshot({ path: `${out}/results-light-desktop.png`, fullPage: true });
  await card(live, participants[1].id).click();
  await live.getByRole('heading', { name: 'Same nickname’s ranking' }).waitFor();
  assert.equal(await live.locator('.detail-header .result-code code').textContent(), participants[1].id.toUpperCase());
  assert.equal(await live.locator('.plot-value').count(), 17);
  await live.getByText('View the ranking as a table').click(); assert.equal(await live.locator('.rank-table tbody tr').count(), 17);
  await live.screenshot({ path: `${out}/participant-light-desktop.png`, fullPage: true });
  await live.reload(); await live.getByRole('heading', { name: 'Same nickname’s ranking' }).waitFor();
  assert.equal(await live.locator('.detail-header .result-code code').textContent(), participants[1].id.toUpperCase());
  await live.getByRole('link', { name: 'All results' }).click();
  await live.getByLabel('Color theme').selectOption('dark');
  for (const width of [390, 320]) {
    await live.setViewportSize({ width, height: 844 }); await noOverflow(live);
    await live.screenshot({ path: `${out}/results-dark-${width}.png`, fullPage: true });
    await card(live, participants[0].id).click();
    await live.getByRole('heading', { name: 'Same nickname’s ranking' }).waitFor();
    await noOverflow(live); await live.screenshot({ path: `${out}/participant-dark-${width}.png`, fullPage: true });
    await live.getByRole('link', { name: 'All results' }).click();
  }
  unavailable = true; await live.getByRole('button', { name: 'Refresh' }).click(); await live.getByRole('alert').waitFor();
  assert.equal(await live.locator('.result-card').count(), 0);
  unavailable = false; await live.getByRole('button', { name: 'Retry', exact: true }).click(); await card(live, participants[0].id).waitFor();
  await live.goto(`${base}/_site/results.html#${participants[0].id}`);
  await live.getByRole('heading', { name: 'Same nickname’s ranking' }).waitFor();
  assert.ok((await live.locator('.winner-card img').getAttribute('src')).includes('/_site/showcase/'));
  await live.goto(`${base}/results.html#does-not-exist`); await live.getByRole('heading', { name: 'Ranking not found' }).waitFor();
  for (const path of ['/', '/gallery.html', '/results.html']) {
    await page.goto(`${base}${path}`);
    assert.equal(await page.getByRole('navigation').getByRole('link', { name: 'Results', exact: true }).count(), 1);
    assert.equal(await page.locator('.brand-icon').count(), 0);
    const icon = await page.locator('link[rel=icon]').getAttribute('href');
    const svg = await (await page.request.get(`${base}/${icon}`)).text();
    assert.ok(svg.includes('Character ranking')); assert.ok(!svg.includes('<text'));
    await page.setViewportSize({ width: 320, height: 844 }); await noOverflow(page);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', checked: ['public access and honest empty states', 'no public examples, requests or build fixtures', 'duplicate nicknames distinguished by full result codes', 'search by code/name, sorting and direct links', 'participant forest plots and tables', 'refresh, API error and retry', 'Pages subdirectory paths', 'logo removal and ranking favicon', 'light/dark layouts down to 320px'], screenshots: out }, null, 2));
} finally { await browser.close(); }
