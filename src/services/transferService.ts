import { v4 as uuidv4 } from 'uuid';
import { HandballDatabase } from '../data/db';
import {
  MatchExportEnvelopeSchema,
  type MatchExportEnvelope
} from '../domain/schemas';
import { computeFingerprint } from '../utils/fingerprint';

export type ImportAnalysisResult =
  | { kind: 'INVALID'; error: string }
  | { kind: 'NEW'; envelope: MatchExportEnvelope }
  | { kind: 'IDENTICAL'; envelope: MatchExportEnvelope }
  | {
      kind: 'CONFLICT';
      envelope: MatchExportEnvelope;
      localEventCount: number;
      incomingEventCount: number;
      localRevision: number;
      incomingRevision: number;
      localFingerprint: string;
      incomingFingerprint: string;
    };

export class TransferService {
  constructor(private db: HandballDatabase) {}

  /**
   * Exporta un partido individual completo empaquetado con su huella digital exhaustiva.
   */
  async exportMatch(matchId: string, deviceId = uuidv4()): Promise<MatchExportEnvelope> {
    const match = await this.db.matches.get(matchId);
    if (!match) {
      throw new Error(`Partido con id ${matchId} no encontrado`);
    }

    const [homeTeam, awayTeam] = await Promise.all([
      this.db.teams.get(match.home_team_id),
      this.db.teams.get(match.away_team_id),
    ]);

    if (!homeTeam || !awayTeam) {
      throw new Error('Equipos del partido no encontrados en la base local');
    }

    const [rosters, periods, events, revisions, possessions, participations] = await Promise.all([
      this.db.matchRosters.where('match_id').equals(matchId).toArray(),
      this.db.matchPeriods.where('match_id').equals(matchId).toArray(),
      this.db.matchEvents.where('match_id').equals(matchId).toArray(),
      this.db.eventRevisions.where('match_id').equals(matchId).toArray(),
      this.db.possessions.where('match_id').equals(matchId).toArray(),
      this.db.playerParticipations.where('match_id').equals(matchId).toArray(),
    ]);

    // Ordenar períodos y eventos para garantizar determinismo en el hash
    periods.sort((a, b) => a.number - b.number);
    events.sort((a, b) => {
      if (a.clock_ms !== b.clock_ms) return a.clock_ms - b.clock_ms;
      return a.sport_seq - b.sport_seq;
    });
    possessions.sort((a, b) => a.start_clock_ms - b.start_clock_ms);
    participations.sort((a, b) => a.in_clock_ms - b.in_clock_ms);

    const transferablePayload = {
      match,
      teams: [homeTeam, awayTeam],
      rosters,
      periods,
      events,
      revisions,
      possessions,
      participations,
    };

    const fingerprint = computeFingerprint(transferablePayload);

    const envelope: MatchExportEnvelope = {
      schema_version: '1.1.0',
      export_kind: 'single_match',
      exported_at: new Date().toISOString(),
      exported_by_device_id: deviceId,
      app_version: '0.3.0',
      full_content_fingerprint: fingerprint,
      match,
      teams: [homeTeam, awayTeam],
      rosters,
      periods,
      events,
      revisions,
      possessions,
      participations,
    };

    // Validar el envelope contra el esquema Zod antes de emitir
    return MatchExportEnvelopeSchema.parse(envelope);
  }

  /**
   * Calcula la huella determinista sobre un sobre de exportación
   */
  computeEnvelopeFingerprint(envelope: MatchExportEnvelope): string {
    const transferablePayload = {
      match: envelope.match,
      teams: envelope.teams,
      rosters: envelope.rosters,
      periods: envelope.periods,
      events: envelope.events,
      revisions: envelope.revisions,
      possessions: envelope.possessions,
      participations: envelope.participations,
    };
    return computeFingerprint(transferablePayload);
  }

