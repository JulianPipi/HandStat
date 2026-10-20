import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { HandballDatabase } from '../src/data/db';
import { MatchManagementService, type CreateMatchInput } from '../src/services/matchManagementService';
import { ActionRecorderService } from '../src/services/actionRecorder';
import { TransferService } from '../src/services/transferService';
import { seedInitialDataIfEmpty } from '../src/data/seedData';

describe('Fase 2: Suite de Gestión de Equipos, Jugadores y Partidos', () => {
  let db: HandballDatabase;
  let management: MatchManagementService;
  let recorder: ActionRecorderService;
  let transfer: TransferService;

  beforeEach(async () => {
    const dbName = `test_phase2_${Math.random()}`;
    db = new HandballDatabase(dbName);
    await seedInitialDataIfEmpty(db);
    management = new MatchManagementService(db);
    recorder = new ActionRecorderService(db);
    transfer = new TransferService(db);
  });

  // 1. Gestión de Equipos: Crear, Editar, Archivar
  it('1. Debe permitir crear, editar y archivar equipos distinguiendo propio y rival', async () => {
    const ownTeam = await management.createTeam({
      name: 'SAG Villa Ballester',
      short_name: 'SAG',
      is_own: true,
      color_primary: '#dc2626',
    });
    expect(ownTeam.id).toBeDefined();
    expect(ownTeam.is_own).toBe(true);
    expect(ownTeam.archived).toBe(false);

    const rivalTeam = await management.createTeam({
      name: 'Colegio Ward',
      short_name: 'WAR',
      is_own: false,
      color_primary: '#16a34a',
    });
    expect(rivalTeam.is_own).toBe(false);

    // Editar
    const updatedTeam = await management.updateTeam(ownTeam.id, {
      name: 'SAGV Ballester Senior',
    });
    expect(updatedTeam.name).toBe('SAGV Ballester Senior');

    // Archivar
    await management.archiveTeam(rivalTeam.id, true);
    const archivedRival = await db.teams.get(rivalTeam.id);
    expect(archivedRival?.archived).toBe(true);
  });

  // 2. Gestión de Jugadores: Crear, Editar, Identificar Porteros y Archivar
  it('2. Debe permitir crear jugadores con dorsal, posición, identificar porteros y archivarlos', async () => {
    const playerGk = await management.createPlayer({
      first_name: 'Gonzalo',
      last_name: 'Pérez de Vargas',
      default_number: 1,
      position: 'GK',
      is_goalkeeper: true,
    });
    expect(playerGk.is_goalkeeper).toBe(true);
    expect(playerGk.position).toBe('GK');
    expect(playerGk.archived).toBe(false);

    const playerField = await management.createPlayer({
      first_name: 'Diego',
      last_name: 'Simonet',
      default_number: 6,
      position: 'CB',
    });
    expect(playerField.is_goalkeeper).toBe(false);

    // Editar
    await management.updatePlayer(playerField.id, {
      default_number: 8,
    });
    const updatedField = await db.players.get(playerField.id);
    expect(updatedField?.default_number).toBe(8);

    // Archivar sin eliminar
    await management.archivePlayer(playerGk.id, true);
    const archivedGk = await db.players.get(playerGk.id);
    expect(archivedGk?.archived).toBe(true);
  });

  // 3. Creación de Partido con Convocatoria, Períodos y Validación de Límite Configurable
  it('3. Debe crear partido con períodos y validar límite de convocatoria configurable', async () => {
    const home = await management.createTeam({ name: 'Equipo Local', short_name: 'LOC', is_own: true });
    const away = await management.createTeam({ name: 'Equipo Rival', short_name: 'RIV', is_own: false });

    const gk = await management.createPlayer({ first_name: 'Portero 1', default_number: 1, position: 'GK', is_goalkeeper: true });
    const p1 = await management.createPlayer({ first_name: 'Jugador 1', default_number: 2, position: 'LW' });
    const p2 = await management.createPlayer({ first_name: 'Jugador 2', default_number: 3, position: 'LB' });
    const p3 = await management.createPlayer({ first_name: 'Jugador 3', default_number: 4, position: 'CB' });
    const p4 = await management.createPlayer({ first_name: 'Jugador 4', default_number: 5, position: 'RB' });
    const p5 = await management.createPlayer({ first_name: 'Jugador 5', default_number: 6, position: 'RW' });

    const matchInput: CreateMatchInput = {
      home_team_id: home.id,
      away_team_id: away.id,
      competition: 'Torneo Apertura 2026',
      venue: 'Estadio Polideportivo',
      rules_config: {
        periods_count: 2,
        period_duration_ms: 1500000, // 25 min (Categoría Juvenil)
        max_roster_size: 14,
      },
      home_roster: [
        { player_id: gk.id, shirt_number: 1, display_name: '1 · Portero 1', role: 'GK', is_starter: true },
        { player_id: p1.id, shirt_number: 2, display_name: '2 · Jugador 1', role: 'FIELD', is_starter: true },
        { player_id: p2.id, shirt_number: 3, display_name: '3 · Jugador 2', role: 'FIELD', is_starter: true },
        { player_id: p3.id, shirt_number: 4, display_name: '3 · Jugador 3', role: 'FIELD', is_starter: true },
        { player_id: p4.id, shirt_number: 5, display_name: '4 · Jugador 4', role: 'FIELD', is_starter: true },
        { player_id: p5.id, shirt_number: 6, display_name: '5 · Jugador 5', role: 'FIELD', is_starter: true },
      ],
      // Rival colectivo sin roster específico
    };

    const match = await management.createMatch(matchInput);
    expect(match.id).toBeDefined();
    expect(match.rules_config.max_roster_size).toBe(14);
    expect(match.rules_config.period_duration_ms).toBe(1500000);
    expect(match.competition).toBe('Torneo Apertura 2026');
    expect(match.home_team_name_snapshot).toBe('Equipo Local');
    expect(match.away_team_name_snapshot).toBe('Equipo Rival');

    // Comprobar períodos creados
    const periods = await db.matchPeriods.where('match_id').equals(match.id).toArray();
    expect(periods.length).toBe(2);
    expect(periods[0]?.duration_ms).toBe(1500000);

    // Comprobar convocatoria creada: los 6 locales (1 arquero + 5 de campo; rival colectivo sin inventos)
    const rosters = await db.matchRosters.where('match_id').equals(match.id).toArray();
    expect(rosters.length).toBe(6);
    const awayRosters = rosters.filter((r) => r.team_id === away.id);
    expect(awayRosters.length).toBe(0); // Sin jugadores inventados
  });

  // 4. Validación: Rechazar dorsales duplicados y jugadores duplicados en la convocatoria
  it('4. Debe rechazar dorsales duplicados y jugadores duplicados en una misma convocatoria', async () => {
    const home = await management.createTeam({ name: 'Local A', short_name: 'LCA', is_own: true });
    const away = await management.createTeam({ name: 'Rival B', short_name: 'RVB', is_own: false });
    const p1 = await management.createPlayer({ first_name: 'Juan', default_number: 5 });

    // Dorsal repetido
    const duplicateNumberInput: CreateMatchInput = {
      home_team_id: home.id,
      away_team_id: away.id,
      home_roster: [
        { player_id: p1.id, shirt_number: 10, display_name: '10 · Juan', role: 'FIELD', is_starter: true },
        { shirt_number: 10, display_name: '10 · Pedro', role: 'FIELD', is_starter: false },
      ],
    };

    await expect(management.createMatch(duplicateNumberInput)).rejects.toThrow(
      'Dorsal repetido #10'
    );

    // Mismo jugador dos veces con diferente dorsal
    const duplicatePlayerInput: CreateMatchInput = {
      home_team_id: home.id,
      away_team_id: away.id,
      home_roster: [
        { player_id: p1.id, shirt_number: 10, display_name: '10 · Juan', role: 'FIELD', is_starter: true },
        { player_id: p1.id, shirt_number: 11, display_name: '11 · Juan Bis', role: 'FIELD', is_starter: false },
      ],
    };

    await expect(management.createMatch(duplicatePlayerInput)).rejects.toThrow(
      'Jugador duplicado en la convocatoria'
    );

    // Mismo equipo como local y visitante
    const sameTeamInput: CreateMatchInput = {
      home_team_id: home.id,
      away_team_id: home.id,
      home_roster: [
        { player_id: p1.id, shirt_number: 10, display_name: '10 · Juan', role: 'FIELD', is_starter: true },
      ],
    };

    await expect(management.createMatch(sameTeamInput)).rejects.toThrow(
      'El equipo local y visitante no pueden ser el mismo'
    );
  });

  // 5. Inmutabilidad Histórica: Modificar un equipo o jugador en el catálogo NO altera partidos anteriores
  it('5. Debe preservar snapshots históricos al editar datos de catálogo de equipos o jugadores', async () => {
    const team = await management.createTeam({ name: 'Nombre Original', short_name: 'ORI', is_own: true });
    const rival = await management.createTeam({ name: 'Rival C', short_name: 'RVC', is_own: false });
    const gk = await management.createPlayer({ first_name: 'Arquero', default_number: 1, position: 'GK', is_goalkeeper: true });
    const p1 = await management.createPlayer({ first_name: 'Matías', last_name: 'Original', default_number: 7 });
    const p2 = await management.createPlayer({ first_name: 'Jugador 2', default_number: 8 });
    const p3 = await management.createPlayer({ first_name: 'Jugador 3', default_number: 9 });
    const p4 = await management.createPlayer({ first_name: 'Jugador 4', default_number: 10 });
    const p5 = await management.createPlayer({ first_name: 'Jugador 5', default_number: 11 });

    const match = await management.createMatch({
      home_team_id: team.id,
      away_team_id: rival.id,
      home_roster: [
        { player_id: gk.id, shirt_number: 1, display_name: '1 · Arquero', role: 'GK', is_starter: true },
        { player_id: p1.id, shirt_number: 7, display_name: '7 · M. Original', role: 'FIELD', is_starter: true },
        { player_id: p2.id, shirt_number: 8, display_name: '8 · Jugador 2', role: 'FIELD', is_starter: true },
        { player_id: p3.id, shirt_number: 9, display_name: '9 · Jugador 3', role: 'FIELD', is_starter: true },
        { player_id: p4.id, shirt_number: 10, display_name: '10 · Jugador 4', role: 'FIELD', is_starter: true },
        { player_id: p5.id, shirt_number: 11, display_name: '11 · Jugador 5', role: 'FIELD', is_starter: true },
      ],
    });

    // Ahora se edita el jugador y el equipo en catálogo
    await management.updatePlayer(p1.id, {
      first_name: 'Matías Modificado',
      last_name: 'Nuevo Apellido',
      default_number: 99,
    });
    await management.updateTeam(team.id, {
      name: 'Nombre Totalmente Nuevo',
      short_name: 'NEW',
    });

    // Verificar que el partido y el roster histórico conservan sus snapshots intactos
    const matchAfter = await db.matches.get(match.id);
    expect(matchAfter?.home_team_name_snapshot).toBe('Nombre Original');

    const rosterAfter = await db.matchRosters
      .where('match_id')
      .equals(match.id)
      .and((r) => r.player_id === p1.id)
      .first();
    expect(rosterAfter?.display_name_snapshot).toBe('7 · M. Original');
    expect(rosterAfter?.shirt_number).toBe(7);
  });

  // 6. Independencia de Partidos: Registrar eventos en múltiples partidos sin contaminación cruzada
  it('6. Debe aislar eventos y reloj entre múltiples partidos independientes', async () => {
    const home = await management.createTeam({ name: 'Local X', short_name: 'LCX', is_own: true });
    const away = await management.createTeam({ name: 'Rival Y', short_name: 'RVY', is_own: false });

    const createValidRoster = (prefix: string) => [
      { shirt_number: 1, display_name: `1 · GK ${prefix}`, role: 'GK' as const, is_starter: true },
      { shirt_number: 2, display_name: `2 · P1 ${prefix}`, role: 'FIELD' as const, is_starter: true },
      { shirt_number: 3, display_name: `3 · P2 ${prefix}`, role: 'FIELD' as const, is_starter: true },
      { shirt_number: 4, display_name: `4 · P3 ${prefix}`, role: 'FIELD' as const, is_starter: true },
      { shirt_number: 5, display_name: `5 · P4 ${prefix}`, role: 'FIELD' as const, is_starter: true },
      { shirt_number: 6, display_name: `6 · P5 ${prefix}`, role: 'FIELD' as const, is_starter: true },
    ];

    const match1 = await management.createMatch({
      home_team_id: home.id,
      away_team_id: away.id,
      home_roster: createValidRoster('M1'),
    });

    const match2 = await management.createMatch({
      home_team_id: home.id,
      away_team_id: away.id,
      home_roster: createValidRoster('M2'),
    });

    const p1Period = (await db.matchPeriods.where('match_id').equals(match1.id).first())!;
    const p1Roster = (await db.matchRosters.where('match_id').equals(match1.id).and((r) => r.role === 'FIELD').first())!;

    const p2Period = (await db.matchPeriods.where('match_id').equals(match2.id).first())!;
    const p2Roster = (await db.matchRosters.where('match_id').equals(match2.id).and((r) => r.role === 'FIELD').first())!;

    // Registrar gol en Partido 1
    await recorder.recordAction({
      matchId: match1.id,
      periodId: p1Period.id,
      teamId: home.id,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: p1Roster.id, role: 'SHOOTER' }],
    });

    // Registrar gol en Partido 2
    await recorder.recordAction({
      matchId: match2.id,
      periodId: p2Period.id,
      teamId: home.id,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: p2Roster.id, role: 'SHOOTER' }],
    });

    // Consultar eventos de cada partido
    const events1 = await db.matchEvents.where('match_id').equals(match1.id).toArray();
    const events2 = await db.matchEvents.where('match_id').equals(match2.id).toArray();

    expect(events1.length).toBe(1);
    expect(events1[0]?.clock_ms).toBe(60000);
    expect(events2.length).toBe(1);
    expect(events2[0]?.clock_ms).toBe(120000);

    // Exportar ambos partidos de forma aislada
    const envelope1 = await transfer.exportMatch(match1.id);
    const envelope2 = await transfer.exportMatch(match2.id);
    expect(envelope1.match.id).toBe(match1.id);
    expect(envelope2.match.id).toBe(match2.id);
    expect(envelope1.events.length).toBe(1);
    expect(envelope2.events.length).toBe(1);
  });

  // 7. Equipo Propio como Visitante y Acciones Colectivas del Rival
  it('7. Debe permitir que el equipo propio juegue como visitante y registrar acciones colectivas del rival sin jugadores inventados', async () => {
    const rivalHome = await management.createTeam({ name: 'Club Alemán (Local)', short_name: 'ALE', is_own: false });
    const ownAway = await management.createTeam({ name: 'Mi Club (Visitante)', short_name: 'MIC', is_own: true });

    const gkAway = await management.createPlayer({ first_name: 'Arquero Away', default_number: 1, position: 'GK', is_goalkeeper: true, team_id: ownAway.id });
    const pAway = await management.createPlayer({ first_name: 'Lucas', default_number: 10, team_id: ownAway.id });

    // Partido donde nuestro equipo es VISITANTE y el rival es LOCAL colectivo
    const match = await management.createMatch({
      home_team_id: rivalHome.id,
      away_team_id: ownAway.id,
      home_roster: [], // Rival colectivo (sin jugadores individuales)
      away_roster: [
        { player_id: gkAway.id, shirt_number: 1, display_name: '1 · Arquero Away', role: 'GK', is_starter: true },
        { player_id: pAway.id, shirt_number: 10, display_name: '10 · Lucas', role: 'FIELD', is_starter: true },
        { shirt_number: 11, display_name: '11 · P2', role: 'FIELD', is_starter: true },
        { shirt_number: 12, display_name: '12 · P3', role: 'FIELD', is_starter: true },
        { shirt_number: 13, display_name: '13 · P4', role: 'FIELD', is_starter: true },
        { shirt_number: 14, display_name: '14 · P5', role: 'FIELD', is_starter: true },
      ],
    });

    const period = (await db.matchPeriods.where('match_id').equals(match.id).first())!;
    const awayShooter = (await db.matchRosters.where('match_id').equals(match.id).and((r) => r.player_id === pAway.id).first())!;

    // A. Gol de nuestro equipo visitante (con jugador individual identificado)
    await recorder.recordAction({
      matchId: match.id,
      periodId: period.id,
      teamId: ownAway.id,
      type: 'SHOT',
      clockMs: 35000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [{ roster_id: awayShooter.id, role: 'SHOOTER' }],
    });

    // B. Gol colectivo del rival local (sin participantes ni portero inventado)
    await recorder.recordAction({
      matchId: match.id,
      periodId: period.id,
      teamId: rivalHome.id,
      type: 'SHOT',
      clockMs: 50000,
      shotDetail: { result_code: 'GOAL', is_empty_net: false },
      participants: [], // Colectivo
    });

    // C. Atajada a tiro del rival local (acción colectiva del rival parada)
    await recorder.recordAction({
      matchId: match.id,
      periodId: period.id,
      teamId: rivalHome.id,
      type: 'SHOT',
      clockMs: 65000,
      shotDetail: { result_code: 'SAVED', is_empty_net: false },
      participants: [], // Colectivo
    });

    const events = await db.matchEvents.where('match_id').equals(match.id).toArray();
    expect(events.length).toBe(3);

    // Calcular marcador: Local (Rival) 1 - Visitante (Propio) 1
    const homeGoals = events.filter((e) => e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL' && e.match_team_id === rivalHome.id).length;
    const awayGoals = events.filter((e) => e.type === 'SHOT' && e.shot_detail?.result_code === 'GOAL' && e.match_team_id === ownAway.id).length;
    expect(homeGoals).toBe(1);
    expect(awayGoals).toBe(1);

    // Exportar y validar que el envelope no rechaza eventos sin participantes
    const envelope = await transfer.exportMatch(match.id);
    expect(envelope.events.length).toBe(3);

    // Validar transferencia hacia una base de datos limpia
    const cleanDb = new HandballDatabase(`clean_test_db_${Math.random()}`);
    const cleanTransfer = new TransferService(cleanDb);
    const analysis = await cleanTransfer.analyzeImport(envelope);
    expect(analysis.kind).toBe('NEW');
    if (analysis.kind === 'NEW') {
      await cleanTransfer.applyImport(analysis.envelope, false);
    }
    const cleanEvents = await cleanDb.matchEvents.where('match_id').equals(match.id).toArray();
    expect(cleanEvents.length).toBe(3);
  });

  // 8. Conservación de datos preexistentes de Fase 1 al inicializar
  it('8. seedInitialDataIfEmpty no debe tocar ni reiniciar la base si ya contiene partidos', async () => {
    const initialMatches = await db.matches.count();
    expect(initialMatches).toBeGreaterThan(0);

    // Agregar un evento simulando los 9 eventos del usuario
    const period = (await db.matchPeriods.toCollection().first())!;
    await recorder.recordAction({
      matchId: period.match_id,
      periodId: period.id,
      type: 'NOTE',
      clockMs: 11000,
      note: 'Prueba de persistencia usuario',
    });

    const eventsCountBefore = await db.matchEvents.count();

    // Reejecutar el seed
    await seedInitialDataIfEmpty(db);

    const eventsCountAfter = await db.matchEvents.count();
    expect(eventsCountAfter).toBe(eventsCountBefore); // No se modificó nada
  });

  // 9. Validación de Convocatoria Mínima para Equipo Propio (5 de campo + 1 arquero)
  describe('9. Regla de Convocatoria Mínima de la Aplicación (Equipo Propio)', () => {
    it('9.1 Debe rechazar 4 jugadores de campo + 1 arquero', async () => {
      const own = await management.createTeam({ name: 'Club Propio', short_name: 'PRO', is_own: true });
      const rival = await management.createTeam({ name: 'Club Rival', short_name: 'RIV', is_own: false });

      const roster4Field1Gk = [
        { shirt_number: 1, display_name: '1 · GK', role: 'GK' as const, is_starter: true },
        { shirt_number: 2, display_name: '2 · P1', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 3, display_name: '3 · P2', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 4, display_name: '4 · P3', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 5, display_name: '5 · P4', role: 'FIELD' as const, is_starter: true },
      ];

      await expect(
        management.createMatch({
          home_team_id: own.id,
          away_team_id: rival.id,
          home_roster: roster4Field1Gk,
        })
      ).rejects.toThrow('al menos 5 jugadores de campo');
    });

    it('9.2 Debe rechazar 5 jugadores de campo sin arquero', async () => {
      const own = await management.createTeam({ name: 'Club Propio', short_name: 'PRO', is_own: true });
      const rival = await management.createTeam({ name: 'Club Rival', short_name: 'RIV', is_own: false });

      const roster5Field0Gk = [
        { shirt_number: 2, display_name: '2 · P1', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 3, display_name: '3 · P2', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 4, display_name: '4 · P3', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 5, display_name: '5 · P4', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 6, display_name: '6 · P5', role: 'FIELD' as const, is_starter: true },
      ];

      await expect(
        management.createMatch({
          home_team_id: own.id,
          away_team_id: rival.id,
          home_roster: roster5Field0Gk,
        })
      ).rejects.toThrow('al menos 1 arquero');
    });

    it('9.3 Debe permitir 5 jugadores de campo + 1 arquero', async () => {
      const own = await management.createTeam({ name: 'Club Propio', short_name: 'PRO', is_own: true });
      const rival = await management.createTeam({ name: 'Club Rival', short_name: 'RIV', is_own: false });

      const roster5Field1Gk = [
        { shirt_number: 1, display_name: '1 · GK', role: 'GK' as const, is_starter: true },
        { shirt_number: 2, display_name: '2 · P1', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 3, display_name: '3 · P2', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 4, display_name: '4 · P3', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 5, display_name: '5 · P4', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 6, display_name: '6 · P5', role: 'FIELD' as const, is_starter: true },
      ];

      const match = await management.createMatch({
        home_team_id: own.id,
        away_team_id: rival.id,
        home_roster: roster5Field1Gk,
      });

      expect(match.id).toBeDefined();
    });

    it('9.4 Debe permitir 5 jugadores de campo + 2 arqueros', async () => {
      const own = await management.createTeam({ name: 'Club Propio', short_name: 'PRO', is_own: true });
      const rival = await management.createTeam({ name: 'Club Rival', short_name: 'RIV', is_own: false });

      const roster5Field2Gk = [
        { shirt_number: 1, display_name: '1 · GK 1', role: 'GK' as const, is_starter: true },
        { shirt_number: 12, display_name: '12 · GK 2', role: 'GK' as const, is_starter: false },
        { shirt_number: 2, display_name: '2 · P1', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 3, display_name: '3 · P2', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 4, display_name: '4 · P3', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 5, display_name: '5 · P4', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 6, display_name: '6 · P5', role: 'FIELD' as const, is_starter: true },
      ];

      const match = await management.createMatch({
        home_team_id: own.id,
        away_team_id: rival.id,
        home_roster: roster5Field2Gk,
      });

      expect(match.id).toBeDefined();
    });

    it('9.5 Jugadores en el catálogo NO convocados no deben contar para cumplir el mínimo', async () => {
      const own = await management.createTeam({ name: 'Club Propio', short_name: 'PRO', is_own: true });
      const rival = await management.createTeam({ name: 'Club Rival', short_name: 'RIV', is_own: false });

      // Crear 10 jugadores en el catálogo
      for (let i = 1; i <= 10; i++) {
        await management.createPlayer({ first_name: `Cat ${i}`, default_number: i, team_id: own.id });
      }

      // Convocatoria insuficiente (solo 3 seleccionados)
      const partialRoster = [
        { shirt_number: 1, display_name: '1 · GK', role: 'GK' as const, is_starter: true },
        { shirt_number: 2, display_name: '2 · P1', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 3, display_name: '3 · P2', role: 'FIELD' as const, is_starter: true },
      ];

      await expect(
        management.createMatch({
          home_team_id: own.id,
          away_team_id: rival.id,
          home_roster: partialRoster,
        })
      ).rejects.toThrow('al menos 5 jugadores de campo (actual: 2)');
    });

    it('9.6 Misma validación aplica cuando el equipo propio es VISITANTE', async () => {
      const rivalHome = await management.createTeam({ name: 'Club Rival Local', short_name: 'RVL', is_own: false });
      const ownAway = await management.createTeam({ name: 'Club Propio Visitante', short_name: 'PRV', is_own: true });

      // 4 jugadores de campo + 1 arquero en la convocatoria visitante
      const insufficientAwayRoster = [
        { shirt_number: 1, display_name: '1 · GK', role: 'GK' as const, is_starter: true },
        { shirt_number: 2, display_name: '2 · P1', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 3, display_name: '3 · P2', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 4, display_name: '4 · P3', role: 'FIELD' as const, is_starter: true },
        { shirt_number: 5, display_name: '5 · P4', role: 'FIELD' as const, is_starter: true },
      ];

      await expect(
        management.createMatch({
          home_team_id: rivalHome.id,
          away_team_id: ownAway.id,
          home_roster: [], // Rival colectivo
          away_roster: insufficientAwayRoster,
        })
      ).rejects.toThrow('al menos 5 jugadores de campo (actual: 4)');
    });

    it('9.7 El rechazo no realiza escrituras parciales en la base de datos', async () => {
      const own = await management.createTeam({ name: 'Club Propio Sin Parciales', short_name: 'CPP', is_own: true });
      const rival = await management.createTeam({ name: 'Club Rival Sin Parciales', short_name: 'CRP', is_own: false });

      const matchesBefore = await db.matches.count();
      const periodsBefore = await db.matchPeriods.count();
      const rostersBefore = await db.matchRosters.count();

      const invalidRoster = [
        { shirt_number: 1, display_name: '1 · GK', role: 'GK' as const, is_starter: true },
      ];

      try {
        await management.createMatch({
          home_team_id: own.id,
          away_team_id: rival.id,
          home_roster: invalidRoster,
        });
      } catch {
        // Error esperado
      }

      const matchesAfter = await db.matches.count();
      const periodsAfter = await db.matchPeriods.count();
      const rostersAfter = await db.matchRosters.count();

      expect(matchesAfter).toBe(matchesBefore);
      expect(periodsAfter).toBe(periodsBefore);
      expect(rostersAfter).toBe(rostersBefore);
    });
  });
});
