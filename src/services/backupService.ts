import { HandballDatabase } from '../data/db';
import {
  FullBackupEnvelopeSchema,
  type FullBackupEnvelope,
} from '../domain/schemas';
import {
  computeFingerprint,
  verifyFingerprint,
  type FingerprintAlgorithm,
} from '../utils/fingerprint';

export type BackupInspectionResult =
  | {
      valid: false;
      error: string;
      kind?: string;
    }
  | {
      valid: true;
      envelope: FullBackupEnvelope;
      createdAtFormatted: string;
      appVersion: string;
      fingerprint: string;
      fingerprintAlgorithm: FingerprintAlgorithm;
      fingerprintAlgorithmLabel: string;
      incomingCounts: {
        teams: number;
        players: number;
        matches: number;
        matchPeriods: number;
        matchRosters: number;
        matchEvents: number;
        eventRevisions: number;
        rescueSnapshots: number;
        possessions: number;
        playerParticipations: number;
      };
      currentLocalCounts: {
        teams: number;
        players: number;
        matches: number;
        matchPeriods: number;
        matchRosters: number;
        matchEvents: number;
        eventRevisions: number;
        rescueSnapshots: number;
        possessions: number;
        playerParticipations: number;
      };
    };

export class BackupService {
  constructor(private db: HandballDatabase) {}

  /**
   * Crea un respaldo completo del sistema con todas las tablas locales y huella criptográfica.
   */
  async createFullBackup(): Promise<{ envelope: FullBackupEnvelope; jsonString: string; filename: string }> {
    const [
      teams,
      players,
      matches,
      matchPeriods,
      matchRosters,
      matchEvents,
      eventRevisions,
      rescueSnapshots,
      possessions,
      playerParticipations,
      clockAnchors,
      metadata,
    ] = await Promise.all([
      this.db.teams.toArray(),
      this.db.players.toArray(),
      this.db.matches.toArray(),
      this.db.matchPeriods.toArray(),
      this.db.matchRosters.toArray(),
      this.db.matchEvents.toArray(),
      this.db.eventRevisions.toArray(),
      this.db.rescueSnapshots.toArray(),
      this.db.possessions.toArray(),
      this.db.playerParticipations.toArray(),
      this.db.clockAnchors.toArray(),
      this.db.metadata.toArray(),
    ]);

    // Ordenamiento canónico y determinista
    teams.sort((a, b) => a.id.localeCompare(b.id));
    players.sort((a, b) => a.id.localeCompare(b.id));
    matches.sort((a, b) => a.id.localeCompare(b.id));
    matchPeriods.sort((a, b) => {
      const cmp = a.match_id.localeCompare(b.match_id);
      return cmp !== 0 ? cmp : a.number - b.number;
    });
    matchRosters.sort((a, b) => {
      const cmp = a.match_id.localeCompare(b.match_id);
      return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
    });
    matchEvents.sort((a, b) => {
      const cmp = a.match_id.localeCompare(b.match_id);
      if (cmp !== 0) return cmp;
      if (a.clock_ms !== b.clock_ms) return a.clock_ms - b.clock_ms;
      return a.sport_seq - b.sport_seq;
    });
    eventRevisions.sort((a, b) => a.id.localeCompare(b.id));
    rescueSnapshots.sort((a, b) => a.id.localeCompare(b.id));
    possessions.sort((a, b) => {
      const cmp = a.match_id.localeCompare(b.match_id);
      if (cmp !== 0) return cmp;
      return a.start_clock_ms - b.start_clock_ms;
    });
    playerParticipations.sort((a, b) => {
      const cmp = a.match_id.localeCompare(b.match_id);
      if (cmp !== 0) return cmp;
      return a.in_clock_ms - b.in_clock_ms;
    });
    clockAnchors.sort((a, b) => a.match_id.localeCompare(b.match_id));
    metadata.sort((a, b) => a.key.localeCompare(b.key));

    const backupData = {
      teams,
      players,
      matches,
      matchPeriods,
      matchRosters,
      matchEvents,
      eventRevisions,
      rescueSnapshots,
      possessions,
      playerParticipations,
      clockAnchors,
      metadata,
    };

    const fingerprint = computeFingerprint(backupData, 'sha-256');

    const envelope: FullBackupEnvelope = {
      schema_version: '1.0.0',
      backup_kind: 'full_local_database',
      created_at: new Date().toISOString(),
      app_version: 'HandStat v0.5.0',
      counts: {
        teams: teams.length,
        players: players.length,
        matches: matches.length,
        matchPeriods: matchPeriods.length,
        matchRosters: matchRosters.length,
        matchEvents: matchEvents.length,
        eventRevisions: eventRevisions.length,
        rescueSnapshots: rescueSnapshots.length,
        possessions: possessions.length,
        playerParticipations: playerParticipations.length,
      },
      fingerprint,
      fingerprint_algorithm: 'sha-256',
      data: backupData,
    };

    // Validar integridad estructural con Zod antes de emitir
    FullBackupEnvelopeSchema.parse(envelope);

    const jsonString = JSON.stringify(envelope, null, 2);
    const dateStr = envelope.created_at.replace(/[:.]/g, '-');
    const filename = `HandStat_RespaldoCompleto_${dateStr}.json`;

    return { envelope, jsonString, filename };
  }

