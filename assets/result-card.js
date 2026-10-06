import { IMAGES, imageUrl } from './catalog.js';
import { groupPreferences } from './group-preferences.js';
import { ratingMap } from './rank-divergence.js';
import { resultCode } from './result-identity.js';
import { t, locale } from './language.js';

export function resultCardData(rankings, { id, username, provenance } = {}) {
  if (!ratingMap(rankings) || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return null;
  const groups = groupPreferences(rankings);
  return { id, username: username || t('Your ranking'), code: resultCode(id), provenance,
    top: [...rankings].sort((a, b) => b.elo - a.elo || IMAGES.find(({ id }) => id === a.id).name.localeCompare(IMAGES.find(({ id }) => id === b.id).name)).slice(0, 3)
      .map((row) => ({ ...row, image: IMAGES.find(({ id }) => id === row.id) })),
    faction: groups.factions.find(({ id }) => id === groups.factionLeader) ?? null,
    region: groups.regions.find(({ id }) => id === groups.regionalLeaders[0]), regionTied: groups.regionalLeaders.length > 1 };
}
async function loadArtwork(image) {
  const img = new Image(); img.src = imageUrl(image);
  let timer;
  try { await Promise.race([img.decode(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Artwork could not be loaded. Please try again.')), 15000); })]); }
  catch { throw new Error('Artwork could not be loaded. Please try again.'); }
  finally { clearTimeout(timer); }
  return img;
}
function wrap(ctx, text, x, y, width, lineHeight, maximum = 2) {
  const characters = [...String(text)], lines = []; let current = '';
  for (const char of characters) {
    if (ctx.measureText(current + char).width > width && current) { lines.push(current.trim()); current = char; }
    else current += char;
  }
  if (current) lines.push(current.trim());
  for (let index = 0; index < Math.min(maximum, lines.length); index++) {
    let line = lines[index];
    if (index === maximum - 1 && lines.length > maximum) {
      while (ctx.measureText(`${line}…`).width > width) line = [...line].slice(0, -1).join('');
      line += '…';
    }
    ctx.fillText(line, x, y + index * lineHeight);
  }
}
function rectangle(ctx, x, y, width, height, radius = 12) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius); ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius); ctx.closePath(); ctx.fill(); ctx.stroke();
}
export async function createResultCard(rankings, options = {}) {
  const data = resultCardData(rankings, options);
  if (!data) throw new Error('A complete ranking is required to create a result card.');
  const artwork = await Promise.all(data.top.map(({ image }) => loadArtwork(image)));
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1400;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot create a result card.');
  const style = getComputedStyle(document.documentElement);
  const color = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
  const paper = color('--paper', '#f5f3ed'), white = color('--white', '#fffefa'), ink = color('--ink', '#272c27');
  const green = color('--green', '#284e43'), muted = color('--muted', '#767970'), line = color('--line', '#dedfd4'), soft = color('--green-light', '#e4eadf');
  const text = (value, x, y, font, fill = ink) => { ctx.font = font; ctx.fillStyle = fill; ctx.fillText(value, x, y); };
  const score = (value) => value.toLocaleString(locale(), { maximumFractionDigits: 1 });
  ctx.fillStyle = paper; ctx.fillRect(0, 0, 1200, 1400);
  text('HIROTONFA · AMERICAN REVOLUTION SMUGGLER', 54, 52, '17px sans-serif', green);
  ctx.font = '52px Georgia'; ctx.fillStyle = ink; wrap(ctx, data.username, 54, 133, 1092, 60);
  text(t('Character ranking'), 54, 252, '25px sans-serif', muted);
  if (data.provenance) text(t('Manually added'), 54, 292, '16px sans-serif', muted);
  text(t('TOP THREE CHARACTERS'), 54, 328, '16px sans-serif', green);
  data.top.forEach((row, index) => {
    const x = 54 + index * 368, y = 350, image = artwork[index];
    ctx.fillStyle = white; ctx.strokeStyle = line; ctx.lineWidth = 1; rectangle(ctx, x, y, 356, 490);
    const ratio = Math.min(320 / image.naturalWidth, 340 / image.naturalHeight);
    const width = image.naturalWidth * ratio, height = image.naturalHeight * ratio;
    ctx.drawImage(image, x + (356 - width) / 2, y + 20 + (340 - height) / 2, width, height);
    ctx.fillStyle = soft; ctx.strokeStyle = line; rectangle(ctx, x + 15, y + 15, 42, 42, 21);
    text(String(index + 1), x + 29, y + 44, '20px sans-serif', green);
    ctx.font = '25px Georgia'; ctx.fillStyle = ink; wrap(ctx, row.image.name, x + 22, y + 394, 312, 29);
    text(t`${Math.round(row.elo)} rating`, x + 22, y + 465, '20px sans-serif', green);
  });
  const summaries = [
    { title: t('Preferred faction'), name: data.faction ? t(data.faction.name) : t('Equal average ratings'), value: data.faction?.mean },
    { title: t('Preferred region'), name: data.regionTied ? t('Shared highest average') : t(data.region.name), value: data.region.mean },
  ];
  summaries.forEach((item, index) => {
    const x = 54 + index * 558;
    ctx.fillStyle = soft; ctx.strokeStyle = line; rectangle(ctx, x, 884, 534, 216);
    text(item.title, x + 25, 924, '18px sans-serif', muted);
    ctx.font = '33px Georgia'; ctx.fillStyle = green; wrap(ctx, item.name, x + 25, 975, 484, 38);
    if (item.value != null) text(t`${score(item.value)} average rating`, x + 25, 1074, '19px sans-serif', green);
  });
  text(t('Group scores use average ratings per character.'), 54, 1148, '17px sans-serif', muted);
  text(t('Result code'), 54, 1206, '15px sans-serif', muted);
  text(data.code, 54, 1240, '23px monospace', green);
  const url = new URL('results.html', location.href); url.search = ''; url.hash = data.id;
  ctx.font = '15px sans-serif'; ctx.fillStyle = muted; wrap(ctx, url.href, 54, 1300, 1092, 22);
  text(t('Artwork: HIROTONFA · 17 colony/state characters'), 54, 1360, '15px sans-serif', muted);
  return canvas;
}

export function bindResultCard(target, rankings, options = {}) {
  const button = target.querySelector('[data-preview-result-card]'), status = target.querySelector('[data-result-card-status]');
  button.addEventListener('click', async () => {
    button.disabled = true; status.textContent = t('Creating result card…');
    try {
      const canvas = await createResultCard(rankings, options);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('This browser cannot create a result card.');
      if (!button.isConnected) return;
      const url = URL.createObjectURL(blob), dialog = document.createElement('dialog'); dialog.className = 'result-card-dialog';
      dialog.setAttribute('aria-label', t('Result card preview'));
      const header = document.createElement('div'); header.className = 'zoom-header';
      const title = document.createElement('h2'); title.textContent = t('Result card preview');
      const close = document.createElement('button'); close.className = 'zoom-close'; close.textContent = t('Close ×');
      header.append(title, close); dialog.append(header);
      const img = document.createElement('img'); img.src = url; img.className = 'result-card-preview'; img.alt = t('Shareable result card'); dialog.append(img);
      const footer = document.createElement('div'); footer.className = 'result-card-actions';
      const download = document.createElement('a'); download.className = 'primary'; download.href = url;
      download.download = `ars-result-${options.id || 'ranking'}.png`; download.textContent = t('Download PNG ↓'); footer.append(download);
      const note = document.createElement('p'); note.className = 'fine-print'; note.textContent = t('The card uses the language and theme selected when it was created. It is generated on this device.'); footer.append(note); dialog.append(footer);
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => { URL.revokeObjectURL(url); dialog.remove(); });
      document.body.append(dialog); dialog.showModal(); close.focus(); status.textContent = '';
    } catch (error) { if (button.isConnected) status.textContent = t(error.message === 'Artwork could not be loaded. Please try again.' ? error.message : 'The result card could not be created. Please try again.'); }
    finally { if (button.isConnected) button.disabled = false; }
  });
}
