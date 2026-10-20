import * as XLSX from 'xlsx';
import { HandballDatabase } from '../data/db';
import { StatsEngine, type MatchCompleteStats } from './statsEngine';
import type {
  Match,
  MatchPeriod,
  Team,
  MatchRoster,
  MatchEvent,
  EventRevision,
  MatchPossession,
  PlayerParticipationInterval,
} from '../domain/schemas';

export type ExportTableKey =
  | 'partido'
  | 'equipos'
  | 'jugadores'
  | 'porteros'
  | 'lanzamientos'
  | 'posesiones'
  | 'eventos';

export interface CSVExportOptions {
  delimiter?: ';' | ',';
  includeBOM?: boolean;
  protectFormulas?: boolean;
}

export interface MatchRawExportBundle {
  match: Match;
  periods: MatchPeriod[];
  teams: Team[];
  rosters: MatchRoster[];
  events: MatchEvent[];
  revisions: EventRevision[];
  possessions: MatchPossession[];
  participations: PlayerParticipationInterval[];
  stats: MatchCompleteStats;
}

// Mapeos legibles al español para Handball
export const ZONE_NAMES_ES: Record<string, string> = {
  LW: 'Extremo Izquierdo',
  L6: '6m Extremo Izquierdo',
  C6: '6m Centro (Pivote)',
  R6: '6m Extremo Derecho',
  RW: 'Extremo Derecho',
  '7M': 'Penal 7 Metros',
  L9: '9m Lateral Izquierdo',
  C9: '9m Central',
  R9: '9m Lateral Derecho',
  LONG: 'Campo Largo / Contraataque',
  DEFENSE: 'Zona Defensiva',
  MIDCOURT: 'Medio Campo',
  UNKNOWN: 'No observado',
  TL: 'Arriba Izquierda',
  TC: 'Arriba Centro',
  TR: 'Arriba Derecha',
  ML: 'Medio Izquierda',
  MC: 'Medio Centro',
  MR: 'Medio Derecha',
  BL: 'Abajo Izquierda',
  BC: 'Abajo Centro',
  BR: 'Abajo Derecha',
  POST_L: 'Poste Izquierdo',
  POST_R: 'Poste Derecho',
  BAR: 'Travesaño',
  OUT_L: 'Fuera Izquierda',
  OUT_TOP: 'Fuera Alto',
  OUT_R: 'Fuera Derecha',
};

export const RESULT_NAMES_ES: Record<string, string> = {
  GOAL: 'Gol',
  SAVED: 'Atajada',
  MISSED: 'Fuera',
  POST: 'Poste',
  BLOCKED: 'Bloqueado',
};

export const PHASE_NAMES_ES: Record<string, string> = {
  POSITIONAL: 'Ataque Posicional',
  FASTBREAK: 'Contraataque / Transición Rápida',
  SECOND_WAVE: 'Segunda Oleada',
  SEVEN_M: 'Penal 7 Metros',
  EMPTY_NET_LONG: 'Tiro a Portería Vacía',
};

export const EVENT_TYPE_NAMES_ES: Record<string, string> = {
  SHOT: 'Lanzamiento',
  TURNOVER: 'Pérdida de Balón',
  SANCTION: 'Sanción Disciplinaria',
  SUBSTITUTION: 'Sustitución de Jugador',
  PERIOD_START: 'Inicio de Período',
  PERIOD_END: 'Fin de Período',
  CLOCK_PAUSE: 'Pausa de Cronómetro',
  CLOCK_RESUME: 'Reanudación de Cronómetro',
  TIMEOUT: 'Tiempo Muerto (Time-out)',
  LINEUP_SET: 'Confirmación de Formación',
  SEVEN_M_AWARDED: 'Sanción de 7 Metros Otorgada',
  DEFENSE_SYSTEM_SET: 'Ajuste de Sistema Defensivo',
  POSSESSION_SET: 'Ajuste Manual de Posesión',
  NOTE: 'Nota Técnica',
};

export const NUMERICAL_CONTEXT_ES: Record<string, string> = {
  EQUAL: 'Igualdad Numérica',
  SUPERIORITY: 'Superioridad Numérica',
  INFERIORITY: 'Inferioridad Numérica',
  INCOMPLETE: 'Formación Incompleta',
  UNKNOWN: 'Situación No Confirmada / Desconocida',
};

export const TURNOVER_REASON_ES: Record<string, string> = {
  BAD_PASS: 'Mal Pase / Pase Erróneo',
  CATCH_ERROR: 'Fallo de Recepción',
  STEAL: 'Robo de Balón Rival',
  TRAVELING: 'Pasos',
  DOUBLE_DRIBBLE: 'Dobles',
  OFFENSIVE_FOUL: 'Falta en Ataque',
  THREE_SECONDS: 'Tres Segundos',
  PASSIVE_PLAY: 'Juego Pasivo',
  LINE_VIOLATION: 'Pisar Línea',
  OTHER: 'Otra Pérdida',
};

export const SANCTION_KIND_ES: Record<string, string> = {
  YELLOW_CARD: 'Tarjeta Amarilla',
  TWO_MINUTE: 'Exclusión de 2 Minutos',
  RED_CARD: 'Tarjeta Roja (Descalificación)',
  BLUE_CARD: 'Tarjeta Azul (Informe Escrito)',
};

