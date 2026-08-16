// server/src/citation/betaTachyonPulse.ts
//
// Faithful port of datacore.app's "Beta Tachyon Pulse (Experimental)" citation
// engine.
//
//   Source:  https://github.com/stt-datacore/website
//   File:    src/workers/betatachyon.ts  (645 lines)
//   Commit:  b310dd5bf018df5bfb7e322d7833f449a0311620
//   License: MIT
//
// Settings constants come from src/components/optimizer/btsettings.tsx at the
// same commit (`DefaultBetaTachyonSettings`).
//
// Fidelity is the point of this file. Every formula, comparison, sort order and
// upstream quirk below is reproduced exactly as written — including the ones
// that are plainly bugs. Do not "clean up" or simplify anything here: any
// change silently diverges our ranking from datacore.app's, which is the only
// thing this port is judged against.
//
// ---------------------------------------------------------------------------
// HOW THE UPSTREAM INPUT MAPS ONTO OURS
// ---------------------------------------------------------------------------
// Upstream `BetaTachyonRunnerConfig` carries datacore's fully-processed
// `PlayerData`, not the raw player file. The processing that matters is
// `prepareProfileData()` (src/utils/crewutils.ts:693) -> `prepareOne()`
// (:457), which rebuilds `player.character.crew` as catalog entries overlaid
// with player-instance fields. Two consequences drive this port:
//
//   * FROZEN CREW ARE IN THE ROSTER. `prepareOne` emits a roster entry for
//     every `stored_immortals` / `c_stored_immortals` archetype at level 100 /
//     max rarity / `equipment = [0,1,2,3]` / `immortal = quantity`, with
//     `have = true`. So `playerData.player.character.crew` — which this
//     algorithm reads five separate times — includes them. This is the same
//     dependency Task 3 found in optimizer.js and it is load-bearing here too:
//     frozen crew populate `immoCrew` (the bar `compareCrew` measures every
//     citable crew against) and the `finished` list in `getVoyageImprovements`.
//     => `ownedCrew` MUST be frozen-crew-first-then-active, exactly as Task 5
//        assembles it.
//
//   * ROSTER CREW CARRY CATALOG TRAITS. `prepareOne` overlays only a fixed list
//     of player-instance fields onto the catalog template, and `traits` is not
//     on it. `mergeCrewWithCatalog` now mirrors that, which is also what makes
//     synthesized frozen crew (no player instance, hence no traits of their
//     own) correct. For the record: nothing in this file reads a *frozen*
//     crew's traits — `getAMSeats` and `findPolestars` are only ever called on
//     `resultCrew`, which is derived from `evalCrew`, which excludes every
//     immortal crew. Catalog traits ARE read, on every catalog entry, by
//     `findPolestars`'s roster argument.
//
// ---------------------------------------------------------------------------
// ADAPTATIONS (the only intentional deviations; each is behaviour-preserving)
// ---------------------------------------------------------------------------
// 1. Synchronous. Upstream wraps the whole body in `new Promise(resolve => ...)`
//    purely because it runs in a web worker; nothing inside awaits. The
//    promise wrapper is dropped and `resolve(...)` becomes `return`.
//
// 2. Computed skills live on `crew.computed`, not on the crew object itself.
//    Upstream writes buffed stats onto the crew as sibling properties
//    (`crew.command_skill = {core, min, max}`) and then tests `skill in crew`.
//    `applyCrewBuffs` seeds all six skills with `{core:0,min:0,max:0}` before
//    overwriting the ones the crew actually has, so `skill in crew` is
//    unconditionally true for all six on every crew this algorithm touches —
//    which makes a dedicated map exactly equivalent, and typable. Every
//    `skill in crew` test is therefore reproduced as its always-true value, and
//    every `crew[skill].core` test as `crew.computed[skill].core`.
//
// 3. `equipment` is reduced to `equipmentCount`. The only thing read off it is
//    `crew.equipment?.length === 4` in `isImmortal`.
//
// 4. Output. Returns `CitationCrew[]` (the caller's own objects, via a
//    back-reference) rather than `CiteData`. Upstream's `crewToRetrieve`,
//    `crewToTrain` and `skillOrderRarities` are not returned — this feature
//    does not use them. `crewToCite`'s own filter and sort are kept verbatim,
//    and no cutoff is applied.
//
// 5. The quipment block (upstream lines 334-336) is NOT ported. It builds
//    `quipment` from `coreItems` and assigns `q.item.demands = calcItemDemands(...)`,
//    and then nothing ever reads `quipment` again — the one consumer,
//    `calcQuipmentScore(crew, quipment, true)` on line 494, is commented out in
//    the pinned source. The score's quipment term reads `crew.ranks.scores.quipment`
//    (line 554), which comes from the catalog, not from this block. It is also
//    unreachable under our signature: it needs `playerData.player.character.items`,
//    the player's item inventory, which `citeBetaTachyon` is not given. Omitting
//    it is provably output-neutral and saves a ~23k x ~2k linear scan per run.
//    `items` stays on the signature so Task 5's call site does not have to
//    change if this ever becomes live upstream.
//
// 6. `ac.date_added = new Date(ac.date_added)` (line 348) is not ported:
//    written once, never read anywhere in the file.
//
// 7. `playerData.citeMode` rarity pre-filtering (lines 281-285) is not ported —
//    `citeMode` is the datacore UI's own filter state and has no analogue here;
//    with it unset upstream skips the block entirely.
//
// 8. Defensive empty-`resultCrew` early return. Upstream's `maxvoy`/`maxev`/...
//    reducers (lines 525-531) have no initial value and would throw on an
//    empty array. Upstream only guards the empty-`evalCrew` case. Returning []
//    cannot diverge from a run that produces a ranking.

