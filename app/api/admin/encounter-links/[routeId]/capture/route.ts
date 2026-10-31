import { NextRequest, NextResponse } from 'next/server';
import { badRequest, withAdminAuthAndErrorHandling } from '@/lib/api-utils';
import { parseRouteCapture } from '@/lib/encounter-link-admin';
import { executeRouteCapture } from '@/lib/encounter-link-admin.server';

function parseRouteId(value: string): number | null {
  const routeId = Number(value);
  return Number.isInteger(routeId) && routeId > 0 ? routeId : null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ routeId: string }> },
) {
  return withAdminAuthAndErrorHandling(async () => {
    const { routeId: routeIdParam } = await params;
    const routeId = parseRouteId(routeIdParam);
    if (routeId === null) return badRequest('Ungültige Routen-ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('Der Request-Body muss gültiges JSON enthalten');
    }

    const parsed = parseRouteCapture(body);
    if (!parsed.ok) return badRequest(parsed.error);

    const result = await executeRouteCapture(routeId, parsed.capture);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, conflict: result.conflict },
        { status: result.status },
      );
    }
    return NextResponse.json(result.response, { status: 201 });
  }, 'capturing route');
}
