import { IMAGES } from './catalog.js';
import { characterCategory } from './character-details.js';
import { openCharacter } from './viewer.js';
let viewer = null;
function openFromHash() {
  const id = location.hash.slice(1);
  const index = IMAGES.findIndex((image) => image.id === id);
  if (index < 0) { viewer?.close(); viewer = null; return; }
  if (viewer?.open) viewer.close();
  const image = IMAGES[index];
  const current = openCharacter(image, {
    category: characterCategory(image),
    onPrevious: () => { location.hash = IMAGES[(index + IMAGES.length - 1) % IMAGES.length].id; },
    onNext: () => { location.hash = IMAGES[(index + 1) % IMAGES.length].id; },
    onClose: () => {
      // A delayed close event from a replaced viewer must not clear a new one.
      if (viewer !== current) return;
      viewer = null;
      if (location.hash === `#${image.id}`) history.replaceState(null, '', location.pathname + location.search);
    },
  });
  viewer = current;
}
document.querySelectorAll('[data-character]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  const hash = `#${link.dataset.character}`;
  if (location.hash === hash) openFromHash(); else location.hash = hash;
}));
window.addEventListener('hashchange', openFromHash);
openFromHash();