  /**
   * Inspecciona y valida un archivo de respaldo antes de su aplicación.
   * Compara los datos entrantes con el estado actual de la base de datos local.
   */
  async inspectBackup(input: string | unknown): Promise<BackupInspectionResult> {
    let parsed: any;
    if (typeof input === 'string') {
      try {
        parsed = JSON.parse(input);
      } catch (e: any) {
        return {
          valid: false,
          error: `El archivo no contiene un formato JSON válido: ${e?.message || 'Error de sintaxis'}`,
        };
      }
    } else {
      parsed = input;
    }

    // Diferenciar de un sobre de transferencia de partido individual
    if (parsed.export_kind === 'single_match') {
      return {
        valid: false,
        kind: 'single_match',
        error:
          'El archivo seleccionado es una transferencia de un único partido («single_match»), no un respaldo completo del sistema. Para importar este partido individual, utilice la pestaña de Transferencia de Partidos.',
      };
    }

    if (parsed.backup_kind !== 'full_local_database') {
      return {
        valid: false,
        kind: parsed.backup_kind || 'unknown',
        error: `Tipo de archivo incompatible («${parsed.backup_kind || 'desconocido'}»). Se requiere «full_local_database».`,
      };
    }

    // 1. Verificación preliminar de presencia de contenido y huella
    if (!parsed.data || typeof parsed.data !== 'object' || !parsed.fingerprint) {
      return {
        valid: false,
        error: 'El archivo no contiene la sección de datos requerida («data») o carece de huella digital de integridad («fingerprint»).',
      };
    }

    // 2. Verificación criptográfica de huella digital de integridad
    // CRÍTICO: Debe ejecutarse sobre los datos canónicos parsed.data ANTES de cualquier
    // mutación o inyección de valores por defecto que Zod pudiera agregar al esquematizar.
    const verification = verifyFingerprint(
      parsed.data,
      parsed.fingerprint,
      parsed.fingerprint_algorithm
    );

    if (!verification.valid) {
      return {
        valid: false,
        error:
          'La huella digital de integridad no coincide con el contenido de los datos. El archivo ha sido alterado, corrompido o truncado.',
      };
    }

    // 3. Validación de esquema Zod para verificar tipado y completitud estructural
    const parseResult = FullBackupEnvelopeSchema.safeParse(parsed);
    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      return {
        valid: false,
        error: `Estructura de respaldo inválida o incompleta: en "${issue?.path.join('.') || 'raíz'}" — ${issue?.message}`,
      };
    }

    // CRÍTICO: Preservar parsed.data original intacto para que la huella digital y la serialización
    // no sufran mutaciones provocadas por inyecciones de valores por defecto de esquemas Zod (.default(...))
    const envelope: FullBackupEnvelope = {
      ...parseResult.data,
      data: parsed.data,
    };

    // Obtener conteos locales actuales
    const [
      localTeams,
      localPlayers,
      localMatches,
      localPeriods,
      localRosters,
      localEvents,
      localRevisions,
      localRescues,
      localPossessions,
      localParticipations,
    ] = await Promise.all([
      this.db.teams.count(),
      this.db.players.count(),
      this.db.matches.count(),
      this.db.matchPeriods.count(),
      this.db.matchRosters.count(),
      this.db.matchEvents.count(),
      this.db.eventRevisions.count(),
      this.db.rescueSnapshots.count(),
      this.db.possessions.count(),
      this.db.playerParticipations.count(),
    ]);

