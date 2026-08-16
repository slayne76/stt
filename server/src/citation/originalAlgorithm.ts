// server/src/citation/originalAlgorithm.ts
//
// Faithful port of datacore.app's "Original Algorithm" citation optimizer.
//
//   Source:  https://github.com/stt-datacore/website
//   File:    src/workers/optimizer.js  (914 lines, zero external imports)
//   Commit:  b310dd5bf018df5bfb7e322d7833f449a0311620
//   md5:     47c6b1823b6c724ce6045878162fcdc9  (verified byte-identical)
//   License: MIT
//
// Original author: Joseph Peck (github.com/Eccentricware); adapted for datacore
// by github.com/AlexCPU and Josh Andrews (github.com/joshurtree).
//
// Fidelity is the point of this file. Every formula, comparison, sort order and
// upstream quirk below is reproduced exactly as written — including the ones
// that are plainly bugs (see the "UPSTREAM QUIRK" comments). Do not "clean up"
// or simplify anything here: any change silently diverges our ranking from
// datacore.app's, which is the only thing this port is judged against.
//
// ---------------------------------------------------------------------------
// ADAPTATIONS (the only intentional deviations; each is behaviour-preserving)
// ---------------------------------------------------------------------------
// 1. Module shape. Upstream is a bare script exporting a single global
//    `Optimizer` object literal that mutates its own properties across the
//    11-call sequence. Here that object is built fresh per invocation by
//    `createOptimizer()`, so concurrent/repeated server-side calls cannot leak
//    state into each other. Every `Optimizer.x` reference became `self.x`;
//    nothing else changed.
//
// 2. Input shape. `assessCrewRoster(saveData, dataCoreCrew)` took datacore's
//    `PlayerData` / `CrewMember[]`. It now takes `ownedCrew: CitationCrew[]`
//    (in place of `saveData.player.character.crew`) and
//    `catalog: CitationCrewEntry[]` (in place of `dataCoreCrew`). The catalog
//    is still the array that is iterated to build the roster, so roster order —
//    which decides ties, since every comparison upstream is a strict `>` —
//    is preserved exactly.
//
// 3. Frozen crew. Upstream also reads `saveData.player.character.stored_immortals`
//    / `c_stored_immortals` and gives those crew a dedicated branch. Our input
//    contract has no such list, so that branch is unreachable and is omitted.
//    It is exactly equivalent to the retained active-crew branch for any crew
//    passed in as level 100 / rarity === max_rarity / 4 equipment entries:
//    both produce rarity = max_rarity and all four immortality flags plus
//    `chronsInvested` true. The only field that differs, `frozen`, is written
//    but never read anywhere in the 914-line original.
//    => The orchestrator MUST fold stored_immortals into `ownedCrew` that way.
//       Omitting them is not a small error: frozen immortals occupy most of the
//       12 voyage seats, and leaving them out inflates every citation score.
//
// 4. Output. Returns synchronously (nothing here is async) and maps the ranked
//    names back onto the caller's `CitationCrew` objects. `citeOriginalAlgorithmDetailed`
//    exposes the untouched upstream `rankedCrewToCite` records (EV figures and
//    improved-voyage lists) for callers that need the numbers.
//
// 5. `console.log` calls dropped (upstream dumps the entire ~1300-entry roster
//    twice per run). No `console.log` upstream sits on a value-producing path.
//
// 6. Members not reachable from the 11-call citation sequence are not ported:
//    `findBestRankings`, `findCrewSeating`, `populateSortingArray`,
//    `assessPoolVacancies`, `bestPossibleCrew`, `saveFile`, `skills`,
//    `topCrewToTrain`-adjacent display state. (`findCrewSeating` is in fact
//    dead code upstream — it dereferences `skillPools.voyageCrew` off a
//    freshly-declared empty `{}` and would throw if ever called.) The
//    crew-to-train half of the pipeline IS ported, because `findCrewToTrain`,
//    `findEVContributionOfCrewToTrain` and `sortCrewToTrain` are three of the
//    ten calls in the sequence.
//
// ---------------------------------------------------------------------------
// DATA REQUIREMENT worth knowing about
// ---------------------------------------------------------------------------
// Upstream reads `crew.base_skills` off the CATALOG entry — the fully-fused,
// level-100 stat block — and uses it as the max-rarity rung of `skillData`.
// datacore's `crew.json` never puts max_rarity into `skill_data` (verified
// across all 1966 entries: `skill_data` covers rarities 1..max_rarity-1 only),
// so that catalog `base_skills` is the ONLY source of max-rarity stats, and the
// entire "what is this crew worth once fully cited" half of the algorithm
// depends on it. `CitationCrewEntry.base_skills` was added for this reason.
// Note that the owned crew's own `base_skills` is a different thing (current
// rarity and level) and is deliberately never read here — upstream doesn't
// read it either; player data supplies only rarity, level and equipment.

import type { CitationCrew, CitationCrewEntry } from './types';

const SKILLS = ['command', 'diplomacy', 'engineering', 'medicine', 'science', 'security'];

