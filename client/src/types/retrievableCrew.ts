export interface RetrievableCrewEntry {
  archetypeId: number;
  // Fixed 4-slot array, in Polestar #1..#4 order. null marks an empty slot.
  polestars: (number | null)[];
}
