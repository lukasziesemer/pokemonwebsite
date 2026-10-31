'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import AppPageTitle from '@/components/layout/AppPageTitle';
import { PokemonDetailsProvider } from '@/components/pokemon-details/PokemonDetailsProvider';
import ComparisonInsights from '@/components/pokeradar/ComparisonInsights';
import BaseStatsComparison from '@/components/pokeradar/BaseStatsComparison';
import PokemonPicker from '@/components/pokeradar/PokemonPicker';
import PokemonProfileComparison from '@/components/pokeradar/PokemonProfileComparison';
import RadarProfileDisclosure from '@/components/pokeradar/RadarProfileDisclosure';
import SavedComparisonSets from '@/components/pokeradar/SavedComparisonSets';
import SelectedPokemonRail from '@/components/pokeradar/SelectedPokemonRail';
import TeamSourcePicker, {
  type AppliedPlayerTeam,
  type AppliedTeamPokemon,
} from '@/components/pokeradar/TeamSourcePicker';
import TypeComparison from '@/components/pokeradar/TypeComparison';
import LevelUpMoveComparison from '@/components/pokeradar/LevelUpMoveComparison';
import EvolutionComparison from '@/components/pokeradar/EvolutionComparison';
import type { SavedComparisonSetV2 } from '@/components/pokeradar/team-comparison-types';
import { fetchJson } from '@/lib/fetchJson';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import {
  DEFAULT_COMPARISON_METRIC,
  normalizeComparisonState,
  parseComparisonParams,
  serializeComparisonParams,
  type ComparisonMetric,
  type ComparisonQueryState,
  type ComparisonSelectionStatus,
} from '@/lib/pokemon-comparison';
import type {
  PokeradarPlayerTeam,
  PokeradarTeamsResponse,
} from '@/lib/pokeradar-team-data';
import type { Pokemon } from '@/lib/types';
import type { ComparisonRunContext } from '@/lib/pokeradar-context';

type LoadedPokemon = Pokemon & { id: number };

const COMPARISON_POKEMON_TOPICS = ['pokemon'] as const;
const COMPARISON_TEAM_TOPICS = ['encounters', 'players'] as const;
const COMPARISON_RUN_TOPICS = ['runs'] as const;

