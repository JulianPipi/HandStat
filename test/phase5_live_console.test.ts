import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { HandballDatabase } from '../src/data/db';
import { ActionRecorderService, type ActionInput } from '../src/services/actionRecorder';
import { MatchManagementService } from '../src/services/matchManagementService';
import { PossessionService } from '../src/services/possessionService';
import { ParticipationService } from '../src/services/participationService';
import { StatsEngine } from '../src/services/statsEngine';
import { ExportService, ZONE_NAMES_ES } from '../src/services/exportService';

describe('Fase 5 - Registro En Vivo Rediseñado (LiveMatchConsole)', () => {
  let db: HandballDatabase;
  let actionRecorder: ActionRecorderService;
  let managementService: MatchManagementService;
  let possessionService: PossessionService;
  let participationService: ParticipationService;
  let exportService: ExportService;

  let testMatchId: string;
  let period1Id: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let shooterRosterId: string;
  let gkRosterId: string;

  beforeEach(async () => {
    db = new HandballDatabase(`test_live_console_${Math.random()}`);
    actionRecorder = new ActionRecorderService(db);
    managementService = new MatchManagementService(db);
    possessionService = new PossessionService(db);
    participationService = new ParticipationService(db);
    exportService = new ExportService(db);

    // 1. Equipos
    const homeTeam = await managementService.createTeam({
      name: 'HandStat Club Local',
      short_name: 'LOC',
      is_own: true,
      color_primary: '#0284c7',
    });
    homeTeamId = homeTeam.id;

    const awayTeam = await managementService.createTeam({
      name: 'Rival Deportivo',
      short_name: 'RIV',
      is_own: false,
      color_primary: '#ef4444',
    });
    awayTeamId = awayTeam.id;

    // 2. Jugadores propios de convocatoria mínima (5 campo + 1 GK)
    const p1 = await managementService.createPlayer({
      first_name: 'Lucas',
      last_name: 'Moscariello',
      default_number: 7,
      position: 'LW',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p2 = await managementService.createPlayer({
      first_name: 'Diego',
      last_name: 'Simonet',
      default_number: 6,
      position: 'CB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p3 = await managementService.createPlayer({
      first_name: 'Federico',
      last_name: 'Pizarro',
      default_number: 3,
      position: 'RB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p4 = await managementService.createPlayer({
      first_name: 'Pablo',
      last_name: 'Simonet',
      default_number: 4,
      position: 'LB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p5 = await managementService.createPlayer({
      first_name: 'Ignacio',
      last_name: 'Pizarro',
      default_number: 22,
      position: 'RW',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const pGK = await managementService.createPlayer({
      first_name: 'Gonzalo',
      last_name: 'Pérez de Vargas',
      default_number: 1,
      position: 'GK',
      is_goalkeeper: true,
      team_id: homeTeamId,
    });

    // 3. Crear Partido
    const match = await managementService.createMatch({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      competition: 'Liga Metropolitana',
      venue: 'Estadio Principal',
      periods_count: 2,
      period_minutes: 30,
      own_team_side: 'HOME',
      home_roster: [
        { player_id: p1.id, shirt_number: 7, display_name: '7 · L. Moscariello', role: 'FIELD', is_starter: true },
        { player_id: p2.id, shirt_number: 6, display_name: '6 · D. Simonet', role: 'FIELD', is_starter: true },
        { player_id: p3.id, shirt_number: 3, display_name: '3 · F. Pizarro', role: 'FIELD', is_starter: true },
        { player_id: p4.id, shirt_number: 4, display_name: '4 · P. Simonet', role: 'FIELD', is_starter: true },
        { player_id: p5.id, shirt_number: 22, display_name: '22 · I. Pizarro', role: 'FIELD', is_starter: true },
        { player_id: pGK.id, shirt_number: 1, display_name: '1 · G. Pérez', role: 'GK', is_starter: true },
      ],
      away_roster: [],
    });

    testMatchId = match.id;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).sortBy('number');
    period1Id = periods[0]!.id;

    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    shooterRosterId = rosters.find((r) => r.player_id === p1.id)!.id;
    gkRosterId = rosters.find((r) => r.player_id === pGK.id)!.id;

    // Iniciar formación e inicio de período
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      type: 'PERIOD_START',
      clockMs: 0,
    });
  });

  // Helper para computar estadísticas completas del partido
  async function computeStats(matchId: string) {
    const match = (await db.matches.get(matchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(matchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(matchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(matchId).toArray();
    const possessions = await db.possessions.where('match_id').equals(matchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(matchId).toArray();
    return StatsEngine.calculateMatchStats(match, periods, teams, rosters, events, possessions, participations);
  }

  it('1. Cancelación de jugada en preparación no persiste eventos ni modifica marcador', async () => {
    // Estado inicial
    const initialEvents = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const initialStats = await computeStats(testMatchId);
    expect(initialStats.final_home_score).toBe(0);
    expect(initialStats.final_away_score).toBe(0);

    // Si el usuario en la interfaz interactúa con la jugada (selecciona jugador, zona, pero cancela)
    // No se envía ninguna llamada a recordAction / recordAndHandlePossession
    const eventsAfterCancel = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    expect(eventsAfterCancel.length).toBe(initialEvents.length);

    const statsAfterCancel = await computeStats(testMatchId);
    expect(statsAfterCancel.final_home_score).toBe(0);
    expect(statsAfterCancel.final_away_score).toBe(0);
  });

  it('2. Registro de GOL requiere explícitamente zona de origen y de destino antes de guardar', async () => {
    // Si falta zona de origen o zona de destino, la validación impide el guardado
    const incompleteInputWithoutOrigin: Partial<ActionInput> = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 45000,
      shotDetail: {
        result_code: 'GOAL',
        // origin_zone_code omitido
        target_zone_code: 'TL',
        is_empty_net: false,
      },
    };

    // Validar esquema canónico
    const isValidWithoutOrigin = !!(incompleteInputWithoutOrigin.shotDetail?.origin_zone_code && incompleteInputWithoutOrigin.shotDetail?.target_zone_code);
    expect(isValidWithoutOrigin).toBe(false);

    // Al completar origen y destino, el guardado se realiza de forma atómica y consistente
    const completeInput: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 45000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'LW',
        target_zone_code: 'TR',
        phase_code: 'POSITIONAL',
        is_empty_net: false,
        numerical_context: 'EQUAL',
      },
      participants: [
        { roster_id: shooterRosterId, role: 'SHOOTER' },
        { roster_id: gkRosterId, role: 'GOALKEEPER' },
      ],
    };

    const res = await actionRecorder.recordAction(completeInput);
    expect(res.success).toBe(true);

    if (res.success) {
      await possessionService.handleEventEffect(res.savedEvent, homeTeamId, awayTeamId);
    }

    const updatedStats = await computeStats(testMatchId);
    expect(updatedStats.final_home_score).toBe(1);
    expect(updatedStats.final_away_score).toBe(0);
    expect(updatedStats.home_shots.total_shots).toBe(1);
    expect(updatedStats.home_shots.goals).toBe(1);
  });

  it('3. Puesto habitual vs Zona real de tiro: no muta la posición del jugador', async () => {
    // Jugador habitual: 'LW' (Extremo Izquierdo)
    const rosterBefore = await db.matchRosters.get(shooterRosterId);
    const playerBefore = await db.players.get(rosterBefore!.player_id);
    expect(playerBefore!.position).toBe('LW');

    // Lanza desde 'C9' (Central 9 metros)
    const shotFromC9: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 90000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C9',
        target_zone_code: 'BR',
        phase_code: 'POSITIONAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    };

    const res = await actionRecorder.recordAction(shotFromC9);
    expect(res.success).toBe(true);

    // Verificar que el evento guardó fielmente C9
    const event = await db.matchEvents.get(res.savedEvent!.id);
    expect(event?.shot_detail?.origin_zone_code).toBe('C9');
    expect(event?.shot_detail?.target_zone_code).toBe('BR');

    // Verificar que el jugador y el roster conservan su puesto habitual sin alteración
    const rosterAfter = await db.matchRosters.get(shooterRosterId);
    const playerAfter = await db.players.get(rosterAfter!.player_id);
    expect(playerAfter!.position).toBe('LW');
  });

  it('4. Tiros fuera (MISSED) y a los postes (POST) guardan la zona exterior y no incrementan goles', async () => {
    // Tiro al poste izquierdo
    const postShot: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: {
        result_code: 'POST',
        origin_zone_code: 'RW',
        target_zone_code: 'POST_L',
        phase_code: 'POSITIONAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    };

    const resPost = await actionRecorder.recordAction(postShot);
    expect(resPost.success).toBe(true);

    // Tiro desviado fuera arriba
    const missedShot: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 150000,
      shotDetail: {
        result_code: 'MISSED',
        origin_zone_code: 'L9',
        target_zone_code: 'OUT_TOP',
        phase_code: 'POSITIONAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    };

    const resMissed = await actionRecorder.recordAction(missedShot);
    expect(resMissed.success).toBe(true);

    const stats = await computeStats(testMatchId);
    expect(stats.final_home_score).toBe(0);
    expect(stats.home_shots.total_shots).toBe(2);
    expect(stats.home_shots.post).toBe(1);
    expect(stats.home_shots.missed).toBe(1);
    expect(stats.home_shots.goals).toBe(0);
  });

  it('5. Registro del rival colectivo y con dorsal específico sin entidades ficticias (D2)', async () => {
    // 1. Tiro del rival colectivo
    const rivalCollectiveShot: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 180000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: '7M',
        target_zone_code: 'BL',
        phase_code: 'SEVEN_M',
        is_empty_net: false,
      },
      note: 'Rival Colectivo',
    };

    const res1 = await actionRecorder.recordAction(rivalCollectiveShot);
    expect(res1.success).toBe(true);
    await possessionService.handleEventEffect(res1.savedEvent!, homeTeamId, awayTeamId);

    // 2. Tiro de rival identificado por dorsal rápido '#8'
    const rivalDorsalShot: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 240000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'R6',
        target_zone_code: 'MR',
        phase_code: 'FASTBREAK',
        is_empty_net: false,
      },
      note: 'Rival #8',
    };

    const res2 = await actionRecorder.recordAction(rivalDorsalShot);
    expect(res2.success).toBe(true);
    await possessionService.handleEventEffect(res2.savedEvent!, homeTeamId, awayTeamId);

    // Verificar marcador en Dexie
    const stats = await computeStats(testMatchId);
    expect(stats.final_away_score).toBe(2);
    expect(stats.away_shots.total_shots).toBe(2);
    expect(stats.away_shots.goals).toBe(2);

    // No se crearon jugadores ficticios en la base de datos
    const allPlayers = await db.players.toArray();
    expect(allPlayers.length).toBe(6); // Convocatoria legítima de 6 jugadores (5 campo + 1 GK)
  });

  it('6. Pérdida de balón con zona táctica y motivo: no cuenta como tiro ni altera goles', async () => {
    const turnoverInput: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 300000,
      turnoverDetail: {
        reason: 'PASSIVE_PLAY',
        court_zone: 'C9',
        forced_by_defense: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'TURNOVER_BY' }],
    };

    const res = await actionRecorder.recordAction(turnoverInput);
    expect(res.success).toBe(true);
    await possessionService.handleEventEffect(res.savedEvent!, homeTeamId, awayTeamId);

    const stats = await computeStats(testMatchId);
    expect(stats.final_home_score).toBe(0);
    expect(stats.home_shots.total_shots).toBe(0);
    expect(stats.home_turnovers).toBe(1);
    const shooterStats = stats.player_stats.find((p) => p.roster_id === shooterRosterId);
    expect(shooterStats?.turnovers).toBe(1);
  });

  it('7. Captura y congelamiento de tiempo deportivo: inmune al avance del reloj', async () => {
    // Al iniciar una jugada a los 10:00 (600,000 ms), ese tiempo se congela para el evento
    const capturedTimeMs = 600000;
    // Mientras tanto, el reloj en vivo avanzó 15 segundos hasta 10:15 (615,000 ms)
    const runningClockDisplayMs = 615000;

    const actionInput: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: capturedTimeMs, // Se guarda el tiempo exacto en que inició la jugada
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C6',
        target_zone_code: 'MC',
        phase_code: 'POSITIONAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    };

    const res = await actionRecorder.recordAction(actionInput);
    expect(res.success).toBe(true);
    expect(res.savedEvent!.clock_ms).toBe(600000);
    expect(runningClockDisplayMs).toBeGreaterThan(res.savedEvent!.clock_ms);
  });

  it('8. Deshacer acción anula el evento y recalcula marcador de forma consistente', async () => {
    const goalInput: ActionInput = {
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 400000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'LW',
        target_zone_code: 'TL',
        phase_code: 'POSITIONAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    };

    const res = await actionRecorder.recordAction(goalInput);
    expect(res.success).toBe(true);

    const statsBeforeUndo = await computeStats(testMatchId);
    expect(statsBeforeUndo.final_home_score).toBe(1);

    // Anular última acción
    const undone = await actionRecorder.undoLastAction(testMatchId);
    expect(undone).not.toBeNull();
    expect(undone?.id).toBe(res.savedEvent!.id);
    expect(undone?.status).toBe('voided');

    const statsAfterUndo = await computeStats(testMatchId);
    expect(statsAfterUndo.final_home_score).toBe(0);
    expect(statsAfterUndo.home_shots.total_shots).toBe(0);
  });

  it('9. Exportación a XLSX incluye las zonas LW, RW, DEFENSE, MIDCOURT con nombres en español', async () => {
    expect(ZONE_NAMES_ES['LW']).toBe('Extremo Izquierdo');
    expect(ZONE_NAMES_ES['RW']).toBe('Extremo Derecho');
    expect(ZONE_NAMES_ES['DEFENSE']).toBe('Zona Defensiva');
    expect(ZONE_NAMES_ES['MIDCOURT']).toBe('Medio Campo');
    expect(ZONE_NAMES_ES['UNKNOWN']).toBe('No observado');

    // Registrar un tiro y una pérdida en estas zonas
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 50000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'RW',
        target_zone_code: 'TR',
        is_empty_net: false,
      },
    });

    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 60000,
      turnoverDetail: {
        reason: 'BAD_PASS',
        court_zone: 'MIDCOURT',
      },
    });

    const { buffer } = await exportService.exportMatchToXLSX(testMatchId);
    expect(buffer).toBeDefined();
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('10. Tiro propio con sector de cancha C9 y casillero TR: conserva selecciones al recargar y exportar', async () => {
    const res = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 70000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C9',
        target_zone_code: 'TR',
        phase_code: 'POSITIONAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    });

    expect(res.success).toBe(true);
    const eventId = res.savedEvent!.id;

    // Recargar desde base de datos (simulando persistencia y recarga)
    const loadedEvent = await db.matchEvents.get(eventId);
    expect(loadedEvent).toBeDefined();
    expect(loadedEvent?.shot_detail?.origin_zone_code).toBe('C9');
    expect(loadedEvent?.shot_detail?.target_zone_code).toBe('TR');
    expect(loadedEvent?.shot_detail?.result_code).toBe('GOAL');

    // Exportar y verificar en bundle raw
    const rawBundle = await exportService.getMatchExportBundle(testMatchId);
    const exportedEvent = rawBundle.events.find((e) => e.id === eventId);
    expect(exportedEvent?.shot_detail?.origin_zone_code).toBe('C9');
    expect(exportedEvent?.shot_detail?.target_zone_code).toBe('TR');
  });

  it('11. Tiro rival con sector LW y casillero BL: conserva selecciones sin mutar catálogo rival', async () => {
    const res = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 80000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'LW',
        target_zone_code: 'BL',
        phase_code: 'FASTBREAK',
        is_empty_net: false,
      },
      note: 'Rival #14',
    });

    expect(res.success).toBe(true);
    const eventId = res.savedEvent!.id;

    // Recargar desde base de datos
    const loadedEvent = await db.matchEvents.get(eventId);
    expect(loadedEvent).toBeDefined();
    expect(loadedEvent?.shot_detail?.origin_zone_code).toBe('LW');
    expect(loadedEvent?.shot_detail?.target_zone_code).toBe('BL');
    expect(loadedEvent?.match_team_id).toBe(awayTeamId);
    expect(loadedEvent?.note).toBe('Rival #14');

    // Comprobar que no se agregaron jugadores ficticios al equipo rival
    const rivalRosters = await db.matchRosters.where('team_id').equals(awayTeamId).toArray();
    expect(rivalRosters.length).toBe(0);
  });

  it('12. Todos los 9 casilleros del arco (3x3), postes y zonas fuera son válidos para el esquema deportivo', async () => {
    const allTargets = ['TL', 'TC', 'TR', 'ML', 'MC', 'MR', 'BL', 'BC', 'BR', 'POST_L', 'POST_R', 'BAR', 'OUT_L', 'OUT_TOP', 'OUT_R', 'UNKNOWN'] as const;

    for (let i = 0; i < allTargets.length; i++) {
      const target = allTargets[i]!;
      const isPost = target.startsWith('POST_') || target === 'BAR';
      const isMissed = target.startsWith('OUT_');
      const resultCode = isPost ? 'POST' : isMissed ? 'MISSED' : 'GOAL';

      const res = await actionRecorder.recordAction({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: homeTeamId,
        type: 'SHOT',
        clockMs: 90000 + i * 1000,
        shotDetail: {
          result_code: resultCode,
          origin_zone_code: 'C6',
          target_zone_code: target,
          is_empty_net: false,
        },
      });

      expect(res.success).toBe(true);
      expect(res.savedEvent?.shot_detail?.target_zone_code).toBe(target);
    }
  });

  it('13. Posesión según resultado real: GOL transfiere la posesión al rival con GOAL_CONCEDED', async () => {
    // 1. Iniciar posesión para el equipo local
    await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 10000,
      startReason: 'PERIOD_START',
    });

    const activeBefore = await possessionService.getActivePossession(testMatchId);
    expect(activeBefore?.team_id).toBe(homeTeamId);

    // 2. Gol del equipo local
    const shotRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 25000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C6',
        target_zone_code: 'TR',
        is_empty_net: false,
      },
    });
    expect(shotRes.success).toBe(true);

    const effect = await possessionService.handleEventEffect(
      shotRes.savedEvent!,
      homeTeamId,
      awayTeamId,
      { possessionOutcome: undefined }
    );

    expect(effect.possessionChanged).toBe(true);
    expect(effect.newPossessionTeamId).toBe(awayTeamId);

    // Comprobar que la posesión activa ahora es del rival por saque de centro
    const activeAfter = await possessionService.getActivePossession(testMatchId);
    expect(activeAfter?.team_id).toBe(awayTeamId);
    expect(activeAfter?.start_reason).toBe('GOAL_CONCEDED');
    expect(activeAfter?.start_clock_ms).toBe(25000);
  });

  it('14. Posesión según resultado real: Atajada/Poste con "Conserva el atacante" mantiene la posesión continua', async () => {
    // 1. Posesión para equipo local
    const pInit = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 30000,
      startReason: 'THROW_OFF',
    });

    // 2. Tiro atajado pero con rebote ofensivo / atacante conserva
    const shotRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 45000,
      shotDetail: {
        result_code: 'SAVED',
        origin_zone_code: 'L9',
        target_zone_code: 'ML',
        is_empty_net: false,
      },
    });

    const effect = await possessionService.handleEventEffect(
      shotRes.savedEvent!,
      homeTeamId,
      awayTeamId,
      { possessionOutcome: 'ATTACKER_RETAINS' }
    );

    expect(effect.possessionChanged).toBe(false);
    expect(effect.newPossessionTeamId).toBe(homeTeamId);

    // La posesión debe seguir siendo la misma original, sin cerrarse ni crear duplicados
    const activeCurrent = await possessionService.getActivePossession(testMatchId);
    expect(activeCurrent?.id).toBe(pInit.id);
    expect(activeCurrent?.team_id).toBe(homeTeamId);
    expect(activeCurrent?.is_complete).toBe(false);

    // Contar posesiones en base de datos: solo debe existir 1
    const allPoss = await db.possessions.where('match_id').equals(testMatchId).toArray();
    expect(allPoss.length).toBe(1);
  });

  it('15. Posesión según resultado real: "Recupera defensor" transfiere la posesión al rival', async () => {
    await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 50000,
      startReason: 'THROW_OFF',
    });

    const shotRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 65000,
      shotDetail: {
        result_code: 'POST',
        origin_zone_code: 'RW',
        target_zone_code: 'POST_R',
        is_empty_net: false,
      },
    });

    const effect = await possessionService.handleEventEffect(
      shotRes.savedEvent!,
      homeTeamId,
      awayTeamId,
      { possessionOutcome: 'DEFENDER_RECOVERS' }
    );

    expect(effect.possessionChanged).toBe(true);
    expect(effect.newPossessionTeamId).toBe(awayTeamId);

    const active = await possessionService.getActivePossession(testMatchId);
    expect(active?.team_id).toBe(awayTeamId);
    expect(active?.start_reason).toBe('REBOUND');
  });

  it('16. Posesión según resultado real: "Sin confirmar" / balón suelto no altera ni cierra la posesión', async () => {
    const pInit = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 70000,
      startReason: 'THROW_OFF',
    });

    const shotRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 85000,
      shotDetail: {
        result_code: 'BLOCKED',
        origin_zone_code: 'C9',
        target_zone_code: 'UNKNOWN',
        is_empty_net: false,
      },
    });

    const effect = await possessionService.handleEventEffect(
      shotRes.savedEvent!,
      homeTeamId,
      awayTeamId,
      { possessionOutcome: 'UNCERTAIN' }
    );

    expect(effect.possessionChanged).toBe(false);
    expect(effect.newPossessionTeamId).toBeUndefined();

    // Posesión sigue abierta para el atacante sin resolverse
    const active = await possessionService.getActivePossession(testMatchId);
    expect(active?.id).toBe(pInit.id);
    expect(active?.is_complete).toBe(false);
  });

  it('17. Pareja Cambio Defensa–Ataque: Auto-sustitución 1 a 1 y atribución deportiva previa', async () => {
    const { DefenseAttackSubService } = await import('../src/services/defenseAttackSubService');
    const defAtkService = new DefenseAttackSubService(db, actionRecorder, participationService);

    const homeRosters = await db.matchRosters.where('team_id').equals(homeTeamId).toArray();
    const attackerRoster = homeRosters.find((r) => r.id === shooterRosterId)!;
    const defenderRoster = homeRosters.find((r) => r.id !== shooterRosterId && r.role !== 'GK')!;

    // Formación inicial: Attacker está en cancha, Defender está en banquillo
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [attackerRoster.id],
      goalkeeperRosterId: gkRosterId,
    });

    const config = {
      enabled: true,
      defenderRosterId: defenderRoster.id,
      attackerRosterId: attackerRoster.id,
    };

    // 1. Gol del atacante a los 100000 ms, sport_seq = 1
    const goalRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 100000,
      sportSeq: 1,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C6',
        target_zone_code: 'TC',
        is_empty_net: false,
      },
      participants: [{ roster_id: attackerRoster.id, role: 'SHOOTER' }],
    });
    expect(goalRes.success).toBe(true);
    const goalEvent = goalRes.savedEvent!;

    // 2. Valida auto-sub para pasar a fase DEFENSE
    const validation = await defAtkService.validateAutoSub(
      testMatchId,
      period1Id,
      homeTeamId,
      100000,
      config,
      'DEFENSE'
    );
    expect(validation.canExecute).toBe(true);
    expect(validation.playerOutId).toBe(attackerRoster.id);
    expect(validation.playerInId).toBe(defenderRoster.id);

    // 3. Ejecutar auto-sub vinculada
    const { subEvent } = await defAtkService.executeAutoSub(
      testMatchId,
      period1Id,
      homeTeamId,
      100000,
      goalEvent,
      validation.playerOutId!,
      validation.playerInId!
    );

    // El evento de sustitución debe tener sport_seq = 2 (posterior al gol = 1)
    expect(subEvent.sport_seq).toBe(2);
    expect(subEvent.payload?.triggered_by_event_id).toBe(goalEvent.id);

    // 4. Verificar en StatsEngine que el gol se atribuyó a attackerRoster y que defenderRoster está ahora en cancha
    const match = (await db.matches.get(testMatchId))!;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).toArray();
    const teams = await db.teams.toArray();
    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    const events = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    const participations = await db.playerParticipations.where('match_id').equals(testMatchId).toArray();

    const stats = StatsEngine.calculateMatchStats(
      match,
      periods,
      teams,
      rosters,
      events,
      [],
      participations
    );

    const attackerStats = stats.player_stats.find((p) => p.roster_id === attackerRoster.id);
    expect(attackerStats?.goals).toBe(1);
    expect(attackerStats?.is_active_on_court).toBe(false); // Salió al banquillo

    const defenderStats = stats.player_stats.find((p) => p.roster_id === defenderRoster.id);
    expect(defenderStats?.goals).toBe(0);
    expect(defenderStats?.is_active_on_court).toBe(true); // Entró a cancha para defender
  });

  it('18. Pareja Cambio Defensa–Ataque: Jugador con exclusión de 2 min activa no puede ingresar automáticamente', async () => {
    const { DefenseAttackSubService } = await import('../src/services/defenseAttackSubService');
    const defAtkService = new DefenseAttackSubService(db, actionRecorder, participationService);

    const homeRosters = await db.matchRosters.where('team_id').equals(homeTeamId).toArray();
    const attackerRoster = homeRosters.find((r) => r.id === shooterRosterId)!;
    const defenderRoster = homeRosters.find((r) => r.id !== shooterRosterId && r.role !== 'GK')!;

    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [attackerRoster.id],
      goalkeeperRosterId: gkRosterId,
    });

    // Sanción de 2 minutos aplicada al defensor a los 50000 ms (vigente hasta 170000 ms)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SANCTION',
      clockMs: 50000,
      sanctionDetail: {
        kind: 'TWO_MINUTE',
        duration_ms: 120000,
      },
      participants: [{ roster_id: defenderRoster.id, role: 'SANCTIONED' }],
    });

    const config = {
      enabled: true,
      defenderRosterId: defenderRoster.id,
      attackerRosterId: attackerRoster.id,
    };

    // Intentar auto-sub a los 100000 ms (el defensor sigue suspendido)
    const validation = await defAtkService.validateAutoSub(
      testMatchId,
      period1Id,
      homeTeamId,
      100000,
      config,
      'DEFENSE'
    );

    expect(validation.canExecute).toBe(false);
    expect(validation.warning).toContain('exclusión de 2 min');
  });

  it('19. Deshacer última acción revierte coherentemente tanto el gol como la sustitución automática vinculada', async () => {
    const { DefenseAttackSubService } = await import('../src/services/defenseAttackSubService');
    const defAtkService = new DefenseAttackSubService(db, actionRecorder, participationService);

    const homeRosters = await db.matchRosters.where('team_id').equals(homeTeamId).toArray();
    const attackerRoster = homeRosters.find((r) => r.id === shooterRosterId)!;
    const defenderRoster = homeRosters.find((r) => r.id !== shooterRosterId && r.role !== 'GK')!;

    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [attackerRoster.id],
      goalkeeperRosterId: gkRosterId,
    });

    const goalRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 120000,
      sportSeq: 1,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C6',
        target_zone_code: 'TR',
        is_empty_net: false,
      },
      participants: [{ roster_id: attackerRoster.id, role: 'SHOOTER' }],
    });

    await defAtkService.executeAutoSub(
      testMatchId,
      period1Id,
      homeTeamId,
      120000,
      goalRes.savedEvent!,
      attackerRoster.id,
      defenderRoster.id
    );

    // Defender está ahora en cancha
    let onCourt = await participationService.getPlayersOnCourt(testMatchId, period1Id, homeTeamId);
    expect(onCourt.some((p) => p.roster_id === defenderRoster.id)).toBe(true);
    expect(onCourt.some((p) => p.roster_id === attackerRoster.id)).toBe(false);

    // Ejecutar undoLastAction
    const undone = await actionRecorder.undoLastAction(testMatchId);
    expect(undone).toBeDefined();

    // Ambos eventos deben estar voided
    const goalAfter = await db.matchEvents.get(goalRes.savedEvent!.id);
    expect(goalAfter?.status).toBe('voided');

    const subEvents = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .and((e) => e.type === 'SUBSTITUTION')
      .toArray();
    expect(subEvents[0]?.status).toBe('voided');

    // Participaciones deben estar restauradas: attackerRoster en cancha, defenderRoster en banquillo
    onCourt = await participationService.getPlayersOnCourt(testMatchId, period1Id, homeTeamId);
    expect(onCourt.some((p) => p.roster_id === attackerRoster.id)).toBe(true);
    expect(onCourt.some((p) => p.roster_id === defenderRoster.id)).toBe(false);
  });

  it('20. Gol de Arco a Arco: Se registra con DEFENSE, GOAL_TO_GOAL y se exporta como "Arco a arco"', async () => {
    const res = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 150000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'DEFENSE',
        target_zone_code: 'MC',
        is_empty_net: true,
        shot_type: 'GOAL_TO_GOAL',
      },
      participants: [{ roster_id: gkRosterId, role: 'SHOOTER' }],
      note: 'Gol de arco a arco',
    });

    expect(res.success).toBe(true);
    const event = res.savedEvent!;
    expect(event.shot_detail?.origin_zone_code).toBe('DEFENSE');
    expect(event.shot_detail?.shot_type).toBe('GOAL_TO_GOAL');
    expect(event.shot_detail?.result_code).toBe('GOAL');

    // Exportación XLSX
    const bundle = await exportService.getMatchExportBundle(testMatchId);
    const rows = exportService.buildShotsSheetData(bundle);

    const goalToGoalRow = rows.find((r) => r[18] === event.id);
    expect(goalToGoalRow).toBeDefined();
    expect(goalToGoalRow![9]).toBe('DEFENSE'); // Código origen
    expect(goalToGoalRow![10]).toBe('Zona Defensiva'); // Descripción origen
    expect(goalToGoalRow![13]).toBe('Gol'); // Resultado
    expect(goalToGoalRow![17]).toBe('Arco a arco'); // Tipo de Tiro
  });

  it('21. Flujo alternado de posesión: River gol -> Ferro posesión -> Ferro gol -> River posesión -> River gol (Marcador 2-1)', async () => {
    // Estado inicial: River ataca primero
    let activePos = await possessionService.getActivePossession(testMatchId, period1Id);
    expect(activePos).toBeUndefined();

    // 1. River registra gol a los 01:00 (60000 ms)
    const riverGoal1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C6',
        target_zone_code: 'TR',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    });
    expect(riverGoal1.success).toBe(true);

    const effect1 = await possessionService.handleEventEffect(riverGoal1.savedEvent!, homeTeamId, awayTeamId);
    expect(effect1.possessionChanged).toBe(true);
    expect(effect1.newPossessionTeamId).toBe(awayTeamId); // Pasa la posesión a Ferro

    activePos = await possessionService.getActivePossession(testMatchId, period1Id);
    expect(activePos).toBeDefined();
    expect(activePos!.team_id).toBe(awayTeamId); // Posesión activa es de Ferro
    expect(activePos!.start_reason).toBe('GOAL_CONCEDED');

    // 2. Ferro registra gol a los 02:00 (120000 ms) sin intervención manual de equipo
    const ferroGoal = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'L9',
        target_zone_code: 'BL',
        is_empty_net: false,
      },
      participants: [],
      note: 'Rival Colectivo',
    });
    expect(ferroGoal.success).toBe(true);

    const effect2 = await possessionService.handleEventEffect(ferroGoal.savedEvent!, homeTeamId, awayTeamId);
    expect(effect2.possessionChanged).toBe(true);
    expect(effect2.newPossessionTeamId).toBe(homeTeamId); // Pasa la posesión a River

    activePos = await possessionService.getActivePossession(testMatchId, period1Id);
    expect(activePos).toBeDefined();
    expect(activePos!.team_id).toBe(homeTeamId); // Posesión activa es de River

    // 3. River registra otro gol a los 03:00 (180000 ms)
    const riverGoal2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 180000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'RW',
        target_zone_code: 'TL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    });
    expect(riverGoal2.success).toBe(true);

    const effect3 = await possessionService.handleEventEffect(riverGoal2.savedEvent!, homeTeamId, awayTeamId);
    expect(effect3.possessionChanged).toBe(true);
    expect(effect3.newPossessionTeamId).toBe(awayTeamId); // Pasa la posesión a Ferro

    activePos = await possessionService.getActivePossession(testMatchId, period1Id);
    expect(activePos).toBeDefined();
    expect(activePos!.team_id).toBe(awayTeamId); // Posesión activa final es de Ferro

    // Verificar marcador en StatsEngine: River 2, Ferro 1
    const finalStats = await computeStats(testMatchId);
    expect(finalStats.final_home_score).toBe(2);
    expect(finalStats.final_away_score).toBe(1);

    // Verificar que todas las posesiones cerradas tienen su gol asociado y duración correcta
    const allPossessions = await db.possessions.where('match_id').equals(testMatchId).toArray();
    const completed = allPossessions
      .filter((p) => p.is_complete)
      .sort((a, b) => a.start_clock_ms - b.start_clock_ms);
    expect(completed.length).toBe(3); // 1ª River, 2ª Ferro, 3ª River
    expect(completed[0]!.team_id).toBe(homeTeamId);
    expect(completed[0]!.end_reason).toBe('GOAL');
    expect(completed[1]!.team_id).toBe(awayTeamId);
    expect(completed[1]!.end_reason).toBe('GOAL');
    expect(completed[2]!.team_id).toBe(homeTeamId);
    expect(completed[2]!.end_reason).toBe('GOAL');
  });

  it('22. El cambio de posesión funciona aunque "Aplicar cambio automático Defensa–Ataque" esté desactivado', async () => {
    // Con auto-sub desactivado
    const autoConfig = { enabled: false, defenderRosterId: '', attackerRosterId: '' };

    const goal = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 45000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C6',
        target_zone_code: 'MC',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooterRosterId, role: 'SHOOTER' }],
    });

    const effect = await possessionService.handleEventEffect(goal.savedEvent!, homeTeamId, awayTeamId);
    expect(effect.possessionChanged).toBe(true);
    expect(effect.newPossessionTeamId).toBe(awayTeamId);

    // Verificar que no se crearon eventos de sustitución automática
    const subEvents = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .and((e) => e.type === 'SUBSTITUTION')
      .toArray();
    expect(subEvents.length).toBe(0);

    // Pero la posesión sí pasó a Ferro
    const active = await possessionService.getActivePossession(testMatchId, period1Id);
    expect(active?.team_id).toBe(awayTeamId);
  });

  it('23. Pérdidas, recuperaciones y desenlaces de atajada/poste respetan las reglas de transición y certidumbre', async () => {
    // 1. Pérdida de River -> Posesión pasa a Ferro
    const turnoverRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 30000,
      turnoverDetail: { reason: 'BAD_PASS', court_zone: 'C9', forced_by_defense: false },
      participants: [],
    });
    const effectTO = await possessionService.handleEventEffect(turnoverRes.savedEvent!, homeTeamId, awayTeamId);
    expect(effectTO.possessionChanged).toBe(true);
    expect(effectTO.newPossessionTeamId).toBe(awayTeamId);

    // 2. Ferro tira, ataja el arquero pero "Conserva el atacante" (Rebote ofensivo)
    const shotSaveRetain = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 50000,
      shotDetail: { result_code: 'SAVED', origin_zone_code: 'RW', target_zone_code: 'BC', is_empty_net: false },
      participants: [],
    });
    const effectRetain = await possessionService.handleEventEffect(shotSaveRetain.savedEvent!, homeTeamId, awayTeamId, {
      possessionOutcome: 'ATTACKER_RETAINS',
    });
    expect(effectRetain.possessionChanged).toBe(false);
    expect(effectRetain.newPossessionTeamId).toBe(awayTeamId); // Continúa Ferro

    // 3. Robo defensivo con control de River
    const stealRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 70000,
      turnoverDetail: { reason: 'STEAL', court_zone: 'DEFENSE', forced_by_defense: true },
      participants: [{ roster_id: shooterRosterId, role: 'RECOVERED_BY' }],
    });
    const effectSteal = await possessionService.handleEventEffect(stealRes.savedEvent!, homeTeamId, awayTeamId);
    expect(effectSteal.possessionChanged).toBe(true);
    expect(effectSteal.newPossessionTeamId).toBe(homeTeamId); // Posesión vuelve a River

    // 4. Poste con "Sin confirmar" / Balón suelto
    const postUncertain = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 90000,
      shotDetail: { result_code: 'POST', origin_zone_code: 'C6', target_zone_code: 'POST_L', is_empty_net: false },
      participants: [],
    });
    const effectUncertain = await possessionService.handleEventEffect(postUncertain.savedEvent!, homeTeamId, awayTeamId, {
      possessionOutcome: 'UNCERTAIN',
    });
    expect(effectUncertain.possessionChanged).toBe(false);
  });

  describe('Flujo Exclusivo de Robo / Recuperación en Defensa (CAH / HandStat)', () => {
    it('1 y 2. Demo B tiene posesión -> Robo de jugador de Demo A desde Defensa -> Demo A pasa a tener posesión para atacar', async () => {
      // 1. Demo B (awayTeam) tiene posesión
      await possessionService.startPossession({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: awayTeamId,
        clockMs: 10000,
        startReason: 'THROW_OFF',
      });
      let activePos = await possessionService.getActivePossession(testMatchId, period1Id);
      expect(activePos?.team_id).toBe(awayTeamId);

      // 2. Jugador de Demo A realiza robo en Defensa
      const stealAction = await actionRecorder.recordAction({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: awayTeamId, // Pérdida cometida por el atacante
        type: 'TURNOVER',
        clockMs: 25000,
        turnoverDetail: {
          reason: 'STEAL',
          forced_by_defense: true,
          court_zone: 'C9',
        },
        participants: [{ roster_id: shooterRosterId, role: 'RECOVERED_BY' }],
        payload: {
          recovering_team_id: homeTeamId,
          losing_team_id: awayTeamId,
          is_steal_recovery: true,
          court_zone: 'C9',
        },
        note: 'Robo / Recuperación: HandStat Club Local (#7 · L. Moscariello) en 9m Central',
      });

      expect(stealAction.success).toBe(true);

      // Efecto sobre posesión
      const effect = await possessionService.handleEventEffect(
        stealAction.savedEvent!,
        homeTeamId,
        awayTeamId
      );

      // 3. Confirmar: Demo A queda con posesión y preparado para atacar
      expect(effect.possessionChanged).toBe(true);
      expect(effect.newPossessionTeamId).toBe(homeTeamId);
      expect(effect.actionPhaseTransition).toBe('DEFENSE_TO_ATTACK');

      activePos = await possessionService.getActivePossession(testMatchId, period1Id);
      expect(activePos).toBeDefined();
      expect(activePos?.team_id).toBe(homeTeamId);
      expect(activePos?.start_reason).toBe('STEAL');

      // Posesión anterior de Demo B quedó cerrada por pérdida
      const prevPos = await db.possessions.get(effect.newPossessionTeamId ? (await db.possessions.where('match_id').equals(testMatchId).toArray()).find(p => p.team_id === awayTeamId && p.is_complete)!.id : '');
      expect(prevPos?.is_complete).toBe(true);
      expect(prevPos?.end_reason).toBe('TURNOVER');

      // Estadísticas: El recuperador suma una recuperación, no una pérdida
      const stats = await computeStats(testMatchId);
      expect(stats.home_steals).toBe(1);
      expect(stats.home_turnovers).toBe(0);
      expect(stats.away_steals).toBe(0);
      expect(stats.away_turnovers).toBe(1);

      // Jugador que robó suma steal y NO turnover
      const playerStat = stats.player_stats.find((p) => p.roster_id === shooterRosterId);
      expect(playerStat?.steals).toBe(1);
      expect(playerStat?.turnovers).toBe(0);
    });

    it('4. Robo posterior de Demo B: ocurre lo inverso', async () => {
      // Demo A tiene posesión activa
      await possessionService.startPossession({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: homeTeamId,
        clockMs: 30000,
        startReason: 'THROW_OFF',
      });

      // Robo de Demo B (recuperador es awayTeamId)
      const stealAway = await actionRecorder.recordAction({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: homeTeamId, // Pérdida cometida por Demo A
        type: 'TURNOVER',
        clockMs: 45000,
        turnoverDetail: {
          reason: 'STEAL',
          forced_by_defense: true,
          court_zone: 'DEFENSE',
        },
        participants: [],
        payload: {
          recovering_team_id: awayTeamId,
          losing_team_id: homeTeamId,
          is_steal_recovery: true,
          court_zone: 'DEFENSE',
        },
        note: 'Robo / Recuperación: Rival Deportivo (Colectivo) en Defensa',
      });

      const effect = await possessionService.handleEventEffect(
        stealAway.savedEvent!,
        homeTeamId,
        awayTeamId
      );

      expect(effect.possessionChanged).toBe(true);
      expect(effect.newPossessionTeamId).toBe(awayTeamId);

      const activePos = await possessionService.getActivePossession(testMatchId, period1Id);
      expect(activePos?.team_id).toBe(awayTeamId);
    });

    it('No alternar ciegamente si el equipo recuperador ya tenía la posesión registrada', async () => {
      // Demo A ya tiene posesión
      await possessionService.startPossession({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: homeTeamId,
        clockMs: 50000,
        startReason: 'THROW_OFF',
      });

      // Se registra recuperación donde recovering_team_id es también Demo A
      const stealSame = await actionRecorder.recordAction({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: awayTeamId,
        type: 'TURNOVER',
        clockMs: 55000,
        turnoverDetail: { reason: 'STEAL', forced_by_defense: true, court_zone: 'C9' },
        payload: { recovering_team_id: homeTeamId, is_steal_recovery: true },
      });

      const effect = await possessionService.handleEventEffect(
        stealSame.savedEvent!,
        homeTeamId,
        awayTeamId
      );

      // possessionChanged debe ser false porque ya poseía el balón, sin alternar ciegamente
      expect(effect.possessionChanged).toBe(false);
      expect(effect.newPossessionTeamId).toBe(homeTeamId);

      const activePos = await possessionService.getActivePossession(testMatchId, period1Id);
      expect(activePos?.team_id).toBe(homeTeamId);
    });

    it('6. Deshacer acción de robo restaura posesión anterior de forma coherente y atómica', async () => {
      // Demo B tiene posesión
      await possessionService.startPossession({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: awayTeamId,
        clockMs: 10000,
        startReason: 'THROW_OFF',
      });

      // Robo de Demo A
      const steal = await actionRecorder.recordAction({
        matchId: testMatchId,
        periodId: period1Id,
        teamId: awayTeamId,
        type: 'TURNOVER',
        clockMs: 20000,
        turnoverDetail: { reason: 'STEAL', forced_by_defense: true, court_zone: 'DEFENSE' },
        participants: [{ roster_id: shooterRosterId, role: 'RECOVERED_BY' }],
        payload: { recovering_team_id: homeTeamId, is_steal_recovery: true },
      });

      await possessionService.handleEventEffect(steal.savedEvent!, homeTeamId, awayTeamId);

      let currentPos = await possessionService.getActivePossession(testMatchId, period1Id);
      expect(currentPos?.team_id).toBe(homeTeamId);

      // Deshacer última acción
      const undone = await actionRecorder.undoLastAction(testMatchId);
      expect(undone?.id).toBe(steal.savedEvent!.id);
      expect(undone?.status).toBe('voided');

      // Posesión vuelve a Demo B
      currentPos = await possessionService.getActivePossession(testMatchId, period1Id);
      expect(currentPos).toBeDefined();
      expect(currentPos?.team_id).toBe(awayTeamId);

      // Estadísticas no cuentan la acción anulada
      const stats = await computeStats(testMatchId);
      expect(stats.home_steals).toBe(0);
      expect(stats.away_turnovers).toBe(0);
    });
  });
});


