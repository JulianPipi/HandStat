import { v4 as uuidv4 } from 'uuid';
import { HandballDatabase } from '../data/db';
import {
  MatchPossessionSchema,
  type MatchPossession,
  type MatchEvent
} from '../domain/schemas';

export interface StartPossessionInput {
  matchId: string;
  periodId: string;
  teamId: string;
  clockMs: number;
  startReason: 'THROW_OFF' | 'TURNOVER' | 'STEAL' | 'GOAL_CONCEDED' | 'REBOUND' | 'PERIOD_START' | 'MANUAL';
  startEventId?: string;
}

export interface EndPossessionInput {
  possessionId: string;
  clockMs: number;
  endReason: 'GOAL' | 'SAVED_REBOUND_OPPONENT' | 'MISSED_OPPONENT' | 'TURNOVER' | 'PERIOD_END' | 'MANUAL';
  endEventId?: string;
}

export interface EventEffectResult {
  possessionChanged: boolean;
  newPossessionTeamId?: string;
  actionPhaseTransition?: 'ATTACK_TO_DEFENSE' | 'DEFENSE_TO_ATTACK' | 'NONE';
}

export class PossessionService {
  constructor(private db: HandballDatabase) {}

  /**
   * Obtiene la posesión abierta actual de un partido, si existe.
   */
  async getActivePossession(matchId: string, periodId?: string): Promise<MatchPossession | undefined> {
    const list = await this.db.possessions
      .where('match_id')
      .equals(matchId)
      .and((p) => (!periodId || p.period_id === periodId) && !p.is_complete && p.end_clock_ms === undefined)
      .toArray();

    return list[0];
  }

  /**
   * Inicia una nueva posesión. Si ya había una posesión abierta, la cierra previamente
   * con la razón adecuada o 'MANUAL'.
   */
  async startPossession(input: StartPossessionInput): Promise<MatchPossession> {
    const nowIso = new Date().toISOString();

    let newPossession: MatchPossession | null = null;

    await this.db.transaction('rw', [this.db.possessions], async () => {
      const active = await this.db.possessions
        .where('match_id')
        .equals(input.matchId)
        .and((p) => (!input.periodId || p.period_id === input.periodId) && !p.is_complete && p.end_clock_ms === undefined)
        .first();

      if (active) {
        if (active.team_id === input.teamId) {
          // Ya tenía la posesión: mantener la posesión activa sin cerrarla ni duplicarla
          newPossession = active;
          return;
        }
        active.end_clock_ms = input.clockMs;
        active.end_reason = input.startReason === 'GOAL_CONCEDED' ? 'GOAL' : 'TURNOVER';
        active.end_event_id = input.startEventId;
        active.is_complete = true;
        active.updated_at = nowIso;
        await this.db.possessions.put(active);
      }

      newPossession = MatchPossessionSchema.parse({
        id: uuidv4(),
        match_id: input.matchId,
        period_id: input.periodId,
        team_id: input.teamId,
        start_clock_ms: input.clockMs,
        start_event_id: input.startEventId,
        start_reason: input.startReason,
        is_complete: false,
        created_at: nowIso,
        updated_at: nowIso,
      });

      await this.db.possessions.put(newPossession);
    });

    return newPossession!;
  }

  /**
   * Cierra formalmente la posesión activa indicando el fin del ataque.
   */
  async endPossession(input: EndPossessionInput): Promise<MatchPossession> {
    const possession = await this.db.possessions.get(input.possessionId);
    if (!possession) {
      throw new Error(`Posesión ${input.possessionId} no encontrada`);
    }

    const nowIso = new Date().toISOString();
    possession.end_clock_ms = input.clockMs;
    possession.end_event_id = input.endEventId;
    possession.end_reason = input.endReason;
    possession.is_complete = true;
    possession.updated_at = nowIso;

    await this.db.possessions.put(possession);
    return possession;
  }

