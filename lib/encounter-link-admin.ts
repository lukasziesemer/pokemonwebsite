import type { EncounterAdminTarget } from '@/lib/encounter-admin';

export const ENCOUNTER_LINK_ADMIN_ENDPOINT = '/api/admin/encounter-links' as const;

export type EncounterLinkAdminAction =
  | { action: 'set-team-slot'; teamSlot: number | null }
  | { action: 'knockout'; causedBy: string; reason: string | null }
  | { action: 'not-caught'; causedBy: string; reason: string | null }
  | { action: 'reactivate' }
  | { action: 'delete-link' };

export type EncounterLinkAdminActionName = EncounterLinkAdminAction['action'];

export interface EncounterLinkAdminResponse {
  success: true;
  routeId: number;
  action: EncounterLinkAdminActionName;
  count: number;
  encounters: EncounterAdminTarget[];
}

export interface EncounterLinkAdminErrorResponse {
  error: string;
  conflict?: {
    routeId: number;
    routeName: string;
    teamSlot: number;
  };
}

export type EncounterLinkAdminValidationResult =
  | { ok: true; action: EncounterLinkAdminAction }
  | { ok: false; error: string };

export interface RouteCaptureCatch {
  playerId: number;
  pokemonId: number;
  nickname: string | null;
}

export type RouteCaptureOutcome =
  | { type: 'box' }
  | { type: 'team'; teamSlot: number }
  | { type: 'not-caught'; causedBy: string; reason: string | null };

export interface RouteCaptureRequest {
  catches: RouteCaptureCatch[];
  outcome: RouteCaptureOutcome;
}

export interface RouteCaptureResponse {
  success: true;
  routeId: number;
  outcome: RouteCaptureOutcome['type'];
  created: number;
  encounters: EncounterAdminTarget[];
}

export type RouteCaptureValidationResult =
  | { ok: true; capture: RouteCaptureRequest }
  | { ok: false; error: string };

export interface EncounterLinkUpdateData {
  teamSlot?: number | null;
  isKnockedOut?: boolean;
  koCausedBy?: string | null;
  koReason?: string | null;
  koDate?: Date | null;
  isNotCaught?: boolean;
  notCaughtBy?: string | null;
  notCaughtReason?: string | null;
  notCaughtDate?: Date | null;
}

export interface EncounterLinkConsistencyInput {
  id: number;
  routeId: number;
  playerId: number;
  teamSlot: number | null;
  isKnockedOut: boolean;
  koCausedBy: string | null;
  koReason: string | null;
  koDate: Date | string | null;
  isNotCaught: boolean;
  notCaughtBy: string | null;
  notCaughtReason: string | null;
  notCaughtDate: Date | string | null;
}

export type EncounterLinkConsistencyIssueCode =
  | 'mixed-route-ids'
  | 'mixed-team-slots'
  | 'mixed-status'
  | 'mixed-ko-metadata'
  | 'mixed-not-caught-metadata'
  | 'dual-status'
  | 'inactive-in-team'
  | 'stale-ko-metadata'
  | 'stale-not-caught-metadata'
  | 'missing-ko-metadata'
  | 'missing-not-caught-metadata'
  | 'incomplete-player-roster';

export interface EncounterLinkConsistencyIssue {
  code: EncounterLinkConsistencyIssueCode;
  message: string;
  encounterIds: number[];
}

export interface EncounterLinkConsistencyReport {
  routeId: number | null;
  encounterCount: number;
  activePlayerCount: number | null;
  playerCount: number;
  teamSlot: number | null;
  status: 'active' | 'knockout' | 'not-caught' | 'mixed' | 'empty';
  consistent: boolean;
  issues: EncounterLinkConsistencyIssue[];
}

export interface EncounterLinkAuditEntry extends EncounterLinkConsistencyReport {
  routeId: number;
  routeName: string;
}

export interface EncounterLinkAuditResponse {
  success: true;
  summary: {
    routeLinks: number;
    consistent: number;
    inconsistent: number;
  };
  links: EncounterLinkAuditEntry[];
}

