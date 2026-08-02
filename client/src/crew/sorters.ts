import type { CrewMember } from '../types/crew';

export function sortByName(crew: CrewMember[]): CrewMember[] {
  return [...crew].sort((a, b) => a.name.localeCompare(b.name));
}

export function sortByLevelThenName(crew: CrewMember[]): CrewMember[] {
  return [...crew].sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
}
