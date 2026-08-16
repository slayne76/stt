// server/src/citation/buffConfig.ts

export interface BuffStat {
  multiplier: number;
  percent_increase: number;
}

export type BuffStatTable = Record<string, BuffStat>;

// Verified 2026-08-16 against a real server/data/player-cache.json: these
// three arrays exist verbatim on player.character with these field names.
// crew_collection_buffs and starbase_buffs entries carry {stat, operator,
// value} (plus other fields we don't read, e.g. name/icon/source/symbol).
// captains_bridge_buffs entries also carry an `operator` field in real data
// (always 'percent_increase' in the sample), but calculateBuffConfig below
// only ever reads {stat, value} off them, matching the pinned-commit source.
interface PlayerBuffSource {
  character: {
    crew_collection_buffs: { stat: string; operator: string; value: number }[];
    starbase_buffs: { stat: string; operator: string; value: number }[];
    captains_bridge_buffs: { stat: string; value: number }[];
  };
}

const SKILLS = ['command_skill', 'science_skill', 'security_skill', 'engineering_skill', 'diplomacy_skill', 'medicine_skill'];
const BUFF_KINDS = ['core', 'range_min', 'range_max'];

// Faithful port of calculateBuffConfig from stt-datacore/website
// src/utils/voyageutils.ts:98-131 (commit b310dd5bf018df5bfb7e322d7833f449a0311620),
// MIT licensed. Reads only fields present verbatim on STT Tracker's own
// player-cache.json.
export function calculateBuffConfig(player: PlayerBuffSource): BuffStatTable {
  const buffConfig: BuffStatTable = {};

  for (const skill of SKILLS) {
    for (const kind of BUFF_KINDS) {
      buffConfig[`${skill}_${kind}`] = { multiplier: 1, percent_increase: 0 };
    }
  }

  for (const buff of player.character.crew_collection_buffs.concat(player.character.starbase_buffs)) {
    if (buffConfig[buff.stat]) {
      if (buff.operator === 'percent_increase') {
        buffConfig[buff.stat].percent_increase += buff.value;
      } else if (buff.operator === 'multiplier') {
        buffConfig[buff.stat].multiplier = buff.value;
      }
    }
  }

  player.character.captains_bridge_buffs.forEach((buff) => {
    buffConfig[buff.stat] = { multiplier: 1, percent_increase: buff.value };
  });

  return buffConfig;
}