const toObject = <T>(names: string[], templateFunc: () => T): Record<string, T> =>
  Object.fromEntries(names.map((n) => [n, templateFunc()]));

const emptyArrayMap = (keys: string[]): Record<string, string[]> => toObject(keys, () => [] as string[]);

const skillPairings: string[] = SKILLS.reduce<string[]>(
  (pairs, s1) => pairs.concat(SKILLS.map((s2) => s1 + '/' + s2)),
  []
);

interface SkillPool {
  signature: string;
  seats: number;
  assignedCrew: string[];
  full: boolean;
  superSets: string[];
  subSets: string[];
}

const createSkillPool = (skills: string[], name?: string): SkillPool => {
  const skillSet = skills.join('/');
  return {
    signature: name ? name : skillSet,
    seats: skills.length * 2,
    assignedCrew: [],
    full: false,
    superSets: SKILLS.filter((s) => !skills.includes(s))
      .map((s) => skills.concat(s))
      .map((sk) => SKILLS.filter((s) => sk.includes(s)).join('/'))
      .map((set) => (set === SKILLS.join('/') ? 'voyageCrew' : set)),
    subSets: skills
      .map((s1) => skills.filter((s2) => s1 !== s2).join('/'))
      .filter((set) => set.length > 0),
  };
};

const createSkillPools = (): SkillPool[] => {
  const genCombinations = (skills: string[], n: number): string[][] => {
    if (n === 1) return skills.map((item) => [item]);

    return skills.reduce<string[][]>(
      (combos, item, i) =>
        combos.concat(genCombinations(skills.slice(i + 1), n - 1).map((c) => [item, ...c])),
      []
    );
  };
  const pools = [5, 4, 3, 2, 1]
    .reduce<string[][]>((acc, n) => acc.concat(genCombinations(SKILLS, n)), [])
    .map((pool) => createSkillPool(pool));
  return pools;
};

interface Assignment {
  crew: string[];
  seatAssignments: Record<string, string[]>;
  assignmentErrors: unknown[];
  // UPSTREAM QUIRK: initialised to arrays, then `+=`'d with numbers, so these
  // become concatenated strings ("" + 12.3 + 45.6 = "12.345.6"). Nothing ever
  // reads them. Typed `any` so the `+=` reproduces the exact same runtime
  // coercion rather than being silently "fixed" into real arithmetic.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  skillTotals: Record<string, any>;
  totalEV: number;
}

const assignmentTemplate = (): Assignment => ({
  crew: [],
  seatAssignments: emptyArrayMap(SKILLS.map((s) => s + '_skill')),
  assignmentErrors: [],
  skillTotals: emptyArrayMap(SKILLS.map((s) => s + '_skill')),
  totalEV: 0,
});

interface SkillStat {
  core: number;
  range_min: number;
  range_max: number;
  skill?: string;
  ev?: number;
}

interface RarityLevel {
  rarity?: number;
  base_skills: Record<string, SkillStat>;
  voyageMetrics: Record<string, number>;
}

interface RosterCrew {
  id: number;
  name: string;
  shortName: string;
  rarity: number;
  maxRarity: number;
  immortalityStatus: {
    fullyEquipped: boolean;
    fullyLeveled: boolean;
    fullyFused: boolean;
    immortalized: boolean;
  };
  chronsInvested: boolean;
  frozen: boolean;
  skillData: Record<string, RarityLevel>;
  collections: string[];
  skillSet: { skillArray: string[]; signature: string };
  // UPSTREAM QUIRK: read by findCrewToCite, never assigned anywhere in the
  // original file — so it is always undefined. Preserved as-is.
  skillsRanked?: unknown;
}

interface CrewToTrainRecord {
  voyagesImproved: string[];
  currentRarity: number;
  maxRarity: number;
  totalEVAdded: number;
}

interface CrewToCiteRecord {
  voyagesImproved: string[];
  totalEVContribution: number;
  citationsUntilRelevancy: number;
  totalEVPerCitation: number;
  totalEVNextCitation: number;
  totalEVFullyCited: number;
  totalEVRemaining: number;
  skills: unknown;
}

export interface RankedCrewToCite {
  name: string;
  totalEVContribution: number;
  totalEVRemaining: number;
  evPerCitation: number;
  voyagesImproved: string[];
  skills: unknown;
}

export interface RankedCrewToTrain {
  name: string;
  addedEV: number;
  currentRarity: number;
  maxRarity: number;
  voyagesImproved: string[] | string;
}

const copyBaseSkills = (source: Record<string, SkillStat>): Record<string, SkillStat> =>
  Object.fromEntries(Object.entries(source).map(([k, v]) => [k, { ...v }]));

