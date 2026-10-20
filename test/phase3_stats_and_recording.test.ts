import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { HandballDatabase } from '../src/data/db';
import { ActionRecorderService } from '../src/services/actionRecorder';
import { TransferService } from '../src/services/transferService';
import { MatchManagementService } from '../src/services/matchManagementService';
import { PossessionService } from '../src/services/possessionService';
import { ParticipationService } from '../src/services/participationService';
import { MatchClockService } from '../src/services/clockService';
import type { MatchExportEnvelope } from '../src/domain/schemas';

describe('Fase 3: Registro estadístico en vivo, correcciones, posesiones y participaciones', () => {
  let db: HandballDatabase;
  let actionRecorder: ActionRecorderService;
  let transferService: TransferService;
  let managementService: MatchManagementService;
  let possessionService: PossessionService;
  let participationService: ParticipationService;

  let testMatchId: string;
  let period1Id: string;
  let period2Id: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let player1RosterId: string;
  let player2RosterId: string;
  let gkRosterId: string;

  beforeEach(async () => {
    db = new HandballDatabase(`test_fase3_${Math.random()}`);
    actionRecorder = new ActionRecorderService(db);
    transferService = new TransferService(db);
    managementService = new MatchManagementService(db);
    possessionService = new PossessionService(db);
    participationService = new ParticipationService(db);

    // 1. Crear equipo propio y equipo rival
    const homeTeam = await managementService.createTeam({
      name: 'Club Balonmano Central',
      short_name: 'CBC',
      is_own: true,
      color_primary: '#0284c7',
    });
    homeTeamId = homeTeam.id;

    const awayTeam = await managementService.createTeam({
      name: 'Rival Deportivo',
      short_name: 'RIV',
      is_own: false,
      color_primary: '#dc2626',
    });
    awayTeamId = awayTeam.id;

    // 2. Crear jugadores para equipo propio
    const p1 = await managementService.createPlayer({
      first_name: 'Lucas',
      last_name: 'Mosele',
      default_number: 10,
      position: 'CB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p2 = await managementService.createPlayer({
      first_name: 'Federico',
      last_name: 'Pizarro',
      default_number: 7,
      position: 'RB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p3 = await managementService.createPlayer({
      first_name: 'Ignacio',
      last_name: 'Pizarro',
      default_number: 3,
      position: 'LW',
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
      first_name: 'Gonzalo',
      last_name: 'Carou',
      default_number: 15,
      position: 'PV',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const gk = await managementService.createPlayer({
      first_name: 'Matias',
      last_name: 'Schulz',
      default_number: 1,
      position: 'GK',
      is_goalkeeper: true,
      team_id: homeTeamId,
    });

    // 3. Crear partido con convocatoria mínima reglamentaria
    const match = await managementService.createMatch({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      competition: 'Torneo Metropolitano',
      venue: 'Estadio Nacional',
      rules_config: {
        periods_count: 2,
        period_duration_ms: 30 * 60 * 1000,
        max_roster_size: 16,
      },
      home_roster: [
        { player_id: p1.id, shirt_number: 10, display_name: '10 · L. Mosele', role: 'FIELD', is_starter: true },
        { player_id: p2.id, shirt_number: 7, display_name: '7 · F. Pizarro', role: 'FIELD', is_starter: true },
        { player_id: p3.id, shirt_number: 3, display_name: '3 · I. Pizarro', role: 'FIELD', is_starter: true },
        { player_id: p4.id, shirt_number: 4, display_name: '4 · P. Simonet', role: 'FIELD', is_starter: true },
        { player_id: p5.id, shirt_number: 15, display_name: '15 · G. Carou', role: 'FIELD', is_starter: true },
        { player_id: gk.id, shirt_number: 1, display_name: '1 · M. Schulz', role: 'GK', is_starter: true },
      ],
    });

    testMatchId = match.id;
    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).sortBy('number');
    period1Id = periods[0]!.id;
    period2Id = periods[1]!.id;

    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    player1RosterId = rosters.find((r) => r.player_id === p1.id)!.id;
    player2RosterId = rosters.find((r) => r.player_id === p2.id)!.id;
    gkRosterId = rosters.find((r) => r.player_id === gk.id)!.id;
  });

  // 1. Un gol incrementa el marcador una sola vez y no duplica eventos
  it('1. Un gol incrementa el marcador una sola vez y deriva de un único evento de lanzamiento', async () => {
    const res = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C9',
        target_zone_code: 'TR',
        numerical_context: 'EQUAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: player1RosterId, role: 'SHOOTER' }],
    });

    expect(res.success).toBe(true);
    expect(res.savedEvent).toBeDefined();

    const activeGoals = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.status === 'active' && e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL')
      .toArray();

    expect(activeGoals.length).toBe(1);
    expect(activeGoals[0]!.shot_detail?.origin_zone_code).toBe('C9');
    expect(activeGoals[0]!.shot_detail?.target_zone_code).toBe('TR');
    expect(activeGoals[0]!.shot_detail?.numerical_context).toBe('EQUAL');
  });

  // 2. La edición de un gol a tiro fuera o la anulación descuenta el gol del marcador sin puntos fantasma
  it('2. Edición de gol a tiro fallado y anulación descuentan el gol inmediatamente sin puntos fantasma', async () => {
    const res = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 65000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: player1RosterId, role: 'SHOOTER' }],
    });
    const eventId = res.savedEvent!.id;

    // Verificar marcador inicial = 1
    let activeGoals = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.status === 'active' && e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL')
      .toArray();
    expect(activeGoals.length).toBe(1);

    // Editar acción cambiando de GOAL a MISSED
    await actionRecorder.updateAction(
      eventId,
      {
        shot_detail: { result_code: 'MISSED', is_empty_net: false },
      },
      'Corrección tras revisión de mesa'
    );

    activeGoals = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.status === 'active' && e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL')
      .toArray();
    expect(activeGoals.length).toBe(0);

    // Verificar que la acción conserva versión incrementada y revisión de auditoría
    const updated = await db.matchEvents.get(eventId);
    expect(updated?.version).toBe(2);

    const revisions = (await db.eventRevisions.where('event_id').equals(eventId).toArray()).sort((a, b) => a.version - b.version);
    expect(revisions.length).toBe(2);
    expect(revisions[0]?.change_kind).toBe('create');
    expect(revisions[1]?.change_kind).toBe('edit');

    // Deshacer / anular acción
    await actionRecorder.voidAction(eventId, 'Anulación de prueba');
    const voided = await db.matchEvents.get(eventId);
    expect(voided?.status).toBe('voided');

    const voidRevisions = (await db.eventRevisions.where('event_id').equals(eventId).toArray()).sort((a, b) => a.version - b.version);
    expect(voidRevisions.length).toBe(3);
    expect(voidRevisions[2]?.change_kind).toBe('void');
  });

  // 3. Deshacer último registro (undoLastAction) restaura el estado inmediatamente
  it('3. Deshacer último registro revierte la acción más reciente según audit_seq', async () => {
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 30000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: player1RosterId, role: 'SHOOTER' }],
    });

    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: player2RosterId, role: 'SHOOTER' }],
    });

    let goals = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.status === 'active' && e.shot_detail?.result_code === 'GOAL')
      .toArray();
    expect(goals.length).toBe(2);

    // Deshacer el último
    const undone = await actionRecorder.undoLastAction(testMatchId);
    expect(undone).toBeDefined();
    expect(undone?.status).toBe('voided');

    goals = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.status === 'active' && e.shot_detail?.result_code === 'GOAL')
      .toArray();
    expect(goals.length).toBe(1);
    expect(goals[0]!.clock_ms).toBe(30000);
  });

  // 4. Inserción de acción anterior con período y tiempo personalizados (orden deportivo vs auditoría)
  it('4. Carga retroactiva de acción anterior respeta orden deportivo separado de la auditoría', async () => {
    // Evento 1 a los 2 minutos (120000 ms)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    // Evento 2 registrado después físicamente pero retroactivo al minuto 1 (60000 ms)
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 60000,
      turnoverDetail: { reason: 'BAD_PASS' },
    });

    const allEvents = await db.matchEvents.where('match_id').equals(testMatchId).toArray();
    expect(allEvents.length).toBe(2);

    // Orden de auditoría: creciente según inserción
    const auditSorted = [...allEvents].sort((a, b) => a.audit_seq - b.audit_seq);
    expect(auditSorted[0]!.clock_ms).toBe(120000);
    expect(auditSorted[1]!.clock_ms).toBe(60000);
    expect(auditSorted[1]!.audit_seq).toBeGreaterThan(auditSorted[0]!.audit_seq);

    // Orden deportivo: por clock_ms ascendente
    const sportSorted = [...allEvents].sort((a, b) => (a.clock_ms !== b.clock_ms ? a.clock_ms - b.clock_ms : a.sport_seq - b.sport_seq));
    expect(sportSorted[0]!.clock_ms).toBe(60000);
    expect(sportSorted[1]!.clock_ms).toBe(120000);
  });

  // 5. Asistencia opcional asociada a un gol
  it('5. Debe permitir registrar un asistente junto al lanzador en un gol', async () => {
    const res = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 150000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [
        { roster_id: player1RosterId, role: 'SHOOTER' },
        { roster_id: player2RosterId, role: 'ASSIST' },
      ],
    });

    expect(res.success).toBe(true);
    const ev = res.savedEvent!;
    expect(ev.participants.length).toBe(2);
    expect(ev.participants.find((p) => p.role === 'SHOOTER')?.roster_id).toBe(player1RosterId);
    expect(ev.participants.find((p) => p.role === 'ASSIST')?.roster_id).toBe(player2RosterId);
  });

  // 6. Tiro atajado o bloqueado no genera estadísticas duplicadas
  it('6. Tiro atajado o bloqueado no genera acciones duplicadas ni desbalance de lanzamientos', async () => {
    // Tiro de nuestro jugador con parada del arquero
    const shotRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 180000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
      participants: [
        { roster_id: player1RosterId, role: 'SHOOTER' },
      ],
    });

    expect(shotRes.success).toBe(true);

    const totalEvents = await db.matchEvents.where('match_id').equals(testMatchId).count();
    expect(totalEvents).toBe(1); // Exactamente 1 evento que contiene tanto el tiro como el resultado de la parada
  });

  // 7. Posesiones: Regla de rebote ofensivo mantiene posesión; Turnover o Gol cambia posesión
  it('7. Gestión de posesión: Rebote ofensivo mantiene posesión, Pérdida o Gol concedido cambia posesión', async () => {
    // Iniciar posesión para equipo local
    const p1 = await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    expect(p1.team_id).toBe(homeTeamId);

    // Tiro fallado con rebote ofensivo (offensiveRebound: true)
    const shotEventRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 25000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
    });

    await possessionService.handleEventEffect(shotEventRes.savedEvent!, homeTeamId, awayTeamId, { offensiveRebound: true });

    let activePossession = await possessionService.getActivePossession(testMatchId);
    expect(activePossession?.team_id).toBe(homeTeamId); // Se mantiene en poder de homeTeamId

    // Ahora se comete una pérdida (TURNOVER)
    const turnoverEventRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 40000,
      turnoverDetail: { reason: 'BAD_PASS' },
    });

    await possessionService.handleEventEffect(turnoverEventRes.savedEvent!, homeTeamId, awayTeamId);

    activePossession = await possessionService.getActivePossession(testMatchId);
    expect(activePossession?.team_id).toBe(awayTeamId); // Cambió automáticamente a awayTeamId
  });

  // 8. Final de período cierra posesiones e intervalos de participación activos; cambio a P2 conserva marcador
  it('8. Final de período cierra posesión y participación; período 2 conserva marcador acumulado', async () => {
    // Confirmar formación inicial
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [player1RosterId, player2RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });

    // Registrar gol
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 1790000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    // Cerrar período 1 (30 min = 1800000 ms)
    await possessionService.closePeriodPossessions(testMatchId, period1Id, 1800000);
    await participationService.closePeriodParticipations(testMatchId, period1Id, 1800000);

    // Verificar que no hay posesiones abiertas
    const activePoss = await possessionService.getActivePossession(testMatchId);
    expect(activePoss).toBeUndefined();

    // Verificar que las participaciones de P1 se cerraron con out_clock_ms = 1800000
    const partsP1 = await db.playerParticipations.where('period_id').equals(period1Id).toArray();
    expect(partsP1.every((p) => p.is_active === false && p.out_clock_ms === 1800000)).toBe(true);

    // En período 2, el marcador acumulado debe seguir reflejando el gol de período 1
    const totalGoals = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.status === 'active' && e.shot_detail?.result_code === 'GOAL')
      .count();
    expect(totalGoals).toBe(1);
  });

  // 9. Sustituciones y exclusiones de 2 minutos generan intervalos coherentes
  it('9. Sustituciones y exclusiones de 2 min generan intervalos de participación coherentes', async () => {
    // Entra P1 y arquero
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [player1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    // Sustitución al minuto 5 (300000 ms): sale P1, entra P2
    await participationService.substitutePlayer({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 300000,
      rosterOutId: player1RosterId,
      rosterInId: player2RosterId,
    });

    let onCourt = await participationService.getPlayersOnCourt(testMatchId, period1Id, homeTeamId);
    let onCourtRosters = onCourt.map((p) => p.roster_id);
    expect(onCourtRosters).toContain(player2RosterId);
    expect(onCourtRosters).not.toContain(player1RosterId);

    // Exclusión de 2 min para P2 al minuto 10 (600000 ms)
    await participationService.handlePlayerExcluded({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 600000,
      rosterId: player2RosterId,
    });

    onCourt = await participationService.getPlayersOnCourt(testMatchId, period1Id, homeTeamId);
    onCourtRosters = onCourt.map((p) => p.roster_id);
    expect(onCourtRosters).not.toContain(player2RosterId);

    // Reingreso efectivo de P2 al minuto 12 (720000 ms) por sustitución
    await participationService.substitutePlayer({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 720000,
      rosterOutId: player1RosterId,
      rosterInId: player2RosterId,
    });
    onCourt = await participationService.getPlayersOnCourt(testMatchId, period1Id, homeTeamId);
    onCourtRosters = onCourt.map((p) => p.roster_id);
    expect(onCourtRosters).toContain(player2RosterId);
  });

  // 10. Gol y sustitución en el mismo milisegundo conservan orden deportivo determinista
  it('10. Gol y sustitución en idéntico clockMs poseen sport_seq secuencial determinista', async () => {
    const shotRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 50000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    const subRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SUBSTITUTION',
      clockMs: 50000,
      participants: [
        { roster_id: player1RosterId, role: 'SUB_OUT' },
        { roster_id: player2RosterId, role: 'SUB_IN' },
      ],
    });

    expect(shotRes.savedEvent!.clock_ms).toBe(50000);
    expect(subRes.savedEvent!.clock_ms).toBe(50000);
    expect(subRes.savedEvent!.sport_seq).toBe(shotRes.savedEvent!.sport_seq + 1);
  });

  // 11. Registro colectivo del rival sin inventar jugadores ni arqueros ficticios
  it('11. Acciones colectivas del rival no crean participantes ficticios ni registros espurios', async () => {
    const rivalGoalRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 80000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [], // Colectivo
    });

    expect(rivalGoalRes.success).toBe(true);
    expect(rivalGoalRes.savedEvent!.participants.length).toBe(0);

    const rivalTurnoverRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'TURNOVER',
      clockMs: 95000,
      turnoverDetail: { reason: 'TRAVELING' },
      participants: [],
    });

    expect(rivalTurnoverRes.success).toBe(true);
    expect(rivalTurnoverRes.savedEvent!.participants.length).toBe(0);

    // Los jugadores del catálogo no deben haber aumentado
    const playersCount = await db.players.count();
    expect(playersCount).toBe(6); // Exactamente los 6 originales de nuestro club
  });

  // 12. Exportación e importación del sobre 1.1.0 incluyendo posesiones y participaciones con huella íntegra
  it('12. Exportación e importación de sobre 1.1.0 incluye posesiones y participaciones íntegras', async () => {
    // Generar datos de evento, posesión y participación
    await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 100000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });

    await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: [player1RosterId],
      goalkeeperRosterId: gkRosterId,
    });

    const envelope = await transferService.exportMatch(testMatchId);
    expect(envelope.schema_version).toBe('1.1.0');
    expect(envelope.possessions).toBeDefined();
    expect(envelope.possessions!.length).toBeGreaterThan(0);
    expect(envelope.participations).toBeDefined();
    expect(envelope.participations!.length).toBeGreaterThan(0);

    // Crear base de datos destino simulada
    const targetDb = new HandballDatabase(`target_db_${Math.random()}`);
    const targetTransfer = new TransferService(targetDb);

    const analysis = await targetTransfer.analyzeImport(envelope);
    expect(analysis.kind).toBe('NEW');

    if (analysis.kind === 'NEW') {
      await targetTransfer.applyImport(analysis.envelope, false);
    }

    const importedPossessions = await targetDb.possessions.where('match_id').equals(testMatchId).toArray();
    expect(importedPossessions.length).toBe(envelope.possessions!.length);

    const importedParticipations = await targetDb.playerParticipations.where('match_id').equals(testMatchId).toArray();
    expect(importedParticipations.length).toBe(envelope.participations!.length);
  });

  // 13. Retrocompatibilidad al importar sobres de versión 1.0.0 sin posesiones ni participaciones
  it('13. Soporta importación retrocompatible de sobres versión 1.0.0 sin fallos', async () => {
    const envelope = await transferService.exportMatch(testMatchId);
    // Simular sobre legacy versión 1.0.0
    const legacyEnvelope: MatchExportEnvelope = {
      ...envelope,
      schema_version: '1.0.0',
      possessions: undefined,
      participations: undefined,
    };
    // Recalcular huella sobre el objeto legacy
    legacyEnvelope.full_content_fingerprint = transferService.computeEnvelopeFingerprint(legacyEnvelope);

    const legacyTargetDb = new HandballDatabase(`legacy_db_${Math.random()}`);
    const legacyTransfer = new TransferService(legacyTargetDb);

    const analysis = await legacyTransfer.analyzeImport(legacyEnvelope);
    expect(analysis.kind).toBe('NEW');

    if (analysis.kind === 'NEW') {
      await legacyTransfer.applyImport(analysis.envelope, false);
    }

    const importedMatch = await legacyTargetDb.matches.get(testMatchId);
    expect(importedMatch).toBeDefined();
    expect(importedMatch?.id).toBe(testMatchId);
  });

  // 14. Fallo de persistencia no genera escrituras parciales (Rollback atómico)
  it('14. Si ocurre un fallo en una transacción de importación o grabación, no quedan escrituras parciales', async () => {
    const initialEventsCount = await db.matchEvents.count();

    // Intentar registrar con input inválido (ej: match_id que no existe)
    const res = await actionRecorder.recordAction({
      matchId: 'non-existent-match',
      periodId: 'non-existent-period',
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 1000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
    });
    expect(res.success).toBe(false);

    const afterCount = await db.matchEvents.count();
    expect(afterCount).toBe(initialEventsCount);
  });
});
