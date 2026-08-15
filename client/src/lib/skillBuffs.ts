import type { PlayerData } from '../types/player';
import { SKILL_LABELS } from '../crew/skillLabels';

export interface SkillBonus {
  skill: string;
  value: number;
}

export interface ProficiencyBonus {
  skill: string;
  min: number;
  max: number;
}

interface Buff {
  stat: string;
  value: number;
}

const CORE_SKILL_STAT = /^(\w+)_skill_core$/;
const PROFICIENCY_STAT = /^(\w+)_skill_range_(min|max)$/;

function getAllBuffs(data: PlayerData): Buff[] {
  const player = (data.player ?? {}) as Record<string, unknown>;
  const character = (player.character ?? {}) as Record<string, unknown>;
  const buffs = character.all_buffs;
  return Array.isArray(buffs) ? (buffs as Buff[]) : [];
}

export function getBaseSkillBonuses(data: PlayerData): SkillBonus[] {
  const values: Record<string, number> = {};
  for (const buff of getAllBuffs(data)) {
    const match = buff.stat.match(CORE_SKILL_STAT);
    if (match && SKILL_LABELS[match[1]]) {
      values[match[1]] = Math.round(buff.value * 100);
    }
  }
  return Object.keys(SKILL_LABELS)
    .map((key) => ({ skill: SKILL_LABELS[key], value: values[key] ?? 0 }))
    .sort((a, b) => b.value - a.value || a.skill.localeCompare(b.skill));
}

export function getProficiencyBonuses(data: PlayerData): ProficiencyBonus[] {
  const mins: Record<string, number> = {};
  const maxs: Record<string, number> = {};
  for (const buff of getAllBuffs(data)) {
    const match = buff.stat.match(PROFICIENCY_STAT);
    if (match && SKILL_LABELS[match[1]]) {
      if (match[2] === 'min') mins[match[1]] = Math.round(buff.value * 100);
      else maxs[match[1]] = Math.round(buff.value * 100);
    }
  }
  return Object.keys(SKILL_LABELS)
    .map((key) => ({ skill: SKILL_LABELS[key], min: mins[key] ?? 0, max: maxs[key] ?? 0 }))
    .sort((a, b) => b.min - a.min || a.skill.localeCompare(b.skill));
}
