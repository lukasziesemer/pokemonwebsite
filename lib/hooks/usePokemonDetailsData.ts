'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { PokemonDetailsResponse } from '@/lib/pokemon-details';
import {
  getPokemonDetailsCacheRevision,
  invalidatePokemonDetails,
  loadPokemonDetails,
  peekPokemonDetails,
  subscribePokemonDetailsCache,
} from '@/lib/pokemon-details-client';

interface PokemonDetailsDataOptions {
  pokemonIds: number[];
  gameVersionKey: string | null;
  enabled: boolean;
}

interface DetailsSnapshot {
  key: string;
  detailsById: Record<number, PokemonDetailsResponse | undefined>;
  errorsById: Record<number, string | undefined>;
}

export function usePokemonDetailsData({
  pokemonIds,
  gameVersionKey,
  enabled,
}: PokemonDetailsDataOptions) {
  useSyncExternalStore(subscribePokemonDetailsCache, getPokemonDetailsCacheRevision, () => 0);
  const pokemonKey = [...new Set(pokemonIds.filter(id => Number.isInteger(id) && id > 0))]
    .sort((left, right) => left - right)
    .join(',');
  const ids = useMemo(() => pokemonKey ? pokemonKey.split(',').map(Number) : [], [pokemonKey]);
  const editionKey = gameVersionKey?.trim().toLowerCase() || null;
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<DetailsSnapshot | null>(null);
  const requestKey = JSON.stringify([editionKey, pokemonKey, attempt]);

  useEffect(() => {
    if (!enabled) return;
    let current = true;

    for (const id of ids) {
      loadPokemonDetails(id, editionKey).then(
        details => {
          if (!current) return;
          setSnapshot(previous => ({
            key: requestKey,
            detailsById: {
              ...(previous?.key === requestKey ? previous.detailsById : {}),
              [id]: details,
            },
            errorsById: {
              ...(previous?.key === requestKey ? previous.errorsById : {}),
              [id]: undefined,
            },
          }));
        },
        reason => {
          if (!current) return;
          setSnapshot(previous => ({
            key: requestKey,
            detailsById: previous?.key === requestKey ? previous.detailsById : {},
            errorsById: {
              ...(previous?.key === requestKey ? previous.errorsById : {}),
              [id]: reason instanceof Error
                ? reason.message
                : 'Die Pokémon-Daten konnten nicht geladen werden.',
            },
          }));
        },
      );
    }

    // Requests are shared with the pop-out and other sections and must not be aborted here.
    return () => { current = false; };
  }, [editionKey, enabled, ids, requestKey]);

  const detailsById: Record<number, PokemonDetailsResponse | undefined> = {};
  const errorsById: Record<number, string | undefined> = {};
  for (const id of ids) {
    const cached = peekPokemonDetails(id, editionKey);
    detailsById[id] = cached ?? (snapshot?.key === requestKey ? snapshot.detailsById[id] : undefined);
    // A retry from another consumer may have succeeded after this hook recorded an error.
    errorsById[id] = !cached && snapshot?.key === requestKey ? snapshot.errorsById[id] : undefined;
  }

  const retry = useCallback(() => {
    for (const id of ids) {
      // Keep successful columns cached when retrying a partial failure.
      if (!peekPokemonDetails(id, editionKey)) invalidatePokemonDetails(id, editionKey);
    }
    setAttempt(previous => previous + 1);
  }, [editionKey, ids, setAttempt]);

  return {
    detailsById,
    errorsById,
    loading: enabled && ids.some(id => !detailsById[id] && !errorsById[id]),
    retry,
  };
}
