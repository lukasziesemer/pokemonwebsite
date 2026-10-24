/** Seed-Script für Pokémon-Spielversionen (Gen 1-9). */
import { prisma } from '../lib/prisma';
import { GAME_VERSIONS } from '../lib/game-versions';

export const gameVersions = GAME_VERSIONS.map((version) => ({
  key: version.key,
  name: version.name,
  generation: version.generation,
  pokeapiVersionSlug: version.versionSlug,
  pokeapiVersionGroupSlug: version.versionGroupSlug,
}));

export async function seedGameVersions() {
  console.log('Seeding game versions...');

  for (const version of gameVersions) {
    await prisma.gameVersion.upsert({
      where: { key: version.key },
      update: version,
      create: version,
    });
    console.log(`  ✓ ${version.name}`);
  }

  console.log(`\nSeeded ${gameVersions.length} game versions.`);
}

if (require.main === module) {
  seedGameVersions()
    .then(() => {
      console.log('Done!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Error seeding game versions:', error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