  /**
   * Cierra las posesiones activas al finalizar el período reglamentario.
   */
  async closePeriodPossessions(matchId: string, periodId: string, endClockMs: number): Promise<void> {
    const active = await this.db.possessions
      .where('match_id')
      .equals(matchId)
      .and((p) => p.period_id === periodId && !p.is_complete)
      .toArray();

    const nowIso = new Date().toISOString();
    for (const p of active) {
      p.end_clock_ms = endClockMs;
      p.end_reason = 'PERIOD_END';
      p.is_complete = true;
      p.updated_at = nowIso;
      await this.db.possessions.put(p);
    }
  }

  /**
   * Manejador que analiza el flujo natural del handball ante un evento registrado.
   * Reglas de handball:
   * - GOL del equipo atacante: Cierra posesión del atacante e inicia posesión del rival (saque de centro).
   * - PERDIDA (TURNOVER) o RECUPERACION (STEAL): Termina posesión y pasa al rival o al equipo que recupera.
   * - TIRO ATAJADO / POSTE con rebote ofensivo o "Conserva el atacante": CONTINUA la posesión (no se cierra ni duplica).
   * - TIRO ATAJADO / POSTE con recuperación defensiva o arquero que retiene: CAMBIA la posesión al rival.
   * - "Sin confirmar" / Balón suelto: Preserva la incertidumbre y no cambia la posesión.
   * - FINAL DE PERIODO: Cierra la posesión con 'PERIOD_END'.
   */
  async handleEventEffect(
    event: MatchEvent,
    homeTeamId: string,
    awayTeamId: string,
    options?: {
      offensiveRebound?: boolean;
      possessionOutcome?: 'ATTACKER_RETAINS' | 'DEFENDER_RECOVERS' | 'UNCERTAIN';
    }
  ): Promise<EventEffectResult> {
    // 1. Final de período
    if (event.type === 'PERIOD_END') {
      await this.closePeriodPossessions(event.match_id, event.period_id, event.clock_ms);
      return { possessionChanged: false, actionPhaseTransition: 'NONE' };
    }

    // Si el evento no tiene equipo asociado, no afecta directamente la posesión
    if (!event.match_team_id) {
      return { possessionChanged: false, actionPhaseTransition: 'NONE' };
    }

    const eventTeamId = event.match_team_id;
    const opponentTeamId = eventTeamId === homeTeamId ? awayTeamId : homeTeamId;

    // 2. GOL
    if (event.type === 'SHOT' && event.shot_detail?.result_code === 'GOAL') {
      const active = await this.getActivePossession(event.match_id, event.period_id);
      if (!active) {
        // Asegurar que exista la posesión de ataque previa que finaliza con este gol
        await this.startPossession({
          matchId: event.match_id,
          periodId: event.period_id,
          teamId: eventTeamId,
          clockMs: 0,
          startReason: 'THROW_OFF',
        });
      }

      // Inicia posesión rival tras saque de centro
      await this.startPossession({
        matchId: event.match_id,
        periodId: event.period_id,
        teamId: opponentTeamId,
        clockMs: event.clock_ms,
        startReason: 'GOAL_CONCEDED',
        startEventId: event.id,
      });
      return {
        possessionChanged: true,
        newPossessionTeamId: opponentTeamId,
        actionPhaseTransition: 'ATTACK_TO_DEFENSE',
      };
    }

    // 3. TIRO ATAJADO / POSTE / FUERA / BLOQUEADO
    if (event.type === 'SHOT') {
      const outcome = options?.possessionOutcome;

      // Si el atacante conserva el balón o se marcó rebote ofensivo explícito:
      if (outcome === 'ATTACKER_RETAINS' || options?.offensiveRebound) {
        const active = await this.getActivePossession(event.match_id, event.period_id);
        if (!active) {
          await this.startPossession({
            matchId: event.match_id,
            periodId: event.period_id,
            teamId: eventTeamId,
            clockMs: 0,
            startReason: 'THROW_OFF',
          });
        }
        // La posesión continúa en el mismo equipo (no se cierra ni duplica)
        return {
          possessionChanged: false,
          newPossessionTeamId: eventTeamId,
          actionPhaseTransition: 'NONE',
        };
      }

      // Si el resultado es incierto / balón suelto / sin confirmar:
      if (outcome === 'UNCERTAIN') {
        // No cerrar ni cambiar posesión automáticamente, registrar incertidumbre
        return {
          possessionChanged: false,
          newPossessionTeamId: undefined,
          actionPhaseTransition: 'NONE',
        };
      }

      // Por defecto o DEFENDER_RECOVERS: Posesión pasa al rival (balón para el portero o recuperación defensiva)
      const active = await this.getActivePossession(event.match_id, event.period_id);
      if (!active) {
        await this.startPossession({
          matchId: event.match_id,
          periodId: event.period_id,
          teamId: eventTeamId,
          clockMs: 0,
          startReason: 'THROW_OFF',
        });
      }
      await this.startPossession({
        matchId: event.match_id,
        periodId: event.period_id,
        teamId: opponentTeamId,
        clockMs: event.clock_ms,
        startReason: 'REBOUND',
        startEventId: event.id,
      });
      return {
        possessionChanged: true,
        newPossessionTeamId: opponentTeamId,
        actionPhaseTransition: 'ATTACK_TO_DEFENSE',
      };
    }

    // 4. RECUPERACION / ROBO (STEAL) O ACCION DEFENSIVA CON CONTROL EFECTIVO
    const isStealOrRecovery =
      event.participants.some((p) => p.role === 'RECOVERED_BY') ||
      (event.type === 'TURNOVER' && event.turnover_detail?.reason === 'STEAL' && event.turnover_detail?.forced_by_defense);

    if (isStealOrRecovery) {
      // Determinar qué equipo recupera la posesión:
      // 1) Si está explícitamente indicado en el payload (recovering_team_id)
      // 2) O si el evento es un TURNOVER del adversario con forced_by_defense sin participante propio, pasa al rival
      // 3) Si se registró directamente con teamId del recuperador (compatibilidad hacia atrás), usa eventTeamId
      let recoveringTeamId = (event.payload as any)?.recovering_team_id;
      if (!recoveringTeamId) {
        if (event.type === 'TURNOVER' && event.turnover_detail?.forced_by_defense && !event.participants.some((p) => p.role === 'RECOVERED_BY')) {
          recoveringTeamId = opponentTeamId;
        } else {
          recoveringTeamId = eventTeamId;
        }
      }

      const active = await this.getActivePossession(event.match_id, event.period_id);
      const possessionChanged = !active || active.team_id !== recoveringTeamId;

      await this.startPossession({
        matchId: event.match_id,
        periodId: event.period_id,
        teamId: recoveringTeamId,
        clockMs: event.clock_ms,
        startReason: 'STEAL',
        startEventId: event.id,
      });
      return {
        possessionChanged,
        newPossessionTeamId: recoveringTeamId,
        actionPhaseTransition: 'DEFENSE_TO_ATTACK',
      };
    }

    // 5. PERDIDA CONVENCIONAL (TURNOVER)
    if (event.type === 'TURNOVER') {
      const active = await this.getActivePossession(event.match_id, event.period_id);
      if (!active) {
        await this.startPossession({
          matchId: event.match_id,
          periodId: event.period_id,
          teamId: eventTeamId,
          clockMs: 0,
          startReason: 'THROW_OFF',
        });
      }
      await this.startPossession({
        matchId: event.match_id,
        periodId: event.period_id,
        teamId: opponentTeamId,
        clockMs: event.clock_ms,
        startReason: 'TURNOVER',
        startEventId: event.id,
      });
      return {
        possessionChanged: true,
        newPossessionTeamId: opponentTeamId,
        actionPhaseTransition: 'ATTACK_TO_DEFENSE',
      };
    }

    return {
      possessionChanged: false,
      actionPhaseTransition: 'NONE',
    };
  }

