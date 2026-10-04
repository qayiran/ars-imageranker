// Optional browser check: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node tests/language-images-check.mjs
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CATALOG_VERSION } from '../assets/catalog.js';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const out = '/tmp/ars-language-images-check'; await mkdir(out, { recursive: true });
const fixtures = JSON.parse(await readFile(new URL('./fixtures/participant-results.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [], submissions = [];
const storageKey = `showcase-session:${CATALOG_VERSION}`;
const data = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key)), storageKey);
const language = (page, code) => page.locator('[data-language-picker]').selectOption(code);
const noOverflow = async (page) => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'page should fit viewport');
async function vote(page) {
  await page.waitForFunction(() => document.querySelector('[data-choice]')?.disabled === false);
  await page.locator('[data-choice="0"]').click();
}
async function loadThumbnails(page) {
  for (const img of await page.locator('.ranked-artwork-grid img').all()) {
    await img.scrollIntoViewIfNeeded();
    await img.evaluate((node) => node.complete && node.naturalWidth ? undefined : new Promise((resolve, reject) => {
      node.addEventListener('load', resolve, { once: true }); node.addEventListener('error', reject, { once: true });
    }));
    assert.ok(await img.evaluate((node) => node.naturalWidth > 0));
  }
}
try {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1440, height: 1050 }, colorScheme: 'light', reducedMotion: 'reduce' });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  await context.route('**/config.json', (route) => route.fulfill({ json: { resultsApiUrl: 'https://results.test' } }));
  let failSave = false, failRead = false;
  await context.route('https://results.test/results', (route) => {
    if (route.request().method() === 'POST') {
      submissions.push(JSON.parse(route.request().postData()));
      return route.fulfill(failSave ? { status: 429, json: { error: 'Too many save attempts. Wait a minute and retry.' } } : { status: 201, json: { id: submissions.at(-1).id, saved: true, completedAt: '2026-10-04T10:00:00Z' } });
    }
    return route.fulfill(failRead ? { status: 503, json: { error: 'The results service is temporarily unavailable. Retry shortly.' } } : { json: fixtures });
  });
  const page = await context.newPage(); await page.goto(base);
  await page.getByLabel('Kullanıcı adı veya takma ad').waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'tr');
  assert.equal(await page.locator('[data-language-picker]').inputValue(), 'tr');
  for (const width of [390, 320]) { await page.setViewportSize({ width, height: 844 }); await noOverflow(page); await page.screenshot({ path: `${out}/home-tr-${width}.png`, fullPage: true }); }
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.getByLabel('Kullanıcı adı veya takma ad').fill('İzleyici');
  await language(page, 'en'); assert.equal(await page.getByLabel('Username or nickname').inputValue(), 'İzleyici');
  await page.getByRole('button', { name: 'Start comparing' }).click(); await vote(page);
  const saved = await data(page); await language(page, 'tr');
  assert.deepEqual(await data(page), saved);
  await page.getByRole('heading', { name: 'Hangi tasarımı tercih ediyorsunuz?' }).waitFor();
  await vote(page); await vote(page);
  assert.equal((await data(page)).history.length, 3);
  assert.equal(await page.locator('#comparison-notice').textContent(), 'Kalan çiftler otomatik olarak karıştırıldı.');
  await language(page, 'en'); assert.equal(await page.locator('#comparison-notice').textContent(), 'Remaining pairs reshuffled automatically.');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await language(page, 'tr'); await page.reload(); await page.getByRole('button', { name: 'Oturuma devam et' }).click();
  assert.equal((await data(page)).history.length, 3);
  // Complete one final pair using a stored, valid session with all other pairs already compared.
  for (const code of ['tr', 'en']) {
    await language(page, code);
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 }); await noOverflow(page);
      await page.screenshot({ path: `${out}/comparison-${code}-${width}.png`, fullPage: true });
    }
  }
  await language(page, 'tr'); await page.setViewportSize({ width: 1440, height: 1050 });
  const almost = await data(page);
  almost.history.push(...almost.queue.slice(0, -1).map(([winner, loser]) => ({ winner, loser, left: winner, right: loser })));
  almost.queue = almost.queue.slice(-1);
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session: almost });
  await page.reload(); await page.getByRole('button', { name: 'Oturuma devam et' }).click();
  failSave = true; await vote(page);
  await page.getByText('Çok fazla kayıt denemesi yapıldı.', { exact: false }).waitFor();
  assert.equal(await page.locator('.ranked-artwork-grid > li').count(), 17);
  assert.equal(await page.locator('.winner-artwork img').count(), 1);
  await language(page, 'en'); await page.getByText('Too many save attempts.', { exact: false }).waitFor();
  failSave = false; await page.getByRole('button', { name: 'Save to repository' }).click();
  await page.locator('#save-panel').getByText('Your ranking has been saved to the repository.', { exact: true }).waitFor();
  assert.equal(submissions.length, 2); assert.deepEqual(submissions[0], submissions[1]);
  assert.equal(submissions[0].username, 'İzleyici');
  await language(page, 'tr'); await page.locator('#save-panel').getByText('Sıralamanız depoya kaydedildi.', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Diğer sıralamalar' }).click();
  await page.locator('.participant').first().click();
  const participantCode = await page.locator('.detail-header code').textContent();
  await language(page, 'en'); assert.equal(await page.locator('.detail-header code').textContent(), participantCode);
  assert.equal(await page.locator('.ranked-artwork-grid > li').count(), 17);
  await page.goto(`${base}/results.html`); await page.locator('.leaderboard-table').waitFor();
  assert.equal(await page.locator('.leaderboard-thumbnail').count(), 17);
  await page.locator('.leaderboard-thumbnail').nth(8).click(); await page.locator('dialog[open]').waitFor();
  await page.keyboard.press('Escape'); await page.locator('dialog[open]').waitFor({ state: 'detached' });
  await page.locator('#results-search').fill(fixtures[0].id.toUpperCase());
  await page.locator('#results-sort').selectOption('name');
  await page.getByText('View global forest plot', { exact: true }).click();
  await language(page, 'tr');
  assert.equal(await page.locator('#results-search').inputValue(), fixtures[0].id.toUpperCase());
  assert.equal(await page.locator('#results-sort').inputValue(), 'name');
  assert.equal(await page.locator('.leaderboard-plot').getAttribute('open'), '');
  await page.locator('.result-card').click();
  await page.locator('.ranked-artwork-grid').waitFor();
  assert.deepEqual(await page.locator('.ranked-artwork-grid [data-result-image]').evaluateAll((buttons) => buttons.map((button) => button.dataset.resultImage)), fixtures[0].rankings.map((row) => row.id));
  await loadThumbnails(page); await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${out}/participant-turkish-light-desktop.png`, fullPage: true });
  await page.locator('.result-thumbnail').nth(1).click();
  await page.getByRole('dialog').getByRole('heading', { name: fixtures[0].rankings[1].name }).waitFor();
  await page.getByRole('button', { name: 'Önceki karakter' }).click();
  await page.getByRole('dialog').getByRole('heading', { name: fixtures[0].rankings[0].name }).waitFor();
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('dialog').getByRole('heading', { name: fixtures[0].rankings.at(-1).name }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByText('Sıralamayı tablo olarak göster').click();
  await language(page, 'en'); assert.equal(await page.locator('.rank-table').isVisible(), true);
  await page.getByRole('heading', { name: `${fixtures[0].username}’s ranking` }).waitFor();
  for (const code of ['en', 'tr']) {
    await language(page, code);
    for (const theme of ['light', 'dark']) {
      await page.locator('[data-theme-picker]').selectOption(theme);
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 844 }); await noOverflow(page);
        await page.screenshot({ path: `${out}/participant-${code}-${theme}-${width}.png`, fullPage: true });
      }
    }
  }
  await page.goto(`${base}/gallery.html`);
  assert.equal(await page.locator('#card-louisiana .gallery-card-info p').textContent(), 'İspanyol kolonisi');
  await noOverflow(page);
  await page.locator('[data-character="maine"]').click(); await page.locator('dialog[open]').waitFor();
  assert.ok((await page.locator('.viewer-caption').textContent()).includes("Massachusetts'in bir parçası"));
  await page.keyboard.press('Escape'); await language(page, 'en');
  assert.equal(await page.locator('#card-louisiana .gallery-card-info p').textContent(), 'Spanish colony');
  await page.goto(`${base}/_site/results.html#${fixtures[0].id}`); await page.locator('.ranked-artwork-grid').waitFor();
  assert.ok((await page.locator('.result-thumbnail img').first().getAttribute('src')).includes('/_site/showcase/'));
  failRead = true; await page.goto(`${base}/results.html`); await language(page, 'tr');
  await page.getByRole('alert').waitFor();
  assert.ok((await page.getByRole('alert').textContent()).includes('Sonuç hizmeti geçici olarak kullanılamıyor.'));
  await language(page, 'en'); assert.ok((await page.getByRole('alert').textContent()).includes('The results service is temporarily unavailable.'));
  // Explicit choices continue to work when preference storage is disabled.
  const blockedContext = await browser.newContext();
  await blockedContext.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('disabled'); }; Storage.prototype.setItem = () => { throw new Error('disabled'); }; });
  const blocked = await blockedContext.newPage(); await blocked.goto(`${base}/gallery.html`);
  assert.equal(await blocked.locator('html').getAttribute('lang'), 'tr'); await language(blocked, 'en');
  assert.equal(await blocked.getByRole('heading', { name: 'Character gallery.' }).count(), 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', checked: ['Turkish default even with English browser', 'language persistence and input preservation', 'comparison history and shuffle unchanged', 'localized save failure/retry/success without altered submission', 'community selection and public filters preserved', '17 expandable ranked images and leaderboard thumbnails', 'viewer rank navigation and wraparound', 'translated gallery, forest plot and errors', 'desktop/mobile light/dark layouts in both languages', 'Pages subpath images', 'blocked preference storage'], screenshots: out }, null, 2));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) {
    await page.screenshot({ path: `${out}/failure-${Date.now()}.png`, fullPage: true });
    console.error((await page.locator('main').textContent()).slice(0, 2500));
  }
  throw error;
} finally { await browser.close(); }
