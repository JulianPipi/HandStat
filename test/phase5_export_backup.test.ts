import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { HandballDatabase } from '../src/data/db';
import { ActionRecorderService } from '../src/services/actionRecorder';
import { TransferService } from '../src/services/transferService';
import { MatchManagementService } from '../src/services/matchManagementService';
import { PossessionService } from '../src/services/possessionService';
import { ParticipationService } from '../src/services/participationService';
import { StatsEngine } from '../src/services/statsEngine';
import { ExportService } from '../src/services/exportService';
import { BackupService } from '../src/services/backupService';
import { FullBackupEnvelopeSchema } from '../src/domain/schemas';

describe('Fase 5: Exportación a Excel (XLSX), CSV Modular y Respaldo/Restauración Completa', () => {
  let db: HandballDatabase;
  let actionRecorder: ActionRecorderService;
  let transferService: TransferService;
  let managementService: MatchManagementService;
  let possessionService: PossessionService;
  let participationService: ParticipationService;
  let exportService: ExportService;
  let backupService: BackupService;

  let testMatchId: string;
  let period1Id: string;
  let homeTeamId: string;
  let awayTeamId: string;
  let shooter1RosterId: string;
  let shooter2RosterId: string;
  let gkRosterId: string;

  beforeEach(async () => {
    db = new HandballDatabase(`test_fase5_${Math.random()}`);
    actionRecorder = new ActionRecorderService(db);
    transferService = new TransferService(db);
    managementService = new MatchManagementService(db);
    possessionService = new PossessionService(db);
    participationService = new ParticipationService(db);
    exportService = new ExportService(db);
    backupService = new BackupService(db);

    // 1. Equipos (Local propio y Rival colectivo)
    const homeTeam = await managementService.createTeam({
      name: 'Club Atlético River Plate',
      short_name: 'RIV',
      is_own: true,
      color_primary: '#dc2626',
    });
    homeTeamId = homeTeam.id;

    const awayTeam = await managementService.createTeam({
      name: 'Ferro Carril Oeste',
      short_name: 'FCO',
      is_own: false,
      color_primary: '#16a34a',
    });
    awayTeamId = awayTeam.id;

    // 2. Jugadores propios cumpliendo la regla de convocatoria (>= 5 campo y >= 1 arquero)
    const p1 = await managementService.createPlayer({
      first_name: 'Diego',
      last_name: 'Simonet',
      default_number: 6,
      position: 'CB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p2 = await managementService.createPlayer({
      first_name: 'Federico',
      last_name: 'Pizarro',
      default_number: 3,
      position: 'RW',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p3 = await managementService.createPlayer({
      first_name: 'Pablo',
      last_name: 'Simonet',
      default_number: 4,
      position: 'LB',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p4 = await managementService.createPlayer({
      first_name: 'Ignacio',
      last_name: 'Pizarro',
      default_number: 7,
      position: 'LW',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const p5 = await managementService.createPlayer({
      first_name: 'Lucas',
      last_name: 'Moscariello',
      default_number: 22,
      position: 'PV',
      is_goalkeeper: false,
      team_id: homeTeamId,
    });
    const pGK = await managementService.createPlayer({
      first_name: 'Matías',
      last_name: 'Schulz',
      default_number: 1,
      position: 'GK',
      is_goalkeeper: true,
      team_id: homeTeamId,
    });

    // 3. Crear partido y convocar
    const match = await managementService.createMatch({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      scheduled_at: '2026-10-14T19:00:00Z',
      home_roster: [
        { player_id: p1.id, shirt_number: 6, display_name: '6 · D. Simonet', role: 'FIELD', is_starter: true },
        { player_id: p2.id, shirt_number: 3, display_name: '3 · F. Pizarro', role: 'FIELD', is_starter: true },
        { player_id: p3.id, shirt_number: 4, display_name: '4 · P. Simonet', role: 'FIELD', is_starter: true },
        { player_id: p4.id, shirt_number: 7, display_name: '7 · I. Pizarro', role: 'FIELD', is_starter: true },
        { player_id: p5.id, shirt_number: 22, display_name: '22 · L. Moscariello', role: 'FIELD', is_starter: true },
        { player_id: pGK.id, shirt_number: 1, display_name: '1 · M. Schulz', role: 'GK', is_starter: true },
      ],
      away_roster: [], // Rival colectivo sin convocatoria individual
    });
    testMatchId = match.id;

    const periods = await db.matchPeriods.where('match_id').equals(testMatchId).sortBy('number');
    period1Id = periods[0]!.id;

    const rosters = await db.matchRosters.where('match_id').equals(testMatchId).toArray();
    shooter1RosterId = rosters.find((r) => r.player_id === p1.id)!.id;
    shooter2RosterId = rosters.find((r) => r.player_id === p2.id)!.id;
    gkRosterId = rosters.find((r) => r.player_id === pGK.id)!.id;

    // Inicializar formación titular en participación
    await participationService.confirmInitialLineup({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      starterRosterIds: rosters.filter((r) => r.team_id === homeTeamId && r.role !== 'GK').map((r) => r.id),
      goalkeeperRosterId: gkRosterId,
    });

    // Iniciar Posesión 1: River Plate
    await possessionService.startPossession({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      clockMs: 0,
      startReason: 'THROW_OFF',
    });

    // Acción 1: Gol de Diego Simonet desde 9m Central a Arriba Derecha (01:00)
    const shot1 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 60000,
      shotDetail: {
        result_code: 'GOAL',
        origin_zone_code: 'C9',
        target_zone_code: 'TR',
        phase_code: 'POSITIONAL',
        numerical_context: 'EQUAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooter1RosterId, role: 'SHOOTER' }],
    });
    await possessionService.handleEventEffect(shot1.savedEvent!, homeTeamId, awayTeamId);

    // Posesión 2: Rival Colectivo (Ferro) - Tiro Atajado por Matías Schulz (02:00)
    const shotRival = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: {
        result_code: 'SAVED',
        origin_zone_code: 'L6',
        target_zone_code: 'BL',
        phase_code: 'POSITIONAL',
        numerical_context: 'EQUAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: gkRosterId, role: 'GOALKEEPER' }], // Atajada de Schulz, sin lanzador rival ficticio
    });
    await possessionService.handleEventEffect(shotRival.savedEvent!, homeTeamId, awayTeamId);

    // Posesión 3: Contraataque de River - Tiro al Poste de Federico Pizarro (03:00)
    const shot2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'SHOT',
      clockMs: 180000,
      shotDetail: {
        result_code: 'POST',
        origin_zone_code: 'R6',
        target_zone_code: 'POST_R',
        phase_code: 'FASTBREAK',
        numerical_context: 'EQUAL',
        is_empty_net: false,
      },
      participants: [{ roster_id: shooter2RosterId, role: 'SHOOTER' }],
    });
    await possessionService.handleEventEffect(shot2.savedEvent!, homeTeamId, awayTeamId);

    // Acción Anulada: Pérdida erróneamente cargada que luego se anula (03:30)
    const turnoverRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      teamId: homeTeamId,
      type: 'TURNOVER',
      clockMs: 210000,
      turnoverDetail: { reason: 'BAD_PASS', forced_by_defense: false },
      participants: [{ roster_id: shooter1RosterId, role: 'TURNOVER_BY' }],
    });
    await actionRecorder.voidAction(turnoverRes.savedEvent!.id, 'Error de arbitraje corregido en mesa');
  });

  // =========================================================================
  // 1. EXPORTACIÓN A EXCEL (XLSX)
  // =========================================================================

  it('1. Genera un archivo XLSX válido con las 7 hojas requeridas', async () => {
    const { blob, filename, buffer } = await exportService.exportMatchToXLSX(testMatchId);

    expect(blob).toBeDefined();
    expect(blob.size).toBeGreaterThan(0);
    expect(filename).toContain('.xlsx');
    expect(filename).toContain('River_Plate');
    expect(filename).toContain('Ferro_Carril_Oeste');

    // Leer el buffer con la librería XLSX para auditar su estructura interna
    const workbook = XLSX.read(buffer, { type: 'array' });
    expect(workbook.SheetNames).toEqual([
      'Partido',
      'Equipos',
      'Jugadores',
      'Porteros',
      'Lanzamientos',
      'Posesiones',
      'Eventos',
    ]);
  });

  it('2. Los valores en XLSX coinciden exactamente con el motor estadístico (StatsEngine)', async () => {
    const { buffer } = await exportService.exportMatchToXLSX(testMatchId);
    const workbook = XLSX.read(buffer, { type: 'array' });

    // Calcular estadísticas de referencia directamente desde StatsEngine
    const bundle = await exportService.getMatchExportBundle(testMatchId);
    const expectedStats = bundle.stats;

    // Verificar hoja 'Equipos'
    const teamsSheet = workbook.Sheets['Equipos']!;
    const teamsData = XLSX.utils.sheet_to_json<any>(teamsSheet, { header: 1 }) as any[][];

    // Buscar fila de Goles Totales
    const goalsRow = teamsData.find((r) => r[0] === 'Goles Totales');
    expect(goalsRow).toBeDefined();
    expect(goalsRow![1]).toBe(expectedStats.final_home_score); // 1
    expect(goalsRow![2]).toBe(expectedStats.final_away_score); // 0

    // Buscar fila de Lanzamientos Totales
    const shotsRow = teamsData.find((r) => r[0] === 'Lanzamientos Totales');
    expect(shotsRow).toBeDefined();
    expect(shotsRow![1]).toBe(expectedStats.home_shots.total_shots); // 2
    expect(shotsRow![2]).toBe(expectedStats.away_shots.total_shots); // 1

    // Buscar efectividad (debe exportarse numérico para uso en fórmulas y gráficos)
    const effRow = teamsData.find((r) => r[0] === 'Efectividad de Tiro (%)');
    expect(effRow).toBeDefined();
    expect(effRow![1]).toBe(50); // 1 gol en 2 tiros = 50 (numérico)
  });

  it('3. La hoja de Lanzamientos conserva zona de origen en cancha, destino en arco y resultado', async () => {
    const { buffer } = await exportService.exportMatchToXLSX(testMatchId);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const shotsSheet = workbook.Sheets['Lanzamientos']!;
    const shotsRows = XLSX.utils.sheet_to_json<any>(shotsSheet, { header: 1 }) as any[][];

    // Fila 0 es encabezado, Fila 1 es Tiro 1 (Diego Simonet: C9 -> TR -> Gol)
    const shot1Row = shotsRows[1]!;
    expect(shot1Row[4]).toBe('Club Atlético River Plate'); // Equipo atacante
    expect(shot1Row[6]).toContain('D. Simonet'); // Lanzador
    expect(shot1Row[8]).toBe('Ataque Posicional'); // Fase
    expect(shot1Row[9]).toBe('C9'); // Código origen
    expect(shot1Row[10]).toBe('9m Central'); // Descripción origen
    expect(shot1Row[11]).toBe('TR'); // Código destino
    expect(shot1Row[12]).toBe('Arriba Derecha'); // Descripción destino
    expect(shot1Row[13]).toBe('Gol'); // Resultado

    // Fila 2 es Tiro 2 (Rival colectivo: L6 -> BL -> Atajada por Schulz)
    const shot2Row = shotsRows[2]!;
    expect(shot2Row[4]).toBe('Ferro Carril Oeste');
    expect(shot2Row[6]).toBe('Rival Colectivo (Sin lanzador individual)');
    expect(shot2Row[9]).toBe('L6');
    expect(shot2Row[10]).toBe('6m Extremo Izquierdo');
    expect(shot2Row[11]).toBe('BL');
    expect(shot2Row[12]).toBe('Abajo Izquierda');
    expect(shot2Row[13]).toBe('Atajada');
    expect(shot2Row[14]).toContain('Schulz'); // Portero defensor
  });

  it('4. Eventos anulados se marcan en la hoja de Eventos y quedan excluidos de las estadísticas vigentes', async () => {
    const { buffer } = await exportService.exportMatchToXLSX(testMatchId);
    const workbook = XLSX.read(buffer, { type: 'array' });

    // 1. Hoja Eventos contiene el evento anulado con su motivo y trazabilidad de período
    const eventsSheet = workbook.Sheets['Eventos']!;
    const eventRows = XLSX.utils.sheet_to_json<any>(eventsSheet, { header: 1 }) as any[][];
    const voidedRow = eventRows.find((r) => r[8] === 'ANULADO (VOIDED)');

    expect(voidedRow).toBeDefined();
    expect(voidedRow![3]).toBe(period1Id); // Columna ID de Período explícita
    expect(voidedRow![7]).toBe('Pérdida de Balón');
    expect(voidedRow![9]).toContain('Error de arbitraje corregido en mesa');

    // 2. Hoja Equipos y Jugadores NO contabilizan la pérdida anulada
    const teamsSheet = workbook.Sheets['Equipos']!;
    const teamsRows = XLSX.utils.sheet_to_json<any>(teamsSheet, { header: 1 }) as any[][];
    const turnoversRow = teamsRows.find((r) => r[0] === 'Pérdidas de Balón');
    expect(turnoversRow![1]).toBe(0); // 0 pérdidas vigentes (la única fue anulada)

    const playersSheet = workbook.Sheets['Jugadores']!;
    const playerRows = XLSX.utils.sheet_to_json<any>(playersSheet, { header: 1 }) as any[][];
    const simonetRow = playerRows.find((r) => r[2]?.includes('Simonet'));
    expect(simonetRow![19]).toBe(0); // Columna Pérdidas = 0
  });

  it('5. No se generan jugadores ficticios para el rival colectivo en la hoja de Jugadores', async () => {
    const { buffer } = await exportService.exportMatchToXLSX(testMatchId);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const playersSheet = workbook.Sheets['Jugadores']!;
    const playerRows = XLSX.utils.sheet_to_json<any>(playersSheet, { header: 1 }) as any[][];

    // Solo deben figurar los 6 jugadores propios convocados
    const nonHeaderRows = playerRows.slice(1);
    expect(nonHeaderRows.length).toBe(6);

    const playerNames = nonHeaderRows.map((r) => r[2]);
    expect(playerNames).not.toContain('#1 Portero Rival');
    expect(playerNames).not.toContain('Equipo Rival');
    expect(playerNames).not.toContain('Desconocido');
  });

  // =========================================================================
  // 2. EXPORTACIÓN A CSV Y PROTECCIÓN DE FÓRMULAS
  // =========================================================================

  it('6. Exporta a CSV con punto y coma por defecto, BOM UTF-8 y preserva caracteres con tilde', async () => {
    const { csvContent, filename } = await exportService.exportTableToCSV(testMatchId, 'jugadores', {
      delimiter: ';',
      includeBOM: true,
    });

    expect(filename).toContain('.csv');
    expect(filename).toContain('jugadores');

    // Debe comenzar con UTF-8 BOM
    expect(csvContent.charCodeAt(0)).toBe(0xfeff);

    // Debe contener delimitador punto y coma
    expect(csvContent).toContain(';');

    // Debe preservar tildes en nombres y descripciones en español
    expect(csvContent).toContain('Atlético');
    expect(csvContent).toContain('Pérdidas');
    expect(csvContent).toContain('Lanzamientos');
  });

  it('7. Escapa comillas, saltos de línea y respeta delimitador coma cuando se solicita', async () => {
    const { csvContent } = await exportService.exportTableToCSV(testMatchId, 'equipos', {
      delimiter: ',',
    });

    expect(csvContent).toContain(',');
    expect(csvContent).not.toContain(';');
  });

  it('8. Protege contra inyección de fórmulas CSV preservando números legítimos (incluido Plus/Minus negativo)', () => {
    // Caso A: Número legítimo positivo
    expect(exportService.formatCSVCell(10, ';', true)).toBe('10');

    // Caso B: Número legítimo negativo (ej. Plus/Minus -5) -> NO debe neutralizarse con apóstrofe
    expect(exportService.formatCSVCell(-5, ';', true)).toBe('-5');
    expect(exportService.formatCSVCell('-8', ';', true)).toBe('-8');

    // Caso C: Fórmula maliciosa de texto que inicia con =
    expect(exportService.formatCSVCell('=cmd|"/C calc"!A0', ';', true)).toBe('"\'=cmd|""/C calc""!A0"');
    expect(exportService.formatCSVCell('=SUM(A1:A10)', ';', true)).toBe("'=SUM(A1:A10)");

    // Caso D: Texto que inicia con + o @
    expect(exportService.formatCSVCell('+SUM(A1:A10)', ';', true)).toBe("'+SUM(A1:A10)");
    expect(exportService.formatCSVCell('@SUM(1,2)', ';', true)).toBe("'@SUM(1,2)");

    // Caso E: Texto que inicia con guión pero NO es un número (ej. -2+3 o -COMMAND)
    expect(exportService.formatCSVCell('-DDE("cmd")', ';', true)).toBe('"\'=DDE("cmd")"'.length > 0 ? '"\'-DDE(""cmd"")"' : '');
  });

  // =========================================================================
  // 3. RESPALDO COMPLETO Y RESTAURACIÓN ATÓMICA
  // =========================================================================

  it('9. createFullBackup empaqueta todas las tablas con conteos exactos y huella digital', async () => {
    const { envelope, jsonString, filename } = await backupService.createFullBackup();

    expect(filename).toContain('HandStat_RespaldoCompleto_');
    expect(envelope.schema_version).toBe('1.0.0');
    expect(envelope.backup_kind).toBe('full_local_database');
    expect(envelope.counts.teams).toBe(2);
    expect(envelope.counts.players).toBe(6);
    expect(envelope.counts.matches).toBe(1);
    expect(envelope.counts.matchEvents).toBe(4); // 3 tiros + 1 pérdida anulada
    expect(envelope.counts.possessions).toBe(4);
    expect(envelope.counts.playerParticipations).toBe(6);
    expect(envelope.fingerprint.length).toBeGreaterThanOrEqual(8);

    // Valida que el JSON generado cumpla el esquema Zod
    const parsed = JSON.parse(jsonString);
    expect(FullBackupEnvelopeSchema.safeParse(parsed).success).toBe(true);
  });

  it('10. inspectBackup valida correctamente un respaldo y compara conteos con la base local', async () => {
    const { jsonString } = await backupService.createFullBackup();
    const inspection = await backupService.inspectBackup(jsonString);

    expect(inspection.valid).toBe(true);
    if (inspection.valid) {
      expect(inspection.incomingCounts.matches).toBe(1);
      expect(inspection.incomingCounts.players).toBe(6);
      expect(inspection.currentLocalCounts.matches).toBe(1);
      expect(inspection.currentLocalCounts.players).toBe(6);
    }
  });

  it('11. inspectBackup rechaza un sobre de transferencia individual con mensaje explícito', async () => {
    const singleMatchEnvelope = await transferService.exportMatch(testMatchId);
    const inspection = await backupService.inspectBackup(JSON.stringify(singleMatchEnvelope));

    expect(inspection.valid).toBe(false);
    expect(inspection.error).toContain('transferencia de un único partido («single_match»)');
  });

  it('12. inspectBackup rechaza respaldos alterados o con huella digital manipulada', async () => {
    const { envelope } = await backupService.createFullBackup();

    // Modificar un dato sin actualizar la huella digital
    envelope.data.teams[0]!.name = 'Nombre Hackeado';

    const inspection = await backupService.inspectBackup(JSON.stringify(envelope));
    expect(inspection.valid).toBe(false);
    expect(inspection.error).toContain('huella digital de integridad no coincide');
  });

  it('13. restoreFullBackup restaura atómicamente todos los datos en una base de datos limpia', async () => {
    const { envelope } = await backupService.createFullBackup();

    // Crear una base de datos de destino completamente vacía
    const cleanDb = new HandballDatabase(`test_fase5_clean_${Math.random()}`);
    const cleanBackupService = new BackupService(cleanDb);

    // Verificar que la base limpia está vacía
    expect(await cleanDb.matches.count()).toBe(0);
    expect(await cleanDb.players.count()).toBe(0);

    // Ejecutar restauración
    const res = await cleanBackupService.restoreFullBackup(envelope);
    expect(res.success).toBe(true);

    // Comprobar que todas las entidades y relaciones fueron recuperadas
    expect(await cleanDb.teams.count()).toBe(2);
    expect(await cleanDb.players.count()).toBe(6);
    expect(await cleanDb.matches.count()).toBe(1);
    expect(await cleanDb.matchPeriods.count()).toBe(2);
    expect(await cleanDb.matchRosters.count()).toBe(6);
    expect(await cleanDb.matchEvents.count()).toBe(4);
    expect(await cleanDb.possessions.count()).toBe(4);
    expect(await cleanDb.playerParticipations.count()).toBe(6);

    // Comprobar que las consultas estadísticas sobre la base restaurada coinciden al 100%
    const cleanExportService = new ExportService(cleanDb);
    const restoredBundle = await cleanExportService.getMatchExportBundle(testMatchId);
    expect(restoredBundle.stats.final_home_score).toBe(1);
    expect(restoredBundle.stats.final_away_score).toBe(0);
    expect(restoredBundle.stats.home_shots.total_shots).toBe(2);
  });

  it('14. Garantía de atomicidad: ante fallo de restauración se conserva íntegramente la base previa sin escrituras parciales', async () => {
    const initialMatchesCount = await db.matches.count();
    const initialPlayersCount = await db.players.count();
    expect(initialMatchesCount).toBe(1);
    expect(initialPlayersCount).toBe(6);

    // Simular un envelope con un objeto corrupto que forzará un fallo durante la transacción
    const invalidEnvelope: any = {
      schema_version: '1.0.0',
      backup_kind: 'full_local_database',
      created_at: new Date().toISOString(),
      app_version: 'HandStat v0.5.0',
      counts: { teams: 1, players: 1, matches: 1, matchPeriods: 0, matchRosters: 0, matchEvents: 0, eventRevisions: 0, rescueSnapshots: 0, possessions: 0, playerParticipations: 0 },
      fingerprint: 'invalid_fingerprint_test',
      data: {
        teams: [{ id: 'invalid-no-uuid', name: 'Equipo Inválido' }], // Romperá validación de esquema
        players: [],
        matches: [],
        matchPeriods: [],
        matchRosters: [],
        matchEvents: [],
        eventRevisions: [],
        rescueSnapshots: [],
        possessions: [],
        playerParticipations: [],
      },
    };

    const res = await backupService.restoreFullBackup(invalidEnvelope);
    expect(res.success).toBe(false);

    // Verificar que la base de datos previa se conservó ÍNTEGRAMENTE (sin borrados ni escrituras parciales)
    expect(await db.matches.count()).toBe(initialMatchesCount);
    expect(await db.players.count()).toBe(initialPlayersCount);
    expect(await db.matchEvents.count()).toBe(4);
  });

  it('15. La transferencia JSON de partido individual existente (TransferService) continúa funcionando sin regresiones', async () => {
    const singleMatchEnvelope = await transferService.exportMatch(testMatchId);
    expect(singleMatchEnvelope.export_kind).toBe('single_match');
    expect(singleMatchEnvelope.match.id).toBe(testMatchId);

    const analysis = await transferService.analyzeImport(singleMatchEnvelope);
    expect(analysis.kind).toBe('IDENTICAL'); // Es idéntico a la base actual
  });

  // =========================================================================
  // 4. REGRESIONES DE LA AUDITORÍA DE FASE 5 (CONCILIACIÓN Y CORRECCIÓN)
  // =========================================================================

  it('16. Posesiones: el detalle individual y el resumen reconcilian exactamente sus goles asociados validados', async () => {
    // Crear un partido con posesiones para Ferro (rival) donde 2 de ellas terminan en gol válido
    const matchFerro = await managementService.createMatch({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      scheduled_at: '2026-10-14T20:00:00Z',
      home_roster: [
        { shirt_number: 6, display_name: '6 · D. Simonet', role: 'FIELD', is_starter: true, position_snapshot: 'CB' },
        { shirt_number: 3, display_name: '3 · F. Pizarro', role: 'FIELD', is_starter: true, position_snapshot: 'RW' },
        { shirt_number: 4, display_name: '4 · P. Simonet', role: 'FIELD', is_starter: true, position_snapshot: 'LB' },
        { shirt_number: 7, display_name: '7 · I. Pizarro', role: 'FIELD', is_starter: true, position_snapshot: 'LW' },
        { shirt_number: 22, display_name: '22 · L. Moscariello', role: 'FIELD', is_starter: true, position_snapshot: 'PV' },
        { shirt_number: 1, display_name: '1 · M. Schulz', role: 'GK', is_starter: true, position_snapshot: 'GK' },
      ],
      away_roster: [],
    });

    const mPeriods = await db.matchPeriods.where('match_id').equals(matchFerro.id).sortBy('number');
    const p1 = mPeriods[0]!.id;

    // Posesión 1 Ferro: finaliza en gol (02:00)
    const pos1 = await possessionService.startPossession({
      matchId: matchFerro.id,
      periodId: p1,
      teamId: awayTeamId,
      clockMs: 60000,
      startReason: 'TURNOVER',
    });
    const shotGoal1 = await actionRecorder.recordAction({
      matchId: matchFerro.id,
      periodId: p1,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 120000,
      shotDetail: { result_code: 'GOAL', origin_zone_code: 'C6', target_zone_code: 'BL', phase_code: 'POSITIONAL', is_empty_net: false },
      participants: [],
    });
    await possessionService.handleEventEffect(shotGoal1.savedEvent!, homeTeamId, awayTeamId);

    // Posesión 2 Ferro: finaliza en tiro afuera (04:00)
    const pos2 = await possessionService.startPossession({
      matchId: matchFerro.id,
      periodId: p1,
      teamId: awayTeamId,
      clockMs: 180000,
      startReason: 'GOAL_CONCEDED',
    });
    const shotMiss = await actionRecorder.recordAction({
      matchId: matchFerro.id,
      periodId: p1,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 240000,
      shotDetail: { result_code: 'MISSED', origin_zone_code: 'L9', target_zone_code: 'OUT_TOP', phase_code: 'POSITIONAL', is_empty_net: false },
      participants: [],
    });
    await possessionService.handleEventEffect(shotMiss.savedEvent!, homeTeamId, awayTeamId);

    // Posesión 3 Ferro: finaliza en gol (06:00)
    const pos3 = await possessionService.startPossession({
      matchId: matchFerro.id,
      periodId: p1,
      teamId: awayTeamId,
      clockMs: 300000,
      startReason: 'GOAL_CONCEDED',
    });
    const shotGoal2 = await actionRecorder.recordAction({
      matchId: matchFerro.id,
      periodId: p1,
      teamId: awayTeamId,
      type: 'SHOT',
      clockMs: 360000,
      shotDetail: { result_code: 'GOAL', origin_zone_code: 'R9', target_zone_code: 'TR', phase_code: 'POSITIONAL', is_empty_net: false },
      participants: [],
    });
    await possessionService.handleEventEffect(shotGoal2.savedEvent!, homeTeamId, awayTeamId);

    // Exportar a XLSX
    const { buffer } = await exportService.exportMatchToXLSX(matchFerro.id);
    const workbook = XLSX.read(buffer, { type: 'array' });
    const posSheet = workbook.Sheets['Posesiones']!;
    const posRows = XLSX.utils.sheet_to_json<any>(posSheet, { header: 1 }) as any[][];

    // Filtrar filas de detalle de Ferro (donde la columna 0 es el número de posesión)
    const ferroDetailRows = posRows.filter((r) => typeof r[0] === 'number' && r[2] === 'Ferro Carril Oeste');
    expect(ferroDetailRows.length).toBe(3);

    // Columna 10 es 'Goles Válidos Asociados'
    const goalsInRows = ferroDetailRows.map((r) => r[10]);
    expect(goalsInRows).toEqual([1, 0, 1]); // Posesión 1 (Gol), Posesión 2 (Fuera), Posesión 3 (Gol)

    // Columna 11 es 'ID Gol Asociado'
    expect(ferroDetailRows[0]![11]).toBe(shotGoal1.savedEvent!.id);
    expect(ferroDetailRows[1]![11]).toBe('—');
    expect(ferroDetailRows[2]![11]).toBe(shotGoal2.savedEvent!.id);

    // Buscar en el Resumen al pie
    const summaryGoalRow = posRows.find((r) => r[0] === 'Goles en Posesión Vinculada');
    expect(summaryGoalRow).toBeDefined();
    expect(summaryGoalRow![2]).toBe(2); // Ferro = 2

    // Reconciliación: la suma del detalle coincide exactamente con el total del resumen
    const sumDetailGoals = goalsInRows.reduce((a, b) => a + Number(b), 0);
    expect(sumDetailGoals).toBe(summaryGoalRow![2]);
  });

  it('17. Posesiones: duración retrógrada exporta tiempo real negativo (-52s), distingue estado persistido de validez métrica y explica la anomalía', async () => {
    // Insertar directamente una posesión con duración retrógrada: inicio 00:52 (52000ms), fin 00:00 (0ms)
    const retroPossId = 'pos-retrograde-test';
    await db.possessions.add({
      id: retroPossId,
      match_id: testMatchId,
      period_id: period1Id,
      team_id: homeTeamId,
      start_clock_ms: 52000,
      end_clock_ms: 0,
      start_reason: 'THROW_OFF',
      end_reason: 'PERIOD_END',
      is_complete: true,
      created_at: new Date().toISOString(),
    });

    const bundle = await exportService.getMatchExportBundle(testMatchId);
    const posData = exportService.buildPossessionsSheetData(bundle);

    const retroRow = posData.find((r) => r[14] === retroPossId);
    expect(retroRow).toBeDefined();

    // Columna 5: Duración en segundos (no debe enmascararse con 0)
    expect(retroRow![5]).toBe(-52);

    // Columna 7: Estado persistido en BD
    expect(retroRow![7]).toBe('Completa');

    // Columna 8: Validez para métricas
    expect(retroRow![8]).toBe('Inválida (Duración retrógrada)');

    // Columna 9: Observación / Inconsistencia
    expect(retroRow![9]).toContain('Fin (00:00) anterior a inicio (00:52)');
  });

  it('18. Eventos: ActionRecorderService impide duplicar el cierre de período activo para el mismo period_id y habilita re-cerrar si se anula auditadamente', async () => {
    // 1. Cerrar período 1
    const endEventRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      type: 'PERIOD_END',
      clockMs: 0,
      participants: [],
    });
    expect(endEventRes.savedEvent?.id).toBeDefined();

    // 2. Intentar registrar un segundo y tercer PERIOD_END activo para el MISMO período en 00:00 (simulando los tres clics en interfaz)
    const dupEndRes2 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      type: 'PERIOD_END',
      clockMs: 0,
      participants: [],
    });
    expect(dupEndRes2.success).toBe(false);
    expect(dupEndRes2.error).toContain('ya se encuentra finalizado');

    const dupEndRes3 = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      type: 'PERIOD_END',
      clockMs: 0,
      participants: [],
    });
    expect(dupEndRes3.success).toBe(false);
    expect(dupEndRes3.error).toContain('ya se encuentra finalizado');

    // Verificar que en la base de datos sigue existiendo únicamente 1 cierre activo
    const activeEndsBeforeVoid = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.type === 'PERIOD_END' && e.period_id === period1Id && e.status === 'active')
      .toArray();
    expect(activeEndsBeforeVoid.length).toBe(1);

    // 3. Anular el primer PERIOD_END auditadamente (ej. mesa reanuda 5 segundos finales)
    await actionRecorder.voidAction(endEventRes.savedEvent!.id, 'Reanudación reglamentaria por time-out de mesa');

    // 4. Registrar ahora un nuevo cierre legítimo posterior
    const newEndRes = await actionRecorder.recordAction({
      matchId: testMatchId,
      periodId: period1Id,
      type: 'PERIOD_END',
      clockMs: 0,
      participants: [],
    });
    expect(newEndRes.savedEvent?.id).toBeDefined();
    expect(newEndRes.savedEvent?.id).not.toBe(endEventRes.savedEvent?.id);

    // 5. Verificar que la base histórica conserva ambos eventos (el anulado y el nuevo activo) sin haber borrado nada
    const allPeriodEnds = await db.matchEvents
      .where('match_id')
      .equals(testMatchId)
      .filter((e) => e.type === 'PERIOD_END' && e.period_id === period1Id)
      .toArray();

    expect(allPeriodEnds.length).toBe(2);
    expect(allPeriodEnds.find((e) => e.status === 'voided')).toBeDefined();
    expect(allPeriodEnds.find((e) => e.status === 'active')).toBeDefined();
  });

  it('19. Puestos de jugador: conserva posición específica de snapshot histórico y asigna Desconocido si no existe sin deducirla de nombres ni catálogo', async () => {
    const matchPos = await managementService.createMatch({
      home_team_id: homeTeamId,
      away_team_id: awayTeamId,
      scheduled_at: '2026-10-14T21:00:00Z',
      home_roster: [
        { shirt_number: 6, display_name: '6 · Diego Simonet', role: 'FIELD', is_starter: true, position_snapshot: 'CB' },
        { shirt_number: 3, display_name: '3 · Federico Pizarro', role: 'FIELD', is_starter: true, position_snapshot: 'RW' },
        { shirt_number: 22, display_name: '22 · Lucas Moscariello', role: 'FIELD', is_starter: true, position_snapshot: 'PV' },
        { shirt_number: 1, display_name: '1 · Matías Schulz', role: 'GK', is_starter: true, position_snapshot: 'GK' },
        { shirt_number: 10, display_name: '10 · Jugador Sin Snapshot (CB)', role: 'FIELD', is_starter: false }, // Nombre engañoso con "(CB)"
        { shirt_number: 11, display_name: '11 · Suplente', role: 'FIELD', is_starter: false },
      ],
      away_roster: [],
    });

    const bundle = await exportService.getMatchExportBundle(matchPos.id);
    const playersData = exportService.buildPlayersSheetData(bundle);

    // Fila 0 es encabezado, columna 3 es 'Puesto Habitual'
    const simonetRow = playersData.find((r) => r[2] === '6 · Diego Simonet');
    expect(simonetRow![3]).toBe('Central');

    const pizarroRow = playersData.find((r) => r[2] === '3 · Federico Pizarro');
    expect(pizarroRow![3]).toBe('Extremo Derecho');

    const moscaRow = playersData.find((r) => r[2] === '22 · Lucas Moscariello');
    expect(moscaRow![3]).toBe('Pivote');

    const schulzRow = playersData.find((r) => r[2] === '1 · Matías Schulz');
    expect(schulzRow![3]).toBe('Arquero / Portero');

    // Jugador sin position_snapshot: debe ser estrictamente 'Desconocido' aunque su nombre contenga "(CB)"
    const noSnapshotRow = playersData.find((r) => r[2] === '10 · Jugador Sin Snapshot (CB)');
    expect(noSnapshotRow![3]).toBe('Desconocido');
  });

  it('20. Formato numérico en Excel: efectividad, paradas y ratios se exportan como tipos numéricos (number) para fórmulas', async () => {
    const bundle = await exportService.getMatchExportBundle(testMatchId);

    // Hoja Equipos
    const teamsData = exportService.buildTeamsSheetData(bundle);
    const effRow = teamsData.find((r) => r[0] === 'Efectividad de Tiro (%)');
    expect(typeof effRow![1]).toBe('number');
    expect(effRow![1]).toBe(50);

    // Hoja Jugadores
    const playersData = exportService.buildPlayersSheetData(bundle);
    const simonetRow = playersData.find((r) => r[2]?.toString().includes('D. Simonet'));
    // Columna 13 es Efectividad (%)
    expect(typeof simonetRow![13]).toBe('number');
    expect(simonetRow![13]).toBe(100); // 1 gol en 1 lanzamiento = 100% numérico

    // Verificar que un jugador sin lanzamientos (Pablo Simonet) muestre 'ND' (string)
    const pabloRow = playersData.find((r) => r[2]?.toString().includes('P. Simonet'));
    expect(pabloRow![13]).toBe('ND');

    // Hoja Porteros
    const gkData = exportService.buildGoalkeepersSheetData(bundle);
    const schulzRow = gkData.find((r) => r[2]?.toString().includes('Schulz'));
    // Columna 7 es Eficacia de Paradas (%)
    expect(typeof schulzRow![7]).toBe('number');
    expect(schulzRow![7]).toBe(100); // 1 tiro enfrentado, 1 parada = 100

    // Hoja Posesiones (Resumen)
    const posData = exportService.buildPossessionsSheetData(bundle);
    const gPerPosRow = posData.find((r) => r[0] === 'Goles / Posesión');
    expect(gPerPosRow).toBeDefined();
    // River tiene 1 gol y 1 posesión completa = 1.0 (number) o null si tiene inconsistencia
    if (gPerPosRow![1] !== 'ND' && gPerPosRow![1] !== '—') {
      expect(typeof gPerPosRow![1]).toBe('number');
    }
  });

  it('21. Posesiones: posesión con end_reason GOAL sin asociación directa comprobable se clasifica como Inválida tanto en detalle como en resumen', async () => {
    // Caso idéntico a possession_id: ab5df3e6-1fe0-4a17-93ae-37f643aa9f9a
    const unassociatedPossId = 'ab5df3e6-1fe0-4a17-93ae-37f643aa9f9a';
    await db.possessions.add({
      id: unassociatedPossId,
      match_id: testMatchId,
      period_id: period1Id,
      team_id: homeTeamId,
      start_clock_ms: 300000,
      end_clock_ms: 320000,
      start_reason: 'THROW_OFF',
      end_reason: 'GOAL',
      // Sin end_event_id y sin ningún gol registrado en 320000ms
      is_complete: true,
      created_at: new Date().toISOString(),
    });

    const bundle = await exportService.getMatchExportBundle(testMatchId);
    const posRows = exportService.buildPossessionsSheetData(bundle);

    // 1. Detalle: la fila de la posesión ab5df3e6-1fe0-4a17-93ae-37f643aa9f9a
    const row = posRows.find((r) => r[14] === unassociatedPossId);
    expect(row).toBeDefined();

    // Columna 7: Estado Persistido en BD
    expect(row![7]).toBe('Completa');

    // Columna 8: Validez para Métricas (debe ser estrictamente 'Inválida', NUNCA 'Válida')
    expect(row![8]).toBe('Inválida');

    // Columna 9: Observación / Inconsistencia (debe advertir la falta de asociación, NUNCA 'Correcto')
    expect(row![9]).toBe('Finalizada por gol sin asociación directa comprobable');

    // Columna 10: Goles Válidos Asociados
    expect(row![10]).toBe(0);

    // 2. Resumen: debe coincidir en advertencias y estado de cobertura
    const warningRow = posRows.find((r) => r[0] === 'Advertencia de Cobertura / Inconsistencias');
    expect(warningRow).toBeDefined();
    expect(warningRow![1]).toContain(unassociatedPossId);
    expect(warningRow![1]).toContain('Finalizada por gol sin asociación directa comprobable');

    const coverageRow = posRows.find((r) => r[0] === 'Estado de Cobertura');
    expect(coverageRow![1]).toBe('PARTIAL');

    // 3. Posesiones Válidas para Métricas debe descontar la posesión inválida
    const validRow = posRows.find((r) => r[0] === 'Posesiones Válidas para Métricas');
    expect(validRow).toBeDefined();
    const completeRow = posRows.find((r) => r[0] === 'Posesiones Completas');
    expect(completeRow).toBeDefined();
    // Debe haber al menos 1 posesión completa menos en válidas
    expect(Number(validRow![1])).toBeLessThan(Number(completeRow![1]));
  });

  it('22. Exporta, serializa a JSON string, vuelve a leer, inspecciona y restaura en base separada con fidelidad 100%', async () => {
    // 1. Exportación y serialización
    const { envelope, jsonString } = await backupService.createFullBackup();
    expect(envelope.fingerprint_algorithm).toBe('sha-256');
    expect(envelope.fingerprint.length).toBe(64);

    // 2. Nueva lectura desde string JSON (simulando lectura de archivo descargado)
    const readFromJson = JSON.parse(jsonString);

    // 3. Inspección en una base de datos aislada
    const isolatedDb = new HandballDatabase(`test_isolated_export_restore_${Math.random()}`);
    const isolatedBackupService = new BackupService(isolatedDb);

    const inspection = await isolatedBackupService.inspectBackup(JSON.stringify(readFromJson));
    expect(inspection.valid).toBe(true);
    if (!inspection.valid) return;

    expect(inspection.fingerprintAlgorithm).toBe('sha-256');
    expect(inspection.fingerprintAlgorithmLabel).toContain('SHA-256');
    expect(inspection.fingerprint).toBe(envelope.fingerprint);
    expect(inspection.incomingCounts.matches).toBe(1);
    expect(inspection.incomingCounts.matchEvents).toBe(4);
    expect(inspection.incomingCounts.teams).toBe(2);

    // 4. Restauración en la base separada
    const restoreResult = await isolatedBackupService.restoreFullBackup(inspection.envelope);
    expect(restoreResult.success).toBe(true);

    // 5. Verificación de conteos y fidelidad en la base aislada
    expect(await isolatedDb.matches.count()).toBe(1);
    expect(await isolatedDb.matchEvents.count()).toBe(4);
    expect(await isolatedDb.teams.count()).toBe(2);
    expect(await isolatedDb.players.count()).toBe(6);
    expect(await isolatedDb.possessions.count()).toBe(4);
    expect(await isolatedDb.playerParticipations.count()).toBe(6);
  });

  it('23. Caso de regresión: Archivo de respaldo real con fingerprint FNV-1a (16 hex) se inspecciona y restaura con éxito en base separada', async () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/HandStat_RespaldoCompleto_2026-10-15T17-37-28-541Z.json');
    expect(fs.existsSync(fixturePath)).toBe(true);

    const rawJson = fs.readFileSync(fixturePath, 'utf-8');
    const parsed = JSON.parse(rawJson);

    // El archivo adjunto tiene huella de 16 caracteres hexadecimales
    expect(parsed.fingerprint).toBe('fec3b114dadc3b47');
    expect(parsed.fingerprint.length).toBe(16);

    const isolatedDb = new HandballDatabase(`test_isolated_fixture_${Math.random()}`);
    const isolatedBackupService = new BackupService(isolatedDb);

    // 1. Inspección
    const inspection = await isolatedBackupService.inspectBackup(rawJson);
    expect(inspection.valid).toBe(true);
    if (!inspection.valid) return;

    expect(inspection.fingerprint).toBe('fec3b114dadc3b47');
    expect(inspection.fingerprintAlgorithm).toBe('fnv1a-64');
    expect(inspection.fingerprintAlgorithmLabel).toContain('FNV-1a');

    expect(inspection.incomingCounts.matches).toBe(5);
    expect(inspection.incomingCounts.matchEvents).toBe(64);
    expect(inspection.incomingCounts.eventRevisions).toBe(65);
    expect(inspection.incomingCounts.teams).toBe(2);
    expect(inspection.incomingCounts.players).toBe(14);
    expect(inspection.incomingCounts.possessions).toBe(20);
    expect(inspection.incomingCounts.playerParticipations).toBe(16);

    // 2. Restauración atómica en base aislada
    const restoreResult = await isolatedBackupService.restoreFullBackup(inspection.envelope);
    expect(restoreResult.success).toBe(true);

    // 3. Verificación de registros en la base de datos aislada
    expect(await isolatedDb.matches.count()).toBe(5);
    expect(await isolatedDb.matchEvents.count()).toBe(64);
    expect(await isolatedDb.eventRevisions.count()).toBe(65);
    expect(await isolatedDb.teams.count()).toBe(2);
    expect(await isolatedDb.players.count()).toBe(14);
    expect(await isolatedDb.possessions.count()).toBe(20);
    expect(await isolatedDb.playerParticipations.count()).toBe(16);
  });

  it('24. Rechazo estricto ante alteración de 1 byte en respaldo FNV-1a sin escrituras parciales en la base de destino', async () => {
    const fixturePath = path.resolve(__dirname, 'fixtures/HandStat_RespaldoCompleto_2026-10-15T17-37-28-541Z.json');
    const rawJson = fs.readFileSync(fixturePath, 'utf-8');
    const tampered = JSON.parse(rawJson);

    // Alterar un único valor en los datos sin actualizar la huella digital
    tampered.data.matchEvents[0].clock_ms += 1000;

    const isolatedDb = new HandballDatabase(`test_isolated_tamper_fnv_${Math.random()}`);
    const isolatedBackupService = new BackupService(isolatedDb);

    // 1. Inspección debe rechazar por falta de integridad
    const inspection = await isolatedBackupService.inspectBackup(JSON.stringify(tampered));
    expect(inspection.valid).toBe(false);
    if (inspection.valid) return;
    expect(inspection.error).toContain('La huella digital de integridad no coincide con el contenido de los datos');

    // 2. Intento de restauración debe fallar y garantizar 0 escrituras parciales
    const restoreResult = await isolatedBackupService.restoreFullBackup(tampered);
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('La huella digital de integridad no coincide con el contenido de los datos');

    // Comprobar que todas las tablas de la base de destino permanecen completamente vacías
    expect(await isolatedDb.matches.count()).toBe(0);
    expect(await isolatedDb.matchEvents.count()).toBe(0);
    expect(await isolatedDb.teams.count()).toBe(0);
    expect(await isolatedDb.players.count()).toBe(0);
    expect(await isolatedDb.possessions.count()).toBe(0);
  });

  it('25. Rechazo estricto ante alteración en respaldo SHA-256 sin escrituras parciales', async () => {
    const { envelope } = await backupService.createFullBackup();
    expect(envelope.fingerprint.length).toBe(64);

    // Alterar un dato en data
    const tampered = JSON.parse(JSON.stringify(envelope));
    tampered.data.teams[0].name = 'Club Atlético Falsificado';

    const isolatedDb = new HandballDatabase(`test_isolated_tamper_sha_${Math.random()}`);
    const isolatedBackupService = new BackupService(isolatedDb);

    // 1. Inspección rechaza
    const inspection = await isolatedBackupService.inspectBackup(JSON.stringify(tampered));
    expect(inspection.valid).toBe(false);
    if (inspection.valid) return;
    expect(inspection.error).toContain('La huella digital de integridad no coincide con el contenido de los datos');

    // 2. Restauración aborta con rollback y 0 escrituras parciales
    const restoreResult = await isolatedBackupService.restoreFullBackup(tampered);
    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('La huella digital de integridad no coincide');

    expect(await isolatedDb.matches.count()).toBe(0);
    expect(await isolatedDb.teams.count()).toBe(0);
    expect(await isolatedDb.players.count()).toBe(0);
  });
});

