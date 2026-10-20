import React, { useState, useEffect } from 'react';
import type {
  Match,
  MatchPeriod,
  Team,
  MatchRoster,
  Player,
  PlayerParticipationInterval,
  MatchEvent,
} from '../domain/schemas';
import type { ClockSnapshot, MatchClockService } from '../services/clockService';
import type { ActionInput } from '../services/actionRecorder';
import {
  Play,
  Pause,
  Undo2,
  Check,
  X,
  Target,
  Shield,
  AlertTriangle,
  Users,
  Clock,
  ArrowRightLeft,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  ClipboardList,
} from 'lucide-react';
import { ZONE_NAMES_ES } from '../services/exportService';
import { HandballTacticalField } from './HandballTacticalField';
import type { DefenseAttackPairConfig } from '../services/defenseAttackSubService';

export interface LiveMatchConsoleProps {
  currentMatch: Match;
  periods: MatchPeriod[];
  activePeriodId: string;
  clockState: ClockSnapshot | null;
  clockService: MatchClockService | null;
  teams: Team[];
  rosters: MatchRoster[];
  players: Player[];
  activeCourtParticipations: PlayerParticipationInterval[];
  recentEvents: MatchEvent[];
  isOwnPossession: boolean;
  activePossessionTeamId?: string;
  numericalSituationLabel: string;
  numericalSituationContext: 'EQUAL' | 'SUPERIORITY' | 'INFERIORITY' | 'UNKNOWN';
  homeScore: number;
  awayScore: number;
  onRecordAction: (
    input: ActionInput,
    options?: {
      offensiveRebound?: boolean;
      customStartReason?: any;
      possessionOutcome?: 'ATTACKER_RETAINS' | 'DEFENDER_RECOVERS' | 'UNCERTAIN';
      autoDefenseAttack?: DefenseAttackPairConfig;
    }
  ) => Promise<any>;
  onUndoLastAction: () => Promise<void>;
  onEditEvent?: (event: MatchEvent) => void;
  onOpenSubstitutionModal: () => void;
  onConfirmStartersLineup: () => Promise<void>;
  onSwitchPeriod?: (periodId: string) => void;
  onFinishPeriod?: () => void;
  activePeriodIsEnded?: boolean;
  rivalOnCourtCount?: number | null;
  onSetRivalOnCourtCount?: (count: number | null) => void;
  offensiveReboundToggle?: boolean;
  onToggleOffensiveRebound?: (checked: boolean) => void;
  onNavigateToCoach?: () => void;
  externalTrigger?: {
    teamId: string;
    rosterId?: string;
    resultCode?: 'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED';
    actionCategory?: 'SHOT' | 'TURNOVER' | 'DEFENSE' | 'SANCTION';
    timestamp: number;
  } | null;
}

export type ActionCategory = 'SHOT' | 'TURNOVER' | 'DEFENSE' | 'SANCTION';

