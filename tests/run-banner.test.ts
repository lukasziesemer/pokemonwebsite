import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { DashboardData } from '@/app/dashboard-data';
import RunBanner from '@/components/dashboard/RunBanner';
import { getBadgesForGame } from '@/lib/badge-data';
import { AuthProvider, type AdminSessionState } from '@/lib/contexts/AuthContext';

const TestAuthProvider = AuthProvider as ComponentType<{
  initialSession: AdminSessionState;
}>;

function createDashboardData(badgesEarned: number, withRun = true): DashboardData {
  const badges = getBadgesForGame('black2') ?? [];

  return {
    run: withRun
      ? {
          id: 1,
          number: 7,
          gameName: 'Pokémon Schwarz 2',
          gameVersionKey: 'black2',
          status: 'active',
          statusLabel: 'Aktiv',
          badgesEarned,
          durationMs: 0,
        }
      : null,
    badges: badges.map((badge, index) => ({
      key: badge.key,
      name: badge.nameDe,
      leader: badge.leaderDe,
      imagePath: badge.imagePath,
      earned: index < badgesEarned,
      position: index + 1,
    })),
    players: [],
    playerTotals: [],
    totals: { wins: 0, losses: 0, winRate: null, knockedOut: 0, notCaught: 0 },
  };
}

function renderBanner(data: DashboardData) {
  return renderToStaticMarkup(
    createElement(
      TestAuthProvider,
      { initialSession: { isAdmin: false, username: null } },
      createElement(RunBanner, { data, highlighted: false }),
    ),
  );
}

describe('RunBanner', () => {
  it('zeigt für jeden Orden das spielspezifische Level-Cap an', () => {
    const markup = renderBanner(createDashboardData(3));

    for (const levelCap of [13, 18, 24, 30, 33, 39, 48, 51]) {
      expect(markup).toContain(`Lv ${levelCap}`);
      expect(markup).toContain(`Level-Cap ${levelCap}`);
    }
  });

  it('nennt das Level-Cap bis zum nächsten Orden', () => {
    const markup = renderBanner(createDashboardData(3));

    expect(markup).toContain('<span class="sr-only">30</span>');
    expect(markup).toContain('bis Voltorden, Kamilla');
    expect(markup.match(/data-next="true"/g)).toHaveLength(1);
  });

  it('meldet, wenn alle Orden erhalten sind', () => {
    const markup = renderBanner(createDashboardData(8));

    expect(markup).toContain('Alle Orden erhalten');
    expect(markup).not.toContain('data-next');
  });

  it('kommt ohne Run aus', () => {
    const markup = renderBanner(createDashboardData(0, false));

    expect(markup).toContain('Kein Run vorhanden');
    expect(markup).not.toContain('Level-Cap');
  });
});