export const POSITION_NAMES_ES: Record<string, string> = {
  GK: 'Arquero / Portero',
  CB: 'Central',
  LW: 'Extremo Izquierdo',
  RW: 'Extremo Derecho',
  LB: 'Lateral Izquierdo',
  RB: 'Lateral Derecho',
  PV: 'Pivote',
  OFFICIAL: 'Oficial de Banco',
};

export function resolvePositionName(positionCode?: string | null, role?: string | null): string {
  if (positionCode && POSITION_NAMES_ES[positionCode]) {
    return POSITION_NAMES_ES[positionCode];
  }
  if (positionCode) {
    return positionCode;
  }
  if (role === 'GK') {
    return 'Arquero / Portero';
  }
  if (role === 'OFFICIAL') {
    return 'Oficial de Banco';
  }
  return 'Desconocido';
}

export class ExportService {
  constructor(private db: HandballDatabase) {}

  /**
   * Carga todos los datos del partido y ejecuta el motor estadístico unificado.
   */
  async getMatchExportBundle(matchId: string): Promise<MatchRawExportBundle> {
    const match = await this.db.matches.get(matchId);
    if (!match) {
      throw new Error(`Partido con ID ${matchId} no encontrado`);
    }

    const [periods, teams, rosters, events, revisions, possessions, participations] =
      await Promise.all([
        this.db.matchPeriods.where('match_id').equals(matchId).toArray(),
        this.db.teams.toArray(),
        this.db.matchRosters.where('match_id').equals(matchId).toArray(),
        this.db.matchEvents.where('match_id').equals(matchId).toArray(),
        this.db.eventRevisions.where('match_id').equals(matchId).toArray(),
        this.db.possessions.where('match_id').equals(matchId).toArray(),
        this.db.playerParticipations.where('match_id').equals(matchId).toArray(),
      ]);

    // Ordenar cronológicamente
    periods.sort((a, b) => a.number - b.number);
    events.sort((a, b) => {
      if (a.clock_ms !== b.clock_ms) return a.clock_ms - b.clock_ms;
      return a.sport_seq - b.sport_seq;
    });
    possessions.sort((a, b) => a.start_clock_ms - b.start_clock_ms);
    participations.sort((a, b) => a.in_clock_ms - b.in_clock_ms);

    // Calcular estadísticas unificadas usando el motor oficial
    const stats = StatsEngine.calculateMatchStats(
      match,
      periods,
      teams,
      rosters,
      events,
      possessions,
      participations
    );

    return {
      match,
      periods,
      teams,
      rosters,
      events,
      revisions,
      possessions,
      participations,
      stats,
    };
  }

  // =========================================================================
  // Generadores de Tablas (Array of Arrays)
  // Reutilizados tanto para XLSX como para CSV
  // =========================================================================

  buildMatchSheetData(bundle: MatchRawExportBundle): (string | number)[][] {
    const { match, stats, periods, events, possessions } = bundle;
    const rows: (string | number)[][] = [];

    rows.push(['HANDSTAT — REPORTE OFICIAL DE PARTIDO']);
    rows.push(['Fecha de Generación', new Date().toISOString()]);
    rows.push([]);

    rows.push(['1. DATOS DEL PARTIDO']);
    rows.push(['ID de Partido', match.id]);
    rows.push(['Fecha Programada', match.scheduled_at]);
    rows.push(['Estado', match.status]);
    rows.push(['Equipo Local', stats.home_team_name]);
    rows.push(['Equipo Visitante', stats.away_team_name]);
    rows.push(['Marcador Final', `${stats.final_home_score} - ${stats.final_away_score}`]);
    rows.push([]);

    rows.push(['2. CONFIGURACIÓN REGLAMENTARIA']);
    rows.push(['Cantidad de Períodos', match.rules_config?.periods_count ?? periods.length]);
    rows.push(['Duración Período (minutos)', Math.round((match.rules_config?.period_duration_ms ?? 1800000) / 60000)]);
    rows.push(['Exclusión 2 Min (segundos)', Math.round((match.rules_config?.suspension_duration_ms ?? 120000) / 1000)]);
    rows.push(['Límite de Convocados', match.rules_config?.max_roster_size ?? 16]);
    rows.push([]);

    rows.push(['3. MARCADOR POR PERÍODOS']);
    rows.push(['Período', 'Goles Local', 'Goles Visitante', 'Marcador Parcial']);
    for (const p of stats.periods_summary) {
      rows.push([
        `Período ${p.period_number}`,
        p.home_goals,
        p.away_goals,
        `${p.home_goals} - ${p.away_goals}`,
      ]);
    }
    rows.push([]);

    rows.push(['4. COBERTURA Y CALIDAD DE INFORMACIÓN']);
    rows.push(['Total Eventos Registrados', events.length]);
    rows.push(['Eventos Activos Válidos', events.filter((e) => e.status === 'active').length]);
    rows.push(['Eventos Anulados (Auditados)', events.filter((e) => e.status === 'voided').length]);
    rows.push(['Total Posesiones Registradas', possessions.length]);
    rows.push(['Posesiones Completas', stats.home_possessions.complete_possessions + stats.away_possessions.complete_possessions]);
    rows.push(['Cobertura Posesión Local', stats.home_possessions.coverage_status]);
    rows.push(['Cobertura Posesión Visitante', stats.away_possessions.coverage_status]);
    if (stats.home_possessions.coverage_warning) {
      rows.push(['Advertencia Posesión Local', stats.home_possessions.coverage_warning]);
    }
    if (stats.away_possessions.coverage_warning) {
      rows.push(['Advertencia Posesión Visitante', stats.away_possessions.coverage_warning]);
    }

    return rows;
  }

