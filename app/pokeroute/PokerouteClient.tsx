'use client';

/**
 * Client-Komponente für Pokeroute mit Admin-Funktionalität
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import TeamDisplay from '@/components/TeamDisplay';
import RouteList from '@/components/RouteList';
import PlayerAvatar from '@/components/PlayerAvatar';
import AppPageTitle from '@/components/layout/AppPageTitle';
import { PokemonDetailsProvider } from '@/components/pokemon-details';
import { fetchJson } from '@/lib/fetchJson';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useLiveRefresh } from '@/lib/hooks/useLiveRefresh';

const ROUTE_DATA_TOPICS = ['encounters', 'routes', 'players'] as const;
const ROUTE_POKEMON_TOPICS = ['pokemon'] as const;

interface PlayerEncounter {
  id: number;
  teamSlot: number | null;
  nickname: string | null;
  pokemon: {
    id: number;
    pokedexId: number;
    name: string;
    nameGerman: string | null;
    types: string;
    spriteUrl: string | null;
    spriteGifUrl: string | null;
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
  route: {
    id: number;
    name: string;
  };
}

interface Player {
  id: number;
  name: string;
  color: string;
  avatar: string | null;
  encounters: PlayerEncounter[];
}

interface RouteEncounterMeta {
  id: number;
  nickname: string | null;
  teamSlot: number | null;
  isKnockedOut: boolean;
  koCausedBy: string | null;
  koReason: string | null;
  koDate: string | null;
  isNotCaught: boolean;
  notCaughtBy: string | null;
  notCaughtReason: string | null;
  notCaughtDate: string | null;
  player: {
    id: number;
    name: string;
    color: string;
  };
  pokemon: {
    id: number;
    pokedexId: number;
    name: string;
    nameGerman: string | null;
    types: string;
    spriteUrl: string | null;
    spriteGifUrl: string | null;
    hp: number;
    attack: number;
    defense: number;
    spAttack: number;
    spDefense: number;
    speed: number;
  };
}

interface RouteListRoute {
  id: number;
  name: string;
  order: number;
  encounters: RouteEncounterMeta[];
}

interface Pokemon {
  id: number;
  pokedexId: number;
  name: string;
  nameGerman: string | null;
}

interface PokerouteClientProps {
  initialPlayers: Player[];
  initialRoutes: RouteListRoute[];
  currentGameVersion: { key: string; name: string } | null;
}

const NO_POKEMON: Pokemon[] = [];

export default function PokerouteClient({
  initialPlayers,
  initialRoutes,
  currentGameVersion,
}: PokerouteClientProps) {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [routes, setRoutes] = useState<RouteListRoute[]>(initialRoutes);
  const { isAdmin } = useAuth();
  const [newRouteName, setNewRouteName] = useState('');
  const [isCreatingRoute, setIsCreatingRoute] = useState(false);
  const [loadedPokemon, setLoadedPokemon] = useState<Pokemon[]>([]);
  const [pokemonReloadToken, setPokemonReloadToken] = useState(0);
  const [syncedProps, setSyncedProps] = useState({ initialPlayers, initialRoutes });

  // Neue Server-Daten (router.refresh) ersetzen den lokalen Stand.
  if (syncedProps.initialPlayers !== initialPlayers || syncedProps.initialRoutes !== initialRoutes) {
    setSyncedProps({ initialPlayers, initialRoutes });
    setPlayers(initialPlayers);
    setRoutes(initialRoutes);
  }

  // Pokémon-Daten werden nur für eingeloggte Admins benötigt.
  const pokemon = isAdmin ? loadedPokemon : NO_POKEMON;

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;
    fetchJson<{ pokemon: Pokemon[] }>('/api/pokemon')
      .then((pokemonData) => {
        if (!cancelled) {
          setLoadedPokemon(pokemonData.pokemon || []);
        }
      })
      .catch((err) => {
        console.error('Error loading pokemon:', err);
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin, pokemonReloadToken]);

  // Daten neu laden (wird auch von anderen Funktionen verwendet)
  const reloadData = useCallback(async () => {
    try {
      const [playersData, routesData] = await Promise.all([
        fetchJson<Player[]>('/api/players', { cache: 'no-store' }),
        fetchJson<RouteListRoute[]>('/api/routes', { cache: 'no-store' }),
      ]);

      setPlayers(playersData);
      setRoutes(routesData);
    } catch (error) {
      console.error('Error reloading data:', error);
    }
  }, []); // Keine Dependencies, da setState stabil ist

  const reloadPokemon = useCallback(() => {
    setPokemonReloadToken((token) => token + 1);
  }, []);

  useLiveRefresh(ROUTE_DATA_TOPICS, reloadData);
  useLiveRefresh(ROUTE_POKEMON_TOPICS, reloadPokemon);
  useLiveRefresh(['runs'], () => router.refresh());

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : 'Unbekannter Fehler';

  // Neue Route erstellen
  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouteName.trim()) return;

    setIsCreatingRoute(true);
    try {
      // Berechne die nächste Order-Nummer
      const maxOrder = routes.length > 0 
        ? Math.max(...routes.map(r => r.order)) 
        : 0;

      await fetchJson('/api/admin/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: newRouteName.trim(),
          order: maxOrder + 1,
        }),
      });
      setNewRouteName('');
      await reloadData();
    } catch (error: unknown) {
      alert(`Fehler beim Erstellen: ${getErrorMessage(error)}`);
    } finally {
      setIsCreatingRoute(false);
    }
  };

  const encounterCount = routes.reduce(
    (total, route) => total + route.encounters.length,
    0,
  );

  return (
    <PokemonDetailsProvider
      gameVersionKey={currentGameVersion?.key ?? null}
      gameVersionName={currentGameVersion?.name ?? null}
    >
    <main className="app-page">
      <header className="app-page-header">
        <AppPageTitle
          index="02"
          title="Routen"
          description="Encounter-Links verwalten, Fänge erfassen und verbundene Pokémon gemeinsam aktualisieren."
        />
        <dl className="grid shrink-0 grid-cols-2 divide-x divide-[var(--border-default)] border-y border-[var(--border-default)] text-right">
          <div className="px-4 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Routen</dt>
            <dd className="text-2xl font-black tabular-nums text-[var(--brand-blue)]">{routes.length}</dd>
          </div>
          <div className="px-4 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Encounters</dt>
            <dd className="text-2xl font-black tabular-nums text-[var(--brand-red)]">{encounterCount}</dd>
          </div>
        </dl>
      </header>

      <section className="app-section" aria-labelledby="team-overview-title">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b-2 border-[var(--foreground)] pb-2">
          <div>
            <h2 id="team-overview-title" className="app-section-title">Aktuelle Teams</h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Alle Mitspieler und Teamplätze auf einen Blick.</p>
          </div>
          <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-secondary)]">{players.length} Spieler</span>
        </div>

        {players.length === 0 ? (
          <p className="py-10 text-center text-[var(--text-secondary)]">
            Noch keine Spieler vorhanden. Admins können Spieler im Adminbereich hinzufügen.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border-default)]">
            {players.map((player) => (
              <article key={player.id} className="grid gap-4 py-5 lg:grid-cols-[12rem_minmax(0,1fr)]">
                <div className="app-player-rule flex items-center gap-3 self-start py-2" style={{ '--player-color': player.color } as React.CSSProperties}>
                  <PlayerAvatar avatar={player.avatar} name={player.name} color={player.color} size={36} className="h-9 w-9" />
                  <div>
                    <h3 className="text-xl font-black uppercase leading-none" style={{ color: player.color }}>{player.name}</h3>
                    <span className="mt-1 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Teamaufstellung</span>
                  </div>
                </div>
                <TeamDisplay
                  playerId={player.id}
                  playerName={player.name}
                  playerColor={player.color}
                  teamMembers={player.encounters}
                  routes={routes}
                  isAdmin={isAdmin}
                  gameVersionKey={currentGameVersion?.key ?? null}
                  onUpdated={reloadData}
                  pokemon={pokemon}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="app-section" aria-labelledby="route-management-title">
        <div className="mb-4 border-b-2 border-[var(--foreground)] pb-2">
          <h2 id="route-management-title" className="app-section-title">Routen &amp; Encounters</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Jede Zeile ist ein gemeinsamer Link. Änderungen am Status oder Teamplatz gelten für die ganze Gruppe.
          </p>
        </div>

        <div className="app-band">
          <RouteList
            routes={routes}
            players={players}
            isAdmin={isAdmin}
            gameVersionKey={currentGameVersion?.key ?? null}
            onTeamUpdate={reloadData}
            pokemon={pokemon}
          />
          {isAdmin ? (
            <form onSubmit={handleCreateRoute} className="app-toolbar mt-4">
              <label htmlFor="new-route-name" className="text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">Neue Route</label>
              <input
                id="new-route-name"
                type="text"
                value={newRouteName}
                onChange={(event) => setNewRouteName(event.target.value)}
                placeholder="Routenname eingeben"
                className="min-h-11 min-w-0 flex-1 border border-[var(--border-default)] bg-[var(--card-bg)] px-3 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
                disabled={isCreatingRoute}
              />
              <button type="submit" disabled={isCreatingRoute || !newRouteName.trim()} className="app-action-primary">
                {isCreatingRoute ? 'Erstellt…' : 'Route erstellen'}
              </button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
    </PokemonDetailsProvider>
  );
}

