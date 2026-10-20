import { v4 as uuidv4 } from 'uuid';
import { HandballDatabase } from '../data/db';
import {
  PlayerParticipationIntervalSchema,
  type PlayerParticipationInterval
} from '../domain/schemas';

export interface LineupInput {
  matchId: string;
  periodId: string;
  teamId: string;
  clockMs: number;
  starterRosterIds: string[];
  goalkeeperRosterId: string;
  eventId?: string;
}

export interface SubstitutionInput {
  matchId: string;
  periodId: string;
  teamId: string;
  clockMs: number;
  rosterInId: string;
  rosterOutId: string;
  isGoalkeeper?: boolean;
  eventId?: string;
}

export interface SanctionSuspensionInput {
  matchId: string;
  periodId: string;
  teamId: string;
  clockMs: number;
  rosterId: string;
  durationMs?: number; // default 120000 (2 min)
  eventId?: string;
}

export class ParticipationService {
  constructor(private db: HandballDatabase) {}

  /**
   * Obtiene la lista de jugadores actualmente en cancha para un equipo y período.
   */
  async getPlayersOnCourt(matchId: string, periodId: string, teamId: string): Promise<PlayerParticipationInterval[]> {
    return this.db.playerParticipations
      .where('match_id')
      .equals(matchId)
      .and((p) => p.period_id === periodId && p.team_id === teamId && p.is_active && p.out_clock_ms === undefined)
      .toArray();
  }

  /**
   * Confirma la formación inicial en cancha para un período dado.
   */
  async confirmInitialLineup(input: LineupInput): Promise<PlayerParticipationInterval[]> {
    const nowIso = new Date().toISOString();
    const intervals: PlayerParticipationInterval[] = [];

    await this.db.transaction('rw', [this.db.playerParticipations], async () => {
      // Cerrar cualquier participación previa abierta en este período para el equipo
      const existing = await this.db.playerParticipations
        .where('match_id')
        .equals(input.matchId)
        .and((p) => p.period_id === input.periodId && p.team_id === input.teamId && p.is_active)
        .toArray();

      for (const p of existing) {
        p.is_active = false;
        p.out_clock_ms = input.clockMs;
        p.updated_at = nowIso;
        await this.db.playerParticipations.put(p);
      }

      // Arquero
      intervals.push(
        PlayerParticipationIntervalSchema.parse({
          id: uuidv4(),
          match_id: input.matchId,
          period_id: input.periodId,
          roster_id: input.goalkeeperRosterId,
          team_id: input.teamId,
          in_clock_ms: input.clockMs,
          role_on_court: 'GK',
          in_event_id: input.eventId,
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        })
      );

      // Jugadores de campo (hasta 6)
      for (const rId of input.starterRosterIds) {
        if (rId === input.goalkeeperRosterId) continue;
        intervals.push(
          PlayerParticipationIntervalSchema.parse({
            id: uuidv4(),
            match_id: input.matchId,
            period_id: input.periodId,
            roster_id: rId,
            team_id: input.teamId,
            in_clock_ms: input.clockMs,
            role_on_court: 'FIELD',
            in_event_id: input.eventId,
            is_active: true,
            created_at: nowIso,
            updated_at: nowIso,
          })
        );
      }

      await this.db.playerParticipations.bulkAdd(intervals);
    });

    return intervals;
  }

