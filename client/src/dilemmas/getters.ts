import type { CatalogEntry } from '../types/catalogEntry';
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