  /**
   * Actualiza las posesiones afectadas cuando un evento es anulado o deshecho.
   * Evita conservar asociaciones obsoletas con eventos anulados.
   */
  async handleEventVoided(matchId: string, eventId: string, deviceId = uuidv4()): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db.transaction('rw', [this.db.possessions, this.db.eventRevisions], async () => {
      // 1. Si el evento inició una posesión, esa posesión queda invalidada (se elimina)
      const startedByEvent = await this.db.possessions
        .where('match_id')
        .equals(matchId)
        .and((p) => p.start_event_id === eventId)
        .toArray();

      for (const p of startedByEvent) {
        // Registrar auditoría de la posesión eliminada con su estado previo
        await this.db.eventRevisions.add({
          id: uuidv4(),
          event_id: p.id,
          match_id: matchId,
          version: 1,
          snapshot: {
            entity_type: 'possession',
            possession_id: p.id,
            triggering_event_id: eventId,
            previous_values: { ...p },
            new_values: null,
            action: 'deleted_by_voided_start_event',
          },
          change_kind: 'void',
          reason: `Eliminación de posesión por anulación de evento de inicio ${eventId}`,
          changed_at: nowIso,
          device_id: deviceId,
        });
        await this.db.possessions.delete(p.id);
      }

      // 2. Si el evento cerró una posesión, esa posesión se reabre retirando la asociación obsoleta
      const endedByEvent = await this.db.possessions
        .where('match_id')
        .equals(matchId)
        .and((p) => p.end_event_id === eventId)
        .toArray();

      for (const p of endedByEvent) {
        const prevValues = {
          start_clock_ms: p.start_clock_ms,
          end_clock_ms: p.end_clock_ms,
          end_event_id: p.end_event_id,
          end_reason: p.end_reason,
          is_complete: p.is_complete,
          updated_at: p.updated_at,
        };
        p.end_clock_ms = undefined;
        p.end_event_id = undefined;
        p.end_reason = undefined;
        p.is_complete = false;
        p.updated_at = nowIso;
        await this.db.possessions.put(p);

        // Registrar auditoría de la posesión reabierta con valores previos y nuevos
        await this.db.eventRevisions.add({
          id: uuidv4(),
          event_id: p.id,
          match_id: matchId,
          version: 2,
          snapshot: {
            entity_type: 'possession',
            possession_id: p.id,
            triggering_event_id: eventId,
            previous_values: prevValues,
            new_values: {
              start_clock_ms: p.start_clock_ms,
              end_clock_ms: p.end_clock_ms,
              end_event_id: p.end_event_id,
              end_reason: p.end_reason,
              is_complete: p.is_complete,
              updated_at: nowIso,
            },
            action: 'reopened_by_voided_end_event',
          },
          change_kind: 'edit',
          reason: `Reapertura de posesión por anulación de evento de fin ${eventId}`,
          changed_at: nowIso,
          device_id: deviceId,
        });
      }
    });

