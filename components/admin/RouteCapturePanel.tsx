'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import PlayerAvatar from '@/components/PlayerAvatar';
import { captureRoute, type RouteCaptureOutcome } from '@/lib/encounter-link-admin';
import type { PokemonListItem } from '@/lib/types';
import PokemonCombobox from './PokemonCombobox';
import {
  TEAM_SLOTS,
  getFirstFreeTeamSlot,
  getOccupiedTeamSlots,
  getOpenCaptureRoutes,
} from './route-link-ui';

interface CaptureRoute {
  id: number;
  name: string;
  encounters: {
    teamSlot: number | null;
    isKnockedOut: boolean;
    isNotCaught: boolean;
    nickname: string | null;
    player: { id: number };
    pokemon: { name: string; nameGerman: string | null };
  }[];
}

interface CapturePlayer {
  id: number;
  name: string;
  color: string;
  avatar: string | null;
}

interface RouteCapturePanelProps {
  routes: CaptureRoute[];
  players: CapturePlayer[];
  pokemon: PokemonListItem[];
  /** Neu angelegte Route: wird ausgewählt, damit die Erfassung direkt weitergeht. */
  focusRouteId: number | null;
  onCaptured: () => void | Promise<void>;
}

interface CaptureDraft {
  search: string;
  pokemon: PokemonListItem | null;
  nickname: string;
}

type OutcomeType = RouteCaptureOutcome['type'];

const EMPTY_DRAFT: CaptureDraft = { search: '', pokemon: null, nickname: '' };

const fieldClasses =
  'min-h-11 w-full border border-[var(--border-default)] bg-[var(--card-bg)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-blue)] disabled:opacity-50';
const labelClasses = 'text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]';

function pokemonName(pokemon: { name: string; nameGerman: string | null }) {
  return pokemon.nameGerman || pokemon.name;
}

