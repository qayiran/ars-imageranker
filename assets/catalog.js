// Deliberately fixed: visitors cannot supply or remove images.
export const CATALOG_VERSION = 'showcase-2026-10-v1';
const filenames = [
  'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Louisiana', 'Maine',
  'Maryland', 'Masachusetts', 'New Hampshire', 'New Jersey', 'New York',
  'North Carolina', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'Vermont', 'Virginia',
];
export const IMAGES = Object.freeze(filenames.map((name) => Object.freeze({
  id: name.toLowerCase().replaceAll(' ', '-'),
  name: name === 'Masachusetts' ? 'Massachusetts' : name,
  file: `${name}_Showcase.png`,
})));
export const TOTAL_PAIRS = IMAGES.length * (IMAGES.length - 1) / 2;
export const imageUrl = (image) => new URL(`../showcase/${encodeURIComponent(image.file)}`, import.meta.url).href;
