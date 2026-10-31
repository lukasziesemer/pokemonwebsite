import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const transactionClient = {
    run: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    encounter: { deleteMany: vi.fn() },
    route: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    routeTemplate: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
    liveRevision: { upsert: vi.fn() },
  };

  return {
    isAdmin: vi.fn(),
    transactionClient,
    transaction: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ isAdmin: mocks.isAdmin }));
vi.mock('@/lib/prisma', () => ({
  default: { $transaction: mocks.transaction },
}));

import { POST } from '@/app/api/admin/runs/next/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockResolvedValue(true);
  mocks.transaction.mockImplementation(async (callback) =>
    callback(mocks.transactionClient),
  );
  mocks.transactionClient.run.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({
      id: 12,
      runNumber: 4,
      status: 'completed',
      gameVersionKey: 'emerald',
    })
    .mockResolvedValueOnce({ runNumber: 4 });
  mocks.transactionClient.run.create.mockResolvedValue({
    id: 13,
    runNumber: 5,
    status: 'active',
    gameVersionKey: 'emerald',
    gameVersion: { key: 'emerald', name: 'Smaragd', generation: 3 },
  });
});

describe('POST /api/admin/runs/next', () => {
  it('preserves the game setup while clearing live encounters', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/admin/runs/next', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameVersionKey: null }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.transactionClient.encounter.deleteMany).toHaveBeenCalledWith({});
    expect(mocks.transactionClient.run.create).toHaveBeenCalledWith({
      data: {
        runNumber: 5,
        gameVersionKey: 'emerald',
        status: 'active',
      },
      include: { gameVersion: true },
    });
    expect(mocks.transactionClient.liveRevision.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.transactionClient.liveRevision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { topic: 'runs' } }),
    );
    expect(mocks.transactionClient.liveRevision.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { topic: 'encounters' } }),
    );
  });

  it('keeps routes and templates when the version stays the same', async () => {
    await POST(
      new NextRequest('http://localhost/api/admin/runs/next', {
        method: 'POST',
        body: JSON.stringify({ gameVersionKey: 'emerald' }),
      }),
    );

    expect(mocks.transactionClient.routeTemplate.createMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.route.deleteMany).not.toHaveBeenCalled();
  });

  it('stores the old routes and applies the template of the new version', async () => {
    const stored = [{ name: 'Route 201', order: 1 }];
    mocks.transactionClient.route.findMany.mockResolvedValue([{ name: 'Route 101', order: 1 }]);
    mocks.transactionClient.routeTemplate.findMany.mockResolvedValue(stored);

    const response = await POST(
      new NextRequest('http://localhost/api/admin/runs/next', {
        method: 'POST',
        body: JSON.stringify({ gameVersionKey: 'platinum' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.transactionClient.routeTemplate.createMany).toHaveBeenCalledWith({
      data: [{ name: 'Route 101', order: 1, gameVersionKey: 'emerald' }],
    });
    expect(mocks.transactionClient.route.deleteMany).toHaveBeenCalledWith({});
    expect(mocks.transactionClient.route.createMany).toHaveBeenCalledWith({ data: stored });
    expect(mocks.transactionClient.run.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ runNumber: 1, gameVersionKey: 'platinum' }),
      }),
    );
  });

  it('requires a game version when the finished run has none', async () => {
    mocks.transactionClient.run.findFirst.mockReset();
    mocks.transactionClient.run.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 12, runNumber: 4, status: 'failed', gameVersionKey: null });

    const response = await POST(
      new NextRequest('http://localhost/api/admin/runs/next', {
        method: 'POST',
        body: JSON.stringify({ gameVersionKey: null }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.transactionClient.encounter.deleteMany).not.toHaveBeenCalled();
    expect(mocks.transactionClient.run.create).not.toHaveBeenCalled();
  });

  it('does not clear encounters when another active run exists', async () => {
    mocks.transactionClient.run.findFirst.mockReset();
    mocks.transactionClient.run.findFirst.mockResolvedValue({ id: 99 });

    const response = await POST(
      new NextRequest('http://localhost/api/admin/runs/next', {
        method: 'POST',
        body: '{}',
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.transactionClient.encounter.deleteMany).not.toHaveBeenCalled();
  });
});