  /**
   * Analiza un archivo JSON de partido entrante comparándolo con el estado local.
   * Realiza validación estructural y de consistencia referencial profunda.
   */
  async analyzeImport(jsonInput: unknown): Promise<ImportAnalysisResult> {
    // 1. Validación de esquema Zod
    const parseResult = MatchExportEnvelopeSchema.safeParse(jsonInput);
    if (!parseResult.success) {
      return {
        kind: 'INVALID',
        error: `Estructura JSON inválida: ${parseResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`,
      };
    }

    const envelope = parseResult.data;

    // 2. Validación de consistencia referencial interna profunda
    const periodIds = new Set(envelope.periods.map((p) => p.id));
    const teamIds = new Set(envelope.teams.map((t) => t.id));
    const rosterIds = new Set(envelope.rosters.map((r) => r.id));

    if (envelope.teams.length !== 2) {
      return { kind: 'INVALID', error: 'El sobre debe contener exactamente 2 equipos' };
    }

    if (!teamIds.has(envelope.match.home_team_id) || !teamIds.has(envelope.match.away_team_id)) {
      return { kind: 'INVALID', error: 'Los equipos del partido no coinciden con la lista de equipos incluida' };
    }

    for (const ev of envelope.events) {
      if (!periodIds.has(ev.period_id)) {
        return { kind: 'INVALID', error: `Evento ${ev.id} referencia un period_id inexistente: ${ev.period_id}` };
      }
      if (ev.match_team_id && !teamIds.has(ev.match_team_id)) {
        return { kind: 'INVALID', error: `Evento ${ev.id} referencia un match_team_id que no participa del partido` };
      }
      for (const p of ev.participants) {
        if (!rosterIds.has(p.roster_id)) {
          return { kind: 'INVALID', error: `Participante con rol ${p.role} en evento ${ev.id} referencia un roster_id inexistente: ${p.roster_id}` };
        }
      }
    }

    // 3. Comprobar existencia previa en base local
    const existingMatch = await this.db.matches.get(envelope.match.id);
    if (!existingMatch) {
      return { kind: 'NEW', envelope };
    }

    // 4. Recalcular la huella digital exhaustiva desde el contenido recibido en sí mismo (sin confiar ciegamente en el string del sobre)
    const incomingTransferablePayload = envelope.schema_version === '1.0.0'
      ? {
          match: envelope.match,
          teams: envelope.teams,
          rosters: envelope.rosters,
          periods: envelope.periods,
          events: envelope.events,
          revisions: envelope.revisions,
        }
      : {
          match: envelope.match,
          teams: envelope.teams,
          rosters: envelope.rosters,
          periods: envelope.periods,
          events: envelope.events,
          revisions: envelope.revisions,
          possessions: envelope.possessions || [],
          participations: envelope.participations || [],
        };
    const recalculatedIncomingFingerprint = computeFingerprint(incomingTransferablePayload);

    // Comparar contra el estado local actual
    const localEnvelope = await this.exportMatch(existingMatch.id);
    if (localEnvelope.full_content_fingerprint === recalculatedIncomingFingerprint) {
      return { kind: 'IDENTICAL', envelope };
    }

    // 5. Conflicto / Diferencias de versión
    const localEventsCount = await this.db.matchEvents.where('match_id').equals(existingMatch.id).count();

    return {
      kind: 'CONFLICT',
      envelope,
      localEventCount: localEventsCount,
      incomingEventCount: envelope.events.length,
      localRevision: existingMatch.match_revision,
      incomingRevision: envelope.match.match_revision,
      localFingerprint: localEnvelope.full_content_fingerprint,
      incomingFingerprint: envelope.full_content_fingerprint,
    };
  }

