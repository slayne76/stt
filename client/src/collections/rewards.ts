import type { Collection } from '../types/collection';
import { SKILL_ABBREVIATIONS } from '../crew/skillLabels';

const CORE_SKILL_PATTERN = /^(.+) Core Skill \+\d+%$/;
const SKILL_PROFICIENCY_PATTERN = /^(.+) Skill Proficiency (?:Min|Max) \+\d+%$/;

function abbreviateSkill(skill: string): string {
  return SKILL_ABBREVIATIONS[skill.toLowerCase()] ?? skill;
}

export function getCuratedRewards(collection: Collection): string[] {
  const skillSet = new Set<string>();
  const proficiencySet = new Set<string>();

  for (const buff of collection.milestone.buffs) {
    const coreMatch = buff.name.match(CORE_SKILL_PATTERN);
    if (coreMatch) {
      skillSet.add(coreMatch[1]);
      continue;
    }
    const proficiencyMatch = buff.name.match(SKILL_PROFICIENCY_PATTERN);
    if (proficiencyMatch) {
      proficiencySet.add(proficiencyMatch[1]);
    }
  }

  const rewards: string[] = [];

  for (const skill of skillSet) {
    rewards.push(`Skill: ${abbreviateSkill(skill)}`);
  }
  for (const skill of proficiencySet) {
    rewards.push(`Proficiency: ${abbreviateSkill(skill)}`);
  }

  for (const reward of collection.milestone.rewards) {
    if (reward.symbol === 'premium_10x_bundle') {
      rewards.push(`10x Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_1x_bundle') {
      rewards.push(`Portal (${reward.quantity})`);
    } else if (reward.symbol === 'premium_purchasable') {
      rewards.push(`Dilithium (${reward.quantity})`);
    } else if (reward.type === 1) {
      rewards.push(reward.full_name);
    } else if (reward.symbol === 'niners_avatar') {
      rewards.push('The Niners Avatar');
    } else if (reward.symbol === 'honorable_citation_quality5') {
      rewards.push('Legendary Honorable Citation');
    }
  }

  return rewards;
}
