import { getKnownGameVersion } from './game-versions';
import type { EvolutionCondition, EvolutionEdge, EvolutionNode, PokemonEvolutionDetails } from './pokemon-details';

// Location methods can carry over within these original/sequel version families.
// Remakes deliberately stay separate: generation alone does not establish a location.
const LOCATION_VERSION_FAMILIES: readonly string[][] = [
  ['diamond-pearl', 'platinum'],
  ['black-white', 'black-2-white-2'],
  ['sun-moon', 'ultra-sun-ultra-moon'],
];

function matchesLocationFamily(source: string | undefined, target: string): boolean {
  return source === target || LOCATION_VERSION_FAMILIES.some(family => family.includes(target) && Boolean(source && family.includes(source)));
}

export function scopeEvolutionToEdition(
  evolution: PokemonEvolutionDetails,
  currentPokedexId: number,
  gameVersionKey: string | null,
  versionGroupOrders: Readonly<Record<string, number>>,
): PokemonEvolutionDetails {
  const edition = getKnownGameVersion(gameVersionKey);
  const targetOrder = edition ? versionGroupOrders[edition.versionGroupSlug] : undefined;
  if (!edition) {
    return {
      ...evolution,
      editionScope: {
        generation: null,
        excludedPokemonCount: 0,
        conditionsVerified: false,
        note: 'Keine Edition zugeordnet. Die Entwicklungskette zeigt allgemeine Bedingungen, keine für einen Run bestätigten Möglichkeiten.',
      },
    };
  }

  const generationNodes = evolution.nodes.filter(node => node.generation !== undefined && node.generation <= edition.generation);
  const included = new Set(generationNodes.map(node => node.pokedexId));
  const edges = evolution.edges.flatMap((edge): EvolutionEdge[] => {
    if (!included.has(edge.fromPokedexId) || !included.has(edge.toPokedexId)) return [];
    const matchingForms = edge.conditions.filter(condition =>
      (!condition.basePokedexId || condition.basePokedexId === edge.fromPokedexId) &&
      (!condition.evolvedPokedexId || condition.evolvedPokedexId === edge.toPokedexId),
    );
    // A regional-form-only branch is not a development of the displayed default form.
    if (edge.conditions.length > 0 && matchingForms.length === 0) return [];
    const introduced = matchingForms.filter(condition => {
      const order = condition.introducedVersionGroup ? versionGroupOrders[condition.introducedVersionGroup] : undefined;
      return order !== undefined && targetOrder !== undefined && order <= targetOrder;
    });
    const located = introduced.filter(condition => condition.location && matchesLocationFamily(condition.introducedVersionGroup, edition.versionGroupSlug));
    const ordinary = introduced.filter(condition => !condition.location);
    // "Introduced in" gives no expiry. Keep alternatives (e.g. beauty OR trade)
    // instead of treating the newest method as a universal replacement.
    const conditions = [...located, ...ordinary];
    const deduplicated = [...new Map(conditions.map(condition => {
      // The API's friendship threshold can reflect a newer game even on an older
      // introducedVersionGroup. Do not present that number as a historical fact.
      const label = condition.label.replace(/Freundschaft \d+\+/, 'hohe Freundschaft');
      return [label, { ...condition, label }] as const;
    })).values()];
    return [{ ...edge, conditions: deduplicated.length > 0 ? deduplicated : [{ trigger: 'unknown', label: 'Bedingung für diese Edition nicht bestätigt' }] }];
  });

  // Retain the selected species' connected family after generation/form pruning;
  // this also avoids incorrectly reconnecting a removed baby or regional form.
  const connected = new Set<number>();
  if (included.has(currentPokedexId)) connected.add(currentPokedexId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) {
      if (connected.has(edge.fromPokedexId) || connected.has(edge.toPokedexId)) {
        if (!connected.has(edge.fromPokedexId) || !connected.has(edge.toPokedexId)) changed = true;
        connected.add(edge.fromPokedexId);
        connected.add(edge.toPokedexId);
      }
    }
  }
  const nodes = generationNodes.filter(node => connected.has(node.pokedexId));
  return {
    nodes,
    edges: edges.filter(edge => connected.has(edge.fromPokedexId) && connected.has(edge.toPokedexId)),
    editionScope: {
      generation: edition.generation,
      excludedPokemonCount: evolution.nodes.length - nodes.length,
      conditionsVerified: false,
      note: `Auf Generation ${edition.generation} und die dargestellte Form begrenzt. Bedingungen berücksichtigen ihren Einführungszeitpunkt; Verfügbarkeit, Orte und Sonderregeln der gewählten Edition sind nicht vollständig bestätigt.`,
    },
  };
}

export interface EvolutionTreeNode {
  pokemon: EvolutionNode;
  conditions: EvolutionCondition[];
  children: EvolutionTreeNode[];
}

export function buildEvolutionForest(evolution: PokemonEvolutionDetails): EvolutionTreeNode[] {
  const byId = new Map(evolution.nodes.map(node => [node.pokedexId, node]));
  const children = new Map<number, EvolutionEdge[]>();
  const childIds = new Set<number>();
  for (const edge of evolution.edges) {
    if (!byId.has(edge.fromPokedexId) || !byId.has(edge.toPokedexId)) continue;
    children.set(edge.fromPokedexId, [...(children.get(edge.fromPokedexId) ?? []), edge]);
    childIds.add(edge.toPokedexId);
  }
  function branch(node: EvolutionNode, conditions: EvolutionCondition[], ancestors: Set<number>): EvolutionTreeNode {
    const visited = new Set(ancestors).add(node.pokedexId);
    return {
      pokemon: node,
      conditions,
      children: (children.get(node.pokedexId) ?? [])
        .filter(edge => !visited.has(edge.toPokedexId))
        .map(edge => branch(byId.get(edge.toPokedexId)!, edge.conditions, visited)),
    };
  }
  return evolution.nodes.filter(node => !childIds.has(node.pokedexId)).map(node => branch(node, [], new Set()));
}

export function evolutionAddState(pokedexId: number, selectedIds: readonly number[], availableIds: ReadonlySet<number>): { disabled: boolean; label: string; reason: string | null } {
  if (selectedIds.includes(pokedexId)) return { disabled: true, label: 'Im Vergleich', reason: 'Dieses Pokémon ist bereits ausgewählt.' };
  if (!availableIds.has(pokedexId)) return { disabled: true, label: 'Nicht verfügbar', reason: 'Dieses Pokémon ist nicht in der Vergleichsauswahl verfügbar.' };
  if (selectedIds.length >= 6) return { disabled: true, label: 'Vergleich voll', reason: 'Entferne zuerst ein Pokémon: maximal sechs Vergleichsplätze.' };
  return { disabled: false, label: 'Zum Vergleich hinzufügen', reason: null };
}