export const LiveMatchConsole: React.FC<LiveMatchConsoleProps> = ({
  currentMatch,
  periods,
  activePeriodId,
  clockState,
  clockService,
  teams,
  rosters,
  players: _players,
  activeCourtParticipations,
  recentEvents,
  isOwnPossession: _isOwnPossession,
  activePossessionTeamId,
  numericalSituationLabel,
  numericalSituationContext,
  homeScore,
  awayScore,
  onRecordAction,
  onUndoLastAction,
  onEditEvent,
  onOpenSubstitutionModal,
  onConfirmStartersLineup,
  onSwitchPeriod,
  onFinishPeriod,
  activePeriodIsEnded,
  rivalOnCourtCount,
  onSetRivalOnCourtCount,
  offensiveReboundToggle,
  onToggleOffensiveRebound,
  onNavigateToCoach,
  externalTrigger,
}) => {
  const homeTeam = teams.find((t) => t.id === currentMatch.home_team_id);
  const awayTeam = teams.find((t) => t.id === currentMatch.away_team_id);
  const ownTeamId = currentMatch.home_team_id;
  const rivalTeamId = currentMatch.away_team_id;

  // Estado Pareja Cambio Defensa-Ataque (persistido localmente por partido)
  const [defenseAttackPair, setDefenseAttackPair] = useState<DefenseAttackPairConfig>(() => {
    try {
      const saved = localStorage.getItem(`handstat_def_atk_pair_${currentMatch.id}`);
      if (saved) return JSON.parse(saved);
    } catch {}
    return { enabled: false, defenderRosterId: '', attackerRosterId: '' };
  });
  const [showDefenseAttackPanel, setShowDefenseAttackPanel] = useState<boolean>(false);

  useEffect(() => {
    try {
      localStorage.setItem(`handstat_def_atk_pair_${currentMatch.id}`, JSON.stringify(defenseAttackPair));
    } catch {}
  }, [defenseAttackPair, currentMatch.id]);

  // Desenlace de la posesión para tiros no convertidos (SAVED, POST, MISSED, BLOCKED)
  const [shotPossessionOutcome, setShotPossessionOutcome] = useState<'ATTACKER_RETAINS' | 'DEFENDER_RECOVERS' | 'UNCERTAIN'>('DEFENDER_RECOVERS');
  const [showPostHelp, setShowPostHelp] = useState<boolean>(false);

  // 1. Equipo que realiza la acción activa en la consola
  // Sigue a la posesión deportiva persistida por defecto
  const [actingTeamId, setActingTeamId] = useState<string>(activePossessionTeamId || ownTeamId);
  const [isManualTeamOverride, setIsManualTeamOverride] = useState<boolean>(false);

  // 2. Jugador que realiza la acción
  const [selectedRosterId, setSelectedRosterId] = useState<string | null>(null);
  const [isRivalCollective, setIsRivalCollective] = useState<boolean>((activePossessionTeamId || ownTeamId) === rivalTeamId);
  const [rivalDorsalInput, setRivalDorsalInput] = useState<string>('');

  // Si cambia el partido activo, sincronizar al poseedor y limpiar formulario
  useEffect(() => {
    setIsManualTeamOverride(false);
    const target = activePossessionTeamId || ownTeamId;
    setActingTeamId(target);
    setIsRivalCollective(target === rivalTeamId);
    setSelectedRosterId(null);
    setRivalDorsalInput('');
    setShotOriginZone(null);
    setShotTargetZone(null);
    setTurnoverZone(null);
    setCapturedClockMs(null);
    setIsEditingClock(false);
    setActionCategory('SHOT');
    setShotResult('GOAL');
    setShotType('JUMP');
    setShotPossessionOutcome('DEFENDER_RECOVERS');
    setShowPostHelp(false);
    setActionError(null);
  }, [currentMatch.id]);

  // 3. Categoría de Acción
  const [actionCategory, setActionCategory] = useState<ActionCategory>('SHOT');

  // 4. Parámetros de Lanzamiento (SHOT)
  const [shotResult, setShotResult] = useState<'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED'>('GOAL');
  const [shotOriginZone, setShotOriginZone] = useState<
    'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG' | 'DEFENSE' | 'MIDCOURT' | 'UNKNOWN' | null
  >(null);
  const [shotTargetZone, setShotTargetZone] = useState<
    | 'TL' | 'TC' | 'TR'
    | 'ML' | 'MC' | 'MR'
    | 'BL' | 'BC' | 'BR'
    | 'POST_L' | 'POST_R' | 'BAR'
    | 'OUT_L' | 'OUT_TOP' | 'OUT_R'
    | 'UNKNOWN'
    | null
  >(null);
  const [shotPhase, setShotPhase] = useState<'POSITIONAL' | 'FASTBREAK' | 'SECOND_WAVE' | 'SEVEN_M' | 'EMPTY_NET_LONG'>('POSITIONAL');
  const [isEmptyNet, setIsEmptyNet] = useState<boolean>(false);
  const [defendingGoalkeeperRosterId, setDefendingGoalkeeperRosterId] = useState<string | null>(null);

  // Metadatos avanzados de tiro (opcionales bajo acordeón "Más detalles")
  const [showAdvancedShotDetails, setShowAdvancedShotDetails] = useState<boolean>(false);
  const [shotType, setShotType] = useState<string>('JUMP');
  const [shotTrajectory, setShotTrajectory] = useState<string>('STRAIGHT');
  const [shotDefensePressure, setShotDefensePressure] = useState<string>('NONE');

  // 5. Parámetros de Pérdida (TURNOVER)
  const [turnoverReason, setTurnoverReason] = useState<
    'BAD_PASS' | 'CATCH_ERROR' | 'TRAVELING' | 'DOUBLE_DRIBBLE' | 'OFFENSIVE_FOUL' | 'PASSIVE_PLAY' | 'LINE_VIOLATION' | 'OTHER'
  >('BAD_PASS');
  const [turnoverZone, setTurnoverZone] = useState<
    'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG' | 'DEFENSE' | 'MIDCOURT' | 'UNKNOWN' | null
  >(null);

  // 6. Parámetros de Defensa / Recuperación
  const [defenseAction, setDefenseAction] = useState<'STEAL' | 'BLOCKED' | 'REBOUND'>('STEAL');
  const [defenseZone, setDefenseZone] = useState<
    'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG' | 'DEFENSE' | 'MIDCOURT' | 'UNKNOWN' | null
  >(null);

  // 7. Parámetros de Sanción
  const [sanctionKind, setSanctionKind] = useState<'YELLOW_CARD' | 'TWO_MINUTE' | 'RED_CARD' | 'BLUE_CARD'>('TWO_MINUTE');

  // 8. Captura y congelamiento del tiempo deportivo de la jugada
  const [capturedClockMs, setCapturedClockMs] = useState<number | null>(null);
  const [capturedPeriodId, setCapturedPeriodId] = useState<string>(activePeriodId);
  const [isEditingClock, setIsEditingClock] = useState<boolean>(false);
  const [editClockInput, setEditClockInput] = useState<string>('00:00');

  // 9. Estado de envío, protección contra doble toque y errores
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Bandera de jugada en preparación (cuando el usuario interactuó con parámetros específicos)
  const isPlayActive =
    selectedRosterId !== null ||
    rivalDorsalInput.trim() !== '' ||
    shotOriginZone !== null ||
    shotTargetZone !== null ||
    turnoverZone !== null ||
    defenseZone !== null ||
    capturedClockMs !== null;

  // Sincronización automática de la consola con la posesión persistida en la base de datos
  useEffect(() => {
    if (activePossessionTeamId) {
      if (!isManualTeamOverride && !isPlayActive) {
        setActingTeamId(activePossessionTeamId);
        setIsRivalCollective(activePossessionTeamId === rivalTeamId);
      }
    }
  }, [activePossessionTeamId, isManualTeamOverride, isPlayActive, rivalTeamId]);

  // Congelar reloj automáticamente al iniciar una jugada si aún no fue capturado
  const ensureClockCaptured = () => {
    if (capturedClockMs === null && clockState) {
      setCapturedClockMs(clockState.currentDisplayMs);
      setCapturedPeriodId(activePeriodId);
      const totalSecs = Math.floor(clockState.currentDisplayMs / 1000);
      const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
      const s = (totalSecs % 60).toString().padStart(2, '0');
      setEditClockInput(`${m}:${s}`);
    }
  };

  // Escuchar disparadores externos (ej. si se pulsa GOL en otra parte de la UI)
  useEffect(() => {
    if (externalTrigger) {
      ensureClockCaptured();
      setIsManualTeamOverride(true);
      setActingTeamId(externalTrigger.teamId);
      if (externalTrigger.actionCategory) {
        setActionCategory(externalTrigger.actionCategory);
      } else {
        setActionCategory('SHOT');
      }
      if (externalTrigger.rosterId) {
        setSelectedRosterId(externalTrigger.rosterId);
        setIsRivalCollective(false);
      } else if (externalTrigger.teamId === rivalTeamId) {
        setIsRivalCollective(true);
        setSelectedRosterId(null);
      }
      if (externalTrigger.resultCode) {
        setShotResult(externalTrigger.resultCode);
      }
    }
  }, [externalTrigger]);

  // Manejar cambio explícito de equipo
  const handleSelectTeam = (teamId: string) => {
    ensureClockCaptured();
    setIsManualTeamOverride(true);
    setActingTeamId(teamId);
    setSelectedRosterId(null);
    setRivalDorsalInput('');
    if (teamId === rivalTeamId) {
      setIsRivalCollective(true);
    } else {
      setIsRivalCollective(false);
    }
  };

  // Manejar selección de jugador
  const handleSelectPlayer = (rosterId: string) => {
    ensureClockCaptured();
    setSelectedRosterId(rosterId);
    setIsRivalCollective(false);
    setActionError(null);
  };

  // Manejar colectivo rival
  const handleSelectRivalCollective = () => {
    ensureClockCaptured();
    setSelectedRosterId(null);
    setIsRivalCollective(true);
    setRivalDorsalInput('');
    setActionError(null);
  };

  // Manejar dorsal rival específico
  const handleSelectRivalDorsal = (dorsal: string) => {
    ensureClockCaptured();
    setRivalDorsalInput(dorsal);
    setIsRivalCollective(false);
    setSelectedRosterId(null);
    setActionError(null);
  };

  // Manejar selección de origen de tiro
  const handleSelectShotOrigin = (
    zone: 'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG' | 'DEFENSE' | 'MIDCOURT' | 'UNKNOWN'
  ) => {
    ensureClockCaptured();
    setShotOriginZone(zone);
    if (zone === '7M') {
      setShotPhase('SEVEN_M');
    }
    setActionError(null);
  };

  // Manejar selección de destino en arco
  const handleSelectShotTarget = (
    target: 'TL' | 'TC' | 'TR' | 'ML' | 'MC' | 'MR' | 'BL' | 'BC' | 'BR' | 'POST_L' | 'POST_R' | 'BAR' | 'OUT_L' | 'OUT_TOP' | 'OUT_R' | 'UNKNOWN'
  ) => {
    ensureClockCaptured();
    setShotTargetZone(target);

    // Auto-ajustar resultado coherente si es poste o fuera
    if (target === 'POST_L' || target === 'POST_R' || target === 'BAR') {
      setShotResult('POST');
    } else if (target === 'OUT_L' || target === 'OUT_TOP' || target === 'OUT_R') {
      setShotResult('MISSED');
    }
    setActionError(null);
  };

  // Manejar selección de resultado de tiro
  const handleSelectShotResult = (result: 'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED') => {
    ensureClockCaptured();
    setShotResult(result);
    // Si se pasa a bloqueado, limpiar destino en arco ya que el bloqueo interrumpe el tiro
    if (result === 'BLOCKED') {
      setShotTargetZone(null);
    }
    if (result !== 'GOAL') {
      setShotPossessionOutcome('DEFENDER_RECOVERS');
    }
    if (result !== 'POST') {
      setShowPostHelp(false);
    }
    if (shotType === 'GOAL_TO_GOAL' && result !== 'GOAL') {
      setShotType('JUMP');
    }
    setActionError(null);
  };

  // Selección directa de Gol de Arco a Arco (Coast-to-Coast)
  const handleSelectGoalToGoal = () => {
    ensureClockCaptured();
    setActionCategory('SHOT');
    setShotResult('GOAL');
    setShotOriginZone('DEFENSE');
    if (!shotTargetZone) {
      setShotTargetZone('MC');
    }
    setShotType('GOAL_TO_GOAL');
    // Si no hay jugador seleccionado y hay un arquero en cancha del equipo que ataca, preseleccionarlo
    if (!selectedRosterId) {
      const gk = playersOnCourtActing.find((r) => r.role === 'GK');
      if (gk) setSelectedRosterId(gk.id);
    }
    setActionError(null);
  };

  // Manejar selección de zona de pérdida
  const handleSelectTurnoverZone = (
    zone: 'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG' | 'DEFENSE' | 'MIDCOURT' | 'UNKNOWN'
  ) => {
    ensureClockCaptured();
    setTurnoverZone(zone);
    setActionError(null);
  };

  // Cancelar la jugada en preparación sin modificar nada
  const handleCancelPlay = () => {
    setIsManualTeamOverride(false);
    const targetTeam = activePossessionTeamId || ownTeamId;
    setActingTeamId(targetTeam);
    setSelectedRosterId(null);
    setIsRivalCollective(targetTeam === rivalTeamId);
    setRivalDorsalInput('');
    setShotOriginZone(null);
    setShotTargetZone(null);
    setTurnoverZone(null);
    setDefenseZone(null);
    setCapturedClockMs(null);
    setActionError(null);
    setIsEditingClock(false);
    setActionCategory('SHOT');
    setShotResult('GOAL');
    setShotType('JUMP');
    setShotPossessionOutcome('DEFENDER_RECOVERS');
    setShowPostHelp(false);
  };

  // Guardar corrección manual de reloj
  const handleApplyEditedClock = () => {
    const parts = editClockInput.trim().split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0] || '0', 10);
      const s = parseInt(parts[1] || '0', 10);
      if (!isNaN(m) && !isNaN(s) && m >= 0 && s >= 0 && s < 60) {
        setCapturedClockMs((m * 60 + s) * 1000);
        setIsEditingClock(false);
        return;
      }
    }
    setActionError('Formato de tiempo inválido. Use MM:SS (ejemplo: 14:25).');
  };

  // CONFIRMAR Y GUARDAR LA ACCIÓN
  const handleConfirmAndSaveAction = async () => {
    if (isSubmitting) return;

    // Validación según categoría
    if (actionCategory === 'SHOT') {
      // Para GOL y ATAJADA, requerir origen y destino (pudiendo ser explícitamente UNKNOWN / No observado)
      if (shotResult === 'GOAL' || shotResult === 'SAVED') {
        if (!shotOriginZone && shotType !== 'GOAL_TO_GOAL') {
          setActionError('Por favor seleccione la zona de origen del tiro (o elija «No observada»).');
          return;
        }
        if (!shotTargetZone && shotType !== 'GOAL_TO_GOAL') {
          setActionError('Por favor seleccione el destino en la portería (o elija «No observado»).');
          return;
        }
      }
      if (shotResult === 'POST' && !shotTargetZone) {
        // Sugerir poste o permitir travesaño
        setActionError('Por favor seleccione en qué poste o travesaño impactó el tiro.');
        return;
      }
      if (shotResult === 'MISSED' && !shotTargetZone) {
        setActionError('Por favor seleccione la dirección del tiro fuera (Izquierda, Derecha o Alto).');
        return;
      }
    } else if (actionCategory === 'TURNOVER') {
      if (!turnoverZone) {
        setActionError('Por favor seleccione en qué zona de la cancha ocurrió la pérdida (o elija «No observada»).');
        return;
      }
    }

    try {
      setIsSubmitting(true);
      setActionError(null);

      const effectiveClockMs = capturedClockMs ?? (clockState?.currentDisplayMs ?? 0);
      const effectivePeriodId = capturedPeriodId || activePeriodId;

      // Participantes
      const participants: any[] = [];
      let note: string | undefined = undefined;

      if (actingTeamId === ownTeamId) {
        if (selectedRosterId) {
          if (actionCategory === 'SHOT') {
            participants.push({ roster_id: selectedRosterId, role: 'SHOOTER' });
          } else if (actionCategory === 'TURNOVER') {
            participants.push({ roster_id: selectedRosterId, role: 'TURNOVER_BY' });
          } else if (actionCategory === 'DEFENSE') {
            participants.push({
              roster_id: selectedRosterId,
              role: defenseAction === 'STEAL' ? 'RECOVERED_BY' : 'BLOCKER',
            });
          } else if (actionCategory === 'SANCTION') {
            participants.push({ roster_id: selectedRosterId, role: 'SANCTIONED' });
          }
        }
      } else {
        // Rival
        if (selectedRosterId) {
          if (actionCategory === 'SHOT') {
            participants.push({ roster_id: selectedRosterId, role: 'SHOOTER' });
          } else if (actionCategory === 'TURNOVER') {
            participants.push({ roster_id: selectedRosterId, role: 'TURNOVER_BY' });
          } else if (actionCategory === 'DEFENSE') {
            participants.push({
              roster_id: selectedRosterId,
              role: defenseAction === 'STEAL' ? 'RECOVERED_BY' : 'BLOCKER',
            });
          } else if (actionCategory === 'SANCTION') {
            participants.push({ roster_id: selectedRosterId, role: 'SANCTIONED' });
          }
        } else if (rivalDorsalInput.trim()) {
          note = `Rival #${rivalDorsalInput.trim()}`;
        }
      }

      // Portero defensor
      if (actionCategory === 'SHOT') {
        if (defendingGoalkeeperRosterId && !isEmptyNet) {
          participants.push({ roster_id: defendingGoalkeeperRosterId, role: 'GOALKEEPER' });
        }
      }

      // Preparar payload de acción
      let recordResult: any;

      if (actionCategory === 'SHOT') {
        const effectiveShotType = shotType === 'GOAL_TO_GOAL' ? 'GOAL_TO_GOAL' : (showAdvancedShotDetails ? shotType : undefined);
        const effectiveOrigin = shotOriginZone || (shotType === 'GOAL_TO_GOAL' ? 'DEFENSE' : 'UNKNOWN');
        const effectiveTarget = shotTargetZone || (shotResult === 'BLOCKED' ? 'UNKNOWN' : (shotType === 'GOAL_TO_GOAL' ? 'MC' : 'UNKNOWN'));

        const input: ActionInput = {
          matchId: currentMatch.id,
          periodId: effectivePeriodId,
          teamId: actingTeamId,
          type: 'SHOT',
          clockMs: effectiveClockMs,
          shotDetail: {
            result_code: shotResult,
            origin_zone_code: effectiveOrigin,
            target_zone_code: effectiveTarget,
            phase_code: shotPhase,
            is_empty_net: isEmptyNet,
            numerical_context: numericalSituationContext,
            shot_type: effectiveShotType,
            trajectory: showAdvancedShotDetails ? shotTrajectory : undefined,
            defense_pressure: showAdvancedShotDetails ? shotDefensePressure : undefined,
          },
          participants,
          note: shotType === 'GOAL_TO_GOAL' ? (note ? `${note} (Arco a arco)` : 'Gol de arco a arco') : note,
        };

        recordResult = await onRecordAction(input, {
          possessionOutcome: shotResult !== 'GOAL' ? shotPossessionOutcome : undefined,
          autoDefenseAttack: defenseAttackPair,
        });
        setActionSuccessMessage(`Tiro registrado: ${shotResult === 'GOAL' ? (shotType === 'GOAL_TO_GOAL' ? '¡GOL DE ARCO A ARCO!' : '¡GOL!') : shotResult}`);
      } else if (actionCategory === 'TURNOVER') {
        const input: ActionInput = {
          matchId: currentMatch.id,
          periodId: effectivePeriodId,
          teamId: actingTeamId,
          type: 'TURNOVER',
          clockMs: effectiveClockMs,
          turnoverDetail: {
            reason: turnoverReason,
            court_zone: turnoverZone || 'UNKNOWN',
            forced_by_defense: false,
          },
          participants,
          note,
        };

        recordResult = await onRecordAction(input, {
          autoDefenseAttack: defenseAttackPair,
        });
        setActionSuccessMessage(`Pérdida registrada: ${turnoverReason}`);
      } else if (actionCategory === 'DEFENSE') {
        if (defenseAction === 'STEAL') {
          // El equipo recuperador es actingTeamId
          const recoveringTeamId = actingTeamId;
          const losingTeamId = recoveringTeamId === ownTeamId ? rivalTeamId : ownTeamId;
          const effectiveZone = defenseZone || 'DEFENSE';
          const recTeam = recoveringTeamId === ownTeamId ? homeTeam : awayTeam;
          const recTeamName = recTeam?.short_name || recTeam?.name || 'Equipo';

          let actorStr = 'Colectivo / No identificado';
          if (selectedPlayer && selectedPlayer.team_id === recoveringTeamId) {
            actorStr = `#${selectedPlayer.shirt_number} ${selectedPlayer.display_name_snapshot}`;
          } else if (recoveringTeamId === rivalTeamId && rivalDorsalInput.trim()) {
            actorStr = `#${rivalDorsalInput.trim()}`;
          }

          const actionNote = note
            ? (note.includes('Robo') ? note : `${note} (Robo)`)
            : `Robo / Recuperación: ${recTeamName} (${actorStr}) en ${ZONE_NAMES_ES[effectiveZone] || effectiveZone}`;

          // Se registra la pérdida en el equipo que la comete (losingTeamId),
          // vinculando atómicamente la recuperación de posesión al recuperador (recoveringTeamId)
          // sin inventar jugador en el equipo perdedor.
          const input: ActionInput = {
            matchId: currentMatch.id,
            periodId: effectivePeriodId,
            teamId: losingTeamId,
            type: 'TURNOVER',
            clockMs: effectiveClockMs,
            turnoverDetail: {
              reason: 'STEAL',
              forced_by_defense: true,
              court_zone: effectiveZone,
            },
            participants, // Contiene RECOVERED_BY del jugador recuperador si fue seleccionado
            payload: {
              recovering_team_id: recoveringTeamId,
              losing_team_id: losingTeamId,
              is_steal_recovery: true,
              court_zone: effectiveZone,
            },
            note: actionNote,
          };
          recordResult = await onRecordAction(input, {
            autoDefenseAttack: defenseAttackPair,
          });
          setActionSuccessMessage('Recuperación / Robo registrado exitosamente');
        } else {
          // Bloqueo / Rebote
          const input: ActionInput = {
            matchId: currentMatch.id,
            periodId: effectivePeriodId,
            teamId: actingTeamId,
            type: 'NOTE',
            clockMs: effectiveClockMs,
            participants,
            note: defenseAction === 'BLOCKED' ? 'Bloqueo defensivo' : 'Rebote defensivo',
          };
          recordResult = await onRecordAction(input, {
            autoDefenseAttack: defenseAttackPair,
          });
          setActionSuccessMessage('Acción defensiva registrada exitosamente');
        }
      } else if (actionCategory === 'SANCTION') {
        const input: ActionInput = {
          matchId: currentMatch.id,
          periodId: effectivePeriodId,
          teamId: actingTeamId,
          type: 'SANCTION',
          clockMs: effectiveClockMs,
          sanctionDetail: {
            kind: sanctionKind,
            duration_ms: sanctionKind === 'TWO_MINUTE' ? 120000 : 0,
          },
          participants,
          note,
        };
        recordResult = await onRecordAction(input, {
          autoDefenseAttack: defenseAttackPair,
        });
        setActionSuccessMessage(`Sanción registrada: ${sanctionKind}`);
      }

      // Si el guardado falló, no alterar el formulario ni cambiar el equipo
      if (recordResult && recordResult.success === false) {
        setActionError(`Error al guardar: ${recordResult.error || 'No se pudo guardar la acción'}`);
        return;
      }

      // Determinar equipo poseedor para la siguiente jugada según el efecto formal
      let nextActingTeamId = actingTeamId;
      if (recordResult?.effect?.possessionChanged && recordResult.effect.newPossessionTeamId) {
        nextActingTeamId = recordResult.effect.newPossessionTeamId;
      } else if (recordResult?.effect?.newPossessionTeamId) {
        nextActingTeamId = recordResult.effect.newPossessionTeamId;
      } else if (actionCategory === 'DEFENSE' && defenseAction === 'STEAL') {
        // Tras un robo confirmado, el equipo recuperador queda preparado para atacar
        nextActingTeamId = actingTeamId;
      } else if (actionCategory === 'SHOT') {
        if (shotResult === 'GOAL') {
          nextActingTeamId = actingTeamId === ownTeamId ? rivalTeamId : ownTeamId;
        } else if (shotPossessionOutcome === 'DEFENDER_RECOVERS') {
          nextActingTeamId = actingTeamId === ownTeamId ? rivalTeamId : ownTeamId;
        }
      } else if (actionCategory === 'TURNOVER') {
        nextActingTeamId = actingTeamId === ownTeamId ? rivalTeamId : ownTeamId;
      }

      // Reinicio limpio y completo de la jugada tras éxito
      setIsManualTeamOverride(false);
      setActingTeamId(nextActingTeamId);
      setSelectedRosterId(null);
      setIsRivalCollective(nextActingTeamId === rivalTeamId);
      setRivalDorsalInput('');
      setShotOriginZone(null);
      setShotTargetZone(null);
      setTurnoverZone(null);
      setDefenseZone(null);
      setCapturedClockMs(null); // Limpiar reloj congelado para capturar nuevo tiempo en la siguiente jugada
      setIsEditingClock(false);
      setActionCategory('SHOT');
      setShotResult('GOAL');
      setShotType('JUMP');
      setShotPossessionOutcome('DEFENDER_RECOVERS');
      setShowPostHelp(false);

      setTimeout(() => {
        setActionSuccessMessage(null);
      }, 2500);
    } catch (err: any) {
      setActionError(`Error al guardar: ${err?.message || 'Fallo desconocido'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Renderizadores de ayudantes y etiquetas
  const actingTeam = actingTeamId === ownTeamId ? homeTeam : awayTeam;
  const defendingTeam = actingTeamId === ownTeamId ? awayTeam : homeTeam;

  const ownPlayersOnCourtCount = activeCourtParticipations.filter(
    (p) => p.team_id === ownTeamId && p.is_active
  ).length;

  const currentRostersActing = rosters.filter((r) => r.team_id === actingTeamId);
  const playersOnCourtActing = currentRostersActing.filter((r) =>
    activeCourtParticipations.some((p) => p.roster_id === r.id && p.team_id === actingTeamId && p.is_active)
  );
  const playersOnBenchActing = currentRostersActing.filter(
    (r) => !activeCourtParticipations.some((p) => p.roster_id === r.id && p.team_id === actingTeamId && p.is_active)
  );

  const selectedPlayer = currentRostersActing.find((r) => r.id === selectedRosterId);

  // Formato de reloj capturado
  const formatMs = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const m = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const s = (totalSecs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const capturedClockFormatted = capturedClockMs !== null ? formatMs(capturedClockMs) : formatMs(clockState?.currentDisplayMs ?? 0);

  // Fase deportiva activa del equipo propio
  const isOwnAttacking = activePossessionTeamId !== undefined
    ? activePossessionTeamId === ownTeamId
    : _isOwnPossession;

  const activePlayerInCourtId = isOwnAttacking
    ? defenseAttackPair.attackerRosterId
    : defenseAttackPair.defenderRosterId;
  const activePlayerRoster = rosters.find((r) => r.id === activePlayerInCourtId);

  // Construcción del Resumen de la Jugada en Vivo
  const buildPlaySummary = () => {
    const teamName = actingTeam?.short_name || actingTeam?.name || 'Equipo';
    let actorStr = 'Sin jugador seleccionado';
    if (selectedPlayer) {
      actorStr = `#${selectedPlayer.shirt_number} ${selectedPlayer.display_name_snapshot}`;
    } else if (isRivalCollective) {
      actorStr = 'Rival Colectivo';
    } else if (rivalDorsalInput.trim()) {
      actorStr = `#${rivalDorsalInput.trim()} (Rival)`;
    }

    if (actionCategory === 'SHOT') {
      const resStr =
        shotResult === 'GOAL'
          ? (shotType === 'GOAL_TO_GOAL' ? 'GOL (Arco a arco)' : 'GOL')
          : shotResult === 'SAVED'
          ? 'Atajada'
          : shotResult === 'MISSED'
          ? 'Fuera'
          : shotResult === 'POST'
          ? 'Poste/Travesaño'
          : 'Bloqueado';
      const origStr = shotOriginZone ? (ZONE_NAMES_ES[shotOriginZone] || shotOriginZone) : 'Origen sin definir';
      const targStr = shotTargetZone ? (ZONE_NAMES_ES[shotTargetZone] || shotTargetZone) : (shotResult === 'BLOCKED' ? 'Bloqueo en cancha' : 'Destino sin definir');
      return `${teamName} · ${actorStr} → Tiro [${resStr}] desde ${origStr} hacia ${targStr}`;
    } else if (actionCategory === 'TURNOVER') {
      const zStr = turnoverZone ? (ZONE_NAMES_ES[turnoverZone] || turnoverZone) : 'Zona sin definir';
      return `${teamName} · ${actorStr} → Pérdida [${turnoverReason}] en ${zStr}`;
    } else if (actionCategory === 'DEFENSE') {
      const recTeamName = actingTeam?.short_name || actingTeam?.name || 'Equipo';
      const zStr = defenseZone ? ` en ${ZONE_NAMES_ES[defenseZone] || defenseZone}` : '';
      if (defenseAction === 'STEAL') {
        const whoStr = selectedPlayer
          ? `#${selectedPlayer.shirt_number} ${selectedPlayer.display_name_snapshot}`
          : (actingTeamId === rivalTeamId && rivalDorsalInput.trim() ? `#${rivalDorsalInput.trim()} (Rival)` : 'Colectivo');
        return `Recupera: ${recTeamName} · ${whoStr}${zStr}`;
      }
      return `${recTeamName} · ${actorStr} → Acción Defensiva [${defenseAction}]${zStr}`;
    } else if (actionCategory === 'SANCTION') {
      return `${teamName} · ${actorStr} → Sanción [${sanctionKind}]`;
    }
    return '';
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 1. BARRA SUPERIOR FIJA: MARCADOR, RELOJ, POSESIÓN Y DESHACER */}
      <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-lg select-none">
        {/* Marcador en Vivo y Selector Rápido de Equipo */}
        <div className="flex items-center gap-2">
          {/* Botón Equipo Propio */}
          <button
            type="button"
            onClick={() => handleSelectTeam(ownTeamId)}
            className={`px-3 py-1.5 rounded-lg border text-left transition-all flex items-center gap-2 ${
              actingTeamId === ownTeamId
                ? 'bg-sky-950 border-sky-500 text-white shadow-md ring-2 ring-sky-500/80 scale-[1.02]'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: homeTeam?.color_primary || '#0284c7' }}
            />
            <span className="font-bold text-xs truncate max-w-[110px] sm:max-w-[150px]">
              {homeTeam?.short_name || homeTeam?.name || 'Local'}
            </span>
            <span className="font-mono font-bold text-sm text-sky-400 ml-1">{homeScore}</span>
            {activePossessionTeamId === ownTeamId ? (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-600 text-white font-bold ml-1 flex items-center gap-0.5">
                <span>⚽</span>
                <span>POSESIÓN</span>
              </span>
            ) : actingTeamId === ownTeamId && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 font-semibold ml-1" title="Registrando acción para el equipo propio">
                ACCIÓN
              </span>
            )}
          </button>

          <span className="text-slate-600 font-bold text-xs">vs</span>

          {/* Botón Equipo Rival */}
          <button
            type="button"
            onClick={() => handleSelectTeam(rivalTeamId)}
            className={`px-3 py-1.5 rounded-lg border text-left transition-all flex items-center gap-2 ${
              actingTeamId === rivalTeamId
                ? 'bg-rose-950 border-rose-500 text-white shadow-md ring-2 ring-rose-500/80 scale-[1.02]'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: awayTeam?.color_primary || '#ef4444' }}
            />
            <span className="font-bold text-xs truncate max-w-[110px] sm:max-w-[150px]">
              {awayTeam?.short_name || awayTeam?.name || 'Rival'}
            </span>
            <span className="font-mono font-bold text-sm text-rose-400 ml-1">{awayScore}</span>
            {activePossessionTeamId === rivalTeamId ? (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold ml-1 flex items-center gap-0.5">
                <span>⚽</span>
                <span>POSESIÓN</span>
              </span>
            ) : actingTeamId === rivalTeamId && (
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-700 text-slate-200 font-semibold ml-1" title="Registrando acción para el rival">
                ACCIÓN
              </span>
            )}
          </button>

          {/* Indicador de Posesión Incierta / Sin confirmar */}
          {!activePossessionTeamId && (
            <span className="text-[10px] px-2 py-0.5 bg-amber-950/80 border border-amber-600/80 text-amber-300 rounded font-semibold flex items-center gap-1 shadow-sm">
              <span>⚠️ Posesión: Sin confirmar</span>
            </span>
          )}
        </div>

        {/* Reloj Deportivo y Período */}
        <div className="flex items-center gap-2">
          {periods && periods.length > 0 && onSwitchPeriod && (
            <div className="flex items-center gap-1">
              {periods.map((p) => {
                const isSelected = p.id === activePeriodId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onSwitchPeriod(p.id)}
                    className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                      isSelected ? 'bg-sky-600 text-white shadow' : 'bg-slate-900 text-slate-400 hover:bg-slate-800 border border-slate-800'
                    }`}
                  >
                    {p.number}T
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-900 rounded-lg border border-slate-800 font-mono text-xs">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 font-semibold">{periods.find((p) => p.id === activePeriodId)?.number || 1}ºP</span>
            <span className="text-slate-200 font-bold ml-1 text-sm">{formatMs(clockState?.currentDisplayMs ?? 0)}</span>
          </div>

          {clockService && (
            <button
              type="button"
              onClick={async () => {
                if (clockState?.running) {
                  await clockService.pause();
                } else {
                  await clockService.start();
                }
              }}
              className={`p-1.5 rounded-lg border font-bold text-xs flex items-center gap-1 transition-all ${
                clockState?.running
                  ? 'bg-amber-600/30 border-amber-500 text-amber-300 hover:bg-amber-600/40'
                  : 'bg-emerald-600/30 border-emerald-500 text-emerald-300 hover:bg-emerald-600/40'
              }`}
              title={clockState?.running ? 'Pausar Reloj' : 'Reanudar Reloj'}
            >
              {clockState?.running ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
          )}

          {/* Botón de Deshacer siempre accesible */}
          <button
            type="button"
            onClick={async () => {
              setIsManualTeamOverride(false);
              await onUndoLastAction();
            }}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white rounded-lg border border-slate-700 text-xs font-semibold flex items-center gap-1 shadow transition-all"
            title="Deshacer última acción activa registrada"
          >
            <Undo2 className="w-3.5 h-3.5 text-rose-400" />
            <span className="hidden sm:inline">Deshacer</span>
          </button>

          {/* Acceso directo al Panel del DT */}
          {onNavigateToCoach && (
            <button
              type="button"
              onClick={onNavigateToCoach}
              className="px-2.5 py-1.5 bg-sky-950/80 hover:bg-sky-900 active:scale-95 text-sky-300 hover:text-white rounded-lg border border-sky-600/50 text-xs font-semibold flex items-center gap-1 shadow transition-all"
              title="Abrir Panel del DT (la jugada en preparación se conserva)"
            >
              <ClipboardList className="w-3.5 h-3.5 text-sky-400" />
              <span className="hidden sm:inline">Panel DT</span>
            </button>
          )}
        </div>
      </div>

      {/* Sub-barra de Contexto: Situación Numérica, Rivales en Cancha, Rebote Ofensivo y Fin de Período */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-slate-950/70 rounded-lg border border-slate-800/80 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="text-slate-400">Situación:</span>
            <strong
              className={
                numericalSituationContext === 'SUPERIORITY'
                  ? 'text-emerald-400'
                  : numericalSituationContext === 'INFERIORITY'
                  ? 'text-amber-400'
                  : 'text-slate-200'
              }
            >
              {numericalSituationLabel}
            </strong>
          </span>

          {onSetRivalOnCourtCount && (
            <div className="flex items-center gap-1 text-[11px]">
              <span className="text-slate-400">Rivales:</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => onSetRivalOnCourtCount(null)}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                    rivalOnCourtCount === null ? 'bg-amber-700 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  ?
                </button>
                <button
                  type="button"
                  onClick={() => onSetRivalOnCourtCount(7)}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                    rivalOnCourtCount === 7 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  7
                </button>
                <button
                  type="button"
                  onClick={() => onSetRivalOnCourtCount(6)}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                    rivalOnCourtCount === 6 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  6
                </button>
                <button
                  type="button"
                  onClick={() => onSetRivalOnCourtCount(5)}
                  className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                    rivalOnCourtCount === 5 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  5
                </button>
              </div>
            </div>
          )}

          {onToggleOffensiveRebound && (
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 font-medium ml-1">
              <input
                type="checkbox"
                checked={offensiveReboundToggle || false}
                onChange={(e) => onToggleOffensiveRebound(e.target.checked)}
                className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
              />
              <span className="text-[11px]">Rebote Ofensivo</span>
            </label>
          )}
        </div>

        {onFinishPeriod && (
          <div>
            {activePeriodIsEnded ? (
              <span className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[10px] font-semibold flex items-center gap-1 cursor-default">
                ✓ Período Finalizado
              </span>
            ) : (
              <button
                type="button"
                onClick={onFinishPeriod}
                className="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded text-[10px] font-semibold transition-colors"
              >
                Finalizar Período
              </button>
            )}
          </div>
        )}
      </div>

      {/* 1.1 PANEL CONFIGURABLE: CAMBIO DEFENSA–ATAQUE */}
      <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex flex-col gap-2 shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <ArrowRightLeft className="w-3.5 h-3.5 text-sky-400" />
              <span>Cambio Defensa–Ataque</span>
            </span>

            {/* Estado y Fase Activa */}
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                isOwnAttacking
                  ? 'bg-sky-950 text-sky-300 border border-sky-800'
                  : 'bg-indigo-950 text-indigo-300 border border-indigo-800'
              }`}
            >
              <span>Fase:</span>
              <strong>{isOwnAttacking ? 'Ataque' : 'Defensa'}</strong>
              {activePlayerRoster && (
                <span className="text-slate-300 font-normal ml-0.5">
                  (en cancha: #{activePlayerRoster.shirt_number} {activePlayerRoster.display_name_snapshot})
                </span>
              )}
            </span>

            {defenseAttackPair.enabled && (
              <span className="px-1.5 py-0.5 bg-emerald-950 border border-emerald-800 text-emerald-300 rounded text-[10px] font-semibold">
                Auto ✓
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Interruptor toggle "Aplicar cambio automático con la posesión" */}
            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 font-medium text-xs">
              <input
                type="checkbox"
                checked={defenseAttackPair.enabled}
                onChange={(e) => setDefenseAttackPair({ ...defenseAttackPair, enabled: e.target.checked })}
                className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
              />
              <span className="text-[11px]">Aplicar cambio automático con la posesión</span>
            </label>

            {/* Botón Configurar */}
            <button
              type="button"
              onClick={() => setShowDefenseAttackPanel(!showDefenseAttackPanel)}
              className="px-2 py-1 bg-slate-900 hover:bg-slate-850 text-slate-300 hover:text-white rounded border border-slate-800 text-[10px] font-semibold flex items-center gap-1"
            >
              <span>{showDefenseAttackPanel ? 'Ocultar' : 'Configurar Pareja'}</span>
              {showDefenseAttackPanel ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Resumen de Pareja activa si no está expandido */}
        {!showDefenseAttackPanel && (defenseAttackPair.defenderRosterId || defenseAttackPair.attackerRosterId) && (
          <div className="text-[11px] text-slate-400 flex items-center gap-2 pl-5">
            <span>
              🛡️ Defensor:{' '}
              <strong className="text-slate-200">
                {rosters.find((r) => r.id === defenseAttackPair.defenderRosterId)?.display_name_snapshot
                  ? `#${rosters.find((r) => r.id === defenseAttackPair.defenderRosterId)?.shirt_number} ${
                      rosters.find((r) => r.id === defenseAttackPair.defenderRosterId)?.display_name_snapshot
                    }`
                  : 'Sin definir'}
              </strong>
            </span>
            <span>⇄</span>
            <span>
              ⚔️ Atacante:{' '}
              <strong className="text-slate-200">
                {rosters.find((r) => r.id === defenseAttackPair.attackerRosterId)?.display_name_snapshot
                  ? `#${rosters.find((r) => r.id === defenseAttackPair.attackerRosterId)?.shirt_number} ${
                      rosters.find((r) => r.id === defenseAttackPair.attackerRosterId)?.display_name_snapshot
                    }`
                  : 'Sin definir'}
              </strong>
            </span>
          </div>
        )}

        {/* Panel Desplegable de Configuración de Pareja */}
        {showDefenseAttackPanel && (
          <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 flex flex-col gap-2.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Selector Jugador Defensor */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-indigo-300 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  <span>Jugador especialista en Defensa (entra al pasar a defender):</span>
                </label>
                <select
                  value={defenseAttackPair.defenderRosterId}
                  onChange={(e) => setDefenseAttackPair({ ...defenseAttackPair, defenderRosterId: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded p-1.5 text-slate-200 text-xs"
                >
                  <option value="">Seleccione jugador defensor...</option>
                  {rosters
                    .filter((r) => r.team_id === ownTeamId && r.role !== 'GK')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.shirt_number} {r.display_name_snapshot} ({r.position_snapshot || 'Campo'})
                      </option>
                    ))}
                </select>
              </div>

              {/* Selector Jugador Atacante */}
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-semibold text-sky-300 flex items-center gap-1">
                  <Target className="w-3 h-3" />
                  <span>Jugador especialista en Ataque (entra al pasar a atacar):</span>
                </label>
                <select
                  value={defenseAttackPair.attackerRosterId}
                  onChange={(e) => setDefenseAttackPair({ ...defenseAttackPair, attackerRosterId: e.target.value })}
                  className="bg-slate-950 border border-slate-700 rounded p-1.5 text-slate-200 text-xs"
                >
                  <option value="">Seleccione jugador atacante...</option>
                  {rosters
                    .filter((r) => r.team_id === ownTeamId && r.role !== 'GK')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.shirt_number} {r.display_name_snapshot} ({r.position_snapshot || 'Campo'})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <p className="text-[10px] text-slate-400 italic">
              * Sustitución 1 a 1 entre jugadores de campo. Mantiene la cantidad en cancha. El arquero nunca se sustituye. Si el jugador a ingresar está suspendido (2 min) o descalificado, no se realiza el cambio y se notifica para resolución manual.
            </p>
          </div>
        )}
      </div>

      {/* 2. BANNER DE JUGADA EN PREPARACIÓN Y CONFIRMACIÓN RÁPIDA */}
      <div
        className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xl ${
          isPlayActive
            ? 'bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 border-sky-500 ring-1 ring-sky-500/50'
            : 'bg-slate-950 border-slate-800 opacity-90'
        }`}
      >
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
              actionCategory === 'SHOT'
                ? shotResult === 'GOAL'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-amber-600 text-white'
                : actionCategory === 'TURNOVER'
                ? 'bg-rose-700 text-white'
                : 'bg-sky-600 text-white'
            }`}
          >
            {actionCategory === 'SHOT' ? <Target className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider flex items-center gap-1">
              <span>Jugada en curso</span>
              <span>•</span>
              <span className="text-amber-400 font-bold">{capturedClockFormatted}</span>
              <button
                type="button"
                onClick={() => setIsEditingClock(!isEditingClock)}
                className="text-[9px] underline text-sky-400 hover:text-sky-300 ml-1"
              >
                (editar tiempo)
              </button>
            </span>
            <span className="text-xs font-bold text-slate-100 truncate">
              {buildPlaySummary()}
            </span>
          </div>
        </div>

        {/* Editor de tiempo si se activa */}
        {isEditingClock && (
          <div className="flex items-center gap-1 bg-slate-900 p-1.5 rounded border border-slate-700 text-xs">
            <span className="text-[10px] text-slate-400">Min:Seg:</span>
            <input
              type="text"
              value={editClockInput}
              onChange={(e) => setEditClockInput(e.target.value)}
              placeholder="MM:SS"
              className="w-16 px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono text-slate-100"
            />
            <button
              type="button"
              onClick={handleApplyEditedClock}
              className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded font-bold text-[10px]"
            >
              Aplicar
            </button>
            <button
              type="button"
              onClick={() => setIsEditingClock(false)}
              className="px-1.5 py-0.5 text-slate-400 hover:text-slate-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Botones Confirmar y Cancelar */}
        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
          <button
            type="button"
            onClick={handleCancelPlay}
            disabled={isSubmitting}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 font-semibold rounded-lg text-xs border border-slate-700 flex items-center gap-1 transition-all"
          >
            <X className="w-3.5 h-3.5 text-slate-400" />
            <span>Cancelar</span>
          </button>

          <button
            type="button"
            onClick={handleConfirmAndSaveAction}
            disabled={isSubmitting}
            className={`px-5 py-2 font-bold rounded-lg text-xs shadow-lg flex items-center gap-2 transition-all active:scale-95 ${
              actionCategory === 'SHOT' && shotResult === 'GOAL'
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/60'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-950/60'
            } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <Check className="w-4 h-4" />
            <span>{isSubmitting ? 'Guardando...' : 'CONFIRMAR Y GUARDAR'}</span>
          </button>
        </div>
      </div>

      {/* Notificaciones de error o éxito */}
      {actionError && (
        <div className="p-2.5 bg-rose-950/80 border border-rose-700 rounded-lg text-xs text-rose-200 flex items-center justify-between gap-2 shadow">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button type="button" onClick={() => setActionError(null)} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {actionSuccessMessage && (
        <div className="p-2.5 bg-emerald-950/80 border border-emerald-700 rounded-lg text-xs text-emerald-200 flex items-center gap-2 shadow">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{actionSuccessMessage}</span>
        </div>
      )}

      {/* 3. CONSOLA PRINCIPAL EN VIVO: 3 COLUMNAS EN PC / SECUENCIAL EN MÓVIL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
        {/* ============================================================== */}
        {/* COLUMNA 1: JUGADORES / PLANTILLA (lg:col-span-3) */}
        {/* ============================================================== */}
        <div className="lg:col-span-3 bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-3 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>Plantel: {actingTeam?.name}</span>
            </span>
            {actingTeamId === ownTeamId && (
              <div className="flex items-center gap-1.5">
                {ownPlayersOnCourtCount === 0 && (
                  <button
                    type="button"
                    onClick={onConfirmStartersLineup}
                    className="text-[10px] px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded font-bold animate-pulse flex items-center gap-1 shadow"
                    title="Confirmar septeto inicial para este período"
                  >
                    <Check className="w-2.5 h-2.5" />
                    <span>Titulares</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpenSubstitutionModal}
                  className="text-[10px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700 flex items-center gap-1 font-semibold"
                >
                  <ArrowRightLeft className="w-2.5 h-2.5" />
                  <span>Cambios</span>
                </button>
              </div>
            )}
          </div>

          {/* Opción Colectiva / Jugador No Identificado */}
          <button
            type="button"
            onClick={handleSelectRivalCollective}
            className={`w-full p-2 rounded-lg border text-left text-xs font-bold flex items-center justify-between transition-all ${
              isRivalCollective
                ? 'bg-amber-600 text-white border-amber-400 shadow ring-2 ring-amber-400'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
            }`}
          >
            <span>👥 {actingTeamId === ownTeamId ? 'Equipo Propio (Colectivo / Desconocido)' : 'Rival Colectivo / No identificado'}</span>
            {isRivalCollective && <Check className="w-3.5 h-3.5" />}
          </button>

          {/* Ingreso rápido de dorsal rival específico */}
          {actingTeamId === rivalTeamId && (
            <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 flex flex-col gap-1.5">
              <span className="text-[10px] text-slate-400 font-semibold">O identificar por dorsal rival:</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={rivalDorsalInput}
                  onChange={(e) => handleSelectRivalDorsal(e.target.value)}
                  placeholder="Ej: 8"
                  className="w-16 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-center text-xs font-mono font-bold text-slate-100"
                />
                <span className="text-[10px] text-slate-400">Dorsal #{rivalDorsalInput || '—'}</span>
              </div>
            </div>
          )}

          {/* Jugadores En Cancha */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              En Cancha ({playersOnCourtActing.length})
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
              {playersOnCourtActing.map((roster) => {
                const isSelected = selectedRosterId === roster.id;
                return (
                  <button
                    key={roster.id}
                    type="button"
                    onClick={() => handleSelectPlayer(roster.id)}
                    className={`p-2 rounded-lg border text-left transition-all flex flex-col justify-between min-h-[52px] ${
                      isSelected
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold scale-[1.02]'
                        : 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-850 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-mono font-black text-sm text-amber-400">{roster.shirt_number}</span>
                      <div className="flex items-center gap-1">
                        {roster.position_snapshot && (
                          <span
                            className="text-[8px] bg-slate-800 text-slate-300 px-1 rounded font-mono uppercase"
                            title="Puesto nominal orientativo (sin restricciones de desplazamiento)"
                          >
                            {roster.position_snapshot}
                          </span>
                        )}
                        {roster.role === 'GK' && (
                          <span className="text-[8px] bg-amber-950 text-amber-300 border border-amber-600 px-1 rounded font-mono">
                            POR
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[11px] truncate font-semibold">
                      {roster.display_name_snapshot}
                    </span>
                  </button>
                );
              })}
              {playersOnCourtActing.length === 0 && (
                <div className="col-span-2 p-2 bg-slate-900/60 rounded border border-slate-800 text-[10px] text-slate-500 italic text-center">
                  Sin formación registrada en cancha
                </div>
              )}
            </div>
          </div>

          {/* Jugadores en Banquillo */}
          {playersOnBenchActing.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Banquillo ({playersOnBenchActing.length})
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-1.5">
                {playersOnBenchActing.map((roster) => {
                  const isSelected = selectedRosterId === roster.id;
                  return (
                    <button
                      key={roster.id}
                      type="button"
                      onClick={() => handleSelectPlayer(roster.id)}
                      className={`p-1.5 rounded-lg border text-left transition-all flex flex-col justify-between opacity-80 hover:opacity-100 ${
                        isSelected
                          ? 'bg-sky-600 text-white border-sky-400 shadow ring-2 ring-sky-400 font-bold opacity-100'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono font-bold text-xs text-slate-400">{roster.shirt_number}</span>
                        <div className="flex items-center gap-1">
                          {roster.position_snapshot && (
                            <span
                              className="text-[8px] bg-slate-800 text-slate-400 px-1 rounded font-mono uppercase"
                              title="Puesto nominal orientativo"
                            >
                              {roster.position_snapshot}
                            </span>
                          )}
                          {roster.role === 'GK' && (
                            <span className="text-[8px] bg-slate-800 text-slate-400 px-1 rounded font-mono">
                              POR
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-[10px] truncate">{roster.display_name_snapshot}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <p className="text-[9px] text-slate-500 italic text-center mt-1">
            * Puestos nominales de referencia: cualquier jugador puede lanzar o defender en cualquier sector de la cancha.
          </p>
        </div>

        {/* ============================================================== */}
        {/* COLUMNA 2: CANCHA TÁCTICA Y ARCO INTERACTIVO (lg:col-span-5) */}
        {/* ============================================================== */}
        <div className="lg:col-span-5 bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex flex-col gap-3.5 shadow-md">
          {/* Categoría de Acción Tabs */}
          <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800 text-xs font-bold">
            <button
              type="button"
              onClick={() => {
                ensureClockCaptured();
                setActionCategory('SHOT');
              }}
              className={`py-2 rounded transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                actionCategory === 'SHOT'
                  ? 'bg-sky-600 text-white shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              <span>Tiro</span>
            </button>

            <button
              type="button"
              onClick={() => {
                ensureClockCaptured();
                setActionCategory('TURNOVER');
              }}
              className={`py-2 rounded transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                actionCategory === 'TURNOVER'
                  ? 'bg-rose-700 text-white shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Pérdida</span>
            </button>

            <button
              type="button"
              onClick={() => {
                ensureClockCaptured();
                setActionCategory('DEFENSE');
                // Al entrar a la pestaña defensa, el equipo activo pasa al equipo defensor
                // (el que no tiene la posesión actualmente, o el alterno si no hay posesión fija)
                const defendingTeam = activePossessionTeamId
                  ? (activePossessionTeamId === ownTeamId ? rivalTeamId : ownTeamId)
                  : (actingTeamId === ownTeamId ? rivalTeamId : ownTeamId);
                setActingTeamId(defendingTeam);
                setSelectedRosterId(null);
                setIsRivalCollective(defendingTeam === rivalTeamId);
                setRivalDorsalInput('');
                setActionError(null);
              }}
              className={`py-2 rounded transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                actionCategory === 'DEFENSE'
                  ? 'bg-indigo-600 text-white shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Defensa</span>
            </button>

            <button
              type="button"
              onClick={() => {
                ensureClockCaptured();
                setActionCategory('SANCTION');
              }}
              className={`py-2 rounded transition-all text-center flex flex-col items-center justify-center gap-0.5 ${
                actionCategory === 'SANCTION'
                  ? 'bg-amber-600 text-white shadow font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Sanción</span>
            </button>
          </div>

          {/* VISTA SEGÚN CATEGORÍA */}
          {actionCategory === 'SHOT' && (
            <div className="flex flex-col gap-3">
              {/* 1. Selector de Resultado de Tiro y Acceso Rápido Arco a Arco */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Resultado del Lanzamiento:
                  </span>
                  <button
                    type="button"
                    onClick={handleSelectGoalToGoal}
                    className={`px-2.5 py-1 rounded-lg border text-xs font-bold flex items-center gap-1 transition-all ${
                      shotType === 'GOAL_TO_GOAL' && shotResult === 'GOAL'
                        ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400 shadow'
                        : 'bg-slate-900 border-slate-700 text-emerald-400 hover:bg-slate-850'
                    }`}
                    title="Gol directo de arco a arco (1 tiro, 1 gol)"
                  >
                    <span>⚡ Gol de Arco a Arco</span>
                  </button>
                </div>

                {shotType === 'GOAL_TO_GOAL' && (
                  <div className="p-2 bg-emerald-950/70 border border-emerald-700 rounded-lg text-xs text-emerald-200 flex items-center justify-between shadow">
                    <span className="font-semibold flex items-center gap-1.5">
                      <span>⚡ Tiro de Arco a Arco activo</span>
                      <span className="text-[10px] text-emerald-400 font-normal">
                        (Origen: Zona Defensiva propia → Portería rival · 1 Tiro, 1 Gol)
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShotType('JUMP')}
                      className="text-slate-400 hover:text-white text-xs px-1"
                      title="Volver a tiro convencional"
                    >
                      ✕
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-5 gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => handleSelectShotResult('GOAL')}
                    className={`py-2 rounded-lg font-bold border transition-all flex flex-col items-center justify-center ${
                      shotResult === 'GOAL'
                        ? 'bg-emerald-600 text-white border-emerald-400 shadow-md ring-2 ring-emerald-400 scale-[1.02]'
                        : 'bg-slate-900 border-slate-800 text-emerald-400 hover:bg-slate-850'
                    }`}
                  >
                    <span>GOL</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectShotResult('SAVED')}
                    className={`py-2 rounded-lg font-bold border transition-all flex flex-col items-center justify-center ${
                      shotResult === 'SAVED'
                        ? 'bg-amber-600 text-white border-amber-400 shadow-md ring-2 ring-amber-400 scale-[1.02]'
                        : 'bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-850'
                    }`}
                  >
                    <span>Atajada</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectShotResult('MISSED')}
                    className={`py-2 rounded-lg font-bold border transition-all flex flex-col items-center justify-center ${
                      shotResult === 'MISSED'
                        ? 'bg-slate-700 text-white border-slate-400 shadow-md ring-2 ring-slate-400 scale-[1.02]'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <span>Fuera</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectShotResult('POST')}
                    className={`py-2 rounded-lg font-bold border transition-all flex flex-col items-center justify-center ${
                      shotResult === 'POST'
                        ? 'bg-orange-600 text-white border-orange-400 shadow-md ring-2 ring-orange-400 scale-[1.02]'
                        : 'bg-slate-900 border-slate-800 text-orange-400 hover:bg-slate-850'
                    }`}
                  >
                    <span>Poste</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectShotResult('BLOCKED')}
                    className={`py-2 rounded-lg font-bold border transition-all flex flex-col items-center justify-center ${
                      shotResult === 'BLOCKED'
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow-md ring-2 ring-indigo-400 scale-[1.02]'
                        : 'bg-slate-900 border-slate-800 text-indigo-300 hover:bg-slate-850'
                    }`}
                  >
                    <span>Bloqueo</span>
                  </button>
                </div>

                {/* Selector de Desenlace de la Posesión para Tiros No Convertidos */}
                {shotResult !== 'GOAL' && (
                  <div className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <span>Desenlace de la Posesión:</span>
                        <span className="text-[10px] text-slate-400 font-normal lowercase">
                          ({shotResult === 'MISSED' ? 'reanudación reglamentaria' : 'tras el rebote o intervención'})
                        </span>
                      </span>
                      {shotResult === 'POST' && (
                        <button
                          type="button"
                          onClick={() => setShowPostHelp(!showPostHelp)}
                          className="text-[10px] text-sky-400 hover:text-sky-300 underline font-semibold flex items-center gap-1"
                        >
                          <span>{showPostHelp ? 'Ocultar ayuda' : '¿Cómo registrarlo?'}</span>
                        </button>
                      )}
                    </div>

                    {/* Tarjeta de Orientación Práctica para Poste y Travesaño */}
                    {shotResult === 'POST' && showPostHelp && (
                      <div className="p-2.5 bg-slate-950 rounded border border-sky-800/80 text-[11px] text-slate-300 flex flex-col gap-1.5 shadow">
                        <div className="font-bold text-sky-300 text-xs">Reglas de registro para Poste y Travesaño:</div>
                        <div>1. <strong>Poste y entra a gol:</strong> Registrar como <em>GOL</em> (el poste fue sólo trayectoria previa).</div>
                        <div>2. <strong>Poste y sale fuera de fondo:</strong> Registrar como <em>Poste</em> + <em>Recupera defensor</em> (saque de portería para el arquero rival).</div>
                        <div>3. <strong>Poste y rebote ofensivo:</strong> Registrar como <em>Poste</em> + <em>Conserva el atacante</em> (continúa el ataque sin cerrar la posesión).</div>
                        <div>4. <strong>Poste y arquero/defensa recupera:</strong> Registrar como <em>Poste</em> + <em>Recupera defensor</em>.</div>
                      </div>
                    )}

                    {shotResult === 'BLOCKED' && (
                      <div className="text-[10px] text-indigo-300 bg-indigo-950/40 px-2 py-1 rounded border border-indigo-900/60">
                        ℹ️ Tiro interceptado en campo: no requiere seleccionar cuadrante de portería. Indique quién retiene el balón.
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setShotPossessionOutcome('ATTACKER_RETAINS')}
                        className={`py-1.5 px-2 rounded-lg font-bold border transition-all text-center flex flex-col items-center justify-center ${
                          shotPossessionOutcome === 'ATTACKER_RETAINS'
                            ? 'bg-emerald-700 text-white border-emerald-400 shadow ring-2 ring-emerald-400'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <span>Conserva atacante</span>
                        <span className="text-[9px] font-normal opacity-80">(Rebote ofensivo)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShotPossessionOutcome('DEFENDER_RECOVERS')}
                        className={`py-1.5 px-2 rounded-lg font-bold border transition-all text-center flex flex-col items-center justify-center ${
                          shotPossessionOutcome === 'DEFENDER_RECOVERS'
                            ? 'bg-sky-700 text-white border-sky-400 shadow ring-2 ring-sky-400'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-850'
                        }`}
                      >
                        <span>Recupera defensor</span>
                        <span className="text-[9px] font-normal opacity-80">(Portero / Saque rival)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShotPossessionOutcome('UNCERTAIN')}
                        className={`py-1.5 px-2 rounded-lg font-bold border transition-all text-center flex flex-col items-center justify-center ${
                          shotPossessionOutcome === 'UNCERTAIN'
                            ? 'bg-amber-700 text-white border-amber-400 shadow ring-2 ring-amber-400'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:bg-slate-850'
                        }`}
                      >
                        <span>Sin confirmar</span>
                        <span className="text-[9px] font-normal opacity-80">(Balón suelto)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. CANCHA TÁCTICA Y ARCO INTERACTIVOS (Selector Directo sobre el Dibujo) */}
              <HandballTacticalField
                mode="SHOT"
                selectedOriginZone={shotOriginZone}
                onSelectOriginZone={handleSelectShotOrigin}
                selectedTargetZone={shotTargetZone}
                onSelectTargetZone={handleSelectShotTarget}
                shotResult={shotResult}
                actingTeamName={actingTeam?.name}
                actingTeamColor={actingTeam?.color_primary}
              />

              {/* Portero Defensor y Portería Vacía */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsEmptyNet(!isEmptyNet)}
                  className={`p-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                    isEmptyNet
                      ? 'bg-amber-600 text-white border-amber-400 shadow'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>{isEmptyNet ? '✓ Portería Vacía' : 'Portería Defendida'}</span>
                </button>

                <div className="flex items-center gap-1 bg-slate-900 px-2 py-1.5 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 truncate">Portero Rival:</span>
                  <select
                    value={defendingGoalkeeperRosterId || ''}
                    disabled={isEmptyNet}
                    onChange={(e) => setDefendingGoalkeeperRosterId(e.target.value || null)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded text-[11px] py-1 text-slate-200 truncate"
                  >
                    <option value="">Desconocido</option>
                    {rosters
                      .filter((r) => r.team_id === defendingTeam?.id && r.role === 'GK')
                      .map((gk) => (
                        <option key={gk.id} value={gk.id}>
                          #{gk.shirt_number} {gk.display_name_snapshot}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* Acordeón Opcional "Más Detalles" (Trayectoria, Tipo de Tiro, Presión) */}
              <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-900/60">
                <button
                  type="button"
                  onClick={() => setShowAdvancedShotDetails(!showAdvancedShotDetails)}
                  className="w-full p-2 flex items-center justify-between text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                >
                  <span>Más detalles del tiro (Trayectoria, Presión defensiva)</span>
                  {showAdvancedShotDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showAdvancedShotDetails && (
                  <div className="p-2.5 border-t border-slate-800 flex flex-col gap-2 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold">Tipo de lanzamiento:</span>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {[
                          { id: 'JUMP', label: 'Suspensión' },
                          { id: 'STANDING', label: 'Apoyo' },
                          { id: 'HIP', label: 'Cadera' },
                          { id: 'FLY', label: 'Fly / Rosca' },
                        ].map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setShotType(item.id)}
                            className={`py-1 rounded text-[10px] border ${
                              shotType === item.id
                                ? 'bg-sky-600 text-white border-sky-400 font-bold'
                                : 'bg-slate-950 text-slate-400 border-slate-800'
                            }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold">Trayectoria:</span>
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {['STRAIGHT', 'BOUNCE', 'LOB', 'SPIN'].map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setShotTrajectory(t)}
                            className={`py-1 rounded text-[10px] border ${
                              shotTrajectory === t
                                ? 'bg-sky-600 text-white border-sky-400 font-bold'
                                : 'bg-slate-950 text-slate-400 border-slate-800'
                            }`}
                          >
                            {t === 'STRAIGHT' ? 'Recto' : t === 'BOUNCE' ? 'Pique' : t === 'LOB' ? 'Vaselina' : 'Rosca'}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold">Presión defensiva:</span>
                      <div className="grid grid-cols-3 gap-1 mt-1">
                        {['NONE', 'ONE_DEFENDER', 'WALL'].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setShotDefensePressure(p)}
                            className={`py-1 rounded text-[10px] border ${
                              shotDefensePressure === p
                                ? 'bg-sky-600 text-white border-sky-400 font-bold'
                                : 'bg-slate-950 text-slate-400 border-slate-800'
                            }`}
                          >
                            {p === 'NONE' ? 'Sin presión' : p === 'ONE_DEFENDER' ? '1 Defensor' : 'Bloque/Pared'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VISTA DE PÉRDIDAS (TURNOVER) */}
          {actionCategory === 'TURNOVER' && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                1. Motivo de la Pérdida de Balón:
              </span>

              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {[
                  { reason: 'BAD_PASS', label: 'Mal Pase' },
                  { reason: 'CATCH_ERROR', label: 'Mala Recepción' },
                  { reason: 'TRAVELING', label: 'Pasos' },
                  { reason: 'DOUBLE_DRIBBLE', label: 'Doble Dribling' },
                  { reason: 'OFFENSIVE_FOUL', label: 'Falta en Ataque' },
                  { reason: 'PASSIVE_PLAY', label: 'Juego Pasivo' },
                  { reason: 'LINE_VIOLATION', label: 'Infracción de Área' },
                  { reason: 'OTHER', label: 'Otra / No observada' },
                ].map((item) => (
                  <button
                    key={item.reason}
                    type="button"
                    onClick={() => setTurnoverReason(item.reason as any)}
                    className={`p-2.5 rounded-lg border text-left font-bold transition-all flex items-center justify-between ${
                      turnoverReason === item.reason
                        ? 'bg-rose-700 text-white border-rose-400 shadow ring-2 ring-rose-400'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <span>{item.label}</span>
                    {turnoverReason === item.reason && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>

              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mt-2">
                2. Cancha Táctica — Zona donde ocurrió la pérdida:
              </span>

              {/* Media Cancha Gráfica para Selección Espacial de Pérdidas */}
              <HandballTacticalField
                mode="TURNOVER"
                selectedOriginZone={turnoverZone}
                onSelectOriginZone={handleSelectTurnoverZone}
                selectedTargetZone={null}
                onSelectTargetZone={() => {}}
                actingTeamName={actingTeam?.name}
                actingTeamColor={actingTeam?.color_primary}
              />
            </div>
          )}

          {/* VISTA DE DEFENSA / RECUPERACIÓN */}
          {actionCategory === 'DEFENSE' && (
            <div className="flex flex-col gap-3">
              {/* 1. Selector de Equipo que recupera */}
              <div className="flex flex-col gap-1.5 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 flex items-center justify-between">
                  <span>1. Equipo que recupera el balón:</span>
                  <span className="text-[9px] text-slate-400 font-normal">
                    {actingTeamId === ownTeamId ? 'Defendiendo (Local)' : 'Defendiendo (Rival)'}
                  </span>
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      ensureClockCaptured();
                      setActingTeamId(ownTeamId);
                      setSelectedRosterId(null);
                      setIsRivalCollective(false);
                      setRivalDorsalInput('');
                    }}
                    className={`p-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      actingTeamId === ownTeamId
                        ? 'bg-sky-950 border-sky-500 text-white shadow ring-2 ring-sky-500/80'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: homeTeam?.color_primary || '#0284c7' }} />
                    <span className="truncate">{homeTeam?.short_name || homeTeam?.name || 'Local'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      ensureClockCaptured();
                      setActingTeamId(rivalTeamId);
                      setSelectedRosterId(null);
                      setIsRivalCollective(true);
                      setRivalDorsalInput('');
                    }}
                    className={`p-2 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-all ${
                      actingTeamId === rivalTeamId
                        ? 'bg-rose-950 border-rose-500 text-white shadow ring-2 ring-rose-500/80'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: awayTeam?.color_primary || '#ef4444' }} />
                    <span className="truncate">{awayTeam?.short_name || awayTeam?.name || 'Rival'}</span>
                  </button>
                </div>

                {/* Discrepancia si el recuperador ya tenía la posesión */}
                {activePossessionTeamId && actingTeamId === activePossessionTeamId && (
                  <div className="p-2 bg-amber-950/70 border border-amber-600/80 rounded text-[11px] text-amber-200 flex items-start gap-1.5 mt-1">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5">
                      <span className="font-bold">Aviso de Posesión Registrada</span>
                      <span>
                        <strong>{actingTeam?.short_name || actingTeam?.name}</strong> ya figura actualmente con la posesión del balón.
                        Al confirmar, se registrará el robo y se mantendrá su posesión sin alternarla ciegamente.
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Selector de Tipo de Acción Defensiva */}
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                2. Tipo de Acción Defensiva:
              </span>
              <div className="grid grid-cols-3 gap-2 text-xs">
                {[
                  { action: 'STEAL', label: 'Robo / Intercepción', desc: 'Recupera posesión' },
                  { action: 'BLOCKED', label: 'Bloqueo de Tiro', desc: 'Desvío en cancha' },
                  { action: 'REBOUND', label: 'Rebote Defensivo', desc: 'Posesión asegurada' },
                ].map((item) => (
                  <button
                    key={item.action}
                    type="button"
                    onClick={() => {
                      ensureClockCaptured();
                      setDefenseAction(item.action as any);
                    }}
                    className={`p-3 rounded-lg border text-center font-bold flex flex-col items-center justify-center gap-1 transition-all ${
                      defenseAction === item.action
                        ? 'bg-indigo-600 text-white border-indigo-400 shadow ring-2 ring-indigo-400'
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <Shield className="w-4 h-4" />
                    <span>{item.label}</span>
                    <span className="text-[9px] opacity-75">{item.desc}</span>
                  </button>
                ))}
              </div>

              {/* 3. Cancha Táctica para la zona de recuperación */}
              {defenseAction === 'STEAL' && (
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                    3. Zona de la Cancha donde ocurrió el Robo / Recuperación:
                  </span>
                  <HandballTacticalField
                    mode="TURNOVER"
                    selectedOriginZone={defenseZone}
                    onSelectOriginZone={(z) => {
                      ensureClockCaptured();
                      setDefenseZone(z);
                    }}
                    selectedTargetZone={null}
                    onSelectTargetZone={() => {}}
                    actingTeamName={actingTeam?.name}
                    actingTeamColor={actingTeam?.color_primary}
                  />
                </div>
              )}

              {/* Vista previa explícita requerida: "Recupera: [equipo] · [jugador/colectivo]" */}
              <div className="p-2.5 bg-slate-900 border border-indigo-500/50 rounded-lg text-xs flex items-center justify-between shadow">
                <span className="text-slate-400 text-[11px]">Resumen de Recuperación:</span>
                <span className="font-bold text-indigo-300 font-mono">
                  {buildPlaySummary()}
                </span>
              </div>
            </div>
          )}

          {/* VISTA DE SANCIÓN DISCIPLINARIA */}
          {actionCategory === 'SANCTION' && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Sanción Disciplinaria para {actingTeam?.name}:
              </span>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { kind: 'YELLOW_CARD', label: 'Tarjeta Amarilla', color: 'border-yellow-500 text-yellow-300' },
                  { kind: 'TWO_MINUTE', label: 'Exclusión 2 Minutos', color: 'border-amber-500 text-amber-300' },
                  { kind: 'RED_CARD', label: 'Tarjeta Roja (Descalificación)', color: 'border-rose-500 text-rose-300' },
                  { kind: 'BLUE_CARD', label: 'Tarjeta Azul (Informe Escrito)', color: 'border-sky-500 text-sky-300' },
                ].map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => setSanctionKind(item.kind as any)}
                    className={`p-3 rounded-lg border text-left font-bold transition-all flex items-center justify-between ${
                      sanctionKind === item.kind
                        ? 'bg-slate-800 text-white ring-2 ring-amber-400 ' + item.color
                        : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-850'
                    }`}
                  >
                    <span>{item.label}</span>
                    {sanctionKind === item.kind && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ============================================================== */}
        {/* COLUMNA 3: HISTORIAL DE EVENTOS CONFIRMADOS Y EDICIÓN (lg:col-span-4) */}
        {/* ============================================================== */}
        <div className="lg:col-span-4 bg-slate-950 p-3 rounded-xl border border-slate-800 flex flex-col gap-2.5 shadow-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-slate-200">
              Últimas Acciones Confirmadas
            </span>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded">
              Auditoría en Vivo
            </span>
          </div>

          <div className="flex flex-col gap-2 max-h-[480px] overflow-y-auto pr-1">
            {recentEvents.slice(0, 8).map((ev) => {
              const team = teams.find((t) => t.id === ev.match_team_id);
              const isHome = ev.match_team_id === currentMatch.home_team_id;
              const period = periods.find((p) => p.id === ev.period_id);

              const isStealEvent = ev.type === 'TURNOVER' && (ev.turnover_detail?.reason === 'STEAL' || (ev.payload as any)?.is_steal_recovery);
              const recTeamId = isStealEvent
                ? ((ev.payload as any)?.recovering_team_id || (ev.match_team_id === ownTeamId ? rivalTeamId : ownTeamId))
                : ev.match_team_id;
              const recTeam = teams.find((t) => t.id === recTeamId);
              const isRecHome = recTeamId === currentMatch.home_team_id;

              const shooterPart = ev.participants.find((p) => p.role === 'SHOOTER');
              const turnoverPart = ev.participants.find((p) => p.role === 'TURNOVER_BY');
              const recPart = ev.participants.find((p) => p.role === 'RECOVERED_BY');
              const shooterRoster = rosters.find((r) => r.id === (shooterPart?.roster_id || turnoverPart?.roster_id || recPart?.roster_id));

              let desc = 'Acción de partido';
              if (ev.type === 'SHOT' && ev.shot_detail) {
                const res = ev.shot_detail.result_code === 'GOAL' ? '¡GOL!' : ev.shot_detail.result_code;
                const orig = ev.shot_detail.origin_zone_code ? (ZONE_NAMES_ES[ev.shot_detail.origin_zone_code] || ev.shot_detail.origin_zone_code) : '—';
                const targ = ev.shot_detail.target_zone_code ? (ZONE_NAMES_ES[ev.shot_detail.target_zone_code] || ev.shot_detail.target_zone_code) : '—';
                desc = `Tiro [${res}] de ${orig} → ${targ}`;
              } else if (ev.type === 'TURNOVER' && ev.turnover_detail) {
                if (isStealEvent) {
                  const playerStr = shooterRoster
                    ? `#${shooterRoster.shirt_number} ${shooterRoster.display_name_snapshot}`
                    : (recTeamId === rivalTeamId && ev.note?.includes('Rival #') ? ev.note : 'Colectivo');
                  const zStr = ev.turnover_detail.court_zone ? ` en ${ZONE_NAMES_ES[ev.turnover_detail.court_zone] || ev.turnover_detail.court_zone}` : '';
                  desc = `Robo / Recuperación: ${recTeam?.short_name || recTeam?.name || 'Defensa'} (${playerStr})${zStr}`;
                } else {
                  desc = `Pérdida (${ev.turnover_detail.reason})${ev.turnover_detail.court_zone ? ` en ${ZONE_NAMES_ES[ev.turnover_detail.court_zone] || ev.turnover_detail.court_zone}` : ''}`;
                }
              } else if (ev.type === 'SANCTION' && ev.sanction_detail) {
                desc = `Sanción: ${ev.sanction_detail.kind}`;
              } else if (ev.type === 'PERIOD_START') {
                desc = `Inicio de período ${period?.number || 1}`;
              } else if (ev.type === 'PERIOD_END') {
                desc = `Fin de período ${period?.number || 1}`;
              }

              return (
                <div
                  key={ev.id}
                  className={`p-2 rounded-lg border text-xs flex flex-col gap-1 transition-all ${
                    ev.status === 'voided'
                      ? 'bg-slate-900/40 border-slate-800 opacity-50 line-through'
                      : 'bg-slate-900 border-slate-800 text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-bold">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: (isStealEvent ? recTeam : team)?.color_primary || ((isStealEvent ? isRecHome : isHome) ? '#0284c7' : '#ef4444') }}
                      />
                      <span className={(isStealEvent ? isRecHome : isHome) ? 'text-sky-300' : 'text-rose-300'}>
                        {isStealEvent ? `Robo: ${(recTeam?.short_name || recTeam?.name || 'Defensa')}` : (team?.short_name || team?.name || 'Equipo')}
                      </span>
                      {shooterRoster && (
                        <span className="text-slate-300 font-normal">
                          · #{shooterRoster.shirt_number} {shooterRoster.display_name_snapshot}
                        </span>
                      )}
                      {isStealEvent && team && (
                        <span className="text-slate-500 font-normal text-[10px]">
                          (Pérdida de {team.short_name || team.name})
                        </span>
                      )}
                      {!isStealEvent && !shooterRoster && ev.note && (
                        <span className="text-slate-400 font-normal text-[10px]">({ev.note})</span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{formatMs(ev.clock_ms)}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-300 pl-3.5">
                    <span className="truncate">{desc}</span>
                    {onEditEvent && ev.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => onEditEvent(ev)}
                        className="text-[9px] text-sky-400 hover:text-sky-300 underline font-mono shrink-0 ml-2"
                      >
                        Editar
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {recentEvents.length === 0 && (
              <p className="p-3 text-center text-[11px] text-slate-500 italic">
                Aún no hay acciones registradas en este período.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
