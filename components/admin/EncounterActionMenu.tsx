'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useId,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import type { PokemonListItem } from '@/lib/types';
import {
  deleteEncounterAdmin,
  mutateEncounterAdmin,
  type EncounterAdminAction,
  type EncounterAdminTarget,
} from '@/lib/encounter-admin';
import EncounterAdminDialog from './EncounterAdminDialog';
import PokemonCombobox from './PokemonCombobox';

const AdminEvolutionPicker = dynamic(() => import('./AdminEvolutionPicker'), {
  ssr: false,
  loading: () => (
    <div role="status" className="border border-[var(--border-default)] bg-[var(--background-secondary)] p-4 text-sm text-[var(--text-secondary)]">
      Entwicklungen werden geladen…
    </div>
  ),
});

export type EncounterActionMenuTarget = EncounterAdminTarget;

interface EncounterActionMenuProps {
  encounter: EncounterAdminTarget;
  pokemonOptions?: PokemonListItem[];
  /** Die Tabelle lädt die Auswahl erst bei Bedarf; das Menü bleibt dabei vollständig. */
  pokemonOptionsLoading?: boolean;
  onUpdated?: (encounter: EncounterAdminTarget) => void;
  onDeleted?: (encounterId: number) => void;
  onError?: (message: string) => void;
  triggerLabel?: string;
  compact?: boolean;
  disabled?: boolean;
  /**
   * Individual is the safe default: only identity edits that affect exactly
   * one encounter are exposed. Repair adds the deliberately separated
   * one-row delete escape hatch; team and status mutations belong to the
   * route-link menu.
   */
  scope?: 'individual' | 'repair';
  className?: string;
  /** Exact edition key from the current run. The details API can resolve it
   * itself, but passing it keeps the dialog stable while the run changes. */
  gameVersionKey?: string | null;
}

type IndividualEncounterAction = Extract<
  EncounterAdminAction,
  { action: 'swap-pokemon' | 'update-nickname' }
>;
type DialogAction = IndividualEncounterAction['action'] | 'evolution' | 'delete' | null;

const inputClasses =
  'w-full border border-[var(--border-default)] bg-[var(--background-secondary)] px-3 py-2.5 text-[var(--foreground)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50';
const secondaryButtonClasses =
  'min-h-11 border border-[var(--border-default)] bg-[var(--background-secondary)] px-4 py-2 font-bold text-[var(--foreground)] hover:border-[var(--brand-navy)] hover:bg-[var(--background-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50';
const primaryButtonClasses =
  'min-h-11 border border-[var(--brand-red)] bg-[var(--brand-red)] px-4 py-2 font-extrabold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

function pokemonDisplayName(encounter: EncounterAdminTarget) {
  return encounter.pokemon.nameGerman ?? encounter.pokemon.name;
}

/**
 * Shared entry point for one-Pokémon identity edits.
 *
 * It is intentionally surface-agnostic: TeamDisplay, RouteList and Tabelle can
 * render this component and update their local cache through `onUpdated`.
 * Team slots and status transitions intentionally live in RouteLinkActionMenu.
 */
