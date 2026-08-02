import type { PlayerData } from '../types/player';
import type { CrewMember } from '../types/crew';

export function getCrewList(data: PlayerData): CrewMember[] {
  const player = data.player as Record<string, unknown> | undefined;
  const character = player?.character as Record<string, unknown> | undefined;
  const crew = character?.crew;
  return Array.isArray(crew) ? (crew as CrewMember[]) : [];
}
