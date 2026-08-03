export interface CollectionReward {
  type: number;
  symbol: string;
  quantity: number;
  full_name: string;
}

export interface CollectionBuff {
  name: string;
}

export interface CollectionMilestone {
  goal: number;
  rewards: CollectionReward[];
  buffs: CollectionBuff[];
}

export interface Collection {
  id: number;
  name: string;
  traits: string[];
  extra_crew: number[];
  progress: number;
  claimable_milestone_index: number;
  milestone: CollectionMilestone;
}
