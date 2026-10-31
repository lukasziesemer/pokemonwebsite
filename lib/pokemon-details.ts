export interface PokemonBaseStats {
  hp: number;
  attack: number;
  defense: number;
  spAttack: number;
  spDefense: number;
  speed: number;
  total: number;
}

export interface PokemonDetailsSummary {
  pokedexId: number;
  name: string;
  nameGerman: string | null;
  displayName: string;
  types: string[];
  spriteUrl: string | null;
  spriteGifUrl: string | null;
  stats: PokemonBaseStats;
}

export interface PokemonEditionInfo {
  key: string;
  name: string;
  versionSlug: string;
  versionGroupSlug: string;
}

export interface LevelUpMove {
  name: string;
  nameGerman: string | null;
  displayName: string;
  level: number;
  order: number;
  type: string;
  damageClass: string;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
}

export interface EvolutionNode {
  pokedexId: number;
  name: string;
  nameGerman: string | null;
  displayName: string;
  spriteUrl: string | null;
  spriteGifUrl: string | null;
  generation?: number;
}

export interface EvolutionCondition {
  trigger: string;
  label: string;
  minLevel?: number;
  item?: string;
  heldItem?: string;
  knownMove?: string;
  knownMoveType?: string;
  location?: string;
  minHappiness?: number;
  minBeauty?: number;
  minAffection?: number;
  timeOfDay?: string;
  gender?: string;
  relativePhysicalStats?: number;
  needsOverworldRain?: boolean;
  turnUpsideDown?: boolean;
  partySpecies?: string;
  partyType?: string;
  tradeSpecies?: string;
  introducedVersionGroup?: string;
  // PokeAPI form ids: a default form shares its species id, other forms do not.
  basePokedexId?: number;
  evolvedPokedexId?: number;
}

export interface EvolutionEdge {
  fromPokedexId: number;
  toPokedexId: number;
  conditions: EvolutionCondition[];
}

export interface PokemonEvolutionDetails {
  nodes: EvolutionNode[];
  edges: EvolutionEdge[];
  editionScope?: {
    generation: number | null;
    excludedPokemonCount: number;
    conditionsVerified: boolean;
    note: string;
  };
}

export interface PokemonDetailsCacheInfo {
  status: 'hit' | 'miss' | 'stale';
  fetchedAt: string;
  expiresAt: string;
  stale: boolean;
}

export interface PokemonDetailsResponse {
  pokemon: PokemonDetailsSummary;
  edition: PokemonEditionInfo | null;
  /** null bedeutet bewusst: Es ist keine Edition zugeordnet. */
  levelUpMoves: LevelUpMove[] | null;
  evolution: PokemonEvolutionDetails;
  cache: PokemonDetailsCacheInfo;
}
