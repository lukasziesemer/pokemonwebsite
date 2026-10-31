'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import EncounterActionMenu, {
  type EncounterActionMenuTarget,
} from '@/components/admin/EncounterActionMenu';
import {
  PokemonDetailsProvider,
  PokemonDetailsTrigger,
} from '@/components/pokemon-details';
import RouteLinkActionMenu from '@/components/admin/RouteLinkActionMenu';
import PlayerAvatar from '@/components/PlayerAvatar';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useSpriteMode } from '@/lib/contexts/SpriteContext';
import { fetchJson } from '@/lib/fetchJson';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';
import type { LiveUpdateTopic } from '@/lib/live-updates';
import type { PokemonListItem } from '@/lib/types';
import { getOccupiedTeamSlots } from '@/components/admin/route-link-ui';
import {
  compareRoutesByOrder,
  rowMatchesTableFilters,
  type EncounterStatusFilter,
  type TeamFilter,
} from './table-filters';

type PlayerInfo = {
  id: number;
  name: string;
  color: string;
  avatar: string | null;
};

type EncounterStatus = 'ko' | 'notCaught' | null;

type PlayerCell = {
  encounter: EncounterActionMenuTarget;
  types: string[];
  basePoints: number;
  status: EncounterStatus;
};

export type RouteRow = {
  id: number;
  name: string;
  order: number;
  players: (PlayerCell | null)[];
  averageBasePoints: number | null;
  status: EncounterStatus;
};

type SortKey = 'route' | 'average' | `player-${number}`;
type SortDirection = 'asc' | 'desc';

const TABLE_LIVE_TOPICS = ['encounters', 'routes', 'players', 'pokemon', 'runs'] as const;

interface TabelleClientProps {
  players: PlayerInfo[];
  rows: RouteRow[];
  currentGameVersion: { key: string; name: string } | null;
  initialTeamFilter?: TeamFilter;
  initialStatusFilter?: EncounterStatusFilter;
}

const TYPE_TRANSLATIONS: Record<string, string> = {
  normal: 'Normal',
  fire: 'Feuer',
  water: 'Wasser',
  electric: 'Elektro',
  grass: 'Pflanze',
  ice: 'Eis',
  fighting: 'Kampf',
  poison: 'Gift',
  ground: 'Boden',
  flying: 'Flug',
  psychic: 'Psycho',
  bug: 'Käfer',
  rock: 'Gestein',
  ghost: 'Geist',
  dragon: 'Drache',
  dark: 'Unlicht',
  steel: 'Stahl',
  fairy: 'Fee',
};

function getEncounterStatus(encounter: EncounterActionMenuTarget): EncounterStatus {
  if (encounter.isKnockedOut) return 'ko';
  if (encounter.isNotCaught) return 'notCaught';
  return null;
}

function getRowStatus(cells: (PlayerCell | null)[]): EncounterStatus {
  if (cells.some((cell) => cell?.encounter.isKnockedOut)) return 'ko';
  if (cells.some((cell) => cell?.encounter.isNotCaught)) return 'notCaught';
  return null;
}

function SortIndicator({ direction }: { direction: SortDirection }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={`h-3 w-3 transition-transform ${direction === 'desc' ? 'rotate-180' : ''}`}
      fill="currentColor"
    >
      <path d="M6 2 10 7H2l4-5Z" />
    </svg>
  );
}