export default function EncounterActionMenu({
  encounter,
  pokemonOptions = [],
  pokemonOptionsLoading = false,
  onUpdated,
  onDeleted,
  onError,
  triggerLabel = 'Verwalten',
  compact = false,
  disabled = false,
  scope = 'individual',
  className = '',
  gameVersionKey = null,
}: EncounterActionMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState(encounter.nickname ?? '');
  const [pokemonSearch, setPokemonSearch] = useState('');
  const [selectedPokemonId, setSelectedPokemonId] = useState<number | null>(null);
  const [selectedEvolutionId, setSelectedEvolutionId] = useState<number | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hadDialogRef = useRef(false);
  const menuId = useId();

  const name = pokemonDisplayName(encounter);
  const selectedPokemon = pokemonOptions.find((pokemon) => pokemon.id === selectedPokemonId) ?? null;

  const resetForm = useCallback((action: Exclude<DialogAction, null>) => {
    setError(null);
    setNickname(encounter.nickname ?? '');
    setPokemonSearch('');
    setSelectedPokemonId(action === 'swap-pokemon' ? encounter.pokemon.id : null);
    setSelectedEvolutionId(null);
  }, [encounter]);

  const openDialog = useCallback((action: Exclude<DialogAction, null>) => {
    resetForm(action);
    setMenuOpen(false);
    setDialogAction(action);
  }, [resetForm]);

  const closeDialog = useCallback(() => {
    if (busy) return;
    setDialogAction(null);
    setError(null);
  }, [busy]);

  useEffect(() => {
    if (!menuOpen) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const menuWidth = 240;
      const menuHeight = menuRef.current?.offsetHeight ?? 360;
      const viewportMargin = 8;
      const left = Math.min(
        Math.max(viewportMargin, rect.right - menuWidth),
        window.innerWidth - menuWidth - viewportMargin,
      );
      const fitsBelow = rect.bottom + viewportMargin + menuHeight <= window.innerHeight;
      const top = fitsBelow
        ? rect.bottom + viewportMargin
        : Math.max(viewportMargin, rect.top - menuHeight - viewportMargin);
      setMenuPosition({ top, left });
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };
    updatePosition();
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const focusTimer = window.setTimeout(() => {
      updatePosition();
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (dialogAction) {
      hadDialogRef.current = true;
      return;
    }
    if (!hadDialogRef.current) return;
    hadDialogRef.current = false;
    const focusTimer = window.setTimeout(() => triggerRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [dialogAction]);

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
    );
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length;
    if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + items.length) % items.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = items.length - 1;
    if (nextIndex !== null && items[nextIndex]) {
      event.preventDefault();
      items[nextIndex].focus();
    }
  };

  const submit = async (action: IndividualEncounterAction) => {
    setBusy(true);
    setError(null);
    try {
      const updated = await mutateEncounterAdmin(encounter.id, action);
      onUpdated?.(updated);
      setDialogAction(null);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Änderung fehlgeschlagen';
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const submitDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteEncounterAdmin(encounter.id);
      onDeleted?.(encounter.id);
      setDialogAction(null);
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Löschen fehlgeschlagen';
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const submitEvolution = async (targetPokedexId: number) => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/encounters/${encounter.id}/evolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPokedexId }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { encounter?: EncounterAdminTarget; error?: string }
        | null;
      if (!response.ok || !payload?.encounter) {
        throw new Error(payload?.error ?? 'Entwicklung konnte nicht gespeichert werden');
      }
      onUpdated?.(payload.encounter);
      setDialogAction(null);
    } catch (submitError) {
      const message = submitError instanceof Error
        ? submitError.message
        : 'Entwicklung konnte nicht gespeichert werden';
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = () => {
    switch (dialogAction) {
      case 'swap-pokemon':
        if (selectedPokemonId) void submit({ action: 'swap-pokemon', pokemonId: selectedPokemonId });
        break;
      case 'update-nickname':
        void submit({ action: 'update-nickname', nickname: nickname || null });
        break;
      case 'evolution':
        if (selectedEvolutionId) void submitEvolution(selectedEvolutionId);
        break;
      case 'delete':
        void submitDelete();
        break;
      default:
        break;
    }
  };

  const canConfirm =
    !busy &&
    (dialogAction === 'delete' ||
      (dialogAction === 'update-nickname' && nickname.trim() !== (encounter.nickname ?? '')) ||
      (dialogAction === 'evolution' && selectedEvolutionId !== null) ||
      (dialogAction === 'swap-pokemon' &&
        selectedPokemonId !== null &&
        selectedPokemonId !== encounter.pokemon.id));

  const dialogCopy: Record<Exclude<DialogAction, null>, { title: string; description: string; confirm: string; danger?: boolean }> = {
    'swap-pokemon': {
      title: 'Pokémon tauschen',
      description: `${name} auf ${encounter.route.name} ersetzen.`,
      confirm: 'Pokémon tauschen',
    },
    'update-nickname': {
      title: 'Spitzname bearbeiten',
      description: `${name} bei ${encounter.player.name}`,
      confirm: 'Spitzname speichern',
    },
    evolution: {
      title: 'Entwicklung ändern',
      description: `${name} bei ${encounter.player.name}: direkte Vor- oder Weiterentwicklung auswählen.`,
      confirm: 'Entwicklung speichern',
    },
    delete: {
      title: 'Begegnung löschen',
      description: `${name} von ${encounter.player.name} auf ${encounter.route.name} wird dauerhaft gelöscht.`,
      confirm: 'Begegnung löschen',
      danger: true,
    },
  };

  const copy = dialogAction ? dialogCopy[dialogAction] : null;

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label={compact ? `${name} verwalten` : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
        className="min-h-11 border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-2 text-sm font-extrabold text-[var(--foreground)] hover:border-[var(--brand-blue)] hover:text-[var(--brand-blue)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50"
      >
        {compact ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
          >
            <circle cx="12" cy="5" r="1.75" />
            <circle cx="12" cy="12" r="1.75" />
            <circle cx="12" cy="19" r="1.75" />
          </svg>
        ) : triggerLabel}
      </button>

      {menuOpen && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={menuId}
              ref={menuRef}
              role="menu"
              aria-label={`${name} verwalten`}
              onKeyDown={handleMenuKeyDown}
              style={{ top: menuPosition.top, left: menuPosition.left }}
              className="fixed z-[9998] w-60 overflow-hidden border border-[var(--border-default)] bg-[var(--card-bg-elevated)] p-1.5 text-[var(--foreground)] shadow-lg"
            >
              <MenuButton onClick={() => openDialog('swap-pokemon')}>Pokémon tauschen</MenuButton>
              <MenuButton onClick={() => openDialog('update-nickname')}>Spitzname bearbeiten</MenuButton>
              <MenuButton onClick={() => openDialog('evolution')}>Entwicklung ändern</MenuButton>
              {scope === 'repair' ? (
                <>
                  <div className="my-1 border-t border-[var(--border-default)]" />
                  <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                    Reparaturmodus
                  </p>
                  <MenuButton onClick={() => openDialog('delete')} danger>
                    Einzelnen Datensatz löschen
                  </MenuButton>
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      {dialogAction && copy ? (
        <EncounterAdminDialog
          isOpen
          title={copy.title}
          description={copy.description}
          onClose={closeDialog}
          busy={busy}
          onSubmit={() => {
            if (canConfirm) confirmAction();
          }}
          actions={
            <>
              <button type="button" onClick={closeDialog} disabled={busy} className={secondaryButtonClasses}>
                Abbrechen
              </button>
              <button
                type="submit"
                disabled={!canConfirm}
                className={`${primaryButtonClasses} ${copy.danger ? 'bg-red-600 hover:bg-red-700' : ''}`}
              >
                {busy ? 'Wird gespeichert…' : copy.confirm}
              </button>
            </>
          }
        >
          {dialogAction === 'swap-pokemon' ? (
            <>
              <PokemonCombobox
                label="Neues Pokémon suchen"
                value={pokemonSearch}
                onChange={setPokemonSearch}
                options={pokemonOptions}
                onSelect={(pokemon) => {
                  setPokemonSearch('');
                  setSelectedPokemonId(pokemon.id);
                }}
                disabled={busy}
                autoFocusInDialog
              />
              <p role="status" className="text-sm text-[var(--text-secondary)]">
                {pokemonOptionsLoading
                  ? 'Pokémon-Auswahl wird geladen…'
                  : selectedPokemon && selectedPokemon.id !== encounter.pokemon.id
                    ? `Neu: #${selectedPokemon.pokedexId} ${selectedPokemon.nameGerman ?? selectedPokemon.name}`
                    : 'Noch kein neues Pokémon gewählt.'}
              </p>
            </>
          ) : null}

          {dialogAction === 'update-nickname' ? (
            <Field label="Spitzname" htmlFor={`nickname-${encounter.id}`}>
              <input
                id={`nickname-${encounter.id}`}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                data-autofocus
                maxLength={60}
                placeholder="Leer lassen, um den Spitznamen zu entfernen"
                disabled={busy}
                className={inputClasses}
              />
            </Field>
          ) : null}

          {dialogAction === 'evolution' ? (
            <AdminEvolutionPicker
              currentPokedexId={encounter.pokemon.pokedexId}
              gameVersionKey={gameVersionKey}
              selectedPokedexId={selectedEvolutionId}
              onSelect={setSelectedEvolutionId}
              disabled={busy}
            />
          ) : null}

          {dialogAction === 'delete' ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
              Diese Aktion kann nicht rückgängig gemacht werden. Andere Begegnungen auf derselben Route bleiben unverändert.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </EncounterAdminDialog>
      ) : null}
    </div>
  );
}

function MenuButton({
  children,
  onClick,
  danger = false,
}: {
  children: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--background-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${danger ? 'text-red-600 dark:text-red-300' : ''}`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">
        {label}
      </label>
      {children}
    </div>
  );
}
