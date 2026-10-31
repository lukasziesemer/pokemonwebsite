import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { Prisma } from '@/generated/prisma/client';

const mocks = vi.hoisted(() => {
  const tx = {
    route: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    routeTemplate: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  };
  return {
    tx,
    isAdmin: vi.fn(),
    transaction: vi.fn(),
    findVersion: vi.fn(),
    groupBy: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: mocks.transaction,
    gameVersion: { findUnique: mocks.findVersion },
    routeTemplate: { groupBy: mocks.groupBy },
  },
}));

import { GET, POST } from '@/app/api/admin/route-templates/route';
import { applyRouteTemplate, saveRouteTemplate } from '@/lib/route-templates.server';

const tx = mocks.tx as unknown as Prisma.TransactionClient;
const routes = [
  { name: 'Route 1', order: 1 },
  { name: 'Route 2', order: 2 },
];

function post(body: unknown) {
  return new NextRequest('http://localhost/api/admin/route-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isAdmin.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.findVersion.mockResolvedValue({ key: 'platinum' });
});

describe('route template storage', () => {
  it('replaces the template with the current routes', async () => {
    mocks.tx.route.findMany.mockResolvedValue(routes);

    expect(await saveRouteTemplate(tx, 'platinum')).toBe(2);
    expect(mocks.tx.routeTemplate.deleteMany).toHaveBeenCalledWith({ where: { gameVersionKey: 'platinum' } });
    expect(mocks.tx.routeTemplate.createMany).toHaveBeenCalledWith({
      data: [
        { name: 'Route 1', order: 1, gameVersionKey: 'platinum' },
        { name: 'Route 2', order: 2, gameVersionKey: 'platinum' },
      ],
    });
  });

  it('keeps an existing template when there are no routes', async () => {
    mocks.tx.route.findMany.mockResolvedValue([]);

    expect(await saveRouteTemplate(tx, 'platinum')).toBe(0);
    expect(mocks.tx.routeTemplate.deleteMany).not.toHaveBeenCalled();
  });

  it('swaps the routes for a stored template', async () => {
    mocks.tx.routeTemplate.findMany.mockResolvedValue(routes);

    expect(await applyRouteTemplate(tx, 'emerald')).toBe(2);
    expect(mocks.tx.route.deleteMany).toHaveBeenCalledWith({});
    expect(mocks.tx.route.createMany).toHaveBeenCalledWith({ data: routes });
  });

  it('leaves the routes alone without a template', async () => {
    mocks.tx.routeTemplate.findMany.mockResolvedValue([]);

    expect(await applyRouteTemplate(tx, 'emerald')).toBe(0);
    expect(mocks.tx.route.deleteMany).not.toHaveBeenCalled();
  });
});

describe('/api/admin/route-templates', () => {
  it('counts routes per game version', async () => {
    mocks.groupBy.mockResolvedValue([{ gameVersionKey: 'platinum', _count: { _all: 26 } }]);

    const response = await GET();

    expect(await response.json()).toMatchObject({ data: { platinum: 26 } });
  });

  it('saves the current routes for a known version', async () => {
    mocks.tx.route.findMany.mockResolvedValue(routes);

    const response = await POST(post({ gameVersionKey: 'platinum' }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: { count: 2 } });
  });

  it.each([
    ['a missing version', {}, undefined],
    ['an unknown version', { gameVersionKey: 'gibtsnicht' }, null],
  ])('rejects %s', async (_name, body, version) => {
    if (version === null) mocks.findVersion.mockResolvedValue(null);

    const response = await POST(post(body));

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('rejects saving an empty route list', async () => {
    mocks.tx.route.findMany.mockResolvedValue([]);

    expect((await POST(post({ gameVersionKey: 'platinum' }))).status).toBe(400);
  });

  it('requires an admin', async () => {
    mocks.isAdmin.mockResolvedValue(false);

    expect((await POST(post({ gameVersionKey: 'platinum' }))).status).toBe(401);
    expect((await GET()).status).toBe(401);
  });
});
