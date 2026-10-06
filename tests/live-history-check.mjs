// Browser regression: actual Worker, mocked GitHub, and no published history file.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import worker from '../server/worker.js';
import { circularPreferenceExamples } from '../assets/taste-insights.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const index = JSON.parse(await readFile(new URL('../results/index.json', import.meta.url)));
const source = index.find(({ username }) => username === 'qayiran');
const original = JSON.parse(await readFile(new URL(`../results/${source.id}.json`, import.meta.url)));
const id = '00112233-4455-4677-8899-aabbccddffaa';
const env = { GITHUB_TOKEN: 'mock-secret', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo', GITHUB_BRANCH: 'main', ALLOWED_ORIGIN: new URL(base).origin };
const files = new Map(), errors = [], requests = [];
let writes = 0, sequence = 0, historyMode = 'ready';
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.ok(String(url).startsWith('https://api.github.com/repos/owner/repo/contents/'));
  assert.equal(init.headers.Authorization, 'Bearer mock-secret');
  const path = new URL(url).pathname.split('/contents/')[1];
  if (init.method === 'PUT') {
    const data = JSON.parse(init.body), existing = files.get(path);
    if (existing && data.sha !== existing.sha) return Response.json({}, { status: 409 });
    const sha = String(++sequence);
    files.set(path, { sha, content: JSON.parse(Buffer.from(data.content, 'base64').toString()) }); writes++;
    return Response.json({ commit: { sha, html_url: `https://github.com/owner/repo/commit/${sha}` } });
  }
  const file = files.get(path);
  return file ? Response.json({ type: 'file', sha: file.sha, encoding: 'base64', content: Buffer.from(JSON.stringify(file.content)).toString('base64') }) : Response.json({}, { status: 404 });
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  // Complete a fresh session through the Worker, without creating local files.
  const saved = await worker.fetch(new Request('https://history.test/results', { method: 'POST', headers: { Origin: env.ALLOWED_ORIGIN, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...original, id, username: 'Fresh result' }) }), env);
  assert.equal(saved.status, 201); assert.equal(writes, 2);
  const record = files.get(`results/${id}.json`).content;
  const expected = circularPreferenceExamples(record.comparisons, record.rankings);
  assert.ok(expected.length > 0);
  for (const prefix of ['', '/_site']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    let staticReads = 0, historyReads = 0;
    await context.route('**/config.json', route => route.fulfill({ json: { resultsApiUrl: 'https://history.test' } }));
    await context.route('**/results/*.json', route => { staticReads++; return route.fulfill({ status: 404, json: { error: 'Not published' } }); });
    await context.route('https://history.test/**', async route => {
      const request = route.request(); requests.push(request.method());
      const history = new URL(request.url()).pathname === `/results/${id}`;
      if (history) historyReads++;
      const headers = { 'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN };
      if (history && historyMode === 'error') return route.fulfill({ status: 503, json: { error: 'Temporary interruption' }, headers });
      const requestHeaders = new Headers(request.headers()); requestHeaders.set('Origin', env.ALLOWED_ORIGIN);
      const response = await worker.fetch(new Request(request.url(), { method: request.method(), headers: requestHeaders }), env);
      await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    });
    const page = await context.newPage();
    await page.goto(`${base}${prefix}/results.html#${id}`);
    await page.locator('[data-consistency-page=examples]').click();
    await page.locator('[data-cycle-ids]').waitFor();
    assert.equal(await page.locator('[data-cycle-ids]').getAttribute('data-cycle-ids'), expected[0].map(({ id }) => id).join('|'));
    assert.equal(staticReads, 0); assert.equal(historyReads, 1);
    await page.locator('[data-language-picker]').selectOption('en');
    await page.getByRole('heading', { name: 'Circular preference examples', exact: true }).waitFor();
    assert.equal(historyReads, 1, 'Language changes reuse the validated history');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    historyMode = 'error'; await page.reload(); await page.locator('[data-consistency-page=examples]').click();
    await page.getByText('Recorded choices could not be loaded. Check your connection and try again.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-cycle-ids]').count(), 0);
    historyMode = 'ready'; await page.locator('[data-retry-cycles]').click(); await page.locator('[data-cycle-ids]').waitFor();
    assert.equal(staticReads, 0); assert.equal(writes, 2);
    await context.close();
  }
  assert.deepEqual(errors, []); assert.ok(requests.every(method => method === 'GET'));
  console.log('PASS: fresh Worker submissions show validated circular examples without published JSON files; source/Pages, Turkish/English, phone layout, caching and outage/retry; no production writes.');
} finally { await browser.close(); globalThis.fetch = realFetch; }
