import type { PlayerData, PlayerIdentity } from '../types/player';

// STT's /player payload nests the player record under `player`; exact field
// names are confirmed against the live response, not guessed here.
export function extractPlayerIdentity(data: PlayerData): PlayerIdentity {
  const player = (data.player ?? {}) as Record<string, unknown>;
  const dbid = player.dbid;
  const id = player.id ?? dbid;

  return {
    playerId: isDisplayable(id) ? id : null,
    dbid: isDisplayable(dbid) ? dbid : null,
  };
}

function isDisplayable(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string';
}
