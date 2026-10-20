import { v4 as uuidv4 } from 'uuid';
import { HandballDatabase } from '../data/db';
import type {
  MatchEvent,
  EventType,
  ShotDetail,
  TurnoverDetail,
  SanctionDetail,
  EventParticipant,
  NumericalSituation
} from '../domain/schemas';
import { PossessionService } from './possessionService';
import { ParticipationService } from './participationService';

export interface ActionInput {
  matchId: string;
  periodId: string;
  teamId?: string;
  type: EventType;
  clockMs: number;
  shotDetail?: ShotDetail;
  turnoverDetail?: TurnoverDetail;
  sanctionDetail?: SanctionDetail;
  numericalSituation?: NumericalSituation;
  participants?: EventParticipant[];
  note?: string;
  sportSeq?: number;
  payload?: Record<string, any>;
}

export type SaveActionResult =
  | { success: true; event: MatchEvent; savedEvent: MatchEvent }
  | { success: false; pendingActionId: string; error: string; savedEvent?: undefined };

export class ActionRecorderService {
  constructor(private db: HandballDatabase) {}

  /**
   * Registra una acción de forma atómica en IndexedDB.
   * Si la transacción falla, captura el error y permite reintentar sin duplicar
   * gracias al UUID preasignado en memoria.
   */
  async recordAction(
    input: ActionInput,
    preassignedId?: string,
    deviceId = uuidv4()
  ): Promise<SaveActionResult> {
    const eventId = preassignedId || uuidv4();
    const nowIso = new Date().toISOString();

    // Obtener contadores secuenciales dentro de la transacción
    try {
      let createdEvent: MatchEvent | null = null;

      await this.db.transaction('rw', [this.db.matchEvents, this.db.eventRevisions, this.db.matches], async () => {
        const match = await this.db.matches.get(input.matchId);
        if (!match) {
          throw new Error(`Partido con id ${input.matchId} no encontrado`);
        }

        const eventsInMatch = await this.db.matchEvents.where('match_id').equals(input.matchId).toArray();

        // Validar que no se cierre repetidamente un período ya finalizado
        if (input.type === 'PERIOD_END') {
          const alreadyEnded = eventsInMatch.some(
            (e) => e.period_id === input.periodId && e.type === 'PERIOD_END' && e.status === 'active' && e.id !== eventId
          );
          if (alreadyEnded) {
            throw new Error(
              `El período ya se encuentra finalizado. No se permite registrar múltiples cierres activos para el mismo período. Si requiere corregirlo, anule primero el cierre anterior.`
            );
          }
        }

        const auditSeq = eventsInMatch.length + 1;
        // Si no se proveyó un sport_seq manual para desempate de tiempo idéntico,
        // se usa el número de eventos en ese mismo clockMs + 1
        const eventsAtSameMs = eventsInMatch.filter((e) => e.clock_ms === input.clockMs);
        const sportSeq = input.sportSeq ?? (eventsAtSameMs.length + 1);

        const newEvent: MatchEvent = {
          id: eventId,
          match_id: input.matchId,
          period_id: input.periodId,
          match_team_id: input.teamId,
          type: input.type,
          clock_ms: input.clockMs,
          sport_seq: sportSeq,
          audit_seq: auditSeq,
          status: 'active',
          payload: input.payload ?? {},
          shot_detail: input.shotDetail,
          turnover_detail: input.turnoverDetail,
          sanction_detail: input.sanctionDetail,
          numerical_situation: input.numericalSituation,
          participants: input.participants ?? [],
          note: input.note,
          version: 1,
          created_at: nowIso,
          updated_at: nowIso,
          device_id: deviceId,
        };

        // Comprobar si el evento ya existía para evitar incrementos dobles en reintentos
        const existingEvent = await this.db.matchEvents.get(eventId);

        // Guardar evento de forma idempotente
        await this.db.matchEvents.put(newEvent);

        if (!existingEvent) {
          await this.db.eventRevisions.add({
            id: uuidv4(),
            event_id: eventId,
            match_id: input.matchId,
            version: 1,
            snapshot: newEvent,
            change_kind: 'create',
            changed_at: nowIso,
            device_id: deviceId,
          });

          // Incrementar revisión general del partido solo en creación nueva
          const match = await this.db.matches.get(input.matchId);
          if (match) {
            match.match_revision += 1;
            match.updated_at = nowIso;
            await this.db.matches.put(match);
          }
        }

        createdEvent = newEvent;
      });

      return { success: true, event: createdEvent!, savedEvent: createdEvent! };
    } catch (err) {
      return {
        success: false,
        pendingActionId: eventId,
        error: err instanceof Error ? err.message : 'Error desconocido al guardar en IndexedDB',
      };
    }
  }

