'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import type { EncounterAdminTarget } from '@/lib/encounter-admin';
import {
  mutateEncounterLink,
  type EncounterLinkAdminAction,
} from '@/lib/encounter-link-admin';
import EncounterAdminDialog from './EncounterAdminDialog';
import {
  describeTeamSlot,
  describeTeamSlotChange,
  getEncounterRouteLinkState,
  getFirstFreeTeamSlot,
  pokemonDisplayName,
  TEAM_SLOTS,
  type EncounterRouteLinkTarget,
  type RouteStatusChange,
} from './route-link-ui';

export type RouteLinkActionMenuTarget = EncounterRouteLinkTarget;

/** Pflege der Route selbst; nur dort gesetzt, wo Routen bearbeitet werden. */
export interface RouteEditActions {
  onRename: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

interface RouteLinkActionMenuProps {
  link: EncounterRouteLinkTarget;
  routeActions?: RouteEditActions;
  onUpdated?: (encounters: EncounterAdminTarget[]) => void;
  onDeleted?: (routeId: number) => void;
  /** K.O. oder „Nicht gefangen“ gesetzt; das Menü selbst verschwindet dabei eventuell aus dem Team. */
  onStatusSet?: (change: RouteStatusChange) => void;
  onError?: (message: string) => void;
  triggerLabel?: string;
  compact?: boolean;
  disabled?: boolean;
  className?: string;
}

type DialogAction =
  | Exclude<EncounterLinkAdminAction['action'], 'take-team-slot'>
  | 'remove-from-team'
  | null;

const inputClasses =
  'min-h-11 w-full border border-[var(--border-default)] bg-[var(--background-secondary)] px-3 py-2.5 text-[var(--foreground)] placeholder:text-[var(--text-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50';
const secondaryButtonClasses =
  'min-h-11 border border-[var(--border-default)] bg-[var(--background-secondary)] px-4 py-2 font-bold text-[var(--foreground)] hover:border-[var(--brand-navy)] hover:bg-[var(--background-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50';
const primaryButtonClasses =
  'min-h-11 border border-[var(--brand-red)] bg-[var(--brand-red)] px-4 py-2 font-extrabold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

export default function RouteLinkActionMenu({
  link,
  routeActions,
  onUpdated,
  onDeleted,
  onStatusSet,
  onError,
  triggerLabel = 'Route verwalten',
  compact = false,
  disabled = false,
  className = '',
}: RouteLinkActionMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialogAction, setDialogAction] = useState<DialogAction>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamSlot, setTeamSlot] = useState('none');
  const [restoreTeamSlot, setRestoreTeamSlot] = useState(true);
  const [causedBy, setCausedBy] = useState('');
  const [reason, setReason] = useState('');
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hadDialogRef = useRef(false);
  const menuId = useId();
  const state = useMemo(() => getEncounterRouteLinkState(link), [link]);
  const playerOptions = useMemo(
    () =>
      Array.from(
        new Map(
          link.encounters.map((encounter) => [
            encounter.player.id,
            encounter.player.name,
          ]),
        ).entries(),
      ).map(([id, name]) => ({ id, name })),
    [link.encounters],
  );
  // Vollständigkeit ist nur für eine Teamplatz-Zuweisung relevant. Status-
  // und Löschaktionen gelten bewusst für alle aktuell vorhandenen Mitglieder;
  // später angelegte Encounters erben den Linkstatus serverseitig.
  const hasMembers = state.memberCount > 0;
  const firstFreeSlot = link.occupiedTeamSlots
    ? getFirstFreeTeamSlot(link.occupiedTeamSlots)
    : null;
  const lastTeamSlot = link.encounters.find((encounter) => encounter.lastTeamSlot)?.lastTeamSlot ?? null;
  const lastTeamSlotOccupant = lastTeamSlot === null ? null : link.occupiedTeamSlots?.[lastTeamSlot] ?? null;
  const canRestoreTeamSlot = lastTeamSlot !== null && !lastTeamSlotOccupant && state.isComplete;
  const teamSlotChange = teamSlot === 'none' ? null : describeTeamSlotChange(Number(teamSlot), link);

  const resetForm = useCallback((action: Exclude<DialogAction, null>) => {
    setError(null);
    setRestoreTeamSlot(true);
    setCausedBy(playerOptions.length === 1 ? playerOptions[0].name : '');
    setReason('');
    if (action === 'remove-from-team' || state.teamSlot === 'mixed') {
      setTeamSlot('none');
    } else if (state.teamSlot !== null) {
      setTeamSlot(String(state.teamSlot));
    } else {
      setTeamSlot(state.canAssignToTeam && firstFreeSlot ? String(firstFreeSlot) : 'none');
    }
  }, [firstFreeSlot, playerOptions, state.canAssignToTeam, state.teamSlot]);

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
      const menuWidth = 260;
      const menuHeight = menuRef.current?.offsetHeight ?? 360;
      const margin = 8;
      const left = Math.min(
        Math.max(margin, rect.right - menuWidth),
        window.innerWidth - menuWidth - margin,
      );
      const fitsBelow = rect.bottom + margin + menuHeight <= window.innerHeight;
      setMenuPosition({
        left,
        top: fitsBelow
          ? rect.bottom + margin
          : Math.max(margin, rect.top - menuHeight - margin),
      });
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    updatePosition();
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const focusTimer = window.setTimeout(() => {
      updatePosition();
      menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
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
      event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ),
    );
    if (items.length === 0) return;
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

  const runRouteAction = (action: () => void) => {
    setMenuOpen(false);
    action();
  };

  const submit = async (action: EncounterLinkAdminAction) => {
    setBusy(true);
    setError(null);
    try {
      const result = await mutateEncounterLink(link.route.id, action);
      if (action.action === 'delete-link') {
        onDeleted?.(link.route.id);
      } else {
        onUpdated?.(result.encounters);
      }
      if (action.action === 'knockout' || action.action === 'not-caught') {
        onStatusSet?.({
          routeId: link.route.id,
          routeName: link.route.name,
          status: action.action,
          statusDate: (action.action === 'knockout'
            ? result.encounters[0]?.koDate
            : result.encounters[0]?.notCaughtDate) ?? null,
          teamSlot: typeof state.teamSlot === 'number' ? state.teamSlot : null,
        });
      }
      setDialogAction(null);
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : 'Route konnte nicht geändert werden';
      setError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  };

  const confirmAction = () => {
    switch (dialogAction) {
      case 'set-team-slot':
        void submit(
          teamSlotChange
            ? { action: 'take-team-slot', teamSlot: Number(teamSlot) }
            : { action: 'set-team-slot', teamSlot: teamSlot === 'none' ? null : Number(teamSlot) },
        );
        break;
      case 'remove-from-team':
        void submit({ action: 'set-team-slot', teamSlot: null });
        break;
      case 'knockout':
        void submit({ action: 'knockout', causedBy, reason: reason || null });
        break;
      case 'not-caught':
        void submit({ action: 'not-caught', causedBy, reason: reason || null });
        break;
      case 'reactivate':
        void submit(
          canRestoreTeamSlot && restoreTeamSlot
            ? { action: 'reactivate', teamSlot: lastTeamSlot }
            : { action: 'reactivate' },
        );
        break;
      case 'delete-link':
        void submit({ action: 'delete-link' });
        break;
      default:
        break;
    }
  };

  const canConfirm =
    !busy &&
    (dialogAction === 'remove-from-team' ||
      dialogAction === 'reactivate' ||
      dialogAction === 'delete-link' ||
      (dialogAction === 'set-team-slot' &&
        (teamSlot === 'none' || state.canAssignToTeam)) ||
      ((dialogAction === 'knockout' || dialogAction === 'not-caught') &&
        causedBy.trim().length > 0));

  const dialogCopy: Record<
    Exclude<DialogAction, null>,
    { title: string; description: string; confirm: string; danger?: boolean }
  > = {
    'set-team-slot': {
      title: 'Teamplatz verwalten',
      description: `${link.route.name}: Der Teamplatz gilt für alle erfassten Pokémon dieser Route.`,
      confirm: 'Teamplatz speichern',
    },
    'remove-from-team': {
      title: 'Route aus dem Team entfernen',
      description: `${link.route.name}: Alle betroffenen Pokémon verlieren ihren Teamplatz.`,
      confirm: 'Aus Team entfernen',
    },
    knockout: {
      title: 'K.O. setzen',
      description: `${link.route.name}: Alle betroffenen Pokémon werden K.O. gesetzt und aus dem Team entfernt.`,
      confirm: 'K.O. setzen',
      danger: true,
    },
    'not-caught': {
      title: 'Als nicht gefangen markieren',
      description: `${link.route.name}: Alle betroffenen Pokémon erhalten diesen Status und werden aus dem Team entfernt.`,
      confirm: 'Nicht gefangen markieren',
      danger: true,
    },
    reactivate: {
      title: 'Route reaktivieren',
      description: `${link.route.name}: K.O.- und Nicht-gefangen-Metadaten werden für alle betroffenen Pokémon entfernt.`,
      confirm: 'Reaktivieren',
    },
    'delete-link': {
      title: 'Alle Pokémon der Route löschen',
      description: `${link.route.name}: Alle ${state.memberCount} erfassten Pokémon werden gelöscht. Die Route bleibt bestehen.`,
      confirm: 'Pokémon löschen',
      danger: true,
    },
  };
  const copy = dialogAction ? dialogCopy[dialogAction] : null;

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || (!hasMembers && !routeActions)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        aria-label={compact ? `${link.route.name}: Route verwalten` : undefined}
        onClick={() => setMenuOpen((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setMenuOpen(true);
          }
        }}
        className="min-h-11 border border-[var(--brand-blue)] bg-[var(--card-bg)] px-3 py-2 text-sm font-extrabold text-[var(--brand-blue)] hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50"
      >
        {compact ? (
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2">
            <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15" strokeLinecap="round" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15" strokeLinecap="round" />
          </svg>
        ) : triggerLabel}
      </button>

      {menuOpen && menuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
              id={menuId}
              ref={menuRef}
              role="menu"
              aria-label={`${link.route.name}: Route verwalten`}
              onKeyDown={handleMenuKeyDown}
              style={{ top: menuPosition.top, left: menuPosition.left }}
              className="fixed z-[9998] max-h-[calc(100dvh-1rem)] w-[260px] overflow-y-auto border border-[var(--border-default)] bg-[var(--card-bg-elevated)] p-1.5 text-[var(--foreground)] shadow-lg"
            >
              <div className="border-b border-[var(--border-default)] px-3 py-2">
                <p className="truncate text-sm font-bold">{link.route.name}</p>
                {hasMembers ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    {state.memberCount} Pokémon betroffen
                  </p>
                ) : null}
              </div>
              {hasMembers ? (
                <>
                  <MenuButton onClick={() => openDialog('set-team-slot')}>
                    Teamplatz verwalten
                  </MenuButton>
                  {state.teamSlot !== null ? (
                    <MenuButton onClick={() => openDialog('remove-from-team')}>
                      Aus Team entfernen
                    </MenuButton>
                  ) : null}
                  <MenuButton onClick={() => openDialog('knockout')}>
                    K.O. setzen
                  </MenuButton>
                  <MenuButton onClick={() => openDialog('not-caught')}>
                    Nicht gefangen
                  </MenuButton>
                  {state.hasInactiveMembers ? (
                    <MenuButton onClick={() => openDialog('reactivate')}>
                      Reaktivieren
                    </MenuButton>
                  ) : null}
                </>
              ) : null}
              {routeActions ? (
                <>
                  {hasMembers ? <div className="my-1 border-t border-[var(--border-default)]" /> : null}
                  <MenuButton onClick={() => runRouteAction(routeActions.onRename)}>
                    Route umbenennen
                  </MenuButton>
                  <MenuButton
                    onClick={() => runRouteAction(routeActions.onMoveUp)}
                    disabled={!routeActions.canMoveUp}
                  >
                    Nach oben verschieben
                  </MenuButton>
                  <MenuButton
                    onClick={() => runRouteAction(routeActions.onMoveDown)}
                    disabled={!routeActions.canMoveDown}
                  >
                    Nach unten verschieben
                  </MenuButton>
                </>
              ) : null}
              <div className="my-1 border-t border-[var(--border-default)]" />
              {hasMembers ? (
                <MenuButton onClick={() => openDialog('delete-link')} danger>
                  Alle Pokémon der Route löschen
                </MenuButton>
              ) : null}
              {routeActions ? (
                <MenuButton onClick={() => runRouteAction(routeActions.onDelete)} danger>
                  Route löschen
                </MenuButton>
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
                {busy
                  ? 'Wird gespeichert…'
                  : dialogAction === 'set-team-slot' && teamSlotChange
                    ? teamSlotChange.confirm
                    : copy.confirm}
              </button>
            </>
          }
        >
          <AffectedPokemon link={link} />

          {dialogAction === 'set-team-slot' && state.blockedReasons.length > 0 ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              <p className="font-semibold">Hinweise zur Route</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {state.blockedReasons.map((blockedReason) => (
                  <li key={blockedReason}>{blockedReason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {dialogAction === 'set-team-slot' ? (
            <label className="grid gap-1.5 text-sm font-semibold text-[var(--foreground)]">
              Teamplatz für alle Pokémon der Route
              <select
                value={teamSlot}
                onChange={(event) => setTeamSlot(event.target.value)}
                disabled={busy}
                className={inputClasses}
              >
                <option value="none">Nicht im Team</option>
                {TEAM_SLOTS.map((slot) => {
                  const { label, disabled: slotDisabled } = describeTeamSlot(slot, link, state.canAssignToTeam);
                  return (
                    <option key={slot} value={slot} disabled={slotDisabled}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {teamSlotChange ? (
                <span role="status" className="text-xs font-normal text-amber-800 dark:text-amber-200">
                  {teamSlotChange.hint}
                </span>
              ) : state.canAssignToTeam && link.occupiedTeamSlots && !firstFreeSlot && state.teamSlot === null ? (
                <span className="text-xs font-normal text-[var(--text-secondary)]">
                  Das Team ist voll. Wähle einen Platz, um die Route dort zu ersetzen.
                </span>
              ) : null}
              {!state.canAssignToTeam ? (
                <span className="text-xs font-normal text-[var(--text-secondary)]">
                  Ein Teamplatz ist erst möglich, wenn für jeden Spieler ein aktives Pokémon erfasst ist. „Nicht im Team“ bleibt als Reparatur verfügbar.
                </span>
              ) : null}
            </label>
          ) : null}

          {dialogAction === 'knockout' || dialogAction === 'not-caught' ? (
            <>
              <fieldset className="grid gap-1.5 text-sm font-semibold text-[var(--foreground)]" disabled={busy}>
                <legend className="mb-1.5">Verursacher</legend>
                <div className="grid grid-cols-2 gap-2">
                  {playerOptions.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      aria-pressed={causedBy === player.name}
                      onClick={() => setCausedBy(player.name)}
                      className={`min-h-11 truncate border px-3 py-2 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50 ${
                        causedBy === player.name
                          ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white'
                          : 'border-[var(--border-default)] bg-[var(--background-secondary)] text-[var(--foreground)] hover:border-[var(--brand-navy)]'
                      }`}
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </fieldset>
              <details className="text-sm font-semibold text-[var(--foreground)]">
                <summary className="min-h-11 cursor-pointer py-2">Grund hinzufügen (optional)</summary>
                <textarea
                  aria-label="Grund"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={240}
                  rows={3}
                  disabled={busy}
                  className={inputClasses}
                />
              </details>
            </>
          ) : null}

          {dialogAction === 'reactivate' && canRestoreTeamSlot ? (
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={restoreTeamSlot}
                onChange={(event) => setRestoreTeamSlot(event.target.checked)}
                disabled={busy}
                className="h-4 w-4 accent-[var(--brand-red)]"
              />
              Platz {lastTeamSlot} wieder einnehmen
            </label>
          ) : null}

          {dialogAction === 'reactivate' && lastTeamSlotOccupant ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Platz {lastTeamSlot} ist inzwischen von {lastTeamSlotOccupant.routeName} belegt. Die Route kommt ohne Teamplatz zurück.
            </p>
          ) : null}

          {dialogAction === 'delete-link' ? (
            <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
              Diese Aktion kann nicht rückgängig gemacht werden. Es werden die Pokémon aller Spieler auf dieser Route gelöscht.
            </p>
          ) : null}

          {error ? (
            <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : null}
        </EncounterAdminDialog>
      ) : null}
    </div>
  );
}

function AffectedPokemon({ link }: { link: EncounterRouteLinkTarget }) {
  return (
    <section aria-labelledby={`affected-${link.route.id}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 id={`affected-${link.route.id}`} className="text-sm font-bold text-[var(--foreground)]">
          Betroffene Pokémon
        </h3>
        <span className="rounded-full bg-[var(--background-tertiary)] px-2.5 py-1 text-xs font-semibold text-[var(--text-secondary)]">
          {link.encounters.length}
        </span>
      </div>
      <ul className="mt-2 max-h-56 divide-y divide-[var(--border-default)] overflow-y-auto rounded-xl border border-[var(--border-default)]">
        {link.encounters.map((encounter) => {
          const name = pokemonDisplayName(encounter);
          return (
            <li key={encounter.id} className="flex min-h-14 items-center gap-3 p-2.5">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--background-tertiary)]">
                {encounter.pokemon.spriteUrl ? (
                  <Image src={encounter.pokemon.spriteUrl} alt="" fill sizes="40px" className="object-contain p-0.5" />
                ) : (
                  <span className="text-[10px] font-bold text-[var(--text-secondary)]">#{encounter.pokemon.pokedexId}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-[var(--foreground)]">{name}</span>
                <span className="block truncate text-xs text-[var(--text-secondary)]">{encounter.player.name}</span>
              </span>
              <span className="text-xs font-medium text-[var(--text-secondary)]">
                {encounter.isKnockedOut
                  ? 'K.O.'
                  : encounter.isNotCaught
                    ? 'Nicht gefangen'
                    : encounter.teamSlot !== null
                      ? `Platz ${encounter.teamSlot}`
                      : 'Aktiv'}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MenuButton({
  children,
  onClick,
  danger = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-11 w-full items-center rounded-lg px-3 py-2 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? 'text-red-700 hover:bg-red-500/10 dark:text-red-300'
          : 'text-[var(--foreground)] hover:bg-[var(--background-tertiary)]'
      }`}
    >
      {children}
    </button>
  );
}
