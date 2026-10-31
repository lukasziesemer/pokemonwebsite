import type { LevelUpMove } from './pokemon-details';

interface MoveResource { name: string; url: string }

export interface PokeApiMoveMetadata {
  name: string;
  type: MoveResource;
  damage_class: MoveResource;
  power: number | null;
  accuracy: number | null;
  pp: number | null;
  past_values?: Array<{
    version_group: MoveResource;
    type: MoveResource | null;
    power: number | null;
    accuracy: number | null;
    pp: number | null;
  }>;
}

// PokeAPI's type damage classes describe the pre-generation-IV type split.
// https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/types.csv
const SPECIAL_TYPES_BEFORE_GEN_4 = new Set([
  'fire', 'water', 'grass', 'electric', 'ice', 'psychic', 'dragon', 'dark',
]);

/** Apply the historical fields that PokeAPI supplies; this is not a battle simulator. */
export function resolveMoveMetadata(
  move: PokeApiMoveMetadata,
  edition: { versionGroupSlug: string; generation: number },
  versionGroupOrders: Readonly<Record<string, number>>,
): Pick<LevelUpMove, 'type' | 'damageClass' | 'power' | 'accuracy' | 'pp'> {
  const result = {
    type: move.type.name,
    damageClass: move.damage_class.name,
    power: move.power,
    accuracy: move.accuracy,
    pp: move.pp,
  };
  const history = move.past_values ?? [];
  if (history.length > 0) {
    const targetOrder = versionGroupOrders[edition.versionGroupSlug];
    if (!Number.isFinite(targetOrder)) throw new Error('Editionsreihenfolge für Attacken fehlt.');
    const changes = history.map((change) => {
      const order = versionGroupOrders[change.version_group.name];
      if (!Number.isFinite(order)) throw new Error('Historische Editionsreihenfolge für Attacken fehlt.');
      return { change, order };
    }).filter(({ order }) => order > targetOrder).sort((a, b) => b.order - a.order);

    // past_values stores old values at the version group where they CHANGED.
    // Null fields mean unchanged in that changelog entry, not zero/no accuracy.
    // https://github.com/PokeAPI/pokeapi/blob/master/data/v2/csv/move_changelog.csv
    for (const { change } of changes) {
      if (change.type !== null) result.type = change.type.name;
      if (change.power !== null) result.power = change.power;
      if (change.accuracy !== null) result.accuracy = change.accuracy;
      if (change.pp !== null) result.pp = change.pp;
    }
  }

  if (edition.generation < 4 && result.damageClass !== 'status') {
    // Hidden Power's actual type depends on the individual Pokémon, which the
    // encounter data does not track. Do not claim Normal/physical for its class.
    // https://github.com/smogon/pokemon-showdown/blob/master/data/mods/gen3/moves.ts
    result.damageClass = move.name === 'hidden-power'
      ? 'variable'
      : SPECIAL_TYPES_BEFORE_GEN_4.has(result.type) ? 'special' : 'physical';
  }
  return result;
}