  /**
   * Modifica un evento existente manteniendo el historial completo de revisiones
   * y versionado estricto.
   */
  async updateAction(
    eventId: string,
    updates: Partial<Pick<MatchEvent, 'clock_ms' | 'sport_seq' | 'match_team_id' | 'type' | 'shot_detail' | 'turnover_detail' | 'sanction_detail' | 'numerical_situation' | 'participants' | 'note'>>,
    reason?: string,
    deviceId = uuidv4()
  ): Promise<MatchEvent> {
    const existing = await this.db.matchEvents.get(eventId);
    if (!existing) {
      throw new Error(`Evento ${eventId} no encontrado`);
    }

    const nowIso = new Date().toISOString();
    const newVersion = existing.version + 1;

    const updatedEvent: MatchEvent = {
      ...existing,
      ...updates,
      version: newVersion,
      updated_at: nowIso,
    };

    await this.db.transaction(
      'rw',
      [this.db.matchEvents, this.db.eventRevisions, this.db.matches, this.db.possessions],
      async () => {
        await this.db.matchEvents.put(updatedEvent);

        await this.db.eventRevisions.add({
          id: uuidv4(),
          event_id: eventId,
          match_id: existing.match_id,
          version: newVersion,
          snapshot: updatedEvent,
          change_kind: 'edit',
          reason: reason || 'Modificación manual de evento',
          changed_at: nowIso,
          device_id: deviceId,
        });

        const match = await this.db.matches.get(existing.match_id);
        if (match) {
          match.match_revision += 1;
          match.updated_at = nowIso;
          await this.db.matches.put(match);
        }

        if (updates.clock_ms !== undefined) {
          const possessionService = new PossessionService(this.db);
          await possessionService.handleEventTimeUpdated(existing.match_id, eventId, updates.clock_ms);
        }
      }
    );

    return updatedEvent;
  }

  /**
   * Anula un evento marcándolo con status: 'voided' de forma atómica y trazable.
   * Ejecuta todas las modificaciones (eventos, revisiones, posesiones y participaciones)
   * dentro de una única transacción para garantizar cero modificaciones parciales en caso de fallo.
   */
  async voidAction(
    eventId: string,
    reason?: string,
    deviceId = uuidv4()
  ): Promise<MatchEvent> {
    const existing = await this.db.matchEvents.get(eventId);
    if (!existing) {
      throw new Error(`Evento ${eventId} no encontrado`);
    }

    const nowIso = new Date().toISOString();
    const newVersion = existing.version + 1;

    const voidedEvent: MatchEvent = {
      ...existing,
      status: 'voided',
      version: newVersion,
      updated_at: nowIso,
    };

    // Buscar eventos dependientes activos desencadenados por este evento (ej. sustitución automática defensa-ataque)
    const dependentEvents = await this.db.matchEvents
      .where('match_id')
      .equals(existing.match_id)
      .and((e) => e.status === 'active' && e.payload?.triggered_by_event_id === eventId)
      .toArray();

    await this.db.transaction(
      'rw',
      [this.db.matchEvents, this.db.eventRevisions, this.db.matches, this.db.possessions, this.db.playerParticipations],
      async () => {
        await this.db.matchEvents.put(voidedEvent);

        await this.db.eventRevisions.add({
          id: uuidv4(),
          event_id: eventId,
          match_id: existing.match_id,
          version: newVersion,
          snapshot: voidedEvent,
          change_kind: 'void',
          reason: reason || 'Anulación de acción',
          changed_at: nowIso,
          device_id: deviceId,
        });

        // Actualizar posesiones e intervalos de participación del evento principal
        const possessionService = new PossessionService(this.db);
        await possessionService.handleEventVoided(existing.match_id, eventId);

        const participationService = new ParticipationService(this.db);
        await participationService.handleEventVoided(existing.match_id, eventId);

        // Anular en cascada de manera atómica todos los eventos dependientes
        for (const dep of dependentEvents) {
          const depVersion = dep.version + 1;
          const voidedDep: MatchEvent = {
            ...dep,
            status: 'voided',
            version: depVersion,
            updated_at: nowIso,
          };
          await this.db.matchEvents.put(voidedDep);

          await this.db.eventRevisions.add({
            id: uuidv4(),
            event_id: dep.id,
            match_id: dep.match_id,
            version: depVersion,
            snapshot: voidedDep,
            change_kind: 'void',
            reason: `Anulación automática dependiente de ${eventId}`,
            changed_at: nowIso,
            device_id: deviceId,
          });

          await possessionService.handleEventVoided(dep.match_id, dep.id, deviceId);
          await participationService.handleEventVoided(dep.match_id, dep.id);
        }

        const match = await this.db.matches.get(existing.match_id);
        if (match) {
          match.match_revision += 1 + dependentEvents.length;
          match.updated_at = nowIso;
          await this.db.matches.put(match);
        }
      }
    );

    return voidedEvent;
  }

