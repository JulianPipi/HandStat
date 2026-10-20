import type {
  Match,
  MatchEvent,
  MatchPeriod,
  MatchRoster,
  MatchPossession,
  PlayerParticipationInterval,
  Team
} from '../domain/schemas';

// ==========================================
// Tipos de Métricas y Estadísticas
// ==========================================

export type RatioOrNull = number | null; // null si denominador es 0 (para renderizar "—")

export interface ShotResultBreakdown {
  goals: number;
  saved: number;
  missed: number;
  post: number;
  blocked: number;
  total_shots: number;
  effectiveness_pct: RatioOrNull; // (goals / total_shots) * 100
}

export interface ZoneStat {
  code: string;
  name: string;
  attempts: number;
  goals: number;
  saved: number;
  missed: number;
  effectiveness_pct: RatioOrNull;
}

export interface CourtShotMap {
  zones: Record<string, ZoneStat>;
  unspecified_count: number;
  unspecified_goals: number;
  total_attempts: number;
  total_goals: number;
}

export interface GoalTargetMap {
  targets: Record<string, ZoneStat>;
  unspecified_count: number;
  unspecified_goals: number;
  total_attempts: number;
  total_goals: number;
}

export interface PlayerMatchStats {
  roster_id: string;
  player_id?: string;
  display_name: string;
  shirt_number: number;
  team_id: string;
  role: 'GK' | 'FIELD' | 'OFFICIAL';
  is_starter: boolean;

  // Acciones ofensivas
  goals: number;
  total_shots: number;
  shot_effectiveness_pct: RatioOrNull;
  saved_shots: number;
  missed_shots: number;
  post_shots: number;
  blocked_shots: number;
  assists: number;
  turnovers: number;

  // Acciones defensivas
  steals: number;
  defensive_blocks: number;

  // Sanciones
  yellow_cards: number;
  two_minute_suspensions: number;
  red_cards: number;
  blue_cards: number;

  // Participación y Plus/Minus
  minutes_played_ms: number | null; // null si no hay datos de participación
  minutes_played_formatted: string;
  is_active_on_court: boolean;
  has_participation_data: boolean;
  plus_minus: number | null; // null si no hay datos de participación
  plus_minus_coverage: 'FULL' | 'PARTIAL' | 'NO_DATA';
  individual_coverage: 'FULL' | 'PARTIAL' | 'NO_DATA';
  team_lineup_coverage: 'FULL' | 'PARTIAL' | 'NO_DATA';
  uncovered_match_goals: number; // Goles con incertidumbre o sin formación confirmada
  plus_minus_note?: string;
}

export interface GoalkeeperMatchStats {
  roster_id?: string;
  display_name: string;
  team_id: string;
  is_unknown_or_collective: boolean;

  saves: number;
  goals_conceded: number;
  shots_on_target: number; // saves + goals_conceded
  save_pct: RatioOrNull; // (saves / (saves + goals_conceded)) * 100

  // Tiros fuera que enfrentó en cancha
  shots_off_target: number; // missed + post
  total_shots_faced: number;

  empty_net_goals_conceded: number; // Goles recibidos con portería vacía (no imputables al arquero)
  has_reliable_data: boolean;
  unattributed_explanation?: string;
}

export interface GoalkeeperTeamSummary {
  team_id: string;
  team_name: string;
  total_opposing_shots: number;
  total_opposing_goals: number;
  identified_shots: number;
  unattributed_shots: number;
  unattributed_goals: number;
  unattributed_saves: number;
  empty_net_goals: number;
  coverage_status: 'COMPLETE' | 'PARTIAL' | 'NO_DATA';
  coverage_warning?: string;
}

export interface PossessionStats {
  total_possessions: number;
  complete_possessions: number;
  valid_complete_possessions?: number;
  goals_scored: number; // alias para goals_in_tracked_possessions
  goals_in_tracked_possessions: number;
  turnovers_committed: number;
  goals_per_possession: RatioOrNull; // goals_in_tracked_possessions / complete_possessions
  turnovers_per_possession: RatioOrNull; // turnovers_committed / complete_possessions

  // Auditoría y desglose de cobertura
  total_match_goals: number;
  unassociated_goals: number;
  unassociated_shots: number;
  unassociated_turnovers: number;
  coverage_status: 'COMPLETE' | 'PARTIAL' | 'NO_DATA';
  coverage_warning?: string;
  has_data: boolean;
  has_inconsistency: boolean;
  inconsistency_reasons?: string[];
  possession_goal_map?: Record<string, string>;
  possession_validity_map?: Record<string, { isValidForMetrics: boolean; reason?: string }>;
}

export interface PeriodScoreSummary {
  period_id: string;
  period_number: number;
  home_goals: number;
  away_goals: number;
}

export interface ScoreProgressionPoint {
  clock_ms: number;
  clock_formatted: string;
  period_number: number;
  scoring_team_id: string;
  scoring_player_name?: string;
  home_score: number;
  away_score: number;
  difference: number; // home_score - away_score
}

export interface MatchCompleteStats {
  match_id: string;
  home_team_id: string;
  away_team_id: string;
  home_team_name: string;
  away_team_name: string;

  // Marcador y Períodos
  final_home_score: number;
  final_away_score: number;
  periods_summary: PeriodScoreSummary[];
  score_progression: ScoreProgressionPoint[];

  // Totales de equipo
  home_shots: ShotResultBreakdown;
  away_shots: ShotResultBreakdown;

  home_turnovers: number;
  away_turnovers: number;

  home_steals: number;
  away_steals: number;

  home_blocks: number;
  away_blocks: number;

  home_sanctions: {
    yellow_cards: number;
    two_minute_suspensions: number;
    red_cards: number;
    blue_cards: number;
  };
  away_sanctions: {
    yellow_cards: number;
    two_minute_suspensions: number;
    red_cards: number;
    blue_cards: number;
  };

  // Posesiones
  home_possessions: PossessionStats;
  away_possessions: PossessionStats;

  // Estadísticas individuales
  player_stats: PlayerMatchStats[];

  // Estadísticas de arqueros
  goalkeeper_stats: GoalkeeperMatchStats[];
  home_goalkeeper_summary: GoalkeeperTeamSummary;
  away_goalkeeper_summary: GoalkeeperTeamSummary;

  // Mapas de lanzamientos
  home_court_map: CourtShotMap;
  away_court_map: CourtShotMap;
  home_goal_target_map: GoalTargetMap;
  away_goal_target_map: GoalTargetMap;
}

export interface AggregatedMultiMatchStats {
  matches_count: number;
  included_match_ids: string[];
  total_goals: number;
  total_shots: number;
  aggregate_shot_effectiveness_pct: RatioOrNull;

  total_saves: number;
  total_shots_on_target: number;
  aggregate_save_pct: RatioOrNull;

  total_empty_net_goals: number;
  total_unattributed_shots: number;
  total_unattributed_goals: number;
  total_unattributed_saves: number;

  total_turnovers: number;
  total_steals: number;
  total_blocks: number;

  players: Record<string, {
    player_id?: string;
    display_name: string;
    shirt_number: number;
    matches_played: number;
    goals: number;
    shots: number;
    effectiveness_pct: RatioOrNull;
    assists: number;
    turnovers: number;
    steals: number;
    blocks: number;
    minutes_played_ms: number;
    minutes_played_formatted: string;
    plus_minus: number | null;
  }>;

  goalkeepers: Record<string, {
    display_name: string;
    matches_played: number;
    saves: number;
    goals_conceded: number;
    shots_on_target: number;
    save_pct: RatioOrNull;
  }>;
}

