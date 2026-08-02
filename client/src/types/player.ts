export interface PlayerIdentity {
  playerId: number | string | null;
  dbid: number | string | null;
}

export type PlayerData = Record<string, unknown>;