  /**
   * Restaura una acción previamente anulada, reincorporándola de manera trazable y atómica.
   */
  async restoreAction(
    eventId: string,
    reason?: string,
    deviceId = uuidv4()
  ): Promise<MatchEvent> {
    const existing = await this.db.matchEvents.get(eventId);
    if (!existing) {
      throw new Error(`Evento ${eventId} no encontrado`);
    }

    const nowIso = new Date().toISOString();
    const newVersion = existing.version + 1;

    const restoredEvent: MatchEvent = {
      ...existing,
      status: 'active',
      version: newVersion,
      updated_at: nowIso,
    };

    await this.db.transaction(
      'rw',
      [this.db.matchEvents, this.db.eventRevisions, this.db.matches, this.db.possessions, this.db.playerParticipations],
      async () => {
        await this.db.matchEvents.put(restoredEvent);

        await this.db.eventRevisions.add({
          id: uuidv4(),
          event_id: eventId,
          match_id: existing.match_id,
          version: newVersion,
          snapshot: restoredEvent,
          change_kind: 'restore',
          reason: reason || 'Restauración de acción anulada',
          changed_at: nowIso,
          device_id: deviceId,
        });

        const match = await this.db.matches.get(existing.match_id);
        if (match) {
          match.match_revision += 1;
          match.updated_at = nowIso;
          await this.db.matches.put(match);
        }

        // Si la acción era un gol o turnover que afecta posesiones, revalida la cronología
        const possessionService = new PossessionService(this.db);
        await possessionService.verifyAndHealChronology(existing.match_id);
      }
    );

    return restoredEvent;
  }

  /**
   * Deshace la última acción activa registrada en el partido anulándola de manera trazable.
   * Si la última acción fue generada automáticamente por un evento disparador (ej. auto-sustitución),
   * revierte el evento padre para deshacer coherentemente el conjunto completo.
   */
  async undoLastAction(matchId: string, deviceId = uuidv4()): Promise<MatchEvent | null> {
    const activeEvents = await this.db.matchEvents
      .where('match_id')
      .equals(matchId)
      .and((e) => e.status === 'active')
      .toArray();

    if (activeEvents.length === 0) return null;

    // Ordenar por audit_seq descendente para encontrar el último registro de carga
    activeEvents.sort((a, b) => b.audit_seq - a.audit_seq);
    const lastActive = activeEvents[0]!;

    // Si el último evento fue desencadenado por una acción padre activa, anular el padre
    const parentEventId = lastActive.payload?.triggered_by_event_id;
    if (parentEventId) {
      const parentEvent = await this.db.matchEvents.get(parentEventId);
      if (parentEvent && parentEvent.status === 'active') {
        return this.voidAction(parentEventId, 'Deshacer última acción y automatizaciones vinculadas', deviceId);
      }
    }

    return this.voidAction(lastActive.id, 'Deshacer última acción', deviceId);
  }
}
