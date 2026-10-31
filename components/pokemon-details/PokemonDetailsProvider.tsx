'use client';

import dynamic from 'next/dynamic';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import type { PokemonDetailsResponse } from '@/lib/pokemon-details';
import { getPokemonDetailsCacheRevision, getPokemonDetailsRequestUrl, invalidatePokemonDetails, loadPokemonDetails, peekPokemonDetails, subscribePokemonDetailsCache } from '@/lib/pokemon-details-client';

const PokemonDetailsDialog = dynamic(() => import('./PokemonDetailsDialog'), {
  ssr: false,
  loading: () => null,
});

export interface PokemonDetailsTarget {
  pokedexId: number;
  displayName?: string | null;
  name?: string | null;
  nameGerman?: string | null;
  spriteUrl?: string | null;
  spriteGifUrl?: string | null;
  types?: string[];
}

interface PokemonDetailsContextValue {
  openPokemonDetails: (
    pokemon: PokemonDetailsTarget,
    trigger?: HTMLElement | null,
  ) => void;
  closePokemonDetails: () => void;
}

interface PokemonDetailsProviderProps {
  children: ReactNode;
  /** Schlüssel der Edition des aktuellen Runs, z. B. `black2`. */
  gameVersionKey?: string | null;
  /** Lesbarer Name für den Ladezustand; die API bleibt die Datenquelle. */
  gameVersionName?: string | null;
}

const PokemonDetailsContext = createContext<PokemonDetailsContextValue | null>(null);
function getTargetName(target: PokemonDetailsTarget) {
  return target.displayName || target.nameGerman || target.name || `Pokémon #${target.pokedexId}`;
}

export function PokemonDetailsProvider({
  children,
  gameVersionKey,
  gameVersionName,
}: PokemonDetailsProviderProps) {
  const [target, setTarget] = useState<PokemonDetailsTarget | null>(null);
  const [details, setDetails] = useState<PokemonDetailsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const [settledRequestKey, setSettledRequestKey] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  useSyncExternalStore(subscribePokemonDetailsCache, getPokemonDetailsCacheRevision, () => 0);

  const closePokemonDetails = useCallback(() => {
    const trigger = triggerRef.current;
    setTarget(null);
    setDetails(null);
    setLoading(false);
    setError(null);
    setSettledRequestKey(null);
    triggerRef.current = null;
    window.requestAnimationFrame(() => trigger?.focus());
  }, []);

  const openPokemonDetails = useCallback((
    pokemon: PokemonDetailsTarget,
    trigger?: HTMLElement | null,
  ) => {
    const cached = peekPokemonDetails(pokemon.pokedexId, gameVersionKey);
    triggerRef.current = trigger ?? (document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null);
    setTarget(pokemon);
    setDetails(cached ?? null);
    setLoading(!cached);
    setError(null);
    setSettledRequestKey(cached ? getPokemonDetailsRequestUrl(pokemon.pokedexId, gameVersionKey) : null);
  }, [gameVersionKey]);

  useEffect(() => {
    if (!target) return;

    let current = true;
    const requestKey = getPokemonDetailsRequestUrl(target.pokedexId, gameVersionKey);

    loadPokemonDetails(target.pokedexId, gameVersionKey)
      .then(response => {
        if (!current) return;
        setDetails(response);
        setError(null);
      })
      .catch(reason => {
        if (!current) return;
        setError(reason instanceof Error ? reason.message : 'Die Pokémon-Daten konnten nicht geladen werden.');
      })
      .finally(() => {
        if (current) {
          setLoading(false);
          setSettledRequestKey(requestKey);
        }
      });

    // The same request can be in use by a comparison section: ignore, don't abort it.
    return () => { current = false; };
  }, [gameVersionKey, requestVersion, target]);

  const contextValue = useMemo<PokemonDetailsContextValue>(() => ({
    openPokemonDetails,
    closePokemonDetails,
  }), [closePokemonDetails, openPokemonDetails]);
  const settled = target && settledRequestKey === getPokemonDetailsRequestUrl(target.pokedexId, gameVersionKey);
  const cachedDetails = target ? peekPokemonDetails(target.pokedexId, gameVersionKey) : undefined;

  return (
    <PokemonDetailsContext.Provider value={contextValue}>
      {children}
      {target ? (
        <PokemonDetailsDialog
          target={target}
          targetName={getTargetName(target)}
          details={cachedDetails ?? (settled ? details : null)}
          loading={!cachedDetails && (!settled || loading)}
          error={cachedDetails ? null : settled ? error : null}
          gameVersionName={gameVersionName}
          onClose={closePokemonDetails}
          onRetry={() => {
            invalidatePokemonDetails(target.pokedexId, gameVersionKey);
            setDetails(null);
            setLoading(true);
            setError(null);
            setRequestVersion(version => version + 1);
          }}
        />
      ) : null}
    </PokemonDetailsContext.Provider>
  );
}

export function usePokemonDetails(): PokemonDetailsContextValue {
  const context = useContext(PokemonDetailsContext);
  if (!context) {
    throw new Error('usePokemonDetails muss innerhalb eines PokemonDetailsProvider verwendet werden.');
  }
  return context;
}

interface PokemonDetailsTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  pokemon: PokemonDetailsTarget;
  children: ReactNode;
}

export function PokemonDetailsTrigger({
  pokemon,
  children,
  onClick,
  type = 'button',
  ...buttonProps
}: PokemonDetailsTriggerProps) {
  const { openPokemonDetails } = usePokemonDetails();
  const label = getTargetName(pokemon);

  return (
    <button
      {...buttonProps}
      type={type}
      aria-haspopup="dialog"
      aria-label={buttonProps['aria-label'] ?? `${label}: Details öffnen`}
      onClick={event => {
        onClick?.(event);
        if (!event.defaultPrevented) openPokemonDetails(pokemon, event.currentTarget);
      }}
    >
      {children}
    </button>
  );
}
