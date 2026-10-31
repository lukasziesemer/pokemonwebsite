/**
 * Shared contract for administering one encounter.
 *
 * This endpoint is intentionally limited to attributes that belong to one
 * player's encounter. Route-link actions live in encounter-link-admin.ts.
 */

export const ENCOUNTER_ADMIN_ENDPOINT = '/api/admin/encounters' as const;

export type EncounterAdminAction =
  | { action: 'swap-pokemon'; pokemonId: number }
  | { action: 'update-nickname'; nickname: string | null };

export type EncounterAdminActionName = EncounterAdminAction['action'];

export interface EncounterAdminTarget {
  id: number;
  nickname: string | null;
  teamSlot: number | null;
  /** Platz vor K.O. oder „Nicht gefangen“; fehlt, wo er nicht gebraucht wird. */
  lastTeamSlot?: number | null;
  isKnockedOut: boolean;
  koCausedBy: string | null;
  koReason: string | null;
  koDate: string | null;
  isNotCaught: boolean;
  notCaughtBy: string | null;
  notCaughtReason: string | null;
  notCaughtDate: string | null;
  player: {
    id: number;
    name: string;
    color: string;
  };
  route: {
    id: number;
    name: string;
  };
  pokemon: {
    id: number;
    pokedexId: number;
    name: string;
    nameGerman: string | null;
    spriteUrl: string | null;
    spriteGifUrl: string | null;
  };
}

export interface EncounterAdminResponse {
  success: true;
  encounter: EncounterAdminTarget;
}

export interface EncounterAdminErrorResponse {
  error: string;
}

export interface EncounterAdminUpdateData {
  pokemonId?: number;
  nickname?: string | null;
}

export type EncounterAdminValidationResult =
  | { ok: true; action: EncounterAdminAction }
  | { ok: false; error: string };

export type EncounterAdminUpdateResult =
  | { ok: true; data: EncounterAdminUpdateData }
  | { ok: false; error: string };

const MAX_NICKNAME_LENGTH = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizedOptionalString(
  value: unknown,
  label: string,
  maxLength: number,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, error: `${label} muss Text oder null sein` };
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return { ok: false, error: `${label} darf höchstens ${maxLength} Zeichen lang sein` };
  }

  return { ok: true, value: normalized || null };
}

export function parseEncounterAdminAction(value: unknown): EncounterAdminValidationResult {
  if (!isRecord(value) || typeof value.action !== 'string') {
    return { ok: false, error: 'Eine gültige Aktion ist erforderlich' };
  }

  switch (value.action) {
    case 'swap-pokemon': {
      if (
        typeof value.pokemonId !== 'number' ||
        !Number.isInteger(value.pokemonId) ||
        value.pokemonId < 1
      ) {
        return { ok: false, error: 'Eine gültige Pokémon-ID ist erforderlich' };
      }
      return { ok: true, action: { action: 'swap-pokemon', pokemonId: value.pokemonId } };
    }
    case 'update-nickname': {
      const nickname = normalizedOptionalString(
        value.nickname,
        'Spitzname',
        MAX_NICKNAME_LENGTH,
      );
      if (!nickname.ok) return nickname;
      return { ok: true, action: { action: 'update-nickname', nickname: nickname.value } };
    }
    default:
      return { ok: false, error: `Unbekannte Aktion: ${value.action}` };
  }
}

/**
 * Produces the one-row update for the two individual-only actions.
 */
export function buildEncounterAdminUpdate(
  action: EncounterAdminAction,
): EncounterAdminUpdateResult {
  switch (action.action) {
    case 'swap-pokemon':
      return { ok: true, data: { pokemonId: action.pokemonId } };
    case 'update-nickname':
      return { ok: true, data: { nickname: action.nickname } };
  }
}

export async function mutateEncounterAdmin(
  encounterId: number,
  action: EncounterAdminAction,
  signal?: AbortSignal,
): Promise<EncounterAdminTarget> {
  const response = await fetch(`${ENCOUNTER_ADMIN_ENDPOINT}/${encounterId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | EncounterAdminResponse
    | EncounterAdminErrorResponse
    | null;

  if (!response.ok || !payload || !('encounter' in payload)) {
    throw new Error(payload && 'error' in payload ? payload.error : 'Änderung fehlgeschlagen');
  }

  return payload.encounter;
}

export async function deleteEncounterAdmin(
  encounterId: number,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${ENCOUNTER_ADMIN_ENDPOINT}/${encounterId}`, {
    method: 'DELETE',
    signal,
  });
  if (response.ok) return;

  const payload = (await response.json().catch(() => null)) as EncounterAdminErrorResponse | null;
  throw new Error(payload?.error ?? 'Begegnung konnte nicht gelöscht werden');
}
