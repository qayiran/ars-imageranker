// Optional local browser check. Requires PLAYWRIGHT_MODULE and a preview server.
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { buildLeaderboard } from '../assets/leaderboard.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const out = '/tmp/ars-leaderboard-check'; await mkdir(out, { recursive: true });
const fixtures = JSON.parse(await readFile(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
const participants = fixtures.map((item) => ({ ...item, username: 'Same nickname' }));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
async function verifyTable(page, board) {
  const rows = await page.locator('.leaderboard-table tbody tr').evaluateAll((nodes) => nodes.map((row) => ({ id: row.dataset.colony, values: [...row.cells].map((cell) => cell.textContent) })));
  assert.equal(rows.length, 17);
  for (const [i, row] of rows.entries()) {
    const expected = board.rankings[i]; assert.equal(row.id, expected.id);
    assert.equal(row.values[2], expected.elo.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
    assert.equal(row.values[3], `${expected.winRate.toFixed(1)}%`); assert.equal(row.values[4], `${expected.wins} / ${expected.count}`); assert.equal(row.values[5], String(expected.topVotes));
  }
}
async function noOverflow(page) { assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); }
async function verifyForestPlacement(page) {
  assert.equal(await page.locator('.leaderboard-plot').count(), 1);
  assert.equal(await page.locator('.leaderboard-plot #bayesian-community').count(), 1);
  assert.equal(await page.locator('#results-browser > #bayesian-community').count(), 0);
  assert.equal(await page.locator('.confidence-table').count(), 0);
}

try {
  const emptyContext = await browser.newContext(); await emptyContext.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  await emptyContext.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: '' } }));
  await emptyContext.route('**/results/index.json', (route) => route.fulfill({ json: [] }));
  const empty = await emptyContext.newPage();
  await empty.goto(`${base}/results.html#leaderboard`); await empty.getByRole('heading', { name: 'No participant scores yet' }).waitFor();
  assert.equal(await empty.locator('.leaderboard-table').count(), 0); assert.equal(await empty.locator('select#leaderboard-source').count(), 0);
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1050 }, colorScheme: 'dark', reducedMotion: 'reduce' }); await context.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  await context.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://results.test' } }));
  let count = 2, unavailable = false;
  await context.route('https://results.test/results', (route) => route.fulfill(unavailable ? { status: 503, json: { error: 'Service unavailable for this test.' } } : { json: [...participants.slice(0, count), { ...participants[0], example: true }, participants[0]] }));
  await context.route('https://results.test/results/*', route => route.fulfill({status:503,json:{error:'Histories unavailable for this table-only fixture'}}));
  const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}/results.html#leaderboard`); await page.locator('.leaderboard-table').waitFor();
  await verifyTable(page, buildLeaderboard(participants.slice(0, 2)));
  assert.equal(await page.locator('.leaderboard-stats .stat-value').first().textContent(), '2');
  assert.ok((await page.locator('#participant-results-title').locator('..').textContent()).includes('2 saved rankings'));
  await page.getByText('View global forest plot', { exact: true }).click();
  await verifyForestPlacement(page);
  await page.getByLabel('Find a ranking').fill('no matching participant'); assert.equal(await page.locator('.result-card').count(), 0);
  await page.getByLabel('Sort by').selectOption('name'); await verifyTable(page, buildLeaderboard(participants.slice(0, 2)));
  assert.equal(await page.locator('.leaderboard-plot').getAttribute('open'), '');
  await page.getByLabel('Find a ranking').fill('');
  count = 3; await page.getByRole('button', { name: 'Refresh' }).click();
  await page.locator(`.result-card[href="#${participants[2].id}"]`).waitFor(); await verifyTable(page, buildLeaderboard(participants));
  await page.getByText('View global forest plot', { exact: true }).click(); await noOverflow(page);
  await verifyForestPlacement(page);
  await page.screenshot({ path: `${out}/participant-leaderboard-dark-desktop.png`, fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.reload(); await page.locator('.leaderboard-table').waitFor();
    await page.getByText('View global forest plot', { exact: true }).click(); await noOverflow(page); await verifyTable(page, buildLeaderboard(participants));
    assert.equal(await page.locator('.leaderboard-rating').first().evaluate((cell) => getComputedStyle(cell).whiteSpace), 'nowrap');
    assert.ok(await page.locator('.leaderboard-table-wrap').evaluate((table) => { table.scrollLeft = table.scrollWidth; return table.scrollLeft > 0; }));
    await noOverflow(page); await page.locator('.leaderboard-table-wrap').evaluate((table) => { table.scrollLeft = 0; });
    await page.screenshot({ path: `${out}/participant-leaderboard-dark-${width}.png`, fullPage: true });
  }
  await page.getByLabel('Color theme').selectOption('light'); await noOverflow(page);
  await page.locator('[data-language-picker]').selectOption('tr');
  assert.ok((await page.locator('#global-leaderboard .chart-card').textContent()).includes('Bayesçi topluluk puanları'));
  await noOverflow(page);
  await page.locator('[data-language-picker]').selectOption('en');
  await page.screenshot({ path: `${out}/participant-leaderboard-light-320.png`, fullPage: true });
  count = 1; await page.reload(); await page.locator('.leaderboard-table').waitFor();
  await page.getByText('View global forest plot', { exact: true }).click();
  await page.getByText('At least two complete choice histories are needed for the Bayesian ranking.', { exact: true }).waitFor();
  assert.equal(await page.locator('#global-leaderboard svg').count(), 0);
  assert.equal(await page.locator('#global-leaderboard .plot-value line').count(), 0);
  await verifyForestPlacement(page);
  count = 3;
  unavailable = true; await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByRole('heading', { name: 'Leaderboard unavailable' }).waitFor(); assert.equal(await page.locator('.leaderboard-table').count(), 0);
  unavailable = false; await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await page.locator('.leaderboard-table').waitFor(); await verifyTable(page, buildLeaderboard(participants));
  await page.locator(`.result-card[href="#${participants[0].id}"]`).click();
  await page.getByRole('heading', { name: 'Same nickname’s ranking' }).waitFor();
  assert.ok((await page.locator('.plot-scroll svg desc').textContent()).includes('posterior intervals'));
  await page.goto(`${base}/_site/results.html#leaderboard`); await page.locator('.leaderboard-table').waitFor();
  assert.ok((await page.locator('.leaderboard-winner img').getAttribute('src')).includes('/_site/showcase/'));
  await page.locator('.leaderboard-table [data-result-image]').first().click(); await page.locator('dialog[open]').waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', checked: ['17 combined ratings and win statistics', 'same-name sessions counted separately and duplicate IDs excluded', 'empty and single-session states without invented Bayesian scores', 'search-independent totals and expanded chart', 'refresh, outage and retry', 'one expandable global Bayesian plot/personal posterior plots', 'Turkish/English', 'light/dark layouts down to 320px', 'Pages subpath gallery links'], screenshots: out }, null, 2));
} finally { await browser.close(); }
