/**
 * Admin API: Routenvorlagen je Spielversion
 * GET /api/admin/route-templates - Anzahl Routen je Spielversion
 * POST /api/admin/route-templates - Aktuelle Routen als Vorlage speichern
 */

import { NextRequest } from 'next/server';
import { badRequest, success, withAdminAuthAndErrorHandling } from '@/lib/api-utils';
import prisma from '@/lib/prisma';
import { saveRouteTemplate } from '@/lib/route-templates.server';

export async function GET() {
  return withAdminAuthAndErrorHandling(async () => {
    const groups = await prisma.routeTemplate.groupBy({
      by: ['gameVersionKey'],
      _count: { _all: true },
    });

    return success(
      Object.fromEntries(groups.map((group) => [group.gameVersionKey, group._count._all])),
    );
  }, 'fetching route templates');
}

export async function POST(request: NextRequest) {
  return withAdminAuthAndErrorHandling(async () => {
    const body = (await request.json().catch(() => ({}))) as { gameVersionKey?: unknown };
    const { gameVersionKey } = body;
    if (typeof gameVersionKey !== 'string' || !gameVersionKey.trim()) {
      return badRequest('Eine Spielversion ist erforderlich');
    }

    const version = await prisma.gameVersion.findUnique({
      where: { key: gameVersionKey },
      select: { key: true },
    });
    if (!version) return badRequest('Unbekannte Spielversion');

    const count = await prisma.$transaction((tx) => saveRouteTemplate(tx, gameVersionKey));
    if (count === 0) return badRequest('Es gibt noch keine Routen für eine Vorlage');

    return success({ count });
  }, 'saving route template');
}
