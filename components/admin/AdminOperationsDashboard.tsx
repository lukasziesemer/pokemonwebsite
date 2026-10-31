import Image from 'next/image';
import Link from 'next/link';
import AssignRouteButton from './AssignRouteButton';
import {
  getFirstFreeTeamSlot,
  getPlayerTeamSummary,
  getPokemonDisplayName,
  TEAM_SIZE,
  type AdminDashboardData,
  type AdminDashboardEvent,
  type AdminDashboardPokemon,
  type AdminDashboardTeamMember,
} from '@/app/admin/dashboard-model';

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Berlin',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeZone: 'Europe/Berlin',
});

function formatDateTime(value: Date | null) {
  return value ? DATE_TIME_FORMATTER.format(value) : 'Zeitpunkt fehlt';
}

function PokemonIdentity({
  pokemon,
  nickname,
  compact = false,
}: {
  pokemon: AdminDashboardPokemon;
  nickname?: string | null;
  compact?: boolean;
}) {
  const displayName = nickname || getPokemonDisplayName(pokemon);

  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        className={`${compact ? 'h-8 w-8' : 'h-10 w-10'} relative flex shrink-0 items-center justify-center rounded-lg bg-[var(--background-tertiary)]`}
      >
        {pokemon.spriteUrl ? (
          <Image
            src={pokemon.spriteUrl}
            alt=""
            fill
            sizes={compact ? '32px' : '40px'}
            className="object-contain p-0.5"
          />
        ) : (
          <span className="text-[10px] font-bold text-[var(--text-secondary)]">
            #{pokemon.pokedexId}
          </span>
        )}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-[var(--foreground)]">
          {displayName}
        </span>
        {nickname ? (
          <span className="block truncate text-xs text-[var(--text-secondary)]">
            {getPokemonDisplayName(pokemon)} · #{pokemon.pokedexId}
          </span>
        ) : (
          <span className="block text-xs text-[var(--text-secondary)]">
            #{pokemon.pokedexId}
          </span>
        )}
      </span>
    </span>
  );
}

function SectionHeading({
  title,
  description,
  trailing,
}: {
  title: string;
  description: string;
  trailing?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 border-b border-white/15 bg-[var(--brand-navy)] px-4 py-3 text-white sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div>
        <h2 className="font-[var(--font-display)] text-lg font-black uppercase tracking-[-0.02em] text-white">{title}</h2>
        <p className="mt-1 text-sm text-white/65">{description}</p>
      </div>
      {trailing}
    </header>
  );
}

function UnavailableState({ children }: { children: React.ReactNode }) {
  return (
    <p className="m-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
      {children}
    </p>
  );
}