import type { CitationCrew, CitationCrewEntry, CitationRanks, PlayerCryoCollection } from './types';
import type { ItemEntry } from '../itemsClient';
import type { CollectionDefinition } from '../collectionsClient';
import type { BuffStatTable } from './buffConfig';
import {
  findPolestars,
  getSkillOrderScore,
  getSkillOrderStats,
  lookupAMSeatsByTrait,
  shortToSkill,
  type PolestarCombo,
} from './btpUtils';

// Ported verbatim from src/components/optimizer/btsettings.tsx:127-162.
// Fixed rather than parameterised: this feature always runs the site's own
// "Default" preset, which is what datacore.app shows on a fresh visit.
export const DefaultBetaTachyonSettings = {
  name: 'Default',
  is_custom: false,
  // Magic number
  magic: 10,
  // Base Power Score
  power: 3,
  // Skill-Order Rarity
  skillRare: 2,
  // Overall Roster Power Rank
  score: 1,
  // Power Rank Within Skill Order
  triplet: 3,
  // Rareness
  rareness: 1,
  // Effort To Max
  citeEffort: 0.75,
  // Antimatter Traits
  antimatter: 0.1,
  // Stat-Boosting Collections Increased
  collections: 2,
  // In Portal Now
  portal: 1.5,
  // In Portal Ever
  never: 3,
  // Retrieval odds
  retrieval: 3,
  // Quipment Score
  quipment: 0.5,
  // Voyages Improved
  improved: 1,
  // Voyage Group Sparsity
  groupSparsity: 2,
};

interface ComputedSkill {
  core: number;
  min: number;
  max: number;
  skill?: string;
}

interface RangeSkill {
  core: number;
  range_min: number;
  range_max: number;
  skill?: string;
}

// The working crew record. Stands in for upstream's `PlayerCrew | CrewMember`,
// which is one loosely-typed object used both for roster crew and for catalog
// crew; the two are built by `toRosterCrew` / `toCatalogCrew` below.
interface BTCrew {
  id: number;
  symbol: string;
  name: string;
  archetype_id: number;
  level: number;
  rarity: number;
  max_rarity: number;
  equipmentCount: number;
  traits: string[];
  base_skills: Record<string, RangeSkill>;
  skill_order: string[];
  in_portal: boolean;
  obtained: string;
  collection_ids: string[];
  unique_polestar_combos: string[][];
  ranks: CitationRanks;
  computed: Record<string, ComputedSkill>;
  immortal: boolean;
  have: boolean;
  // Back-reference to the caller's object, so the ranked output can be handed
  // back as `CitationCrew[]`. Null for catalog-only crew.
  source: CitationCrew | null;

  // State `scanCrew` builds up over its own body.
  voyScores?: Record<string, number>;
  voyagesImproved?: string[];
  collectionsIncreased?: string[];
  totalEVContribution?: number;
  evPerCitation?: number;
  totalEVRemaining?: number;
  amTraits?: string[];
  score?: number;
  scoreTrip?: number;
  groupSparsity?: number;
}

interface SkillOrderRarity {
  skillorder: string;
  skills: string[];
  rarity: number;
  count: number;
}

// Upstream's module-level skill lists (betatachyon.ts:108-109). Order matters:
// `getSkillOrder`/`getSortedSkills` walk `skills` and `voyskills` in lockstep.
const skills = [
  'command_skill',
  'diplomacy_skill',
  'science_skill',
  'engineering_skill',
  'security_skill',
  'medicine_skill',
];
const voyskills = ['command', 'diplomacy', 'science', 'engineering', 'security', 'medicine'];

// Ported from betatachyon.ts:14-49 (`applyCrewBuffs`). Upstream mutates the
// crew in place and also returns a `BaseSkills` copy that `scanCrew` ignores;
// here it just returns the computed map (see adaptation 2).
function applyCrewBuffs(base: Record<string, RangeSkill>, buffConfig: BuffStatTable): Record<string, ComputedSkill> {
  const getMultiplier = (skill: string, stat: string) =>
    buffConfig[`${skill}_${stat}`].multiplier + buffConfig[`${skill}_${stat}`].percent_increase;

  const computed: Record<string, ComputedSkill> = {};
  for (const skill of skills) {
    computed[skill] = { core: 0, min: 0, max: 0 };
  }
  for (const skill in base) {
    if (!buffConfig[`${skill}_core`]) continue;
    computed[skill] = {
      core: Math.round(base[skill].core * getMultiplier(skill, 'core')),
      min: Math.round(base[skill].range_min * getMultiplier(skill, 'range_min')),
      max: Math.round(base[skill].range_max * getMultiplier(skill, 'range_max')),
      skill,
    };
  }
  return computed;
}

