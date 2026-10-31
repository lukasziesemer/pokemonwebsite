/**
 * Vergleich aller Encounters nach Route und Spielern.
 * Die Admin-Zieldaten bleiben bewusst pro Encounter kompakt; die große
 * Pokémon-Auswahlliste wird erst nach einer Admin-Interaktion geladen.
 */

import TabelleClient, { type RouteRow } from './TabelleClient';
import { parseStatusFilter, parseTeamFilter } from './table-filters';
import AppPageTitle from '@/components/layout/AppPageTitle';
import { getCurrentGameVersion } from '@/lib/current-game';
import prisma from '@/lib/prisma';
import { parseTypes } from '@/lib/typeEffectiveness';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PlayerInfo = {
  id: number;
  name: string;
  color: string;
  avatar: string | null;
};

type EncounterStatus = 'ko' | 'notCaught' | null;

async function getTableData(): Promise<{
  players: PlayerInfo[];
  rows: RouteRow[];
}> {
  try {
    const [players, routes] = await Promise.all([
      prisma.player.findMany({
        select: {
          id: true,
          name: true,
          color: true,
          avatar: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.route.findMany({
        select: {
          id: true,
          name: true,
          order: true,
          encounters: {
            select: {
              id: true,
              nickname: true,
              teamSlot: true,
              isKnockedOut: true,
              koCausedBy: true,
              koReason: true,
              koDate: true,
              isNotCaught: true,
              notCaughtBy: true,
              notCaughtReason: true,
              notCaughtDate: true,
              playerId: true,
              player: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                },
              },
              pokemon: {
                select: {
                  id: true,
                  pokedexId: true,
                  name: true,
                  nameGerman: true,
                  types: true,
                  hp: true,
                  attack: true,
                  defense: true,
                  spAttack: true,
                  spDefense: true,
                  speed: true,
                  spriteUrl: true,
                  spriteGifUrl: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { order: 'asc' },
      }),
    ]);

    const rows: RouteRow[] = routes.map((route) => {
      let rowStatus: EncounterStatus = null;

      const playerCells = players.map((player) => {
        const encounter = route.encounters.find(
          (candidate) => candidate.playerId === player.id,
        );

        if (!encounter) return null;

        const { pokemon } = encounter;
        const status: EncounterStatus = encounter.isKnockedOut
          ? 'ko'
          : encounter.isNotCaught
            ? 'notCaught'
            : null;

        if (status === 'ko') {
          rowStatus = 'ko';
        } else if (status === 'notCaught' && rowStatus !== 'ko') {
          rowStatus = 'notCaught';
        }

        return {
          encounter: {
            id: encounter.id,
            nickname: encounter.nickname,
            teamSlot: encounter.teamSlot,
            isKnockedOut: encounter.isKnockedOut,
            koCausedBy: encounter.koCausedBy,
            koReason: encounter.koReason,
            koDate: encounter.koDate?.toISOString() ?? null,
            isNotCaught: encounter.isNotCaught,
            notCaughtBy: encounter.notCaughtBy,
            notCaughtReason: encounter.notCaughtReason,
            notCaughtDate: encounter.notCaughtDate?.toISOString() ?? null,
            player: encounter.player,
            route: {
              id: route.id,
              name: route.name,
            },
            pokemon: {
              id: pokemon.id,
              pokedexId: pokemon.pokedexId,
              name: pokemon.name,
              nameGerman: pokemon.nameGerman,
              spriteUrl: pokemon.spriteUrl,
              spriteGifUrl: pokemon.spriteGifUrl,
            },
          },
          types: parseTypes(pokemon.types),
          basePoints:
            pokemon.hp +
            pokemon.attack +
            pokemon.defense +
            pokemon.spAttack +
            pokemon.spDefense +
            pokemon.speed,
          status,
        };
      });

      const basePointValues = playerCells
        .map((cell) => cell?.basePoints)
        .filter((value): value is number => typeof value === 'number');

      const averageBasePoints =
        basePointValues.length > 0
          ? basePointValues.reduce((sum, value) => sum + value, 0) /
            basePointValues.length
          : null;

      return {
        id: route.id,
        name: route.name,
        order: route.order,
        players: playerCells,
        averageBasePoints,
        status: rowStatus,
      };
    });

    return { players, rows };
  } catch (error) {
    console.error('Error building table data:', error);
    return { players: [], rows: [] };
  }
}

export default async function TabellePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; status?: string }>;
}) {
  const { team, status } = await searchParams;
  const [data, currentGameVersion] = await Promise.all([
    getTableData(),
    getCurrentGameVersion(),
  ]);

  return (
    <main className="app-page">
      <header className="app-page-header">
        <AppPageTitle
          index="04"
          title="Tabelle"
          description="Alle gefangenen Pokémon im direkten Routenvergleich – mit Teamstatus, Typen und Gesamt-BP."
        />
        <dl className="grid shrink-0 grid-cols-2 divide-x divide-[var(--border-default)] border-y border-[var(--border-default)] text-right">
          <div className="px-4 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Routen</dt>
            <dd className="text-2xl font-black tabular-nums text-[var(--brand-blue)]">{data.rows.length}</dd>
          </div>
          <div className="px-4 py-2">
            <dt className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-secondary)]">Spieler</dt>
            <dd className="text-2xl font-black tabular-nums text-[var(--brand-red)]">{data.players.length}</dd>
          </div>
        </dl>
      </header>

      <section className="app-section" aria-labelledby="encounter-table-title">
        <TabelleClient
          players={data.players}
          rows={data.rows}
          initialTeamFilter={parseTeamFilter(team)}
          initialStatusFilter={parseStatusFilter(status)}
          currentGameVersion={currentGameVersion
            ? { key: currentGameVersion.key, name: currentGameVersion.name }
            : null}
        />
      </section>
    </main>
  );
}
