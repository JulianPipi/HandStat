import { describe, it, expect } from 'vitest';
import {
  calculateCumulativeMs,
  reverseCumulativeMs,
  calculateWindowBoundaries,
  calculateScoreProgression,
  calculateTurnoverBreakdown,
  calculateShotMapData,
  calculateSuspensionsAndSanctions,
  generateQuickInsights,
  formatClockMs,
} from '../src/services/coachDashboardService';
import type { Match, MatchEvent, MatchPeriod, MatchRoster, Team } from '../src/domain/schemas';

describe('CoachDashboardService - Lógica Deportiva del Panel del DT', () => {
  const mockPeriods: MatchPeriod[] = [
    { id: 'p1', match_id: 'm1', number: 1, kind: 'REGULAR', duration_ms: 1800000 }, // 30 min
    { id: 'p2', match_id: 'm2', number: 2, kind: 'REGULAR', duration_ms: 1800000 }, // 30 min
  ];

  const mockMatch: Match = {
    id: 'm1',
    workspace_id: 'w1',
    scheduled_at: new Date().toISOString(),
    status: 'live',
    detail_level: 'full',
    home_team_id: 'team-a',
    away_team_id: 'team-b',
    home_team_name_snapshot: 'Ferro',
    away_team_name_snapshot: 'River',
    rules_config: {
      periods_count: 2,
      period_duration_ms: 1800000,
      suspension_duration_ms: 120000,
      max_roster_size: 16,
    },
    match_revision: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    device_id: 'd1',
  };

  const mockTeams: Team[] = [
    { id: 'team-a', name: 'Ferro Carril Oeste', short_name: 'FCO', is_own: true, color_primary: '#10b981', created_at: '', updated_at: '', archived: false },
    { id: 'team-b', name: 'River Plate', short_name: 'RIV', is_own: false, color_primary: '#ef4444', created_at: '', updated_at: '', archived: false },
  ];

  const mockRosters: MatchRoster[] = [
    { id: 'r-diego', match_id: 'm1', team_id: 'team-a', shirt_number: 10, display_name_snapshot: 'Diego Simonet', role: 'FIELD', is_starter: true },
    { id: 'r-fede', match_id: 'm1', team_id: 'team-a', shirt_number: 4, display_name_snapshot: 'Federico Pizarro', role: 'FIELD', is_starter: true },
    { id: 'r-rival9', match_id: 'm1', team_id: 'team-b', shirt_number: 9, display_name_snapshot: 'Rival Central', role: 'FIELD', is_starter: true },
  ];

  it('calcula y revierte tiempo acumulado continuo correctamente', () => {
    // 1T 15:00 = 900,000 ms
    const cum1 = calculateCumulativeMs(1, 900000, mockPeriods, mockMatch);
    expect(cum1).toBe(900000);
    const rev1 = reverseCumulativeMs(cum1, mockPeriods, mockMatch);
    expect(rev1.periodNumber).toBe(1);
    expect(rev1.clockMs).toBe(900000);

    // 2T 05:00 = 1,800,000 + 300,000 = 2,100,000 ms
    const cum2 = calculateCumulativeMs(2, 300000, mockPeriods, mockMatch);
    expect(cum2).toBe(2100000);
    const rev2 = reverseCumulativeMs(cum2, mockPeriods, mockMatch);
    expect(rev2.periodNumber).toBe(2);
    expect(rev2.clockMs).toBe(300000);
  });

  it('resuelve correctamente la ventana de Últimos 5 minutos que cruza entre períodos', () => {
    // Estamos en el 2T minuto 02:00 (120,000 ms)
    // Tiempo acumulado actual: 1,800,000 + 120,000 = 1,920,000 ms (32 minutos de juego deportivo)
    // Los últimos 5 min (300,000 ms) deben ir desde 1,620,000 ms hasta 1,920,000 ms
    // 1,620,000 ms corresponde al 1T minuto 27:00 (1,620,000 ms)
    const window = calculateWindowBoundaries('LAST_5_MIN', 2, 120000, mockPeriods, mockMatch);

    expect(window.startCumulativeMs).toBe(1620000);
    expect(window.endCumulativeMs).toBe(1920000);
    expect(window.startPeriodNumber).toBe(1);
    expect(window.startClockMs).toBe(1620000); // 27:00 en 1T
    expect(formatClockMs(window.startClockMs)).toBe('27:00');
    expect(window.endPeriodNumber).toBe(2);
    expect(window.endClockMs).toBe(120000); // 02:00 en 2T
    expect(formatClockMs(window.endClockMs)).toBe('02:00');
  });

  it('calcula la evolución del marcador y detecta racha activa sin respuesta', () => {
    const events: MatchEvent[] = [
      // Gol 1T 10:00 (antes de ventana)
      {
        id: 'e1',
        match_id: 'm1',
        period_id: 'p1',
        match_team_id: 'team-a',
        type: 'SHOT',
        clock_ms: 600000,
        sport_seq: 1,
        audit_seq: 1,
        status: 'active',
        payload: {},
        shot_detail: { result_code: 'GOAL' },
        participants: [{ roster_id: 'r-diego', role: 'SHOOTER' }],
        created_at: '',
        updated_at: '',
        device_id: 'd1',
        version: 1,
      },
      // Gol 1T 28:00 (dentro de ventana) -> team-b
      {
        id: 'e2',
        match_id: 'm1',
        period_id: 'p1',
        match_team_id: 'team-b',
        type: 'SHOT',
        clock_ms: 1680000,
        sport_seq: 2,
        audit_seq: 2,
        status: 'active',
        payload: {},
        shot_detail: { result_code: 'GOAL' },
        participants: [{ roster_id: 'r-rival9', role: 'SHOOTER' }],
        created_at: '',
        updated_at: '',
        device_id: 'd1',
        version: 1,
      },
      // Gol 2T 01:00 (dentro de ventana) -> team-b
      {
        id: 'e3',
        match_id: 'm1',
        period_id: 'p2',
        match_team_id: 'team-b',
        type: 'SHOT',
        clock_ms: 60000,
        sport_seq: 3,
        audit_seq: 3,
        status: 'active',
        payload: {},
        shot_detail: { result_code: 'GOAL' },
        participants: [{ roster_id: 'r-rival9', role: 'SHOOTER' }],
        created_at: '',
        updated_at: '',
        device_id: 'd1',
        version: 1,
      },
    ];

    const window = calculateWindowBoundaries('LAST_5_MIN', 2, 120000, mockPeriods, mockMatch);
    const progression = calculateScoreProgression(
      events,
      window,
      'team-a',
      'team-b',
      mockTeams,
      mockRosters,
      mockPeriods,
      mockMatch
    );

    // Marcador antes de la ventana: 1 - 0
    expect(progression.startScore).toEqual({ home: 1, away: 0 });
    // Marcador final: 1 - 2
    expect(progression.endScore).toEqual({ home: 1, away: 2 });
    // Parcial en la ventana: 0 - 2
    expect(progression.partialScore).toEqual({ home: 0, away: 2 });

    // Racha activa de 2 goles seguidos de team-b
    expect(progression.unansweredRun).not.toBeNull();
    expect(progression.unansweredRun?.goalsCount).toBe(2);
    expect(progression.unansweredRun?.teamId).toBe('team-b');
  });

  it('calcula cuenta regresiva dinámica de exclusiones de 2 minutos y traspaso entre períodos', () => {
    // Sanción ocurrida en 1T minuto 29:00 (1,740,000 ms acumulado)
    const sanctionEvent: MatchEvent = {
      id: 's1',
      match_id: 'm1',
      period_id: 'p1',
      match_team_id: 'team-a',
      type: 'SANCTION',
      clock_ms: 1740000,
      sport_seq: 10,
      audit_seq: 10,
      status: 'active',
      payload: {},
      sanction_detail: { kind: 'TWO_MINUTE', duration_ms: 120000 },
      participants: [{ roster_id: 'r-fede', role: 'SANCTIONED' }],
      created_at: '',
      updated_at: '',
      device_id: 'd1',
      version: 1,
    };

    // Caso A: Estamos en 1T 29:30 (pasaron 30 segundos de juego deportivo)
    // Restan 90 segundos (01:30)
    const resA = calculateSuspensionsAndSanctions(
      [sanctionEvent],
      1,
      1770000,
      mockTeams,
      mockRosters,
      mockPeriods,
      mockMatch
    );
    expect(resA.activeSuspensions.length).toBe(1);
    expect(resA.activeSuspensions[0].remainingMs).toBe(90000);
    expect(resA.activeSuspensions[0].statusLabel).toBe('01:30');
    expect(resA.activeSuspensions[0].isExpired).toBe(false);

    // Caso B: Traspaso a 2T minuto 00:45
    // En 1T transcurrió 1 minuto (de 29:00 a 30:00). En 2T transcurrieron 45s.
    // Total transcurrido: 105s (105,000 ms). Restan 15s (00:15).
    const resB = calculateSuspensionsAndSanctions(
      [sanctionEvent],
      2,
      45000,
      mockTeams,
      mockRosters,
      mockPeriods,
      mockMatch
    );
    expect(resB.activeSuspensions.length).toBe(1);
    expect(resB.activeSuspensions[0].remainingMs).toBe(15000);
    expect(resB.activeSuspensions[0].statusLabel).toBe('00:15');

    // Caso C: En 2T minuto 01:15 (pasaron 2m15s totales) -> expirado
    const resC = calculateSuspensionsAndSanctions(
      [sanctionEvent],
      2,
      75000,
      mockTeams,
      mockRosters,
      mockPeriods,
      mockMatch
    );
    expect(resC.activeSuspensions.length).toBe(0);
    expect(resC.expiredSuspensions.length).toBe(1);
    expect(resC.expiredSuspensions[0].statusLabel).toBe('Puede reingresar');
  });

  it('detecta advertencia para jugador con 2 exclusiones acumuladas', () => {
    const events: MatchEvent[] = [
      {
        id: 's1',
        match_id: 'm1',
        period_id: 'p1',
        match_team_id: 'team-a',
        type: 'SANCTION',
        clock_ms: 300000,
        sport_seq: 1,
        audit_seq: 1,
        status: 'active',
        payload: {},
        sanction_detail: { kind: 'TWO_MINUTE', duration_ms: 120000 },
        participants: [{ roster_id: 'r-fede', role: 'SANCTIONED' }],
        created_at: '',
        updated_at: '',
        device_id: 'd1',
        version: 1,
      },
      {
        id: 's2',
        match_id: 'm1',
        period_id: 'p2',
        match_team_id: 'team-a',
        type: 'SANCTION',
        clock_ms: 600000,
        sport_seq: 2,
        audit_seq: 2,
        status: 'active',
        payload: {},
        sanction_detail: { kind: 'TWO_MINUTE', duration_ms: 120000 },
        participants: [{ roster_id: 'r-fede', role: 'SANCTIONED' }],
        created_at: '',
        updated_at: '',
        device_id: 'd1',
        version: 1,
      },
    ];

    const res = calculateSuspensionsAndSanctions(
      events,
      2,
      700000,
      mockTeams,
      mockRosters,
      mockPeriods,
      mockMatch
    );

    expect(res.playersAtExclusionLimit.length).toBe(1);
    expect(res.playersAtExclusionLimit[0].rosterId).toBe('r-fede');
    expect(res.playersAtExclusionLimit[0].count).toBe(2);
    expect(res.playersAtExclusionLimit[0].isAtLimit).toBe(true);
  });

  it('genera resumen rápido con datos factuales y respaldos empíricos', () => {
    const window = calculateWindowBoundaries('LAST_5_MIN', 1, 300000, mockPeriods, mockMatch);
    const turnovers = calculateTurnoverBreakdown([], 'team-a', mockRosters);
    const rivalShots = calculateShotMapData([], 'team-b');
    const progression = calculateScoreProgression(
      [],
      window,
      'team-a',
      'team-b',
      mockTeams,
      mockRosters,
      mockPeriods,
      mockMatch
    );

    const insights = generateQuickInsights(
      window,
      'team-a',
      'team-b',
      mockTeams,
      mockRosters,
      progression,
      turnovers,
      rivalShots
    );

    expect(insights.length).toBeLessThanOrEqual(3);
    expect(insights[0].title).toBe('Control de Balón');
    expect(insights[1].title).toContain('Lanzamientos');
    expect(insights[2].title).toBe('Evolución del Marcador');
  });
});