function createOptimizer() {
  const self = {
    rosterLibrary: {} as Record<string, RosterCrew>,
    rosterArray: [] as RosterCrew[],

    skillPairingsArray: SKILLS.reduce<string[]>(
      (pairs, s1) =>
        pairs.concat(
          SKILLS.filter((s2) => s1 !== s2)
            .map((s2) => [s1, s2])
            .map((s) => s.join('/'))
        ),
      []
    ),

    voyageSkillRankings: {
      currentRarity: emptyArrayMap(skillPairings),
      fullyCited: emptyArrayMap(skillPairings),
    },

    voyageSkillPools: Object.fromEntries(
      [createSkillPool(SKILLS, 'voyageCrew')]
        .concat(createSkillPools())
        .map((pool) => [pool.signature, pool])
    ) as Record<string, SkillPool>,

    topVoyageCrews: {
      currentBest: toObject(skillPairings, assignmentTemplate),
      rarityBest: toObject(skillPairings, assignmentTemplate),
      citedBest: toObject(skillPairings, assignmentTemplate),
    },

    topCrewToTrain: {} as Record<string, CrewToTrainRecord>,
    topCrewToCite: {} as Record<string, CrewToCiteRecord>,
    rankedCrewToTrain: [] as RankedCrewToTrain[],
    rankedCrewToCite: [] as RankedCrewToCite[],

    assessCrewRoster(ownedCrew: CitationCrew[], catalog: CitationCrewEntry[]): void {
      // Gathers all ids to check against for the full roster extraction
      const activeCrewIDArray: number[] = [];
      const activeCrewProgressLibrary: Record<
        number,
        { rarity: number; level: number; equipment: [number, number][] }
      > = {};

      // Adding active crew's IDs to activeCrewIDArray
      ownedCrew.forEach((crew) => {
        if (!activeCrewIDArray.includes(crew.archetype_id)) {
          activeCrewIDArray.push(crew.archetype_id);
          activeCrewProgressLibrary[crew.archetype_id] = {
            rarity: crew.rarity,
            level: crew.level,
            equipment: crew.equipment,
          };
        }
      });

      // (Adaptation 3: the frozen / stored_immortals branch lives here upstream.)

      // Populates relevant data for acquired crew
      catalog.forEach((crew) => {
        if (activeCrewIDArray.includes(crew.archetype_id)) {
          const crewProgress = activeCrewProgressLibrary[crew.archetype_id];

          const skillData: Record<string, RarityLevel> = {};
          crew.skill_data.forEach((rarity) => {
            skillData[rarity.rarity] = {
              rarity: rarity.rarity,
              base_skills: copyBaseSkills(rarity.base_skills),
              voyageMetrics: {},
            };
          });
          // Upstream replaces the whole rung here (`skillData[max] = {}` then
          // assigns base_skills), so no `rarity` key on this one. Copies are
          // taken because the loops below mutate these objects (`.ev`,
          // `.voyageMetrics`) and the catalog is a long-lived shared cache
          // server-side; values computed are identical either way.
          skillData[crew.max_rarity] = {
            base_skills: copyBaseSkills(crew.base_skills),
            voyageMetrics: {},
          };

          let fullyLeveled = false;
          let fullyEquipped = false;
          let fullyFused = false;
          let chronsInvested = false;
          let immortalized = false;

          if (crewProgress.level === 100) {
            fullyLeveled = true;
          }

          if (crewProgress?.level >= 99 && (!crewProgress.equipment || crewProgress.equipment?.length === 4)) {
            fullyEquipped = true;
          }

          if (crewProgress.rarity === crew.max_rarity) {
            fullyFused = true;
          }

          if (fullyLeveled && fullyEquipped) {
            chronsInvested = true;
          }

          if (fullyEquipped && fullyLeveled && fullyFused) {
            immortalized = true;
          }

          const crewStats: RosterCrew = {
            id: crew.archetype_id,
            name: crew.name,
            shortName: crew.short_name,
            rarity: crewProgress.rarity,
            maxRarity: crew.max_rarity,
            immortalityStatus: {
              fullyEquipped: fullyEquipped,
              fullyLeveled: fullyLeveled,
              fullyFused: fullyFused,
              immortalized: immortalized,
            },
            chronsInvested: chronsInvested,
            frozen: false,
            skillData: skillData,
            collections: crew.collections,
            skillSet: { skillArray: [], signature: '' },
          };
          self.rosterLibrary[crew.name] = crewStats;
          self.rosterArray.push(crewStats);
        }
      });

      self.rosterArray.forEach((crew) => {
        crew.skillSet = {
          skillArray: [],
          signature: '',
        };
        for (const skill in crew.skillData[1].base_skills) {
          if (!crew.skillSet.skillArray.includes(skill) && skill !== 'rarity') {
            crew.skillSet.skillArray.push(skill);
          }
        }
        crew.skillSet.skillArray.sort();

        for (let skillIndex = 0; skillIndex < crew.skillSet.skillArray.length; skillIndex++) {
          crew.skillSet.signature += crew.skillSet.skillArray[skillIndex].slice(
            0,
            crew.skillSet.skillArray[skillIndex].indexOf('_')
          );
          if (skillIndex !== crew.skillSet.skillArray.length - 1) {
            crew.skillSet.signature += '/';
          }
        }
        // NB: upstream's local list here is in a different order than SKILLS
        // (security before medicine). It only ever generates pairing keys, so
        // the resulting key set is identical — kept verbatim anyway.
        const voyageSkills = [
          'command_skill',
          'diplomacy_skill',
          'engineering_skill',
          'security_skill',
          'medicine_skill',
          'science_skill',
        ];
        for (const rarity in crew.skillData) {
          const rarityLevel = crew.skillData[rarity];
          for (const skill in rarityLevel.base_skills) {
            const assessedSkill = rarityLevel.base_skills[skill];
            crew.skillData[rarity].base_skills[skill].ev =
              assessedSkill.core + (assessedSkill.range_min + assessedSkill.range_max) / 2;
          }
          rarityLevel.voyageMetrics = {};
          voyageSkills.forEach((primarySkill) => {
            voyageSkills.forEach((secondarySkill) => {
              if (primarySkill !== secondarySkill) {
                const skillPairing = `${primarySkill.slice(0, primarySkill.indexOf('_'))}/${secondarySkill.slice(
                  0,
                  secondarySkill.indexOf('_')
                )}`;
                let voyageComboRating = 0;
                for (const skill in rarityLevel.base_skills) {
                  const assessedSkill = rarityLevel.base_skills[skill];
                  if (skill === primarySkill) {
                    voyageComboRating += assessedSkill.ev! * 0.35;
                  } else if (skill === secondarySkill) {
                    voyageComboRating += assessedSkill.ev! * 0.25;
                  } else {
                    voyageComboRating += assessedSkill.ev! * 0.1;
                  }
                  // UPSTREAM QUIRK: this assignment sits INSIDE the per-skill
                  // loop, so it is written once per skill with the running
                  // subtotal. Final value is the complete sum, but a crew with
                  // no base_skills would never get the key at all. Kept.
                  crew.skillData[rarity].voyageMetrics[skillPairing] = voyageComboRating;
                }
              }
            });
          });
          let expectedVoyage = 0;
          for (const skillPairing in crew.skillData[rarity].voyageMetrics) {
            expectedVoyage += crew.skillData[rarity].voyageMetrics[skillPairing];
          }
          crew.skillData[rarity].voyageMetrics.expectedVoyage = expectedVoyage / 30;
        }
      });
    },

    sortVoyageRankings(): void {
      self.skillPairingsArray.forEach((pairing) => {
        // Voyage Ranking For Current Rarity Levels
        let sortingArray: string[] = [];
        self.rosterArray.forEach((crew) => {
          sortingArray.push(crew.name);
        });
        while (sortingArray.length > 0) {
          let nextRankedName = '';
          let nextRankedEV = 0;
          let nextRankedIndex = 0;
          for (const crewName of sortingArray) {
            if (
              self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity].voyageMetrics[pairing] >
              nextRankedEV
            ) {
              nextRankedName = crewName;
              nextRankedEV =
                self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity].voyageMetrics[pairing];
              nextRankedIndex = sortingArray.indexOf(crewName);
            }
          }
          self.voyageSkillRankings.currentRarity[pairing].push(nextRankedName);
          sortingArray.splice(nextRankedIndex, 1);
        }
        // Voyage Ranking for fully cited crew
        sortingArray = [];
        self.rosterArray.forEach((crew) => {
          sortingArray.push(crew.name);
        });
        while (sortingArray.length > 0) {
          let nextRankedName = '';
          let nextRankedEV = 0;
          let nextRankedIndex = 0;
          sortingArray.forEach((crewName) => {
            if (
              self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].maxRarity].voyageMetrics[pairing] >
              nextRankedEV
            ) {
              nextRankedName = crewName;
              nextRankedEV =
                self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].maxRarity].voyageMetrics[pairing];
              nextRankedIndex = sortingArray.indexOf(crewName);
            }
          });
          self.voyageSkillRankings.fullyCited[pairing].push(nextRankedName);
          sortingArray.splice(nextRankedIndex, 1);
        }
      });
    },

    resetVoyageSkillPools(): void {
      for (const skillPool in self.voyageSkillPools) {
        self.voyageSkillPools[skillPool].assignedCrew = [];
        self.voyageSkillPools[skillPool].full = false;
      }
    },

    assignCrewToPools(pool: SkillPool, crewName: string): void {
      if (!pool.assignedCrew.includes(crewName)) {
        pool.assignedCrew.push(crewName);
        if (pool.assignedCrew.length > pool.seats) {
          // Upstream: troubleshooting-only branch, body commented out.
        } else if (pool.assignedCrew.length === pool.seats) {
          pool.full = true;
          self.fillSubSets(pool);
        }
        if (pool.superSets.length > 0) {
          pool.superSets.forEach((superSet) => {
            self.assignCrewToPools(self.voyageSkillPools[superSet], crewName);
          });
        }
      }
    },

    fillSubSets(pool: SkillPool): void {
      pool.subSets.forEach((subSet) => {
        if (!self.voyageSkillPools[subSet].full) {
          self.voyageSkillPools[subSet].full = true;
          self.fillSubSets(self.voyageSkillPools[subSet]);
        }
      });
    },

    // Focusing on the crew at their current rarity which need no more chroniton investment
    findCurrentBestCrew(): void {
      self.skillPairingsArray.forEach((skillPairing) => {
        self.resetVoyageSkillPools();
        const skillPools = self.voyageSkillPools;
        const rankArray = self.voyageSkillRankings.currentRarity[skillPairing];

        let rankIndex = 0;

        while (!skillPools.voyageCrew.full && rankIndex < rankArray.length) {
          const crewName = rankArray[rankIndex];
          const crew = self.rosterLibrary[crewName];
          // If there is room in the immediate seats available and if they're already invested
          if (!skillPools[crew.skillSet.signature].full && crew.chronsInvested) {
            self.assignCrewToPools(skillPools[crew.skillSet.signature], crew.name);
            rankIndex++;
          } else if (!crew.chronsInvested) {
            rankIndex++;
          } else if (skillPools[crew.skillSet.signature].full) {
            rankIndex++;
          }
        }

        skillPools.voyageCrew.assignedCrew.forEach((crewName) => {
          self.topVoyageCrews.currentBest[skillPairing].crew.push(crewName);
          for (const skill in self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity]
            .base_skills) {
            self.topVoyageCrews.currentBest[skillPairing].skillTotals[skill] +=
              self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity].base_skills[skill].ev;
          }
          self.topVoyageCrews.currentBest[skillPairing].totalEV +=
            self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity].voyageMetrics[skillPairing];
        });
      });
    },

    findBestForRarity(): void {
      self.skillPairingsArray.forEach((skillPairing) => {
        self.resetVoyageSkillPools();
        const skillPools = self.voyageSkillPools;
        const rankArray = self.voyageSkillRankings.currentRarity[skillPairing];
        let rankIndex = 0;
        // UPSTREAM QUIRK: no `rankIndex < rankArray.length` guard on this loop
        // (unlike findCurrentBestCrew). Safe only because the 12 voyageCrew
        // seats always fill first on a real roster. Kept verbatim.
        while (!skillPools.voyageCrew.full) {
          const crewName = rankArray[rankIndex];
          const crew = self.rosterLibrary[crewName];
          if (!skillPools[crew.skillSet.signature].full) {
            self.assignCrewToPools(skillPools[crew.skillSet.signature], crew.name);
            rankIndex++;
          } else if (skillPools[crew.skillSet.signature].full) {
            rankIndex++;
          }
        }

        skillPools.voyageCrew.assignedCrew.forEach((crewName) => {
          self.topVoyageCrews.rarityBest[skillPairing].crew.push(crewName);
          for (const skill in self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity]
            .base_skills) {
            self.topVoyageCrews.rarityBest[skillPairing].skillTotals[skill] +=
              self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity].base_skills[skill].ev;
          }
          self.topVoyageCrews.rarityBest[skillPairing].totalEV +=
            self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity].voyageMetrics[skillPairing];
        });
      });
    },

    findCrewToTrain(): void {
      self.skillPairingsArray.forEach((skillPairing) => {
        self.topVoyageCrews.rarityBest[skillPairing].crew.forEach((leveledCrew) => {
          if (!self.topVoyageCrews.currentBest[skillPairing].crew.includes(leveledCrew)) {
            if (self.topCrewToTrain[leveledCrew]) {
              self.topCrewToTrain[leveledCrew].voyagesImproved.push(skillPairing);
            } else {
              self.topCrewToTrain[leveledCrew] = {
                voyagesImproved: [skillPairing],
                currentRarity: self.rosterLibrary[leveledCrew].rarity,
                maxRarity: self.rosterLibrary[leveledCrew].maxRarity,
                totalEVAdded: 0,
              };
            }
          }
        });
      });
    },

    findEVContributionOfCrewToTrain(): void {
      for (const traineeName in self.topCrewToTrain) {
        for (const skillPairing of self.topCrewToTrain[traineeName].voyagesImproved) {
          self.resetVoyageSkillPools();
          const skillPools = self.voyageSkillPools;
          const rankArray = self.voyageSkillRankings.currentRarity[skillPairing];
          let rankIndex = 0;
          while (!skillPools.voyageCrew.full && rankIndex < rankArray.length) {
            const crewName = rankArray[rankIndex];
            const crew = self.rosterLibrary[crewName];
            if (!skillPools[crew.skillSet.signature].full) {
              if (crew.chronsInvested || crew.name === traineeName) {
                self.assignCrewToPools(skillPools[crew.skillSet.signature], crew.name);
                rankIndex++;
              } else {
                rankIndex++;
              }
            } else if (skillPools[crew.skillSet.signature].full) {
              rankIndex++;
            }
          }

          let voyageEVWithTrainee = 0;
          skillPools.voyageCrew.assignedCrew.forEach((crewName) => {
            voyageEVWithTrainee +=
              self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].rarity].voyageMetrics[skillPairing];
          });
          self.topCrewToTrain[traineeName].totalEVAdded +=
            voyageEVWithTrainee - self.topVoyageCrews.currentBest[skillPairing].totalEV;
        }
      }
    },

    sortCrewToTrain(): void {
      const sortingArray: string[] = [];
      for (const crewName in self.topCrewToTrain) {
        sortingArray.push(crewName);
      }
      while (sortingArray.length > 0) {
        let highestContribingTrainee = '';
        let highestContributedEV = 0;
        let highestContributedVoyages: string[] | string = '';
        sortingArray.forEach((crewName) => {
          if (self.topCrewToTrain[crewName].totalEVAdded > highestContributedEV) {
            highestContribingTrainee = crewName;
            highestContributedEV = self.topCrewToTrain[crewName].totalEVAdded;
            highestContributedVoyages = self.topCrewToTrain[crewName].voyagesImproved;
          }
        });
        if (highestContribingTrainee in self.rosterLibrary) {
          self.rankedCrewToTrain.push({
            name: highestContribingTrainee,
            addedEV: highestContributedEV,
            currentRarity: self.rosterLibrary[highestContribingTrainee].rarity,
            maxRarity: self.rosterLibrary[highestContribingTrainee].maxRarity,
            voyagesImproved: highestContributedVoyages,
          });
        }
        // else: upstream only console.log's the miss. Either way the name is
        // spliced out below — with indexOf('') === -1, splice(-1, 1) drops the
        // LAST element, which is how upstream's loop terminates once every
        // remaining trainee has totalEVAdded <= 0. Preserved deliberately.
        sortingArray.splice(sortingArray.indexOf(highestContribingTrainee), 1);
      }
    },

    findBestCitedCrew(): void {
      self.skillPairingsArray.forEach((skillPairing) => {
        self.resetVoyageSkillPools();
        const skillPools = self.voyageSkillPools;
        const rankArray = self.voyageSkillRankings.fullyCited[skillPairing];
        let rankIndex = 0;
        // UPSTREAM QUIRK: unguarded loop, same as findBestForRarity.
        while (!skillPools.voyageCrew.full) {
          const crewName = rankArray[rankIndex];
          const crew = self.rosterLibrary[crewName];
          if (!skillPools[crew.skillSet.signature].full) {
            self.assignCrewToPools(skillPools[crew.skillSet.signature], crew.name);
            rankIndex++;
          } else if (skillPools[crew.skillSet.signature].full) {
            rankIndex++;
          }
        }

        skillPools.voyageCrew.assignedCrew.forEach((crewName) => {
          self.topVoyageCrews.citedBest[skillPairing].crew.push(crewName);
          for (const skill in self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].maxRarity]
            .base_skills) {
            self.topVoyageCrews.citedBest[skillPairing].skillTotals[skill] +=
              self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].maxRarity].base_skills[skill].ev;
          }
          self.topVoyageCrews.citedBest[skillPairing].totalEV +=
            self.rosterLibrary[crewName].skillData[self.rosterLibrary[crewName].maxRarity].voyageMetrics[skillPairing];
        });
      });
    },

    findCrewToCite(): void {
      self.skillPairingsArray.forEach((skillPairing) => {
        self.topVoyageCrews.citedBest[skillPairing].crew.forEach((citedCrew) => {
          if (!self.rosterLibrary[citedCrew].immortalityStatus.fullyFused) {
            if (self.topCrewToCite[citedCrew]) {
              self.topCrewToCite[citedCrew].voyagesImproved.push(skillPairing);
            } else {
              self.topCrewToCite[citedCrew] = {
                voyagesImproved: [skillPairing],
                totalEVContribution: 0,
                citationsUntilRelevancy: 0,
                totalEVPerCitation: 0,
                totalEVNextCitation: 0,
                totalEVFullyCited: 0,
                totalEVRemaining: 0,
                skills: self.rosterLibrary[citedCrew].skillsRanked,
              };
            }
          }
        });
      });
    },

    createCandidateRarityRankingArray(
      candidateName: string,
      candidateRarityLevel: number,
      skillPairing: string
    ): string[] {
      const candidate = self.rosterLibrary[candidateName];
      const currentRarityRankingArray = self.voyageSkillRankings.currentRarity[skillPairing];
      const currentRarityWithCandidateRankingArray: string[] = [];
      let currentRarityIndex = 0;
      let candidatePlaced = false;
      while (currentRarityIndex < currentRarityRankingArray.length) {
        const crew = self.rosterLibrary[currentRarityRankingArray[currentRarityIndex]];
        if (candidateName === crew.name && candidatePlaced) {
          currentRarityIndex++;
        } else if (
          candidate.skillData[candidateRarityLevel].voyageMetrics[skillPairing] >
            crew.skillData[crew.rarity].voyageMetrics[skillPairing] &&
          !candidatePlaced
        ) {
          currentRarityWithCandidateRankingArray.push(candidateName);
          candidatePlaced = true;
        } else {
          currentRarityWithCandidateRankingArray.push(crew.name);
          currentRarityIndex++;
        }
      }
      return currentRarityWithCandidateRankingArray;
    },

    findBestCrewWithRarityDependentCandidate(rankArray: string[], candidateName: string): string[] {
      self.resetVoyageSkillPools();
      const skillPools = self.voyageSkillPools;
      let rankIndex = 0;
      while (!skillPools.voyageCrew.full && rankIndex < rankArray.length) {
        const crewName = rankArray[rankIndex];
        const crew = self.rosterLibrary[crewName];
        if (!skillPools[crew.skillSet.signature].full) {
          if (crew.chronsInvested || crew.name === candidateName) {
            self.assignCrewToPools(skillPools[crew.skillSet.signature], crew.name);
            rankIndex++;
          } else {
            rankIndex++;
          }
        } else if (skillPools[crew.skillSet.signature].full) {
          rankIndex++;
        }
      }
      const voyageCrew = skillPools.voyageCrew.assignedCrew;
      return voyageCrew;
    },

    findEVofVoyageCrewWithRarityDependentCandidate(
      voyageCrew: string[],
      skillPairing: string,
      candidateName: string,
      rarityLevel: number
    ): number {
      const candidate = self.rosterLibrary[candidateName];
      let totalVoyageEV = 0;
      voyageCrew.forEach((crewName) => {
        const crew = self.rosterLibrary[crewName];
        if (crewName === candidateName) {
          totalVoyageEV += candidate.skillData[rarityLevel].voyageMetrics[skillPairing];
        } else {
          totalVoyageEV += crew.skillData[crew.rarity].voyageMetrics[skillPairing];
        }
      });
      return totalVoyageEV;
    },

    findEVContributionOfCrewToCite(): void {
      for (const citationCandidateName in self.topCrewToCite) {
        const candidate = self.rosterLibrary[citationCandidateName];
        self.topCrewToCite[candidate.name].voyagesImproved.forEach((skillPairing) => {
          // Philosophy change. Compare EV of current crew with candidate FF.
          // Find EV of current crew, to get candidate's total contribution.
          const voyageRankingsWithoutCandidate = self.createRankingArrayWithoutCandidate(
            candidate.name,
            skillPairing
          );
          // NB: upstream passes candidate.name as a second argument here, but
          // findBestCrewWithoutCandidate only declares `rankArray` and ignores
          // it. Signature kept single-arg to match.
          const bestCrewWithoutCandidate = self.findBestCrewWithoutCandidate(voyageRankingsWithoutCandidate);
          const voyageEVWithoutCandidate = self.findEVofVoyageCrewWithoutCandidate(
            bestCrewWithoutCandidate,
            skillPairing
          );

          const voyageRankingWithCandidateAtCurrentRarity = self.createCandidateRarityRankingArray(
            candidate.name,
            candidate.rarity,
            skillPairing
          );
          const voyageCrewWithCandidateAtCurrentRarity = self.findBestCrewWithRarityDependentCandidate(
            voyageRankingWithCandidateAtCurrentRarity,
            candidate.name
          );
          const voyageEVWithCandidateAtCurrentRarity = self.findEVofVoyageCrewWithRarityDependentCandidate(
            voyageCrewWithCandidateAtCurrentRarity,
            skillPairing,
            candidate.name,
            candidate.rarity
          );

          // Get the EV of crew with candidate at max rarity
          const voyageRankingWithCandidateAtMaxRarity = self.createCandidateRarityRankingArray(
            candidate.name,
            candidate.maxRarity,
            skillPairing
          );
          const voyageCrewWithCandidateAtMaxRarity = self.findBestCrewWithRarityDependentCandidate(
            voyageRankingWithCandidateAtMaxRarity,
            candidate.name
          );
          const voyageEVWithCandidateAtMaxRarity = self.findEVofVoyageCrewWithRarityDependentCandidate(
            voyageCrewWithCandidateAtMaxRarity,
            skillPairing,
            candidate.name,
            candidate.maxRarity
          );

          self.topCrewToCite[candidate.name].totalEVContribution +=
            voyageEVWithCandidateAtMaxRarity - voyageEVWithoutCandidate;
          self.topCrewToCite[candidate.name].totalEVRemaining +=
            voyageEVWithCandidateAtMaxRarity - voyageEVWithCandidateAtCurrentRarity;
          self.topCrewToCite[candidate.name].totalEVPerCitation +=
            (voyageEVWithCandidateAtMaxRarity - voyageEVWithCandidateAtCurrentRarity) /
            (candidate.maxRarity - candidate.rarity);
        });
      }
    },

    sortCrewToCite(): void {
      const sortingArray: string[] = [];
      for (const crewName in self.topCrewToCite) {
        sortingArray.push(crewName);
      }
      while (sortingArray.length > 0) {
        let highestContributingTrainee = '';
        let highestContributedEV = 0;
        sortingArray.forEach((crewName) => {
          if (self.topCrewToCite[crewName].totalEVContribution > highestContributedEV) {
            highestContributingTrainee = crewName;
            highestContributedEV = self.topCrewToCite[crewName].totalEVContribution;
          }
        });
        // UPSTREAM QUIRK: once every remaining candidate has a non-positive
        // totalEVContribution, `highestContributingTrainee` stays '' and the
        // original throws a TypeError on topCrewToCite['']. Those trailing
        // candidates are, by definition, worth zero citations and are never
        // shown. Rather than reproduce a crash (or silently reorder the list),
        // the loop stops here — every entry emitted above this point, and their
        // order, is bit-for-bit what upstream produces.
        if (highestContributingTrainee === '') {
          break;
        }
        self.rankedCrewToCite.push({
          name: highestContributingTrainee,
          totalEVContribution: self.topCrewToCite[highestContributingTrainee].totalEVContribution,
          totalEVRemaining: self.topCrewToCite[highestContributingTrainee].totalEVRemaining,
          evPerCitation: self.topCrewToCite[highestContributingTrainee].totalEVPerCitation,
          voyagesImproved: self.topCrewToCite[highestContributingTrainee].voyagesImproved,
          skills: self.topCrewToCite[highestContributingTrainee].skills,
        });
        sortingArray.splice(sortingArray.indexOf(highestContributingTrainee), 1);
      }
    },

    createRankingArrayWithoutCandidate(candidateName: string, skillPairing: string): string[] {
      const currentRarityRankingArray = self.voyageSkillRankings.currentRarity[skillPairing];
      const currentRarityWithoutCandidateRankingArray: string[] = [];
      currentRarityRankingArray.forEach((crewName) => {
        if (crewName !== candidateName) {
          currentRarityWithoutCandidateRankingArray.push(crewName);
        }
      });
      return currentRarityWithoutCandidateRankingArray;
    },

    findBestCrewWithoutCandidate(rankArray: string[]): string[] {
      self.resetVoyageSkillPools();
      const skillPools = self.voyageSkillPools;
      let rankIndex = 0;
      while (!skillPools.voyageCrew.full && rankIndex < rankArray.length) {
        const crewName = rankArray[rankIndex];
        const crew = self.rosterLibrary[crewName];
        if (!skillPools[crew.skillSet.signature].full) {
          if (crew.chronsInvested) {
            self.assignCrewToPools(skillPools[crew.skillSet.signature], crew.name);
            rankIndex++;
          } else {
            rankIndex++;
          }
        } else if (skillPools[crew.skillSet.signature].full) {
          rankIndex++;
        }
      }
      const voyageCrew = skillPools.voyageCrew.assignedCrew;
      return voyageCrew;
    },

    findEVofVoyageCrewWithoutCandidate(voyageCrew: string[], skillPairing: string): number {
      let totalVoyageEV = 0;
      voyageCrew.forEach((crewName) => {
        const crew = self.rosterLibrary[crewName];
        totalVoyageEV += crew.skillData[crew.rarity].voyageMetrics[skillPairing];
      });
      return totalVoyageEV;
    },
  };

  return self;
}

