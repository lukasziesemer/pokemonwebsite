import type { Prisma } from '@/generated/prisma/client';

/** Ersetzt die Vorlage durch die aktuellen Routen. Eine leere Liste überschreibt nichts. */
export async function saveRouteTemplate(
  tx: Prisma.TransactionClient,
  gameVersionKey: string,
): Promise<number> {
  const routes = await tx.route.findMany({
    select: { name: true, order: true },
    orderBy: { order: 'asc' },
  });
  if (routes.length === 0) return 0;

  await tx.routeTemplate.deleteMany({ where: { gameVersionKey } });
  await tx.routeTemplate.createMany({
    data: routes.map((route) => ({ ...route, gameVersionKey })),
  });
  return routes.length;
}

/** Tauscht die Routen gegen die Vorlage. Ohne Vorlage bleiben sie stehen. */
export async function applyRouteTemplate(
  tx: Prisma.TransactionClient,
  gameVersionKey: string,
): Promise<number> {
  const template = await tx.routeTemplate.findMany({
    where: { gameVersionKey },
    select: { name: true, order: true },
    orderBy: { order: 'asc' },
  });
  if (template.length === 0) return 0;

  await tx.route.deleteMany({});
  await tx.route.createMany({ data: template });
  return template.length;
}
