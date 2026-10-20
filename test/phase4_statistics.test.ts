import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { HandballDatabase } from '../src/data/db';
import { ActionRecorderService } from '../src/services/actionRecorder';
import { TransferService } from '../src/services/transferService';
import { MatchManagementService } from '../src/services/matchManagementService';
import { PossessionService } from '../src/services/possessionService';
import { ParticipationService } from '../src/services/participationService';
import { StatsEngine } from '../src/services/statsEngine';

describe('Fase 4: Motor Estadístico, Métricas, Mapas de Lanzamiento y Acumulados', () => {
  let db: HandballDatabase;
  let actionRecorder: ActionRecorderService;
  let transferService: TransferService;
  let managementService: MatchManagementService;
  let possessionService: PossessionService;
  let participationService: ParticipationService;

  let testMatchId: string;
  let period1Id: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let shooter1RosterId: string;
  let shooter2RosterId: string;
  let assisterRosterId: string;
  let gkRosterId: string;

  beforeEach(async () => {
    db = new HandballDatabase(`test_fase4_${Math.random()}`);
    actionRecorder = new ActionRecorderService(db);
    transferService = new TransferService(db);
    managementService = new MatchManagementService(db);
    possessionService = new PossessionService(db);
    participationService = new ParticipationService(db);

    const homeTeam = await managementService.createTeam({
      name: 'Club Balonmano Sol',
      short_name: 'SOL',
      is_own: true,
      color_primary: '#0284c7',
    });
    homeTeamId = homeTeam.id;

    const awayTeam = await managementService.createTeam({
      name: 'Club Atlético Rival',
      short_name: 'RIV',
      is_own: false,
      color_primary: '#dc2626',
    });
    awayTeamId = awayTeam.id;

    const p1 = await managementService.createPlayer({
      first_name: 'Martín',
      last_name: 'Docal',
      default_number: 10,
      position: 'CB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p2 = await managementService.createPlayer({
      first_name: 'Ramiro',
      last_name: 'Martínez',
      default_number: 7,
      position: 'RW',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p3 = await managementService.createPlayer({
      first_name: 'Sebastián',
      last_name: 'Simonet',
      default_number: 6,
      position: 'LB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p4 = await managementService.createPlayer({
      first_name: 'Mariano',
      last_name: 'Cánepa',
      default_number: 11,
      position: 'PV',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p5 = await managementService.createPlayer({
      first_name: 'Federico',
      last_name: 'Fernández',
      default_number: 2,
      position: 'LW',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const gk = await managementService.createPlayer({
      first_name: 'Leonel',
      last_name: 'Maciel',
      default_number: 12,
      position: 'GK',
      is_goalkeeper: true,
      team_id: homeTeamId,
    });

    const match = await managementService.createMatch({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      competition: 'Liga de Honor',
      venue: 'Gimnasio Central',
      rules_config: {
        periods_count: 2,
        period_duration_ms: 30 * 60 * 1000,
        max_roster_size: 16,
      },
      home_roster: [
        { player_id: p1.id, shirt_number: 10, display_name: '10 · M. Docal', role: 'FIELD', is_starter: true },
        { player_id: p2.id, shirt_number: 7, display_name: '7 · R. Martínez', role: 'FIELD', is_starter: true },
        { player_id: p3.id, shirt_number: 6, display_name: '6 · S. Simonet', role: 'FIELD', is_starter: true },
        { player_id: p4.id, shirt_number: 11, display_name: '11 · M. Cánepa', role: 'FIELD', is_starter: true },
        { player_id: p5.id, shirt_number: 2, display_name: '2 · F. Fernández', role: 'FIELD', is_starter: true },
        { player_id: gk.id, shirt_number: 12, display_name: '12 · L. Maciel', role: 'GK', is_starter: true },
      ],
    });

    testMatchId = match.id;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).sortBy('number');
    period1Id = periods[0]!.id;

    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    shooter1RosterId = rosters.find((r) => r.player_id === p1.id)!.id;
    shooter2RosterId = rosters.find((r) => r.player_id === p2.id)!.id;
    assisterRosterId = rosters.find((r) => r.player_id === p3.id)!.id;
    gkRosterId = rosters.find((r) => r.player_id === gk.id)!.id;
  });

  // 1. Efectividad de lanzamiento y de porteros con fórmulas exactas
  it('1. Calcula efectividad de lanzamiento y de porteros conforme a las fórmulas exactas del proyecto', async () => {
    // Confirmar formación en cancha
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId, shooter2RosterId, assisterRosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // P1 realiza 4 tiros: 2 goles, 1 atajado, 1 fuera -> Efectividad = 2/4 = 50.0%
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', origin_zone_code: 'C6', target_zone_code: 'TC', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }, { roster_id: assisterRosterId, role: 'ASSIST' }],
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: { result_code: 'GOAL', origin_zone_code: 'C6', target_zone_code: 'TL', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 180000,
      shotDetail: { result_code: 'SAVED', origin_zone_code: 'C9', target_zone_code: 'BC', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 240000,
      shotDetail: { result_code: 'MISSED', origin_zone_code: 'C9', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });

    // Rival dispara contra nuestro arquero (L. Maciel):
    // 3 atajadas, 1 gol recibido, 1 tiro fuera
    // Tiros a portería = 3 + 1 = 4. Porcentaje atajadas = 3/4 = 75.0%
    // El tiro fuera NO debe entrar en el denominador de efectividad de atajadas
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 300000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
      participants: [{ roster_id: gkRosterId, role: 'GOALKEEPER' }],
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 360000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
      participants: [{ roster_id: gkRosterId, role: 'GOALKEEPER' }],
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 420000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
      participants: [{ roster_id: gkRosterId, role: 'GOALKEEPER' }],
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 480000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: gkRosterId, role: 'GOALKEEPER' }],
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 540000,
      shotDetail: { result_code: 'MISSED', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);

    // Verificación de efectividad de P1
    const p1Stats = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;
    expect(p1Stats.goals).toBe(2);
    expect(p1Stats.total_shots).toBe(4);
    expect(p1Stats.shot_effectiveness_pct).toBe(50.0);
    expect(p1Stats.assists).toBe(0);

    // Verificación de asistencias de P3
    const p3Stats = stats.player_stats.find((p) => p.roster_id === assisterRosterId)!;
    expect(p3Stats.assists).toBe(1);

    // Verificación de nuestro arquero L. Maciel
    const gkStats = stats.goalkeeper_stats.find((g) => g.roster_id === gkRosterId)!;
    expect(gkStats.saves).toBe(3);
    expect(gkStats.goals_conceded).toBe(1);
    expect(gkStats.shots_on_target).toBe(4);
    expect(gkStats.save_pct).toBe(75.0);
    expect(gkStats.shots_off_target).toBe(1);
  });

  // 2. Minutos y Plus/Minus con sustituciones y exclusiones
  it('2. Calcula minutos jugados y diferencial Plus/Minus (+/-) respetando intervalos exactos', async () => {
    // Confirmar formación: Entran P1 y Arquero al min 0 (0 ms)
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // Minuto 5 (300.000 ms): Gol de nuestro equipo (P1 en cancha -> +1)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 300000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });

    // Minuto 10 (600.000 ms): Sustitución -> Sale P1, Entra P2
    await participationService.substitutePlayer({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 600000,
      rosterOutId: shooter1RosterId,
      rosterInId: shooter2RosterId,
    });

    // Minuto 15 (900.000 ms): Gol rival (P2 en cancha -> -1; P1 en banco -> 0)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 900000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    // Minuto 20 (1.200.000 ms): Cierre de período
    await participationService.closePeriodParticipations(testMatchId, period1Id, 1200000);

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);

    const p1Stats = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;
    const p2Stats = stats.player_stats.find((p) => p.roster_id === shooter2RosterId)!;

    // P1 jugó de 0 a 10 min = 600.000 ms = 10:00. Plus/Minus = +1
    expect(p1Stats.minutes_played_ms).toBe(600000);
    expect(p1Stats.minutes_played_formatted).toBe('10:00');
    expect(p1Stats.plus_minus).toBe(+1);

    // P2 jugó de 10 a 20 min = 600.000 ms = 10:00. Plus/Minus = -1
    expect(p2Stats.minutes_played_ms).toBe(600000);
    expect(p2Stats.minutes_played_formatted).toBe('10:00');
    expect(p2Stats.plus_minus).toBe(-1);
  });

  // 3. Gol y sustitución en el mismo milisegundo respetan orden deportivo (sport_seq)
  it('3. Desempate deportivo en el mismo milisegundo: Plus/Minus respeta sport_seq', async () => {
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // A los 300.000 ms ocurre una sustitución: Sale P1, Entra P2 (sport_seq = 1)
    const subEventRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SUBSTITUTION',
      clockMs: 300000,
      sportSeq: 1,
      participants: [
        { roster_id: shooter1RosterId, role: 'SUB_OUT' },
        { roster_id: shooter2RosterId, role: 'SUB_IN' },
      ],
    });

    await participationService.substitutePlayer({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 300000,
      rosterOutId: shooter1RosterId,
      rosterInId: shooter2RosterId,
      eventId: subEventRes.savedEvent.id,
    });

    // En el mismo milisegundo (300.000 ms), pero DEPUÉS (sport_seq = 2), se convalida un gol del rival
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 300000,
      sportSeq: 2,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    await participationService.closePeriodParticipations(testMatchId, period1Id, 600000);

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);

    const p1Stats = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;
    const p2Stats = stats.player_stats.find((p) => p.roster_id === shooter2RosterId)!;

    // Dado que la sustitución ocurrió antes (sport_seq 1) que el gol rival (sport_seq 2):
    // P1 ya había salido (Plus/Minus = 0)
    // P2 ya había ingresado (Plus/Minus = -1)
    expect(p1Stats.plus_minus).toBe(0);
    expect(p2Stats.plus_minus).toBe(-1);
  });

  // 4. Correcciones y anulaciones recalculan todos los efectos afectados
  it('4. Anulación y edición actualizan marcador, efectividades y Plus/Minus sin puntos fantasma', async () => {
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    const shotRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });
    const eventId = shotRes.savedEvent.id;

    let match = (await db.matches.get(testMatchId))!;
    let periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    let teams = await db.teams.toArray();
    let rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    let events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    let participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    let stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    expect(stats.final_home_score).toBe(1);
    expect(stats.player_stats.find((p) => p.roster_id === shooter1RosterId)?.plus_minus).toBe(+1);

    // Anular el gol (voidAction)
    await actionRecorder.voidAction(eventId, 'Anulado por invasión de área');

    events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);

    // Marcador debe volver a 0 y Plus/Minus debe volver a 0
    expect(stats.final_home_score).toBe(0);
    expect(stats.player_stats.find((p) => p.roster_id === shooter1RosterId)?.goals).toBe(0);
    expect(stats.player_stats.find((p) => p.roster_id === shooter1RosterId)?.plus_minus).toBe(0);
  });

  // 5. Posesiones con rebote ofensivo
  it('5. Posesión con rebote ofensivo no incrementa cantidad de posesiones ni distorsiona métricas', async () => {
    await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });

    // Tiro fallado con rebote ofensivo
    const shot1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 30000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
    });
    await possessionService.handleEventEffect(shot1.savedEvent, homeTeamId, awayTeamId, { offensiveRebound: true });

    // Segundo tiro de la misma posesión termina en gol
    const shot2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 50000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    await possessionService.handleEventEffect(shot2.savedEvent, homeTeamId, awayTeamId);

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions, []);

    // La posesión es exactamente 1 posesión completa que terminó en gol (goals_per_possession = 1.0)
    expect(stats.home_possessions.total_possessions).toBe(1);
    expect(stats.home_possessions.complete_possessions).toBe(1);
    expect(stats.home_possessions.goals_scored).toBe(1);
    expect(stats.home_possessions.goals_per_possession).toBe(1);
  });

  // 6. Portero desconocido y portería vacía
  it('6. Separa estrictamente goles a portería vacía de atajadas y goles del arquero', async () => {
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // Tiro rival con portería vacía (empty net)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: true },
    });

    // Tiro rival atajado por L. Maciel
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
      participants: [{ roster_id: gkRosterId, role: 'GOALKEEPER' }],
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    const gkStats = stats.goalkeeper_stats.find((g) => g.roster_id === gkRosterId)!;

    // El gol a portería vacía se registra en empty_net_goals_conceded pero NO como gol recibido por el arquero
    expect(gkStats.empty_net_goals_conceded).toBe(1);
    expect(gkStats.goals_conceded).toBe(0);
    expect(gkStats.saves).toBe(1);
    expect(gkStats.shots_on_target).toBe(1);
    expect(gkStats.save_pct).toBe(100.0);
  });

  // 7. Situación numérica desconocida vs confirmada
  it('7. No supone 7 rivales y clasifica situación numérica como UNKNOWN si falta confirmación', async () => {
    // Si no se confirmó cantidad rival, debe registrarse como UNKNOWN
    const evUnknown = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      numericalSituation: {
        own_count: 6,
        rival_count: undefined, // Desconocido
        context: 'UNKNOWN',
      },
    });

    expect(evUnknown.savedEvent.numerical_situation?.context).toBe('UNKNOWN');
    expect(evUnknown.savedEvent.numerical_situation?.rival_count).toBeUndefined();

    // Si se confirmó situación de inferioridad real (6 vs 7)
    const evInferiority = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      numericalSituation: {
        own_count: 6,
        rival_count: 7,
        context: 'INFERIORITY',
      },
    });

    expect(evInferiority.savedEvent.numerical_situation?.context).toBe('INFERIORITY');
    expect(evInferiority.savedEvent.numerical_situation?.own_count).toBe(6);
    expect(evInferiority.savedEvent.numerical_situation?.rival_count).toBe(7);
  });

  // 8. Denominadores cero y registros incompletos
  it('8. Manejo riguroso de denominadores cero: devuelve null en lugar de 0% o NaN', () => {
    expect(StatsEngine.safePercentage(0, 0)).toBeNull();
    expect(StatsEngine.safePercentage(5, 0)).toBeNull();
    expect(StatsEngine.safeRatio(0, 0)).toBeNull();
    expect(StatsEngine.formatMs(null)).toBe('—');
  });

  // 9. Acumulados multi-partido ponderados por sus denominadores
  it('9. Calcula acumulados ponderados por totales y no promediando porcentajes de partidos', () => {
    // Simulación: Partido A (1 de 1 tiro = 100%) vs Partido B (0 de 9 tiros = 0%)
    // Si promediáramos porcentajes daría (100 + 0) / 2 = 50% (INCORRECTO)
    // El cálculo ponderado exacto es (1 + 0) / (1 + 9) = 1/10 = 10.0% (CORRECTO)
    const dummyMatchStatsA: any = {
      match_id: 'm-A',
      home_shots: { goals: 1, total_shots: 1 },
      away_shots: { goals: 0, total_shots: 0 },
      home_turnovers: 0,
      away_turnovers: 0,
      home_steals: 0,
      away_steals: 0,
      home_blocks: 0,
      away_blocks: 0,
      home_goalkeeper_summary: { empty_net_goals: 0, unattributed_shots: 0, unattributed_goals: 0, unattributed_saves: 0 },
      away_goalkeeper_summary: { empty_net_goals: 0, unattributed_shots: 0, unattributed_goals: 0, unattributed_saves: 0 },
      player_stats: [
        { player_id: 'p1', display_name: 'P1', shirt_number: 10, goals: 1, total_shots: 1, assists: 0, turnovers: 0, steals: 0, defensive_blocks: 0, minutes_played_ms: 600000, plus_minus: 1 },
      ],
      goalkeeper_stats: [
        { display_name: 'GK1', is_unknown_or_collective: false, saves: 5, goals_conceded: 5, shots_on_target: 10 },
      ],
    };

    const dummyMatchStatsB: any = {
      match_id: 'm-B',
      home_shots: { goals: 0, total_shots: 9 },
      away_shots: { goals: 0, total_shots: 0 },
      home_turnovers: 2,
      away_turnovers: 0,
      home_steals: 1,
      away_steals: 0,
      home_blocks: 1,
      away_blocks: 0,
      home_goalkeeper_summary: { empty_net_goals: 1, unattributed_shots: 2, unattributed_goals: 1, unattributed_saves: 1 },
      away_goalkeeper_summary: { empty_net_goals: 0, unattributed_shots: 0, unattributed_goals: 0, unattributed_saves: 0 },
      player_stats: [
        { player_id: 'p1', display_name: 'P1', shirt_number: 10, goals: 0, total_shots: 9, assists: 1, turnovers: 2, steals: 1, defensive_blocks: 1, minutes_played_ms: 600000, plus_minus: -2 },
      ],
      goalkeeper_stats: [
        { display_name: 'GK1', is_unknown_or_collective: false, saves: 1, goals_conceded: 9, shots_on_target: 10 },
      ],
    };

    const aggregated = StatsEngine.aggregateMultiMatchStats([dummyMatchStatsA, dummyMatchStatsB]);

    expect(aggregated.matches_count).toBe(2);
    expect(aggregated.total_goals).toBe(1);
    expect(aggregated.total_shots).toBe(10);
    // Efectividad colectiva exacta: 1/10 = 10.0%
    expect(aggregated.aggregate_shot_effectiveness_pct).toBe(10.0);

    // Efectividad de P1: 1/10 = 10.0%
    expect(aggregated.players['p1']?.effectiveness_pct).toBe(10.0);
    expect(aggregated.players['p1']?.plus_minus).toBe(-1); // 1 + (-2)

    // Atajadas GK1: 6 saves sobre 20 tiros = 30.0%
    expect(aggregated.goalkeepers['GK1']?.save_pct).toBe(30.0);
    expect(aggregated.total_empty_net_goals).toBe(1);
    expect(aggregated.total_unattributed_shots).toBe(2);
  });

  // 10. Mapas de lanzamientos con conteo explícito de zonas faltantes
  it('10. Construye mapa de lanzamientos y cuenta de forma explícita tiros sin zona', async () => {
    // 1 tiro en 6m centro
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', origin_zone_code: 'C6', target_zone_code: 'TL', is_empty_net: false },
    });
    // 1 tiro sin zona de origen especificada
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], []);

    expect(stats.home_court_map.total_attempts).toBe(2);
    expect(stats.home_court_map.zones['C6']?.attempts).toBe(1);
    expect(stats.home_court_map.zones['C6']?.goals).toBe(1);
    expect(stats.home_court_map.unspecified_count).toBe(1);
    expect(stats.home_court_map.unspecified_goals).toBe(0);
  });

  // 11. Igualdad exacta de resultados estadísticos tras exportar e importar archivo JSON
  it('11. Garantiza igualdad matemática de estadísticas antes y después de transferir JSON', async () => {
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 40000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });

    const envelope = await transferService.exportMatch(testMatchId);

    // Calcular estadísticas en la base de datos origen
    const sourceMatch = (await db.matches.get(testMatchId))!;
    const sourcePeriods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const sourceTeams = await db.teams.toArray();
    const sourceRosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const sourceEvents = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const sourceStats = StatsEngine.calculateMatchStats(sourceMatch, sourcePeriods, sourceTeams, sourceRosters, sourceEvents);

    // Importar en base de datos destino limpia
    const targetDb = new HandballDatabase(`target_stats_${Math.random()}`);
    const targetTransfer = new TransferService(targetDb);
    const analysis = await targetTransfer.analyzeImport(envelope);
    expect(analysis.kind).toBe('NEW');
    if (analysis.kind === 'NEW') {
      await targetTransfer.applyImport(analysis.envelope, false);
    }

    const targetMatch = (await targetDb.matches.get(testMatchId))!;
    const targetPeriods = await targetDb.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const targetTeams = await targetDb.teams.toArray();
    const targetRosters = await targetDb.matchRosters.where('match_id').equals(testMatchId).toArray();
    const targetEvents = await targetDb.matchEvents.where('match_id').equals(testMatchId).toArray();
    const targetStats = StatsEngine.calculateMatchStats(targetMatch, targetPeriods, targetTeams, targetRosters, targetEvents);

    expect(targetStats.final_home_score).toBe(sourceStats.final_home_score);
    expect(targetStats.home_shots.effectiveness_pct).toBe(sourceStats.home_shots.effectiveness_pct);
    expect(targetStats.player_stats.length).toBe(sourceStats.player_stats.length);
  });

  // 12. Posesiones parciales: explica por qué 10 goles pueden convivir con posesiones incompletas
  it('12. Reporta cobertura parcial de posesiones, goles sin asociar y advertencia explícita', async () => {
    // Registrar 5 goles de nuestro equipo SIN posesión abierta previa
    for (let i = 1; i <= 5; i++) {
      await actionRecorder.recordAction({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: homeTeamId,
        type: 'SHOT',
        clockMs: i * 20000,
        shotDetail: { result_code: 'GOAL', is_empty_net: false },
        participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
      });
    }

    // Registrar 1 posesión estructurada que NO termina en gol (termina en turnover)
    const pos = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 150000,
      startReason: 'MANUAL',
    });
    await possessionService.endPossession({
      possessionId: pos.id,
      clockMs: 170000,
      endReason: 'TURNOVER',
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions);

    // River tiene 5 goles en el partido
    expect(stats.home_possessions.total_match_goals).toBe(5);
    // Pero en la posesión analizada no hubo goles
    expect(stats.home_possessions.goals_in_tracked_possessions).toBe(0);
    // Hay 5 goles no vinculados a posesiones
    expect(stats.home_possessions.unassociated_goals).toBe(5);
    // El estado de cobertura es PARTIAL
    expect(stats.home_possessions.coverage_status).toBe('PARTIAL');
    expect(stats.home_possessions.coverage_warning).toBeDefined();
    // Goles por posesión de las analizadas es 0.0
    expect(stats.home_possessions.goals_per_possession).toBe(0);
  });

  // 13. Anular una acción actualiza y desvincula las posesiones afectadas
  it('13. Anular un gol o turnover reabre la posesión cerrada o elimina la creada por ese evento', async () => {
    // Abrir posesión para homeTeam
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });

    // Registrar gol que cierra la posesión de home e inicia la de away
    const goalRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 30000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    await possessionService.handleEventEffect(goalRes.savedEvent, homeTeamId, awayTeamId);

    let possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();
    expect(possessions.length).toBe(2);
    const p1Updated = possessions.find((p) => p.id === p1.id)!;
    expect(p1Updated.is_complete).toBe(true);

    // Anular la acción del gol
    await actionRecorder.voidAction(goalRes.savedEvent.id, 'Gol anulado por falta previa');

    // La posesión creada por ese gol debe haberse eliminado y la posesión p1 debe haberse reabierto
    possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();
    expect(possessions.length).toBe(1);
    const p1Reopened = possessions.find((p) => p.id === p1.id)!;
    expect(p1Reopened.is_complete).toBe(false);
    expect(p1Reopened.end_clock_ms).toBeUndefined();
    expect(p1Reopened.end_event_id).toBeUndefined();
  });

  // 14. Portería colectiva y tiros sin arquero nominal
  it('14. Agrupa en portería colectiva los tiros rivales que no tuvieron arquero individual asignado', async () => {
    // Registrar 3 tiros contra awayTeam (que no tiene arquero nominal asignado ni formación)
    // 2 goles y 1 parada
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 30000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 90000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], []);

    // El rival recibió 3 tiros a puerta sin arquero nominal
    expect(stats.away_goalkeeper_summary.total_opposing_shots).toBe(3);
    expect(stats.away_goalkeeper_summary.unattributed_shots).toBe(3);
    expect(stats.away_goalkeeper_summary.unattributed_goals).toBe(2);
    expect(stats.away_goalkeeper_summary.unattributed_saves).toBe(1);

    const collectiveGk = stats.goalkeeper_stats.find((g) => g.is_unknown_or_collective && g.team_id === awayTeamId)!;
    expect(collectiveGk).toBeDefined();
    expect(collectiveGk.saves).toBe(1);
    expect(collectiveGk.goals_conceded).toBe(2);
    expect(collectiveGk.shots_on_target).toBe(3);
    expect(collectiveGk.save_pct).toBe(33.3);
    expect(collectiveGk.unattributed_explanation).toBeDefined();
  });

  // 15. Detección de cobertura parcial en Plus/Minus cuando hay goles sin formación en pista
  it('15. Detecta goles sin formación registrada en cancha y reporta cobertura parcial de Plus/Minus', async () => {
    // Gol anotado ANTES de confirmar formación (a los 10 segundos = 10.000 ms)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 10000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });

    // Formación confirmada a los 30 segundos (30.000 ms) con los 5 jugadores de campo y el arquero
    const homeFieldRosters = (await db.matchRosters.where('match_id').equals(testMatchId).and((r) => r.team_id === homeTeamId && r.role === 'FIELD').toArray()).map((r) => r.id);
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      starterRosterIds: homeFieldRosters,
      goalkeeperRosterId: gkRosterId,
    });

    // Gol anotado a los 60 segundos (60.000 ms) con el jugador en pista
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    const p1 = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;

    // Marcó 2 goles personales
    expect(p1.goals).toBe(2);
    // Pero solo 1 gol ocurrió mientras estaba en su intervalo de cancha (el de 60s, no el de 10s previo)
    expect(p1.plus_minus).toBe(+1);
    // Hay 1 gol del partido sin formación en cancha
    expect(p1.uncovered_match_goals).toBe(1);
    expect(p1.plus_minus_coverage).toBe('PARTIAL');
    expect(p1.plus_minus_note).toBeDefined();
  });

  // 16. Dos posesiones completas con un gol cada una: dos goles, dos posesiones, ratio 1
  it('16. Dos posesiones completas con un gol cada una: dos goles, dos posesiones, ratio 1', async () => {
    // Posesión 1: 0s a 20s, termina con gol 1
    const goal1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: p1.id,
      clockMs: 20000,
      endReason: 'GOAL',
      endEventId: goal1.savedEvent.id,
    });

    // Posesión 2: 40s a 60s, termina con gol 2
    const goal2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const p2 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 40000,
      startReason: 'TURNOVER',
    });
    await possessionService.endPossession({
      possessionId: p2.id,
      clockMs: 60000,
      endReason: 'GOAL',
      endEventId: goal2.savedEvent.id,
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions);

    expect(stats.home_possessions.complete_possessions).toBe(2);
    expect(stats.home_possessions.goals_in_tracked_possessions).toBe(2);
    expect(stats.home_possessions.goals_per_possession).toBe(1);
    expect(stats.home_possessions.has_inconsistency).toBe(false);
  });

  // 17. Una posesión con rebote ofensivo y gol: varios tiros, un gol, una posesión
  it('17. Una posesión con rebote ofensivo y gol: varios tiros, un gol, una posesión', async () => {
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });

    // Tiro 1: atajado a los 10s con rebote ofensivo
    const shot1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 10000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
    });
    await possessionService.handleEventEffect(shot1.savedEvent, homeTeamId, awayTeamId, { offensiveRebound: true });

    // Tiro 2: palo a los 18s con rebote ofensivo
    const shot2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 18000,
      shotDetail: { result_code: 'POST', is_empty_net: false },
    });
    await possessionService.handleEventEffect(shot2.savedEvent, homeTeamId, awayTeamId, { offensiveRebound: true });

    // Tiro 3: gol definitivo a los 25s
    const goal = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 25000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    await possessionService.endPossession({
      possessionId: p1.id,
      clockMs: 25000,
      endReason: 'GOAL',
      endEventId: goal.savedEvent.id,
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions);

    expect(stats.home_possessions.complete_possessions).toBe(1);
    expect(stats.home_possessions.goals_in_tracked_possessions).toBe(1);
    expect(stats.home_possessions.goals_per_possession).toBe(1);
    expect(stats.home_shots.total_shots).toBe(3);
    expect(stats.home_possessions.unassociated_shots).toBe(0);
    expect(stats.home_possessions.has_inconsistency).toBe(false);
  });

  // 18. Goles anteriores al seguimiento de posesiones: sin asociación automática
  it('18. Goles anteriores al seguimiento de posesiones: sin asociación automática', async () => {
    // 3 goles tempranos sin posesiones creadas (ej. t=5s, 10s, 15s)
    for (let i = 1; i <= 3; i++) {
      await actionRecorder.recordAction({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: homeTeamId,
        type: 'SHOT',
        clockMs: i * 5000,
        shotDetail: { result_code: 'GOAL', is_empty_net: false },
      });
    }

    // A partir de los 30s se inicia el seguimiento con 1 posesión que termina en gol a los 45s
    const lateGoal = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 45000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const pTracked = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: pTracked.id,
      clockMs: 45000,
      endReason: 'GOAL',
      endEventId: lateGoal.savedEvent.id,
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions);

    // En total hay 4 goles
    expect(stats.home_possessions.total_match_goals).toBe(4);
    // Pero en la posesión rastreada solo hay 1 gol (los 3 previos no se absorben automáticamente)
    expect(stats.home_possessions.goals_in_tracked_possessions).toBe(1);
    expect(stats.home_possessions.unassociated_goals).toBe(3);
    expect(stats.home_possessions.complete_possessions).toBe(1);
    expect(stats.home_possessions.goals_per_possession).toBe(1); // 1/1 = 1, jamás 4/1 = 4
    expect(stats.home_possessions.coverage_status).toBe('PARTIAL');
  });

  // 19. Gol vinculado a otro equipo, período o fuera de los límites: detectar inconsistencia
  it('19. Gol vinculado a otro equipo, período o fuera de los límites: detectar inconsistencia', async () => {
    // Gol de awayTeam a los 20s
    const awayGoal = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    // Posesión de homeTeam que apunta al gol de awayTeam (inconsistencia cruzada de equipo)
    const pErroneous = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: pErroneous.id,
      clockMs: 20000,
      endReason: 'GOAL',
      endEventId: awayGoal.savedEvent.id,
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions);

    // Debe detectarse la inconsistencia
    expect(stats.home_possessions.has_inconsistency).toBe(true);
    expect(stats.home_possessions.inconsistency_reasons?.length).toBeGreaterThan(0);
    // El ratio no debe publicarse como válido (debe ser null para renderizar "—")
    expect(stats.home_possessions.goals_per_possession).toBeNull();
  });

  // 20. Dos goles vinculados a la misma posesión: detectar y no publicar el ratio como válido
  it('20. Dos goles vinculados a la misma posesión: detectar y no publicar el ratio como válido', async () => {
    // 2 goles dentro del intervalo de la misma posesión (0s a 30s)
    const g1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 15000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const g2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 30000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    // Posesión que engloba a ambos y cierra con g2
    const pDoubleGoal = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: pDoubleGoal.id,
      clockMs: 30000,
      endReason: 'GOAL',
      endEventId: g2.savedEvent.id,
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions);

    // Inconsistencia: una posesión termina con el gol y no puede contener múltiples goles válidos
    expect(stats.home_possessions.has_inconsistency).toBe(true);
    expect(stats.home_possessions.goals_per_possession).toBeNull();
  });

  // 21. Anular o corregir un gol antiguo con posesiones posteriores ya registradas
  it('21. Anular o corregir un gol antiguo con posesiones posteriores verifica cronología y evita solapamientos', async () => {
    // Posesión 1: 0 a 20s cerrada con Gol 1
    const g1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: p1.id,
      clockMs: 20000,
      endReason: 'GOAL',
      endEventId: g1.savedEvent.id,
    });

    // Posesión 2: posterior a los 30s cerrada con Pérdida a los 45s
    const t2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 45000,
    });
    const p2 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      startReason: 'STEAL',
    });
    await possessionService.endPossession({
      possessionId: p2.id,
      clockMs: 45000,
      endReason: 'TURNOVER',
      endEventId: t2.savedEvent.id,
    });

    // Anular el Gol 1 antiguo
    await actionRecorder.voidAction(g1.savedEvent.id, 'Gol 1 anulado por invasión');

    const possessionsAfterVoid = await db.possessions.where('match_id').equals(testMatchId).toArray();
    const p1Updated = possessionsAfterVoid.find((p) => p.id === p1.id)!;
    const p2Updated = possessionsAfterVoid.find((p) => p.id === p2.id)!;

    // p1 ya no tiene g1 como fin, y gracias a verifyAndHealChronology su fin está acotado a p2.start_clock_ms (30s) sin solapar
    expect(p1Updated.end_event_id).toBeUndefined();
    expect(p1Updated.end_clock_ms).toBeLessThanOrEqual(p2Updated.start_clock_ms);
    // Incertidumbre: no debe marcarse como completa porque carece de evento final evidenciado
    expect(p1Updated.is_complete).toBe(false);
  });

  // 22. Dos eventos PERIOD_END en 00:00 con diferente período (1T y 2T) no son duplicados
  it('22. Dos eventos PERIOD_END en 00:00 con diferente período no se consideran duplicados y ordenan cronológicamente', async () => {
    // Obtener los dos períodos reglamentarios creados para el partido
    const allPeriods = await db.matchPeriods.where('match_id').equals(testMatchId).sortBy('number');
    const p1Id = allPeriods[0]!.id;
    const p2Id = allPeriods[1]!.id;

    // Evento PERIOD_END de 1T a las 00:00
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: p1Id,
      type: 'PERIOD_END',
      clockMs: 0,
    });

    // Evento PERIOD_END de 2T a las 00:00
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: p2Id,
      type: 'PERIOD_END',
      clockMs: 0,
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, []);

    // Ambos eventos coexisten en la base sin ser eliminados ni considerados duplicados
    const p1Ends = events.filter((e) => e.type === 'PERIOD_END' && e.period_id === p1Id);
    const p2Ends = events.filter((e) => e.type === 'PERIOD_END' && e.period_id === p2Id);
    expect(p1Ends.length).toBe(1);
    expect(p2Ends.length).toBe(1);

    // En la evolución de períodos, cada período resume su propio tanteador
    expect(stats.periods_summary.length).toBe(2);
    expect(stats.periods_summary[0].period_number).toBe(1);
    expect(stats.periods_summary[1].period_number).toBe(2);
  });

  // 23. Transferencia JSON que conserva asociaciones y resultados
  it('23. Transferencia JSON conserva asociaciones de posesiones y resultados de estadísticas', async () => {
    // Registrar posesión completa con gol
    const goalTransfer = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 15000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const pTransfer = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: pTransfer.id,
      clockMs: 15000,
      endReason: 'GOAL',
      endEventId: goalTransfer.savedEvent.id,
    });

    const matchBefore = (await db.matches.get(testMatchId))!;
    const periodsBefore = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teamsBefore = await db.teams.toArray();
    const rostersBefore = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const eventsBefore = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessionsBefore = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const statsBefore = StatsEngine.calculateMatchStats(
      matchBefore,
      periodsBefore,
      teamsBefore,
      rostersBefore,
      eventsBefore,
      possessionsBefore
    );

    // Serializar a JSON (simula exportación)
    const exportedPayload = JSON.stringify({
      match: matchBefore,
      periods: periodsBefore,
      rosters: rostersBefore,
      events: eventsBefore,
      possessions: possessionsBefore,
    });

    // Deserializar (simula importación)
    const importedPayload = JSON.parse(exportedPayload);

    const statsAfter = StatsEngine.calculateMatchStats(
      importedPayload.match,
      importedPayload.periods,
      teamsBefore,
      importedPayload.rosters,
      importedPayload.events,
      importedPayload.possessions
    );

    // Comparar exactamente resultados antes y después
    expect(statsAfter.home_score).toBe(statsBefore.home_score);
    expect(statsAfter.away_score).toBe(statsBefore.away_score);
    expect(statsAfter.home_possessions.complete_possessions).toBe(statsBefore.home_possessions.complete_possessions);
    expect(statsAfter.home_possessions.goals_per_possession).toBe(statsBefore.home_possessions.goals_per_possession);
    expect(statsAfter.home_possessions.has_inconsistency).toBe(false);
  });

  // 24. Corrección de tiempo de un gol antiguo y reconstrucción de posesiones posteriores
  it('24. Corrección de tiempo de un gol antiguo actualiza límites sin corromper la posesión posterior', async () => {
    // Posesión 1: 0 a 20s cerrada con Gol 1
    const g1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: p1.id,
      clockMs: 20000,
      endReason: 'GOAL',
      endEventId: g1.savedEvent.id,
    });

    // Posesión 2 posterior: 30s a 45s
    const t2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 45000,
    });
    const p2 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      startReason: 'STEAL',
    });
    await possessionService.endPossession({
      possessionId: p2.id,
      clockMs: 45000,
      endReason: 'TURNOVER',
      endEventId: t2.savedEvent.id,
    });

    // Corregir tiempo del gol de 20s a 25s
    await actionRecorder.updateAction(g1.savedEvent.id, { clock_ms: 25000 }, 'Ajuste de tiempo');

    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();
    const p1Up = possessions.find((p) => p.id === p1.id)!;
    const p2Up = possessions.find((p) => p.id === p2.id)!;

    expect(p1Up.end_clock_ms).toBe(25000);
    expect(p2Up.start_clock_ms).toBe(30000);
    expect(p1Up.end_clock_ms).toBeLessThanOrEqual(p2Up.start_clock_ms);
  });

  // 25. Incertidumbre que no se transforma en posesión completa y se excluye del ratio
  it('25. Posesión con límite acotado por incertidumbre permanece is_complete: false y se excluye del ratio', async () => {
    // Posesión 1 cerrada por un gol
    const g1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await possessionService.endPossession({
      possessionId: p1.id,
      clockMs: 20000,
      endReason: 'GOAL',
      endEventId: g1.savedEvent.id,
    });

    // Posesión 2 posterior cerrada por gol 2
    const g2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 50000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    const p2 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      startReason: 'STEAL',
    });
    await possessionService.endPossession({
      possessionId: p2.id,
      clockMs: 50000,
      endReason: 'GOAL',
      endEventId: g2.savedEvent.id,
    });

    // Anular el Gol 1: la posesión p1 se sana acotándose a 30s pero queda incierta
    await actionRecorder.voidAction(g1.savedEvent.id, 'Gol anulado');

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(testMatchId).toArray();

    const p1Healed = possessions.find((p) => p.id === p1.id)!;
    expect(p1Healed.is_complete).toBe(false);

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions);

    // Solo p2 es posesión completa válida (p1 está excluida por incertidumbre)
    expect(stats.home_possessions.complete_possessions).toBe(1);
    expect(stats.home_possessions.goals_in_tracked_possessions).toBe(1);
    expect(stats.home_possessions.goals_per_possession).toBe(1);
  });

  // 26. Deshacer la corrección y restaurar gol recuperando posesiones
  it('26. Restaurar una acción anulada recupera coherentemente el estado deportivo de las posesiones', async () => {
    const g = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    // Anular
    await actionRecorder.voidAction(g.savedEvent.id, 'Anulado transitorio');
    let ev = (await db.matchEvents.get(g.savedEvent.id))!;
    expect(ev.status).toBe('voided');

    // Restaurar de manera trazable y atómica
    await actionRecorder.restoreAction(g.savedEvent.id, 'Reversión de anulación tras revisión arbitral');
    ev = (await db.matchEvents.get(g.savedEvent.id))!;
    expect(ev.status).toBe('active');
    expect(ev.version).toBe(3);

    // Comprobar que en eventRevisions quedó asentada la restauración
    const revisions = await db.eventRevisions.where('event_id').equals(g.savedEvent.id).toArray();
    expect(revisions.some((r) => r.change_kind === 'restore')).toBe(true);
  });

  // 27. Fallo transaccional sin modificaciones parciales
  it('27. Fallo transaccional garantiza rollback total sin escrituras parciales', async () => {
    const initialEventsCount = await db.matchEvents.count();
    const initialRevisionsCount = await db.eventRevisions.count();

    // Intentar anular un ID inexistente debe arrojar error y no dejar rastro
    await expect(
      actionRecorder.voidAction('00000000-0000-0000-0000-000000000000', 'No existe')
    ).rejects.toThrow();

    expect(await db.matchEvents.count()).toBe(initialEventsCount);
    expect(await db.eventRevisions.count()).toBe(initialRevisionsCount);
  });

  // 28. Eventos simultáneos en el mismo milisegundo separados por sport_seq
  it('28. Eventos simultáneos en el mismo milisegundo se separan por sport_seq en Plus/Minus', async () => {
    // Titulares iniciales
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // A los 30.000 ms ocurren 2 eventos:
    // Evento A: sustitución sale shooter1 e ingresa shooter2 (sport_seq = 1)
    const subOut = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SUBSTITUTION',
      clockMs: 30000,
      sportSeq: 1,
      participants: [
        { roster_id: shooter1RosterId, role: 'SUB_OUT' },
        { roster_id: shooter2RosterId, role: 'SUB_IN' },
      ],
    });
    await participationService.substitutePlayer({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      rosterOutId: shooter1RosterId,
      rosterInId: shooter2RosterId,
      eventId: subOut.savedEvent.id,
    });

    // Evento B: Gol en el mismo milisegundo (30.000 ms) pero posterior deportivamente (sport_seq = 2)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 30000,
      sportSeq: 2,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);

    const s1 = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;
    const s2 = stats.player_stats.find((p) => p.roster_id === shooter2RosterId)!;

    // shooter1 ya había salido antes del gol (sport_seq 1 < sport_seq 2): su +/- es 0
    expect(s1.plus_minus).toBe(0);
    // shooter2 ya había ingresado al momento del gol (sport_seq 1 < sport_seq 2): su +/- es +1
    expect(s2.plus_minus).toBe(1);
  });

  // 29. Formación reducida explícitamente confirmada: cobertura conocida (FULL), sin marcar PARTIAL
  it('29. Formación reducida explícitamente confirmada (ej. 4 jugadores): cobertura conocida (FULL), no marcada como PARTIAL', async () => {
    // Se confirma formación inicial con solo 3 jugadores de campo y 1 arquero (4 jugadores en total)
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId, shooter2RosterId, assisterRosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // Gol a los 20s
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    const p1 = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;

    // La formación reducida fue confirmada explícitamente: no debe considerarse un hueco de registro ni penalizarse con PARTIAL
    expect(p1.uncovered_match_goals).toBe(0);
    expect(p1.individual_coverage).toBe('FULL');
    expect(p1.team_lineup_coverage).toBe('FULL');
    expect(p1.plus_minus_coverage).toBe('FULL');
    expect(p1.plus_minus).toBe(1);
  });

  // 30. Exclusiones y salidas registradas que reducen la formación: sin advertencia falsa de datos faltantes
  it('30. Exclusiones y salidas registradas que reducen la formación: sin advertencia falsa de datos faltantes (FULL)', async () => {
    // Se confirman titulares a los 0s
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId, shooter2RosterId, assisterRosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // A los 15s shooter2 recibe exclusión de 2 min y sale de la cancha
    const exclEvent = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SANCTION',
      clockMs: 15000,
      sanctionDetail: { kind: 'TWO_MINUTE' },
      participants: [{ roster_id: shooter2RosterId, role: 'SANCTIONED' }],
    });
    await participationService.handlePlayerExcluded({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 15000,
      rosterId: shooter2RosterId,
      eventId: exclEvent.savedEvent.id,
    });

    // A los 30s se anota un gol durante la inferioridad numérica
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 30000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    const p1 = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;
    const pExcluded = stats.player_stats.find((p) => p.roster_id === shooter2RosterId)!;

    // P1 estaba en cancha durante el gol: +/- = +1, cobertura FULL
    expect(p1.plus_minus).toBe(1);
    expect(p1.plus_minus_coverage).toBe('FULL');
    expect(p1.individual_coverage).toBe('FULL');

    // pExcluded estaba fuera por exclusión: +/- = 0, pero su estado fuera de pista es totalmente conocido: cobertura FULL
    expect(pExcluded.plus_minus).toBe(0);
    expect(pExcluded.plus_minus_coverage).toBe('FULL');
    expect(pExcluded.individual_coverage).toBe('FULL');
  });

  // 31. Jugador en banco conocido durante un gol: no marcar PARTIAL por ese gol
  it('31. Jugador en banco conocido durante un gol: permanece en FULL y no se penaliza con PARTIAL', async () => {
    // Se confirma alineación inicial donde assisterRosterId NO es titular (queda en el banco)
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId, shooter2RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // Ocurre un gol mientras assisterRosterId está en el banco
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 25000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    const pBench = stats.player_stats.find((p) => p.roster_id === assisterRosterId)!;

    // Su estado en el banco es perfectamente conocido
    expect(pBench.plus_minus).toBe(0);
    expect(pBench.individual_coverage).toBe('FULL');
    expect(pBench.plus_minus_coverage).toBe('FULL');
    expect(pBench.uncovered_match_goals).toBe(0);
  });

  // 32. Formación sin confirmar: cobertura desconocida
  it('32. Formación sin confirmar: cobertura desconocida (NO_DATA) y valores nulos', async () => {
    // NO se llama a confirmInitialLineup ni hay participaciones registradas para el equipo
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();

    // Sin participaciones
    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], []);
    const p1 = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;

    expect(p1.minutes_played_ms).toBeNull();
    expect(p1.plus_minus).toBeNull();
    expect(p1.individual_coverage).toBe('NO_DATA');
    expect(p1.team_lineup_coverage).toBe('NO_DATA');
    expect(p1.plus_minus_coverage).toBe('NO_DATA');
  });

  // 33. Cambios contradictorios o huecos reales: cobertura parcial con explicación
  it('33. Hueco real (gol antes de confirmar alineación) o intervalos contradictorios reportan PARTIAL con explicación', async () => {
    // Formación confirmada recién a los 60.000 ms (01:00)
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 60000,
      starterRosterIds: [shooter1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // Pero a los 20.000 ms (00:20) ocurrió un gol en una brecha sin alineación confirmada
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    const p1 = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;

    expect(p1.uncovered_match_goals).toBe(1);
    expect(p1.individual_coverage).toBe('PARTIAL');
    expect(p1.plus_minus_coverage).toBe('PARTIAL');
    expect(p1.plus_minus_note).toContain('antes de confirmar la formación');
  });

  // 34. Participación individual fiable y formación colectiva incompleta: estados diferenciados
  it('34. Participación individual fiable y formación colectiva con tramo incompleto: estados diferenciados', async () => {
    // Período 1 con formación confirmada desde el inicio (0s)
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [shooter1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // Gol en el Período 1 (p1 en cancha)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    // En el Período 2, hay un gol pero la alineación del equipo nunca se confirmó
    const period2 = (await db.matchPeriods.where('match_id').equals(testMatchId).sortBy('number'))[1]!;
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period2.id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 15000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, [], participations);
    const p1 = stats.player_stats.find((p) => p.roster_id === shooter1RosterId)!;

    // Cobertura colectiva del equipo tiene tramos sin confirmar (en 2T)
    expect(p1.team_lineup_coverage).toBe('PARTIAL');
  });

  // 35. verifyAndHealChronology conserva en eventRevisions valores anteriores y nuevos de las posesiones modificadas
  it('35. verifyAndHealChronology conserva en eventRevisions tanto valores anteriores como nuevos de las posesiones modificadas', async () => {
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    // Forzar desajuste cronológico previo: p1 fijada con fin en 50.000 ms e incompleta
    p1.end_clock_ms = 50000;
    p1.is_complete = false;
    await db.possessions.put(p1);

    // Posesión posterior iniciada a los 30.000 ms (generando solapamiento temporal)
    await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      startReason: 'STEAL',
    });

    // Al ejecutarse verifyAndHealChronology, p1 se acota a 30.000 ms y se registra la revisión
    await possessionService.verifyAndHealChronology(testMatchId);

    // Buscar en eventRevisions la auditoría registrada para la posesión p1
    const revisions = await db.eventRevisions.where('event_id').equals(p1.id).toArray();
    expect(revisions.length).toBeGreaterThan(0);

    const rev = revisions[0]!;
    expect(rev.snapshot.entity_type).toBe('possession');
    expect(rev.snapshot.possession_id).toBe(p1.id);
    expect(rev.snapshot.previous_values).toBeDefined();
    expect(rev.snapshot.new_values).toBeDefined();
    expect(rev.snapshot.new_values.end_clock_ms).toBe(30000);
    expect(rev.snapshot.new_values.is_complete).toBe(false);
  });
});