// Ported from prepareOne's "Use skills directly from player data when possible"
// branch (crewutils.ts:628-643). Note the else-arm: a skill the instance does
// not have is seeded to a zeroed entry, same as applyCrewBuffs does.
function fromPlayerSkills(playerSkills: Record<string, RangeSkill>): Record<string, ComputedSkill> {
  const computed: Record<string, ComputedSkill> = {};
  for (const skill of skills) {
    const data = playerSkills[skill];
    computed[skill] = data
      ? { core: data.core, min: data.range_min, max: data.range_max, skill }
      : { core: 0, min: 0, max: 0 };
  }
  return computed;
}

// betatachyon.ts:131-139
function skillScore(skill: ComputedSkill | RangeSkill | undefined): number {
  if (!skill?.core) return 0;
  if ('max' in skill) {
    return skill.core + (((skill.max ?? 0) + (skill.min ?? 0)) * 0.5);
  }
  return skill.core + (((skill.range_max ?? 0) + (skill.range_min ?? 0)) * 0.5);
}

// betatachyon.ts:277-279. NOTE this is the algorithm's OWN local definition,
// which is stricter than crewutils.ts's exported `isImmortal` (that one also
// accepts a crew with no `equipment` at all). The local one is what gates
// `evalCrew` and `immoCrew`, so it is the one ported.
function isImmortal(c: { level: number; equipmentCount: number; rarity: number; max_rarity: number }): boolean {
  return c.level === 100 && c.equipmentCount === 4 && c.rarity === c.max_rarity;
}

// betatachyon.ts:103-106
function isNever(crew: BTCrew): boolean {
  const ob = crew?.obtained?.toLowerCase() ?? 'Unknown';
  return (
    ob.includes('bossbattle') ||
    ob.includes('honor') ||
    ob.includes('gauntlet') ||
    ob.includes('voyage') ||
    ob.includes('collection')
  );
}

// betatachyon.ts:155-179
function getSkillOrder(crew: BTCrew, forceTwo?: boolean): string[] {
  const sk: RangeSkill[] = [];
  let x = 0;
  for (const skill of skills) {
    if (skill in crew.base_skills) {
      sk.push({ ...crew.base_skills[skill], skill: voyskills[x] });
    }
    x++;
  }

  sk.sort((a, b) => b.core - a.core);
  const output: string[] = [];

  if (sk.length > 0 && sk[0].skill) output.push(sk[0].skill);
  if (sk.length > 1 && sk[1].skill) output.push(sk[1].skill);
  if (sk.length > 2 && sk[2].skill) output.push(sk[2].skill);

  return forceTwo ? output.slice(0, 2) : output;
}

// betatachyon.ts:181-183
function printSkillOrder(crew: BTCrew, forceTwo?: boolean): string {
  return getSkillOrder(crew, forceTwo).join('/');
}

// betatachyon.ts:185-210. Upstream iterates all six skills guarded by
// `skill in crew`, which is always true after applyCrewBuffs — so this always
// considers all six and keeps the best three by skillScore (see adaptation 2).
function getSortedSkills(crew: BTCrew, forceTwo?: boolean): { crew: BTCrew; skills: ComputedSkill[] } {
  const sk: ComputedSkill[] = [];
  let x = 0;
  for (const skill of skills) {
    sk.push({ ...crew.computed[skill], skill: voyskills[x] });
    x++;
  }
  sk.sort((a, b) => skillScore(b) - skillScore(a));
  const output: { crew: BTCrew; skills: ComputedSkill[] } = { crew, skills: [] };
  if (sk.length > 0 && sk[0].skill) output.skills.push({ ...sk[0] });
  if (sk.length > 1 && sk[1].skill) output.skills.push({ ...sk[1] });
  if (!forceTwo && sk.length > 2 && sk[2].skill) output.skills.push({ ...sk[2] });
  return output;
}

// betatachyon.ts:141-143
function getAMSeats(crew: BTCrew): string[] {
  return crew.traits.filter((tn) => lookupAMSeatsByTrait(tn).some((sk) => !!crew.computed[sk]?.core));
}

// betatachyon.ts:145-153
function countSkills(crew: BTCrew): number {
  let x = 0;
  for (const skill of skills) {
    if (crew.computed[skill].core) x++;
  }
  return x;
}

