import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';

export type Comparator<T> = (a: T, b: T) => number;

export function combineComparators<T>(...comparators: Comparator<T>[]): Comparator<T> {
  return (a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return 0;
  };
}

export function byLevelDesc(a: CrewMember, b: CrewMember): number {
  return b.level - a.level;
}

export function byEquipmentSlotsRemainingDesc(a: CrewMember, b: CrewMember): number {
  return getEquipmentSlotsRemaining(b) - getEquipmentSlotsRemaining(a);
}

export function byNameAsc(a: CrewMember, b: CrewMember): number {
  return a.name.localeCompare(b.name);
}

export function sortCrew(crew: CrewMember[], comparator: Comparator<CrewMember>): CrewMember[] {
  return [...crew].sort(comparator);
}
