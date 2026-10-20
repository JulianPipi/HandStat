import { HandballDatabase } from '../data/db';
import { ActionRecorderService } from './actionRecorder';
import { ParticipationService } from './participationService';
import type { MatchEvent, PlayerParticipationInterval } from '../domain/schemas';

export interface DefenseAttackPairConfig {
  enabled: boolean;
  defenderRosterId: string; // Jugador especialista en defensa (entra en defensa)
  attackerRosterId: string; // Jugador especialista en ataque (entra en ataque)
}

export interface AutoSubValidationResult {
  canExecute: boolean;
  playerInId?: string;
  playerOutId?: string;
  reason?: string;
  warning?: string;
}

export class DefenseAttackSubService {
  constructor(
    private db: HandballDatabase,
    private actionRecorder: ActionRecorderService,
    private participationService: ParticipationService
  ) {}

  /**
   * Valida la elegibilidad y situación deportiva de la pareja para realizar la sustitución automática.
   * Reglas:
   * - Ambos jugadores deben existir, ser distintos y pertenecer al equipo.
   * - Ninguno de los dos debe ser arquero (el arquero nunca se sustituye por esta automatización).
   * - El jugador que debe ingresar NO debe estar descalificado (tarjeta roja o azul) ni cumpliendo exclusión de 2 min activa.
   * - Sustitución 1 a 1 estricta: el jugador que sale debe estar en cancha, y el que entra en el banco.
   * - No completa automáticamente alineaciones reducidas.
   */
  async validateAutoSub(
    matchId: string,
    periodId: string,
    teamId: string,
    clockMs: number,
    config: DefenseAttackPairConfig,
    transitionToPhase: 'DEFENSE' | 'ATTACK'
  ): Promise<AutoSubValidationResult> {
    if (!config.enabled) {
      return { canExecute: false, reason: 'Automatización desactivada' };
    }

    if (!config.defenderRosterId || !config.attackerRosterId) {
      return { canExecute: false, reason: 'Pareja no configurada' };
    }

    if (config.defenderRosterId === config.attackerRosterId) {
      return { canExecute: false, reason: 'Los jugadores de defensa y ataque deben ser diferentes' };
    }

    // Verificar rosters del equipo
    const rosters = await this.db.matchRosters.where('match_id').equals(matchId).toArray();
    const defenderRoster = rosters.find((r) => r.id === config.defenderRosterId && r.team_id === teamId);
    const attackerRoster = rosters.find((r) => r.id === config.attackerRosterId && r.team_id === teamId);

    if (!defenderRoster || !attackerRoster) {
      return { canExecute: false, reason: 'Uno o ambos jugadores no pertenecen a la convocatoria del equipo' };
    }

    // Regla: El arquero NUNCA se sustituye por esta automatización
    if (defenderRoster.role === 'GK' || attackerRoster.role === 'GK') {
      return {
        canExecute: false,
        warning: 'El arquero nunca debe participar de la pareja de cambio defensa-ataque',
        reason: 'Uno de los jugadores seleccionados es arquero',
      };
    }

    const playerInId = transitionToPhase === 'DEFENSE' ? config.defenderRosterId : config.attackerRosterId;
    const playerOutId = transitionToPhase === 'DEFENSE' ? config.attackerRosterId : config.defenderRosterId;
    const playerInRoster = transitionToPhase === 'DEFENSE' ? defenderRoster : attackerRoster;

    // Verificar participaciones en cancha
    const onCourt = await this.participationService.getPlayersOnCourt(matchId, periodId, teamId);
    const isPlayerOutOnCourt = onCourt.some((p) => p.roster_id === playerOutId);
    const isPlayerInOnCourt = onCourt.some((p) => p.roster_id === playerInId);

    if (isPlayerInOnCourt) {
      return {
        canExecute: false,
        reason: `El jugador que debería entrar (#${playerInRoster.shirt_number} ${playerInRoster.display_name_snapshot}) ya se encuentra en cancha`,
      };
    }

    if (!isPlayerOutOnCourt) {
      return {
        canExecute: false,
        reason: `El jugador a sustituir no se encuentra actualmente en cancha (alineación reducida o cambio manual previo)`,
      };
    }

    // Verificar sanciones del jugador que ingresa (descalificación o exclusión de 2 minutos activa)
    const activeEvents = await this.db.matchEvents
      .where('match_id')
      .equals(matchId)
      .and((e) => e.status === 'active')
      .toArray();

    // 1. Descalificación (ROJA o AZUL)
    const isDisqualified = activeEvents.some(
      (e) =>
        e.type === 'SANCTION' &&
        (e.sanction_detail?.kind === 'RED_CARD' || e.sanction_detail?.kind === 'BLUE_CARD') &&
        e.participants.some((p) => p.roster_id === playerInId && p.role === 'SANCTIONED')
    );

    if (isDisqualified) {
      return {
        canExecute: false,
        warning: `El jugador #${playerInRoster.shirt_number} ${playerInRoster.display_name_snapshot} fue descalificado (tarjeta roja/azul) y no puede reingresar. Resuelva la formación manualmente.`,
        reason: 'Jugador descalificado',
      };
    }

    // 2. Exclusión de 2 minutos activa
    const activeSuspensions = activeEvents.filter(
      (e) =>
        e.type === 'SANCTION' &&
        e.period_id === periodId &&
        e.sanction_detail?.kind === 'TWO_MINUTE' &&
        e.participants.some((p) => p.roster_id === playerInId && p.role === 'SANCTIONED')
    );

    for (const susp of activeSuspensions) {
      const duration = susp.sanction_detail?.duration_ms ?? 120000;
      if (clockMs >= susp.clock_ms && clockMs < susp.clock_ms + duration) {
        const remainingSecs = Math.ceil((susp.clock_ms + duration - clockMs) / 1000);
        return {
          canExecute: false,
          warning: `El jugador #${playerInRoster.shirt_number} ${playerInRoster.display_name_snapshot} está cumpliendo exclusión de 2 min (restan ${remainingSecs}s). No se realizó el cambio automático; resuelva manualmente.`,
          reason: 'Jugador con exclusión de 2 min activa',
        };
      }
    }

    return {
      canExecute: true,
      playerInId,
      playerOutId,
    };
  }

