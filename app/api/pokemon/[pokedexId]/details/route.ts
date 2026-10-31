import { NextRequest, NextResponse } from 'next/server';
import { getKnownGameVersion } from '@/lib/game-versions';
import { getPokemonDetails } from '@/lib/pokemon-details.server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pokedexId: string }> },
) {
  const { pokedexId: rawPokedexId } = await params;
  const pokedexId = Number.parseInt(rawPokedexId, 10);
  if (!Number.isSafeInteger(pokedexId) || pokedexId < 1) {
    return NextResponse.json({ error: 'Ungültige Pokédex-ID' }, { status: 400 });
  }

  const requestedEdition = request.nextUrl.searchParams.get('gameVersion')?.trim().toLowerCase();
  const gameVersionKey = requestedEdition === 'none' ? null : requestedEdition || undefined;
  if (gameVersionKey && !getKnownGameVersion(gameVersionKey)) {
    return NextResponse.json({ error: 'Unbekannte Spielversion' }, { status: 400 });
  }

  try {
    const details = await getPokemonDetails(pokedexId, { gameVersionKey });
    return NextResponse.json(details, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error(`Pokémon-Details für #${pokedexId} konnten nicht geladen werden:`, error);
    return NextResponse.json(
      { error: 'Pokémon-Details konnten nicht geladen werden' },
      { status: 502 },
    );
  }
}
