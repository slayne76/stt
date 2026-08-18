import type { CatalogEntry } from '../types/catalogEntry';
import type { ShipCatalogEntry } from '../types/shipCatalogEntry';
import type { Choice, Dilemma } from '../types/dilemma';

export type ChoiceIconKind = 'check' | 'x' | 'circle';

function isPositiveChoice(choice: Choice): boolean {
  return choice.leadsToDilemmaId !== undefined || (choice.rewards?.length ?? 0) > 0;
}

export function dilemmaHasRelation(dilemma: Dilemma): boolean {
  return dilemma.choices.some(isPositiveChoice);
}

// check: this choice leads to a follow-up dilemma or grants a reward — either
//   counts as a "positive" outcome.
// x: this choice does neither, but some other choice in the same dilemma
//   does — the dilemma has *some* relation, this choice just isn't it.
// circle: the whole dilemma has zero reward and zero chain link anywhere —
//   fully standalone, no relation at all.
export function getChoiceIcon(dilemma: Dilemma, choice: Choice): ChoiceIconKind {
  if (isPositiveChoice(choice)) return 'check';
  return dilemmaHasRelation(dilemma) ? 'x' : 'circle';
}

export function sortedDilemmas(dilemmas: Dilemma[]): Dilemma[] {
  return [...dilemmas].sort(
    (a, b) => a.chainName.localeCompare(b.chainName) || a.partNumber - b.partNumber
  );
}

export function buildCatalogEntryMap(catalog: CatalogEntry[]): Map<number, CatalogEntry> {
  return new Map(catalog.map((c) => [c.archetype_id, c]));
}

export function buildShipCatalogEntryMap(catalog: ShipCatalogEntry[]): Map<number, ShipCatalogEntry> {
  return new Map(catalog.map((c) => [c.archetype_id, c]));
}

// How many dilemmas share a given chainName — drives the "(part x/y)"
// subtitle in DilemmasTable.tsx, shown only when this is > 1. Purely
// derived from chainName/partNumber already on every Dilemma; no schema
// change. Two dilemmas can share a chainName despite having completely
// unrelated `name` values (see "The Beginning of the End of the World" /
// "The Voice of the Prophets") — the subtitle is what makes that
// relationship visible in the table.
export function getChainSizeByName(dilemmas: Dilemma[]): Map<string, number> {
  const sizes = new Map<string, number>();
  for (const d of dilemmas) {
    sizes.set(d.chainName, (sizes.get(d.chainName) ?? 0) + 1);
  }
  return sizes;
}