const MAX_CAUSED_BY_LENGTH = 80;
const MAX_REASON_LENGTH = 240;
const MAX_NICKNAME_LENGTH = 60;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { ok: false as const, error: `${label} ist erforderlich` };
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return {
      ok: false as const,
      error: `${label} darf höchstens ${maxLength} Zeichen lang sein`,
    };
  }
  return { ok: true as const, value: normalized };
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === null || value === undefined || value === '') {
    return { ok: true as const, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false as const, error: `${label} muss Text oder null sein` };
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    return {
      ok: false as const,
      error: `${label} darf höchstens ${maxLength} Zeichen lang sein`,
    };
  }
  return { ok: true as const, value: normalized || null };
}

function isTeamSlot(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function parseRouteCaptureOutcome(value: unknown) {
  if (!isRecord(value)) {
    return { ok: false as const, error: 'Ein gültiges Fangergebnis ist erforderlich' };
  }

  switch (value.type) {
    case 'box':
      return { ok: true as const, outcome: { type: 'box' as const } };
    case 'team':
      if (!isTeamSlot(value.teamSlot)) {
        return { ok: false as const, error: 'Teamplatz muss zwischen 1 und 6 liegen' };
      }
      return { ok: true as const, outcome: { type: 'team' as const, teamSlot: value.teamSlot } };
    case 'not-caught': {
      const causedBy = requiredText(value.causedBy, 'Verursacher', MAX_CAUSED_BY_LENGTH);
      if (!causedBy.ok) return causedBy;
      const reason = optionalText(value.reason, 'Grund', MAX_REASON_LENGTH);
      if (!reason.ok) return reason;
      return {
        ok: true as const,
        outcome: { type: 'not-caught' as const, causedBy: causedBy.value, reason: reason.value },
      };
    }
    default:
      return { ok: false as const, error: 'Ein gültiges Fangergebnis ist erforderlich' };
  }
}

export function parseRouteCapture(value: unknown): RouteCaptureValidationResult {
  if (!isRecord(value) || !Array.isArray(value.catches) || value.catches.length === 0) {
    return { ok: false, error: 'Mindestens ein Pokémon ist erforderlich' };
  }

  const catches: RouteCaptureCatch[] = [];
  for (const entry of value.catches) {
    if (!isRecord(entry) || !isPositiveId(entry.playerId) || !isPositiveId(entry.pokemonId)) {
      return { ok: false, error: 'Jeder Fang braucht eine gültige Spieler- und Pokémon-ID' };
    }
    if (catches.some((existing) => existing.playerId === entry.playerId)) {
      return { ok: false, error: 'Jeder Spieler darf nur 1 Pokémon pro Route fangen' };
    }
    const nickname = optionalText(entry.nickname, 'Spitzname', MAX_NICKNAME_LENGTH);
    if (!nickname.ok) return nickname;
    catches.push({ playerId: entry.playerId, pokemonId: entry.pokemonId, nickname: nickname.value });
  }

  const outcome = parseRouteCaptureOutcome(value.outcome);
  if (!outcome.ok) return outcome;

  return { ok: true, capture: { catches, outcome: outcome.outcome } };
}

export function parseEncounterLinkAdminAction(
  value: unknown,
): EncounterLinkAdminValidationResult {
  if (!isRecord(value) || typeof value.action !== 'string') {
    return { ok: false, error: 'Eine gültige Link-Aktion ist erforderlich' };
  }

  switch (value.action) {
    case 'set-team-slot':
      if (value.teamSlot !== null && !isTeamSlot(value.teamSlot)) {
        return { ok: false, error: 'Teamplatz muss zwischen 1 und 6 liegen oder null sein' };
      }
      return {
        ok: true,
        action: { action: 'set-team-slot', teamSlot: value.teamSlot },
      };
    case 'knockout':
    case 'not-caught': {
      const causedBy = requiredText(value.causedBy, 'Verursacher', MAX_CAUSED_BY_LENGTH);
      if (!causedBy.ok) return causedBy;
      const reason = optionalText(value.reason, 'Grund', MAX_REASON_LENGTH);
      if (!reason.ok) return reason;
      return {
        ok: true,
        action: { action: value.action, causedBy: causedBy.value, reason: reason.value },
      };
    }
    case 'reactivate':
      return { ok: true, action: { action: 'reactivate' } };
    case 'delete-link':
      return { ok: true, action: { action: 'delete-link' } };
    default:
      return { ok: false, error: `Unbekannte Link-Aktion: ${value.action}` };
  }
}

export function buildEncounterLinkUpdate(
  action: Exclude<EncounterLinkAdminAction, { action: 'delete-link' }>,
  now: Date = new Date(),
): EncounterLinkUpdateData {
  switch (action.action) {
    case 'set-team-slot':
      return { teamSlot: action.teamSlot };
    case 'knockout':
      return {
        teamSlot: null,
        isKnockedOut: true,
        koCausedBy: action.causedBy,
        koReason: action.reason,
        koDate: now,
        isNotCaught: false,
        notCaughtBy: null,
        notCaughtReason: null,
        notCaughtDate: null,
      };
    case 'not-caught':
      return {
        teamSlot: null,
        isNotCaught: true,
        notCaughtBy: action.causedBy,
        notCaughtReason: action.reason,
        notCaughtDate: now,
        isKnockedOut: false,
        koCausedBy: null,
        koReason: null,
        koDate: null,
      };
    case 'reactivate':
      return {
        teamSlot: null,
        isKnockedOut: false,
        koCausedBy: null,
        koReason: null,
        koDate: null,
        isNotCaught: false,
        notCaughtBy: null,
        notCaughtReason: null,
        notCaughtDate: null,
      };
  }
}

function normalizedDate(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function distinctValues<T>(values: T[]) {
  return new Set(values).size;
}

export function auditEncounterLinkGroup(
  encounters: EncounterLinkConsistencyInput[],
  activePlayerIds?: number[],
): EncounterLinkConsistencyReport {
  if (encounters.length === 0) {
    return {
      routeId: null,
      encounterCount: 0,
      activePlayerCount: activePlayerIds?.length ?? null,
      playerCount: 0,
      teamSlot: null,
      status: 'empty',
      consistent: true,
      issues: [],
    };
  }

  const issues: EncounterLinkConsistencyIssue[] = [];
  const allIds = encounters.map((encounter) => encounter.id);
  const routeIds = encounters.map((encounter) => encounter.routeId);
  const slots = encounters.map((encounter) => encounter.teamSlot);
  const statuses = encounters.map((encounter) =>
    encounter.isKnockedOut
      ? encounter.isNotCaught
        ? 'dual'
        : 'knockout'
      : encounter.isNotCaught
        ? 'not-caught'
        : 'active',
  );

  const addIssue = (
    code: EncounterLinkConsistencyIssueCode,
    message: string,
    affected = allIds,
  ) => issues.push({ code, message, encounterIds: affected });

  if (distinctValues(routeIds) > 1) {
    addIssue('mixed-route-ids', 'Die Gruppe enthält mehrere routeIds.');
  }
  if (distinctValues(slots) > 1) {
    addIssue('mixed-team-slots', 'Die Encounters besitzen unterschiedliche Teamplätze.');
  }
  if (distinctValues(statuses) > 1) {
    addIssue('mixed-status', 'Die Encounters besitzen unterschiedliche Status.');
  }

  const dualStatus = encounters.filter(
    (encounter) => encounter.isKnockedOut && encounter.isNotCaught,
  );
  if (dualStatus.length > 0) {
    addIssue(
      'dual-status',
      'Mindestens ein Encounter ist gleichzeitig K.O. und nicht gefangen.',
      dualStatus.map((encounter) => encounter.id),
    );
  }

  const inactiveInTeam = encounters.filter(
    (encounter) =>
      encounter.teamSlot !== null && (encounter.isKnockedOut || encounter.isNotCaught),
  );
  if (inactiveInTeam.length > 0) {
    addIssue(
      'inactive-in-team',
      'K.O. oder nicht gefangene Encounters dürfen keinen Teamplatz besitzen.',
      inactiveInTeam.map((encounter) => encounter.id),
    );
  }

  const koMetadata = encounters.map((encounter) =>
    JSON.stringify([
      encounter.koCausedBy,
      encounter.koReason,
      normalizedDate(encounter.koDate),
    ]),
  );
  if (distinctValues(koMetadata) > 1) {
    addIssue('mixed-ko-metadata', 'Die K.O.-Metadaten unterscheiden sich innerhalb des Links.');
  }
  const notCaughtMetadata = encounters.map((encounter) =>
    JSON.stringify([
      encounter.notCaughtBy,
      encounter.notCaughtReason,
      normalizedDate(encounter.notCaughtDate),
    ]),
  );
  if (distinctValues(notCaughtMetadata) > 1) {
    addIssue(
      'mixed-not-caught-metadata',
      'Die Nicht-gefangen-Metadaten unterscheiden sich innerhalb des Links.',
    );
  }

  const staleKoMetadata = encounters.filter(
    (encounter) =>
      !encounter.isKnockedOut &&
      (encounter.koCausedBy !== null || encounter.koReason !== null || encounter.koDate !== null),
  );
  if (staleKoMetadata.length > 0) {
    addIssue(
      'stale-ko-metadata',
      'Aktive Encounters enthalten veraltete K.O.-Metadaten.',
      staleKoMetadata.map((encounter) => encounter.id),
    );
  }
  const staleNotCaughtMetadata = encounters.filter(
    (encounter) =>
      !encounter.isNotCaught &&
      (encounter.notCaughtBy !== null ||
        encounter.notCaughtReason !== null ||
        encounter.notCaughtDate !== null),
  );
  if (staleNotCaughtMetadata.length > 0) {
    addIssue(
      'stale-not-caught-metadata',
      'Aktive Encounters enthalten veraltete Nicht-gefangen-Metadaten.',
      staleNotCaughtMetadata.map((encounter) => encounter.id),
    );
  }
  const missingKoMetadata = encounters.filter(
    (encounter) =>
      encounter.isKnockedOut &&
      (!encounter.koCausedBy?.trim() || encounter.koDate === null),
  );
  if (missingKoMetadata.length > 0) {
    addIssue(
      'missing-ko-metadata',
      'K.O.-Encounters benötigen Verursacher und Zeitpunkt.',
      missingKoMetadata.map((encounter) => encounter.id),
    );
  }
  const missingNotCaughtMetadata = encounters.filter(
    (encounter) =>
      encounter.isNotCaught &&
      (!encounter.notCaughtBy?.trim() || encounter.notCaughtDate === null),
  );
  if (missingNotCaughtMetadata.length > 0) {
    addIssue(
      'missing-not-caught-metadata',
      'Nicht-gefangen-Encounters benötigen Verursacher und Zeitpunkt.',
      missingNotCaughtMetadata.map((encounter) => encounter.id),
    );
  }

  const playerIds = new Set(encounters.map((encounter) => encounter.playerId));
  if (activePlayerIds) {
    const missingPlayers = activePlayerIds.filter((playerId) => !playerIds.has(playerId));
    if (missingPlayers.length > 0) {
      addIssue(
        'incomplete-player-roster',
        `Für ${missingPlayers.length} aktive Spieler fehlt ein Encounter.`,
        [],
      );
    }
  }

  const status = distinctValues(statuses) === 1 && statuses[0] !== 'dual'
    ? (statuses[0] as 'active' | 'knockout' | 'not-caught')
    : 'mixed';

  return {
    routeId: distinctValues(routeIds) === 1 ? routeIds[0] : null,
    encounterCount: encounters.length,
    activePlayerCount: activePlayerIds?.length ?? null,
    playerCount: playerIds.size,
    teamSlot: distinctValues(slots) === 1 ? slots[0] : null,
    status,
    consistent: issues.length === 0,
    issues,
  };
}

export async function mutateEncounterLink(
  routeId: number,
  action: EncounterLinkAdminAction,
  signal?: AbortSignal,
): Promise<EncounterLinkAdminResponse> {
  const response = await fetch(`${ENCOUNTER_LINK_ADMIN_ENDPOINT}/${routeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(action),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as
    | EncounterLinkAdminResponse
    | EncounterLinkAdminErrorResponse
    | null;

  if (!response.ok || !payload || !('encounters' in payload)) {
    throw new Error(payload && 'error' in payload ? payload.error : 'Link-Änderung fehlgeschlagen');
  }
  return payload;
}

export async function captureRoute(
  routeId: number,
  capture: RouteCaptureRequest,
): Promise<RouteCaptureResponse> {
  const response = await fetch(`${ENCOUNTER_LINK_ADMIN_ENDPOINT}/${routeId}/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(capture),
  });
  const payload = (await response.json().catch(() => null)) as
    | RouteCaptureResponse
    | EncounterLinkAdminErrorResponse
    | null;

  if (!response.ok || !payload || !('encounters' in payload)) {
    throw new Error(payload && 'error' in payload ? payload.error : 'Fang konnte nicht gespeichert werden');
  }
  return payload;
}
