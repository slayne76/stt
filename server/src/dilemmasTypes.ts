export type Reward =
  | { type: 'crew'; crewArchetypeId: number; dropRatePercent: number; showName: boolean }
  | { type: 'ship'; shipArchetypeId: number; dropRatePercent: number; showName: boolean };

export interface Choice {
  letter: 'A' | 'B' | 'C';
  description: string;
  leadsToDilemmaId?: string;
  rewards?: Reward[];
}

export interface Dilemma {
  id: string;
  name: string;
  chainName: string;
  partNumber: number;
  choices: Choice[];
}

export interface DilemmasResponse {
  dilemmas: Dilemma[];
}