export interface StatsFilterOptions {
  periodId?: string;
  teamId?: string;
  rosterId?: string;
  numericalContext?: 'EQUAL' | 'SUPERIORITY' | 'INFERIORITY' | 'UNKNOWN';
}

// Zonas oficiales de la cancha
export const COURT_ZONES_DEF: { code: string; name: string }[] = [
  { code: 'C6', name: '6m Centro (Pivote)' },
  { code: 'L6', name: '6m Extremo Izquierdo' },
  { code: 'R6', name: '6m Extremo Derecho' },
  { code: 'C9', name: '9m Central' },
  { code: 'L9', name: '9m Lateral Izquierdo' },
  { code: 'R9', name: '9m Lateral Derecho' },
  { code: '7M', name: 'Penal 7m' },
  { code: 'LONG', name: 'Contraataque / Campo Completo' },
];

// Zonas oficiales de portería
export const GOAL_TARGETS_DEF: { code: string; name: string }[] = [
  { code: 'TL', name: 'Arriba Izquierda' },
  { code: 'TC', name: 'Arriba Centro' },
  { code: 'TR', name: 'Arriba Derecha' },
  { code: 'ML', name: 'Medio Izquierda' },
  { code: 'MC', name: 'Medio Centro' },
  { code: 'MR', name: 'Medio Derecha' },
  { code: 'BL', name: 'Abajo Izquierda' },
  { code: 'BC', name: 'Abajo Centro' },
  { code: 'BR', name: 'Abajo Derecha' },
  { code: 'POST_L', name: 'Poste Izquierdo' },
  { code: 'POST_R', name: 'Poste Derecho' },
  { code: 'BAR', name: 'Travesaño' },
  { code: 'OUT_L', name: 'Fuera Izquierda' },
  { code: 'OUT_TOP', name: 'Fuera Alto' },
  { code: 'OUT_R', name: 'Fuera Derecha' },
];

export class StatsEngine {
  /**
   * Helper seguro de división porcentual: si denominador es 0 o nulo, devuelve null.
   * Evita divisiones por cero o porcentajes ficticios de 0%.
   */
  static safePercentage(numerator: number, denominator: number): RatioOrNull {
    if (denominator <= 0) return null;
    return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal (ej. 66.7)
  }

  /**
   * Helper seguro de ratio por posesión: si denominador es 0 o nulo, devuelve null.
   */
  static safeRatio(numerator: number, denominator: number): RatioOrNull {
    if (denominator <= 0) return null;
    return Math.round((numerator / denominator) * 100) / 100; // 2 decimales (ej. 0.85)
  }

