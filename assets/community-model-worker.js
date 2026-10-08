import { fitCommunity } from './community-model.js';
self.onmessage = ({ data }) => {
  try { const result = fitCommunity(data.sessions, 17, { seed: data.seed, onProgress: progress => self.postMessage({ type: 'progress', progress }) }); self.postMessage({ type: 'result', result }); }
  catch { self.postMessage({ type: 'error' }); }
};
