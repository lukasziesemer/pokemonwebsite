/**
 * Routen-Liste Komponente
 * Zeigt alle Routen mit den Encounters der Spieler an
 * Performance: Mit React.memo für weniger Re-Renders
 */

'use client';

import { useState, useRef, useEffect, useMemo, memo } from 'react';
import Link from 'next/link';
import PokemonCard from './PokemonCard';
import EncounterActionMenu from './admin/EncounterActionMenu';
import RouteLinkActionMenu from './admin/RouteLinkActionMenu';
import {
  getEncounterRouteLinkState,
  getNextTeamSlot,
  getOccupiedTeamSlots,
  type EncounterRouteLinkTarget,
} from './admin/route-link-ui';
import { PokemonDetailsTrigger } from './pokemon-details';
import PlayerAvatar from './PlayerAvatar';
import { calculateAverageStats, filterPokemonBySearch } from '@/lib/team-utils';
import { fetchJson } from '@/lib/fetchJson';
import { mutateEncounterLink } from '@/lib/encounter-link-admin';
import { getErrorMessage } from '@/lib/component-utils';
import { buildPokeradarHref } from '@/lib/pokeradar-team-data';
import { parseTypes } from '@/lib/typeEffectiveness';
import type { EncounterWithMeta, PlayerBase, PokemonListItem } from '@/lib/types';
import type { EncounterAdminTarget } from '@/lib/encounter-admin';

function buildRouteComparisonHref(route: Route) {
  const stableEncounters = [...route.encounters]
    .sort((left, right) => left.player.id - right.player.id || left.id - right.id);

  return buildPokeradarHref(stableEncounters.map((encounter) => ({
    pokedexId: encounter.pokemon.pokedexId,
    status: encounter.isNotCaught
      ? 'not-caught'
      : encounter.isKnockedOut
        ? 'ko'
        : encounter.teamSlot !== null
          ? 'team'
          : 'caught',
  })), {
    source: 'route',
    sourceLabel: route.name,
  });
}

// =============================================================================
// Types
// =============================================================================

interface RouteEncounter extends EncounterWithMeta {
  pokemon: EncounterWithMeta['pokemon'] & {
    id: number;
    spriteGifUrl: string | null;
  };
}

interface Route {
  id: number;
  name: string;
  order: number;
  encounters: RouteEncounter[];
}

function toEncounterAdminTarget(encounter: RouteEncounter, route: Route): EncounterAdminTarget {
  return {
    ...encounter,
    route: { id: route.id, name: route.name },
    pokemon: {
      id: encounter.pokemon.id,
      pokedexId: encounter.pokemon.pokedexId,
      name: encounter.pokemon.name,
      nameGerman: encounter.pokemon.nameGerman,
      spriteUrl: encounter.pokemon.spriteUrl,
      spriteGifUrl: encounter.pokemon.spriteGifUrl,
    },
  };
}

interface RouteListProps {
  routes: Route[];
  players: PlayerBase[];
  isAdmin?: boolean;
  gameVersionKey?: string | null;
  onTeamUpdate?: () => void;
  pokemon?: PokemonListItem[];
  /** Neu angelegte Route: wird angesteuert, damit die Erfassung direkt weitergeht. */
  focusRouteId?: number | null;
}

// =============================================================================
// Sub-Komponenten
// =============================================================================

interface EditableRouteNameProps {
  route: Route;
  isInactive: boolean;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  isProcessing: boolean;
}

function EditableRouteName({
  route,
  isInactive,
  isEditing,
  editValue,
  onEditChange,
  onEditSave,
  onEditCancel,
  isProcessing,
}: EditableRouteNameProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onEditSave();
    } else if (e.key === 'Escape') {
      onEditCancel();
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => onEditChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={onEditSave}
          disabled={isProcessing}
          className="min-h-10 max-w-64 border-b-2 border-[var(--brand-blue)] bg-transparent px-1 text-lg font-black uppercase text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]"
        />
      </div>
    );
  }

  return (
    <h3 className={`text-lg font-black uppercase leading-tight ${isInactive ? 'text-[var(--text-tertiary)] line-through' : 'text-[var(--foreground)]'}`}>
      {route.name}
    </h3>
  );
}

interface RouteHeaderProps {
  route: Route;
  isInactive: boolean;
  isKnockedOut: boolean;
  isNotCaught: boolean;
  koInfo: EncounterWithMeta | null;
  notCaughtInfo: EncounterWithMeta | null;
  routeAverage: { total: number } | null;
  teamSlot: number | null;
  isEditing: boolean;
  editValue: string;
  onEditChange: (value: string) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  isProcessing: boolean;
}