  /**
   * Ejecuta la sustitución automática vinculada al evento desencadenante.
   * El evento se guarda con sport_seq = triggerEvent.sport_seq + 1 y payload con triggered_by_event_id.
   */
  async executeAutoSub(
    matchId: string,
    periodId: string,
    teamId: string,
    clockMs: number,
    triggerEvent: MatchEvent,
    playerOutId: string,
    playerInId: string
  ): Promise<{ subEvent: MatchEvent; outInterval: PlayerParticipationInterval; inInterval: PlayerParticipationInterval }> {
    const sportSeq = triggerEvent.sport_seq + 1;

    const res = await this.actionRecorder.recordAction({
      matchId,
      periodId,
      teamId,
      type: 'SUBSTITUTION',
      clockMs,
      sportSeq,
      payload: {
        triggered_by_event_id: triggerEvent.id,
        auto_defense_attack: true,
      },
      participants: [
        { roster_id: playerOutId, role: 'SUB_OUT' },
        { roster_id: playerInId, role: 'SUB_IN' },
      ],
      note: 'Cambio automático Defensa-Ataque',
    });

    if (!res.success) {
      throw new Error(`Error al registrar evento de sustitución automática: ${res.error}`);
    }

    const subEvent = res.savedEvent;

    const subIntervals = await this.participationService.substitutePlayer({
      matchId,
      periodId,
      teamId,
      clockMs,
      rosterOutId: playerOutId,
      rosterInId: playerInId,
      isGoalkeeper: false,
      eventId: subEvent.id,
    });

    return {
      subEvent,
      outInterval: subIntervals.outInterval,
      inInterval: subIntervals.inInterval,
    };
  }
}
