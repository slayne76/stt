import type { CatalogEntry } from '../types/catalogEntry';
import type { CrewMember } from '../types/crew';
import type { Collection } from '../types/collection';
import type { PolestarCatalogEntry } from '../types/polestarCatalogEntry';
import type { RetrievableCrewEntry } from '../types/retrievableCrew';
import { getCrewCollections } from '../collections/getters';
import { getEquipmentSlotsRemaining } from '../crew/getters';
import { ASSET_BASE_URL } from '../assets/config';

export interface RetrievableCrewRow {
  archetypeId: number;
  name: string;
  portraitUrl: string;
  maxRarity: number;
  rarity: number | null; // null = not currently owned
  level: number | null;
  itemsToEquip: number | null;
  totalCollections: number;
  polestarIds: (number | null)[]; // length 4, Polestar #1..#4 in order
}

export function buildPolestarCatalogMap(catalog: PolestarCatalogEntry[]): Map<number, PolestarCatalogEntry> {
  return new Map(catalog.map((p) => [p.id, p]));
}

const SKILL_FILTER_KEYS = new Set([
  'command_skill',
  'diplomacy_skill',
  'security_skill',
  'engineering_skill',
  'science_skill',
  'medicine_skill',
]);

const RARITY_KEY_PATTERN = /^crew_max_rarity_(\d)$/;

// Resolves one raw polestarFilterKey (from CatalogEntry.polestarFilterKeys)
// to its catalog entry: a "crew_max_rarity_N" key is a rarity Polestar, one
// of the 6 known "*_skill" keys is a skill Polestar, anything else is a
// trait Polestar. Unused by RetrievableCrewTable this phase (the table only
// renders the 4 chosen slots) — this is plumbing for the next phase's
// "choose up to 4 from the eligible pool" picker.
export function resolvePolestarFilterKey(
  key: string,
  polestarCatalog: PolestarCatalogEntry[]
): PolestarCatalogEntry | null {
  const rarityMatch = RARITY_KEY_PATTERN.exec(key);
  if (rarityMatch) {
    const rarity = Number(rarityMatch[1]);
    return polestarCatalog.find((p) => p.filter.type === 'rarity' && p.filter.rarity === rarity) ?? null;
  }
  if (SKILL_FILTER_KEYS.has(key)) {
    return polestarCatalog.find((p) => p.filter.type === 'skill' && p.filter.skill === key) ?? null;
  }
  return polestarCatalog.find((p) => p.filter.type === 'trait' && p.filter.trait === key) ?? null;
}

// Same "unused this phase, plumbing for the next" note as above.
export function resolveEligiblePolestars(
  filterKeys: string[],
  polestarCatalog: PolestarCatalogEntry[]
): PolestarCatalogEntry[] {
  return filterKeys
    .map((key) => resolvePolestarFilterKey(key, polestarCatalog))
    .filter((entry): entry is PolestarCatalogEntry => entry !== null);
}

// Resolves one chosen Polestar slot (an id or null) to its catalog entry.
// null in, null out; an id with no catalog match also yields null (renders
// as "—", never throws) — retrievable-crew.json is hand-authored data with
// no schema validation against the live Polestar catalog.
export function resolvePolestarSlot(
  id: number | null,
  polestarCatalogMap: Map<number, PolestarCatalogEntry>
): PolestarCatalogEntry | null {
  if (id === null) return null;
  return polestarCatalogMap.get(id) ?? null;
}

// Picks the most-invested owned copy of a tracked archetype, if any:
// highest rarity first, then highest level. Every other crew page in this
// app shows ALL owned copies as separate rows; this page shows exactly one
// row per tracked crew regardless of how many copies are owned, so a
// tie-break is needed.
function pickBestOwnedCopy(archetypeId: number, crewList: CrewMember[]): CrewMember | null {
  const owned = crewList.filter((c) => c.archetype_id === archetypeId);
  if (owned.length === 0) return null;
  return [...owned].sort((a, b) => b.rarity - a.rarity || b.level - a.level)[0];
}

// A tracked archetype missing from the live crew catalog (e.g. removed
// upstream) is skipped rather than rendered with broken/placeholder data.
export function buildRetrievableCrewRows(
  entries: RetrievableCrewEntry[],
  catalog: CatalogEntry[],
  crewList: CrewMember[],
  collections: Collection[]
): RetrievableCrewRow[] {
  const catalogMap = new Map(catalog.map((c) => [c.archetype_id, c]));
  const rows: RetrievableCrewRow[] = [];
  for (const entry of entries) {
    const catalogEntry = catalogMap.get(entry.archetypeId);
    if (!catalogEntry) continue;
    const owned = pickBestOwnedCopy(entry.archetypeId, crewList);
    rows.push({
      archetypeId: entry.archetypeId,
      name: catalogEntry.name,
      portraitUrl: `${ASSET_BASE_URL}/${catalogEntry.imageUrlPortrait}`,
      maxRarity: catalogEntry.max_rarity,
      rarity: owned?.rarity ?? null,
      level: owned?.level ?? null,
      itemsToEquip: owned ? getEquipmentSlotsRemaining(owned) : null,
      totalCollections: getCrewCollections(catalogEntry, collections).length,
      // Normalize to exactly 4 slots — retrievable-crew.json is hand-edited with no schema
      // validation this phase, and a malformed/missing/wrong-length polestars array must not
      // crash the table or misalign its fixed 11-column header.
      polestarIds: Array.from({ length: 4 }, (_, i) => entry.polestars?.[i] ?? null),
    });
  }
  return rows;
}