  /**
   * Formatea milisegundos a mm:ss
   */
  static formatMs(ms: number | null): string {
    if (ms === null) return '—';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  /**
   * Determina si un jugador estuvo en cancha en un momento deportivo específico,
   * resolviendo desempates si hubo sustitución en el mismo milisegundo de reloj.
   */
  static isPlayerOnCourtAtSportingTime(
    rosterId: string,
    periodId: string,
    clockMs: number,
    eventSportSeq: number,
    participations: PlayerParticipationInterval[],
    allEventsInMatch: MatchEvent[]
  ): boolean {
    const playerIntervals = participations.filter(
      (p) => p.period_id === periodId && p.roster_id === rosterId
    );

    for (const interval of playerIntervals) {
      // 1. Verificación básica de rango de tiempo
      const enteredBeforeOrAt = interval.in_clock_ms <= clockMs;
      const leftAfterOrAt = interval.out_clock_ms === undefined || clockMs <= interval.out_clock_ms;

      if (!enteredBeforeOrAt || !leftAfterOrAt) {
        continue;
      }

      // 2. Desempate si el evento ocurrió exactamente en in_clock_ms
      if (interval.in_clock_ms === clockMs && interval.in_event_id) {
        const inEvent = allEventsInMatch.find((e) => e.id === interval.in_event_id);
        if (inEvent && inEvent.sport_seq > eventSportSeq) {
          // El jugador entró DESPUÉS de que ocurriera el evento
          continue;
        }
      }

      // 3. Desempate si el evento ocurrió exactamente en out_clock_ms
      if (interval.out_clock_ms !== undefined && interval.out_clock_ms === clockMs && interval.out_event_id) {
        const outEvent = allEventsInMatch.find((e) => e.id === interval.out_event_id);
        if (outEvent && outEvent.sport_seq < eventSportSeq) {
          // El jugador ya había salido ANTES de que ocurriera el evento
          continue;
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Determina si la formación del equipo en cancha estuvo explícitamente confirmada
   * y consistente en un momento deportivo específico.
   *
   * Reglas de negocio rigurosas:
   * - No confunde cantidad de jugadores con calidad del registro.
   * - Una formación reducida (ej. 4 jugadores por exclusiones de 2 min, o por jugar sin arquero,
   *   o por presentarse con menos jugadores) está COMPLETAMENTE REGISTRADA si fue explícitamente
   *   confirmada y sus cambios son consistentes.
   * - Si en el período no hubo registro alguno de formación para el equipo: cobertura desconocida ('NO_DATA').
   * - Si el evento ocurrió antes de la confirmación inicial del período: es un intervalo sin confirmar.
   * - Si en ese instante hay 0 jugadores en cancha sin formación activa: es un intervalo sin formación.
   */
  static isTeamLineupConfirmedAtSportingTime(
    teamId: string,
    periodId: string,
    clockMs: number,
    eventSportSeq: number,
    participations: PlayerParticipationInterval[],
    allEventsInMatch: MatchEvent[]
  ): { isConfirmed: boolean; onCourtCount: number; reason?: string } {
    const teamPeriodIntervals = participations.filter(
      (p) => p.period_id === periodId && p.team_id === teamId
    );

    if (teamPeriodIntervals.length === 0) {
      return {
        isConfirmed: false,
        onCourtCount: 0,
        reason: 'El equipo no tiene formación confirmada en este período',
      };
    }

    const earliestInClockMs = Math.min(...teamPeriodIntervals.map((p) => p.in_clock_ms));
    if (clockMs < earliestInClockMs) {
      return {
        isConfirmed: false,
        onCourtCount: 0,
        reason: `Acción a los ${this.formatMs(clockMs)} ocurrió antes de confirmar la formación del período (inició a los ${this.formatMs(earliestInClockMs)})`,
      };
    }

    // Contar jugadores actualmente en cancha de este equipo
    const uniqueTeamRosterIds = Array.from(new Set(teamPeriodIntervals.map((p) => p.roster_id)));
    let onCourtCount = 0;
    for (const rId of uniqueTeamRosterIds) {
      if (this.isPlayerOnCourtAtSportingTime(rId, periodId, clockMs, eventSportSeq, participations, allEventsInMatch)) {
        onCourtCount += 1;
      }
    }

    if (onCourtCount === 0) {
      return {
        isConfirmed: false,
        onCourtCount: 0,
        reason: `Acción a los ${this.formatMs(clockMs)} ocurrió en un intervalo sin jugadores registrados en cancha`,
      };
    }

    return {
      isConfirmed: true,
      onCourtCount,
    };
  }

  /**
   * Verifica la coherencia interna de los intervalos de un jugador en un período.
   * Detecta contradicciones como salidas previas a la entrada o solapamientos imposibles.
   */
  static checkPlayerContradictions(
    rosterId: string,
    periodId: string,
    participations: PlayerParticipationInterval[]
  ): { hasContradiction: boolean; reason?: string } {
    const intervals = participations.filter(
      (p) => p.period_id === periodId && p.roster_id === rosterId
    );

    for (let i = 0; i < intervals.length; i++) {
      const a = intervals[i]!;
      if (a.out_clock_ms !== undefined && a.out_clock_ms < a.in_clock_ms) {
        return {
          hasContradiction: true,
          reason: `Intervalo contradictorio: salida (${this.formatMs(a.out_clock_ms)}) anterior a la entrada (${this.formatMs(a.in_clock_ms)})`,
        };
      }

      for (let j = i + 1; j < intervals.length; j++) {
        const b = intervals[j]!;
        const aEnd = a.out_clock_ms !== undefined ? a.out_clock_ms : Infinity;
        const bEnd = b.out_clock_ms !== undefined ? b.out_clock_ms : Infinity;

        // Comprobar solapamiento temporal real
        if (Math.max(a.in_clock_ms, b.in_clock_ms) < Math.min(aEnd, bEnd)) {
          return {
            hasContradiction: true,
            reason: `Intervalos solapados contradictorios para el jugador en el período`,
          };
        }
      }
    }

    return { hasContradiction: false };
  }

  /**
   * Calcula el desglose de lanzamientos para un conjunto de eventos de tiro.
   */
  static calculateShotBreakdown(shotEvents: MatchEvent[]): ShotResultBreakdown {
    const breakdown: ShotResultBreakdown = {
      goals: 0,
      saved: 0,
      missed: 0,
      post: 0,
      blocked: 0,
      total_shots: 0,
      effectiveness_pct: null,
    };

    for (const ev of shotEvents) {
      if (ev.type !== 'SHOT' || ev.status !== 'active') continue;
      breakdown.total_shots += 1;
      const res = ev.shot_detail?.result_code;
      if (res === 'GOAL') breakdown.goals += 1;
      else if (res === 'SAVED') breakdown.saved += 1;
      else if (res === 'MISSED') breakdown.missed += 1;
      else if (res === 'POST') breakdown.post += 1;
      else if (res === 'BLOCKED') breakdown.blocked += 1;
    }

    breakdown.effectiveness_pct = this.safePercentage(breakdown.goals, breakdown.total_shots);
    return breakdown;
  }

  /**
   * Construye el mapa de lanzamientos por zona de origen en la cancha.
   */
  static calculateCourtMap(shotEvents: MatchEvent[]): CourtShotMap {
    const zones: Record<string, ZoneStat> = {};
    for (const def of COURT_ZONES_DEF) {
      zones[def.code] = {
        code: def.code,
        name: def.name,
        attempts: 0,
        goals: 0,
        saved: 0,
        missed: 0,
        effectiveness_pct: null,
      };
    }

    let unspecified_count = 0;
    let unspecified_goals = 0;
    let total_attempts = 0;
    let total_goals = 0;

    for (const ev of shotEvents) {
      if (ev.type !== 'SHOT' || ev.status !== 'active') continue;
      total_attempts += 1;
      const isGoal = ev.shot_detail?.result_code === 'GOAL';
      if (isGoal) total_goals += 1;

      const zoneCode = ev.shot_detail?.origin_zone_code;
      if (zoneCode && zones[zoneCode]) {
        const target = zones[zoneCode]!;
        target.attempts += 1;
        if (isGoal) target.goals += 1;
        else if (ev.shot_detail?.result_code === 'SAVED') target.saved += 1;
        else target.missed += 1;
      } else {
        unspecified_count += 1;
        if (isGoal) unspecified_goals += 1;
      }
    }

    for (const key of Object.keys(zones)) {
      const z = zones[key]!;
      z.effectiveness_pct = this.safePercentage(z.goals, z.attempts);
    }

    return {
      zones,
      unspecified_count,
      unspecified_goals,
      total_attempts,
      total_goals,
    };
  }

  /**
   * Construye el mapa de lanzamientos por destino en la portería.
   */
  static calculateGoalTargetMap(shotEvents: MatchEvent[]): GoalTargetMap {
    const targets: Record<string, ZoneStat> = {};
    for (const def of GOAL_TARGETS_DEF) {
      targets[def.code] = {
        code: def.code,
        name: def.name,
        attempts: 0,
        goals: 0,
        saved: 0,
        missed: 0,
        effectiveness_pct: null,
      };
    }

    let unspecified_count = 0;
    let unspecified_goals = 0;
    let total_attempts = 0;
    let total_goals = 0;

    for (const ev of shotEvents) {
      if (ev.type !== 'SHOT' || ev.status !== 'active') continue;
      total_attempts += 1;
      const isGoal = ev.shot_detail?.result_code === 'GOAL';
      if (isGoal) total_goals += 1;

      const targetCode = ev.shot_detail?.target_zone_code;
      if (targetCode && targets[targetCode]) {
        const target = targets[targetCode]!;
        target.attempts += 1;
        if (isGoal) target.goals += 1;
        else if (ev.shot_detail?.result_code === 'SAVED') target.saved += 1;
        else target.missed += 1;
      } else {
        unspecified_count += 1;
        if (isGoal) unspecified_goals += 1;
      }
    }

    for (const key of Object.keys(targets)) {
      const t = targets[key]!;
      t.effectiveness_pct = this.safePercentage(t.goals, t.attempts);
    }

    return {
      targets,
      unspecified_count,
      unspecified_goals,
      total_attempts,
      total_goals,
    };
  }

  /**
   * Calcula el motor estadístico completo de un partido.
   * Totalmente determinista, puro e independiente de React.
   */
  static calculateMatchStats(
    match: Match,
    periods: MatchPeriod[],
    teams: Team[],
    rosters: MatchRoster[],
    events: MatchEvent[],
    possessions: MatchPossession[] = [],
    participations: PlayerParticipationInterval[] = [],
    filterOptions?: StatsFilterOptions
  ): MatchCompleteStats {
    const homeTeam = teams.find((t) => t.id === match.home_team_id);
    const awayTeam = teams.find((t) => t.id === match.away_team_id);

    const homeTeamName = match.home_team_name_snapshot || homeTeam?.name || 'Local';
    const awayTeamName = match.away_team_name_snapshot || awayTeam?.name || 'Visitante';

    // 1. Filtrar eventos activos (nunca incluir acciones anuladas 'voided')
    let activeEvents = events.filter((e) => e.status === 'active');

    // Aplicar filtros opcionales
    if (filterOptions?.periodId) {
      activeEvents = activeEvents.filter((e) => e.period_id === filterOptions.periodId);
    }
    if (filterOptions?.teamId) {
      activeEvents = activeEvents.filter((e) => e.match_team_id === filterOptions.teamId);
    }
    if (filterOptions?.numericalContext && filterOptions.numericalContext !== 'ALL' as any) {
      activeEvents = activeEvents.filter((e) => {
        const ctx = e.numerical_situation?.context || e.shot_detail?.numerical_context || 'UNKNOWN';
        return ctx === filterOptions.numericalContext;
      });
    }

    // 2. Ordenar cronológicamente deportiva: período ascendente, clock_ms ascendente y sport_seq ascendente
    const periodNumberMap = new Map<string, number>(periods.map((p) => [p.id, p.number]));

    const sortedSportEvents = [...activeEvents].sort((a, b) => {
      const pNumA = periodNumberMap.get(a.period_id) ?? 1;
      const pNumB = periodNumberMap.get(b.period_id) ?? 1;
      if (pNumA !== pNumB) return pNumA - pNumB;
      if (a.clock_ms !== b.clock_ms) return a.clock_ms - b.clock_ms;
      return a.sport_seq - b.sport_seq;
    });

    // 3. Marcador y evolución del tanteador
    const sortedPeriods = [...periods].sort((a, b) => a.number - b.number);
    const periodsSummary: PeriodScoreSummary[] = sortedPeriods.map((p) => {
      const pGoals = sortedSportEvents.filter(
        (e) => e.period_id === p.id && e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL'
      );
      const homeGoals = pGoals.filter((e) => e.match_team_id === match.home_team_id).length;
      const awayGoals = pGoals.filter((e) => e.match_team_id === match.away_team_id).length;
      return {
        period_id: p.id,
        period_number: p.number,
        home_goals: homeGoals,
        away_goals: awayGoals,
      };
    });

    let currentHomeScore = 0;
    let currentAwayScore = 0;
    const scoreProgression: ScoreProgressionPoint[] = [];

    for (const ev of sortedSportEvents) {
      if (ev.type === 'SHOT' && ev.shot_detail?.result_code === 'GOAL') {
        const isHome = ev.match_team_id === match.home_team_id;
        if (isHome) currentHomeScore += 1;
        else currentAwayScore += 1;

        const period = periods.find((p) => p.id === ev.period_id);
        const shooter = ev.participants.find((p) => p.role === 'SHOOTER');
        const shooterRoster = rosters.find((r) => r.id === shooter?.roster_id);

        scoreProgression.push({
          clock_ms: ev.clock_ms,
          clock_formatted: this.formatMs(ev.clock_ms),
          period_number: period?.number ?? 1,
          scoring_team_id: ev.match_team_id || '',
          scoring_player_name: shooterRoster?.display_name_snapshot,
          home_score: currentHomeScore,
          away_score: currentAwayScore,
          difference: currentHomeScore - currentAwayScore,
        });
      }
    }

    const finalHomeScore = currentHomeScore;
    const finalAwayScore = currentAwayScore;

    // 4. Estadísticas colectivas de tiro
    const homeShots = sortedSportEvents.filter(
      (e) => e.match_team_id === match.home_team_id && e.type === 'SHOT'
    );
    const awayShots = sortedSportEvents.filter(
      (e) => e.match_team_id === match.away_team_id && e.type === 'SHOT'
    );

    const homeShotBreakdown = this.calculateShotBreakdown(homeShots);
    const awayShotBreakdown = this.calculateShotBreakdown(awayShots);

    // 5. Pérdidas, recuperaciones, bloqueos y sanciones
    const homeTurnovers = sortedSportEvents.filter(
      (e) => e.match_team_id === match.home_team_id && e.type === 'TURNOVER'
    ).length;
    const awayTurnovers = sortedSportEvents.filter(
      (e) => e.match_team_id === match.away_team_id && e.type === 'TURNOVER'
    ).length;

    const homeSteals = sortedSportEvents.filter((e) => {
      if (e.payload?.recovering_team_id) {
        return e.payload.recovering_team_id === match.home_team_id;
      }
      const rec = e.participants.find((p) => p.role === 'RECOVERED_BY');
      if (rec) {
        const roster = rosters.find((r) => r.id === rec.roster_id);
        if (roster) return roster.team_id === match.home_team_id;
      }
      return e.match_team_id === match.home_team_id && e.participants.some((p) => p.role === 'RECOVERED_BY');
    }).length;

    const awaySteals = sortedSportEvents.filter((e) => {
      if (e.payload?.recovering_team_id) {
        return e.payload.recovering_team_id === match.away_team_id;
      }
      const rec = e.participants.find((p) => p.role === 'RECOVERED_BY');
      if (rec) {
        const roster = rosters.find((r) => r.id === rec.roster_id);
        if (roster) return roster.team_id === match.away_team_id;
      }
      return e.match_team_id === match.away_team_id && e.participants.some((p) => p.role === 'RECOVERED_BY');
    }).length;

    const homeBlocks = sortedSportEvents.filter(
      (e) => e.match_team_id === match.home_team_id && e.participants.some((p) => p.role === 'BLOCKER')
    ).length;
    const awayBlocks = sortedSportEvents.filter(
      (e) => e.match_team_id === match.away_team_id && e.participants.some((p) => p.role === 'BLOCKER')
    ).length;

    const calculateSanctions = (teamId: string) => {
      const sanctionEvents = sortedSportEvents.filter(
        (e) => e.match_team_id === teamId && e.type === 'SANCTION'
      );
      return {
        yellow_cards: sanctionEvents.filter((e) => e.sanction_detail?.kind === 'YELLOW_CARD').length,
        two_minute_suspensions: sanctionEvents.filter((e) => e.sanction_detail?.kind === 'TWO_MINUTE').length,
        red_cards: sanctionEvents.filter((e) => e.sanction_detail?.kind === 'RED_CARD').length,
        blue_cards: sanctionEvents.filter((e) => e.sanction_detail?.kind === 'BLUE_CARD').length,
      };
    };

    const homeSanctions = calculateSanctions(match.home_team_id);
    const awaySanctions = calculateSanctions(match.away_team_id);

    // 6. Posesiones y Eficiencia Ofensiva con detección de cobertura parcial
    const activeEventsMap = new Map<string, MatchEvent>(events.map((e: MatchEvent) => [e.id, e]));

    const calculatePossessionStats = (teamId: string): PossessionStats => {
      const teamActiveEvents = sortedSportEvents.filter((e) => e.match_team_id === teamId);
      const teamGoals = teamActiveEvents.filter(
        (e) => e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL'
      );
      const teamShots = teamActiveEvents.filter((e) => e.type === 'SHOT');
      const teamTurnovers = teamActiveEvents.filter((e) => e.type === 'TURNOVER');

      // Filtrar posesiones del equipo
      const rawTeamPossessions = possessions.filter((p) => p.team_id === teamId);

      if (rawTeamPossessions.length === 0) {
        return {
          total_possessions: 0,
          complete_possessions: 0,
          goals_scored: 0,
          goals_in_tracked_possessions: 0,
          turnovers_committed: 0,
          goals_per_possession: null,
          turnovers_per_possession: null,
          total_match_goals: teamGoals.length,
          unassociated_goals: teamGoals.length,
          unassociated_shots: teamShots.length,
          unassociated_turnovers: teamTurnovers.length,
          coverage_status: teamGoals.length > 0 || teamShots.length > 0 ? 'PARTIAL' : 'NO_DATA',
          coverage_warning: teamGoals.length > 0
            ? `Sin registro de posesiones: los ${teamGoals.length} goles ocurrieron sin posesión vinculada.`
            : 'Sin registro de posesiones para este equipo',
          has_data: false,
          has_inconsistency: false,
        };
      }

      const inconsistencyReasons: string[] = [];
      const possessionIssues = new Map<string, string[]>();

      const addPossessionIssue = (posId: string, reason: string) => {
        const list = possessionIssues.get(posId) || [];
        list.push(reason);
        possessionIssues.set(posId, list);
        inconsistencyReasons.push(`Posesión ${posId}: ${reason}`);
      };

      // 1. Filtrar posesiones descartando las que fueron iniciadas por eventos que fueron anulados
      const teamPossessions = rawTeamPossessions.filter((p) => {
        if (p.start_event_id) {
          const startEv = activeEventsMap.get(p.start_event_id);
          if (startEv && startEv.status === 'voided') {
            addPossessionIssue(p.id, `Iniciada por un evento anulado (${p.start_event_id})`);
            return false;
          }
        }
        return true;
      }).map((p) => {
        // Si el evento de cierre fue anulado, la posesión se reabre para la estadística
        if (p.end_event_id) {
          const endEv = activeEventsMap.get(p.end_event_id);
          if (endEv && endEv.status === 'voided') {
            return {
              ...p,
              is_complete: false,
              end_clock_ms: undefined,
              end_reason: undefined,
              end_event_id: undefined,
            };
          }
        }
        return p;
      });

      // 2. Comprobar solapamientos y límites cronológicos por período
      const possessionsByPeriod = new Map<string, MatchPossession[]>();
      for (const p of teamPossessions) {
        const list = possessionsByPeriod.get(p.period_id) || [];
        list.push(p);
        possessionsByPeriod.set(p.period_id, list);
      }

      for (const [, pList] of possessionsByPeriod.entries()) {
        const sorted = [...pList].sort((a, b) => a.start_clock_ms - b.start_clock_ms);
        for (let i = 0; i < sorted.length; i++) {
          const cur = sorted[i]!;
          if (cur.end_clock_ms !== undefined && cur.start_clock_ms > cur.end_clock_ms) {
            addPossessionIssue(cur.id, `Fin (${this.formatMs(cur.end_clock_ms)}) anterior a inicio (${this.formatMs(cur.start_clock_ms)})`);
          }
          if (i < sorted.length - 1) {
            const nextP = sorted[i + 1]!;
            if (cur.end_clock_ms !== undefined && cur.end_clock_ms > nextP.start_clock_ms) {
              addPossessionIssue(cur.id, `Solapamiento con posesión siguiente: ${this.formatMs(cur.end_clock_ms)} > ${this.formatMs(nextP.start_clock_ms)}`);
              addPossessionIssue(nextP.id, `Solapamiento con posesión anterior`);
            }
          }
        }
      }

      // 3. Auditoría estricta de goles asociados a posesiones completas
      const complete = teamPossessions.filter((p) => p.is_complete);
      const possessionToGoalMap = new Map<string, MatchEvent>();
      const goalToPossessionMap = new Map<string, string>();
      const possessionToTurnoverMap = new Map<string, MatchEvent>();
      const turnoverToPossessionMap = new Map<string, string>();
      const trackedShotIds = new Set<string>();

      for (const p of complete) {
        // En handball una posesión termina con un gol válido
        if (p.end_reason === 'GOAL') {
          if (p.end_event_id) {
            const goalEv = activeEventsMap.get(p.end_event_id);
            if (!goalEv || goalEv.status !== 'active') {
              addPossessionIssue(p.id, `Apunta a un evento de gol inexistente o anulado (${p.end_event_id})`);
            } else if (goalEv.type !== 'SHOT' || goalEv.shot_detail?.result_code !== 'GOAL') {
              addPossessionIssue(p.id, `Apunta a un evento que no es gol válido`);
            } else if (goalEv.match_team_id !== p.team_id) {
              addPossessionIssue(p.id, `Asociada a un gol de otro equipo`);
            } else if (goalEv.period_id !== p.period_id) {
              addPossessionIssue(p.id, `Asociada a un gol de otro período (${goalEv.period_id})`);
            } else if (goalEv.clock_ms < p.start_clock_ms || (p.end_clock_ms !== undefined && goalEv.clock_ms > p.end_clock_ms + 1000)) {
              addPossessionIssue(p.id, `Gol ${goalEv.id} fuera de los límites de la posesión (${this.formatMs(p.start_clock_ms)}-${p.end_clock_ms !== undefined ? this.formatMs(p.end_clock_ms) : '—'})`);
            } else {
              // Asociación válida
              if (goalToPossessionMap.has(goalEv.id)) {
                addPossessionIssue(p.id, `El gol ${goalEv.id} está vinculado a más de una posesión`);
              } else {
                goalToPossessionMap.set(goalEv.id, p.id);
                possessionToGoalMap.set(p.id, goalEv);
              }
            }
          } else {
            // Sin end_event_id pero end_reason === 'GOAL'
            const candidateGoals = teamGoals.filter(
              (g) => g.period_id === p.period_id && g.clock_ms === p.end_clock_ms && !goalToPossessionMap.has(g.id)
            );
            if (candidateGoals.length === 1) {
              const g = candidateGoals[0]!;
              goalToPossessionMap.set(g.id, p.id);
              possessionToGoalMap.set(p.id, g);
            } else {
              addPossessionIssue(p.id, `Finalizada por gol sin asociación directa comprobable`);
            }
          }
        }

        // Una posesión termina con un gol. No debe contener varios goles válidos ni incluir acciones posteriores a su cierre
        const extraGoalsInside = teamGoals.filter((g) => {
          if (g.period_id !== p.period_id) return false;
          if (g.id === p.end_event_id) return false;
          const endLimit = p.end_clock_ms !== undefined ? p.end_clock_ms : Infinity;
          return g.clock_ms >= p.start_clock_ms && g.clock_ms < endLimit;
        });
        if (extraGoalsInside.length > 0) {
          addPossessionIssue(p.id, `Contiene múltiples goles válidos antes de su cierre. Una posesión termina con un gol`);
        }

        if (p.end_reason === 'TURNOVER') {
          if (p.end_event_id) {
            const tEv = activeEventsMap.get(p.end_event_id);
            if (tEv && tEv.status === 'active' && tEv.type === 'TURNOVER') {
              turnoverToPossessionMap.set(tEv.id, p.id);
              possessionToTurnoverMap.set(p.id, tEv);
            } else {
              addPossessionIssue(p.id, `Apunta a una pérdida inexistente o anulada (${p.end_event_id})`);
            }
          }
        }

        // Tiros dentro de la posesión (por ejemplo tiro atajado con rebote ofensivo previo al cierre)
        for (const s of teamShots) {
          if (s.period_id === p.period_id && s.clock_ms >= p.start_clock_ms) {
            const endLimit = p.end_clock_ms !== undefined ? p.end_clock_ms : Infinity;
            if (s.clock_ms <= endLimit) {
              trackedShotIds.add(s.id);
            }
          }
        }
      }

      // Pérdidas dentro de posesiones
      const trackedTurnoverIds = new Set<string>();
      for (const p of teamPossessions) {
        for (const t of teamTurnovers) {
          if (t.period_id === p.period_id && p.start_clock_ms <= t.clock_ms) {
            const endLimit = p.end_clock_ms !== undefined ? p.end_clock_ms : Infinity;
            if (t.clock_ms <= endLimit) {
              trackedTurnoverIds.add(t.id);
            }
          }
        }
      }

      // Goles del equipo no asociados a ninguna posesión completa válida (goles anteriores o fuera de tracking)
      const unassociatedGoals = teamGoals.filter((g) => !goalToPossessionMap.has(g.id)).length;
      const unassociatedShots = Math.max(0, teamShots.length - trackedShotIds.size);
      const unassociatedTurnovers = Math.max(0, teamTurnovers.length - trackedTurnoverIds.size);

      // Los goles asociados a las mismas posesiones completas incluidas en el denominador
      const goalsInTrackedPossessions = possessionToGoalMap.size;
      const turnoversInTrackedPossessions = possessionToTurnoverMap.size;

      const hasInconsistency = inconsistencyReasons.length > 0;

      // Si los datos son inconsistentes, se muestra 'null' ('—' en UI) y no se publica un ratio inválido
      const goalsPerPossession = hasInconsistency
        ? null
        : complete.length > 0
        ? this.safeRatio(goalsInTrackedPossessions, complete.length)
        : null;

      const turnoversPerPossession = hasInconsistency
        ? null
        : complete.length > 0
        ? this.safeRatio(turnoversInTrackedPossessions, complete.length)
        : null;

      const hasPartialCoverage = unassociatedGoals > 0 || unassociatedShots > 0;
      const coverageStatus: 'COMPLETE' | 'PARTIAL' | 'NO_DATA' = hasInconsistency
        ? 'PARTIAL'
        : hasPartialCoverage
        ? 'PARTIAL'
        : 'COMPLETE';

      const coverageWarning = hasInconsistency
        ? `Inconsistencia en posesiones: ${inconsistencyReasons.join(' | ')}`
        : hasPartialCoverage
        ? `Cobertura parcial: ${unassociatedGoals} de ${teamGoals.length} goles y ${unassociatedShots} tiros del equipo ocurrieron antes o fuera del seguimiento de posesiones.`
        : undefined;

      const possessionGoalMap: Record<string, string> = {};
      for (const [posId, gEv] of possessionToGoalMap.entries()) {
        possessionGoalMap[posId] = gEv.id;
      }

      const possessionValidityMap: Record<string, { isValidForMetrics: boolean; reason?: string }> = {};
      let validCompleteCount = 0;
      for (const p of rawTeamPossessions) {
        const issues = possessionIssues.get(p.id) || [];
        if (!p.is_complete) {
          possessionValidityMap[p.id] = {
            isValidForMetrics: false,
            reason: issues.length > 0 ? issues.join('; ') : 'Incompleta / En curso',
          };
        } else if (issues.length > 0) {
          possessionValidityMap[p.id] = {
            isValidForMetrics: false,
            reason: issues.join('; '),
          };
        } else {
          possessionValidityMap[p.id] = {
            isValidForMetrics: true,
          };
          validCompleteCount += 1;
        }
      }

      return {
        total_possessions: teamPossessions.length,
        complete_possessions: complete.length,
        valid_complete_possessions: validCompleteCount,
        goals_scored: goalsInTrackedPossessions,
        goals_in_tracked_possessions: goalsInTrackedPossessions,
        turnovers_committed: turnoversInTrackedPossessions,
        goals_per_possession: goalsPerPossession,
        turnovers_per_possession: turnoversPerPossession,
        total_match_goals: teamGoals.length,
        unassociated_goals: unassociatedGoals,
        unassociated_shots: unassociatedShots,
        unassociated_turnovers: unassociatedTurnovers,
        coverage_status: coverageStatus,
        coverage_warning: coverageWarning,
        has_data: true,
        has_inconsistency: hasInconsistency,
        inconsistency_reasons: inconsistencyReasons.length > 0 ? inconsistencyReasons : undefined,
        possession_goal_map: possessionGoalMap,
        possession_validity_map: possessionValidityMap,
      };
    };

    const homePossessions = calculatePossessionStats(match.home_team_id);
    const awayPossessions = calculatePossessionStats(match.away_team_id);

    // 7. Estadísticas Individuales de Jugadores
    const hasAnyParticipationData = participations.length > 0;

    const playerStats: PlayerMatchStats[] = rosters.map((roster) => {
      const playerEvents = sortedSportEvents.filter((e) =>
        e.participants.some((p) => p.roster_id === roster.id)
      );

      const pShots = playerEvents.filter(
        (e) => e.type === 'SHOT' && e.participants.some((p) => p.roster_id === roster.id && p.role === 'SHOOTER')
      );
      const pShotBreakdown = this.calculateShotBreakdown(pShots);

      const assists = sortedSportEvents.filter(
        (e) =>
          e.type === 'SHOT' &&
          e.shot_detail?.result_code === 'GOAL' &&
          e.participants.some((p) => p.roster_id === roster.id && p.role === 'ASSIST')
      ).length;

      const turnovers = sortedSportEvents.filter(
        (e) =>
          e.type === 'TURNOVER' &&
          e.participants.some((p) => p.roster_id === roster.id && (p.role === 'TURNOVER_BY' || p.role === 'SHOOTER'))
      ).length;

      const steals = sortedSportEvents.filter((e) =>
        e.participants.some((p) => p.roster_id === roster.id && p.role === 'RECOVERED_BY')
      ).length;

      const blocks = sortedSportEvents.filter((e) =>
        e.participants.some((p) => p.roster_id === roster.id && p.role === 'BLOCKER')
      ).length;

      const pSanctions = sortedSportEvents.filter(
        (e) =>
          e.type === 'SANCTION' &&
          e.participants.some((p) => p.roster_id === roster.id && p.role === 'SANCTIONED')
      );

      const yellow_cards = pSanctions.filter((e) => e.sanction_detail?.kind === 'YELLOW_CARD').length;
      const two_minute_suspensions = pSanctions.filter((e) => e.sanction_detail?.kind === 'TWO_MINUTE').length;
      const red_cards = pSanctions.filter((e) => e.sanction_detail?.kind === 'RED_CARD').length;
      const blue_cards = pSanctions.filter((e) => e.sanction_detail?.kind === 'BLUE_CARD').length;

      // Minutos jugados
      const playerIntervals = participations.filter((p) => p.roster_id === roster.id);
      const teamParticipations = participations.filter((p) => p.team_id === roster.team_id);
      const hasTeamParticipationData = teamParticipations.length > 0;
      let minutes_played_ms: number | null = null;
      let is_active_on_court = false;

      if (hasAnyParticipationData && playerIntervals.length > 0) {
        let totalMs = 0;
        for (const interval of playerIntervals) {
          if (interval.is_active && interval.out_clock_ms === undefined) {
            is_active_on_court = true;
            // Para intervalo activo, computar hasta el evento más reciente de ese período o duración nominal
            const lastPeriodEvent = sortedSportEvents
              .filter((e) => e.period_id === interval.period_id)
              .pop();
            const currentPeriodClock = lastPeriodEvent ? lastPeriodEvent.clock_ms : interval.in_clock_ms;
            totalMs += Math.max(0, currentPeriodClock - interval.in_clock_ms);
          } else if (interval.out_clock_ms !== undefined) {
            totalMs += Math.max(0, interval.out_clock_ms - interval.in_clock_ms);
          }
        }
        minutes_played_ms = totalMs;
      } else if (hasAnyParticipationData && hasTeamParticipationData) {
        // El equipo tiene seguimiento de formación registrado, pero el jugador estuvo en el banco todo el partido
        minutes_played_ms = 0;
      }

      // Plus/Minus (+/-) y Cobertura de Formación en Cancha
      let plus_minus: number | null = null;
      let plus_minus_coverage: 'FULL' | 'PARTIAL' | 'NO_DATA' = 'NO_DATA';
      let individual_coverage: 'FULL' | 'PARTIAL' | 'NO_DATA' = 'NO_DATA';
      let team_lineup_coverage: 'FULL' | 'PARTIAL' | 'NO_DATA' = 'NO_DATA';
      let uncovered_match_goals = 0;
      let plus_minus_note: string | undefined = undefined;

      const allMatchGoals = sortedSportEvents.filter(
        (e) => e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL'
      );

      if (!hasAnyParticipationData || !hasTeamParticipationData) {
        individual_coverage = 'NO_DATA';
        team_lineup_coverage = 'NO_DATA';
        plus_minus_coverage = 'NO_DATA';
        plus_minus = null;
        plus_minus_note = 'Sin datos de formación o participación registrados para el equipo en el partido.';
      } else {
        let pm = 0;
        let teamUncoveredGoalsCount = 0;
        let individualUncertainGoalsCount = 0;
        const gapExplanations: string[] = [];

        // Comprobar si el jugador tiene contradicciones internas en sus intervalos
        let hasPlayerContradiction = false;
        let playerContradictionReason: string | undefined = undefined;
        for (const p of periods) {
          const chk = StatsEngine.checkPlayerContradictions(roster.id, p.id, participations);
          if (chk.hasContradiction) {
            hasPlayerContradiction = true;
            playerContradictionReason = chk.reason;
            break;
          }
        }

        for (const goal of allMatchGoals) {
          // 1. Cobertura colectiva de la formación del equipo en este instante deportivo
          const teamLineupCheck = StatsEngine.isTeamLineupConfirmedAtSportingTime(
            roster.team_id,
            goal.period_id,
            goal.clock_ms,
            goal.sport_seq,
            participations,
            sortedSportEvents
          );

          if (!teamLineupCheck.isConfirmed) {
            teamUncoveredGoalsCount += 1;
            if (teamLineupCheck.reason && !gapExplanations.includes(teamLineupCheck.reason)) {
              gapExplanations.push(teamLineupCheck.reason);
            }
          }

          // 2. Participación individual del jugador en este instante deportivo
          const wasOnCourt = StatsEngine.isPlayerOnCourtAtSportingTime(
            roster.id,
            goal.period_id,
            goal.clock_ms,
            goal.sport_seq,
            participations,
            sortedSportEvents
          );

          if (wasOnCourt) {
            if (goal.match_team_id === roster.team_id) {
              pm += 1;
            } else {
              pm -= 1;
            }
          }

          // Si el gol ocurrió en un intervalo sin formación confirmada para el equipo en ese período,
          // o si el jugador tiene contradicciones temporales: la presencia individual en ese gol es incierta
          if (!teamLineupCheck.isConfirmed || hasPlayerContradiction) {
            individualUncertainGoalsCount += 1;
          }
        }

        plus_minus = pm;
        uncovered_match_goals = individualUncertainGoalsCount;

        // Determinar cobertura colectiva de la formación del equipo
        team_lineup_coverage = teamUncoveredGoalsCount === 0 ? 'FULL' : 'PARTIAL';

        // Determinar cobertura individual del jugador
        if (hasPlayerContradiction) {
          individual_coverage = 'PARTIAL';
          plus_minus_coverage = 'PARTIAL';
          plus_minus_note = `Cálculo sobre cobertura parcial: ${playerContradictionReason || 'Intervalos contradictorios del jugador'}.`;
        } else if (individualUncertainGoalsCount > 0) {
          individual_coverage = 'PARTIAL';
          plus_minus_coverage = 'PARTIAL';
          plus_minus_note = `Cálculo sobre cobertura parcial: ${gapExplanations.join('; ')}.`;
        } else {
          individual_coverage = 'FULL';
          plus_minus_coverage = 'FULL';
          if (team_lineup_coverage === 'PARTIAL') {
            plus_minus_note = `Participación individual fiable (la formación colectiva del equipo presenta observaciones en otros tramos del partido).`;
          }
        }
      }

      return {
        roster_id: roster.id,
        player_id: roster.player_id,
        display_name: roster.display_name_snapshot,
        shirt_number: roster.shirt_number,
        team_id: roster.team_id,
        role: roster.role,
        is_starter: roster.is_starter,
        goals: pShotBreakdown.goals,
        total_shots: pShotBreakdown.total_shots,
        shot_effectiveness_pct: pShotBreakdown.effectiveness_pct,
        saved_shots: pShotBreakdown.saved,
        missed_shots: pShotBreakdown.missed,
        post_shots: pShotBreakdown.post,
        blocked_shots: pShotBreakdown.blocked,
        assists,
        turnovers,
        steals,
        defensive_blocks: blocks,
        yellow_cards,
        two_minute_suspensions,
        red_cards,
        blue_cards,
        minutes_played_ms,
        minutes_played_formatted: StatsEngine.formatMs(minutes_played_ms),
        is_active_on_court,
        has_participation_data: hasTeamParticipationData,
        plus_minus,
        plus_minus_coverage,
        individual_coverage,
        team_lineup_coverage,
        uncovered_match_goals,
        plus_minus_note,
      };
    });

    // 8. Estadísticas de Porteros (con diferenciación estricta de portería vacía y portero desconocido/no atribuido)
    const goalkeeperStats: GoalkeeperMatchStats[] = [];

    const calculateTeamGoalkeeping = (defendingTeamId: string, defendingTeamName: string): GoalkeeperTeamSummary => {
      const opposingTeamId = defendingTeamId === match.home_team_id ? match.away_team_id : match.home_team_id;
      const opposingShots = sortedSportEvents.filter(
        (e) => e.match_team_id === opposingTeamId && e.type === 'SHOT'
      );
      const opposingGoals = opposingShots.filter((s) => s.shot_detail?.result_code === 'GOAL');

      const teamGkRosters = rosters.filter((r) => r.team_id === defendingTeamId && r.role === 'GK');

      // Rastrear qué tiros fueron atribuidos a arqueros nominales
      const attributedShotIds = new Set<string>();
      let totalEmptyNetGoals = 0;

      for (const gkRoster of teamGkRosters) {
        let saves = 0;
        let goals_conceded = 0;
        let shots_off_target = 0;
        let empty_net_goals_conceded = 0;

        for (const shot of opposingShots) {
          if (shot.shot_detail?.is_empty_net) {
            if (shot.shot_detail?.result_code === 'GOAL') {
              empty_net_goals_conceded += 1;
              totalEmptyNetGoals += 1;
            }
            continue; // No imputar al portero individual
          }

          // Verificar si el portero fue identificado como participante directo
          const directGk = shot.participants.some(
            (p) => p.roster_id === gkRoster.id && p.role === 'GOALKEEPER'
          );

          // O si estaba en cancha según participaciones registradas
          const wasInGoalOnCourt = hasAnyParticipationData && this.isPlayerOnCourtAtSportingTime(
            gkRoster.id,
            shot.period_id,
            shot.clock_ms,
            shot.sport_seq,
            participations,
            sortedSportEvents
          );

          if (directGk || wasInGoalOnCourt) {
            attributedShotIds.add(shot.id);
            const res = shot.shot_detail?.result_code;
            if (res === 'SAVED') saves += 1;
            else if (res === 'GOAL') goals_conceded += 1;
            else shots_off_target += 1;
          }
        }

        const shots_on_target = saves + goals_conceded;
        const save_pct = this.safePercentage(saves, shots_on_target);

        goalkeeperStats.push({
          roster_id: gkRoster.id,
          display_name: gkRoster.display_name_snapshot,
          team_id: gkRoster.team_id,
          is_unknown_or_collective: false,
          saves,
          goals_conceded,
          shots_on_target,
          save_pct,
          shots_off_target,
          total_shots_faced: shots_on_target + shots_off_target,
          empty_net_goals_conceded,
          has_reliable_data: hasAnyParticipationData || saves > 0 || goals_conceded > 0,
        });
      }

      // Tiros rivales que NO fueron a portería vacía y NO tuvieron arquero identificado
      const unattributedShotsList = opposingShots.filter(
        (s) => !s.shot_detail?.is_empty_net && !attributedShotIds.has(s.id)
      );

      const unattributedSaves = unattributedShotsList.filter((s) => s.shot_detail?.result_code === 'SAVED').length;
      const unattributedGoals = unattributedShotsList.filter((s) => s.shot_detail?.result_code === 'GOAL').length;
      const unattributedShotsOnTarget = unattributedSaves + unattributedGoals;
      const unattributedOffTarget = unattributedShotsList.length - unattributedShotsOnTarget;

      if (unattributedShotsList.length > 0) {
        goalkeeperStats.push({
          display_name: `Portería Colectiva / Sin Asignar (${defendingTeamName})`,
          team_id: defendingTeamId,
          is_unknown_or_collective: true,
          saves: unattributedSaves,
          goals_conceded: unattributedGoals,
          shots_on_target: unattributedShotsOnTarget,
          save_pct: this.safePercentage(unattributedSaves, unattributedShotsOnTarget),
          shots_off_target: unattributedOffTarget,
          total_shots_faced: unattributedShotsList.length,
          empty_net_goals_conceded: 0,
          has_reliable_data: false,
          unattributed_explanation: `${unattributedShotsList.length} tiros (${unattributedGoals} goles, ${unattributedSaves} atajadas) registrados sin arquero nominal identificado ni formación en pista`,
        });
      }

      const hasUnattributed = unattributedShotsList.length > 0;
      return {
        team_id: defendingTeamId,
        team_name: defendingTeamName,
        total_opposing_shots: opposingShots.length,
        total_opposing_goals: opposingGoals.length,
        identified_shots: attributedShotIds.size,
        unattributed_shots: unattributedShotsList.length,
        unattributed_goals: unattributedGoals,
        unattributed_saves: unattributedSaves,
        empty_net_goals: totalEmptyNetGoals,
        coverage_status: hasUnattributed ? 'PARTIAL' : (opposingShots.length > 0 ? 'COMPLETE' : 'NO_DATA'),
        coverage_warning: hasUnattributed
          ? `${unattributedShotsList.length} tiros enfrentados no tienen arquero individual asignado en el registro.`
          : undefined,
      };
    };

    const homeGkSummary = calculateTeamGoalkeeping(match.home_team_id, homeTeamName);
    const awayGkSummary = calculateTeamGoalkeeping(match.away_team_id, awayTeamName);

    // 9. Mapas de lanzamientos
    const homeCourtMap = this.calculateCourtMap(homeShots);
    const awayCourtMap = this.calculateCourtMap(awayShots);
    const homeGoalTargetMap = this.calculateGoalTargetMap(homeShots);
    const awayGoalTargetMap = this.calculateGoalTargetMap(awayShots);

    return {
      match_id: match.id,
      home_team_id: match.home_team_id,
      away_team_id: match.away_team_id,
      home_team_name: homeTeamName,
      away_team_name: awayTeamName,
      final_home_score: finalHomeScore,
      final_away_score: finalAwayScore,
      periods_summary: periodsSummary,
      score_progression: scoreProgression,
      home_shots: homeShotBreakdown,
      away_shots: awayShotBreakdown,
      home_turnovers: homeTurnovers,
      away_turnovers: awayTurnovers,
      home_steals: homeSteals,
      away_steals: awaySteals,
      home_blocks: homeBlocks,
      away_blocks: awayBlocks,
      home_sanctions: homeSanctions,
      away_sanctions: awaySanctions,
      home_possessions: homePossessions,
      away_possessions: awayPossessions,
      player_stats: playerStats,
      goalkeeper_stats: goalkeeperStats,
      home_goalkeeper_summary: homeGkSummary,
      away_goalkeeper_summary: awayGkSummary,
      home_court_map: homeCourtMap,
      away_court_map: awayCourtMap,
      home_goal_target_map: homeGoalTargetMap,
      away_goal_target_map: awayGoalTargetMap,
    };
  }

  /**
   * Agrega estadísticas de múltiples partidos de forma matemáticamente exacta:
   * suma de numeradores / suma de denominadores (ponderado exacto),
   * jamás promediando porcentajes de partidos.
   */
  static aggregateMultiMatchStats(matchStatsList: MatchCompleteStats[]): AggregatedMultiMatchStats {
    let total_goals = 0;
    let total_shots = 0;
    let total_saves = 0;
    let total_shots_on_target = 0;
    let total_turnovers = 0;
    let total_steals = 0;
    let total_blocks = 0;

    let total_empty_net_goals = 0;
    let total_unattributed_shots = 0;
    let total_unattributed_goals = 0;
    let total_unattributed_saves = 0;

    const playersMap: AggregatedMultiMatchStats['players'] = {};
    const gkMap: AggregatedMultiMatchStats['goalkeepers'] = {};

    for (const m of matchStatsList) {
      // Sumar tiros y goles colectivos
      total_goals += m.home_shots.goals + m.away_shots.goals;
      total_shots += m.home_shots.total_shots + m.away_shots.total_shots;
      total_turnovers += m.home_turnovers + m.away_turnovers;
      total_steals += m.home_steals + m.away_steals;
      total_blocks += m.home_blocks + m.away_blocks;

      total_empty_net_goals += (m.home_goalkeeper_summary?.empty_net_goals || 0) + (m.away_goalkeeper_summary?.empty_net_goals || 0);
      total_unattributed_shots += (m.home_goalkeeper_summary?.unattributed_shots || 0) + (m.away_goalkeeper_summary?.unattributed_shots || 0);
      total_unattributed_goals += (m.home_goalkeeper_summary?.unattributed_goals || 0) + (m.away_goalkeeper_summary?.unattributed_goals || 0);
      total_unattributed_saves += (m.home_goalkeeper_summary?.unattributed_saves || 0) + (m.away_goalkeeper_summary?.unattributed_saves || 0);

      // Jugadores individuales
      for (const p of m.player_stats) {
        const key = p.player_id || p.roster_id;
        if (!playersMap[key]) {
          playersMap[key] = {
            player_id: p.player_id,
            display_name: p.display_name,
            shirt_number: p.shirt_number,
            matches_played: 0,
            goals: 0,
            shots: 0,
            effectiveness_pct: null,
            assists: 0,
            turnovers: 0,
            steals: 0,
            blocks: 0,
            minutes_played_ms: 0,
            minutes_played_formatted: '00:00',
            plus_minus: null,
          };
        }

        const entry = playersMap[key]!;
        entry.matches_played += 1;
        entry.goals += p.goals;
        entry.shots += p.total_shots;
        entry.assists += p.assists;
        entry.turnovers += p.turnovers;
        entry.steals += p.steals;
        entry.blocks += p.defensive_blocks;

        if (p.minutes_played_ms !== null) {
          entry.minutes_played_ms += p.minutes_played_ms;
          entry.minutes_played_formatted = this.formatMs(entry.minutes_played_ms);
        }

        if (p.plus_minus !== null) {
          entry.plus_minus = (entry.plus_minus ?? 0) + p.plus_minus;
        }
      }

      // Porteros (únicamente arqueros individuales nominales)
      for (const gk of m.goalkeeper_stats) {
        if (!gk.is_unknown_or_collective) {
          total_saves += gk.saves;
          total_shots_on_target += gk.shots_on_target;

          const key = gk.display_name;
          if (!gkMap[key]) {
            gkMap[key] = {
              display_name: gk.display_name,
              matches_played: 0,
              saves: 0,
              goals_conceded: 0,
              shots_on_target: 0,
              save_pct: null,
            };
          }

          const gkEntry = gkMap[key]!;
          gkEntry.matches_played += 1;
          gkEntry.saves += gk.saves;
          gkEntry.goals_conceded += gk.goals_conceded;
          gkEntry.shots_on_target += gk.shots_on_target;
        }
      }
    }

    // Calcular efectividades ponderadas sobre los totales acumulados
    for (const key of Object.keys(playersMap)) {
      const p = playersMap[key]!;
      p.effectiveness_pct = this.safePercentage(p.goals, p.shots);
    }

    for (const key of Object.keys(gkMap)) {
      const g = gkMap[key]!;
      g.save_pct = this.safePercentage(g.saves, g.shots_on_target);
    }

    return {
      matches_count: matchStatsList.length,
      included_match_ids: matchStatsList.map((m) => m.match_id),
      total_goals,
      total_shots,
      aggregate_shot_effectiveness_pct: this.safePercentage(total_goals, total_shots),
      total_saves,
      total_shots_on_target,
      aggregate_save_pct: this.safePercentage(total_saves, total_shots_on_target),
      total_empty_net_goals,
      total_unattributed_shots,
      total_unattributed_goals,
      total_unattributed_saves,
      total_turnovers,
      total_steals,
      total_blocks,
      players: playersMap,
      goalkeepers: gkMap,
    };
  }
}