function RouteHeader({
  route,
  isInactive,
  isKnockedOut,
  isNotCaught,
  koInfo,
  notCaughtInfo,
  routeAverage,
  teamSlot,
  isEditing,
  editValue,
  onEditChange,
  onEditSave,
  onEditCancel,
  isProcessing,
}: RouteHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-8 shrink-0 text-right text-sm font-black tabular-nums text-[var(--brand-red)]">
        {String(route.order).padStart(2, '0')}
      </span>

      <EditableRouteName
        route={route}
        isInactive={isInactive}
        isEditing={isEditing}
        editValue={editValue}
        onEditChange={onEditChange}
        onEditSave={onEditSave}
        onEditCancel={onEditCancel}
        isProcessing={isProcessing}
      />

      {teamSlot !== null && (
        <span className="app-status border-emerald-500 text-emerald-700 dark:text-emerald-300">
          Im Team · Platz {teamSlot}
        </span>
      )}

      {isKnockedOut && koInfo && (
        <span className="app-status border-red-500 text-red-600">
          K.O. · {koInfo.koCausedBy}
        </span>
      )}

      {isNotCaught && notCaughtInfo && (
        <span className="app-status border-amber-500 text-amber-600">
          Nicht gefangen · {notCaughtInfo.notCaughtBy}
        </span>
      )}

      {routeAverage && !isInactive && (
        <span className="app-status border-[var(--brand-blue)] text-[var(--brand-blue)]">
          Ø BP {routeAverage.total}
        </span>
      )}
    </div>
  );
}

interface StatusInfoBoxProps {
  type: 'ko' | 'notCaught';
  info: EncounterWithMeta;
}

const statusDateFormatter = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});