  /**
   * Aplica la importación de forma atómica en IndexedDB.
   * Si el partido ya existía, genera previamente el snapshot de rescate y sobrescribe
   * todo en una ÚNICA transacción. Si algo falla, se revierte por completo.
   * Preserva equipos o jugadores compartidos ya existentes en el dispositivo.
   */
  async applyImport(envelope: MatchExportEnvelope, allowOverwrite = false): Promise<void> {
    const matchId = envelope.match.id;

    await this.db.transaction(
      'rw',
      [
        this.db.matches,
        this.db.teams,
        this.db.matchPeriods,
        this.db.matchRosters,
        this.db.matchEvents,
        this.db.eventRevisions,
        this.db.possessions,
        this.db.playerParticipations,
        this.db.rescueSnapshots,
      ],
      async () => {
        const existingMatch = await this.db.matches.get(matchId);

        if (existingMatch) {
          if (!allowOverwrite) {
            throw new Error('El partido ya existe localmente y no se autorizó el reemplazo');
          }

          // 1. Guardar Snapshot de Rescate con el estado local previo íntegro
          const [oldRosters, oldPeriods, oldEvents, oldRevisions, oldPossessions, oldParticipations] = await Promise.all([
            this.db.matchRosters.where('match_id').equals(matchId).toArray(),
            this.db.matchPeriods.where('match_id').equals(matchId).toArray(),
            this.db.matchEvents.where('match_id').equals(matchId).toArray(),
            this.db.eventRevisions.where('match_id').equals(matchId).toArray(),
            this.db.possessions.where('match_id').equals(matchId).toArray(),
            this.db.playerParticipations.where('match_id').equals(matchId).toArray(),
          ]);

          const rescuePayload = {
            match: existingMatch,
            rosters: oldRosters,
            periods: oldPeriods,
            events: oldEvents,
            revisions: oldRevisions,
            possessions: oldPossessions,
            participations: oldParticipations,
          };

          await this.db.rescueSnapshots.add({
            id: uuidv4(),
            match_id: matchId,
            created_at: new Date().toISOString(),
            reason: 'pre_import_overwrite',
            full_payload: rescuePayload,
          });

          // 2. Limpiar colecciones hijas del partido previo
          await Promise.all([
            this.db.matchEvents.where('match_id').equals(matchId).delete(),
            this.db.matchRosters.where('match_id').equals(matchId).delete(),
            this.db.matchPeriods.where('match_id').equals(matchId).delete(),
            this.db.eventRevisions.where('match_id').equals(matchId).delete(),
            this.db.possessions.where('match_id').equals(matchId).delete(),
            this.db.playerParticipations.where('match_id').equals(matchId).delete(),
          ]);
        }

        // 3. Preservar equipos compartidos: sólo insertar si no existen en el dispositivo
        for (const team of envelope.teams) {
          const localTeam = await this.db.teams.get(team.id);
          if (!localTeam) {
            await this.db.teams.add(team);
          }
        }

        // 4. Guardar partido y todas sus entidades hijas de forma atómica
        await this.db.matches.put(envelope.match);
        await this.db.matchPeriods.bulkAdd(envelope.periods);
        await this.db.matchRosters.bulkAdd(envelope.rosters);
        await this.db.matchEvents.bulkAdd(envelope.events);
        await this.db.eventRevisions.bulkAdd(envelope.revisions);
        if (envelope.possessions && envelope.possessions.length > 0) {
          await this.db.possessions.bulkAdd(envelope.possessions);
        }
        if (envelope.participations && envelope.participations.length > 0) {
          await this.db.playerParticipations.bulkAdd(envelope.participations);
        }
      }
    );
  }

  /**
   * Revierte la última importación recuperando la copia de rescate local.
   */
  async restoreFromRescueSnapshot(matchId: string): Promise<boolean> {
    const snapshots = await this.db.rescueSnapshots
      .where('match_id')
      .equals(matchId)
      .reverse()
      .sortBy('created_at');

    const latest = snapshots[0];
    if (!latest) return false;

    const payload = latest.full_payload as {
      match: any;
      rosters: any[];
      periods: any[];
      events: any[];
      revisions: any[];
      possessions?: any[];
      participations?: any[];
    };

    await this.db.transaction(
      'rw',
      [
        this.db.matches,
        this.db.matchPeriods,
        this.db.matchRosters,
        this.db.matchEvents,
        this.db.eventRevisions,
        this.db.possessions,
        this.db.playerParticipations,
        this.db.rescueSnapshots,
      ],
      async () => {
        // Eliminar estado actual
        await Promise.all([
          this.db.matches.delete(matchId),
          this.db.matchEvents.where('match_id').equals(matchId).delete(),
          this.db.matchRosters.where('match_id').equals(matchId).delete(),
          this.db.matchPeriods.where('match_id').equals(matchId).delete(),
          this.db.eventRevisions.where('match_id').equals(matchId).delete(),
          this.db.possessions.where('match_id').equals(matchId).delete(),
          this.db.playerParticipations.where('match_id').equals(matchId).delete(),
        ]);

        // Restaurar estado guardado en el snapshot
        await this.db.matches.put(payload.match);
        await this.db.matchPeriods.bulkAdd(payload.periods);
        await this.db.matchRosters.bulkAdd(payload.rosters);
        await this.db.matchEvents.bulkAdd(payload.events);
        await this.db.eventRevisions.bulkAdd(payload.revisions);
        if (payload.possessions && payload.possessions.length > 0) {
          await this.db.possessions.bulkAdd(payload.possessions);
        }
        if (payload.participations && payload.participations.length > 0) {
          await this.db.playerParticipations.bulkAdd(payload.participations);
        }

        // Remover el snapshot utilizado
        await this.db.rescueSnapshots.delete(latest.id);
      }
    );

    return true;
  }
}