  buildTeamsSheetData(bundle: MatchRawExportBundle): (string | number)[][] {
    const { stats } = bundle;
    const rows: (string | number)[][] = [];

    rows.push(['ESTADÍSTICAS COLECTIVAS DE EQUIPOS']);
    rows.push(['Métrica', stats.home_team_name, stats.away_team_name, 'Unidad / Criterio']);
    rows.push([]);

    rows.push(['Goles Totales', stats.final_home_score, stats.final_away_score, 'Goles válidos']);
    rows.push(['Lanzamientos Totales', stats.home_shots.total_shots, stats.away_shots.total_shots, 'Tiros']);
    rows.push([
      'Efectividad de Tiro (%)',
      this.formatNumericOrNull(stats.home_shots.effectiveness_pct),
      this.formatNumericOrNull(stats.away_shots.effectiveness_pct),
      '% de acierto (Numérico)',
    ]);
    rows.push(['Tiros Atajados por Portero Rival', stats.home_shots.saved, stats.away_shots.saved, 'Tiros']);
    rows.push(['Tiros Fuera', stats.home_shots.missed, stats.away_shots.missed, 'Tiros']);
    rows.push(['Tiros al Poste', stats.home_shots.post, stats.away_shots.post, 'Tiros']);
    rows.push(['Tiros Bloqueados por la Defensa', stats.home_shots.blocked, stats.away_shots.blocked, 'Tiros']);
    rows.push([]);

    rows.push(['Pérdidas de Balón', stats.home_turnovers, stats.away_turnovers, 'Pérdidas']);
    rows.push(['Recuperaciones / Robos', stats.home_steals, stats.away_steals, 'Robos']);
    rows.push(['Bloqueos Defensivos', stats.home_blocks, stats.away_blocks, 'Bloqueos']);
    rows.push([]);

    rows.push(['Sanciones Disciplinarias', '', '', '']);
    rows.push(['Tarjetas Amarillas', stats.home_sanctions.yellow_cards, stats.away_sanctions.yellow_cards, 'Tarjetas']);
    rows.push(['Exclusiones de 2 Minutos', stats.home_sanctions.two_minute_suspensions, stats.away_sanctions.two_minute_suspensions, 'Exclusiones']);
    rows.push(['Tarjetas Rojas (Descalificaciones)', stats.home_sanctions.red_cards, stats.away_sanctions.red_cards, 'Tarjetas']);
    rows.push(['Tarjetas Azules (Informe Escrito)', stats.home_sanctions.blue_cards, stats.away_sanctions.blue_cards, 'Tarjetas']);
    rows.push([]);

    rows.push(['Rendimiento de Posesiones', '', '', '']);
    rows.push(['Posesiones Totales', stats.home_possessions.total_possessions, stats.away_possessions.total_possessions, 'Posesiones']);
    rows.push(['Posesiones Completas', stats.home_possessions.complete_possessions, stats.away_possessions.complete_possessions, 'Posesiones']);
    rows.push(['Goles en Posesiones Registradas', stats.home_possessions.goals_in_tracked_possessions, stats.away_possessions.goals_in_tracked_possessions, 'Goles']);
    rows.push([
      'Goles por Posesión',
      this.formatNumericOrNull(stats.home_possessions.goals_per_possession),
      this.formatNumericOrNull(stats.away_possessions.goals_per_possession),
      'Goles / Posesión completa (Numérico)',
    ]);
    rows.push([
      'Pérdidas por Posesión',
      this.formatNumericOrNull(stats.home_possessions.turnovers_per_possession),
      this.formatNumericOrNull(stats.away_possessions.turnovers_per_possession),
      'Pérdidas / Posesión completa (Numérico)',
    ]);
    rows.push(['Cobertura de Posesión', stats.home_possessions.coverage_status, stats.away_possessions.coverage_status, 'Estado']);
    rows.push([
      'Advertencia de Cobertura Posesión',
      stats.home_possessions.coverage_warning || 'Sin advertencias',
      stats.away_possessions.coverage_warning || 'Sin advertencias',
      'Leyenda',
    ]);
    rows.push([]);

    rows.push(['Rendimiento Colectivo en Portería Defendida', '', '', '']);
    rows.push(['Tiros Enfrentados por Portería', stats.home_goalkeeper_summary.total_opposing_shots, stats.away_goalkeeper_summary.total_opposing_shots, 'Tiros rivales']);
    rows.push(['Goles Recibidos', stats.home_goalkeeper_summary.total_opposing_goals, stats.away_goalkeeper_summary.total_opposing_goals, 'Goles']);
    rows.push(['Atajadas Colectivas Registradas', stats.home_goalkeeper_summary.unattributed_saves + this.sumIdentifiedSaves(stats, stats.home_team_id), stats.away_goalkeeper_summary.unattributed_saves + this.sumIdentifiedSaves(stats, stats.away_team_id), 'Paradas']);
    rows.push(['Goles con Portería Vacía', stats.home_goalkeeper_summary.empty_net_goals, stats.away_goalkeeper_summary.empty_net_goals, 'Goles sin portero']);
    rows.push(['Cobertura de Portería', stats.home_goalkeeper_summary.coverage_status, stats.away_goalkeeper_summary.coverage_status, 'Estado']);
    rows.push([
      'Advertencia de Cobertura Portería',
      stats.home_goalkeeper_summary.coverage_warning || 'Sin advertencias',
      stats.away_goalkeeper_summary.coverage_warning || 'Sin advertencias',
      'Leyenda',
    ]);

    return rows;
  }