export default function TabelleClient({
  players,
  rows,
  currentGameVersion,
  initialTeamFilter = 'all',
  initialStatusFilter = 'all',
}: TabelleClientProps) {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { spriteMode } = useSpriteMode();
  const [isRefreshing, startRefresh] = useTransition();
  const [tableRows, setTableRows] = useState(rows);
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'route',
    direction: 'asc',
  });
  const [teamFilter, setTeamFilter] = useState<TeamFilter>(initialTeamFilter);
  const [statusFilter, setStatusFilter] = useState<EncounterStatusFilter>(initialStatusFilter);
  const [pokemonOptions, setPokemonOptions] = useState<PokemonListItem[] | null>(null);
  const [pokemonOptionsLoading, setPokemonOptionsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const pokemonOptionsRequest = useRef<Promise<void> | null>(null);
  const pokemonOptionsGeneration = useRef(0);
  const [syncedRows, setSyncedRows] = useState(rows);
  const [syncedIsAdmin, setSyncedIsAdmin] = useState(isAdmin);

  // Neue Server-Daten (router.refresh) ersetzen den lokalen Stand.
  if (syncedRows !== rows) {
    setSyncedRows(rows);
    setTableRows(rows);
  }

  if (syncedIsAdmin !== isAdmin) {
    setSyncedIsAdmin(isAdmin);
    if (!isAdmin) {
      setPokemonOptions(null);
      setPokemonOptionsLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) return;
    pokemonOptionsGeneration.current += 1;
    pokemonOptionsRequest.current = null;
  }, [isAdmin]);

  const refreshTable = useCallback(() => {
    startRefresh(() => router.refresh());
  }, [router]);

  const refreshLiveTable = useCallback((changedTopics: ReadonlySet<LiveUpdateTopic>) => {
    if (changedTopics.has('pokemon')) {
      pokemonOptionsGeneration.current += 1;
      setPokemonOptions(null);
      setPokemonOptionsLoading(false);
      pokemonOptionsRequest.current = null;
    }
    refreshTable();
  }, [refreshTable]);

  useLiveRefresh(TABLE_LIVE_TOPICS, refreshLiveTable);

  const loadPokemonOptions = useCallback(() => {
    if (!isAdmin || pokemonOptions || pokemonOptionsRequest.current) return;

    setPokemonOptionsLoading(true);
    setActionMessage(null);
    const generation = pokemonOptionsGeneration.current;
    const request = fetchJson<{ data?: PokemonListItem[] }>(
      '/api/admin/pokemon/options',
      { cache: 'no-store' },
    )
      .then((payload) => {
        if (generation === pokemonOptionsGeneration.current) {
          setPokemonOptions(payload.data ?? []);
        }
      })
      .catch((error: unknown) => {
        setActionMessage(
          error instanceof Error
            ? error.message
            : 'Pokémon-Auswahl konnte nicht geladen werden.',
        );
      })
      .finally(() => {
        if (pokemonOptionsRequest.current === request) {
          setPokemonOptionsLoading(false);
          pokemonOptionsRequest.current = null;
        }
      });

    pokemonOptionsRequest.current = request;
  }, [isAdmin, pokemonOptions]);

  const handleSort = (key: SortKey) => {
    setSort((previous) => {
      if (previous.key === key) {
        return {
          key,
          direction: previous.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      return { key, direction: 'asc' };
    });
  };

  const handleUpdated = useCallback((updated: EncounterActionMenuTarget) => {
    setTableRows((currentRows) =>
      currentRows.map((row) => {
        let changed = false;
        const nextCells = row.players.map((cell) => {
          if (!cell || cell.encounter.id !== updated.id) return cell;
          changed = true;
          // Der kompakte Mutationsvertrag enthält bewusst keine Basiswerte
          // oder Typen. Bei einem Pokémon-Tausch bleibt die alte Zelle daher
          // geschlossen konsistent, bis router.refresh() alle Werte ersetzt.
          if (cell.encounter.pokemon.id !== updated.pokemon.id) return cell;
          return {
            ...cell,
            encounter: updated,
            status: getEncounterStatus(updated),
          };
        });

        return changed
          ? { ...row, players: nextCells, status: getRowStatus(nextCells) }
          : row;
      }),
    );
    setActionMessage('Änderung gespeichert. Die Tabelle wird aktualisiert.');
    refreshTable();
  }, [refreshTable]);

  const handleRouteUpdated = useCallback((updatedEncounters: EncounterActionMenuTarget[]) => {
    const updatesById = new Map(
      updatedEncounters.map((encounter) => [encounter.id, encounter]),
    );

    setTableRows((currentRows) =>
      currentRows.map((row) => {
        let changed = false;
        const nextCells = row.players.map((cell) => {
          if (!cell) return cell;
          const updated = updatesById.get(cell.encounter.id);
          if (!updated) return cell;
          changed = true;
          return {
            ...cell,
            encounter: updated,
            status: getEncounterStatus(updated),
          };
        });

        return changed
          ? {
              ...row,
              players: nextCells,
              status: getRowStatus(nextCells),
            }
          : row;
      }),
    );
    setActionMessage(
      `${updatedEncounters.length} Pokémon der Route aktualisiert. Die Tabelle wird neu abgeglichen.`,
    );
    refreshTable();
  }, [refreshTable]);

  const handleRouteDeleted = useCallback((routeId: number) => {
    setTableRows((currentRows) =>
      currentRows.map((row) =>
        row.id === routeId
          ? {
              ...row,
              players: row.players.map(() => null),
              averageBasePoints: null,
              status: null,
            }
          : row,
      ),
    );
    setActionMessage('Alle Encounter-Zuordnungen der Route wurden gelöscht.');
    refreshTable();
  }, [refreshTable]);

  const visibleRows = useMemo(() => {
    const filtered = tableRows.filter((row) =>
      rowMatchesTableFilters(row.players, teamFilter, statusFilter),
    );
    const multiplier = sort.direction === 'asc' ? 1 : -1;

    return [...filtered].sort((left, right) => {
      if (sort.key === 'route') {
        return compareRoutesByOrder(left, right) * multiplier;
      }
      if (sort.key === 'average') {
        return (
          ((left.averageBasePoints ?? -Infinity) -
            (right.averageBasePoints ?? -Infinity)) *
          multiplier
        );
      }

      const playerIndex = Number.parseInt(sort.key.split('-')[1], 10);
      const leftCell = left.players[playerIndex];
      const rightCell = right.players[playerIndex];
      const leftValue = leftCell?.basePoints ?? -Infinity;
      const rightValue = rightCell?.basePoints ?? -Infinity;

      if (leftValue === rightValue) {
        const leftName = leftCell
          ? leftCell.encounter.pokemon.nameGerman || leftCell.encounter.pokemon.name
          : '';
        const rightName = rightCell
          ? rightCell.encounter.pokemon.nameGerman || rightCell.encounter.pokemon.name
          : '';
        return leftName.localeCompare(rightName, 'de-DE') * multiplier;
      }

      return (leftValue - rightValue) * multiplier;
    });
  }, [sort, statusFilter, tableRows, teamFilter]);

  const occupiedTeamSlots = useMemo(
    () => getOccupiedTeamSlots(tableRows.map((row) => ({
      id: row.id,
      name: row.name,
      encounters: row.players.flatMap((cell) => (cell ? [cell.encounter] : [])),
    }))),
    [tableRows],
  );

  const hasFilters = teamFilter !== 'all' || statusFilter !== 'all';

  const renderPlayerCell = (cell: PlayerCell | null) => {
    if (!cell) return <span className="text-[var(--text-tertiary)]">–</span>;

    const { encounter } = cell;
    const pokemonName = encounter.pokemon.nameGerman || encounter.pokemon.name;
    const displayName = encounter.nickname || pokemonName;
    const typeText = cell.types
      .map((type) => {
        const normalized = type.toLowerCase();
        return TYPE_TRANSLATIONS[normalized] || type;
      })
      .join(' / ');
    const displaySpriteUrl =
      spriteMode === 'animated' && encounter.pokemon.spriteGifUrl
        ? encounter.pokemon.spriteGifUrl
        : encounter.pokemon.spriteUrl;

    return (
      <div className="flex min-w-56 items-center justify-between gap-2">
        <PokemonDetailsTrigger
          pokemon={{
            pokedexId: encounter.pokemon.pokedexId,
            name: encounter.pokemon.name,
            nameGerman: encounter.pokemon.nameGerman,
            displayName,
            spriteUrl: encounter.pokemon.spriteUrl,
            spriteGifUrl: encounter.pokemon.spriteGifUrl,
            types: cell.types,
          }}
          className="flex min-w-0 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
        >
          {displaySpriteUrl ? (
            <Image
              src={displaySpriteUrl}
              alt=""
              width={52}
              height={52}
              className="h-14 w-14 shrink-0 object-contain"
              unoptimized={spriteMode === 'animated'}
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center border border-[var(--border-default)] bg-[var(--background-secondary)] text-xs font-bold text-[var(--text-secondary)]">
              #{encounter.pokemon.pokedexId}
            </span>
          )}
          <div className="min-w-0">
            <span className="block truncate font-black uppercase leading-tight text-[var(--foreground)]">
              {displayName}
            </span>
            {encounter.nickname ? (
              <span className="block truncate text-xs text-[var(--text-secondary)]">
                {pokemonName}
              </span>
            ) : null}
            {typeText ? (
              <span className="block text-sm text-[var(--text-secondary)]">{typeText}</span>
            ) : null}
            <span className="block text-sm font-black tabular-nums text-[var(--brand-blue)]">
              {cell.basePoints} BP
            </span>
            <div className="mt-1 flex flex-wrap gap-1">
              {encounter.isKnockedOut ? (
                <span className="app-status border-red-500 text-red-600">
                  K.O.
                </span>
              ) : encounter.isNotCaught ? (
                <span className="app-status border-amber-500 text-amber-600">
                  Nicht gefangen
                </span>
              ) : (
                <span className="app-status border-emerald-500 text-emerald-700 dark:text-emerald-300">
                  Aktiv
                </span>
              )}
              <span className="app-status text-[var(--text-secondary)]">
                {encounter.teamSlot !== null
                  ? `Im Team · Platz ${encounter.teamSlot}`
                  : 'Nicht im Team'}
              </span>
            </div>
          </div>
        </PokemonDetailsTrigger>

        {isAdmin ? (
          <div
            className="shrink-0"
            onPointerEnter={loadPokemonOptions}
            onPointerDownCapture={loadPokemonOptions}
            onFocusCapture={loadPokemonOptions}
          >
            <EncounterActionMenu
              encounter={encounter}
              pokemonOptions={pokemonOptions ?? []}
              pokemonOptionsLoading={pokemonOptionsLoading}
              gameVersionKey={currentGameVersion?.key ?? null}
              onUpdated={handleUpdated}
              onError={setActionMessage}
              compact
              disabled={isRefreshing}
            />
          </div>
        ) : null}
      </div>
    );
  };

  const getRowHighlight = (status: EncounterStatus) => {
    if (status === 'ko') return 'bg-red-500/5';
    if (status === 'notCaught') return 'bg-amber-500/5';
    return '';
  };

  return (
    <PokemonDetailsProvider
      gameVersionKey={currentGameVersion?.key ?? null}
      gameVersionName={currentGameVersion?.name ?? null}
    >
    <div>
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="encounter-table-title" className="app-section-title">Encounter-Tabelle</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {visibleRows.length} von {tableRows.length} Routen sichtbar
              {isAdmin
                ? ' · Routenaktionen stehen in der ersten Spalte, Pokémon-Tausch und Spitzname direkt in den Zellen bereit'
                : ''}
            </p>
          </div>
          {isRefreshing || pokemonOptionsLoading ? (
            <p className="text-xs font-medium text-blue-600 dark:text-blue-400" aria-live="polite">
              {isRefreshing ? 'Tabelle wird aktualisiert…' : 'Pokémon-Auswahl wird geladen…'}
            </p>
          ) : null}
        </div>

        <div className="app-toolbar">
          <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1.5 text-sm font-medium text-[var(--foreground)]">
              Teamstatus
              <select
                value={teamFilter}
                onChange={(event) => setTeamFilter(event.target.value as TeamFilter)}
                className="h-11 border border-[var(--border-default)] bg-[var(--card-bg)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
              >
                <option value="all">Alle Teamzustände</option>
                <option value="in-team">Im Team</option>
                <option value="not-in-team">Nicht im Team</option>
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-[var(--foreground)]">
              Encounter-Status
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as EncounterStatusFilter)
                }
                className="h-11 border border-[var(--border-default)] bg-[var(--card-bg)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
              >
                <option value="all">Alle Status</option>
                <option value="active">Aktiv</option>
                <option value="knocked-out">K.O.</option>
                <option value="not-caught">Nicht gefangen</option>
              </select>
            </label>
            <button
              type="button"
              disabled={!hasFilters}
              onClick={() => {
                setTeamFilter('all');
                setStatusFilter('all');
              }}
              className="app-action h-11 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40"
            >
              Filter zurücksetzen
            </button>
            <p className="text-xs text-[var(--text-secondary)] sm:col-span-3">
              Eine Route bleibt sichtbar, wenn mindestens ein Encounter beide Filter erfüllt.
            </p>
          </div>
        </div>

        {actionMessage ? (
          <p
            role="status"
            className="border-l-4 border-[var(--brand-blue)] bg-blue-500/5 px-3 py-2 text-sm text-[var(--brand-blue)]"
          >
            {actionMessage}
          </p>
        ) : null}
      </div>

      <p className="mb-2 text-xs text-[var(--text-secondary)] sm:hidden">
        Die Tabelle kann horizontal gescrollt werden.
      </p>
      <div className="-mx-3 overflow-x-auto border-y border-[var(--border-default)] sm:mx-0">
        <table className="app-data-table min-w-[64rem] w-full text-left">
          <caption className="sr-only">
            Encounters nach Route und Spieler mit Team- und Encounter-Status
          </caption>
          <thead className="bg-[var(--brand-navy)] text-white">
            <tr className="border-b border-[var(--border-default)]">
              <th
                scope="col"
                aria-sort={sort.key === 'route' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="sticky left-0 z-20 min-w-40 bg-[var(--brand-navy)] px-4 py-3"
              >
                <button
                  type="button"
                  onClick={() => handleSort('route')}
                  className="flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:text-[var(--brand-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Route
                  {sort.key === 'route' ? <SortIndicator direction={sort.direction} /> : null}
                </button>
              </th>
              {players.map((player, index) => {
                return (
                <th
                  key={player.id}
                  scope="col"
                  aria-sort={sort.key === `player-${index}` ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  className="min-w-64 px-4 py-3"
                >
                  <button
                    type="button"
                    onClick={() => handleSort(`player-${index}`)}
                  className="flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:text-[var(--brand-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <PlayerAvatar
                      avatar={player.avatar}
                      name={player.name}
                      color={player.color}
                      size={24}
                      className="h-6 w-6"
                    />
                    <span>{player.name}</span>
                    {sort.key === `player-${index}` ? (
                      <SortIndicator direction={sort.direction} />
                    ) : null}
                  </button>
                </th>
                );
              })}
              <th
                scope="col"
                aria-sort={sort.key === 'average' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                className="min-w-48 px-4 py-3 text-right"
              >
                <button
                  type="button"
                  onClick={() => handleSort('average')}
                  className="ml-auto flex min-h-11 items-center gap-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:text-[var(--brand-gold)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  Durchschnitt Gesamt-BP
                  {sort.key === 'average' ? <SortIndicator direction={sort.direction} /> : null}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={players.length + 2}
                  className="px-4 py-10 text-center text-[var(--text-secondary)]"
                >
                  Keine Encounters entsprechen den gewählten Filtern.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-[var(--border-default)] transition-colors last:border-b-0 hover:bg-[var(--background-secondary)] ${getRowHighlight(row.status)}`}
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r border-[var(--border-default)] bg-[var(--card-bg)] px-4 py-3 text-left font-black uppercase text-[var(--foreground)]"
                  >
                    <div className="flex min-w-36 items-center justify-between gap-2">
                      <span>{row.name}</span>
                      {isAdmin ? (
                        <RouteLinkActionMenu
                          link={{
                            route: { id: row.id, name: row.name },
                            encounters: row.players.flatMap((cell) =>
                              cell ? [cell.encounter] : [],
                            ),
                            expectedPlayerCount: players.length,
                            occupiedTeamSlots,
                          }}
                          onUpdated={handleRouteUpdated}
                          onDeleted={handleRouteDeleted}
                          onError={setActionMessage}
                          triggerLabel="Route"
                          disabled={isRefreshing}
                        />
                      ) : null}
                    </div>
                  </th>
                  {row.players.map((cell, index) => (
                    <td key={`${row.id}-player-${index}`} className="px-4 py-3 align-top">
                      {renderPlayerCell(cell)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right align-middle text-lg font-black tabular-nums text-[var(--brand-blue)]">
                    {row.averageBasePoints !== null
                      ? Math.round(row.averageBasePoints)
                      : '–'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </PokemonDetailsProvider>
  );
}
