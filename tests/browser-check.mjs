// Optional local integration check. Supply the installed Playwright module path.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser-check.mjs
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { IMAGES, CATALOG_VERSION, TOTAL_PAIRS } from '../assets/catalog.js';
import { MODEL, createQueue, validateSubmission, summaryFrom, autoShuffle } from '../assets/ranking.js';
import worker from '../server/worker.js';
const modulePath = process.env.PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error('Set PLAYWRIGHT_MODULE to your installed Playwright index.mjs.');
const { chromium } = await import(pathToFileURL(modulePath).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const artifacts = process.env.BROWSER_ARTIFACTS || '/tmp/showcase-browser-check';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const storageKey = `showcase-session:${CATALOG_VERSION}`;
const errors = [];
const files = new Map(); let revision = 0;
const nativeFetch = globalThis.fetch;
// Exercise the actual Worker handler, stubbing only its outbound GitHub API.
globalThis.fetch = async (url, options) => {
  if (!String(url).startsWith('https://api.github.com/repos/')) return nativeFetch(url, options);
  const path = new URL(url).pathname.split('/contents/')[1];
  if (options.method === 'PUT') {
    const input = JSON.parse(options.body), old = files.get(path);
    if ((old && old.sha !== input.sha) || (!old && input.sha)) return Response.json({}, { status: 409 });
    const sha = (++revision).toString(16).padStart(40, '0');
    files.set(path, { sha, content: JSON.parse(Buffer.from(input.content, 'base64').toString('utf8')) });
    return Response.json({ commit: { sha, html_url: `https://github.com/owner/repo/commit/${sha}` } }, { status: 201 });
  }
  const file = files.get(path);
  return file ? Response.json({ type: 'file', sha: file.sha, content: Buffer.from(JSON.stringify(file.content)).toString('base64'), encoding: 'base64' }) : Response.json({}, { status: 404 });
};
const workerEnv = { GITHUB_TOKEN: 'test-only', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo', GITHUB_BRANCH: 'main', ALLOWED_ORIGIN: new URL(base).origin };
let saveAttempts = 0, failSave = false;
async function setup(context, api = true) {
  await context.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  if (api) await context.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://results.test' } }));
  await context.route('https://results.test/**', async (route) => {
    const req = route.request();
    const headers = new Headers(req.headers());
    headers.set('Origin', new URL(base).origin);
    const request = new Request(req.url(), { method: req.method(), headers, ...(req.method() === 'POST' ? { body: req.postData() } : {}) });
    if (req.method() === 'POST') {
      saveAttempts++;
      if (failSave) return route.fulfill({ status: 503, json: { error: 'Simulated service interruption.' }, headers: { 'Access-Control-Allow-Origin': new URL(base).origin } });
    }
    const response = await worker.fetch(request, workerEnv);
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
}
async function sessionData(page) { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey); }
async function start(page, username) {
  await page.goto(base);
  await page.getByLabel('Username or nickname').fill(username);
  await page.getByRole('button', { name: 'Start comparing' }).click();
  await page.waitForFunction(() => document.querySelector('[data-choice]')?.disabled === false);
}
async function vote(page, side = 0) {
  await page.waitForFunction(() => document.querySelector('[data-choice]')?.disabled === false);
  await page.locator(`[data-choice="${side}"]`).click();
}
function noOverflow(page) { return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth); }
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, reducedMotion: 'reduce' });
  await setup(context);
  const page = await context.newPage(); await page.goto(base);
  await page.screenshot({ path: `${artifacts}/welcome-desktop.png`, fullPage: true });
  assert.ok(await noOverflow(page));
  await start(page, 'Quiet observer');
  await page.screenshot({ path: `${artifacts}/compare-desktop.png`, fullPage: true });
  assert.equal(await page.locator('input[type=checkbox]').isChecked(), true);
  assert.equal(await page.locator('input[type=checkbox]').isDisabled(), true);
  assert.equal(await page.locator('input[type=file]').count(), 0);
  const original = (await sessionData(page)).queue[0];
  await page.getByRole('button', { name: 'Decide later' }).click();
  assert.deepEqual((await sessionData(page)).queue.at(-1), original);
  assert.equal((await sessionData(page)).history.length, 0);
  await vote(page); await vote(page, 1); await vote(page);
  const afterThree = await sessionData(page);
  assert.equal(afterThree.history.length, 3);
  assert.ok((await page.locator('#comparison-notice').textContent()).includes('reshuffled'));
  const expectedQueue = autoShuffle(afterThree.queue, afterThree.history, () => .5);
  const priorityScores = (await import('../assets/ranking.js')).ratingsFrom(afterThree.history);
  const score = ([a, b]) => Math.abs(priorityScores[a].mu - priorityScores[b].mu) + .8 * (priorityScores[a].count + priorityScores[b].count);
  assert.deepEqual(afterThree.queue.map(score), expectedQueue.map(score));
  await page.getByRole('button', { name: 'Undo' }).click();
  assert.equal((await sessionData(page)).history.length, 2);
  const imageName = await page.locator('.card-name').first().textContent();
  await page.locator('.zoom-button').first().click();
  assert.equal(await page.getByRole('dialog').count(), 1);
  assert.ok((await page.getByRole('dialog').textContent()).includes(imageName));
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: 'Continue your session' }).click();
  assert.equal((await sessionData(page)).history.length, 2);
  // Complete all pairs through the real UI, including automatic shuffle.
  for (let i = 2; i < TOTAL_PAIRS; i++) {
    await vote(page, i % 2);
    if (i % 30 === 0) console.log(`Comparison UI: ${i + 1}/${TOTAL_PAIRS}`);
  }
  console.log('Completion state:', (await sessionData(page)).history.length, await page.locator('#save-panel').textContent());
  await page.locator('#save-panel').getByText('Your ranking has been saved to the repository.').waitFor();
  const finished = await sessionData(page); validateSubmission({ ...finished, comparisons: finished.history });
  assert.equal(finished.history.length, 136); assert.equal(finished.queue.length, 0);
  assert.equal(await page.locator('.section-header .result-code code').textContent(), finished.id.toUpperCase());
  assert.equal(files.get('results/index.json').content.length, 1);
  assert.equal(await page.locator('.plot-scroll svg').count(), 1);
  assert.equal(await page.locator('.plot-value').count(), 17);
  await page.screenshot({ path: `${artifacts}/results-desktop.png`, fullPage: true });
  await page.getByText('View the ranking as a table').click();
  assert.equal(await page.locator('.rank-table tbody tr').count(), 17);
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download your results' }).click();
  const download = await downloadPromise; assert.ok(download.suggestedFilename().endsWith('.json'));
  await download.saveAs(`${artifacts}/downloaded-result.json`);
  assert.equal(JSON.parse(await readFile(`${artifacts}/downloaded-result.json`, 'utf8')).resultCode, finished.id.toUpperCase());
  await page.getByRole('tab', { name: 'Other rankings' }).click();
  await page.getByText('No other completed rankings yet.', { exact: false }).waitFor();
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' }); await setup(second);
  const mobile = await second.newPage(); await mobile.goto(base);
  assert.ok(await noOverflow(mobile)); await mobile.screenshot({ path: `${artifacts}/welcome-mobile.png`, fullPage: true });
  await start(mobile, 'Quiet observer');
  assert.ok(await noOverflow(mobile)); await mobile.screenshot({ path: `${artifacts}/compare-mobile.png`, fullPage: true });
  // Seed all but the last comparison to test a separate participant plus failure/retry.
  const saved = await sessionData(mobile);
  const all = [...saved.queue];
  saved.history = all.slice(0, -1).map(([winner, loser]) => ({ winner, loser, left: winner, right: loser }));
  saved.queue = all.slice(-1);
  await mobile.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: storageKey, data: saved });
  await mobile.reload(); await mobile.getByRole('button', { name: 'Continue your session' }).click();
  failSave = true; await vote(mobile);
  await mobile.getByText('Your result has not been confirmed saved to GitHub.', { exact: false }).waitFor();
  assert.equal((await sessionData(mobile)).published, false);
  failSave = false; await mobile.getByRole('button', { name: 'Save to repository' }).click();
  await mobile.locator('#save-panel').getByText('Your ranking has been saved to the repository.').waitFor();
  assert.equal(files.get('results/index.json').content.length, 2);
  const records = files.get('results/index.json').content;
  assert.equal(new Set(records.map((item) => item.resultCode)).size, 2);
  assert.ok(records.every((item) => item.username === 'Quiet observer'));
  assert.ok(await noOverflow(mobile)); await mobile.screenshot({ path: `${artifacts}/results-mobile.png`, fullPage: true });
  await mobile.getByRole('tab', { name: 'Other rankings' }).click();
  await mobile.getByRole('button', { name: /Quiet observer/ }).click();
  await mobile.getByRole('heading', { name: 'Quiet observer’s ranking' }).waitFor();
  assert.equal(await mobile.locator('.detail-header .result-code code').textContent(), finished.id.toUpperCase());
  assert.equal(await mobile.locator('.plot-value').count(), 17);
  assert.ok(await noOverflow(mobile)); await mobile.screenshot({ path: `${artifacts}/participant-mobile.png`, fullPage: true });
  await mobile.getByRole('button', { name: 'All results' }).click();
  assert.equal(await mobile.locator('.participant').count(), 1);
  // Verify a root-prefix deployment from the actual generated artifact.
  const prefix = await context.newPage(); await prefix.goto(`${base}/_site/`);
  await prefix.getByLabel('Username or nickname').fill('Subpath visitor');
  await prefix.getByRole('button', { name: 'Start comparing' }).click();
  await prefix.waitForFunction(() => [...document.querySelectorAll('.image-area img')].every((img) => img.complete && img.naturalWidth));
  const urls = await prefix.locator('.image-area img').evaluateAll((images) => images.map((image) => image.src));
  assert.ok(urls.every((url) => url.includes('/_site/showcase/')));
  // Unconfigured service must provide download and honest publication status.
  const offline = await browser.newContext({ viewport: { width: 1280, height: 900 } }); await setup(offline, false);
  const offPage = await offline.newPage(); await offPage.goto(base);
  const completed = { ...finished, published: false };
  await offPage.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key: storageKey, data: completed });
  await offPage.reload(); await offPage.getByRole('button', { name: 'View your results' }).click();
  await offPage.getByText('Shared saving is not configured yet.', { exact: false }).waitFor();
  assert.equal(await offPage.getByRole('button', { name: 'Download your results' }).count(), 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', browserErrors: errors, saveAttempts, storedSessions: files.get('results/index.json').content.length, screenshots: artifacts, checked: ['all 136 UI votes', '3-vote shuffle', 'fixed catalog', 'locked shuffle', 'undo/defer', 'zoom', 'pause/reload/resume', 'real Worker mocked GitHub saves', 'failure/retry', 'forest/table', 'download', 'other participants', 'desktop/mobile overflow', 'Pages subpath assets', 'unconfigured fallback'] }, null, 2));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: `${artifacts}/failure-${Date.now()}.png`, fullPage: true });
    console.error('Failure view:', (await page.locator('main').textContent()).slice(0, 2000));
  }
  throw error;
} finally { globalThis.fetch = nativeFetch; await browser.close(); }