// betatachyon.ts:226-242
function findBest(crew: BTCrew[], sk: string[], top: number, forceTwo?: boolean): BTCrew[] {
  if (sk.length === 2 || forceTwo) {
    const skillcrew = crew
      .filter((c) => c.computed[sk[0]].core && c.computed[sk[1]].core)
      .sort(
        (a, b) =>
          skillScore(b.computed[sk[0]]) +
          skillScore(b.computed[sk[1]]) -
          (skillScore(a.computed[sk[0]]) + skillScore(a.computed[sk[1]]))
      );
    return skillcrew.slice(0, top);
  }
  const skillcrew = crew
    .filter((c) => c.computed[sk[0]].core && c.computed[sk[1]].core && c.computed[sk[2]].core)
    .sort(
      (a, b) =>
        skillScore(b.computed[sk[0]]) +
        skillScore(b.computed[sk[1]]) +
        skillScore(b.computed[sk[2]]) -
        (skillScore(a.computed[sk[0]]) + skillScore(a.computed[sk[1]]) + skillScore(a.computed[sk[2]]))
    );
  return skillcrew.slice(0, top);
}

// betatachyon.ts:287-301. `topCrew` is called with two differently-shaped maps:
// skill -> best crew for that skill, and printed-skill-order -> crew list.
function getDistanceFromTop(item: BTCrew, topCrew: Record<string, BTCrew | BTCrew[]>): number {
  const printedOrder = printSkillOrder(item);
  const ordered = getSortedSkills(item);
  const lvls: number[] = [];
  ordered.skills.forEach((skv) => {
    const skill = skv.skill + '_skill';
    const bucket = topCrew[printedOrder];
    if (printedOrder in topCrew && Array.isArray(bucket)) {
      lvls.push(skillScore(item.computed[skill]) / skillScore(bucket[0].computed[skill]));
    } else {
      lvls.push(skillScore(item.computed[skill]) / skillScore((topCrew[skill] as BTCrew).computed[skill]));
    }
  });
  return lvls.reduce((p, n) => p + n, 0) / 3;
}

// betatachyon.ts:66-100. `roster` is the full player roster INCLUDING frozen
// crew, which land in `finished` and therefore raise the bar that decides
// whether an unfinished crew would improve a voyage pair.
function getVoyageImprovements(roster: BTCrew[], depth: number): Record<string, string[]> {
  const vims: Record<string, string[]> = {};

  const finished = roster.filter((f) => f.immortal && f.have);
  const unfinished = roster.filter((f) => !f.immortal && f.have);

  finished.sort((a, b) => a.ranks.voyRank - b.ranks.voyRank);
  unfinished.sort((a, b) => a.ranks.voyRank - b.ranks.voyRank);

  for (const uc of unfinished) {
    vims[uc.symbol] = [];
    const voyranks = Object.keys(uc.ranks).filter((f) => f.startsWith('V_'));
    const trip = uc.ranks.voyTriplet?.name
      .split('/')
      .map((s) => shortToSkill(s.trim())!.replace('_skill', ''));
    for (const key of voyranks) {
      const kparts = key.split('_');
      if (kparts.length !== 3) continue;
      kparts.splice(0, 1);
      const skillkey = `${shortToSkill(kparts[0])}/${shortToSkill(kparts[1])}`.replace(/_skill/g, '');
      let fcomp = finished.filter((f) => f.ranks[key]);
      let ftest = fcomp.filter((f) => (f.ranks[key] as number) < (uc.ranks[key] as number));
      if (ftest.length <= depth) {
        vims[uc.symbol].push(skillkey);
      }
      // UPSTREAM QUIRK: this triplet block sits inside the per-pair loop, so it
      // re-evaluates and re-pushes the same two entries once per V_* key. The
      // duplicates are washed out later by `[...new Set(...)]`, so it only
      // costs time — reproduced as written.
      if (trip?.length === 3) {
        fcomp = finished.filter((f) => f.ranks?.voyTriplet?.name === uc.ranks.voyTriplet?.name);
        ftest = fcomp.filter((f) => f.ranks.voyTriplet!.rank < uc.ranks.voyTriplet!.rank);
        if (ftest.length <= depth) {
          vims[uc.symbol].push(`${trip[0]}/${trip[2]}`);
          vims[uc.symbol].push(`${trip[1]}/${trip[2]}`);
        }
      }
    }
  }
  return vims;
}

