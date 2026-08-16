import type { CrewMember } from '../types/crew';
import { getEquipmentSlotsRemaining } from './getters';

const PRIORITY_COUNT_LIMIT = 5;

// A row "counts" toward the limit unless it's already fully leveled and
// equipped — level 100 with 0 equipment slots missing. Matches the user's
// worked example: "lvl 100 -0" rows are kept in the output but don't
// advance the counter that decides where the list stops.
function countsTowardLimit(crew: CrewMember): boolean {
  return crew.level < 100 || getEquipmentSlotsRemaining(crew) < 0;
}

export function applyPriorityCutoff(rankedCrew: CrewMember[], limit: number = PRIORITY_COUNT_LIMIT): CrewMember[] {
  const result: CrewMember[] = [];
  let counted = 0;
  for (const crew of rankedCrew) {
    result.push(crew);
    if (countsTowardLimit(crew)) {
      counted += 1;
      if (counted >= limit) break;
    }
  }
  return result;
}
