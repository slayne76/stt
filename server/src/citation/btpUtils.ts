// server/src/citation/btpUtils.ts
//
// Small, self-contained utilities ported from stt-datacore/website
// (commit b310dd5bf018df5bfb7e322d7833f449a0311620), MIT licensed, adapted
// to this project's CitationCrew type. Sources cited per section below.
import type { CitationCrew } from './types';

export const SKILLS = ['command', 'diplomacy', 'engineering', 'medicine', 'science', 'security'];

// Ported from crewutils.ts:shortToSkill (line 881). The pinned commit looks
// this up in CONFIG.SKILLS_SHORT / CONFIG.SKILLS_SHORT_ENGLISH (a localized
// table from src/components/CONFIG.ts); this project has no localization,
// so the English short-code table (CONFIG.ts's setLanguage('en') branch,
// lines 303-311) is inlined directly rather than porting the whole CONFIG
// class for one lookup.
const SKILLS_SHORT: { name: string; short: string }[] = [
  { name: 'command_skill', short: 'CMD' },
  { name: 'science_skill', short: 'SCI' },
  { name: 'security_skill', short: 'SEC' },
  { name: 'engineering_skill', short: 'ENG' },
  { name: 'diplomacy_skill', short: 'DIP' },
  { name: 'medicine_skill', short: 'MED' },
];

export function shortToSkill(rank: string): string | undefined {
  return SKILLS_SHORT.find((f) => f.short === rank)?.name;
}

interface SkillRarityReport {
  skill: string;
  count: number;
  position: number;
  score: number;
  crew?: CitationCrew[];
}

// Ported from crewutils.ts:getSkillOrderStats (line 1868)
export function getSkillOrderStats(config: { roster: CitationCrew[]; max?: number }): SkillRarityReport[] {
  const { roster } = config;
  const results: SkillRarityReport[] = [];

  for (const skill of SKILLS.map((s) => `${s}_skill`)) {
    for (let i = 0; i < 3; i++) {
      const rf = roster.filter((f) => f.skill_order.length > i && f.skill_order[i] === skill);
      results.push({ skill, count: rf.length, position: i, score: 0 });
    }
  }

  const max = config.max || roster.length;

  for (let i = 0; i < 3; i++) {
    const pc = results.filter((f) => f.position === i);
    if (pc.length) {
      pc.sort((a, b) => a.count - b.count);
      pc.forEach((p) => (p.score = p.count / max));
    }
  }

  results.sort((a, b) => {
    let r = a.position - b.position;
    if (!r) r = a.count - b.count;
    if (!r) r = a.skill.localeCompare(b.skill);
    return r;
  });

  return results;
}

// Ported from crewutils.ts:getSkillOrderScore (line 1919)
export function getSkillOrderScore(crew: CitationCrew, reports: SkillRarityReport[]): number {
  let result = 0;
  crew.skill_order.forEach((skill, index) => {
    const data = reports.find((f) => f.skill === skill && f.position === index);
    if (data) {
      result += (1 - data.score) * (index + 1);
    }
  });
  return result;
}

export interface PolestarCombo {
  count: number;
  alts: { symbol: string; name: string }[];
  polestars: string[];
}

// Ported verbatim (only variable typing adapted) from retrieval.ts:findPolestars
export function findPolestars(crew: CitationCrew, roster: CitationCrew[]): PolestarCombo[] {
  let polestars = crew.traits.slice();
  polestars.push('crew_max_rarity_' + crew.max_rarity);
  for (const skill in crew.base_skills) {
    if (crew.base_skills[skill]) polestars.push(skill);
  }
  polestars = polestars.sort((a, b) => a.localeCompare(b));

  const crewPolestarCombos: PolestarCombo[] = [];
  const buildCombos = (prepoles: string[], traits: string[]) => {
    for (let t = 0; t < traits.length; t++) {
      const newpoles = prepoles.slice();
      newpoles.push(traits[t]);
      if (newpoles.length <= 4) {
        crewPolestarCombos.push({ count: 0, alts: [], polestars: newpoles });
      }
      buildCombos(newpoles, traits.slice(t + 1));
    }
  };
  buildCombos([], polestars);

  for (const rc of roster) {
    if (!rc.in_portal) continue;
    const polesInCommon: string[] = [];
    for (const t of crew.traits) {
      if (rc.traits.indexOf(t) >= 0) polesInCommon.push(t);
    }
    if (polesInCommon.length > 0) {
      if (rc.max_rarity === crew.max_rarity) polesInCommon.push('crew_max_rarity_' + crew.max_rarity);
      for (const skill in rc.base_skills) {
        if (rc.base_skills[skill] && crew.base_skills[skill]) polesInCommon.push(skill);
      }
      crewPolestarCombos.forEach((combo) => {
        if (polesInCommon.length >= combo.polestars.length) {
          if (combo.polestars.every((p) => polesInCommon.indexOf(p) >= 0)) {
            combo.count++;
            if (rc.archetype_id !== crew.archetype_id) {
              combo.alts.push({ symbol: rc.symbol, name: rc.name });
            }
          }
        }
      });
    }
  }

  crewPolestarCombos.sort((a, b) => (a.count === b.count ? a.polestars.length - b.polestars.length : a.count - b.count));

  const best = crewPolestarCombos[0]?.count ?? 0;
  const optimals: PolestarCombo[] = [];
  for (const testcombo of crewPolestarCombos) {
    if (testcombo.count > best) break;
    let isSuperset = false;
    for (const opt of optimals) {
      if (testcombo.polestars.length <= opt.polestars.length) continue;
      isSuperset = opt.polestars.every((p) => testcombo.polestars.indexOf(p) >= 0);
      if (isSuperset) break;
    }
    if (isSuperset) continue;
    optimals.push(testcombo);
  }
  return optimals;
}

