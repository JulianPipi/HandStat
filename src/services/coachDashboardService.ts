import type {
  Match,
  MatchEvent,
  MatchPeriod,
  MatchRoster,
  Team
} from '../domain/schemas';
import { ZONE_NAMES_ES } from './exportService';

export type CoachWindowFilter = 'LAST_5_MIN' | 'CURRENT_PERIOD' | 'FULL_MATCH';

export interface CumulativeWindow {
  startCumulativeMs: number;
  endCumulativeMs: number;
  label: string;
  durationMs: number;
  startPeriodNumber: number;
  startClockMs: number;
  endPeriodNumber: number;
  endClockMs: number;
}

export interface SuspensionInfo {
  eventId: string;
  teamId: string;
  teamName: string;
  rosterId?: string;
  playerName: string;
  shirtNumber?: number;
  startClockMs: number;
  startPeriodNumber: number;
  startCumulativeMs: number;
  elapsedMs: number;
  remainingMs: number;
  isExpired: boolean;
  statusLabel: string;
}

export interface DisqualificationInfo {
  eventId: string;
  teamId: string;
  teamName: string;
  rosterId?: string;
  playerName: string;
  shirtNumber?: number;
  kind: 'RED_CARD' | 'BLUE_CARD';
  periodNumber: number;
  clockMs: number;
}

export interface PlayerExclusionCount {
  rosterId: string;
  playerName: string;
  shirtNumber?: number;
  teamId: string;
  teamName: string;
  count: number;
  isAtLimit: boolean; // true si tiene exactamente 2 exclusiones
}

export interface UnansweredRun {
  teamId: string;
  teamName: string;
  goalsCount: number;
  startClockMs: number;
  startPeriodNumber: number;
  startCumulativeMs: number;
}

export interface GoalSequenceItem {
  eventId: string;
  clockMs: number;
  periodNumber: number;
  cumulativeMs: number;
  teamId: string;
  teamName: string;
  playerName: string;
  shirtNumber?: number;
  homeScoreAfter: number;
  awayScoreAfter: number;
}

export interface ScoreProgression {
  startScore: { home: number; away: number };
  endScore: { home: number; away: number };
  partialScore: { home: number; away: number };
  goalsSequence: GoalSequenceItem[];
  unansweredRun: UnansweredRun | null;
}

export interface TurnoverBreakdown {
  total: number;
  byReason: Record<string, { label: string; count: number }>;
  byPlayer: Array<{ rosterId: string; playerName: string; shirtNumber?: number; count: number }>;
  byZone: Record<string, { code: string; name: string; count: number }>;
  linkedRecoveriesCount: number;
  events: MatchEvent[];
}

export interface ShotMapData {
  totalShots: number;
  goals: number;
  saved: number;
  missed: number;
  post: number;
  blocked: number;
  effectivenessPct: number | null;
  byZone: Record<
    string,
    {
      code: string;
      name: string;
      attempts: number;
      goals: number;
      saved: number;
      missed: number;
      post: number;
      blocked: number;
      effectivenessPct: number | null;
    }
  >;
  byTarget: Record<
    string,
    {
      code: string;
      attempts: number;
      goals: number;
      saved: number;
      missed: number;
      post: number;
      blocked: number;
    }
  >;
  events: MatchEvent[];
}

export interface CoachQuickInsight {
  id: string;
  title: string;
  highlight: string;
  detail: string;
  category: 'TURNOVER' | 'SHOTS' | 'RUN' | 'INFO';
  supportingEvents: MatchEvent[];
}

