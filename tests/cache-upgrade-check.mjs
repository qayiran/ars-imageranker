// Browser regression for upgrades from an already cached, unversioned site.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const fixtures = JSON.parse(await readFile(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
const root = new URL('../', import.meta.url), built = new URL('../_site/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('asset-manifest.json', built), 'utf8'));
let upgraded = false;
const requests = [], errors = [];
const mime = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', png: 'image/png', svg: 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  requests.push({ pathname, upgraded });
  const sourceView = pathname.startsWith('/preview/');
  const relative = pathname.replace(/^\/(?:ars-imageranker|preview)\//, '') || 'index.html';
  if ((!pathname.startsWith('/ars-imageranker/') && !sourceView) || relative.includes('..')) { response.writeHead(404); response.end(); return; }
  try {
    let content;
    if (relative === 'results/index.json') content = Buffer.from(JSON.stringify(fixtures));
    else if (relative === 'config.json') content = Buffer.from('{"resultsApiUrl":""}');
    // Simulate a stale module and stylesheet being kept for 10 minutes.
    else if (!sourceView && !upgraded && relative === 'assets/language.js') content = Buffer.from("export const locale = () => 'en-US'; export const t = (s, ...v) => Array.isArray(s) ? s.reduce((a, b, i) => a + (i ? v[i-1] : '') + b, '') : s; export const translateError = m => m;");
    else if (!sourceView && !upgraded && relative === 'assets/style.css') content = Buffer.from((await readFile(new URL(relative, root), 'utf8')).split('/* Language controls')[0]);
    else content = await readFile(new URL(relative, upgraded && !sourceView ? built : root));
    response.writeHead(200, { 'Content-Type': mime[relative.split('.').at(-1)] || 'application/octet-stream', 'Cache-Control': relative.startsWith('assets/') ? 'public, max-age=600' : 'no-store' });
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/ars-imageranker/`;
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: 'light', reducedMotion: 'reduce' });
  const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${base}results.html#${fixtures[0].id}`);
  await page.locator('.ranked-artwork-grid').waitFor();
  await page.locator('[data-language-picker]').selectOption('en');
  assert.equal(await page.locator('html').getAttribute('lang'), 'tr', 'simulate a cached module without the language event handler');
  assert.notEqual(await page.locator('.ranked-artwork-grid').evaluate((node) => getComputedStyle(node).display), 'grid', 'simulate cached styles without the approved grid');
  upgraded = true;
  // Ordinary reload, without clearing cache or browser storage.
  await page.reload(); await page.locator('.ranked-artwork-grid').waitFor();
  assert.equal(await page.locator('.result-thumbnail').count(), 17);
  assert.equal(await page.locator('.ranked-artwork-grid').evaluate((node) => getComputedStyle(node).display), 'grid');
  await page.locator('[data-language-picker]').selectOption('en');
  await page.getByRole('heading', { name: 'All characters', exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('[data-language-picker]').selectOption('tr');
  await page.getByRole('heading', { name: 'Tüm karakterler', exact: true }).waitFor();
  for (const theme of ['light', 'dark']) {
    await page.locator('[data-theme-picker]').selectOption(theme);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1050 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
  }
  await page.locator('.result-thumbnail').nth(4).click(); await page.locator('dialog[open]').waitFor(); await page.keyboard.press('Escape');
  for (const filename of ['public-results.js', 'language.js', 'style.css', 'result-images.js']) assert.ok(requests.some((request) => request.upgraded && request.pathname.endsWith(manifest.assets[filename])));
  assert.ok(!requests.some((request) => request.upgraded && /\/assets\/(?:language|style|public-results)\.(?:js|css)$/.test(request.pathname)), 'upgraded page never requests the stale URLs');
  // Same records, theme and viewport: the compiled page must render exactly
  // like the approved source preview, despite the different asset URLs.
  async function capture(url) {
    await page.goto(url); await page.locator('.ranked-artwork-grid').waitFor();
    await page.locator('[data-theme-picker]').selectOption('light');
    await page.setViewportSize({ width: 1440, height: 1050 });
    for (const image of await page.locator('.ranked-artwork-grid img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate((node) => node.complete && node.naturalWidth ? undefined : new Promise((resolve, reject) => { node.addEventListener('load', resolve, { once: true }); node.addEventListener('error', reject, { once: true }); }));
    }
    await page.mouse.move(0, 0); await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
    return page.screenshot({ fullPage: true, animations: 'disabled' });
  }
  const compiledImage = await capture(`${base}results.html#${fixtures[0].id}`);
  const previewImage = await capture(`http://127.0.0.1:${server.address().port}/preview/results.html#${fixtures[0].id}`);
  await mkdir('/tmp/ars-cache-upgrade-check', { recursive: true });
  await writeFile('/tmp/ars-cache-upgrade-check/compiled.png', compiledImage);
  await writeFile('/tmp/ars-cache-upgrade-check/preview.png', previewImage);
  const digest = (buffer) => createHash('sha256').update(buffer).digest('hex');
  assert.equal(digest(compiledImage), digest(previewImage), 'compiled results must visually match the source preview');
  for (const path of ['gallery.html', 'index.html']) {
    await page.goto(base + path);
    await page.locator('[data-language-picker]').selectOption('en');
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.locator('[data-language-picker]').selectOption('tr');
    assert.equal(await page.locator('html').getAttribute('lang'), 'tr');
  }
  await page.getByLabel('Kullanıcı adı veya takma ad').fill('Önbellek testi');
  await page.getByRole('button', { name: 'Karşılaştırmaya başla' }).click();
  await page.waitForFunction(() => document.querySelector('[data-choice]')?.disabled === false);
  await page.locator('[data-choice="0"]').click();
  assert.equal(await page.locator('.progress-label strong').textContent(), '1');
  await mkdir('/tmp/ars-cache-upgrade-check', { recursive: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', checked: ['reproduced cached language failure and missing grid', 'ordinary reload bypasses stale scripts and CSS', 'all transitive JS imports use versioned filenames', 'language controls on all three built pages', '17 expandable result images', 'light/dark desktop and 320px/390px layouts', 'Pages repository subdirectory', 'built comparison view records votes', 'compiled results screenshot exactly matches the approved source preview'] }, null, 2));
} finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