/**
 * Runs the exact 11-call sequence datacore's unified worker uses for the
 * "Original Algorithm" and returns the untouched `rankedCrewToCite` records,
 * best-first, with no cutoff applied.
 */
function citeOriginalAlgorithmDetailed(
  ownedCrew: CitationCrew[],
  catalog: CitationCrewEntry[]
): RankedCrewToCite[] {
  const optimizer = createOptimizer();

  optimizer.assessCrewRoster(ownedCrew, catalog);
  optimizer.sortVoyageRankings();
  optimizer.findCurrentBestCrew();
  optimizer.findBestForRarity();
  optimizer.findCrewToTrain();
  optimizer.findEVContributionOfCrewToTrain();
  optimizer.sortCrewToTrain();
  optimizer.findBestCitedCrew();
  optimizer.findCrewToCite();
  optimizer.findEVContributionOfCrewToCite();
  optimizer.sortCrewToCite();

  return optimizer.rankedCrewToCite;
}

/**
 * The ranked citation priority list, best-first, with no cutoff applied.
 *
 * `ownedCrew` must already include frozen (stored_immortals) crew, represented
 * as level-100 / max-rarity instances — see adaptation note 3 at the top of
 * this file. Buyback-state crew must already be filtered out by the caller.
 */
export function citeOriginalAlgorithm(
  ownedCrew: CitationCrew[],
  catalog: CitationCrewEntry[]
): CitationCrew[] {
  const ranked = citeOriginalAlgorithmDetailed(ownedCrew, catalog);

  // The algorithm works in catalog names throughout; map back onto the caller's
  // own crew objects. First instance wins, matching the way assessCrewRoster
  // keeps only the first progress record per archetype.
  const byName = new Map<string, CitationCrew>();
  for (const crew of ownedCrew) {
    if (!byName.has(crew.name)) byName.set(crew.name, crew);
  }

  const result: CitationCrew[] = [];
  for (const entry of ranked) {
    const crew = byName.get(entry.name);
    if (crew) result.push(crew);
  }
  return result;
}
