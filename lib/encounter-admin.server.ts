import { Prisma } from '@/generated/prisma/client';
import type { EncounterAdminTarget } from '@/lib/encounter-admin';

export const encounterAdminInclude = {
  player: { select: { id: true, name: true, color: true } },
  route: { select: { id: true, name: true } },
  pokemon: {
    select: {
      id: true,
      pokedexId: true,
      name: true,
      nameGerman: true,
      spriteUrl: true,
      spriteGifUrl: true,
    },
  },
} satisfies Prisma.EncounterInclude;

export type EncounterAdminPayload = Prisma.EncounterGetPayload<{
  include: typeof encounterAdminInclude;
}>;

export function serializeEncounterAdminTarget(
  encounter: EncounterAdminPayload,
): EncounterAdminTarget {
  return {
    ...encounter,
    koDate: encounter.koDate?.toISOString() ?? null,
    notCaughtDate: encounter.notCaughtDate?.toISOString() ?? null,
  };
}
