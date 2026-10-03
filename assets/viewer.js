import { imageUrl } from './catalog.js';
export function openCharacter(image, { category = '', onPrevious, onNext, onClose } = {}) {
  const dialog = document.createElement('dialog');
  const heading = document.createElement('h2'); heading.textContent = image.name;
  const header = document.createElement('div'); header.className = 'zoom-header';
  const close = document.createElement('button'); close.className = 'zoom-close'; close.textContent = 'Close ×'; close.autofocus = true;
  header.append(heading, close); dialog.append(header);
  if (category) {
    const caption = document.createElement('p'); caption.className = 'viewer-caption'; caption.textContent = `${category} · HIROTONFA’s American Revolution Smuggler`;
    dialog.append(caption);
  }
  const artwork = document.createElement('img'); artwork.className = 'zoom-image'; artwork.src = imageUrl(image); artwork.alt = `${image.name} character artwork by HIROTONFA`; dialog.append(artwork);
  if (onPrevious && onNext) {
    const navigation = document.createElement('div'); navigation.className = 'viewer-navigation';
    for (const [label, action] of [['← Previous character', onPrevious], ['Next character →', onNext]]) {
      const button = document.createElement('button'); button.className = 'secondary'; button.textContent = label;
      button.addEventListener('click', () => { dialog.close(); action(); }); navigation.append(button);
    }
    dialog.append(navigation);
    dialog.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault(); dialog.close(); (event.key === 'ArrowLeft' ? onPrevious : onNext)();
    });
  }
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); });
  document.body.append(dialog); dialog.showModal();
  return dialog;
}