function CurrentRunSection({ data }: { data: AdminDashboardData }) {
  const run = data.activeRun;

  return (
    <section
      className="app-section overflow-hidden"
      aria-labelledby="current-run-heading"
    >
      <SectionHeading
        title="Aktueller Run"
        description="Spielstatus und zentrale Run-Daten auf einen Blick"
        trailing={
          data.activeRunAvailable ? (
            <span
              className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                run?.pausedAt
                  ? 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                  : run
                    ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-[var(--border-default)] bg-[var(--background-secondary)] text-[var(--text-secondary)]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${run?.pausedAt ? 'bg-amber-500' : run ? 'bg-emerald-500' : 'bg-[var(--text-tertiary)]'}`}
              />
              {run?.pausedAt ? 'Pausiert' : run ? 'Läuft' : 'Kein aktiver Run'}
            </span>
          ) : null
        }
      />

      {!data.activeRunAvailable ? (
        <UnavailableState>Der Runstatus ist momentan nicht verfügbar.</UnavailableState>
      ) : run ? (
        <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <p className="text-2xl font-bold text-[var(--foreground)]">
              Run #{run.runNumber}
              <span className="mt-1 block text-base font-semibold text-[var(--text-secondary)] sm:ml-2 sm:mt-0 sm:inline">
                {run.gameVersion?.name || 'Spielversion nicht zugeordnet'}
              </span>
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
              <div>
                <dt className="text-xs font-medium text-[var(--text-secondary)]">Status</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
                  {run.pausedAt ? 'Pausiert' : 'Aktiv'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--text-secondary)]">Gestartet</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
                  {DATE_FORMATTER.format(run.startedAt)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--text-secondary)]">Orden</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
                  {run.badgesEarned} von 8
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--text-secondary)]">Generation</dt>
                <dd className="mt-0.5 text-sm font-semibold text-[var(--foreground)]">
                  {run.gameVersion ? run.gameVersion.generation : 'Nicht erfasst'}
                </dd>
              </div>
            </dl>
          </div>
          <Link
            href="/admin/gamesaves"
            className="app-action-primary min-h-11 justify-center"
          >
            Run verwalten
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="font-semibold text-[var(--foreground)]">Kein aktiver Run erfasst</p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Starte einen Run, damit Spielstatus und Fortschritt hier erscheinen.
            </p>
          </div>
          <Link
            href="/admin/gamesaves"
            className="app-action-primary min-h-11 justify-center"
          >
            Run starten
          </Link>
        </div>
      )}
    </section>
  );
}

function TeamSlot({ slot, member }: { slot: number; member: AdminDashboardTeamMember | null }) {
  if (!member) {
    return (
      <div className="flex min-h-14 items-center gap-2 border border-dashed border-[var(--border-default)] bg-[var(--background-secondary)] px-3 py-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--background-tertiary)] text-xs font-bold text-[var(--text-secondary)]">
          {slot}
        </span>
        <span className="text-sm font-medium text-[var(--text-secondary)]">Frei</span>
      </div>
    );
  }

  return (
    <div className="flex min-h-14 min-w-0 items-center gap-2 border border-[var(--border-default)] bg-[var(--card-bg-elevated)] px-2.5 py-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[var(--brand-blue)] text-xs font-bold text-white">
        {slot}
      </span>
      <PokemonIdentity pokemon={member.pokemon} nickname={member.nickname} compact />
    </div>
  );
}

function TeamsSection({ data }: { data: AdminDashboardData }) {
  return (
    <section
      className="app-section overflow-hidden"
      aria-labelledby="teams-heading"
    >
      <SectionHeading
        title="Teambelegung"
        description="Belegte und freie Plätze pro Spieler"
        trailing={
          <Link
            href="/pokeroute"
            className="inline-flex min-h-10 items-center text-sm font-semibold text-blue-600 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Teams bearbeiten
          </Link>
        }
      />

      {!data.teamsAvailable ? (
        <UnavailableState>Die Teambelegung ist momentan nicht verfügbar.</UnavailableState>
      ) : data.players.length === 0 ? (
        <p className="p-5 text-sm text-[var(--text-secondary)]">
          Noch keine Spieler angelegt.
        </p>
      ) : (
        <div className="divide-y divide-[var(--border-default)]">
          {data.players.map((player) => {
            const summary = getPlayerTeamSummary(player);

            return (
              <article key={player.id} className="p-4 sm:p-5">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-[var(--foreground)]">{player.name}</h3>
                    <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
                      {summary.occupied} von {TEAM_SIZE} belegt · {summary.free} frei
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-[var(--foreground)]">
                    {summary.percentage}%
                  </span>
                </div>
                <div
                  className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--background-tertiary)]"
                  role="progressbar"
                  aria-label={`${player.name}: ${summary.occupied} von ${TEAM_SIZE} Teamplätzen belegt`}
                  aria-valuemin={0}
                  aria-valuemax={TEAM_SIZE}
                  aria-valuenow={summary.occupied}
                >
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{ width: `${summary.percentage}%`, backgroundColor: player.color }}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-6">
                  {summary.slots.map((member, index) => (
                    <TeamSlot key={index + 1} slot={index + 1} member={member} />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function AssignmentsSection({ data }: { data: AdminDashboardData }) {
  const total = data.openRouteCount;
  const freeSlot = getFirstFreeTeamSlot(data.players);

  return (
    <section
      className="app-section overflow-hidden"
      aria-labelledby="assignments-heading"
    >
      <SectionHeading
        title="Offene Routen"
        description="Aktive Routen ohne Teamplatz"
        trailing={
          total !== null ? (
            <span className="w-fit rounded-full border border-blue-400/40 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
              {total} offen
            </span>
          ) : null
        }
      />

      {!data.assignmentsAvailable ? (
        <UnavailableState>Offene Teamzuweisungen sind momentan nicht verfügbar.</UnavailableState>
      ) : total === 0 ? (
        <div className="p-5">
          <p className="font-semibold text-emerald-700 dark:text-emerald-300">
            Alle aktiven Routen sind zugeordnet.
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Derzeit ist keine Teamentscheidung offen.
          </p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-[var(--border-default)]">
            {data.openRoutes.map((route) => (
              <li key={route.routeId} className="space-y-3 p-4">
                <p className="font-bold text-[var(--foreground)]">{route.routeName}</p>
                <ul className="space-y-2">
                  {route.encounters.map((encounter) => (
                    <li key={encounter.id} className="flex items-center justify-between gap-3">
                      <PokemonIdentity pokemon={encounter.pokemon} nickname={encounter.nickname} compact />
                      <span className="shrink-0 text-xs font-semibold text-[var(--text-secondary)]">
                        {encounter.player.name}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  {route.isComplete && freeSlot !== null ? (
                    <AssignRouteButton routeId={route.routeId} routeName={route.routeName} teamSlot={freeSlot} />
                  ) : null}
                  <Link href={`/pokeroute?route=${route.routeId}`} className="app-action">
                    {route.isComplete ? 'Zur Route' : 'Fang fehlt noch'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {total !== null && total > data.openRoutes.length ? (
            <p className="border-t border-[var(--border-default)] px-4 py-3 text-xs text-[var(--text-secondary)]">
              Zusätzlich {total - data.openRoutes.length} weitere offene Routen.
            </p>
          ) : null}
          <div className="border-t border-[var(--border-default)] p-4">
            <Link
              href="/tabelle?team=not-in-team&status=active"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--background-secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--background-tertiary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Alle offenen in der Tabelle
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

const EVENT_LABELS: Record<
  AdminDashboardEvent['type'],
  { label: string; classes: string }
> = {
  knocked_out: {
    label: 'K.O.',
    classes: 'border-red-400/40 bg-red-500/10 text-red-700 dark:text-red-300',
  },
  not_caught: {
    label: 'Nicht gefangen',
    classes:
      'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  encounter_created: {
    label: 'Encounter erfasst',
    classes:
      'border-blue-400/40 bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
};

function EventsSection({ data }: { data: AdminDashboardData }) {
  const missingDates = data.eventDateGaps
    ? data.eventDateGaps.knockedOut + data.eventDateGaps.notCaught
    : 0;

  return (
    <section
      className="app-section overflow-hidden"
      aria-labelledby="events-heading"
    >
      <SectionHeading
        title="Letzte Ereignisse"
        description="Zeitlich erfasste Encounters, K.O.s und nicht gefangene Pokémon"
      />

      {!data.eventsAvailable ? (
        <UnavailableState>Die Ereignisliste ist momentan nicht verfügbar.</UnavailableState>
      ) : data.recentEvents.length === 0 ? (
        <p className="p-5 text-sm text-[var(--text-secondary)]">
          Noch keine relevanten Ereignisse erfasst.
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border-default)]">
          {data.recentEvents.map((event) => {
            const eventLabel = EVENT_LABELS[event.type];
            return (
              <li key={event.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:p-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${eventLabel.classes}`}>
                      {eventLabel.label}
                    </span>
                    <time className="text-xs text-[var(--text-secondary)]">
                      {formatDateTime(event.occurredAt)}
                    </time>
                  </div>
                  <div className="mt-3">
                    <PokemonIdentity pokemon={event.pokemon} nickname={event.nickname} />
                  </div>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--foreground)]">
                      {event.player.name}
                    </span>{' '}
                    · {event.route.name}
                  </p>
                  {event.causedBy || event.reason ? (
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      {event.causedBy ? `Verursacht durch ${event.causedBy}` : 'Verursacher nicht erfasst'}
                      {event.reason ? ` · ${event.reason}` : ''}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {data.eventsAvailable && missingDates > 0 ? (
        <p className="border-t border-[var(--border-default)] bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-300">
          Datenhinweis: {missingDates} Statusereignisse besitzen keinen gespeicherten Zeitpunkt.
        </p>
      ) : null}
    </section>
  );
}

const QUICK_LINKS = [
  { title: 'Teams bearbeiten', description: 'Teamplätze und Status verwalten', href: '/pokeroute' },
  { title: 'Tabelle öffnen', description: 'Encounters spielerübergreifend bearbeiten', href: '/tabelle' },
  { title: 'Run & Spielstände', description: 'Run verwalten, sichern oder laden', href: '/admin/gamesaves' },
  { title: 'Spieler verwalten', description: 'Spieler, Farben und Avatare ändern', href: '/admin/players' },
  { title: 'CSV importieren', description: 'Routen und Encounters gesammelt anlegen', href: '/admin/import' },
  { title: 'Pokémon-Cache', description: 'Pokémon-Daten prüfen und synchronisieren', href: '/admin/pokemon' },
] as const;

function QuickLinksSection({ data }: { data: AdminDashboardData }) {
  const inventoryItems = [
    ['Spieler', data.inventory.players],
    ['Routen', data.inventory.routes],
    ['Encounters', data.inventory.encounters],
    ['Pokémon im Cache', data.inventory.pokemon],
  ] as const;

  return (
    <section
      className="app-section overflow-hidden"
      aria-labelledby="quick-links-heading"
    >
      <SectionHeading
        title="Schnellzugriffe"
        description="Die häufigsten Verwaltungsbereiche"
      />
      <nav aria-label="Admin-Schnellzugriffe" className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="min-h-20 rounded-xl border border-[var(--border-default)] bg-[var(--background-secondary)] p-4 transition-colors hover:border-blue-400/60 hover:bg-blue-500/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="block text-sm font-bold text-[var(--foreground)]">{link.title}</span>
            <span className="mt-1 block text-sm text-[var(--text-secondary)]">{link.description}</span>
          </Link>
        ))}
      </nav>
      <dl className="grid grid-cols-2 border-t border-[var(--border-default)] bg-[var(--background-secondary)] sm:grid-cols-4">
        {inventoryItems.map(([label, value]) => (
          <div key={label} className="border-b border-r border-[var(--border-default)] p-4 last:border-r-0 sm:border-b-0">
            <dt className="text-xs font-medium text-[var(--text-secondary)]">{label}</dt>
            <dd className="mt-1 text-lg font-bold text-[var(--foreground)]">
              {value ?? 'Nicht verfügbar'}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default function AdminOperationsDashboard({ data }: { data: AdminDashboardData }) {
  const isPartial = data.warnings.length > 0;

  return (
    <main className="admin-page space-y-5 pb-8 sm:space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-[var(--font-display)] text-4xl font-black uppercase leading-none tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl">
            Admin-Zentrale
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--text-secondary)] sm:text-base">
            Aktuellen Run prüfen, Teams überblicken und offene Aufgaben direkt finden.
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              isPartial
                ? 'border-amber-400/40 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                : 'border-emerald-400/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${isPartial ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
            {isPartial ? 'Daten teilweise verfügbar' : 'Daten vollständig geladen'}
          </p>
          <p className="mt-2 text-xs text-[var(--text-secondary)]">
            Quelle: aktuelle Datenbank · Stand {formatDateTime(data.updatedAt)}
          </p>
        </div>
      </header>

      {data.warnings.length > 0 ? (
        <section
          aria-labelledby="data-warnings-heading"
          className="rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4"
        >
          <h2 id="data-warnings-heading" className="font-semibold text-amber-800 dark:text-amber-200">
            Datenhinweise
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700 dark:text-amber-300">
            {data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <CurrentRunSection data={data} />

      <div className="grid items-start gap-5 sm:gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(20rem,0.75fr)]">
        <TeamsSection data={data} />
        <AssignmentsSection data={data} />
      </div>

      <EventsSection data={data} />
      <QuickLinksSection data={data} />
    </main>
  );
}
