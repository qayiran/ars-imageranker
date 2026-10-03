// The original thirteen colonies, as listed in the Articles of Confederation:
// https://www.archives.gov/milestone-documents/articles-of-confederation
// Labels describe status around the American Revolution, not modern statehood.
const historicalStatus = {
  florida: 'British East & West Florida',
  louisiana: 'Spanish colony',
  maine: 'Part of Massachusetts',
  vermont: 'Sovereign state · 1777–1791',
};
export const characterCategory = (image) => historicalStatus[image.id] || 'Founding colony';