function toRosterCrew(c: CitationCrew, buffs: BuffStatTable): BTCrew {
  const equipmentCount = c.equipment?.length ?? 0;
  const immortal = isImmortal({
    level: c.level,
    equipmentCount,
    rarity: c.rarity,
    max_rarity: c.max_rarity,
  });
  return {
    id: c.id,
    symbol: c.symbol,
    name: c.name,
    archetype_id: c.archetype_id,
    level: c.level,
    rarity: c.rarity,
    max_rarity: c.max_rarity,
    equipmentCount,
    traits: c.traits,
    base_skills: c.base_skills as Record<string, RangeSkill>,
    skill_order: c.skill_order,
    in_portal: c.in_portal,
    obtained: c.obtained,
    collection_ids: c.collection_ids,
    unique_polestar_combos: c.unique_polestar_combos,
    ranks: c.ranks,
    // prepareOne (crewutils.ts:628-651) uses the game's own buffed `skills`
    // block when the instance has one and only falls back to recomputing buffs
    // from base_skills when it does not. Both branches are reproduced: the
    // fallback is the path every crew synthesized from `stored_immortals`
    // takes (upstream reaches it via the `crew.immortal` branch at
    // crewutils.ts:527, which applies buffs to the catalog template).
    computed: c.skills
      ? fromPlayerSkills(c.skills as Record<string, RangeSkill>)
      : applyCrewBuffs(c.base_skills as Record<string, RangeSkill>, buffs),
    // `prepareOne` sets `immortal` to CompletionState.Immortalized (-1, truthy)
    // for a fully-finished active crew, CompletionState.NotComplete (0, falsy)
    // otherwise, and to the stored quantity (truthy) for a frozen one. Since
    // frozen crew are synthesized at level 100 / max rarity / 4 equipment
    // slots, `isImmortal` reproduces that truthiness exactly for both kinds.
    immortal,
    // Every crew in `ownedCrew` is owned by definition; `prepareOne` only
    // pushes entries with `have = true` into the roster.
    have: true,
    source: c,
  };
}

function toCatalogCrew(e: CitationCrewEntry, buffs: BuffStatTable): BTCrew {
  return {
    id: e.archetype_id,
    symbol: e.symbol,
    name: e.name,
    archetype_id: e.archetype_id,
    // `prepareOne` builds the catalog template at level 100, max rarity and
    // `equipment = [0,1,2,3]`; upstream's `allCrew` is that same shape.
    level: 100,
    rarity: e.max_rarity,
    max_rarity: e.max_rarity,
    equipmentCount: 4,
    traits: e.traits,
    base_skills: e.base_skills as Record<string, RangeSkill>,
    skill_order: e.skill_order,
    in_portal: e.in_portal,
    obtained: e.obtained,
    collection_ids: e.collection_ids,
    unique_polestar_combos: e.unique_polestar_combos,
    ranks: e.ranks,
    computed: applyCrewBuffs(e.base_skills as Record<string, RangeSkill>, buffs),
    immortal: true,
    have: false,
    source: null,
  };
}

/**
 * Beta Tachyon Pulse (Experimental) — datacore.app's second citation engine.
 *
 * @param ownedCrew  The player's roster, frozen-crew-first-then-active. Stands
 *                   in for `playerData.player.character.crew` after datacore's
 *                   own `prepareProfileData` pass.
 * @param catalog    The full crew catalog; stands in for `inputCrew`.
 * @param items      Stands in for `coreItems`. Read by the quipment block only,
 *                   which is provably dead upstream — see adaptation 5.
 * @param collections    Stands in for `collections` (needs `milestones`).
 * @param buffs          Output of `calculateBuffConfig()`.
 * @param cryoCollections The player's `character.cryo_collections`. Upstream
 *                   reaches into `playerData` for this; our signature has to
 *                   take it explicitly.
 * @returns The ranked `crewToCite` list, best-first, `rarity !== max_rarity`
 *          only, with no cutoff applied.
 */