  /**
   * Registra una sustitución (jugador que entra por jugador que sale).
   */
  async substitutePlayer(input: SubstitutionInput): Promise<{
    outInterval: PlayerParticipationInterval;
    inInterval: PlayerParticipationInterval;
  }> {
    const nowIso = new Date().toISOString();

    let outInterval: PlayerParticipationInterval | null = null;
    let inInterval: PlayerParticipationInterval | null = null;

    await this.db.transaction('rw', [this.db.playerParticipations], async () => {
      // 1. Encontrar el intervalo activo del jugador que sale
      const currentOut = await this.db.playerParticipations
        .where('match_id')
        .equals(input.matchId)
        .and((p) => p.period_id === input.periodId && p.roster_id === input.rosterOutId && p.is_active)
        .first();

      if (currentOut) {
        currentOut.out_clock_ms = input.clockMs;
        currentOut.out_event_id = input.eventId;
        currentOut.is_active = false;
        currentOut.updated_at = nowIso;
        await this.db.playerParticipations.put(currentOut);
        outInterval = currentOut;
      } else {
        // Si no estaba registrado formalmente como activo, crear registro previo cerrado para trazabilidad
        outInterval = PlayerParticipationIntervalSchema.parse({
          id: uuidv4(),
          match_id: input.matchId,
          period_id: input.periodId,
          roster_id: input.rosterOutId,
          team_id: input.teamId,
          in_clock_ms: 0,
          out_clock_ms: input.clockMs,
          out_event_id: input.eventId,
          role_on_court: input.isGoalkeeper ? 'GK' : 'FIELD',
          is_active: false,
          created_at: nowIso,
          updated_at: nowIso,
        });
        await this.db.playerParticipations.put(outInterval);
      }

      // 2. Crear nuevo intervalo activo para el jugador que entra
      inInterval = PlayerParticipationIntervalSchema.parse({
        id: uuidv4(),
        match_id: input.matchId,
        period_id: input.periodId,
        roster_id: input.rosterInId,
        team_id: input.teamId,
        in_clock_ms: input.clockMs,
        in_event_id: input.eventId,
        role_on_court: input.isGoalkeeper ? 'GK' : 'FIELD',
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      });

      await this.db.playerParticipations.put(inInterval);
    });

    return { outInterval: outInterval!, inInterval: inInterval! };
  }

  /**
   * Cierra la participación en cancha de un jugador al ser excluido o sancionado con salida.
   */
  async handlePlayerExcluded(input: SanctionSuspensionInput): Promise<PlayerParticipationInterval | null> {
    const nowIso = new Date().toISOString();
    let result: PlayerParticipationInterval | null = null;

    await this.db.transaction('rw', [this.db.playerParticipations], async () => {
      const active = await this.db.playerParticipations
        .where('match_id')
        .equals(input.matchId)
        .and((p) => p.period_id === input.periodId && p.roster_id === input.rosterId && p.is_active)
        .first();

      if (active) {
        active.out_clock_ms = input.clockMs;
        active.out_event_id = input.eventId;
        active.is_active = false;
        active.updated_at = nowIso;
        await this.db.playerParticipations.put(active);
        result = active;
      }
    });

    return result;
  }

  /**
   * Cierra todas las participaciones abiertas al finalizar un período reglamentario.
   */
  async closePeriodParticipations(matchId: string, periodId: string, endClockMs: number): Promise<void> {
    const active = await this.db.playerParticipations
      .where('match_id')
      .equals(matchId)
      .and((p) => p.period_id === periodId && p.is_active)
      .toArray();

    const nowIso = new Date().toISOString();
    for (const p of active) {
      p.out_clock_ms = endClockMs;
      p.is_active = false;
      p.updated_at = nowIso;
      await this.db.playerParticipations.put(p);
    }
  }

  /**
   * Limpia o reabre intervalos afectados si un evento (ej. sustitución o exclusión) es anulado.
   */
  async handleEventVoided(matchId: string, eventId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    await this.db.transaction('rw', [this.db.playerParticipations], async () => {
      // 1. Intervalos que se crearon por este evento -> eliminarlos
      const createdByEvent = await this.db.playerParticipations
        .where('match_id')
        .equals(matchId)
        .and((p) => p.in_event_id === eventId)
        .toArray();

      for (const p of createdByEvent) {
        await this.db.playerParticipations.delete(p.id);
      }

      // 2. Intervalos que se cerraron por este evento -> reabrirlos
      const closedByEvent = await this.db.playerParticipations
        .where('match_id')
        .equals(matchId)
        .and((p) => p.out_event_id === eventId)
        .toArray();

      for (const p of closedByEvent) {
        p.out_clock_ms = undefined;
        p.out_event_id = undefined;
        p.is_active = true;
        p.updated_at = nowIso;
        await this.db.playerParticipations.put(p);
      }
    });
  }
}

