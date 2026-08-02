import type { CrewMember } from '../types/crew';

export function sortByName(crew: CrewMember[]): CrewMember[] {
  return [...crew].sort((a, b) => a.name.localeCompare(b.name));
}