// Copied verbatim from src/model/voyage.ts:208 at the pinned commit
// (b310dd5bf018df5bfb7e322d7833f449a0311620) — a static 48-entry
// trait->skills antimatter-seating table. Fetched directly from GitHub at
// the pinned commit and pasted without retyping; do not hand-edit.
export const AntimatterSeatMap: { name: string; skills: string[] }[] = [
  { name: 'astrophysicist', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'science_skill'] },
  { name: 'bajoran', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'borg', skills: ['engineering_skill', 'science_skill', 'security_skill'] },
  { name: 'brutal', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'science_skill', 'security_skill'] },
  { name: 'cardassian', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'caregiver', skills: ['diplomacy_skill', 'medicine_skill'] },
  { name: 'civilian', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'medicine_skill', 'science_skill', 'security_skill'] },
  { name: 'communicator', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'costumed', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'science_skill', 'security_skill'] },
  { name: 'crafty', skills: ['command_skill', 'diplomacy_skill', 'science_skill', 'security_skill'] },
  { name: 'cultural_figure', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'cyberneticist', skills: ['engineering_skill', 'science_skill'] },
  { name: 'desperate', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'science_skill', 'security_skill'] },
  { name: 'diplomat', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'doctor', skills: ['diplomacy_skill', 'medicine_skill', 'science_skill'] },
  { name: 'duelist', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'exobiology', skills: ['science_skill'] },
  { name: 'explorer', skills: ['command_skill', 'engineering_skill', 'security_skill'] },
  { name: 'federation', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'medicine_skill', 'science_skill', 'security_skill'] },
  { name: 'ferengi', skills: ['diplomacy_skill'] },
  { name: 'gambler', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'hero', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'hologram', skills: ['command_skill', 'diplomacy_skill', 'medicine_skill', 'science_skill'] },
  { name: 'human', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'medicine_skill', 'science_skill', 'security_skill'] },
  { name: 'hunter', skills: ['command_skill', 'security_skill'] },
  { name: 'innovator', skills: ['command_skill', 'engineering_skill', 'science_skill'] },
  { name: 'inspiring', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'jury_rigger', skills: ['command_skill', 'engineering_skill', 'security_skill'] },
  { name: 'klingon', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'marksman', skills: ['security_skill'] },
  { name: 'maverick', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'mirror_universe', skills: ['command_skill', 'diplomacy_skill', 'science_skill', 'security_skill'] },
  { name: 'nurse', skills: ['medicine_skill'] },
  { name: 'pilot', skills: ['command_skill', 'engineering_skill', 'security_skill'] },
  { name: 'prodigy', skills: ['engineering_skill', 'science_skill'] },
  { name: 'resourceful', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'science_skill', 'security_skill'] },
  { name: 'romantic', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'science_skill', 'security_skill'] },
  { name: 'romulan', skills: ['diplomacy_skill', 'security_skill'] },
  { name: 'saboteur', skills: ['command_skill', 'security_skill'] },
  { name: 'scoundrel', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'starfleet', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'medicine_skill', 'science_skill', 'security_skill'] },
  { name: 'survivalist', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'tactician', skills: ['command_skill', 'diplomacy_skill', 'engineering_skill', 'science_skill', 'security_skill'] },
  { name: 'telepath', skills: ['command_skill', 'diplomacy_skill', 'science_skill', 'security_skill'] },
  { name: 'undercover_operative', skills: ['command_skill', 'diplomacy_skill', 'science_skill', 'security_skill'] },
  { name: 'veteran', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'villain', skills: ['command_skill', 'diplomacy_skill', 'security_skill'] },
  { name: 'vulcan', skills: ['command_skill', 'diplomacy_skill', 'science_skill', 'security_skill'] },
];

// Ported from voyageutils.ts:lookupAMSeatsByTrait
export function lookupAMSeatsByTrait(trait: string): string[] {
  for (const entry of AntimatterSeatMap) {
    if (entry.name === trait) return entry.skills;
  }
  return [];
}

// NOTE: this module deliberately carries NO item/quipment helpers (upstream's
// `haveCount`, `calcItemDemands`, `getItemBonuses`, `getItemWithBonus` and the
// `STATS_CONFIG` table). Their only possible consumer here would have been
// Beta Tachyon Pulse's quipment block, which is dead code at the pinned commit
// (see betaTachyonPulse.ts adaptation note 5) — porting them kept a 32MB
// items fetch/cache/parse pipeline alive to feed code that never ran.
