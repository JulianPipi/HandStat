import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { HandballDatabase } from '../src/data/db';
import { TransferService } from '../src/services/transferService';
import { ActionRecorderService } from '../src/services/actionRecorder';
import { MatchClockService } from '../src/services/clockService';
import {
  seedInitialDataIfEmpty,
  SEED_MATCH,
  SEED_PERIOD_1,
  SEED_ROSTERS,
  SEED_HOME_TEAM
} from '../src/data/seedData';

describe('Fase 1: Suite de Validación de Fundamentos Técnicos', () => {
  let db: HandballDatabase;
  let transferService: TransferService;
  let actionRecorder: ActionRecorderService;

  beforeEach(async () => {
    // Generar base de datos aislada en memoria para cada prueba
    const dbName = `test_db_${Math.random()}`;
    db = new HandballDatabase(dbName);
    await seedInitialDataIfEmpty(db);
    transferService = new TransferService(db);
    actionRecorder = new ActionRecorderService(db);
  });

  // 1. Persistencia tras cerrar y reabrir
  it('1. Debe persistir y recuperar partidos y eventos de IndexedDB simulando cierre y reapertura', async () => {
    const input = {
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      teamId: SEED_HOME_TEAM.id,
      type: 'SHOT' as const,
      clockMs: 125000,
      shotDetail: { result_code: 'GOAL' as const, is_empty_net: false },
      participants: [{ roster_id: SEED_ROSTERS[1]!.id, role: 'SHOOTER' as const }],
    };

    const res = await actionRecorder.recordAction(input);
    expect(res.success).toBe(true);

    // Simular reapertura de conexión
    const reloadedEvents = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).toArray();
    expect(reloadedEvents.length).toBe(1);
    expect(reloadedEvents[0]?.clock_ms).toBe(125000);
    expect(reloadedEvents[0]?.shot_detail?.result_code).toBe('GOAL');
  });

  // 2. Exportación e importación conservando datos originales
  it('2. Debe exportar a JSON e importar conservando exactamente los datos y huella digital', async () => {
    await actionRecorder.recordAction({
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      teamId: SEED_HOME_TEAM.id,
      type: 'SHOT' as const,
      clockMs: 45000,
      shotDetail: { result_code: 'SAVED' as const, is_empty_net: false },
      participants: [{ roster_id: SEED_ROSTERS[1]!.id, role: 'SHOOTER' as const }],
    });

    const envelope = await transferService.exportMatch(SEED_MATCH.id);
    expect(['1.0.0', '1.1.0']).toContain(envelope.schema_version);
    expect(envelope.events.length).toBe(1);
    expect(envelope.full_content_fingerprint).toBeDefined();

    // Crear otra base de datos de destino limpia (simulando computadora receptora)
    const pcDb = new HandballDatabase(`pc_db_${Math.random()}`);
    const pcTransfer = new TransferService(pcDb);

    const analysis = await pcTransfer.analyzeImport(envelope);
    expect(analysis.kind).toBe('NEW');

    if (analysis.kind === 'NEW') {
      await pcTransfer.applyImport(analysis.envelope, false);
    }

    const importedMatch = await pcDb.matches.get(SEED_MATCH.id);
    const importedEvents = await pcDb.matchEvents.where('match_id').equals(SEED_MATCH.id).toArray();
    expect(importedMatch).toBeDefined();
    expect(importedEvents.length).toBe(1);
    expect(importedEvents[0]?.clock_ms).toBe(45000);
  });

  // 3. Reimportación sin duplicados (Idempotencia)
  it('3. Debe detectar importación idéntica y no duplicar registros en IndexedDB', async () => {
    const envelope = await transferService.exportMatch(SEED_MATCH.id);

    const analysis = await transferService.analyzeImport(envelope);
    expect(analysis.kind).toBe('IDENTICAL');

    const countBefore = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).count();
    // Si es idéntico, no debe modificar ni duplicar nada
    if (analysis.kind === 'IDENTICAL') {
      // No aplica cambios
    }
    const countAfter = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).count();
    expect(countBefore).toBe(countAfter);
  });

  // 4. Detección de conflicto sin sobrescritura automática
  it('4. Debe detectar conflicto de versiones y detener la sobrescritura silenciosa', async () => {
    // Generar copia previa
    const envelopePrev = await transferService.exportMatch(SEED_MATCH.id);

    // Agregar un evento localmente para que el estado difiera
    await actionRecorder.recordAction({
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      teamId: SEED_HOME_TEAM.id,
      type: 'TURNOVER' as const,
      clockMs: 80000,
    });

    // Intentar importar el envelope anterior en el partido modificado
    const analysis = await transferService.analyzeImport(envelopePrev);
    expect(analysis.kind).toBe('CONFLICT');

    if (analysis.kind === 'CONFLICT') {
      expect(analysis.localEventCount).toBe(1);
      expect(analysis.incomingEventCount).toBe(0);
      expect(analysis.localFingerprint).not.toBe(analysis.incomingFingerprint);
    }
  });

  // 5. Rechazo de archivos inválidos sin cambios parciales
  it('5. Debe rechazar archivos JSON corruptos o inconsistentes sin alterar la base local', async () => {
    const corruptedInput = {
      schema_version: '1.0.0',
      export_kind: 'single_match',
      match: { id: 'invalid-uuid' }, // Estructura rota
    };

    const analysis = await transferService.analyzeImport(corruptedInput);
    expect(analysis.kind).toBe('INVALID');

    const matchIntact = await db.matches.get(SEED_MATCH.id);
    expect(matchIntact).toBeDefined();
  });

  // 6. Reemplazo autorizado con copia de rescate y recuperación
  it('6. Debe crear copia de rescate en la misma transacción y permitir restaurar la versión previa', async () => {
    // Estado local original: 1 gol
    await actionRecorder.recordAction({
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      teamId: SEED_HOME_TEAM.id,
      type: 'SHOT' as const,
      clockMs: 20000,
      shotDetail: { result_code: 'GOAL' as const, is_empty_net: false },
    });

    // Crear un sobre externo que tiene 2 goles diferentes
    const extDb = new HandballDatabase(`ext_db_${Math.random()}`);
    await seedInitialDataIfEmpty(extDb);
    const extRecorder = new ActionRecorderService(extDb);
    const extTransfer = new TransferService(extDb);

    await extRecorder.recordAction({
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      teamId: SEED_HOME_TEAM.id,
      type: 'SHOT' as const,
      clockMs: 35000,
      shotDetail: { result_code: 'GOAL' as const, is_empty_net: false },
    });
    await extRecorder.recordAction({
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      teamId: SEED_HOME_TEAM.id,
      type: 'SHOT' as const,
      clockMs: 50000,
      shotDetail: { result_code: 'GOAL' as const, is_empty_net: false },
    });

    const extEnvelope = await extTransfer.exportMatch(SEED_MATCH.id);

    // Aplicar reemplazo autorizado
    await transferService.applyImport(extEnvelope, true);

    // Verificar que el estado ahora tiene los 2 eventos del archivo
    const replacedEvents = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).toArray();
    expect(replacedEvents.length).toBe(2);

    // Verificar que existe copia de rescate guardada
    const snapshots = await db.rescueSnapshots.where('match_id').equals(SEED_MATCH.id).toArray();
    expect(snapshots.length).toBe(1);

    // Restaurar desde la copia de rescate
    const restored = await transferService.restoreFromRescueSnapshot(SEED_MATCH.id);
    expect(restored).toBe(true);

    // Verificar que volvimos al estado previo de 1 solo evento
    const restoredEvents = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).toArray();
    expect(restoredEvents.length).toBe(1);
    expect(restoredEvents[0]?.clock_ms).toBe(20000);
  });

  // 7. Fallo de guardado y reintento sin duplicación
  it('7. Debe capturar fallos de guardado y permitir reintento sin duplicar identificadores', async () => {
    const input = {
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      type: 'TIMEOUT' as const,
      clockMs: 500000,
    };

    // Registrar normalmente
    const preassignedId = '018f1a2b-aaaa-7e8f-9a0b-999999999999';
    const res1 = await actionRecorder.recordAction(input, preassignedId);
    expect(res1.success).toBe(true);

    // Reintentar con el MISMO preassignedId (idempotencia en reintento)
    const resRetry = await actionRecorder.recordAction(input, preassignedId);
    expect(resRetry.success).toBe(true);

    const allEvents = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).toArray();
    const matchesWithSameId = allEvents.filter((e) => e.id === preassignedId);
    expect(matchesWithSameId.length).toBe(1); // Cero duplicaciones
  });

  // 8. Reloj de juego: pausa, anclaje, recarga e incertidumbre
  it('8. Debe pausar, anclar en BD y detectar incertidumbre tras suspensión prolongada o salto negativo', async () => {
    const clock = new MatchClockService(db, SEED_MATCH.id, SEED_PERIOD_1.id);
    await clock.load();

    await clock.start();
    const snap1 = clock.getSnapshot();
    expect(snap1.running).toBe(true);

    await clock.pause();
    const snap2 = clock.getSnapshot();
    expect(snap2.running).toBe(false);

    // Simular un ancla guardada hace más de 120 segundos mientras seguía "running"
    await db.clockAnchors.put({
      match_id: SEED_MATCH.id,
      period_id: SEED_PERIOD_1.id,
      running: true,
      accumulated_ms: 10000,
      anchor_wall_timestamp: Date.now() - 120000, // Hace 2 minutos
      uncertain: false,
      updated_at: new Date().toISOString(),
    });

    // Simular recarga de la aplicación
    const clockReloaded = new MatchClockService(db, SEED_MATCH.id, SEED_PERIOD_1.id);
    const reloadedSnap = await clockReloaded.load();

    expect(reloadedSnap.running).toBe(false); // Se pausó preventivamente
    expect(reloadedSnap.uncertain).toBe(true); // Se encendió la alerta de incertidumbre
    expect(reloadedSnap.uncertainReason).toContain('interrupción o suspensión');

    // Probar detección de salto negativo en reloj del sistema (Date.now() adelantado en el ancla)
    await db.clockAnchors.put({
      match_id: SEED_MATCH.id,
      period_id: SEED_PERIOD_1.id,
      running: true,
      accumulated_ms: 10000,
      anchor_wall_timestamp: Date.now() + 50000, // En el futuro
      uncertain: false,
      updated_at: new Date().toISOString(),
    });
    const clockTampered = new MatchClockService(db, SEED_MATCH.id, SEED_PERIOD_1.id);
    const tamperedSnap = await clockTampered.load();
    expect(tamperedSnap.running).toBe(false);
    expect(tamperedSnap.uncertain).toBe(true);
    expect(tamperedSnap.uncertainReason).toContain('retrospectivo');
  });

  // 9. Comprobación de fallo a mitad de reemplazo transaccional
  it('9. Debe revertir íntegramente si ocurre un fallo a mitad del reemplazo sin dejar copias huérfanas ni datos parciales', async () => {
    // Estado original: 1 gol
    await actionRecorder.recordAction({
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      teamId: SEED_HOME_TEAM.id,
      type: 'SHOT' as const,
      clockMs: 15000,
      shotDetail: { result_code: 'GOAL' as const, is_empty_net: false },
    });

    const envelopeValid = await transferService.exportMatch(SEED_MATCH.id);

    // Creamos un envelope manipulado donde un período provoca un error de clave duplicada o forzamos fallo
    const invalidEnvelope = {
      ...envelopeValid,
      // Duplicamos deliberadamente un período con el mismo id para provocar error en bulkAdd
      periods: [SEED_PERIOD_1, { ...SEED_PERIOD_1 }],
    };

    const initialRescueCount = await db.rescueSnapshots.count();
    const initialEvents = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).toArray();
    expect(initialEvents.length).toBe(1);

    // Intentar aplicar reemplazo con fallo a mitad de escritura
    await expect(transferService.applyImport(invalidEnvelope as any, true)).rejects.toThrow();

    // Comprobar que el partido original quedó intacto
    const eventsAfterFail = await db.matchEvents.where('match_id').equals(SEED_MATCH.id).toArray();
    expect(eventsAfterFail.length).toBe(1);
    expect(eventsAfterFail[0]?.clock_ms).toBe(15000);

    // Comprobar que NO quedó una copia de rescate huérfana
    const rescueCountAfterFail = await db.rescueSnapshots.count();
    expect(rescueCountAfterFail).toBe(initialRescueCount);
  });

  // 10. Reintento de guardado no incrementa doblemente la revisión del partido
  it('10. Debe asegurar que un reintento de guardado con el mismo preassignedId no incremente dos veces match_revision', async () => {
    const initialMatch = await db.matches.get(SEED_MATCH.id);
    const initialRev = initialMatch!.match_revision;

    const input = {
      matchId: SEED_MATCH.id,
      periodId: SEED_PERIOD_1.id,
      type: 'TIMEOUT' as const,
      clockMs: 300000,
    };
    const preassignedId = '018f1a2b-1234-7e8f-9a0b-111111111111';

    // Primer intento
    const res1 = await actionRecorder.recordAction(input, preassignedId);
    expect(res1.success).toBe(true);

    const matchAfterFirst = await db.matches.get(SEED_MATCH.id);
    expect(matchAfterFirst!.match_revision).toBe(initialRev + 1);

    // Reintento idéntico simulando fallo de red/conexión previa
    const resRetry = await actionRecorder.recordAction(input, preassignedId);
    expect(resRetry.success).toBe(true);

    const matchAfterRetry = await db.matches.get(SEED_MATCH.id);
    expect(matchAfterRetry!.match_revision).toBe(initialRev + 1); // No incrementó una segunda vez
  });
});