/** Formatea ms a MM:SS */
export function formatClockMs(ms: number): string {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.floor(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Obtiene la duración estándar configurada de un período en milisegundos.
 */
export function getPeriodDurationMs(match: Match | undefined, period?: MatchPeriod): number {
  if (period?.duration_ms && period.duration_ms > 0) {
    return period.duration_ms;
  }
  return match?.rules_config?.period_duration_ms || 1800000; // 30 min
}

/**
 * Calcula el offset acumulado de juego deportivo antes de un período dado.
 * Se basa en la duración reglamentaria de cada período previo.
 */
export function getCumulativeOffsetForPeriod(
  periodNumber: number,
  periods: MatchPeriod[],
  match: Match | undefined
): number {
  let offset = 0;
  for (let num = 1; num < periodNumber; num++) {
    const p = periods.find((item) => item.number === num);
    offset += getPeriodDurationMs(match, p);
  }
  return offset;
}

/**
 * Convierte período y tiempo de reloj a tiempo deportivo acumulado continuo.
 */
export function calculateCumulativeMs(
  periodNumber: number,
  clockMs: number,
  periods: MatchPeriod[],
  match: Match | undefined
): number {
  const offset = getCumulativeOffsetForPeriod(periodNumber, periods, match);
  return offset + Math.max(0, clockMs);
}

/**
 * Convierte un tiempo acumulado continuo de vuelta a período y tiempo de reloj.
 */
export function reverseCumulativeMs(
  cumulativeMs: number,
  periods: MatchPeriod[],
  match: Match | undefined
): { periodNumber: number; clockMs: number } {
  let remaining = Math.max(0, cumulativeMs);
  const sortedPeriods = [...periods].sort((a, b) => a.number - b.number);

  for (const p of sortedPeriods) {
    const dur = getPeriodDurationMs(match, p);
    if (remaining < dur) {
      return { periodNumber: p.number, clockMs: remaining };
    }
    // Si es el último período y sobrepasa, se queda en el último
    const lastP = sortedPeriods[sortedPeriods.length - 1];
    if (lastP && p.number === lastP.number) {
      return { periodNumber: p.number, clockMs: remaining };
    }
    remaining -= dur;
  }

  const defaultDuration = getPeriodDurationMs(match);
  const fallbackPeriodNum = Math.floor(remaining / defaultDuration) + 1;
  const fallbackClockMs = remaining % defaultDuration;
  return { periodNumber: fallbackPeriodNum, clockMs: fallbackClockMs };
}

/**
 * Calcula los límites de tiempo deportivo continuo para la ventana seleccionada.
 */
export function calculateWindowBoundaries(
  windowType: CoachWindowFilter,
  currentPeriodNumber: number,
  currentClockMs: number,
  periods: MatchPeriod[],
  match: Match | undefined,
  allEvents?: MatchEvent[]
): CumulativeWindow {
  const isFinished = match?.status === 'finished';
  const totalConfiguredDuration = periods.reduce((acc, p) => acc + getPeriodDurationMs(match, p), 0);

  let currentCumulativeMs = calculateCumulativeMs(currentPeriodNumber, currentClockMs, periods, match);

  // Si el partido está finalizado y el reloj está en 0, tomar el final del partido
  if (isFinished && currentCumulativeMs === 0) {
    const maxEventMs =
      allEvents?.reduce((max, ev) => {
        const p = periods.find((item) => item.id === ev.period_id);
        const c = calculateCumulativeMs(p ? p.number : 1, ev.clock_ms, periods, match);
        return Math.max(max, c);
      }, 0) || 0;
    currentCumulativeMs = Math.max(totalConfiguredDuration, maxEventMs);
  }

  if (windowType === 'LAST_5_MIN') {
    const durationMs = 5 * 60 * 1000; // 300,000 ms
    const startCumulativeMs = Math.max(0, currentCumulativeMs - durationMs);
    const endCumulativeMs = currentCumulativeMs;

    const startConv = reverseCumulativeMs(startCumulativeMs, periods, match);
    const endConv = reverseCumulativeMs(endCumulativeMs, periods, match);

    const label = `Últimos 5 min (${formatClockMs(startConv.clockMs)} [${startConv.periodNumber}T] a ${formatClockMs(
      endConv.clockMs
    )} [${endConv.periodNumber}T])`;

    return {
      startCumulativeMs,
      endCumulativeMs,
      label,
      durationMs: endCumulativeMs - startCumulativeMs,
      startPeriodNumber: startConv.periodNumber,
      startClockMs: startConv.clockMs,
      endPeriodNumber: endConv.periodNumber,
      endClockMs: endConv.clockMs,
    };
  }

  if (windowType === 'CURRENT_PERIOD') {
    const currentP = periods.find((p) => p.number === currentPeriodNumber);
    const periodDuration = getPeriodDurationMs(match, currentP);
    const effectivePeriodClockMs = isFinished && currentClockMs === 0 ? periodDuration : currentClockMs;

    const startCumulativeMs = getCumulativeOffsetForPeriod(currentPeriodNumber, periods, match);
    const endCumulativeMs = startCumulativeMs + effectivePeriodClockMs;

    const startConv = { periodNumber: currentPeriodNumber, clockMs: 0 };
    const endConv = { periodNumber: currentPeriodNumber, clockMs: effectivePeriodClockMs };

    const label = `${currentPeriodNumber}º Tiempo (00:00 a ${formatClockMs(effectivePeriodClockMs)})`;

    return {
      startCumulativeMs,
      endCumulativeMs,
      label,
      durationMs: Math.max(0, endCumulativeMs - startCumulativeMs),
      startPeriodNumber: startConv.periodNumber,
      startClockMs: startConv.clockMs,
      endPeriodNumber: endConv.periodNumber,
      endClockMs: endConv.clockMs,
    };
  }

  // FULL_MATCH
  const startCumulativeMs = 0;
  const maxEventMs =
    allEvents?.reduce((max, ev) => {
      const p = periods.find((item) => item.id === ev.period_id);
      const c = calculateCumulativeMs(p ? p.number : 1, ev.clock_ms, periods, match);
      return Math.max(max, c);
    }, 0) || 0;
  const endCumulativeMs = Math.max(currentCumulativeMs, totalConfiguredDuration, maxEventMs);
  const endConv = reverseCumulativeMs(endCumulativeMs, periods, match);

  const label = `Todo el partido (00:00 [1T] a ${formatClockMs(endConv.clockMs)} [${endConv.periodNumber}T])`;

  return {
    startCumulativeMs,
    endCumulativeMs,
    label,
    durationMs: endCumulativeMs - startCumulativeMs,
    startPeriodNumber: 1,
    startClockMs: 0,
    endPeriodNumber: endConv.periodNumber,
    endClockMs: endConv.clockMs,
  };
}

/**
 * Asigna tiempo acumulado a un evento activo.
 */
export function enrichEventWithCumulativeMs(
  event: MatchEvent,
  periods: MatchPeriod[],
  match: Match | undefined
): MatchEvent & { cumulativeMs: number; periodNumber: number } {
  const period = periods.find((p) => p.id === event.period_id);
  const periodNumber = period ? period.number : 1;
  const cumulativeMs = calculateCumulativeMs(periodNumber, event.clock_ms, periods, match);
  return { ...event, cumulativeMs, periodNumber };
}

/**
 * Filtra eventos activos pertenecientes a la ventana continua.
 */
export function filterEventsInWindow(
  events: MatchEvent[],
  window: CumulativeWindow,
  periods: MatchPeriod[],
  match: Match | undefined
): (MatchEvent & { cumulativeMs: number; periodNumber: number })[] {
  const enriched = events
    .filter((e) => e.status === 'active' && (!match || e.match_id === match.id))
    .map((e) => enrichEventWithCumulativeMs(e, periods, match));

  return enriched
    .filter((e) => e.cumulativeMs >= window.startCumulativeMs && e.cumulativeMs <= window.endCumulativeMs)
    .sort((a, b) => {
      if (a.cumulativeMs !== b.cumulativeMs) return a.cumulativeMs - b.cumulativeMs;
      return a.sport_seq - b.sport_seq;
    });
}

/**
 * Calcula la evolución del marcador, secuencia de goles y racha sin respuesta.
 */
export function calculateScoreProgression(
  allActiveEvents: MatchEvent[],
  window: CumulativeWindow,
  homeTeamId: string,
  awayTeamId: string,
  teams: Team[],
  rosters: MatchRoster[],
  periods: MatchPeriod[],
  match: Match | undefined
): ScoreProgression {
  const enrichedAll = allActiveEvents
    .filter((e) => e.status === 'active' && (!match || e.match_id === match.id))
    .map((e) => enrichEventWithCumulativeMs(e, periods, match))
    .sort((a, b) => {
      if (a.cumulativeMs !== b.cumulativeMs) return a.cumulativeMs - b.cumulativeMs;
      return a.sport_seq - b.sport_seq;
    });

  let runningHome = 0;
  let runningAway = 0;
  let startHome = 0;
  let startAway = 0;

  const homeTeam = teams.find((t) => t.id === homeTeamId);
  const awayTeam = teams.find((t) => t.id === awayTeamId);

  const goalsSequence: GoalSequenceItem[] = [];

  for (const ev of enrichedAll) {
    const isGoal = ev.type === 'SHOT' && ev.shot_detail?.result_code === 'GOAL';

    if (ev.cumulativeMs < window.startCumulativeMs) {
      if (isGoal) {
        if (ev.match_team_id === homeTeamId) startHome++;
        else if (ev.match_team_id === awayTeamId) startAway++;
      }
      runningHome = startHome;
      runningAway = startAway;
      continue;
    }

    if (ev.cumulativeMs > window.endCumulativeMs) {
      break;
    }

    if (isGoal) {
      if (ev.match_team_id === homeTeamId) runningHome++;
      else if (ev.match_team_id === awayTeamId) runningAway++;

      const shooter = ev.participants.find((p) => p.role === 'SHOOTER');
      const roster = shooter ? rosters.find((r) => r.id === shooter.roster_id) : undefined;
      const team = ev.match_team_id === homeTeamId ? homeTeam : awayTeam;

      goalsSequence.push({
        eventId: ev.id,
        clockMs: ev.clock_ms,
        periodNumber: ev.periodNumber,
        cumulativeMs: ev.cumulativeMs,
        teamId: ev.match_team_id || '',
        teamName: team?.short_name || team?.name || 'Equipo',
        playerName: roster?.display_name_snapshot || 'Jugador',
        shirtNumber: roster?.shirt_number,
        homeScoreAfter: runningHome,
        awayScoreAfter: runningAway,
      });
    }
  }

  // Racha activa sin respuesta: evaluar desde el último gol ocurrido en todo el partido hasta ahora
  let unansweredRun: UnansweredRun | null = null;
  const allGoals = enrichedAll
    .filter((e) => e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL' && e.cumulativeMs <= window.endCumulativeMs)
    .sort((a, b) => {
      if (a.cumulativeMs !== b.cumulativeMs) return a.cumulativeMs - b.cumulativeMs;
      return a.sport_seq - b.sport_seq;
    });

  if (allGoals.length > 0) {
    const lastGoal = allGoals[allGoals.length - 1];
    const runTeamId = lastGoal?.match_team_id;
    if (lastGoal && runTeamId) {
      let count = 0;
      let firstGoalInRun = lastGoal;

      for (let i = allGoals.length - 1; i >= 0; i--) {
        const g = allGoals[i];
        if (g && g.match_team_id === runTeamId) {
          count++;
          firstGoalInRun = g;
        } else {
          break;
        }
      }

      if (count >= 2) {
        const runTeam = teams.find((t) => t.id === runTeamId);
        unansweredRun = {
          teamId: runTeamId,
          teamName: runTeam?.short_name || runTeam?.name || 'Equipo',
          goalsCount: count,
          startClockMs: firstGoalInRun.clock_ms,
          startPeriodNumber: firstGoalInRun.periodNumber,
          startCumulativeMs: firstGoalInRun.cumulativeMs,
        };
      }
    }
  }

  return {
    startScore: { home: startHome, away: startAway },
    endScore: { home: runningHome, away: runningAway },
    partialScore: { home: runningHome - startHome, away: runningAway - startAway },
    goalsSequence,
    unansweredRun,
  };
}

/** Nombres de motivos de pérdida en español */
export const TURNOVER_REASON_NAMES_ES: Record<string, string> = {
  BAD_PASS: 'Mal pase',
  CATCH_ERROR: 'Fallo de recepción',
  STEAL: 'Robo rival',
  TRAVELING: 'Pasos',
  DOUBLE_DRIBBLE: 'Doble drible',
  OFFENSIVE_FOUL: 'Falta en ataque',
  THREE_SECONDS: '3 segundos',
  PASSIVE_PLAY: 'Juego pasivo',
  LINE_VIOLATION: 'Pisar área / línea',
  OTHER: 'Otra pérdida',
};

/**
 * Calcula el desglose de pérdidas de un equipo en la ventana.
 */
export function calculateTurnoverBreakdown(
  windowEvents: (MatchEvent & { cumulativeMs: number; periodNumber: number })[],
  targetTeamId: string,
  rosters: MatchRoster[]
): TurnoverBreakdown {
  const turnoverEvents = windowEvents.filter(
    (e) => e.type === 'TURNOVER' && e.match_team_id === targetTeamId
  );

  const byReason: Record<string, { label: string; count: number }> = {};
  const byPlayerMap: Record<string, { rosterId: string; playerName: string; shirtNumber?: number; count: number }> = {};
  const byZone: Record<string, { code: string; name: string; count: number }> = {};
  let linkedRecoveriesCount = 0;

  for (const ev of turnoverEvents) {
    // Motivo
    const reasonCode = ev.turnover_detail?.reason || 'OTHER';
    const reasonLabel = TURNOVER_REASON_NAMES_ES[reasonCode] || reasonCode;
    if (!byReason[reasonCode]) {
      byReason[reasonCode] = { label: reasonLabel, count: 0 };
    }
    byReason[reasonCode].count++;

    // Jugador
    const victim = ev.participants.find((p) => p.role === 'TURNOVER_BY');
    const rosterId = victim?.roster_id || 'UNKNOWN';
    const roster = rosters.find((r) => r.id === rosterId);
    const playerName = roster?.display_name_snapshot || (rosterId === 'UNKNOWN' ? 'Colectivo / No identificado' : 'Jugador');

    if (!byPlayerMap[rosterId]) {
      byPlayerMap[rosterId] = {
        rosterId,
        playerName,
        shirtNumber: roster?.shirt_number,
        count: 0,
      };
    }
    byPlayerMap[rosterId].count++;

    // Zona
    const zoneCode = ev.turnover_detail?.court_zone || 'UNKNOWN';
    const zoneName = ZONE_NAMES_ES[zoneCode] || (zoneCode === 'UNKNOWN' ? 'Zona no registrada' : zoneCode);
    if (!byZone[zoneCode]) {
      byZone[zoneCode] = { code: zoneCode, name: zoneName, count: 0 };
    }
    byZone[zoneCode].count++;

    // Recuperaciones vinculadas
    if (ev.turnover_detail?.forced_by_defense || ev.participants.some((p) => p.role === 'RECOVERED_BY')) {
      linkedRecoveriesCount++;
    }
  }

  const byPlayer = Object.values(byPlayerMap).sort((a, b) => b.count - a.count);

  return {
    total: turnoverEvents.length,
    byReason,
    byPlayer,
    byZone,
    linkedRecoveriesCount,
    events: turnoverEvents,
  };
}

/**
 * Calcula los datos de tiros para el mapa de cancha y arco en la ventana.
 */
export function calculateShotMapData(
  windowEvents: (MatchEvent & { cumulativeMs: number; periodNumber: number })[],
  targetTeamId: string
): ShotMapData {
  const shotEvents = windowEvents.filter(
    (e) => e.type === 'SHOT' && e.match_team_id === targetTeamId
  );

  let goals = 0;
  let saved = 0;
  let missed = 0;
  let post = 0;
  let blocked = 0;

  const byZone: ShotMapData['byZone'] = {};
  const byTarget: ShotMapData['byTarget'] = {};

  for (const ev of shotEvents) {
    const res = ev.shot_detail?.result_code || 'MISSED';
    if (res === 'GOAL') goals++;
    else if (res === 'SAVED') saved++;
    else if (res === 'MISSED') missed++;
    else if (res === 'POST') post++;
    else if (res === 'BLOCKED') blocked++;

    // Zona de origen
    const zoneCode = ev.shot_detail?.origin_zone_code || 'UNKNOWN';
    const zoneName = ZONE_NAMES_ES[zoneCode] || zoneCode;
    if (!byZone[zoneCode]) {
      byZone[zoneCode] = {
        code: zoneCode,
        name: zoneName,
        attempts: 0,
        goals: 0,
        saved: 0,
        missed: 0,
        post: 0,
        blocked: 0,
        effectivenessPct: null,
      };
    }
    byZone[zoneCode].attempts++;
    if (res === 'GOAL') byZone[zoneCode].goals++;
    else if (res === 'SAVED') byZone[zoneCode].saved++;
    else if (res === 'MISSED') byZone[zoneCode].missed++;
    else if (res === 'POST') byZone[zoneCode].post++;
    else if (res === 'BLOCKED') byZone[zoneCode].blocked++;

    // Zona de arco (destino)
    const targetCode = ev.shot_detail?.target_zone_code || 'UNKNOWN';
    if (!byTarget[targetCode]) {
      byTarget[targetCode] = {
        code: targetCode,
        attempts: 0,
        goals: 0,
        saved: 0,
        missed: 0,
        post: 0,
        blocked: 0,
      };
    }
    byTarget[targetCode].attempts++;
    if (res === 'GOAL') byTarget[targetCode].goals++;
    else if (res === 'SAVED') byTarget[targetCode].saved++;
    else if (res === 'MISSED') byTarget[targetCode].missed++;
    else if (res === 'POST') byTarget[targetCode].post++;
    else if (res === 'BLOCKED') byTarget[targetCode].blocked++;
  }

  // Calcular efectividad
  for (const z of Object.values(byZone)) {
    z.effectivenessPct = z.attempts > 0 ? Math.round((z.goals / z.attempts) * 100) : null;
  }

  const totalShots = shotEvents.length;
  const effectivenessPct = totalShots > 0 ? Math.round((goals / totalShots) * 100) : null;

  return {
    totalShots,
    goals,
    saved,
    missed,
    post,
    blocked,
    effectivenessPct,
    byZone,
    byTarget,
    events: shotEvents,
  };
}

/**
 * Calcula exclusiones activas dinámicas, descalificaciones y recuento de 2 exclusiones.
 */
export function calculateSuspensionsAndSanctions(
  allActiveEvents: MatchEvent[],
  currentPeriodNumber: number,
  currentClockMs: number,
  teams: Team[],
  rosters: MatchRoster[],
  periods: MatchPeriod[],
  match: Match | undefined
): {
  activeSuspensions: SuspensionInfo[];
  expiredSuspensions: SuspensionInfo[];
  disqualifications: DisqualificationInfo[];
  playersAtExclusionLimit: PlayerExclusionCount[];
} {
  const currentCumulativeMs = calculateCumulativeMs(currentPeriodNumber, currentClockMs, periods, match);
  const suspensionDurationMs = match?.rules_config?.suspension_duration_ms || 120000; // 2 min

  const enrichedEvents = allActiveEvents
    .filter((e) => e.status === 'active' && (!match || e.match_id === match.id))
    .map((e) => enrichEventWithCumulativeMs(e, periods, match));

  const activeSuspensions: SuspensionInfo[] = [];
  const expiredSuspensions: SuspensionInfo[] = [];
  const disqualifications: DisqualificationInfo[] = [];
  const playerTwoMinCounts: Record<string, { count: number; rosterId: string; teamId: string }> = {};

  for (const ev of enrichedEvents) {
    if (ev.type !== 'SANCTION' || !ev.sanction_detail) continue;

    const kind = ev.sanction_detail.kind;
    const teamId = ev.match_team_id || '';
    const team = teams.find((t) => t.id === teamId);
    const sanctioned = ev.participants.find((p) => p.role === 'SANCTIONED');
    const rosterId = sanctioned?.roster_id;
    const roster = rosterId ? rosters.find((r) => r.id === rosterId) : undefined;
    const playerName = roster?.display_name_snapshot || 'Jugador sancionado';
    const shirtNumber = roster?.shirt_number;

    if (kind === 'TWO_MINUTE') {
      // Registrar contador acumulado por jugador
      if (rosterId) {
        if (!playerTwoMinCounts[rosterId]) {
          playerTwoMinCounts[rosterId] = { count: 0, rosterId, teamId };
        }
        playerTwoMinCounts[rosterId].count++;
      }

      // Tiempo deportivo transcurrido
      const elapsedMs = Math.max(0, currentCumulativeMs - ev.cumulativeMs);
      const dur = ev.sanction_detail.duration_ms || suspensionDurationMs;
      const isExpired = elapsedMs >= dur;
      const remainingMs = isExpired ? 0 : dur - elapsedMs;

      const item: SuspensionInfo = {
        eventId: ev.id,
        teamId,
        teamName: team?.short_name || team?.name || 'Equipo',
        rosterId,
        playerName,
        shirtNumber,
        startClockMs: ev.clock_ms,
        startPeriodNumber: ev.periodNumber,
        startCumulativeMs: ev.cumulativeMs,
        elapsedMs,
        remainingMs,
        isExpired,
        statusLabel: isExpired ? 'Puede reingresar' : formatClockMs(remainingMs),
      };

      if (isExpired) {
        expiredSuspensions.push(item);
      } else {
        activeSuspensions.push(item);
      }
    } else if (kind === 'RED_CARD' || kind === 'BLUE_CARD') {
      disqualifications.push({
        eventId: ev.id,
        teamId,
        teamName: team?.short_name || team?.name || 'Equipo',
        rosterId,
        playerName,
        shirtNumber,
        kind,
        periodNumber: ev.periodNumber,
        clockMs: ev.clock_ms,
      });
    }
  }

  // Jugadores que acumulan exactamente 2 exclusiones
  const playersAtExclusionLimit: PlayerExclusionCount[] = Object.values(playerTwoMinCounts)
    .filter((entry) => entry.count === 2)
    .map((entry) => {
      const roster = rosters.find((r) => r.id === entry.rosterId);
      const team = teams.find((t) => t.id === entry.teamId);
      return {
        rosterId: entry.rosterId,
        playerName: roster?.display_name_snapshot || 'Jugador',
        shirtNumber: roster?.shirt_number,
        teamId: entry.teamId,
        teamName: team?.short_name || team?.name || 'Equipo',
        count: entry.count,
        isAtLimit: true,
      };
    });

  return {
    activeSuspensions,
    expiredSuspensions,
    disqualifications,
    playersAtExclusionLimit,
  };
}

/**
 * Genera el Resumen Rápido con un máximo de 3 observaciones prioritarias,
 * objetivas, breves y con respaldo empírico (numerador/denominador).
 */
export function generateQuickInsights(
  _window: CumulativeWindow,
  ownTeamId: string,
  rivalTeamId: string,
  teams: Team[],
  _rosters: MatchRoster[],
  scoreProgression: ScoreProgression,
  ownTurnovers: TurnoverBreakdown,
  rivalShotMap: ShotMapData
): CoachQuickInsight[] {
  const insights: CoachQuickInsight[] = [];
  const ownTeam = teams.find((t) => t.id === ownTeamId);
  const rivalTeam = teams.find((t) => t.id === rivalTeamId);
  const ownName = ownTeam?.short_name || ownTeam?.name || 'Nuestro Equipo';
  const rivalName = rivalTeam?.short_name || rivalTeam?.name || 'Rival';

  // 1. Pérdidas de nuestro equipo
  if (ownTurnovers.total > 0) {
    const topReasonEntry = Object.values(ownTurnovers.byReason).sort((a, b) => b.count - a.count)[0];
    const reasonText = topReasonEntry
      ? `${topReasonEntry.count} por ${topReasonEntry.label.toLowerCase()}`
      : '';
    insights.push({
      id: 'turnover-summary',
      category: 'TURNOVER',
      title: 'Pérdidas de Balón',
      highlight: `${ownTurnovers.total} ${ownTurnovers.total === 1 ? 'pérdida' : 'pérdidas'} en la ventana`,
      detail: reasonText
        ? `${reasonText} (${ownTurnovers.total} en total).`
        : `${ownTurnovers.total} pérdidas registradas de ${ownName}.`,
      supportingEvents: ownTurnovers.events,
    });
  } else {
    insights.push({
      id: 'turnover-summary',
      category: 'TURNOVER',
      title: 'Control de Balón',
      highlight: 'Sin pérdidas registradas',
      detail: `${ownName} no registra pérdidas de balón en esta ventana.`,
      supportingEvents: [],
    });
  }

  // 2. Efectividad y zona de peligro del rival
  if (rivalShotMap.totalShots > 0) {
    // Buscar si hay una zona crítica (e.g. 6m o extremos o 9m)
    const zones6m = ['L6', 'C6', 'R6'];
    const shots6m = rivalShotMap.events.filter((e) =>
      zones6m.includes(e.shot_detail?.origin_zone_code || '')
    );
    const goals6m = shots6m.filter((e) => e.shot_detail?.result_code === 'GOAL');

    let zoneDetail = '';
    if (shots6m.length > 0) {
      zoneDetail = ` · ${goals6m.length} de ${shots6m.length} desde 6 metros`;
    }

    insights.push({
      id: 'rival-shots-summary',
      category: 'SHOTS',
      title: `Efectividad del Rival (${rivalName})`,
      highlight: `${rivalShotMap.goals} de ${rivalShotMap.totalShots} tiros convertidos (${
        rivalShotMap.effectivenessPct ?? 0
      }%)`,
      detail: `El rival convirtió ${rivalShotMap.goals} de ${rivalShotMap.totalShots} lanzamientos${zoneDetail}.`,
      supportingEvents: rivalShotMap.events,
    });
  } else {
    insights.push({
      id: 'rival-shots-summary',
      category: 'SHOTS',
      title: `Lanzamientos de ${rivalName}`,
      highlight: 'Sin lanzamientos en la ventana',
      detail: `No se registraron tiros del rival en este lapso de juego.`,
      supportingEvents: [],
    });
  }

  // 3. Parcial o Racha Activa
  if (scoreProgression.unansweredRun && scoreProgression.unansweredRun.goalsCount >= 2) {
    const run = scoreProgression.unansweredRun;
    insights.push({
      id: 'run-summary',
      category: 'RUN',
      title: 'Racha Activa sin Respuesta',
      highlight: `Racha: ${run.teamName} ${run.goalsCount} goles seguidos`,
      detail: `Desde ${formatClockMs(run.startClockMs)} (${run.startPeriodNumber}T). Parcial ventana: ${
        scoreProgression.partialScore.home
      }–${scoreProgression.partialScore.away}.`,
      supportingEvents: scoreProgression.goalsSequence
        .filter((g) => g.cumulativeMs >= run.startCumulativeMs)
        .map((g) => ({ id: g.eventId } as MatchEvent)),
    });
  } else {
    insights.push({
      id: 'partial-summary',
      category: 'RUN',
      title: 'Evolución del Marcador',
      highlight: `Parcial en la ventana: ${scoreProgression.partialScore.home}–${scoreProgression.partialScore.away}`,
      detail: `Marcador previo: ${scoreProgression.startScore.home}–${scoreProgression.startScore.away} ➔ Actual: ${scoreProgression.endScore.home}–${scoreProgression.endScore.away}.`,
      supportingEvents: scoreProgression.goalsSequence.map((g) => ({ id: g.eventId } as MatchEvent)),
    });
  }

  return insights.slice(0, 3);
}
