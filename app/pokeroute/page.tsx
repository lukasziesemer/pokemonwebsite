/**
 * Pokeroute Page
 * Zeigt aktuelle Teams und Routen mit Encounters
 */

import PokerouteClient, { type RouteRunNotice } from './PokerouteClient';
import { getCurrentGameVersion } from '@/lib/current-game';
import prisma from '@/lib/prisma';

async function getPlayers() {
  try {
    const players = await prisma.player.findMany({
      include: {
        encounters: {
          where: {
            teamSlot: { not: null }, // Nur Encounters im Team
          },
          include: {
            pokemon: true,
            route: true,
          },
          orderBy: {
            teamSlot: 'asc',
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return players;
  } catch (error) {
    console.error('Error fetching players:', error);
    return [];
  }
}

async function getRoutes() {
  try {
    const routes = await prisma.route.findMany({
      include: {
        encounters: {
          include: {
            player: true,
            pokemon: true,
          },
        },
      },
      orderBy: { order: 'asc' },
    });
    
    // Serialize für Client-Komponente
    return routes.map((route) => ({
      id: route.id,
      name: route.name,
      order: route.order,
      encounters: route.encounters.map((e) => ({
        id: e.id,
        nickname: e.nickname,
        teamSlot: e.teamSlot,
        isKnockedOut: e.isKnockedOut,
        koCausedBy: e.koCausedBy,
        koReason: e.koReason,
        koDate: e.koDate ? e.koDate.toISOString() : null,
        isNotCaught: e.isNotCaught,
        notCaughtBy: e.notCaughtBy,
        notCaughtReason: e.notCaughtReason,
        notCaughtDate: e.notCaughtDate ? e.notCaughtDate.toISOString() : null,
        player: {
          id: e.player.id,
          name: e.player.name,
          color: e.player.color,
        },
        pokemon: {
          id: e.pokemon.id,
          pokedexId: e.pokemon.pokedexId,
          name: e.pokemon.name,
          nameGerman: e.pokemon.nameGerman,
          types: e.pokemon.types,
          spriteUrl: e.pokemon.spriteUrl,
          spriteGifUrl: e.pokemon.spriteGifUrl,
          hp: e.pokemon.hp,
          attack: e.pokemon.attack,
          defense: e.pokemon.defense,
          spAttack: e.pokemon.spAttack,
          spDefense: e.pokemon.spDefense,
          speed: e.pokemon.speed,
        },
      })),
    }));
  } catch (error) {
    console.error('Error fetching routes:', error);
    return [];
  }
}

async function getRunNotice(): Promise<RouteRunNotice | null> {
  try {
    const activeRun = await prisma.run.findFirst({
      where: { status: 'active', archived: false },
      select: { id: true },
    });
    if (activeRun) return null;

    const latestRun = await prisma.run.findFirst({
      where: { archived: false },
      select: { runNumber: true },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
    });
    return latestRun ? { endedRunNumber: latestRun.runNumber } : { endedRunNumber: null };
  } catch (error) {
    console.error('Error fetching run notice:', error);
    return null;
  }
}

function parseRouteId(value: string | undefined): number | null {
  const routeId = Number(value);
  return Number.isInteger(routeId) && routeId > 0 ? routeId : null;
}

export default async function PokeroutePage({
  searchParams,
}: {
  searchParams: Promise<{ route?: string }>;
}) {
  const { route } = await searchParams;
  const [players, routes, currentGameVersion, runNotice] = await Promise.all([
    getPlayers(),
    getRoutes(),
    getCurrentGameVersion(),
    getRunNotice(),
  ]);

  return (
    <PokerouteClient 
      initialPlayers={players}
      initialRoutes={routes}
      initialRouteId={parseRouteId(route)}
      runNotice={runNotice}
      currentGameVersion={currentGameVersion
        ? { key: currentGameVersion.key, name: currentGameVersion.name }
        : null}
    />
  );
}