export function citeBetaTachyon(
  ownedCrew: CitationCrew[],
  catalog: CitationCrewEntry[],
  items: ItemEntry[],
  collections: CollectionDefinition[],
  buffs: BuffStatTable,
  cryoCollections: PlayerCryoCollection[]
): CitationCrew[] {
  void items; // see adaptation 5

  const settings = DefaultBetaTachyonSettings;
  const magic = settings.magic;

  const roster = ownedCrew.map((c) => toRosterCrew(c, buffs));

  // betatachyon.ts:481 — `immortalizedSymbols` is built by the caller as
  // `crew.filter(c => !!c.immortal).map(c => c.symbol)` (engines.tsx:238-243).
  const immortalizedSymbols = [...new Set(roster.filter((c) => c.immortal).map((c) => c.symbol))];

  const skillPairs: string[][] = [];
  const skillTriplets: string[][] = [];

  // betatachyon.ts:113 — computed over the CATALOG, not the roster.
  const skill_reports = getSkillOrderStats({ roster: catalog as unknown as CitationCrew[] });

  for (const s1 of skills) {
    for (const s2 of skills) {
      if (s2 === s1) continue;
      skillPairs.push([s1, s2]);
    }
  }

  for (const s1 of skills) {
    for (const s2 of skills) {
      for (const s3 of skills) {
        if (s3 === s2 || s3 === s1 || s2 === s1) continue;
        skillTriplets.push([s1, s2, s3]);
      }
    }
  }

  const acc: Record<string, BTCrew> = {};

  // betatachyon.ts:246-275
  const compareCrew = (crewSymbol: string, sk: string[], allCrew: BTCrew[], best: BTCrew[]): number => {
    if (!(crewSymbol in acc)) {
      const cfe = allCrew.find((c) => c.symbol === crewSymbol);
      if (!cfe) return -1;
      acc[crewSymbol] = cfe;
    }

    const crew = acc[crewSymbol];
    if (!crew) return -1;

    let core =
      skillScore(crew.computed[sk[0]]) +
      skillScore(crew.computed[sk[1]]) +
      (sk.length > 2 ? skillScore(crew.computed[sk[2]]) : 0);
    if (sk.length > 2 && !crew.computed[sk[2]].core) {
      const so = getSortedSkills(crew);
      core += so.skills[2].core * 0.75;
    }

    const c = best.length;
    let v = -1;

    // UPSTREAM QUIRK: this loop does not break, so `v` ends up decided by the
    // LAST entry of `best` rather than by the crew's true insertion position.
    for (let i = 0; i < c; i++) {
      const comp =
        skillScore(best[i].computed[sk[0]]) +
        skillScore(best[i].computed[sk[1]]) +
        (sk.length > 2 ? skillScore(best[i].computed[sk[2]]) : 0);
      if (core > comp) v = i;
      else if (core < comp) v = i + 1;
      else v = i;
    }

    return v;
  };

  // betatachyon.ts:303
  const evalCrew = roster.filter((crew) => !isImmortal(crew) && countSkills(crew) === 3);

  if (!evalCrew.length) return [];

  const skillbest: Record<string, BTCrew[]> = {};
  const besttrips: Record<string, BTCrew[]> = {};
  const skillout: Record<string, BTCrew[]> = {};

  const immo1 = roster.filter((c) => c && isImmortal(c));
  const immoCrew = immo1.length ? immo1 : roster;

  const vims = getVoyageImprovements(roster, settings.magic);

  skillPairs.forEach((sk) => {
    skillbest[`${sk[0]}/${sk[1]}`] = findBest(immoCrew, sk, magic);
  });

  skillTriplets.forEach((sk) => {
    besttrips[`${sk[0]}/${sk[1]}/${sk[2]}`] = findBest(immoCrew, sk, magic * 2);
  });

  // betatachyon.ts:333 — `structuredClone(inputCrew)` then buffed in place.
  const allCrew = catalog.map((e) => toCatalogCrew(e, buffs));

  const topCrew: Record<string, BTCrew> = {};
  const skillOrderCrew: Record<string, BTCrew[]> = {};

  const uniqueSkillOrders: string[] = [];
  const uniqueTwoSkills: string[] = [];
  const tripleRare: SkillOrderRarity[] = [];
  const doubleRare: SkillOrderRarity[] = [];

  // betatachyon.ts:346-384
  allCrew.forEach((ac) => {
    if (!ac) return;
    const csk = printSkillOrder(ac);
    const dsk = printSkillOrder(ac, true);
    if (!uniqueSkillOrders.includes(csk)) uniqueSkillOrders.push(csk);
    if (!uniqueTwoSkills.includes(dsk)) uniqueTwoSkills.push(dsk);

    let fo = tripleRare.find((sr) => sr.skillorder === csk);
    if (!fo) {
      tripleRare.push({ skillorder: csk, skills: ac.skill_order, rarity: 0, count: 1 });
    } else {
      fo.count++;
    }

    fo = doubleRare.find((sr) => sr.skillorder === dsk);
    if (!fo) {
      doubleRare.push({ skillorder: dsk, skills: getSkillOrder(ac, true), rarity: 0, count: 1 });
    } else {
      fo.count++;
    }
  });

  tripleRare.sort((a, b) => a.count - b.count);
  doubleRare.sort((a, b) => a.count - b.count);

  let max = tripleRare.reduce((p, n) => Math.max(p ?? 0, n?.count ?? 0), 0);
  let min = tripleRare.reduce((p, n) => Math.min(p ?? 0, n?.count ?? 0), allCrew.length);

  tripleRare.forEach((sr) => {
    sr.rarity = Math.ceil((1 - (sr.count - min) / (max - min)) * 5);
  });

  max = doubleRare.reduce((p, n) => Math.max(p ?? 0, n?.count ?? 0), 0);
  min = doubleRare.reduce((p, n) => Math.min(p ?? 0, n?.count ?? 0), allCrew.length);

  doubleRare.forEach((sr) => {
    sr.rarity = Math.ceil((1 - (sr.count - min) / (max - min)) * 5);
  });

  // betatachyon.ts:403-408
  skills.forEach((skill) => {
    const fcrew = allCrew
      .filter((fc) => !!fc.computed[skill].core)
      .sort((a, b) => skillScore(b.computed[skill]) - skillScore(a.computed[skill]));
    if (fcrew.length) topCrew[skill] = fcrew[0];
  });

  // betatachyon.ts:410-425
  uniqueSkillOrders.forEach((sko) => {
    const ccrew = allCrew.filter((fc) => printSkillOrder(fc) === sko);
    const sk = sko.split('/').map((z) => z + '_skill');
    ccrew.sort((a, b) => {
      const askill1 = skillScore(a.computed[sk[0]]);
      const askill2 = skillScore(a.computed[sk[1]]);
      const askill3 = skillScore(a.computed[sk[2]]);

      const bskill1 = skillScore(b.computed[sk[0]]);
      const bskill2 = skillScore(b.computed[sk[1]]);
      const bskill3 = skillScore(b.computed[sk[2]]);

      return bskill1 + bskill2 + bskill3 - (askill1 + askill2 + askill3);
    });
    skillOrderCrew[sko] = ccrew;
  });

  // betatachyon.ts:427-460
  Object.keys(skillbest).forEach((skill) => {
    const skp = skill.split('/');
    skillout[skill] ??= [];
    const triplets: string[] = [];
    Object.keys(besttrips).forEach((trip) => {
      if (trip.includes(skill)) triplets.push(trip);
    });

    evalCrew.forEach((crew) => {
      const c = compareCrew(crew.symbol, skp, allCrew, skillbest[skill]);
      if (c >= 0 && c < magic) {
        skillout[skill].push(crew);
        crew.voyScores ??= {};
        crew.voyScores[skill] ??= 0;
        crew.voyScores[skill]++;
      }

      for (const t of triplets) {
        const d = compareCrew(crew.symbol, t.split('/'), allCrew, besttrips[t]);
        if (d >= 0 && d < 1) {
          crew.voyScores ??= {};
          const vt = t
            .split('/')
            .slice(0, 2)
            .reduce((a, b) => a + '/' + b);
          crew.voyScores[vt] ??= 0;
          crew.voyScores[vt]++;
        }
      }
    });

    skillout[skill] = skillout[skill].filter((c) => !isImmortal(c));
  });

  const rc1 = Object.values(skillout).reduce((p, c) => (p ? p.concat(c) : c));
  const resultCrew = rc1.filter((fc, idx) => rc1.findIndex((g) => g.id === fc.id) === idx);

  if (!resultCrew.length) return []; // see adaptation 8

  const allGroups: Record<string, number> = {};

  // betatachyon.ts:466-511
  for (const crew of resultCrew) {
    const cf = allCrew.find((c) => c.symbol === crew.symbol);
    // UPSTREAM QUIRK: upstream writes `if (!cf) return -1;` here — a `return`
    // from inside the Promise executor, which silently abandons the whole run
    // (the promise never settles) rather than skipping the crew. Unreachable in
    // practice: every roster crew's symbol is in the catalog.
    if (!cf) return [];

    crew.voyagesImproved = [...new Set(vims[crew.symbol] ?? [])];
    const so = getSortedSkills(cf);
    const evibe =
      (skillScore(so.skills[0]) * 0.35 + skillScore(so.skills[1]) * 0.25 + skillScore(so.skills[2]) * 0.15) / 2.5;

    const icols = cryoCollections.filter(
      (f) => !!f.claimable_milestone_index && crew.collection_ids.includes(`${f.type_id}`)
    );

    let mcols = icols.map((ic) => collections.find((fc) => fc.id?.toString() === ic.type_id?.toString()));
    if (immortalizedSymbols.includes(crew.symbol)) {
      crew.collectionsIncreased = undefined;
    } else {
      mcols = mcols.filter((col, idx) => {
        if (icols[idx].claimable_milestone_index) {
          return col?.milestones?.slice(icols[idx].claimable_milestone_index).some((m) => !!m.buffs?.length);
        }
        return false;
      });

      crew.collectionsIncreased = mcols.map((mc) => mc!.name);
    }

    crew.totalEVContribution = evibe;
    crew.evPerCitation = evibe / crew.max_rarity;
    crew.totalEVRemaining = crew.evPerCitation * (crew.max_rarity - crew.rarity);
    crew.amTraits = getAMSeats(crew);
    crew.score = getDistanceFromTop(cf, topCrew);
    crew.scoreTrip = getDistanceFromTop(cf, skillOrderCrew);
    crew.voyagesImproved ??= [];
    if (crew.voyagesImproved.length) {
      for (const vi of crew.voyagesImproved) {
        allGroups[vi] ??= 0;
        allGroups[vi]++;
      }
    }
  }

  // betatachyon.ts:513-523
  const polestars: Record<string, PolestarCombo[]> = {};
  resultCrew.forEach((crew) => {
    // findPolestars reads only symbol / name / archetype_id / max_rarity /
    // traits / base_skills / in_portal, all of which BTCrew carries with the
    // same meaning — hence the structural cast.
    polestars[crew.symbol] = findPolestars(
      crew as unknown as CitationCrew,
      allCrew as unknown as CitationCrew[]
    );
    if (crew.voyagesImproved) {
      const crewnum =
        crew.voyagesImproved.map((vi) => allGroups[vi]).reduce((p, n) => p + n, 0) / crew.voyagesImproved.length;
      crew.groupSparsity = 1 - crewnum / resultCrew.length;
    } else {
      crew.groupSparsity = 0;
    }
  });

  // betatachyon.ts:525-531
  const maxvoy = resultCrew.map((c) => c.voyagesImproved?.length ?? 0).reduce((a, b) => (a > b ? a : b));
  const maxsparse = resultCrew.map((c) => c.groupSparsity ?? 0).reduce((a, b) => (a > b ? a : b));
  const maxam = resultCrew.map((c) => c.amTraits?.length ?? 0).reduce((a, b) => (a > b ? a : b));
  const maxquip = resultCrew.map((c) => c.ranks.scores.quipment ?? 0).reduce((a, b) => (a > b ? a : b));
  const maxcols = resultCrew.map((c) => c.collectionsIncreased?.length ?? 0).reduce((a, b) => (a > b ? a : b));
  const maxex = resultCrew
    .map((c) => getSkillOrderScore(c as unknown as CitationCrew, skill_reports))
    .reduce((a, b) => (a > b ? a : b));
  // `maxsparse` and `maxam` are computed upstream but never read: their only
  // consumers are the commented-out `groupSparsity` normalisation block
  // (lines 533-537) and the commented-out `amscore` variant (line 570). Kept
  // so the set of intermediate values matches the source. Upstream's `maxev`
  // (line 526) is likewise dead — its consumer is the commented-out `totalp`
  // variant on line 563 — and is omitted, being a pure `.map().reduce()` with
  // no side effects.
  void maxsparse;
  void maxam;

  // betatachyon.ts:539-622
  const scoreCrew = (crew: BTCrew): number => {
    const multConf = settings;

    const pss = polestars[crew.symbol];
    let maxp = 0;
    pss.forEach((ps) => {
      const pcomp = (1 / ps.count) * 100;
      if (maxp < pcomp) maxp = pcomp;
    });

    // less gives weight
    const gs = multConf.groupSparsity * (crew.groupSparsity ?? 0);

    // more gives weight
    const quip = multConf.quipment * ((crew.ranks.scores.quipment ?? 0) / (maxquip ? maxquip : 1));

    // less gives weight
    const retrieval = crew.in_portal ? multConf.retrieval * (1 - maxp / 100) : 0;

    // more gives weight
    const improve = multConf.improved * ((crew.voyagesImproved?.length ?? 0) / (maxvoy ? maxvoy : 1));

    // more gives weight
    const totalp = multConf.power * (crew.ranks.scores.voyage / 100);

    // less gives weight
    const effort = multConf.citeEffort * (1 - (crew.max_rarity - crew.rarity) / crew.max_rarity);

    // more gives weight
    const amscore = multConf.antimatter * (crew.ranks.scores.am_seating / 100);

    // not in portal gives weight
    const pscore = acc[crew.symbol].in_portal ? 0 : multConf.portal;

    // never gives weight
    const nscore = isNever(crew) ? multConf.never : 0;

    // more gives weight
    const ciscore = multConf.collections * ((crew.collectionsIncreased?.length ?? 0) / (maxcols ? maxcols : 1));

    const sko = printSkillOrder(crew);
    const skd = printSkillOrder(crew, true);

    const tr = tripleRare.find((f) => f.skillorder === sko);
    const db = doubleRare.find((f) => f.skillorder === skd);

    let skrare = 0;

    const rare = (getSkillOrderScore(crew as unknown as CitationCrew, skill_reports) / maxex) * multConf.rareness;

    // UPSTREAM QUIRK: `trrare` and `dbrare` are computed and then immediately
    // discarded — the line that combined them is commented out upstream and
    // `skrare` is overwritten by the catalog's own skill_rarity score. The
    // `tr && db` guard still matters though: if either lookup misses (a crew
    // whose CURRENT skill order differs from its max-rarity one, which is how
    // `tripleRare` was keyed), `skrare` stays 0.
    if (tr && db) {
      skrare = multConf.skillRare * ((crew.ranks.scores.skill_rarity as number) / 100);
    }

    // more gives weight
    const adist = crew.score ? crew.score * multConf.score : 1;

    // more gives weight
    const adist2 = crew.scoreTrip ? crew.scoreTrip * multConf.triplet : 1;

    let fin = 0;
    if (!crew.in_portal) {
      fin =
        (100 *
          (gs + rare + quip + amscore + adist + adist2 + skrare + improve + totalp + effort + pscore + nscore + ciscore)) /
        13;
    } else {
      fin =
        (100 *
          (gs +
            rare +
            retrieval +
            quip +
            amscore +
            adist +
            adist2 +
            skrare +
            improve +
            totalp +
            effort +
            pscore +
            nscore +
            ciscore)) /
        14;
    }

    return fin;
  };

  // betatachyon.ts:624-633. UPSTREAM QUIRK: `scoreCrew` is re-run for both
  // operands on every comparison rather than memoised — O(n log n) scorings.
  resultCrew.sort((a, b) => scoreCrew(b) - scoreCrew(a));

  return resultCrew.filter((f) => f.rarity !== f.max_rarity).map((f) => f.source!);
}
