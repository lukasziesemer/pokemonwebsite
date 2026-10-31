import type { GameOverview } from './types';
import { gameFilterKey, gameName } from './types';

interface GameFilterProps {
  games: GameOverview[];
  selectedGame: string;
  onSelect: (gameKey: string) => void;
}

export function GameFilter({ games, selectedGame, onSelect }: GameFilterProps) {
  const options = [
    { key: 'all', label: 'Alle Spiele' },
    ...games.map((game) => ({
      key: gameFilterKey(game.gameVersion),
      label: gameName(game.gameVersion),
    })),
  ];

  return (
    <div className="-mx-3 overflow-x-auto px-3 pb-1 no-scrollbar md:mx-0 md:px-0">
      <div className="app-toolbar flex min-w-max gap-0 border border-[var(--border-default)]" role="group" aria-label="Statistik nach Spiel filtern">
        {options.map((option) => {
          const selected = selectedGame === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSelect(option.key)}
              aria-pressed={selected}
              className={`min-h-11 border-r border-[var(--border-default)] px-4 py-2 text-sm font-black uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)] ${
                selected
                  ? 'bg-[var(--brand-navy,#071a33)] text-white'
                  : 'bg-[var(--card-bg)] text-[var(--text-secondary)] hover:bg-[var(--background-secondary)] hover:text-[var(--foreground)]'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
