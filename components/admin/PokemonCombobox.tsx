'use client';

import { forwardRef, useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { filterPokemonBySearch } from '@/lib/team-utils';
import type { PokemonListItem } from '@/lib/types';

interface PokemonComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: PokemonListItem[];
  onSelect: (pokemon: PokemonListItem) => void;
  disabled?: boolean;
}

/**
 * Pokémon-Suche für die Erfassung: Pfeiltasten wählen, Enter übernimmt den
 * markierten Treffer, Escape schließt die Liste. Ohne Suchtext bleibt Enter
 * frei, damit ein umgebendes Formular abgeschickt werden kann.
 */
const PokemonCombobox = forwardRef<HTMLInputElement, PokemonComboboxProps>(function PokemonCombobox(
  { label, value, onChange, options, onSelect, disabled = false },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const hits = useMemo(() => filterPokemonBySearch(options, value), [options, value]);
  const showList = open && value.trim().length > 0;
  const activeHit = showList ? hits[activeIndex] : undefined;
  const activeOptionId = activeHit ? `${listId}-${activeHit.id}` : undefined;

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: 'nearest' });
  }, [activeOptionId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape' && showList) {
      setOpen(false);
      return;
    }
    if (event.key === 'Enter' && value.trim()) {
      event.preventDefault();
      if (!showList) {
        setOpen(true);
      } else if (activeHit) {
        setOpen(false);
        onSelect(activeHit);
      }
      return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && value.trim()) {
      event.preventDefault();
      if (!showList) {
        setOpen(true);
      } else if (hits.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActiveIndex((activeIndex + step + hits.length) % hits.length);
      }
    }
  };

  return (
    <div className="relative min-w-[160px]">
      <input
        ref={ref}
        type="text"
        role="combobox"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
        placeholder="Pokemon suchen..."
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setOpen(false)}
        disabled={disabled}
        className="min-h-11 w-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)]"
      />

      {showList && hits.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto border border-[var(--border-default)] bg-[var(--card-bg-elevated)] shadow-lg"
        >
          {hits.map((pokemon, index) => (
            <button
              key={pokemon.id}
              id={`${listId}-${pokemon.id}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === activeIndex}
              // Der Fokus bleibt im Eingabefeld, sonst schließt blur die Liste vor dem Klick.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false);
                onSelect(pokemon);
              }}
              disabled={disabled}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--background-secondary)] disabled:opacity-50 ${index === activeIndex ? 'bg-[var(--background-secondary)]' : ''}`}
            >
              <span className="text-[var(--text-secondary)]">#{pokemon.pokedexId}</span>
              <span className="font-medium">{pokemon.nameGerman || pokemon.name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {showList && hits.length === 0 ? (
        <div role="status" className="absolute z-50 mt-1 w-full border border-[var(--border-default)] bg-[var(--card-bg-elevated)] p-3 shadow-lg">
          <p className="text-sm text-[var(--text-secondary)]">Kein Pokemon gefunden</p>
        </div>
      ) : null}
    </div>
  );
});

export default PokemonCombobox;