    await this.verifyAndHealChronology(matchId, eventId, deviceId);
  }

  /**
   * Actualiza las marcas temporales de las posesiones si se edita el tiempo de un evento.
   */
  async handleEventTimeUpdated(matchId: string, eventId: string, newClockMs: number, deviceId = uuidv4()): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db.transaction('rw', [this.db.possessions, this.db.eventRevisions], async () => {
      const started = await this.db.possessions
        .where('match_id')
        .equals(matchId)
        .and((p) => p.start_event_id === eventId)
        .toArray();
      for (const p of started) {
        const prevStart = p.start_clock_ms;
        p.start_clock_ms = newClockMs;
        p.updated_at = nowIso;
        await this.db.possessions.put(p);

        await this.db.eventRevisions.add({
          id: uuidv4(),
          event_id: p.id,
          match_id: matchId,
          version: 2,
          snapshot: {
            entity_type: 'possession',
            possession_id: p.id,
            triggering_event_id: eventId,
            previous_values: { start_clock_ms: prevStart, updated_at: p.updated_at },
            new_values: { start_clock_ms: newClockMs, updated_at: nowIso },
            action: 'start_time_updated',
          },
          change_kind: 'edit',
          reason: `Actualización de inicio de posesión a ${newClockMs}ms por evento ${eventId}`,
          changed_at: nowIso,
          device_id: deviceId,
        });
      }

      const ended = await this.db.possessions
        .where('match_id')
        .equals(matchId)
        .and((p) => p.end_event_id === eventId)
        .toArray();
      for (const p of ended) {
        const prevEnd = p.end_clock_ms;
        p.end_clock_ms = newClockMs;
        p.updated_at = nowIso;
        await this.db.possessions.put(p);

        await this.db.eventRevisions.add({
          id: uuidv4(),
          event_id: p.id,
          match_id: matchId,
          version: 2,
          snapshot: {
            entity_type: 'possession',
            possession_id: p.id,
            triggering_event_id: eventId,
            previous_values: { end_clock_ms: prevEnd, updated_at: p.updated_at },
            new_values: { end_clock_ms: newClockMs, updated_at: nowIso },
            action: 'end_time_updated',
          },
          change_kind: 'edit',
          reason: `Actualización de fin de posesión a ${newClockMs}ms por evento ${eventId}`,
          changed_at: nowIso,
          device_id: deviceId,
        });
      }
    });

    await this.verifyAndHealChronology(matchId, eventId, deviceId);
  }

  /**
   * Verifica la cronología completa de posesiones de un partido y resuelve solapamientos
   * o límites abiertos si existen posesiones posteriores en el mismo período.
   * Registra de forma inmutable los valores anteriores y nuevos de cada posesión modificada.
   */
  async verifyAndHealChronology(matchId: string, triggeringEventId?: string, deviceId = uuidv4()): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db.transaction('rw', [this.db.possessions, this.db.eventRevisions], async () => {
      const allPossessions = await this.db.possessions.where('match_id').equals(matchId).toArray();

      const byPeriod = new Map<string, MatchPossession[]>();
      for (const p of allPossessions) {
        const list = byPeriod.get(p.period_id) || [];
        list.push(p);
        byPeriod.set(p.period_id, list);
      }

      for (const [, pList] of byPeriod.entries()) {
        const sorted = pList.sort((a, b) => a.start_clock_ms - b.start_clock_ms);
        for (let i = 0; i < sorted.length; i++) {
          const cur = sorted[i]!;
          if (i < sorted.length - 1) {
            const nextP = sorted[i + 1]!;
            // Si la posesión actual tiene un fin posterior al inicio de la siguiente o carece de fin:
            // Debe acotarse al inicio de la posesión siguiente para evitar solapamientos
            if (!cur.is_complete || cur.end_clock_ms === undefined || cur.end_clock_ms > nextP.start_clock_ms) {
              const prevValues = {
                start_clock_ms: cur.start_clock_ms,
                end_clock_ms: cur.end_clock_ms,
                end_reason: cur.end_reason,
                is_complete: cur.is_complete,
                updated_at: cur.updated_at,
              };

              cur.end_clock_ms = nextP.start_clock_ms;
              if (!cur.end_reason) cur.end_reason = 'MANUAL';
              // No marcar como completa: el límite se acotó para evitar solapamiento pero carece de evento final evidenciado
              cur.is_complete = false;
              cur.updated_at = nowIso;
              await this.db.possessions.put(cur);

              // Registrar auditoría con valores anteriores y nuevos de la posesión persistida
              await this.db.eventRevisions.add({
                id: uuidv4(),
                event_id: cur.id,
                match_id: matchId,
                version: 2,
                snapshot: {
                  entity_type: 'possession',
                  possession_id: cur.id,
                  triggering_event_id: triggeringEventId,
                  previous_values: prevValues,
                  new_values: {
                    start_clock_ms: cur.start_clock_ms,
                    end_clock_ms: cur.end_clock_ms,
                    end_reason: cur.end_reason,
                    is_complete: cur.is_complete,
                    updated_at: nowIso,
                  },
                  heal_action: 'acotamiento_limite_posesion',
                  heal_reason: 'verifyAndHealChronology: límite acotado al inicio de la posesión posterior para evitar solapamiento',
                },
                change_kind: 'edit',
                reason: 'Ajuste cronológico de posesión persistida (verifyAndHealChronology)',
                changed_at: nowIso,
                device_id: deviceId,
              });
            }
          }
        }
      }
    });
  }
}