function StatusInfoBox({ type, info }: StatusInfoBoxProps) {
  const isKo = type === 'ko';
  const reason = isKo ? info.koReason : info.notCaughtReason;
  const colors = isKo
    ? { bg: 'bg-red-500/5', border: 'border-red-500', text: 'text-red-700 dark:text-red-300', icon: 'K.O.' }
    : { bg: 'bg-amber-500/5', border: 'border-amber-500', text: 'text-amber-700 dark:text-amber-300', icon: 'OFFEN' };

  return (
    <div className={`mb-4 ${colors.bg} border-l-4 ${colors.border} px-3 py-2 text-sm`}>
      <div className="flex items-start gap-2">
        <span className="text-xs font-black tracking-widest">{colors.icon}</span>
        <div className="flex-1">
          <p className={`${colors.text} font-bold`}>
            {isKo ? 'Diese Route ist K.O.' : 'Auf dieser Route wurde nicht gefangen'}
          </p>
          <p className={`${colors.text} mt-1`}>
            <strong>Verursacher:</strong> {isKo ? info.koCausedBy : info.notCaughtBy}
          </p>
          {reason ? (
            <p className={`${colors.text}`}>
              <strong>Grund:</strong> {reason}
            </p>
          ) : null}
          {(isKo ? info.koDate : info.notCaughtDate) && (
            <p className={`${colors.text} opacity-70 text-xs mt-1`}>
              {statusDateFormatter.format(new Date((isKo ? info.koDate : info.notCaughtDate)!))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

interface PokemonSearchInputProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filteredPokemon: PokemonListItem[];
  onSelect: (pokemonId: number) => void;
  isAdding: boolean;
}

function PokemonSearchInput({
  searchValue,
  onSearchChange,
  filteredPokemon,
  onSelect,
  isAdding,
}: PokemonSearchInputProps) {
  return (
    <div className="relative min-w-[160px]">
      <input
        type="text"
        placeholder="Pokemon suchen..."
        value={searchValue}
        onChange={(e) => onSearchChange(e.target.value)}
        disabled={isAdding}
        className="min-h-11 w-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]"
      />

      {searchValue && filteredPokemon.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto border border-[var(--border-default)] bg-[var(--card-bg-elevated)] shadow-lg">
          {filteredPokemon.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              disabled={isAdding}
              className="w-full px-3 py-2 text-left text-sm text-[var(--foreground)] hover:bg-[var(--background-secondary)] transition flex items-center gap-2 disabled:opacity-50"
            >
              <span className="text-[var(--text-secondary)]">#{p.pokedexId}</span>
              <span className="font-medium">{p.nameGerman || p.name}</span>
            </button>
          ))}
        </div>
      )}

      {searchValue && filteredPokemon.length === 0 && (
        <div className="absolute z-50 mt-1 w-full border border-[var(--border-default)] bg-[var(--card-bg-elevated)] p-3 shadow-lg">
          <p className="text-sm text-[var(--text-secondary)]">Kein Pokemon gefunden</p>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Haupt-Komponente
// =============================================================================

const RouteList = memo(function RouteList({
  routes,
  players,
  isAdmin = false,
  gameVersionKey = null,
  onTeamUpdate,
  pokemon = [],
  focusRouteId = null,
}: RouteListProps) {
  // State
  const [processing, setProcessing] = useState(false);
  const [addPokemonSearch, setAddPokemonSearch] = useState<Record<string, string>>({});
  const [addingPokemon, setAddingPokemon] = useState<Record<string, boolean>>({});
  
  // Route Edit State
  const [editingRouteId, setEditingRouteId] = useState<number | null>(null);
  const [editingRouteName, setEditingRouteName] = useState('');
  const occupiedTeamSlots = useMemo(() => getOccupiedTeamSlots(routes), [routes]);

  useEffect(() => {
    if (focusRouteId === null) return;
    const row = document.getElementById(`route-${focusRouteId}`);
    row?.scrollIntoView({ block: 'center', behavior: 'instant' });
    row?.querySelector('input')?.focus({ preventScroll: true });
  }, [focusRouteId]);

  // ==========================================================================
  // Handler
  // ==========================================================================

  const handleAddPokemon = async (routeId: number, playerId: number, pokemonId: number) => {
    const key = `${routeId}-${playerId}`;
    setAddingPokemon({ ...addingPokemon, [key]: true });
    try {
      await fetchJson('/api/admin/encounters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId, playerId, pokemonId }),
      });
      setAddPokemonSearch({ ...addPokemonSearch, [key]: '' });
      await onTeamUpdate?.(); // Warte auf Daten-Reload
    } catch (error) {
      alert(`Fehler beim Hinzufuegen: ${getErrorMessage(error)}`);
    } finally {
      setAddingPokemon({ ...addingPokemon, [key]: false });
    }
  };

  const handleAddToTeam = async (routeId: number, teamSlot: number) => {
    setProcessing(true);
    try {
      await mutateEncounterLink(routeId, { action: 'set-team-slot', teamSlot });
      await onTeamUpdate?.(); // Warte auf Daten-Reload
    } catch (error) {
      alert(`Fehler beim Hinzufügen zum Team: ${getErrorMessage(error)}`);
    } finally {
      setProcessing(false);
    }
  };

  // Route Edit Handlers
  const handleEditRouteStart = (route: Route) => {
    setEditingRouteId(route.id);
    setEditingRouteName(route.name);
  };

  const handleEditRouteSave = async () => {
    if (!editingRouteId || !editingRouteName.trim()) {
      setEditingRouteId(null);
      return;
    }

    const originalRoute = routes.find(r => r.id === editingRouteId);
    if (originalRoute && originalRoute.name === editingRouteName.trim()) {
      setEditingRouteId(null);
      return;
    }

    setProcessing(true);
    try {
      await fetchJson(`/api/admin/routes/${editingRouteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingRouteName.trim() }),
      });
      setEditingRouteId(null);
      await onTeamUpdate?.(); // Warte auf Daten-Reload
    } catch (error) {
      alert(`Fehler beim Umbenennen: ${getErrorMessage(error)}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleEditRouteCancel = () => {
    setEditingRouteId(null);
    setEditingRouteName('');
  };

  // Route Delete Handler
  const handleDeleteRoute = async (routeId: number, routeName: string) => {
    if (!confirm(`Route "${routeName}" wirklich loeschen?\n\nAlle Encounters dieser Route werden ebenfalls geloescht!`)) {
      return;
    }
    setProcessing(true);
    try {
      await fetchJson(`/api/admin/routes/${routeId}`, { method: 'DELETE' });
      await onTeamUpdate?.(); // Warte auf Daten-Reload
    } catch (error) {
      alert(`Fehler beim Loeschen: ${getErrorMessage(error)}`);
    } finally {
      setProcessing(false);
    }
  };

  // Route Move Handler (Verschieben nach oben/unten)
  const handleMoveRoute = async (routeId: number, direction: 'up' | 'down') => {
    const currentIndex = routes.findIndex(r => r.id === routeId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= routes.length) return;

    const currentRoute = routes[currentIndex];
    const targetRoute = routes[targetIndex];

    setProcessing(true);
    try {
      // Tausche die Order-Werte beider Routen
      await Promise.all([
        fetchJson(`/api/admin/routes/${currentRoute.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: currentRoute.name, order: targetRoute.order }),
        }),
        fetchJson(`/api/admin/routes/${targetRoute.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: targetRoute.name, order: currentRoute.order }),
        }),
      ]);
      await onTeamUpdate?.(); // Warte auf Daten-Reload
    } catch (error) {
      alert(`Fehler beim Verschieben: ${getErrorMessage(error)}`);
    } finally {
      setProcessing(false);
    }
  };

  // ==========================================================================
  // Render
  // ==========================================================================

  if (routes.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-[var(--text-secondary)] text-lg">
          Noch keine Routen vorhanden.{isAdmin ? ' Lege oben die erste Route an.' : ''}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="divide-y divide-[var(--border-default)] border-t border-[var(--border-default)]">
        {routes.map((route, routeIndex) => {
          const routeAverage = calculateAverageStats(route.encounters);
          const isKnockedOut = route.encounters.length > 0
            && route.encounters.every((encounter) => encounter.isKnockedOut);
          const isNotCaught = route.encounters.length > 0
            && route.encounters.every((encounter) => encounter.isNotCaught);
          const isInactive = isKnockedOut || isNotCaught;
          const koInfo = isKnockedOut ? route.encounters[0] : null;
          const notCaughtInfo = isNotCaught ? route.encounters[0] : null;
          const isEditingThisRoute = editingRouteId === route.id;
          const routeComparisonHref = buildRouteComparisonHref(route);
          const link: EncounterRouteLinkTarget = {
            route: { id: route.id, name: route.name },
            encounters: route.encounters.map((encounter) =>
              toEncounterAdminTarget(encounter, route),
            ),
            expectedPlayerCount: players.length,
            occupiedTeamSlots,
          };
          const linkState = getEncounterRouteLinkState(link);
          const canJoinTeam = linkState.canAssignToTeam && linkState.teamSlot === null;
          const nextTeamSlot = getNextTeamSlot(link);

          const cardHeight = 'h-[202px]';

          return (
            <div
              key={route.id}
              id={`route-${route.id}`}
              className={`route-list-row relative z-0 py-5 transition-colors hover:z-30 focus-within:z-30 ${isInactive ? 'bg-[var(--background-secondary)]/60' : ''}`}
            >
              {/* Header */}
              <div className="mb-4 flex flex-col items-stretch gap-3 px-3 sm:flex-row sm:items-center sm:justify-between">
                <RouteHeader
                  route={route}
                  isInactive={isInactive}
                  isKnockedOut={isKnockedOut}
                  isNotCaught={isNotCaught}
                  koInfo={koInfo}
                  notCaughtInfo={notCaughtInfo}
                  routeAverage={routeAverage}
                  teamSlot={typeof linkState.teamSlot === 'number' ? linkState.teamSlot : null}
                  isEditing={isEditingThisRoute}
                  editValue={editingRouteName}
                  onEditChange={setEditingRouteName}
                  onEditSave={handleEditRouteSave}
                  onEditCancel={handleEditRouteCancel}
                  isProcessing={processing}
                />

                {route.encounters.length > 0 || isAdmin ? (
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {isAdmin && canJoinTeam ? (
                      <button
                        type="button"
                        disabled={processing || nextTeamSlot === null}
                        onClick={() => {
                          if (nextTeamSlot !== null) void handleAddToTeam(route.id, nextTeamSlot);
                        }}
                        aria-label={nextTeamSlot !== null ? `${route.name} auf Platz ${nextTeamSlot} ins Team` : undefined}
                        className="app-action-primary disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {nextTeamSlot !== null ? 'Ins Team' : 'Team voll'}
                      </button>
                    ) : null}

                    {route.encounters.length > 0 ? (
                      <Link
                        href={routeComparisonHref ?? '/pokeradar'}
                        aria-label={`${route.name} im Vergleich öffnen`}
                        className="app-action"
                      >
                        Im Vergleich öffnen
                      </Link>
                    ) : null}

                    {isAdmin ? (
                      <RouteLinkActionMenu
                        link={link}
                        routeActions={{
                          onRename: () => handleEditRouteStart(route),
                          onMoveUp: () => { void handleMoveRoute(route.id, 'up'); },
                          onMoveDown: () => { void handleMoveRoute(route.id, 'down'); },
                          onDelete: () => { void handleDeleteRoute(route.id, route.name); },
                          canMoveUp: routeIndex > 0,
                          canMoveDown: routeIndex < routes.length - 1,
                        }}
                        triggerLabel="Route verwalten"
                        disabled={processing}
                        onUpdated={() => { void onTeamUpdate?.(); }}
                        onDeleted={() => { void onTeamUpdate?.(); }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Status-Info */}
              {isKnockedOut && koInfo && <StatusInfoBox type="ko" info={koInfo} />}
              {isNotCaught && notCaughtInfo && <StatusInfoBox type="notCaught" info={notCaughtInfo} />}

              {/* Encounters */}
              {/* Spalten brechen um statt zu scrollen: ein overflow-Container würde die Pokémon-Suche abschneiden. */}
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] border-l border-t border-[var(--border-default)]">
                {players.map((player) => {
                  const playerEncounters = route.encounters.filter((e) => e.player.id === player.id);
                  const hasEncounter = playerEncounters.length > 0;
                  const key = `${route.id}-${player.id}`;
                  const searchValue = addPokemonSearch[key] || '';
                  const filteredPokemon = filterPokemonBySearch(pokemon, searchValue);
                  const isAdding = addingPokemon[key] || false;

                  return (
                    <div key={player.id} className="border-b border-r border-[var(--border-default)] p-3">
                      <div className="mb-3 flex items-center gap-2 border-b-2 pb-2" style={{ borderColor: player.color }}>
                        {/* Avatar oder Farbe */}
                        <PlayerAvatar
                          avatar={player.avatar}
                          name={player.name}
                          color={player.color}
                          size={24}
                          className="h-6 w-6"
                        />
                        <h4 className="text-sm font-black uppercase text-[var(--foreground)]">{player.name}</h4>
                      </div>

                      {hasEncounter ? (
                        <div className="flex flex-wrap items-stretch gap-2">
                          {playerEncounters.map((encounter) => (
                            <div key={encounter.id} className="w-[132px] shrink-0">
                              <div className={`relative group ${cardHeight}`}>
                                {isAdmin ? (
                                  <div className="absolute right-1 top-1 z-20">
                                    <EncounterActionMenu
                                      encounter={toEncounterAdminTarget(encounter, route)}
                                      pokemonOptions={pokemon}
                                      gameVersionKey={gameVersionKey}
                                      compact
                                      disabled={processing}
                                      onUpdated={() => { void onTeamUpdate?.(); }}
                                    />
                                  </div>
                                ) : null}

                                {encounter.isKnockedOut || encounter.isNotCaught ? (
                                  <span className={`absolute left-1 top-1 z-10 rounded-full px-2 py-1 text-[10px] font-bold text-white ${encounter.isKnockedOut ? 'bg-red-600' : 'bg-amber-600'}`}>
                                    {encounter.isKnockedOut ? 'K.O.' : 'Nicht gefangen'}
                                  </span>
                                ) : null}
                                
                                <div className="route-pokemon-stat-shell h-full">
                                  <PokemonDetailsTrigger
                                    pokemon={{
                                      ...encounter.pokemon,
                                      displayName: encounter.nickname || encounter.pokemon.nameGerman || encounter.pokemon.name,
                                      types: parseTypes(encounter.pokemon.types),
                                    }}
                                    className={`block h-full w-full rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] [&>div]:cursor-inherit ${cardHeight} ${(encounter.isKnockedOut || encounter.isNotCaught) ? 'opacity-60' : ''}`}
                                  >
                                    <PokemonCard pokemon={encounter.pokemon} nickname={encounter.nickname} size="tiny" />
                                  </PokemonDetailsTrigger>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : isAdmin ? (
                        <PokemonSearchInput
                          searchValue={searchValue}
                          onSearchChange={(v) => setAddPokemonSearch({ ...addPokemonSearch, [key]: v })}
                          filteredPokemon={filteredPokemon}
                          onSelect={(pokemonId) => handleAddPokemon(route.id, player.id, pokemonId)}
                          isAdding={isAdding}
                        />
                      ) : (
                        <p className="text-[var(--text-tertiary)] text-sm italic min-w-[160px]">Noch kein Pokemon</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

    </>
  );
});

export default RouteList;