  buildPlayersSheetData(bundle: MatchRawExportBundle): (string | number)[][] {
    const { stats, rosters } = bundle;
    const rows: (string | number)[][] = [];

    rows.push([
      'Equipo',
      'Dorsal',
      'Nombre del Jugador',
      'Puesto Habitual',
      'Condición',
      'Minutos Jugados (mm:ss)',
      'Minutos Jugados (Segundos)',
      '+/- (Plus/Minus)',
      'Cobertura Individual (+/-)',
      'Cobertura Formación (+/-)',
      'Observaciones (+/-)',
      'Goles',
      'Lanzamientos Totales',
      'Efectividad (%)',
      'Tiros Atajados',
      'Tiros Fuera',
      'Tiros al Poste',
      'Tiros Bloqueados',
      'Asistencias',
      'Pérdidas',
      'Robos',
      'Bloqueos Defensivos',
      'Tarjetas Amarillas',
      'Exclusiones 2 Minutos',
      'Tarjetas Rojas',
      'Tarjetas Azules',
    ]);

    // Ordenar jugadores: primero equipo local, luego dorsal
    const sortedPlayers = [...stats.player_stats].sort((a, b) => {
      if (a.team_id !== b.team_id) {
        return a.team_id === stats.home_team_id ? -1 : 1;
      }
      return a.shirt_number - b.shirt_number;
    });

    for (const p of sortedPlayers) {
      const roster = rosters.find((r) => r.id === p.roster_id);
      const teamName = p.team_id === stats.home_team_id ? stats.home_team_name : stats.away_team_name;
      const positionLabel = resolvePositionName(roster?.position_snapshot, roster?.role);

      rows.push([
        teamName,
        p.shirt_number,
        p.display_name,
        positionLabel,
        p.is_starter ? 'Titular' : 'Suplente',
        p.minutes_played_formatted,
        p.minutes_played_ms !== null ? Math.round(p.minutes_played_ms / 1000) : 'ND',
        p.plus_minus !== null ? p.plus_minus : 'ND',
        p.individual_coverage,
        p.team_lineup_coverage,
        p.plus_minus_note || 'Registro fiable',
        p.goals,
        p.total_shots,
        this.formatNumericOrNull(p.shot_effectiveness_pct),
        p.saved_shots,
        p.missed_shots,
        p.post_shots,
        p.blocked_shots,
        p.assists,
        p.turnovers,
        p.steals,
        p.defensive_blocks,
        p.yellow_cards,
        p.two_minute_suspensions,
        p.red_cards,
        p.blue_cards,
      ]);
    }

    if (sortedPlayers.length === 0) {
      rows.push(['(No se registraron jugadores individuales en este partido)', '', '', '', '', '', '', '', '', '', '', 0, 0, 'ND', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    }

    return rows;
  }

  buildGoalkeepersSheetData(bundle: MatchRawExportBundle): (string | number)[][] {
    const { stats } = bundle;
    const rows: (string | number)[][] = [];

    rows.push([
      'Equipo',
      'Dorsal',
      'Nombre del Portero',
      'Condición de Registro',
      'Goles Recibidos',
      'Atajadas',
      'Tiros Entre Palos Enfrentados',
      'Eficacia de Paradas (%)',
      'Tiros Fuera / Poste Enfrentados',
      'Tiros Totales Enfrentados',
      'Goles con Portería Vacía (No Imputables)',
      'Fiabilidad de Datos',
      'Observaciones',
    ]);

    for (const gk of stats.goalkeeper_stats) {
      const teamName = gk.team_id === stats.home_team_id ? stats.home_team_name : stats.away_team_name;
      const roster = bundle.rosters.find((r) => r.id === gk.roster_id);
      const numberStr = roster ? roster.shirt_number : '—';

      rows.push([
        teamName,
        numberStr,
        gk.display_name,
        gk.is_unknown_or_collective ? 'Colectivo / No Identificado' : 'Portero Individual',
        gk.goals_conceded,
        gk.saves,
        gk.shots_on_target,
        this.formatNumericOrNull(gk.save_pct),
        gk.shots_off_target,
        gk.total_shots_faced,
        gk.empty_net_goals_conceded,
        gk.has_reliable_data ? 'Fiable' : 'Incompleto / Colectivo',
        gk.unattributed_explanation || 'Registro directo de portería',
      ]);
    }

    if (stats.goalkeeper_stats.length === 0) {
      rows.push(['(Sin registros de portería identificados)', '—', '—', '—', 0, 0, 0, 'ND', 0, 0, 0, 'Sin Datos', '']);
    }

    return rows;
  }

  buildShotsSheetData(bundle: MatchRawExportBundle): (string | number)[][] {
    const { events, stats, periods, rosters } = bundle;
    const rows: (string | number)[][] = [];

    rows.push([
      '# Tiro',
      'Período',
      'Tiempo (mm:ss)',
      'Tiempo (ms)',
      'Equipo Atacante',
      'Dorsal Lanzador',
      'Nombre Lanzador',
      'Puesto Lanzador',
      'Fase de Juego',
      'Zona Origen (Código)',
      'Zona Origen (Descripción)',
      'Zona Destino (Código)',
      'Zona Destino (Descripción)',
      'Resultado',
      'Portero Defensor',
      'Asistente',
      'Contexto Numérico',
      'Tipo de Tiro',
      'ID Evento',
    ]);

    // Filtrar solo eventos de tiro activos
    const shotEvents = events.filter((e) => e.status === 'active' && e.type === 'SHOT');

    let shotIndex = 1;
    for (const ev of shotEvents) {
      const period = periods.find((p) => p.id === ev.period_id);
      const periodLabel = period ? `Período ${period.number}` : '1T';
      const teamName = ev.match_team_id === stats.home_team_id ? stats.home_team_name : stats.away_team_name;

      const shooterPart = ev.participants.find((p) => p.role === 'SHOOTER');
      const shooterRoster = shooterPart ? rosters.find((r) => r.id === shooterPart.roster_id) : undefined;
      const shooterNumber = shooterRoster ? shooterRoster.shirt_number : '—';
      const shooterName = shooterRoster
        ? shooterRoster.display_name_snapshot
        : (ev.match_team_id === stats.away_team_id ? 'Rival Colectivo (Sin lanzador individual)' : 'Lanzador No Identificado');
      let shooterPosition = 'Desconocido';
      if (shooterRoster) {
        shooterPosition = resolvePositionName(shooterRoster.position_snapshot, shooterRoster.role);
      } else if (ev.match_team_id === stats.away_team_id) {
        shooterPosition = 'Desconocido (Rival Colectivo)';
      }

      const assistPart = ev.participants.find((p) => p.role === 'ASSIST');
      const assistRoster = assistPart ? rosters.find((r) => r.id === assistPart.roster_id) : undefined;
      const assistName = assistRoster ? assistRoster.display_name_snapshot : '—';

      const gkPart = ev.participants.find((p) => p.role === 'GOALKEEPER');
      const gkRoster = gkPart ? rosters.find((r) => r.id === gkPart.roster_id) : undefined;
      let gkName = 'Portero Defensor No Identificado';
      if (ev.shot_detail?.is_empty_net) {
        gkName = 'Portería Vacía';
      } else if (gkRoster) {
        gkName = `#${gkRoster.shirt_number} ${gkRoster.display_name_snapshot}`;
      }

      const originCode = ev.shot_detail?.origin_zone_code || 'ND';
      const originName = ZONE_NAMES_ES[originCode] || originCode;

      const targetCode = ev.shot_detail?.target_zone_code || 'ND';
      const targetName = ZONE_NAMES_ES[targetCode] || targetCode;

      const resultCode = ev.shot_detail?.result_code || 'GOAL';
      const resultName = RESULT_NAMES_ES[resultCode] || resultCode;

      const phaseCode = ev.shot_detail?.phase_code || 'POSITIONAL';
      const phaseName = PHASE_NAMES_ES[phaseCode] || phaseCode;

      const shotTypeStr = ev.shot_detail?.shot_type === 'GOAL_TO_GOAL' ? 'Arco a arco' : (ev.shot_detail?.shot_type || 'Convencional');

      const numCtx = ev.shot_detail?.numerical_context || ev.numerical_situation?.context || 'UNKNOWN';
      const numCtxLabel = NUMERICAL_CONTEXT_ES[numCtx] || numCtx;

      rows.push([
        shotIndex++,
        periodLabel,
        StatsEngine.formatMs(ev.clock_ms),
        ev.clock_ms,
        teamName,
        shooterNumber,
        shooterName,
        shooterPosition,
        phaseName,
        originCode,
        originName,
        targetCode,
        targetName,
        resultName,
        gkName,
        assistName,
        numCtxLabel,
        shotTypeStr,
        ev.id,
      ]);
    }

    if (shotEvents.length === 0) {
      rows.push(['(No se registraron lanzamientos en este partido)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }

    return rows;
  }

  buildPossessionsSheetData(bundle: MatchRawExportBundle): (string | number)[][] {
    const { possessions, stats, periods, events } = bundle;
    const rows: (string | number)[][] = [];

    rows.push([
      '# Posesión',
      'Período',
      'Equipo con Balón',
      'Tiempo Inicio (mm:ss)',
      'Tiempo Fin (mm:ss)',
      'Duración (Segundos)',
      'Motivo de Cierre',
      'Estado Persistido en BD',
      'Validez para Métricas',
      'Observación / Inconsistencia',
      'Goles Válidos Asociados',
      'ID Gol Asociado',
      'Evento de Cierre (Tipo)',
      'Evento de Cierre (ID)',
      'ID Posesión',
    ]);

    let posIndex = 1;
    for (const pos of possessions) {
      const period = periods.find((p) => p.id === pos.period_id);
      const periodLabel = period ? `Período ${period.number}` : '1T';
      const teamName = pos.team_id === stats.home_team_id ? stats.home_team_name : stats.away_team_name;
      const teamPossStats = pos.team_id === stats.home_team_id ? stats.home_possessions : stats.away_possessions;

      // Duración real: preservar valores negativos para no encubrir duraciones retrógradas
      let durationSec: number | string = 'En curso';
      let isRetrograde = false;
      if (pos.end_clock_ms !== undefined) {
        const diffMs = pos.end_clock_ms - pos.start_clock_ms;
        const diffSec = Math.round(diffMs / 1000);
        durationSec = diffSec;
        if (diffMs < 0) {
          isRetrograde = true;
        }
      }

      // Conciliación con StatsEngine: usar las mismas asociaciones validadas
      const linkedGoalId = teamPossStats.possession_goal_map?.[pos.id];
      const validGoalsCount = linkedGoalId ? 1 : 0;
      const linkedGoalStr = linkedGoalId || '—';

      // Validez para métricas vs estado persistido
      const persistedState = pos.is_complete ? 'Completa' : 'Incompleta';
      const validityInfo = teamPossStats.possession_validity_map?.[pos.id];

      let metricValidity = 'Válida';
      let observation = 'Correcto';

      if (!pos.is_complete) {
        metricValidity = 'Incompleta';
        observation = validityInfo?.reason || 'Posesión sin cerrar o en curso';
      } else if (validityInfo && !validityInfo.isValidForMetrics) {
        metricValidity = isRetrograde ? 'Inválida (Duración retrógrada)' : 'Inválida';
        observation = validityInfo.reason || (isRetrograde ? `Inconsistencia: Fin (${pos.end_clock_ms !== undefined ? StatsEngine.formatMs(pos.end_clock_ms) : '—'}) anterior a inicio (${StatsEngine.formatMs(pos.start_clock_ms)})` : 'No cumple criterios métricos');
      } else if (isRetrograde) {
        metricValidity = 'Inválida (Duración retrógrada)';
        observation = `Inconsistencia: Fin (${pos.end_clock_ms !== undefined ? StatsEngine.formatMs(pos.end_clock_ms) : '—'}) anterior a inicio (${StatsEngine.formatMs(pos.start_clock_ms)})`;
      }

      const endEvent = pos.end_event_id ? events.find((e) => e.id === pos.end_event_id) : undefined;
      const endType = endEvent ? (EVENT_TYPE_NAMES_ES[endEvent.type] || endEvent.type) : '—';

      rows.push([
        posIndex++,
        periodLabel,
        teamName,
        StatsEngine.formatMs(pos.start_clock_ms),
        pos.end_clock_ms !== undefined ? StatsEngine.formatMs(pos.end_clock_ms) : '—',
        durationSec,
        pos.end_reason || (pos.is_complete ? 'Completada' : 'En Curso'),
        persistedState,
        metricValidity,
        observation,
        validGoalsCount,
        linkedGoalStr,
        endType,
        pos.end_event_id || '—',
        pos.id,
      ]);
    }

    if (possessions.length === 0) {
      rows.push(['(No se registraron posesiones para este partido)', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }

    rows.push([]);
    rows.push(['RESUMEN DE AUDITORÍA DE POSESIONES']);
    rows.push(['Métrica', stats.home_team_name, stats.away_team_name]);
    rows.push(['Posesiones Completas', stats.home_possessions.complete_possessions, stats.away_possessions.complete_possessions]);
    rows.push(['Posesiones Válidas para Métricas', stats.home_possessions.valid_complete_possessions ?? stats.home_possessions.complete_possessions, stats.away_possessions.valid_complete_possessions ?? stats.away_possessions.complete_possessions]);
    rows.push(['Goles en Posesión Vinculada', stats.home_possessions.goals_in_tracked_possessions, stats.away_possessions.goals_in_tracked_possessions]);
    rows.push(['Goles Fuera de Posesión (Incertidumbre)', stats.home_possessions.unassociated_goals, stats.away_possessions.unassociated_goals]);
    rows.push([
      'Goles / Posesión',
      this.formatNumericOrNull(stats.home_possessions.goals_per_possession),
      this.formatNumericOrNull(stats.away_possessions.goals_per_possession),
    ]);
    rows.push(['Estado de Cobertura', stats.home_possessions.coverage_status, stats.away_possessions.coverage_status]);
    rows.push([
      'Advertencia de Cobertura / Inconsistencias',
      stats.home_possessions.coverage_warning || 'Sin inconsistencias',
      stats.away_possessions.coverage_warning || 'Sin inconsistencias',
    ]);

    return rows;
  }

  buildEventsSheetData(bundle: MatchRawExportBundle): (string | number)[][] {
    const { events, stats, periods, rosters } = bundle;
    const rows: (string | number)[][] = [];

    rows.push([
      'Orden Deportivo (sport_seq)',
      'Orden Auditoría (audit_seq)',
      'Período',
      'ID de Período',
      'Tiempo (mm:ss)',
      'Tiempo (ms)',
      'Equipo',
      'Tipo de Evento',
      'Estado del Evento',
      'Motivo de Anulación / Edición',
      'ID de Evento',
      'ID Evento Reemplazado',
      'Participantes Principales',
      'Detalle Deportivo',
      'Situación Numérica Registrada',
      'Timestamp Creación (ISO)',
    ]);

    for (const ev of events) {
      const period = periods.find((p) => p.id === ev.period_id);
      const periodLabel = period
        ? `Período ${period.number}`
        : (ev.period_id ? `Período Desconocido (${ev.period_id.slice(0, 8)}...)` : 'Sin período asignado');
      const periodIdStr = ev.period_id || '—';
      const teamName = ev.match_team_id
        ? (ev.match_team_id === stats.home_team_id ? stats.home_team_name : stats.away_team_name)
        : '—';

      const typeLabel = EVENT_TYPE_NAMES_ES[ev.type] || ev.type;
      const statusLabel = ev.status === 'active' ? 'ACTIVO' : 'ANULADO (VOIDED)';

      // Participantes
      const participantsStr = ev.participants
        .map((p) => {
          const r = rosters.find((rost) => rost.id === p.roster_id);
          const name = r ? `#${r.shirt_number} ${r.display_name_snapshot}` : p.roster_id;
          return `${p.role}: ${name}`;
        })
        .join('; ') || 'Colectivo / Sin participante individual';

      // Detalle deportivo específico
      let detailStr = '—';
      if (ev.type === 'SHOT' && ev.shot_detail) {
        detailStr = `Resultado: ${RESULT_NAMES_ES[ev.shot_detail.result_code] || ev.shot_detail.result_code} | Origen: ${ZONE_NAMES_ES[ev.shot_detail.origin_zone_code || ''] || ev.shot_detail.origin_zone_code || 'ND'} | Destino: ${ZONE_NAMES_ES[ev.shot_detail.target_zone_code || ''] || ev.shot_detail.target_zone_code || 'ND'}`;
      } else if (ev.type === 'TURNOVER' && ev.turnover_detail) {
        const zoneStr = ev.turnover_detail.court_zone ? ` | Zona: ${ZONE_NAMES_ES[ev.turnover_detail.court_zone] || ev.turnover_detail.court_zone}` : '';
        detailStr = `Motivo: ${TURNOVER_REASON_ES[ev.turnover_detail.reason] || ev.turnover_detail.reason}${zoneStr}`;
      } else if (ev.type === 'SANCTION' && ev.sanction_detail) {
        detailStr = `Tipo: ${SANCTION_KIND_ES[ev.sanction_detail.kind] || ev.sanction_detail.kind}`;
      }

      const numCtx = ev.numerical_situation?.context || 'UNKNOWN';
      const numSituationStr = `${NUMERICAL_CONTEXT_ES[numCtx] || numCtx} (Propio: ${ev.numerical_situation?.own_count ?? 'ND'} vs Rival: ${ev.numerical_situation?.rival_count ?? 'ND'})`;

      const voidRevision = bundle.revisions.find((r) => r.event_id === ev.id && r.change_kind === 'void');
      const voidReasonStr = ev.status === 'voided' ? ((ev as any).void_reason || (ev.payload as any)?.void_reason || voidRevision?.reason || 'Acción Anulada') : '—';
      const replacesIdStr = (ev as any).replaces_event_id || (ev.payload as any)?.replaces_event_id || '—';

      rows.push([
        ev.sport_seq,
        ev.audit_seq,
        periodLabel,
        periodIdStr,
        StatsEngine.formatMs(ev.clock_ms),
        ev.clock_ms,
        teamName,
        typeLabel,
        statusLabel,
        voidReasonStr,
        ev.id,
        replacesIdStr,
        participantsStr,
        detailStr,
        numSituationStr,
        ev.created_at,
      ]);
    }

    if (events.length === 0) {
      rows.push(['(No se registraron eventos)', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }

    return rows;
  }

  // =========================================================================
  // Exportación a Excel XLSX (7 Hojas Oficiales)
  // =========================================================================

  async exportMatchToXLSX(matchId: string): Promise<{ blob: Blob; filename: string; buffer: Uint8Array }> {
    const bundle = await this.getMatchExportBundle(matchId);
    const wb = XLSX.utils.book_new();

    // 1. Partido
    const matchData = this.buildMatchSheetData(bundle);
    const wsMatch = XLSX.utils.aoa_to_sheet(matchData);
    XLSX.utils.book_append_sheet(wb, wsMatch, 'Partido');

    // 2. Equipos
    const teamsData = this.buildTeamsSheetData(bundle);
    const wsTeams = XLSX.utils.aoa_to_sheet(teamsData);
    XLSX.utils.book_append_sheet(wb, wsTeams, 'Equipos');

    // 3. Jugadores
    const playersData = this.buildPlayersSheetData(bundle);
    const wsPlayers = XLSX.utils.aoa_to_sheet(playersData);
    XLSX.utils.book_append_sheet(wb, wsPlayers, 'Jugadores');

    // 4. Porteros
    const goalkeepersData = this.buildGoalkeepersSheetData(bundle);
    const wsGoalkeepers = XLSX.utils.aoa_to_sheet(goalkeepersData);
    XLSX.utils.book_append_sheet(wb, wsGoalkeepers, 'Porteros');

    // 5. Lanzamientos
    const shotsData = this.buildShotsSheetData(bundle);
    const wsShots = XLSX.utils.aoa_to_sheet(shotsData);
    XLSX.utils.book_append_sheet(wb, wsShots, 'Lanzamientos');

    // 6. Posesiones
    const possessionsData = this.buildPossessionsSheetData(bundle);
    const wsPossessions = XLSX.utils.aoa_to_sheet(possessionsData);
    XLSX.utils.book_append_sheet(wb, wsPossessions, 'Posesiones');

    // 7. Eventos (Trazabilidad y Auditoría)
    const eventsData = this.buildEventsSheetData(bundle);
    const wsEvents = XLSX.utils.aoa_to_sheet(eventsData);
    XLSX.utils.book_append_sheet(wb, wsEvents, 'Eventos');

    // Generar buffer binario
    const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as Uint8Array;
    const blob = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const dateStr = bundle.match.scheduled_at.split('T')[0] || 'partido';
    const cleanHome = bundle.stats.home_team_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanAway = bundle.stats.away_team_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `HandStat_${dateStr}_${cleanHome}_vs_${cleanAway}.xlsx`;

    return { blob, filename, buffer };
  }

  // =========================================================================
  // Exportación a CSV Modular
  // =========================================================================

  async exportTableToCSV(
    matchId: string,
    tableKey: ExportTableKey,
    options: CSVExportOptions = {}
  ): Promise<{ blob: Blob; filename: string; csvContent: string }> {
    const bundle = await this.getMatchExportBundle(matchId);
    let rows: (string | number)[][];

    switch (tableKey) {
      case 'partido':
        rows = this.buildMatchSheetData(bundle);
        break;
      case 'equipos':
        rows = this.buildTeamsSheetData(bundle);
        break;
      case 'jugadores':
        rows = this.buildPlayersSheetData(bundle);
        break;
      case 'porteros':
        rows = this.buildGoalkeepersSheetData(bundle);
        break;
      case 'lanzamientos':
        rows = this.buildShotsSheetData(bundle);
        break;
      case 'posesiones':
        rows = this.buildPossessionsSheetData(bundle);
        break;
      case 'eventos':
        rows = this.buildEventsSheetData(bundle);
        break;
      default:
        throw new Error(`Tabla desconocida: ${tableKey}`);
    }

    const delimiter = options.delimiter || ';';
    const includeBOM = options.includeBOM !== false;
    const protectFormulas = options.protectFormulas !== false;

    const csvLines = rows.map((row) =>
      row.map((cell) => this.formatCSVCell(cell, delimiter, protectFormulas)).join(delimiter)
    );

    let csvContent = csvLines.join('\r\n');
    if (includeBOM) {
      csvContent = '\uFEFF' + csvContent;
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const dateStr = bundle.match.scheduled_at.split('T')[0] || 'partido';
    const cleanHome = bundle.stats.home_team_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const cleanAway = bundle.stats.away_team_name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `HandStat_${tableKey}_${dateStr}_${cleanHome}_vs_${cleanAway}.csv`;

    return { blob, filename, csvContent };
  }

  /**
   * Formateador y Sanitizador de Celdas CSV:
   * - Preserva números legítimos (incluyendo números negativos como Plus/Minus -5).
   * - Protege campos de texto contra inyección de fórmulas (=, +, -, @, \t, \r, %).
   * - Escapa comillas dobles y separadores adecuadamente.
   */
  formatCSVCell(val: string | number | null | undefined, delimiter: string, protectFormulas: boolean): string {
    if (val === null || val === undefined) {
      return '';
    }

    // 1. Manejo numérico estricto: preservar números legítimos (incluyendo negativos)
    if (typeof val === 'number') {
      if (isNaN(val) || !isFinite(val)) return '';
      return val.toString();
    }

    let str = String(val);

    // Si la cadena representa exactamente un número legítimo (ej. "-5", "10", "3.14"), NO es fórmula
    const isLegitNumber = /^-?\d+(\.\d+)?$/.test(str.trim());

    // 2. Protección contra inyección de fórmulas (DDE / Formula Injection)
    if (protectFormulas && !isLegitNumber && str.length > 0) {
      const firstChar = str.charAt(0);
      if (['=', '+', '-', '@', '\t', '\r', '%'].includes(firstChar)) {
        // Anteponer apóstrofe para neutralizar ejecución de fórmula
        str = "'" + str;
      }
    }

    // 3. Escapado estándar CSV (RFC 4180)
    // Si contiene delimitador, comillas o saltos de línea, envolver entre comillas y duplicar comillas internas
    if (
      str.includes(delimiter) ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      str = `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  }

  formatNumericOrNull(value: number | null | undefined): number | string {
    if (value === null || value === undefined || isNaN(value)) return 'ND';
    return value;
  }

  private sumIdentifiedSaves(stats: MatchCompleteStats, teamId: string): number {
    return stats.goalkeeper_stats
      .filter((gk) => gk.team_id === teamId && !gk.is_unknown_or_collective)
      .reduce((sum, gk) => sum + gk.saves, 0);
  }
}
