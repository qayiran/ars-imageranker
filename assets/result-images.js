import { IMAGES, imageUrl } from './catalog.js';
import { openCharacter } from './viewer.js';
import { characterCategory } from './character-details.js';
import { t } from './language.js';
const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function thumbnail(id, name, { rank, rating, className = 'result-thumbnail' } = {}) {
  const image = IMAGES.find((item) => item.id === id);
  const label = rank ? t`Enlarge ${name}, rank ${rank}, rating ${rating}` : t`Enlarge ${name}`;
  return `<button type="button" class="${className}" data-result-image="${id}" aria-label="${escape(label)}"><img src="${imageUrl(image)}" alt="${escape(t`${name} character artwork`)}" loading="lazy" width="600" height="700"><span class="thumbnail-enlarge" aria-hidden="true">↗</span></button>`;
}
export function bindResultImages(target, rankings) {
  target.querySelectorAll('[data-result-image]').forEach((button) => button.addEventListener('click', () => {
    const order = rankings.map((row) => IMAGES.find((image) => image.id === row.id));
    let current = order.findIndex((image) => image.id === button.dataset.resultImage);
    function show(index) {
      current = (index + order.length) % order.length;
      const image = order[current];
      openCharacter(image, { category: characterCategory(image), onPrevious: () => show(current - 1), onNext: () => show(current + 1) });
    }
    show(current);
  }));
}
export function rankedImageGrid(rankings) {
  return `<section class="ranked-artwork" aria-label="${escape(t('All characters'))}"><div class="ranked-artwork-heading"><h2>${t('All characters')}</h2><p>${t('In ranking order. Select an image to enlarge it.')}</p></div><ol class="ranked-artwork-grid">${rankings.map((row, index) => `<li>${thumbnail(row.id, row.name, { rank: index + 1, rating: Math.round(row.elo) })}<div class="ranked-artwork-info"><span class="artwork-rank">${String(index + 1).padStart(2, '0')}</span><div><h3>${escape(row.name)}</h3><p>${t`${Math.round(row.elo)} rating`}</p></div></div></li>`).join('')}</ol></section>`;
}
