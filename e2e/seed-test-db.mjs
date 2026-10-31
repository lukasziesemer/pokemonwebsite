// Befüllt eine leere Wegwerf-Datenbank für E2E-Läufe gegen das echte Backend.
// Bricht ab, wenn der Datenbankname nicht "e2e" enthält: echte Spielstände
// dürfen hier nie überschrieben werden.
import pg from 'pg';

const connectionString = process.env.DATABASE_URL;
const databaseName = connectionString ? new URL(connectionString).pathname.slice(1) : '';
if (!databaseName.includes('e2e')) {
  throw new Error('DATABASE_URL muss auf eine E2E-Datenbank zeigen (Name enthält "e2e").');
}

const PLAYERS = [
  ['Spieler Rot', '#dc2626'],
  ['Spieler Blau', '#2563eb'],
];
const POKEMON = [
  [1, 'bulbasaur', 'Bisasam', ['grass', 'poison'], 45, 49, 49, 65, 65, 45],
  [2, 'ivysaur', 'Bisaknosp', ['grass', 'poison'], 60, 62, 63, 80, 80, 60],
  [4, 'charmander', 'Glumanda', ['fire'], 39, 52, 43, 60, 50, 65],
  [5, 'charmeleon', 'Glutexo', ['fire'], 58, 64, 58, 80, 65, 80],
];
// Route, Pokédex-ID je Spieler, Teamplatz des Links
const ROUTES = [
  ['Route 19', [1, 4], 1],
  ['Route 20', [5, 2], 2],
  ['Route 4', [4, 1], null],
];

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query('BEGIN');
  await client.query(
    `INSERT INTO "GameVersion" (key, name, generation, "pokeapiVersionSlug", "pokeapiVersionGroupSlug")
     VALUES ('black2', 'Pokémon Schwarz 2', 5, 'black-2', 'black-2-white-2')`,
  );
  await client.query(
    `INSERT INTO "Run" ("runNumber", "gameVersionKey", status, "badgesEarned")
     VALUES (1, 'black2', 'active', 2)`,
  );

  const playerIds = [];
  for (const [name, color] of PLAYERS) {
    const { rows } = await client.query(
      'INSERT INTO "Player" (name, color) VALUES ($1, $2) RETURNING id',
      [name, color],
    );
    playerIds.push(rows[0].id);
  }

  const pokemonIds = new Map();
  for (const [pokedexId, name, nameGerman, types, ...stats] of POKEMON) {
    const { rows } = await client.query(
      `INSERT INTO "Pokemon"
         ("pokedexId", name, "nameGerman", types, hp, attack, defense, "spAttack", "spDefense", speed, "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now()) RETURNING id`,
      [pokedexId, name, nameGerman, JSON.stringify(types), ...stats],
    );
    pokemonIds.set(pokedexId, rows[0].id);
  }

  for (const [order, [name, pokedexIds, teamSlot]] of ROUTES.entries()) {
    const { rows } = await client.query(
      'INSERT INTO "Route" (name, "order") VALUES ($1, $2) RETURNING id',
      [name, order],
    );
    for (const [index, pokedexId] of pokedexIds.entries()) {
      await client.query(
        `INSERT INTO "Encounter" ("playerId", "routeId", "pokemonId", "teamSlot")
         VALUES ($1, $2, $3, $4)`,
        [playerIds[index], rows[0].id, pokemonIds.get(pokedexId), teamSlot],
      );
    }
  }
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}

console.log(`E2E-Testdaten in "${databaseName}" angelegt.`);