export default function PokeradarClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [allPokemon, setAllPokemon] = useState<LoadedPokemon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('');
  const [teamSources, setTeamSources] = useState<PokeradarPlayerTeam[]>([]);
  const [teamSourcesLoading, setTeamSourcesLoading] = useState(true);
  const [teamSourcesError, setTeamSourcesError] = useState<string | null>(null);
  const [pokemonReloadToken, setPokemonReloadToken] = useState(0);
  const [teamReloadToken, setTeamReloadToken] = useState(0);
  const [runContext, setRunContext] = useState<ComparisonRunContext | null>(null);
  const [runContextError, setRunContextError] = useState(false);
  const [contextReloadToken, setContextReloadToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchJson<ComparisonRunContext>('/api/pokeradar/context', { signal: controller.signal })
      .then(context => {
        if (controller.signal.aborted) return;
        setRunContext(context);
        setRunContextError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRunContextError(true);
      });
    return () => controller.abort();
  }, [contextReloadToken]);

  useEffect(() => {
    const controller = new AbortController();

    fetchJson<{ pokemon?: LoadedPokemon[] }>('/api/pokemon', { signal: controller.signal })
      .then((data) => setAllPokemon(data.pokemon || []))
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setError(fetchError instanceof Error ? fetchError.message : 'Pokémon-Daten konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [pokemonReloadToken]);

  useEffect(() => {
    const controller = new AbortController();

    fetchJson<PokeradarTeamsResponse>('/api/pokeradar/teams', {
      signal: controller.signal,
    })
      .then((data) => {
        setTeamSources(data.players);
        setTeamSourcesError(null);
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === 'AbortError') return;
        setTeamSourcesError('Spielerteams konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setTeamSourcesLoading(false);
      });

    return () => controller.abort();
  }, [teamReloadToken]);

  const reloadPokemon = useCallback(() => {
    setPokemonReloadToken((token) => token + 1);
  }, []);
  const reloadTeams = useCallback(() => {
    setTeamReloadToken((token) => token + 1);
  }, []);
  const reloadContext = useCallback(() => {
    setContextReloadToken(token => token + 1);
  }, []);

  useLiveRefresh(COMPARISON_POKEMON_TOPICS, reloadPokemon);
  useLiveRefresh(COMPARISON_TEAM_TOPICS, reloadTeams);
  useLiveRefresh(COMPARISON_RUN_TOPICS, reloadContext);

  const availablePokemonIds = useMemo(() => allPokemon.map(pokemon => pokemon.pokedexId), [allPokemon]);

  const comparisonState = useMemo(
    () => normalizeComparisonState(
      parseComparisonParams(searchParams),
      allPokemon.map((pokemon) => pokemon.pokedexId),
    ),
    [allPokemon, searchParams],
  );

  const selectedPokemon = useMemo(() => {
    const pokemonById = new Map(allPokemon.map((pokemon) => [pokemon.pokedexId, pokemon]));
    return comparisonState.pokemonIds.flatMap((id) => {
      const pokemon = pokemonById.get(id);
      return pokemon ? [pokemon] : [];
    });
  }, [allPokemon, comparisonState.pokemonIds]);

  const referencePokemon = useMemo(
    () => selectedPokemon.find((pokemon) => pokemon.pokedexId === comparisonState.referenceId) || null,
    [comparisonState.referenceId, selectedPokemon],
  );

  const navigateToState = useCallback((state: ComparisonQueryState) => {
    const next = serializeComparisonParams(state, new URLSearchParams(searchParams.toString()));
    const query = next.toString();
    router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const changeSelection = useCallback((nextPokemon: Pokemon[]) => {
    const ids = nextPokemon.map((pokemon) => pokemon.pokedexId);
    const previousStatusById = new Map(
      comparisonState.pokemonIds.map((id, index) => [
        id,
        comparisonState.statuses[index] ?? 'none',
      ] as const),
    );
    const statuses = ids.map(
      (id): ComparisonSelectionStatus => previousStatusById.get(id) ?? 'none',
    );
    const hasSourceMetadata = statuses.some((status) => status !== 'none');

    navigateToState({
      pokemonIds: ids,
      referenceId: comparisonState.referenceId && ids.includes(comparisonState.referenceId)
        ? comparisonState.referenceId
        : ids[0] ?? null,
      metric: comparisonState.metric,
      statuses,
      source: hasSourceMetadata ? comparisonState.source : null,
      sourceLabel: hasSourceMetadata ? comparisonState.sourceLabel : null,
    });
  }, [comparisonState, navigateToState]);

  const addPokemon = useCallback((pokemon: Pokemon) => {
    if (selectedPokemon.length >= 6 || selectedPokemon.some((entry) => entry.pokedexId === pokemon.pokedexId)) return;
    changeSelection([...selectedPokemon, pokemon]);
  }, [changeSelection, selectedPokemon]);

  const addEvolutionToComparison = useCallback((pokedexId: number) => {
    const pokemon = allPokemon.find(entry => entry.pokedexId === pokedexId);
    if (pokemon) addPokemon(pokemon);
  }, [addPokemon, allPokemon]);

  const removePokemon = useCallback((pokedexId: number) => {
    changeSelection(selectedPokemon.filter((pokemon) => pokemon.pokedexId !== pokedexId));
  }, [changeSelection, selectedPokemon]);

  const setReference = useCallback((pokedexId: number) => {
    navigateToState({ ...comparisonState, referenceId: pokedexId });
  }, [comparisonState, navigateToState]);

  const setMetric = useCallback((metric: ComparisonMetric) => {
    navigateToState({ ...comparisonState, metric });
  }, [comparisonState, navigateToState]);

  const applyPlayerTeam = useCallback((team: AppliedPlayerTeam) => {
    navigateToState({
      pokemonIds: team.pokemonIds,
      referenceId: team.pokemonIds[0] ?? null,
      metric: comparisonState.metric,
      statuses: team.statuses,
      source: 'team',
      sourceLabel: team.sourceLabel,
    });
  }, [comparisonState.metric, navigateToState]);

  const toggleTeamPokemon = useCallback((teamPokemon: AppliedTeamPokemon) => {
    const selectedIndex = comparisonState.pokemonIds.indexOf(teamPokemon.pokedexId);
    const removing = selectedIndex >= 0;
    if (!removing && comparisonState.pokemonIds.length >= 6) return;

    const pokemonIds = removing
      ? comparisonState.pokemonIds.filter((_, index) => index !== selectedIndex)
      : [...comparisonState.pokemonIds, teamPokemon.pokedexId];
    const statuses = removing
      ? comparisonState.statuses.filter((_, index) => index !== selectedIndex)
      : [...comparisonState.statuses, teamPokemon.status];
    const hasTeamStatus = statuses.some((status) => status !== 'none');
    const sourceLabel = removing
      ? comparisonState.sourceLabel
      : comparisonState.pokemonIds.length === 0 || comparisonState.sourceLabel === teamPokemon.sourceLabel
        ? teamPokemon.sourceLabel
        : 'Spielerteams';

    navigateToState({
      pokemonIds,
      referenceId: comparisonState.referenceId && pokemonIds.includes(comparisonState.referenceId)
        ? comparisonState.referenceId
        : pokemonIds[0] ?? null,
      metric: comparisonState.metric,
      statuses,
      source: hasTeamStatus ? 'team' : null,
      sourceLabel: hasTeamStatus ? sourceLabel : null,
    });
  }, [comparisonState, navigateToState]);

  const loadComparisonSet = useCallback((set: SavedComparisonSetV2) => {
    navigateToState({
      pokemonIds: set.pokemonIds,
      referenceId: set.referenceId,
      metric: set.metric,
      statuses: set.statuses,
      source: set.source ?? null,
      sourceLabel: set.sourceLabel ?? set.label,
    });
  }, [navigateToState]);

  const resetComparison = useCallback(() => {
    navigateToState({
      pokemonIds: [],
      referenceId: null,
      metric: DEFAULT_COMPARISON_METRIC,
      statuses: [],
      source: null,
      sourceLabel: null,
    });
  }, [navigateToState]);

  const shareComparison = useCallback(async () => {
    try {
      const url = window.location.href;
      if (navigator.share) {
        await navigator.share({ title: 'Pokémon-Vergleich', url });
        setShareStatus('Vergleich geteilt.');
      } else {
        await navigator.clipboard.writeText(url);
        setShareStatus('Link kopiert.');
      }
    } catch (shareError: unknown) {
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return;
      setShareStatus('Link konnte nicht automatisch kopiert werden.');
    }
  }, []);

  if (loading) {
    return (
      <div className="app-page py-16 text-center" aria-busy="true">
        <div className="mx-auto size-10 animate-spin rounded-full border-4 border-red-500/20 border-t-red-600" />
        <p className="mt-4 text-[var(--text-secondary)]" role="status">Pokémon-Daten werden geladen.</p>
      </div>
    );
  }

  if (error || allPokemon.length === 0) {
    return (
      <div className="app-page max-w-3xl py-16">
        <section className="app-section border-red-500/40 p-8 text-center" role={error ? 'alert' : undefined}>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {error ? 'Pokémon-Daten konnten nicht geladen werden' : 'Noch keine Pokémon vorhanden'}
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            {error || 'Synchronisiere zuerst Pokémon im Admin-Bereich.'}
          </p>
          {error ? (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="app-action app-action-primary mt-5 min-h-11"
            >
              Erneut versuchen
            </button>
          ) : null}
        </section>
      </div>
    );
  }

  return (
    <PokemonDetailsProvider
      key={runContextError ? 'context-error' : `${runContext?.runId ?? 'none'}:${runContext?.gameVersionKey ?? 'none'}`}
      gameVersionKey={runContext?.gameVersionKey ?? null}
      gameVersionName={runContext?.gameVersionName}
    >
    <div className="app-page">
      <header className="app-page-header mb-5">
        <AppPageTitle
          index="03"
          title="Vergleich"
          description="Basiswerte, Attacken, Entwicklungen und Typen direkt gegenüberstellen."
        />
        <button
          type="button"
          onClick={() => void shareComparison()}
          className="app-action min-h-11 self-start md:self-auto"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" />
          </svg>
          Vergleich teilen
        </button>
        <p className="sr-only" role="status" aria-live="polite">{shareStatus}</p>
      </header>

      <div className="app-toolbar mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-live="polite">
        {runContextError ? (
          <>
            <p role="alert">Die Edition des aktuellen Runs konnte nicht geladen werden. Editionsabhängige Details bleiben gesperrt.</p>
            <button type="button" onClick={reloadContext} className="app-action min-h-11">Edition erneut laden</button>
          </>
        ) : runContext ? (
          <>
            <span>Edition des aktuellen Runs: <strong>{runContext.gameVersionName ?? 'Nicht festgelegt'}</strong></span>
            <span className="text-[var(--text-secondary)]">{runContext.levelCap !== null ? `Level-Cap: ${runContext.levelCap}` : 'Kein Level-Cap hinterlegt'}</span>
          </>
        ) : <p role="status">Edition des aktuellen Runs wird geladen …</p>}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
        <main className="min-w-0 space-y-5">
          <section className="app-section p-4 md:p-5">
            {comparisonState.sourceLabel ? (
              <div className="app-band app-band--navy mb-4 flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <p className="text-sm text-white/75">
                  Übernommen aus <strong className="font-black text-white">{comparisonState.sourceLabel}</strong>
                </p>
                <span className="text-xs font-bold text-white/70">
                  Einzelne Pokémon können weiter ausgetauscht werden
                </span>
              </div>
            ) : null}
            <SelectedPokemonRail
              selected={selectedPokemon}
              referenceId={comparisonState.referenceId}
              onSetReference={setReference}
              onRemove={removePokemon}
              onOpenPicker={() => setPickerOpen(true)}
              statuses={comparisonState.statuses}
              detailsEnabled={Boolean(runContext) && !runContextError}
            />

            <div className="app-toolbar mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--border-default)] pt-4 xl:justify-end">
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="app-action app-action-primary min-h-11 flex-1 sm:flex-none xl:hidden"
              >
                <span aria-hidden="true" className="text-xl">+</span>
                Pokémon hinzufügen
              </button>
              <button
                type="button"
                onClick={resetComparison}
                disabled={selectedPokemon.length === 0}
                className="app-action min-h-11 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span aria-hidden="true">↻</span>
                Zurücksetzen
              </button>
            </div>
          </section>

          <details className="app-section group p-0">
            <summary className="app-section-title flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-[var(--background-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-sm font-black uppercase tracking-wide text-[var(--foreground)]">Teams &amp; Vergleichssets</span>
                <span className="mt-0.5 block text-xs text-[var(--text-secondary)]">
                  Spielerteam übernehmen oder bis zu acht Auswahlen speichern
                </span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-2 text-xs font-black text-red-600">
                <span className="group-open:hidden">Öffnen</span>
                <span className="hidden group-open:inline">Schließen</span>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 transition group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 7.5 5 5 5-5" />
                </svg>
              </span>
            </summary>
            <div className="grid gap-0 border-t border-[var(--border-default)] lg:grid-cols-2 lg:divide-x lg:divide-[var(--border-default)]">
              <TeamSourcePicker
                players={teamSources}
                selectedPokemonIds={comparisonState.pokemonIds}
                loading={teamSourcesLoading}
                error={teamSourcesError}
                onApplyTeam={applyPlayerTeam}
                onTogglePokemon={toggleTeamPokemon}
              />
              <SavedComparisonSets
                currentSelection={{
                  pokemonIds: comparisonState.pokemonIds,
                  statuses: comparisonState.statuses,
                  referenceId: comparisonState.referenceId,
                  metric: comparisonState.metric,
                  source: comparisonState.source,
                  sourceLabel: comparisonState.sourceLabel ?? undefined,
                }}
                onLoad={loadComparisonSet}
              />
            </div>
          </details>

          <ComparisonInsights pokemon={selectedPokemon} reference={referencePokemon} />

          {selectedPokemon.length === 0 ? (
            <section className="app-section border-dashed px-5 py-14 text-center">
              <div className="mx-auto flex size-12 items-center justify-center border border-red-600 text-2xl text-red-600" aria-hidden="true">＋</div>
              <h2 className="mt-4 text-xl font-bold text-[var(--foreground)]">Wähle dein erstes Pokémon</h2>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-secondary)]">
                Ab zwei Pokémon werden Unterschiede, Höchstwerte und Typ-Matchups direkt sichtbar.
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="app-action app-action-primary mt-5 min-h-11 xl:hidden"
              >
                Pokémon auswählen
              </button>
            </section>
          ) : (
            <ComparisonSections
              pokemon={selectedPokemon}
              reference={referencePokemon}
              activeMetric={comparisonState.metric}
              onMetricChange={setMetric}
              runContext={runContextError ? null : runContext}
              availablePokemonIds={availablePokemonIds}
              onAddPokemon={addEvolutionToComparison}
            />
          )}
        </main>

        <PokemonPicker
          pokemon={allPokemon}
          selected={selectedPokemon}
          isOpen={pickerOpen}
          onOpenChange={setPickerOpen}
          onAdd={addPokemon}
          onRemove={removePokemon}
          onApplyMobile={changeSelection}
        />
      </div>
    </div>
    </PokemonDetailsProvider>
  );
}

function ComparisonSections({
  pokemon,
  reference,
  activeMetric,
  onMetricChange,
  runContext,
  availablePokemonIds,
  onAddPokemon,
}: {
  pokemon: Pokemon[];
  reference: Pokemon | null;
  activeMetric: ComparisonMetric;
  onMetricChange: (metric: ComparisonMetric) => void;
  runContext: ComparisonRunContext | null;
  availablePokemonIds: number[];
  onAddPokemon: (pokedexId: number) => void;
}) {
  return (
    <>
      <BaseStatsComparison
        pokemon={pokemon}
        reference={reference}
        activeMetric={activeMetric}
        onMetricChange={onMetricChange}
      />
      <PokemonProfileComparison pokemon={pokemon} />
      {runContext ? (
        <>
          <LevelUpMoveComparison
            pokemon={pokemon}
            gameVersionKey={runContext.gameVersionKey}
            gameVersionName={runContext.gameVersionName}
            levelCap={runContext.levelCap}
          />
          <EvolutionComparison
            pokemon={pokemon}
            gameVersionKey={runContext.gameVersionKey}
            gameVersionName={runContext.gameVersionName}
            availablePokemonIds={availablePokemonIds}
            onAddPokemon={onAddPokemon}
          />
        </>
      ) : null}
      <TypeComparison pokemon={pokemon} />
      <RadarProfileDisclosure pokemon={pokemon} />
    </>
  );
}
