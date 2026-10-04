// Optional browser verification. Start npm start and set PLAYWRIGHT_MODULE.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8000';
const out = '/tmp/ars-theme-gallery-check';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const errors = [];
const theme = (page) => page.locator('html').getAttribute('data-theme');
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
async function loadGalleryImages(page) {
  for (const image of await page.locator('.gallery-artwork img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((node) => node.complete && node.naturalWidth ? undefined : new Promise((resolve, reject) => {
      node.addEventListener('load', resolve, { once: true });
      node.addEventListener('error', () => reject(new Error(`Gallery image failed: ${node.src}`)), { once: true });
    }));
    assert.ok(await image.evaluate((node) => node.naturalWidth > 0));
  }
  await page.evaluate(() => scrollTo(0, 0));
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, colorScheme: 'dark', reducedMotion: 'reduce' }); await context.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  context.on('page', (page) => page.on('pageerror', (error) => errors.push(error.message)));
  const page = await context.newPage();
  await page.goto(base);
  await page.getByLabel('Username or nickname').waitFor();
  assert.equal(await theme(page), 'dark');
  assert.equal(await page.getByLabel('Color theme').inputValue(), 'system');
  assert.ok((await page.title()).includes('American Revolution Smuggler'));
  const text = await page.locator('body').textContent();
  for (const phrase of ['Every choice tells a little story', 'A matter of', 'perspective', 'speaks to you', 'Your taste']) assert.ok(!text.includes(phrase), phrase);
  assert.ok(text.includes('HIROTONFA’s American Revolution Smuggler'));
  assert.ok(text.includes('thirteen colonies that founded the United States'));
  assert.ok(await noOverflow(page));
  await page.screenshot({ path: `${out}/home-dark-desktop.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' }); await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByLabel('Color theme').selectOption('dark');
  assert.equal(await theme(page), 'dark');
  await page.reload(); assert.equal(await theme(page), 'dark');
  await page.getByRole('link', { name: 'Gallery', exact: true }).click();
  await page.getByRole('heading', { name: 'Character gallery.' }).waitFor();
  assert.equal(await theme(page), 'dark');
  assert.equal(await page.locator('.gallery-card').count(), 17);
  assert.equal(await page.locator('.gallery-card-info p').filter({ hasText: 'Founding colony' }).count(), 13);
  for (const [id, label] of Object.entries({ florida: 'British East & West Florida', louisiana: 'Spanish colony', maine: 'Part of Massachusetts', vermont: 'Sovereign state · 1777–1791' })) {
    assert.equal(await page.locator(`#card-${id} .gallery-card-info p`).textContent(), label);
    await page.goto(`${base}/gallery.html#${id}`);
    assert.ok((await page.locator('.viewer-caption').textContent()).includes(label));
    await page.keyboard.press('Escape');
  }
  assert.equal(await page.locator('.brand-icon').count(), 0);
  assert.ok(await noOverflow(page));
  await loadGalleryImages(page);
  await page.screenshot({ path: `${out}/gallery-dark-desktop.png`, fullPage: true });
  await page.getByRole('link', { name: 'View Connecticut character', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('heading').textContent(), 'Connecticut');
  await page.getByRole('button', { name: 'Next character' }).click();
  await page.getByRole('dialog').getByRole('heading', { name: 'Delaware' }).waitFor();
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('dialog').getByRole('heading', { name: 'Connecticut' }).waitFor();
  await page.keyboard.press('ArrowLeft');
  await page.getByRole('dialog').getByRole('heading', { name: 'Virginia' }).waitFor();
  await page.keyboard.press('Escape'); assert.equal(await page.getByRole('dialog').count(), 0);
  await page.waitForFunction(() => !location.hash);
  assert.equal(new URL(page.url()).hash, '');
  await page.goto(`${base}/gallery.html#maine`);
  await page.getByRole('dialog').getByRole('heading', { name: 'Maine' }).waitFor();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByLabel('Color theme').selectOption('light');
  await page.screenshot({ path: `${out}/gallery-light-desktop.png`, fullPage: true });
  await page.getByRole('link', { name: 'Rank characters', exact: true }).click();
  assert.equal(await theme(page), 'light');
  await page.emulateMedia({ colorScheme: 'dark' }); assert.equal(await theme(page), 'light');
  await page.getByLabel('Color theme').selectOption('system'); assert.equal(await theme(page), 'dark');
  assert.equal(await page.evaluate(() => localStorage.getItem('ars-color-theme')), null);
  await page.getByLabel('Username or nickname').fill('Gallery visitor');
  await page.getByRole('button', { name: 'Start comparing' }).click();
  await page.waitForFunction(() => document.querySelector('[data-choice]')?.disabled === false);
  await page.locator('[data-choice="0"]').click();
  await page.getByRole('link', { name: 'Gallery', exact: true }).click();
  await page.getByRole('link', { name: 'Rank characters', exact: true }).click();
  await page.getByRole('button', { name: 'Continue your session' }).click();
  assert.ok((await page.locator('.progress-label').textContent()).includes('1 of 136'));
  await page.screenshot({ path: `${out}/compare-dark-desktop.png`, fullPage: true });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' }); await mobileContext.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', (error) => errors.push(error.message));
  await mobile.goto(base); await mobile.getByLabel('Username or nickname').waitFor();
  assert.equal(await theme(mobile), 'dark'); assert.ok(await noOverflow(mobile));
  await mobile.screenshot({ path: `${out}/home-dark-mobile.png`, fullPage: true });
  await mobile.getByRole('link', { name: 'Gallery', exact: true }).click();
  assert.equal(await mobile.locator('.gallery-card').count(), 17); assert.ok(await noOverflow(mobile));
  await loadGalleryImages(mobile);
  await mobile.screenshot({ path: `${out}/gallery-dark-mobile.png`, fullPage: true });
  await mobile.getByRole('link', { name: 'View Massachusetts character', exact: true }).click();
  await mobile.getByRole('dialog').getByRole('heading', { name: 'Massachusetts' }).waitFor();
  assert.ok(await noOverflow(mobile)); await mobile.screenshot({ path: `${out}/viewer-dark-mobile.png`, fullPage: true });
  await mobile.keyboard.press('Escape');
  await mobile.getByLabel('Color theme').selectOption('light');
  assert.ok(await noOverflow(mobile)); await mobile.screenshot({ path: `${out}/gallery-light-mobile.png`, fullPage: true });
  const prefix = await context.newPage(); await prefix.goto(`${base}/_site/gallery.html#florida`);
  await prefix.getByRole('dialog').getByRole('heading', { name: 'Florida' }).waitFor();
  assert.ok((await prefix.locator('.zoom-image').getAttribute('src')).includes('/_site/showcase/'));
  // Gallery content is still viewable when JavaScript is disabled.
  const plainContext = await browser.newContext({ javaScriptEnabled: false }); await plainContext.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  const plain = await plainContext.newPage(); await plain.goto(`${base}/gallery.html`);
  assert.equal(await plain.locator('.gallery-card').count(), 17);
  // Theme selector works without localStorage access.
  const blockedContext = await browser.newContext({ colorScheme: 'dark' }); await blockedContext.addInitScript(() => { try { localStorage.setItem('ars-language', 'en'); } catch {} });
  await blockedContext.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
    Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
    Storage.prototype.removeItem = () => { throw new Error('Storage disabled'); };
  });
  const blocked = await blockedContext.newPage(); blocked.on('pageerror', (error) => errors.push(error.message));
  await blocked.goto(base); assert.equal(await theme(blocked), 'dark');
  await blocked.locator('[data-language-picker]').selectOption('en');
  await blocked.getByLabel('Color theme').selectOption('light'); assert.equal(await theme(blocked), 'light');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: 'passed', checked: ['direct copy', 'site name', 'browser theme auto-detection and live changes', 'theme override persistence across pages and reload', 'return to browser preference', '17 gallery characters, 13 founding colonies', 'enlargement', 'previous/next and arrow keys', 'deep links', 'gallery navigation preserves ranking progress', 'phone layouts, light and dark', 'Pages subdirectory gallery', 'no-JavaScript gallery', 'theme with blocked storage'], screenshots: out }, null, 2));
} finally { await browser.close(); }