/** Erfasst einen Fang in einem Zug: Pokémon aller Spieler plus Teamplatz oder Status. */
export default function RouteCapturePanel({
  routes,
  players,
  pokemon,
  focusRouteId,
  onCaptured,
}: RouteCapturePanelProps) {
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, CaptureDraft>>({});
  const [outcomeType, setOutcomeType] = useState<OutcomeType>('box');
  const [teamSlot, setTeamSlot] = useState<number | null>(null);
  const [causedBy, setCausedBy] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [syncedFocusRouteId, setSyncedFocusRouteId] = useState(focusRouteId);
  const formRef = useRef<HTMLFormElement>(null);

  // Eine neu angelegte Route ersetzt die bisherige Auswahl.
  if (syncedFocusRouteId !== focusRouteId) {
    setSyncedFocusRouteId(focusRouteId);
    setSelectedRouteId(focusRouteId);
  }

  const playerIds = useMemo(() => players.map((player) => player.id), [players]);
  const openRoutes = useMemo(() => getOpenCaptureRoutes(routes, playerIds), [routes, playerIds]);
  const occupiedTeamSlots = useMemo(() => getOccupiedTeamSlots(routes), [routes]);
  const route = openRoutes.find((candidate) => candidate.id === selectedRouteId) ?? openRoutes[0] ?? null;
  const openPlayers = players.filter(
    (player) => !route?.encounters.some((encounter) => encounter.player.id === player.id),
  );

  const firstFreeSlot = getFirstFreeTeamSlot(occupiedTeamSlots);
  const chosenSlot = teamSlot !== null && !occupiedTeamSlots[teamSlot] ? teamSlot : firstFreeSlot;
  // Eine bereits aufgestellte Route behält ihren Platz; neue Pokémon übernehmen ihn serverseitig.
  const routeTeamSlot = route?.encounters.find((encounter) => encounter.teamSlot !== null)?.teamSlot ?? null;
  const canChooseTeam = firstFreeSlot !== null && routeTeamSlot === null;
  const outcome: OutcomeType = outcomeType === 'team' && !canChooseTeam ? 'box' : outcomeType;

  const catches = openPlayers.flatMap((player) => {
    const draft = drafts[player.id];
    return draft?.pokemon
      ? [{ playerId: player.id, pokemonId: draft.pokemon.id, nickname: draft.nickname.trim() || null }]
      : [];
  });
  const missingPlayers = openPlayers.filter((player) => !drafts[player.id]?.pokemon);

  const blocker =
    catches.length === 0
      ? 'Wähle mindestens ein Pokémon aus.'
      : outcome === 'team' && missingPlayers.length > 0
        ? `Für das Team fehlt noch: ${missingPlayers.map((player) => player.name).join(', ')}.`
        : outcome === 'not-caught' && !causedBy
          ? 'Wähle aus, wer verantwortlich ist.'
          : null;

  const updateDraft = (playerId: number, change: Partial<CaptureDraft>) => {
    setDrafts((current) => ({
      ...current,
      [playerId]: { ...EMPTY_DRAFT, ...current[playerId], ...change },
    }));
  };

  const focusSearch = (playerId?: number) => {
    window.setTimeout(() => {
      const form = formRef.current;
      const search = playerId === undefined
        ? form?.querySelector<HTMLElement>('[role="combobox"]')
        : form?.querySelector<HTMLElement>(`[data-capture-player="${playerId}"] [role="combobox"]`);
      search?.focus();
    }, 0);
  };

  const handleSelect = (playerId: number, selected: PokemonListItem) => {
    updateDraft(playerId, { search: '', pokemon: selected });
    const next = openPlayers.find((player) => player.id !== playerId && !drafts[player.id]?.pokemon);
    if (next) {
      focusSearch(next.id);
    } else {
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[data-capture-submit]')?.focus(), 0);
    }
  };

  useEffect(() => {
    if (focusRouteId === null) return;
    formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    focusSearch();
  }, [focusRouteId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!route || blocker || busy) return;

    let result: RouteCaptureOutcome = { type: 'box' };
    if (outcome === 'team' && chosenSlot !== null) result = { type: 'team', teamSlot: chosenSlot };
    if (outcome === 'not-caught') result = { type: 'not-caught', causedBy, reason: reason.trim() || null };

    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      await captureRoute(route.id, { catches, outcome: result });
      await onCaptured();
      setDrafts({});
      setSelectedRouteId(null);
      setOutcomeType('box');
      setTeamSlot(null);
      setCausedBy('');
      setReason('');
      setSaved(
        result.type === 'team'
          ? `${route.name} gespeichert, Platz ${result.teamSlot} im Team.`
          : result.type === 'not-caught'
            ? `${route.name} als nicht gefangen gespeichert.`
            : `${route.name} gespeichert.`,
      );
      // Auf Touchgeräten würde der Fokus ungefragt die Bildschirmtastatur öffnen.
      if (window.matchMedia('(pointer: fine)').matches) focusSearch();
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : 'Fang konnte nicht gespeichert werden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      aria-labelledby="route-capture-title"
      className="mb-4 border-y border-[var(--border-default)] bg-[var(--surface-subtle)] p-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h3 id="route-capture-title" className="text-lg font-black uppercase leading-tight text-[var(--foreground)]">
          Fang erfassen
        </h3>
        {route ? (
          <div className="min-w-[12rem] flex-1 sm:max-w-xs">
            <label htmlFor="capture-route" className={labelClasses}>Route</label>
            <select
              id="capture-route"
              value={route.id}
              onChange={(event) => setSelectedRouteId(Number(event.target.value))}
              disabled={busy}
              className={`${fieldClasses} mt-1`}
            >
              {openRoutes.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {saved ? (
        <p role="status" className="mt-3 border-l-4 border-emerald-500 bg-emerald-500/5 px-3 py-2 text-sm font-bold text-emerald-700 dark:text-emerald-300">
          {saved}
        </p>
      ) : null}

      {!route ? (
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Alle Routen sind erfasst. Lege oben eine neue Route an, um weiterzumachen.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))] gap-3">
            {players.map((player) => {
              const existing = route.encounters.find((encounter) => encounter.player.id === player.id);
              const draft = drafts[player.id] ?? EMPTY_DRAFT;

              return (
                <div key={player.id} data-capture-player={player.id} className="min-w-0 space-y-2">
                  <div className="flex items-center gap-2 border-b-2 pb-1" style={{ borderColor: player.color }}>
                    <PlayerAvatar avatar={player.avatar} name={player.name} color={player.color} size={24} className="h-6 w-6" />
                    <h4 className="truncate text-sm font-black uppercase text-[var(--foreground)]">{player.name}</h4>
                  </div>

                  {existing ? (
                    <p className="min-h-11 py-2 text-sm text-[var(--text-secondary)]">
                      Bereits erfasst: {existing.nickname || pokemonName(existing.pokemon)}
                    </p>
                  ) : draft.pokemon ? (
                    <>
                      <div className="flex min-h-11 items-center justify-between gap-2 border border-[var(--border-default)] bg-[var(--card-bg)] px-3">
                        <span className="truncate text-sm font-bold text-[var(--foreground)]">
                          <span className="mr-2 font-normal text-[var(--text-secondary)]">#{draft.pokemon.pokedexId}</span>
                          {pokemonName(draft.pokemon)}
                        </span>
                        <button
                          type="button"
                          aria-label={`Pokémon von ${player.name} ändern`}
                          onClick={() => {
                            updateDraft(player.id, { pokemon: null });
                            focusSearch(player.id);
                          }}
                          disabled={busy}
                          className="min-h-9 shrink-0 px-1 text-xs font-bold text-[var(--brand-blue)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)]"
                        >
                          Ändern
                        </button>
                      </div>
                      <input
                        aria-label={`Spitzname für ${player.name}`}
                        placeholder="Spitzname (optional)"
                        value={draft.nickname}
                        onChange={(event) => updateDraft(player.id, { nickname: event.target.value })}
                        maxLength={60}
                        disabled={busy}
                        className={fieldClasses}
                      />
                    </>
                  ) : (
                    <PokemonCombobox
                      label={`Pokémon für ${player.name}`}
                      value={draft.search}
                      onChange={(search) => updateDraft(player.id, { search })}
                      options={pokemon}
                      onSelect={(selected) => handleSelect(player.id, selected)}
                      disabled={busy}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <fieldset className="mt-3" disabled={busy}>
            <legend className={labelClasses}>Ergebnis</legend>
            <div className="mt-1 flex flex-wrap gap-x-4">
              <OutcomeOption
                label={routeTeamSlot !== null ? `Bleibt auf Platz ${routeTeamSlot}` : 'Nur erfassen'}
                checked={outcome === 'box'}
                onChange={() => setOutcomeType('box')}
              />
              <OutcomeOption
                label={firstFreeSlot === null ? 'Ins Team (voll)' : 'Ins Team'}
                checked={outcome === 'team'}
                disabled={!canChooseTeam}
                onChange={() => setOutcomeType('team')}
              />
              <OutcomeOption
                label="Nicht gefangen"
                checked={outcome === 'not-caught'}
                onChange={() => setOutcomeType('not-caught')}
              />
            </div>
          </fieldset>

          {outcome === 'team' ? (
            <div className="mt-2 sm:max-w-xs">
              <label htmlFor="capture-team-slot" className={labelClasses}>Teamplatz</label>
              <select
                id="capture-team-slot"
                value={chosenSlot ?? ''}
                onChange={(event) => setTeamSlot(Number(event.target.value))}
                disabled={busy}
                className={`${fieldClasses} mt-1`}
              >
                {TEAM_SLOTS.map((slot) => {
                  const occupant = occupiedTeamSlots[slot];
                  return (
                    <option key={slot} value={slot} disabled={Boolean(occupant)}>
                      {`Platz ${slot} · ${occupant ? occupant.routeName : 'frei'}`}
                    </option>
                  );
                })}
              </select>
            </div>
          ) : null}

          {outcome === 'not-caught' ? (
            <div className="mt-2 space-y-2">
              <p className={labelClasses}>Verantwortlich</p>
              <div className="flex flex-wrap gap-2">
                {players.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    aria-pressed={causedBy === player.name}
                    onClick={() => setCausedBy(player.name)}
                    disabled={busy}
                    className={`min-h-11 border px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-blue)] disabled:opacity-50 ${
                      causedBy === player.name
                        ? 'border-[var(--brand-navy)] bg-[var(--brand-navy)] text-white'
                        : 'border-[var(--border-default)] bg-[var(--card-bg)] text-[var(--foreground)] hover:border-[var(--brand-navy)]'
                    }`}
                  >
                    {player.name}
                  </button>
                ))}
              </div>
              <input
                aria-label="Grund"
                placeholder="Grund (optional)"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={240}
                disabled={busy}
                className={fieldClasses}
              />
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="mt-3 border-l-4 border-red-500 bg-red-500/5 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
            {blocker ? <p className="text-sm text-[var(--text-secondary)]">{blocker}</p> : null}
            <button
              type="submit"
              data-capture-submit
              disabled={busy || blocker !== null}
              className="app-action-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? 'Wird gespeichert…' : 'Fang speichern'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}

function OutcomeOption({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--foreground)] ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <input
        type="radio"
        name="capture-outcome"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        className="h-4 w-4 accent-[var(--brand-red)]"
      />
      {label}
    </label>
  );
}