    const date = new Date(envelope.created_at);
    const createdAtFormatted = isNaN(date.getTime())
      ? envelope.created_at
      : date.toLocaleString('es-AR', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

    const algorithmLabel =
      verification.algorithm === 'sha-256'
        ? 'SHA-256 (64 caracteres)'
        : 'FNV-1a (64-bit, retrocompatible)';

    return {
      valid: true,
      envelope,
      createdAtFormatted,
      appVersion: envelope.app_version,
      fingerprint: envelope.fingerprint,
      fingerprintAlgorithm: verification.algorithm,
      fingerprintAlgorithmLabel: algorithmLabel,
      incomingCounts: envelope.counts,
      currentLocalCounts: {
        teams: localTeams,
        players: localPlayers,
        matches: localMatches,
        matchPeriods: localPeriods,
        matchRosters: localRosters,
        matchEvents: localEvents,
        eventRevisions: localRevisions,
        rescueSnapshots: localRescues,
        possessions: localPossessions,
        playerParticipations: localParticipations,
      },
    };
  }

  /**
   * Restaura atómicamente todos los datos del respaldo.
   * Si ocurre cualquier error, la transacción revierte todos los cambios de manera íntegra.
   */
  async restoreFullBackup(envelope: FullBackupEnvelope): Promise<{
    success: boolean;
    error?: string;
    restoredCounts: Record<string, number>;
    totalRestored?: number;
  }> {
    try {
      // 1. Validación previa de consistencia estructural
      FullBackupEnvelopeSchema.parse(envelope);

      // 2. Verificación previa de integridad criptográfica de la huella
      const verification = verifyFingerprint(
        envelope.data,
        envelope.fingerprint,
        envelope.fingerprint_algorithm
      );

      if (!verification.valid) {
        return {
          success: false,
          error:
            'La huella digital de integridad no coincide con el contenido de los datos. Operación abortada sin modificar la base de datos.',
          restoredCounts: {},
          totalRestored: 0,
        };
      }

      await this.db.transaction(
        'rw',
        [
          this.db.teams,
          this.db.players,
          this.db.matches,
          this.db.matchPeriods,
          this.db.matchRosters,
          this.db.matchEvents,
          this.db.eventRevisions,
          this.db.rescueSnapshots,
          this.db.possessions,
          this.db.playerParticipations,
          this.db.clockAnchors,
          this.db.metadata,
        ],
        async () => {
          // 1. Limpieza completa de todas las tablas existentes
          await Promise.all([
            this.db.teams.clear(),
            this.db.players.clear(),
            this.db.matches.clear(),
            this.db.matchPeriods.clear(),
            this.db.matchRosters.clear(),
            this.db.matchEvents.clear(),
            this.db.eventRevisions.clear(),
            this.db.rescueSnapshots.clear(),
            this.db.possessions.clear(),
            this.db.playerParticipations.clear(),
            this.db.clockAnchors.clear(),
            this.db.metadata.clear(),
          ]);

          // 2. Inserción masiva de los datos del respaldo
          const { data } = envelope;

          if (data.teams && data.teams.length > 0) {
            await this.db.teams.bulkAdd(data.teams);
          }
          if (data.players && data.players.length > 0) {
            await this.db.players.bulkAdd(data.players);
          }
          if (data.matches && data.matches.length > 0) {
            await this.db.matches.bulkAdd(data.matches);
          }
          if (data.matchPeriods && data.matchPeriods.length > 0) {
            await this.db.matchPeriods.bulkAdd(data.matchPeriods);
          }
          if (data.matchRosters && data.matchRosters.length > 0) {
            await this.db.matchRosters.bulkAdd(data.matchRosters);
          }
          if (data.matchEvents && data.matchEvents.length > 0) {
            await this.db.matchEvents.bulkAdd(data.matchEvents);
          }
          if (data.eventRevisions && data.eventRevisions.length > 0) {
            await this.db.eventRevisions.bulkAdd(data.eventRevisions);
          }
          if (data.rescueSnapshots && data.rescueSnapshots.length > 0) {
            await this.db.rescueSnapshots.bulkAdd(data.rescueSnapshots);
          }
          if (data.possessions && data.possessions.length > 0) {
            await this.db.possessions.bulkAdd(data.possessions);
          }
          if (data.playerParticipations && data.playerParticipations.length > 0) {
            await this.db.playerParticipations.bulkAdd(data.playerParticipations);
          }
          if (data.clockAnchors && data.clockAnchors.length > 0) {
            await this.db.clockAnchors.bulkAdd(data.clockAnchors);
          }
          if (data.metadata && data.metadata.length > 0) {
            await this.db.metadata.bulkAdd(data.metadata);
          }
        }
      );

      const totalRestored = Object.values(envelope.counts).reduce((sum, n) => sum + n, 0);

      return {
        success: true,
        restoredCounts: envelope.counts,
        totalRestored,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Error durante la restauración atómica: ${err?.message || 'Fallo desconocido'}`,
        restoredCounts: {},
        totalRestored: 0,
      };
    }
  }
}
