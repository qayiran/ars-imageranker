import { IMAGES } from './catalog.js';

// Character factions supplied by the site owner, not historical claims about
// every resident of these colonies. Leaders have the same weight as other art.
export const FACTIONS = Object.freeze([
  Object.freeze({ id: 'patriots', name: 'Patriots', leader: 'masachusetts', members: Object.freeze([
    'connecticut', 'delaware', 'maine', 'maryland', 'masachusetts', 'new-hampshire',
    'north-carolina', 'pennsylvania', 'rhode-island', 'south-carolina', 'virginia',
  ]) }),
  Object.freeze({ id: 'loyalists', name: 'Loyalists', leader: 'new-york', members: Object.freeze([
    'florida', 'georgia', 'new-jersey', 'new-york',
  ]) }),
]);
export const UNALIGNED = Object.freeze(['louisiana', 'vermont']);

// Extend the usual colonial regions geographically to the whole art catalog.
export const REGIONS = Object.freeze([
  Object.freeze({ id: 'new-england', name: 'New England Colonies', members: Object.freeze([
    'connecticut', 'maine', 'masachusetts', 'new-hampshire', 'rhode-island', 'vermont',
  ]) }),
  Object.freeze({ id: 'middle', name: 'Middle Colonies', members: Object.freeze([
    'delaware', 'new-jersey', 'new-york', 'pennsylvania',
  ]) }),
  Object.freeze({ id: 'southern', name: 'Southern Colonies', members: Object.freeze([
    'florida', 'georgia', 'louisiana', 'maryland', 'north-carolina', 'south-carolina', 'virginia',
  ]) }),
]);

export function groupPreferences(rankings) {
  if (!Array.isArray(rankings) || rankings.length !== IMAGES.length) return null;
  const catalog = new Set(IMAGES.map(({ id }) => id)), rows = new Map();
  for (const row of rankings) {
    if (!row || !catalog.has(row.id) || rows.has(row.id) || !Number.isFinite(row.elo)) return null;
    rows.set(row.id, row);
  }
  function summarize(groups) {
    return groups.map((group) => ({ ...group, count: group.members.length,
      // An arithmetic mean per character: group size never multiplies its score.
      mean: group.members.reduce((sum, id) => sum + rows.get(id).elo, 0) / group.members.length,
    }));
  }
  const factions = summarize(FACTIONS), regions = summarize(REGIONS);
  const difference = factions[0].mean - factions[1].mean;
  const factionLeader = Math.abs(difference) <= 1e-9 ? null : factions[difference > 0 ? 0 : 1].id;
  const orderedRegions = [...regions].sort((a, b) => b.mean - a.mean || a.id.localeCompare(b.id));
  const regionalLeaders = orderedRegions.filter((group) => orderedRegions[0].mean - group.mean <= 1e-9).map(({ id }) => id);
  const minimum = Math.floor(Math.min(1000, ...rankings.map(({ elo }) => elo)) / 100) * 100;
  const maximum = Math.ceil(Math.max(1000, ...rankings.map(({ elo }) => elo)) / 100) * 100;
  return { factions, regions, difference, factionLeader, regionalLeaders,
    scale: { minimum: minimum === maximum ? minimum - 100 : minimum, maximum: minimum === maximum ? maximum + 100 : maximum } };
}
