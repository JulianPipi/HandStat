import React, { useEffect, useState, useRef } from 'react';
import { db } from './data/db';
import { cleanLegacySeedDataAndInitDemo, DEMO_MATCH_PRACTICE_ID } from './data/seedData';
import { MatchClockService, type ClockSnapshot } from './services/clockService';
import { ActionRecorderService, type SaveActionResult } from './services/actionRecorder';
import { TransferService, type ImportAnalysisResult } from './services/transferService';
import { MatchManagementService, type CreateTeamInput, type CreatePlayerInput } from './services/matchManagementService';
import { PossessionService, type EventEffectResult } from './services/possessionService';
import { ParticipationService } from './services/participationService';
import {
  StatsEngine,
  type MatchCompleteStats,
  type AggregatedMultiMatchStats
} from './services/statsEngine';
import { DefenseAttackSubService, type DefenseAttackPairConfig } from './services/defenseAttackSubService';
import type { MatchEvent, EventType, Match } from './domain/schemas';
import { ExportService, type ExportTableKey } from './services/exportService';
import { BackupService, type BackupInspectionResult } from './services/backupService';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Play,
  Pause,
  RotateCcw,
  Upload,
  Download,
  AlertTriangle,
  CheckCircle,
  Database,
  ShieldAlert,
  Laptop,
  Trophy,
  Plus,
  Archive,
  Undo2,
  Edit3,
  Trash2,
  ArrowRightLeft,
  Activity,
  BarChart2,
  Target,
  TrendingUp,
  Filter,
  Clock,
  FileSpreadsheet,
  FileText,
  FileDown,
  RefreshCw,
  ClipboardList
} from 'lucide-react';
import { LiveMatchConsole } from './components/LiveMatchConsole';
import { TacticalAnalysisMap } from './components/TacticalAnalysisMap';
import { CoachDashboard } from './components/CoachDashboard';

const getEventDisplayLabel = (ev: MatchEvent, periodBadge: string): string => {
  if (ev.type === 'PERIOD_END') return `Fin de Período (${periodBadge})`;
  if (ev.type === 'SHOT') {
    const resMap: Record<string, string> = {
      GOAL: 'Gol',
      SAVED: 'Atajada',
      POST: 'Poste / Travesaño',
      MISSED: 'Desviado / Fuera',
      BLOCKED: 'Bloqueado',
    };
    const res = ev.shot_detail?.result_code ? (resMap[ev.shot_detail.result_code] || ev.shot_detail.result_code) : 'Tiro';
    return `Lanzamiento (${res})`;
  }
  if (ev.type === 'TURNOVER') {
    const reasonMap: Record<string, string> = {
      BAD_PASS: 'Pase erróneo',
      HANDLING_ERROR: 'Falla de manejo',
      STEAL: 'Robo rival',
      OFFENSIVE_FOUL: 'Falta de ataque',
      PASSIVE_PLAY: 'Juego pasivo',
      TRAVEL: 'Pasos',
      DOUBLE_DRIBBLE: 'Doble drible',
      LINE_CROSS: 'Pisar área',
      OTHER: 'Otra causa',
    };
    const reason = ev.turnover_detail?.reason ? (reasonMap[ev.turnover_detail.reason] || ev.turnover_detail.reason) : 'Pérdida';
    return `Pérdida (${reason})`;
  }
  if (ev.type === 'SANCTION') {
    const kindMap: Record<string, string> = {
      YELLOW_CARD: 'Tarjeta Amarilla',
      TWO_MINUTE: 'Exclusión 2 Minutos',
      RED_CARD: 'Tarjeta Roja (Descalificación)',
      BLUE_CARD: 'Tarjeta Azul (Informe)',
    };
    const kind = ev.sanction_detail?.kind ? (kindMap[ev.sanction_detail.kind] || ev.sanction_detail.kind) : 'Sanción';
    return `Sanción (${kind})`;
  }
  if (ev.type === 'SUBSTITUTION') return 'Sustitución';
  if (ev.type === 'TIMEOUT') return 'Tiempo Muerto';
  if (ev.type === 'NOTE') return 'Nota / Observación';
  return ev.type;
};

const getEventBadgeClass = (ev: MatchEvent): string => {
  if (ev.type === 'SHOT') {
    if (ev.shot_detail?.result_code === 'GOAL') return 'bg-emerald-900/90 text-emerald-300 border border-emerald-700/50';
    if (ev.shot_detail?.result_code === 'SAVED') return 'bg-amber-900/90 text-amber-300 border border-amber-700/50';
    return 'bg-slate-700 text-slate-300';
  }
  if (ev.type === 'SANCTION') {
    if (ev.sanction_detail?.kind === 'YELLOW_CARD') return 'bg-yellow-900 text-yellow-300 border border-yellow-700/60';
    if (ev.sanction_detail?.kind === 'TWO_MINUTE') return 'bg-purple-900 text-purple-300 border border-purple-700/60';
    if (ev.sanction_detail?.kind === 'RED_CARD') return 'bg-rose-900 text-rose-300 border border-rose-700/60';
    if (ev.sanction_detail?.kind === 'BLUE_CARD') return 'bg-sky-900 text-sky-300 border border-sky-700/60';
  }
  if (ev.type === 'TURNOVER') return 'bg-red-950 text-red-300 border border-red-900/40';
  if (ev.type === 'TIMEOUT') return 'bg-indigo-900 text-indigo-300 border border-indigo-700/50';
  if (ev.type === 'NOTE') return 'bg-slate-700 text-slate-200';
  return 'bg-slate-700 text-slate-300';
};

export const App: React.FC = () => {
  // Estado del Partido Activo seleccionado
  const [currentMatchId, setCurrentMatchId] = useState<string>(DEMO_MATCH_PRACTICE_ID);

  // Servicios
  const [clockService, setClockService] = useState<MatchClockService | null>(null);
  const [clockState, setClockState] = useState<ClockSnapshot | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('saved');
  const [lastError, setLastError] = useState<string | null>(null);
  const [pendingRetryAction, setPendingRetryAction] = useState<any | null>(null);
  const [importAnalysis, setImportAnalysis] = useState<ImportAnalysisResult | null>(null);
  const [storagePersisted, setStoragePersisted] = useState<boolean | null>(null);

  // Pestañas principales de navegación
  const [activeTab, setActiveTab] = useState<
    'live' | 'coach' | 'stats' | 'maps' | 'aggregates' | 'events' | 'matches' | 'teams' | 'players' | 'transfer' | 'rescue'
  >('live');

  // Servicios singleton
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);
  const actionRecorder = useRef(new ActionRecorderService(db)).current;
  const transferService = useRef(new TransferService(db)).current;
  const managementService = useRef(new MatchManagementService(db)).current;
  const possessionService = useRef(new PossessionService(db)).current;
  const participationService = useRef(new ParticipationService(db)).current;
  const exportService = useRef(new ExportService(db)).current;
  const backupService = useRef(new BackupService(db)).current;
  const defenseAttackSubService = useRef(new DefenseAttackSubService(db, actionRecorder, participationService)).current;

  // Consultas reactivas sobre IndexedDB dependientes de currentMatchId o generales
  const allMatches = useLiveQuery(() => db.matches.toArray(), []);
  const allTeams = useLiveQuery(() => db.teams.toArray(), []);
  const allPlayers = useLiveQuery(() => db.players.toArray(), []);

  const currentMatch = useLiveQuery(
    () => (currentMatchId ? db.matches.get(currentMatchId) : undefined),
    [currentMatchId]
  );
  const currentPeriods = useLiveQuery(
    () => (currentMatchId ? db.matchPeriods.where('match_id').equals(currentMatchId).sortBy('number') : []),
    [currentMatchId]
  );
  const currentRosters = useLiveQuery(
    () => (currentMatchId ? db.matchRosters.where('match_id').equals(currentMatchId).toArray() : []),
    [currentMatchId]
  );
  const events = useLiveQuery(
    () => (currentMatchId ? db.matchEvents.where('match_id').equals(currentMatchId).toArray() : []),
    [currentMatchId]
  );
  const possessions = useLiveQuery(
    () => (currentMatchId ? db.possessions.where('match_id').equals(currentMatchId).toArray() : []),
    [currentMatchId]
  );
  const participations = useLiveQuery(
    () => (currentMatchId ? db.playerParticipations.where('match_id').equals(currentMatchId).toArray() : []),
    [currentMatchId]
  );
  const rescueSnapshots = useLiveQuery(
    () => (currentMatchId ? db.rescueSnapshots.where('match_id').equals(currentMatchId).toArray() : []),
    [currentMatchId]
  );

  // Estado del período activo
  const [activePeriodId, setActivePeriodId] = useState<string | null>(null);

  // Posesiones y Rebote
  const [offensiveReboundToggle, setOffensiveReboundToggle] = useState<boolean>(false);

  // Corrección de la Situación Numérica: Cantidad de rivales en cancha colectiva (sin inventar jugadores)
  // null = Desconocido (no se asume 7)
  const [rivalOnCourtCount, setRivalOnCourtCount] = useState<number | null>(null);

  // Filtros de Estadísticas
  const [statsPeriodFilter, setStatsPeriodFilter] = useState<string>('ALL');
  const [statsTeamFilter, setStatsTeamFilter] = useState<string>('ALL');

  // Estado de Acumulados Multi-partido
  const [includeDemoInAggregates, setIncludeDemoInAggregates] = useState<boolean>(false);
  const [aggregatedStats, setAggregatedStats] = useState<AggregatedMultiMatchStats | null>(null);

  // Modal de Edición de Partido
  const [editingMatch, setEditingMatch] = useState<Match | null>(null);
  const [editMatchForm, setEditMatchForm] = useState<{
    competition: string;
    venue: string;
    status: Match['status'];
    scheduled_at: string;
  }>({
    competition: '',
    venue: '',
    status: 'live',
    scheduled_at: '',
  });

  // Modal Visual Completo de Lanzamientos (Cancha + Portería)
  const [subModalOpen, setSubModalOpen] = useState(false);
  const [subOutRosterId, setSubOutRosterId] = useState<string>('');
  const [subInRosterId, setSubInRosterId] = useState<string>('');

  const [editingEvent, setEditingEvent] = useState<MatchEvent | null>(null);
  const [editTimeStr, setEditTimeStr] = useState<string>('');
  const [editReason, setEditReason] = useState<string>('');

  const [pastActionModalOpen, setPastActionModalOpen] = useState(false);
  const [pastTimeStr, setPastTimeStr] = useState<string>('00:00');
  const [pastPeriodId, setPastPeriodId] = useState<string>('');
  const [pastTeamId, setPastTeamId] = useState<string>('');
  const [pastType, setPastType] = useState<EventType>('SHOT');
  const [pastShotResult, setPastShotResult] = useState<'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED'>('GOAL');
  const [pastRosterId, setPastRosterId] = useState<string>('');

  // Estados Fase 5: Exportación Excel/CSV y Respaldo Completo
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [csvTableChoice, setCsvTableChoice] = useState<ExportTableKey>('partido');
  const [csvDelimiter, setCsvDelimiter] = useState<';' | ','>(';');
  const [csvProtectFormulas, setCsvProtectFormulas] = useState<boolean>(true);
  const [backupInspection, setBackupInspection] = useState<BackupInspectionResult | null>(null);
  const [backupRawPayload, setBackupRawPayload] = useState<any | null>(null);
  const [backupConfirmedSafety, setBackupConfirmedSafety] = useState<boolean>(false);
  const [restoreLoading, setRestoreLoading] = useState<boolean>(false);

  // Formularios Fase 2
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [newTeam, setNewTeam] = useState<CreateTeamInput>({
    name: '',
    short_name: '',
    is_own: true,
    color_primary: '#0284c7',
  });

  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [newPlayer, setNewPlayer] = useState<CreatePlayerInput>({
    first_name: '',
    last_name: '',
    default_number: 10,
    position: 'CB',
    is_goalkeeper: false,
    team_id: undefined,
  });

  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchForm, setMatchForm] = useState({
    own_team_side: 'HOME' as 'HOME' | 'AWAY',
    home_team_id: '',
    away_team_id: '',
    competition: 'Torneo Oficial',
    venue: '',
    periods_count: 2,
    period_minutes: 30,
    max_roster_size: 16,
    selected_player_ids: [] as string[],
    player_numbers: {} as Record<string, number>,
    player_starters: {} as Record<string, boolean>,
    rival_roster_enabled: false,
    rival_selected_player_ids: [] as string[],
    rival_player_numbers: {} as Record<string, number>,
    rival_player_starters: {} as Record<string, boolean>,
  });

  // Inicialización de la base de datos
  useEffect(() => {
    async function init() {
      await cleanLegacySeedDataAndInitDemo(db);
      if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        setStoragePersisted(isPersisted);
      }
    }
    init();
  }, []);

  // Actualizar el servicio de reloj
  useEffect(() => {
    async function setupClock() {
      if (!currentMatchId) return;
      const periods = await db.matchPeriods.where('match_id').equals(currentMatchId).sortBy('number');
      if (periods.length > 0) {
        const targetPeriod = periods[0]!;
        setActivePeriodId(targetPeriod.id);
        const clock = new MatchClockService(db, currentMatchId, targetPeriod.id);
        const snapshot = await clock.load();
        setClockService(clock);
        setClockState(snapshot);
      }
    }
    setupClock();
  }, [currentMatchId]);

  // Ticker de reloj
  useEffect(() => {
    if (!clockService || !clockState?.running) return;
    const interval = setInterval(() => {
      setClockState(clockService.getSnapshot());
    }, 100);
    return () => clearInterval(interval);
  }, [clockService, clockState?.running]);

  // Background / Foreground
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && clockService) {
        const snapshot = await clockService.load();
        setClockState(snapshot);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clockService]);

  // Carga y cálculo de acumulados multi-partido
  useEffect(() => {
    async function loadAggregates() {
      if (!allMatches || allMatches.length === 0 || !allTeams) return;
      const targetMatches = allMatches.filter((m) => includeDemoInAggregates || !m.is_demo);
      if (targetMatches.length === 0) {
        setAggregatedStats(null);
        return;
      }
      const statsList: MatchCompleteStats[] = [];
      for (const m of targetMatches) {
        const [mPeriods, mRosters, mEvents, mPossessions, mParticipations] = await Promise.all([
          db.matchPeriods.where('match_id').equals(m.id).toArray(),
          db.matchRosters.where('match_id').equals(m.id).toArray(),
          db.matchEvents.where('match_id').equals(m.id).toArray(),
          db.possessions.where('match_id').equals(m.id).toArray(),
          db.playerParticipations.where('match_id').equals(m.id).toArray(),
        ]);
        statsList.push(
          StatsEngine.calculateMatchStats(
            m,
            mPeriods,
            allTeams,
            mRosters,
            mEvents,
            mPossessions,
            mParticipations
          )
        );
      }
      setAggregatedStats(StatsEngine.aggregateMultiMatchStats(statsList));
    }
    loadAggregates();
  }, [allMatches, allTeams, events, possessions, participations, includeDemoInAggregates]);

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const parseTimeToMs = (str: string): number => {
    const parts = str.split(':');
    if (parts.length === 2) {
      const m = parseInt(parts[0] || '0', 10);
      const s = parseInt(parts[1] || '0', 10);
      return (m * 60 + s) * 1000;
    }
    return 0;
  };

  // Controles de reloj
  const handleToggleClock = async () => {
    if (!clockService || !clockState) return;
    if (clockState.running) {
      const snap = await clockService.pause();
      setClockState(snap);
    } else {
      const snap = await clockService.start();
      setClockState(snap);
    }
  };

  const handleAdjustClock = async (deltaSeconds: number) => {
    if (!clockService || !clockState) return;
    const newMs = Math.max(0, clockState.accumulatedMs + deltaSeconds * 1000);
    const snap = await clockService.setTime(newMs);
    setClockState(snap);
  };

  const handleSwitchPeriod = async (periodId: string) => {
    if (!currentMatch) return;
    setActivePeriodId(periodId);
    const clock = new MatchClockService(db, currentMatch.id, periodId);
    const snap = await clock.load();
    setClockService(clock);
    setClockState(snap);
  };

  const activePeriodIsEnded = !!events?.some(
    (e) => e.period_id === activePeriodId && e.type === 'PERIOD_END' && e.status === 'active'
  );

  const handleFinishCurrentPeriod = async () => {
    if (!currentMatch || !activePeriodId || !clockState) return;

    if (activePeriodIsEnded) {
      alert('El período actual ya se encuentra finalizado con un evento activo previo. Si requiere corregirlo, anule primero el cierre anterior.');
      return;
    }

    if (!confirm('¿Confirma finalizar el período actual? Se cerrarán las posesiones y los intervalos de participación en cancha.')) return;

    if (clockState.running) {
      await clockService?.pause();
      setClockState(clockService?.getSnapshot() ?? null);
    }

    const clockMs = clockState.currentDisplayMs;
    await possessionService.closePeriodPossessions(currentMatch.id, activePeriodId, clockMs);
    await participationService.closePeriodParticipations(currentMatch.id, activePeriodId, clockMs);

    const res = await actionRecorder.recordAction({
      matchId: currentMatch.id,
      periodId: activePeriodId,
      type: 'PERIOD_END',
      clockMs,
    });

    if (res.success) {
      alert('Período finalizado y registrado.');
    } else {
      alert(`Error al finalizar período: ${res.error}`);
    }
  };

  const handleUndoLastAction = async () => {
    if (!currentMatch) return;
    if (!confirm('¿Desea anular la última acción registrada en este partido?')) return;
    const undone = await actionRecorder.undoLastAction(currentMatch.id);
    if (undone) {
      alert(`Acción anulada: ${undone.type} (${formatTime(undone.clock_ms)})`);
    } else {
      alert('No hay acciones activas disponibles para anular.');
    }
  };

  // Identificación de equipos y participaciones
  const homeTeam = allTeams?.find((t) => t.id === currentMatch?.home_team_id);
  const awayTeam = allTeams?.find((t) => t.id === currentMatch?.away_team_id);
  const isHomeOwn = homeTeam?.is_own ?? true;
  const ownTeamId = isHomeOwn ? currentMatch?.home_team_id : currentMatch?.away_team_id;

  const activeCourtParticipations = participations?.filter((p) => p.period_id === activePeriodId && p.is_active) || [];
  const ownPlayersOnCourtCount = activeCourtParticipations.filter((p) => p.team_id === ownTeamId).length;

  // Lógica Rigurosa de Situación Numérica (Pre-requisito Fase 4)
  const hasConfirmedLineup = ownPlayersOnCourtCount > 0;
  let numericalSituationContext: 'EQUAL' | 'SUPERIORITY' | 'INFERIORITY' | 'UNKNOWN' | 'INCOMPLETE' = 'UNKNOWN';
  let numericalSituationLabel = '';

  if (!hasConfirmedLineup) {
    numericalSituationContext = 'INCOMPLETE';
    numericalSituationLabel = 'Formación propia incompleta (Sin confirmar)';
  } else if (rivalOnCourtCount === null) {
    numericalSituationContext = 'UNKNOWN';
    numericalSituationLabel = `${ownPlayersOnCourtCount} propios en cancha vs ? rivales (Desconocida)`;
  } else {
    if (ownPlayersOnCourtCount === rivalOnCourtCount) {
      numericalSituationContext = 'EQUAL';
      numericalSituationLabel = `Igualdad numérica (${ownPlayersOnCourtCount} vs ${rivalOnCourtCount})`;
    } else if (ownPlayersOnCourtCount > rivalOnCourtCount) {
      numericalSituationContext = 'SUPERIORITY';
      numericalSituationLabel = `Superioridad numérica (${ownPlayersOnCourtCount} vs ${rivalOnCourtCount})`;
    } else {
      numericalSituationContext = 'INFERIORITY';
      numericalSituationLabel = `Inferioridad numérica (${ownPlayersOnCourtCount} vs ${rivalOnCourtCount})`;
    }
  }

  // Posesión activa (restringida al período en curso si está definido)
  const activePossession = possessions?.find(
    (p) => (!activePeriodId || p.period_id === activePeriodId) && !p.is_complete && p.end_clock_ms === undefined
  );
  const isOwnPossession = activePossession?.team_id === ownTeamId;

  // Grabación de acción con captura de contexto temporal numérico exacto y automatización defensa-ataque
  const recordAndHandlePossession = async (
    input: any,
    options?: {
      offensiveRebound?: boolean;
      customStartReason?: any;
      possessionOutcome?: 'ATTACKER_RETAINS' | 'DEFENDER_RECOVERS' | 'UNCERTAIN';
      autoDefenseAttack?: DefenseAttackPairConfig;
    }
  ): Promise<(SaveActionResult & { effect?: EventEffectResult }) | undefined> => {
    if (!currentMatch) return;
    setSaveStatus('saving');
    setLastError(null);

    const inputWithNumerical = {
      ...input,
      numericalSituation: {
        own_count: hasConfirmedLineup ? ownPlayersOnCourtCount : undefined,
        rival_count: rivalOnCourtCount !== null ? rivalOnCourtCount : undefined,
        context: numericalSituationContext,
      },
    };

    const res: SaveActionResult = await actionRecorder.recordAction(inputWithNumerical);

    if (res.success) {
      setSaveStatus('saved');
      setPendingRetryAction(null);

      // Evaluar efecto formal sobre posesión según desenlace real
      const effect = await possessionService.handleEventEffect(
        res.savedEvent,
        currentMatch.home_team_id,
        currentMatch.away_team_id,
        options
      );

      // Si la automatización de cambio defensa-ataque está activa y se confirmó el cambio de posesión:
      if (
        options?.autoDefenseAttack?.enabled &&
        options.possessionOutcome !== 'UNCERTAIN' &&
        effect.possessionChanged &&
        effect.newPossessionTeamId &&
        activePeriodId
      ) {
        // Determinar a qué fase pasa el equipo propio
        const nextOwnPhase: 'ATTACK' | 'DEFENSE' =
          effect.newPossessionTeamId === ownTeamId ? 'ATTACK' : 'DEFENSE';

        const validation = await defenseAttackSubService.validateAutoSub(
          currentMatch.id,
          activePeriodId,
          ownTeamId || '',
          res.savedEvent.clock_ms,
          options.autoDefenseAttack,
          nextOwnPhase
        );

        if (validation.canExecute && validation.playerInId && validation.playerOutId) {
          await defenseAttackSubService.executeAutoSub(
            currentMatch.id,
            activePeriodId,
            ownTeamId || '',
            res.savedEvent.clock_ms,
            res.savedEvent,
            validation.playerOutId,
            validation.playerInId
          );
        } else if (validation.warning) {
          // Informar al usuario para resolver manualmente
          alert(`[Cambio Defensa-Ataque]\n${validation.warning}`);
        }
      }

      return {
        ...res,
        effect,
      };
    } else {
      setSaveStatus('error');
      setLastError(res.error);
      setPendingRetryAction({ input: inputWithNumerical, preassignedId: res.pendingActionId });
      return res;
    }
  };



  const handleConfirmStartersLineup = async () => {
    if (!currentMatch || !activePeriodId || !clockState) return;
    const starters = currentRosters?.filter((r) => r.team_id === ownTeamId && r.is_starter) || [];
    const gkStarter = starters.find((r) => r.role === 'GK') || currentRosters?.find((r) => r.team_id === ownTeamId && r.role === 'GK');

    if (!gkStarter) {
      alert('Se requiere al menos 1 arquero en la convocatoria para iniciar formación.');
      return;
    }

    const fieldStarters = starters.filter((r) => r.id !== gkStarter.id).slice(0, 6).map((r) => r.id);

    let startClockMs = clockState.currentDisplayMs;
    if (clockState.currentDisplayMs > 0) {
      const confirmFromStart = confirm(
        `El reloj actual marca ${formatTime(clockState.currentDisplayMs)}.\n\n¿Desea confirmar esta formación titular como la alineación inicial desde el INICIO del período (00:00)?\n\n• Presione "Aceptar" para iniciar los intervalos desde 00:00.\n• Presione "Cancelar" para iniciar los intervalos desde el instante actual (${formatTime(clockState.currentDisplayMs)}).`
      );
      if (confirmFromStart) {
        startClockMs = 0;
      }
    }

    await participationService.confirmInitialLineup({
      matchId: currentMatch.id,
      periodId: activePeriodId,
      teamId: ownTeamId || '',
      clockMs: startClockMs,
      starterRosterIds: fieldStarters,
      goalkeeperRosterId: gkStarter.id,
    });

    alert(`¡Formación titular confirmada en cancha desde ${formatTime(startClockMs)}!`);
  };

  const handleConfirmSubstitution = async () => {
    if (!subOutRosterId || !subInRosterId || !currentMatch || !activePeriodId || !clockState) return;
    if (subOutRosterId === subInRosterId) {
      alert('El jugador que sale y el que entra deben ser diferentes.');
      return;
    }

    const inPlayerRoster = currentRosters?.find((r) => r.id === subInRosterId);
    const isGk = inPlayerRoster?.role === 'GK';

    const res = await actionRecorder.recordAction({
      matchId: currentMatch.id,
      periodId: activePeriodId,
      teamId: ownTeamId,
      type: 'SUBSTITUTION',
      clockMs: clockState.currentDisplayMs,
      participants: [
        { roster_id: subOutRosterId, role: 'SUB_OUT' },
        { roster_id: subInRosterId, role: 'SUB_IN' },
      ],
    });

    await participationService.substitutePlayer({
      matchId: currentMatch.id,
      periodId: activePeriodId,
      teamId: ownTeamId || '',
      clockMs: clockState.currentDisplayMs,
      rosterOutId: subOutRosterId,
      rosterInId: subInRosterId,
      isGoalkeeper: isGk,
      eventId: res.success ? res.savedEvent.id : undefined,
    });

    setSubModalOpen(false);
    setSubOutRosterId('');
    setSubInRosterId('');
  };

  const handleTogglePossession = async () => {
    if (!currentMatch || !activePeriodId || !clockState) return;
    const active = possessions?.find((p) => !p.is_complete && p.end_clock_ms === undefined);
    const nextTeamId = active?.team_id === currentMatch.home_team_id ? currentMatch.away_team_id : currentMatch.home_team_id;

    await possessionService.startPossession({
      matchId: currentMatch.id,
      periodId: activePeriodId,
      teamId: nextTeamId,
      clockMs: clockState.currentDisplayMs,
      startReason: 'MANUAL',
    });
  };

  const handleVoidEvent = async (ev: MatchEvent) => {
    if (!confirm(`¿Confirma anular la acción ${ev.type} a los ${formatTime(ev.clock_ms)}?`)) return;
    await actionRecorder.voidAction(ev.id, 'Anulación manual');
  };

  const handleOpenEditEventModal = (ev: MatchEvent) => {
    setEditingEvent(ev);
    setEditTimeStr(formatTime(ev.clock_ms));
    setEditReason('');
  };

  const handleSaveEditedEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent) return;

    const newClockMs = parseTimeToMs(editTimeStr);
    await actionRecorder.updateAction(
      editingEvent.id,
      {
        clock_ms: newClockMs,
      },
      editReason || 'Modificación manual de tiempo'
    );

    setEditingEvent(null);
  };

  const handleSavePastAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentMatch || !pastPeriodId || !pastTeamId) {
      alert('Complete los campos del formulario');
      return;
    }

    const clockMs = parseTimeToMs(pastTimeStr);
    const participants: any[] = [];
    if (pastRosterId) {
      participants.push({ roster_id: pastRosterId, role: 'SHOOTER' });
    }

    const input: any = {
      matchId: currentMatch.id,
      periodId: pastPeriodId,
      teamId: pastTeamId,
      type: pastType,
      clockMs,
      participants,
    };

    if (pastType === 'SHOT') {
      input.shotDetail = {
        result_code: pastShotResult,
        is_empty_net: false,
      };
    }

    await actionRecorder.recordAction(input);
    setPastActionModalOpen(false);
  };

  const handleRetryPendingAction = async () => {
    if (!pendingRetryAction) return;
    setSaveStatus('saving');
    const res = await actionRecorder.recordAction(
      pendingRetryAction.input,
      pendingRetryAction.preassignedId
    );
    if (res.success) {
      setSaveStatus('saved');
      setPendingRetryAction(null);
      setLastError(null);
    } else {
      setSaveStatus('error');
      setLastError(res.error);
    }
  };

  const handleExportJson = async () => {
    if (!currentMatch) return;
    try {
      const envelope = await transferService.exportMatch(currentMatch.id);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `handstat_match_${currentMatch.id.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Error al exportar: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const analysis = await transferService.analyzeImport(parsed);
      setImportAnalysis(analysis);
    } catch (err) {
      setImportAnalysis({
        kind: 'INVALID',
        error: `Archivo corrupto o JSON no válido: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async (allowOverwrite: boolean) => {
    if (!importAnalysis || importAnalysis.kind === 'INVALID') return;

    try {
      const freshAnalysis = await transferService.analyzeImport(importAnalysis.envelope);
      if (freshAnalysis.kind === 'CONFLICT' && !allowOverwrite) {
        alert('El partido local sufrió cambios mientras revisaba la vista previa. Por favor, reanalice el archivo.');
        setImportAnalysis(freshAnalysis);
        return;
      }

      await transferService.applyImport(importAnalysis.envelope, allowOverwrite);
      const importedMatchId = importAnalysis.envelope.match.id;
      setCurrentMatchId(importedMatchId);
      setImportAnalysis(null);
      alert('Importación completada con éxito.');
    } catch (err) {
      alert(`Fallo en la importación: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleRestoreRescue = async () => {
    if (!currentMatch) return;
    if (!confirm('¿Desea restaurar la versión anterior guardada antes del último reemplazo?')) return;
    const ok = await transferService.restoreFromRescueSnapshot(currentMatch.id);
    if (ok) {
      alert('Copia de rescate restaurada con éxito.');
    } else {
      alert('No se encontraron copias de rescate disponibles.');
    }
  };

  // Manejadores Fase 5: Exportación XLSX / CSV y Respaldo Completo de BD
  const handleExportXLSX = async () => {
    if (!currentMatch) return;
    setExportLoading(true);
    setExportFeedback(null);
    try {
      const { blob, filename } = await exportService.exportMatchToXLSX(currentMatch.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportFeedback({
        kind: 'success',
        message: `Planilla Excel generada con éxito (${filename}). Incluye las 7 hojas con datos oficiales del partido.`,
      });
    } catch (err) {
      setExportFeedback({
        kind: 'error',
        message: `Error al generar Excel: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleExportCSV = async () => {
    if (!currentMatch) return;
    setExportLoading(true);
    setExportFeedback(null);
    try {
      const { blob, filename } = await exportService.exportTableToCSV(
        currentMatch.id,
        csvTableChoice,
        {
          delimiter: csvDelimiter,
          protectFormulas: csvProtectFormulas,
        }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setExportFeedback({
        kind: 'success',
        message: `Archivo CSV descargado con éxito (${filename}) delimitado por '${csvDelimiter}' con codificación UTF-8 BOM.`,
      });
    } catch (err) {
      setExportFeedback({
        kind: 'error',
        message: `Error al generar CSV: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleCreateFullBackup = async () => {
    setExportLoading(true);
    setExportFeedback(null);
    try {
      const { envelope, jsonString, filename } = await backupService.createFullBackup();
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      const totalCount = Object.values(envelope.counts).reduce((s, n) => s + n, 0);
      setExportFeedback({
        kind: 'success',
        message: `Copia de seguridad completa descargada (${totalCount} registros de 12 tablas con huella digital SHA-256).`,
      });
    } catch (err) {
      setExportFeedback({
        kind: 'error',
        message: `Error al crear respaldo completo: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handleBackupFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExportFeedback(null);
    setBackupConfirmedSafety(false);
    try {
      const text = await file.text();
      const inspection = await backupService.inspectBackup(text);
      setBackupInspection(inspection);
      if (inspection.valid) {
        setBackupRawPayload(JSON.parse(text));
      } else {
        setBackupRawPayload(null);
      }
    } catch (err) {
      setBackupInspection({
        valid: false,
        error: `Archivo JSON no válido o dañado: ${err instanceof Error ? err.message : String(err)}`,
      });
      setBackupRawPayload(null);
    } finally {
      if (backupFileInputRef.current) backupFileInputRef.current.value = '';
    }
  };

  const handleDownloadPreRestoreSafetyBackup = async () => {
    await handleCreateFullBackup();
  };

  const handleConfirmRestoreBackup = async () => {
    if (!backupInspection || !backupInspection.valid || !backupRawPayload) return;
    if (!backupConfirmedSafety) {
      alert('Debe marcar la casilla de confirmación explícita para autorizar el reemplazo.');
      return;
    }
    setRestoreLoading(true);
    try {
      const result = await backupService.restoreFullBackup(backupRawPayload);
      setBackupInspection(null);
      setBackupRawPayload(null);
      setBackupConfirmedSafety(false);

      const firstMatch = await db.matches.toCollection().first();
      if (firstMatch) {
        setCurrentMatchId(firstMatch.id);
      }

      const restoredTotal = result.totalRestored ?? Object.values(result.restoredCounts).reduce((s, n) => s + n, 0);
      setExportFeedback({
        kind: 'success',
        message: `¡Base de datos restaurada atómicamente con éxito! Se restauraron ${restoredTotal} registros en 12 tablas.`,
      });
    } catch (err) {
      setExportFeedback({
        kind: 'error',
        message: `Fallo durante la restauración atómica: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setRestoreLoading(false);
    }
  };

  // Creación de equipos, jugadores y partidos (Fase 2)
  const handleSaveTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeam.name.trim() || !newTeam.short_name.trim()) {
      alert('Por favor ingrese el nombre y la abreviatura del equipo');
      return;
    }
    try {
      await managementService.createTeam(newTeam);
      setNewTeam({ name: '', short_name: '', is_own: false, color_primary: '#0284c7' });
      setShowTeamModal(false);
    } catch (err) {
      alert(`Error al crear equipo: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayer.first_name.trim()) {
      alert('Por favor ingrese el nombre del jugador');
      return;
    }
    try {
      await managementService.createPlayer(newPlayer);
      setNewPlayer({
        first_name: '',
        last_name: '',
        default_number: 10,
        position: 'CB',
        is_goalkeeper: false,
        team_id: undefined,
      });
      setShowPlayerModal(false);
    } catch (err) {
      alert(`Error al crear jugador: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleOpenMatchModal = () => {
    const ownTeams = allTeams?.filter((t) => t.is_own && !t.archived) || [];
    const rivalTeams = allTeams?.filter((t) => !t.is_own && !t.archived) || [];
    const defaultOwn = ownTeams[0]?.id || allTeams?.[0]?.id || '';
    const defaultRival = rivalTeams[0]?.id || allTeams?.find((t) => t.id !== defaultOwn)?.id || '';

    const defaultPlayers = allPlayers?.filter((p) => !p.archived && (!p.team_id || p.team_id === defaultOwn)) || [];
    const initialNumbers: Record<string, number> = {};
    const initialStarters: Record<string, boolean> = {};
    const initialIds: string[] = [];

    defaultPlayers.slice(0, 14).forEach((p, idx) => {
      initialIds.push(p.id);
      initialNumbers[p.id] = p.default_number ?? idx + 1;
      initialStarters[p.id] = idx < 7;
    });

    setMatchForm({
      own_team_side: 'HOME',
      home_team_id: defaultOwn,
      away_team_id: defaultRival,
      competition: 'Torneo Oficial',
      venue: 'Sede Principal',
      periods_count: 2,
      period_minutes: 30,
      max_roster_size: 16,
      selected_player_ids: initialIds,
      player_numbers: initialNumbers,
      player_starters: initialStarters,
      rival_roster_enabled: false,
      rival_selected_player_ids: [],
      rival_player_numbers: {},
      rival_player_starters: {},
    });
    setShowMatchModal(true);
  };

  const handleSaveMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchForm.home_team_id || !matchForm.away_team_id) {
      alert('Debe seleccionar ambos equipos');
      return;
    }
    if (matchForm.home_team_id === matchForm.away_team_id) {
      alert('El equipo local y visitante no pueden ser el mismo');
      return;
    }

    try {
      const ownTeamPlayers = matchForm.selected_player_ids.map((id) => allPlayers?.find((p) => p.id === id));
      const ownFieldCount = ownTeamPlayers.filter((p) => p && !p.is_goalkeeper && p.position !== 'GK').length;
      const ownGkCount = ownTeamPlayers.filter((p) => p && (p.is_goalkeeper || p.position === 'GK')).length;

      if (ownFieldCount < 5 || ownGkCount < 1) {
        const missing: string[] = [];
        if (ownFieldCount < 5) missing.push(`${5 - ownFieldCount} jugador(es) de campo`);
        if (ownGkCount < 1) missing.push(`1 arquero`);
        alert(`No es posible comenzar el partido.\n\nFalta convocar: ${missing.join(' y ')}.\nRegla de la aplicación: Se requiere un mínimo de 5 jugadores de campo y 1 arquero seleccionados en la convocatoria de nuestro equipo.`);
        return;
      }

      const ownRoster = matchForm.selected_player_ids.map((playerId) => {
        const p = allPlayers?.find((pl) => pl.id === playerId);
        const shirtNumber = matchForm.player_numbers[playerId] ?? (p?.default_number || 1);
        const nameStr = p ? `${shirtNumber} · ${p.first_name} ${p.last_name || ''}`.trim() : `${shirtNumber} · Jugador`;
        const role = p?.is_goalkeeper || p?.position === 'GK' ? ('GK' as const) : ('FIELD' as const);
        const isStarter = !!matchForm.player_starters[playerId];

        return {
          player_id: playerId,
          shirt_number: shirtNumber,
          display_name: nameStr,
          role,
          position_snapshot: p?.position,
          is_starter: isStarter,
        };
      });

      let rivalRoster: typeof ownRoster | undefined = undefined;
      if (matchForm.rival_roster_enabled && matchForm.rival_selected_player_ids.length > 0) {
        rivalRoster = matchForm.rival_selected_player_ids.map((playerId) => {
          const p = allPlayers?.find((pl) => pl.id === playerId);
          const shirtNumber = matchForm.rival_player_numbers[playerId] ?? (p?.default_number || 1);
          const nameStr = p ? `${shirtNumber} · ${p.first_name} ${p.last_name || ''}`.trim() : `${shirtNumber} · Jugador`;
          const role = p?.is_goalkeeper || p?.position === 'GK' ? ('GK' as const) : ('FIELD' as const);
          const isStarter = !!matchForm.rival_player_starters[playerId];
          return {
            player_id: playerId,
            shirt_number: shirtNumber,
            display_name: nameStr,
            role,
            position_snapshot: p?.position,
            is_starter: isStarter,
          };
        });
      }

      const homeRosterFinal = matchForm.own_team_side === 'HOME' ? ownRoster : (rivalRoster || []);
      const awayRosterFinal = matchForm.own_team_side === 'HOME' ? rivalRoster : ownRoster;

      const newMatch = await managementService.createMatch({
        home_team_id: matchForm.home_team_id,
        away_team_id: matchForm.away_team_id,
        competition: matchForm.competition,
        venue: matchForm.venue,
        rules_config: {
          periods_count: Number(matchForm.periods_count),
          period_duration_ms: Number(matchForm.period_minutes) * 60 * 1000,
          max_roster_size: Number(matchForm.max_roster_size),
        },
        home_roster: homeRosterFinal,
        away_roster: awayRosterFinal,
      });

      setCurrentMatchId(newMatch.id);
      setShowMatchModal(false);
      setActiveTab('live');
      alert('¡Partido creado con éxito! Listo para registrar.');
    } catch (err) {
      alert(`Error al crear partido: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // Cálculo en tiempo real de estadísticas completas del partido seleccionado
  const matchStats: MatchCompleteStats | null =
    currentMatch && currentPeriods && allTeams && currentRosters && events
      ? StatsEngine.calculateMatchStats(
          currentMatch,
          currentPeriods,
          allTeams,
          currentRosters,
          events,
          possessions || [],
          participations || [],
          {
            periodId: statsPeriodFilter === 'ALL' ? undefined : statsPeriodFilter,
            teamId: statsTeamFilter === 'ALL' ? undefined : statsTeamFilter,
          }
        )
      : null;

  const homeScore = matchStats?.final_home_score ?? 0;
  const awayScore = matchStats?.final_away_score ?? 0;

  return (
    <div className="w-full max-w-[1700px] mx-auto min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans border-x border-slate-800 shadow-2xl">
      {/* Cabecera Principal y Estado */}
      <header className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-sky-500 animate-pulse"></span>
          <h1 className="font-bold text-sm tracking-wide text-slate-200">HandStat</h1>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-sky-400 font-mono">Fase 5 (v1.3.0 · Build 2026-10-20-1600)</span>
          <button
            onClick={async () => {
              try {
                if ('serviceWorker' in navigator) {
                  const registrations = await navigator.serviceWorker.getRegistrations();
                  for (const reg of registrations) {
                    await reg.unregister();
                  }
                }
                if ('caches' in window) {
                  const cacheNames = await caches.keys();
                  for (const name of cacheNames) {
                    await caches.delete(name);
                  }
                }
                window.location.reload();
              } catch {
                window.location.reload();
              }
            }}
            title="Recargar y limpiar caché del Service Worker sin borrar IndexedDB ni partidos"
            className="flex items-center gap-1 text-[11px] px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-sky-400" />
            <span>Actualizar App</span>
          </button>
        </div>

        {/* Indicador de Guardado */}
        <div className="flex items-center gap-2 text-xs">
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-emerald-400 font-medium">
              <CheckCircle className="w-3.5 h-3.5" /> Guardado
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-amber-400 animate-pulse font-medium">
              Guardando...
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-rose-400 font-semibold">
              <AlertTriangle className="w-3.5 h-3.5" /> Error al guardar
            </span>
          )}
        </div>
      </header>

      {/* Selector de Partido Activo Rápido */}
      <div className="bg-slate-950/90 px-3 py-1.5 border-b border-slate-800 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 truncate">
          <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-slate-400">Partido Activo:</span>
          <span className="font-semibold text-slate-200 truncate">
            {currentMatch?.home_team_name_snapshot || homeTeam?.name || 'Local'} vs {currentMatch?.away_team_name_snapshot || awayTeam?.name || 'Rival'}
          </span>
        </div>
        <button
          onClick={() => setActiveTab('matches')}
          className="text-sky-400 hover:text-sky-300 underline shrink-0 font-medium ml-2"
        >
          Cambiar
        </button>
      </div>

      {/* Banner de Persistencia e Incertidumbre */}
      {storagePersisted === false && (
        <div className="bg-amber-950/60 border-b border-amber-800/80 px-3 py-1.5 text-xs text-amber-300 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Almacenamiento estándar: instale la PWA para mayor protección.
          </span>
        </div>
      )}

      {clockState?.uncertain && (
        <div className="bg-amber-900/80 border-b border-amber-500 p-2.5 text-xs text-amber-200 flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-amber-100">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" /> Incertidumbre de reloj detectada
          </div>
          <p>{clockState.uncertainReason}</p>
          <button
            onClick={() => clockService?.clearUncertainty().then(setClockState)}
            className="self-end px-2 py-1 bg-amber-700 hover:bg-amber-600 text-white rounded font-medium text-[11px]"
          >
            Aceptar y Descartar Aviso
          </button>
        </div>
      )}

      {/* Banner de Error al Guardar con Reintento */}
      {saveStatus === 'error' && (
        <div className="bg-rose-950 border-b border-rose-800 p-2 text-xs text-rose-200 flex items-center justify-between">
          <span>{lastError || 'Fallo de persistencia local'}</span>
          <button
            onClick={handleRetryPendingAction}
            className="px-2 py-1 bg-rose-700 hover:bg-rose-600 rounded text-white font-medium"
          >
            Reintentar Guardado
          </button>
        </div>
      )}

      {/* Marcador, Períodos y Reloj Central (para pestañas fuera de En Vivo y Panel del DT) */}
      {activeTab !== 'live' && activeTab !== 'coach' && (
        <>
          <section className="p-3 bg-slate-950/80 border-b border-slate-800 flex flex-col items-center">
        {/* Selector de Períodos Activo */}
        <div className="flex items-center justify-between w-full px-2 mb-1 text-xs">
          <div className="flex items-center gap-1">
            {currentPeriods?.map((p) => {
              const isSelected = p.id === activePeriodId;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSwitchPeriod(p.id)}
                  className={`px-2 py-0.5 rounded font-bold transition-colors ${
                    isSelected ? 'bg-sky-600 text-white shadow' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  {p.number}T
                </button>
              );
            })}
          </div>

          {activePeriodIsEnded ? (
            <span
              className="px-2 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded text-[10px] font-semibold flex items-center gap-1 cursor-default"
              title="El período ya se encuentra finalizado"
            >
              ✓ Período Finalizado
            </span>
          ) : (
            <button
              onClick={handleFinishCurrentPeriod}
              className="px-2 py-0.5 bg-rose-900/60 hover:bg-rose-800 text-rose-300 border border-rose-700/60 rounded text-[10px] font-semibold flex items-center gap-1"
            >
              Finalizar Período
            </button>
          )}
        </div>

        {/* Marcador Acumulado */}
        <div className="flex items-center justify-between w-full px-6 my-1">
          <div className="flex flex-col items-center flex-1">
            <span className="text-xs font-bold text-slate-300 truncate max-w-[120px]">
              {currentMatch?.home_team_name_snapshot || homeTeam?.name || 'Local'}
            </span>
            <span className="text-3xl font-extrabold font-mono text-white">{homeScore}</span>
          </div>
          <span className="text-xl text-slate-600 font-light mx-2">—</span>
          <div className="flex flex-col items-center flex-1">
            <span className="text-xs font-bold text-slate-400 truncate max-w-[120px]">
              {currentMatch?.away_team_name_snapshot || awayTeam?.name || 'Rival'}
            </span>
            <span className="text-3xl font-extrabold font-mono text-slate-400">{awayScore}</span>
          </div>
        </div>

        {/* Display del Reloj */}
        <div className="flex items-center gap-3 mt-1">
          <div className="text-3xl font-mono font-bold tracking-wider text-sky-400">
            {formatTime(clockState?.currentDisplayMs ?? 0)}
          </div>
          <button
            onClick={handleToggleClock}
            className={`p-2.5 rounded-full shadow-lg transition-transform active:scale-95 ${
              clockState?.running ? 'bg-amber-600 hover:bg-amber-500' : 'bg-emerald-600 hover:bg-emerald-500'
            }`}
            title={clockState?.running ? 'Pausar Reloj' : 'Iniciar Reloj'}
          >
            {clockState?.running ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
          </button>
        </div>

        {/* Ajustes rápidos del reloj y Botón Deshacer */}
        <div className="flex items-center justify-between w-full px-2 mt-2 pt-1 border-t border-slate-800/60">
          <div className="flex gap-1.5 text-[11px] text-slate-400">
            <button onClick={() => handleAdjustClock(-10)} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded">
              -10s
            </button>
            <button onClick={() => handleAdjustClock(10)} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded">
              +10s
            </button>
            <button onClick={() => clockService?.setTime(0).then(setClockState)} className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1">
              <RotateCcw className="w-3 h-3" /> Reset
            </button>
          </div>

          <button
            onClick={handleUndoLastAction}
            className="px-2.5 py-1 bg-amber-900/60 hover:bg-amber-800 text-amber-200 border border-amber-600/70 rounded text-[11px] font-bold flex items-center gap-1 shadow active:scale-95 transition-transform"
          >
            <Undo2 className="w-3.5 h-3.5" /> Deshacer Último
          </button>
        </div>
      </section>

      {/* Barra de Estado Deportivo (Posesión, Rebote y Situación Numérica Corregida) */}
      <section className="bg-slate-950 px-3 py-2 border-b border-slate-800 flex flex-col gap-2 text-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-semibold">Posesión:</span>
            <button
              onClick={handleTogglePossession}
              className={`px-2 py-0.5 rounded font-bold flex items-center gap-1 transition-all ${
                isOwnPossession
                  ? 'bg-sky-600 text-white shadow'
                  : 'bg-rose-700 text-white shadow'
              }`}
            >
              <Activity className="w-3 h-3" />
              {isOwnPossession ? 'Nuestro Club' : 'Rival'}
              <span className="text-[10px] font-normal underline ml-1">(Cambiar)</span>
            </button>
          </div>

          {/* Toggle de Rebote Ofensivo */}
          <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 font-medium">
            <input
              type="checkbox"
              checked={offensiveReboundToggle}
              onChange={(e) => setOffensiveReboundToggle(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-sky-500 focus:ring-0"
            />
            <span className="text-[11px]">Rebote Ofensivo</span>
          </label>
        </div>

        {/* Selector Colectivo de Rivales en Cancha y Situación Numérica Rigurosa */}
        <div className="flex flex-col gap-1.5 p-2 bg-slate-900/90 rounded border border-slate-800">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-slate-400 font-medium">Rivales en Cancha (Colectivo):</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setRivalOnCourtCount(null)}
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                  rivalOnCourtCount === null ? 'bg-amber-700 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                ? Desconocido
              </button>
              <button
                type="button"
                onClick={() => setRivalOnCourtCount(7)}
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                  rivalOnCourtCount === 7 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                7
              </button>
              <button
                type="button"
                onClick={() => setRivalOnCourtCount(6)}
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                  rivalOnCourtCount === 6 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                6
              </button>
              <button
                type="button"
                onClick={() => setRivalOnCourtCount(5)}
                className={`px-1.5 py-0.5 rounded font-mono text-[10px] ${
                  rivalOnCourtCount === 5 ? 'bg-sky-600 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                5
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] border-t border-slate-800/80 pt-1">
            <span className="text-slate-300">
              Situación:{' '}
              <strong
                className={
                  numericalSituationContext === 'SUPERIORITY'
                    ? 'text-emerald-400'
                    : numericalSituationContext === 'INFERIORITY'
                    ? 'text-amber-400'
                    : numericalSituationContext === 'INCOMPLETE'
                    ? 'text-rose-400'
                    : 'text-slate-200'
                }
              >
                {numericalSituationLabel}
              </strong>
            </span>
          </div>
        </div>
      </section>
        </>
      )}

      {/* Navegación por Pestañas */}
      <nav className="flex items-center overflow-x-auto border-b border-slate-800 bg-slate-950 text-xs font-semibold scrollbar-thin">
        <button
          onClick={() => setActiveTab('live')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'live' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          En Vivo
        </button>
        <button
          onClick={() => setActiveTab('coach')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'coach' ? 'border-sky-500 text-sky-400 bg-slate-900/50 font-bold' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <ClipboardList className="w-3.5 h-3.5" /> Panel del DT
        </button>
        <button
          onClick={() => setActiveTab('stats')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 flex items-center gap-1 ${
            activeTab === 'stats' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5" /> Estadísticas
        </button>
        <button
          onClick={() => setActiveTab('maps')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 flex items-center gap-1 ${
            activeTab === 'maps' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Target className="w-3.5 h-3.5" /> Mapas
        </button>
        <button
          onClick={() => setActiveTab('aggregates')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 flex items-center gap-1 ${
            activeTab === 'aggregates' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> Acumulados
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'events' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Eventos ({events?.filter((e) => e.status === 'active').length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('matches')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'matches' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Partidos ({allMatches?.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'teams' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Equipos ({allTeams?.filter((t) => !t.archived).length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('players')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'players' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Jugadores ({allPlayers?.filter((p) => !p.archived).length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('transfer')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 flex items-center gap-1.5 ${
            activeTab === 'transfer' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" /> Exportar / Respaldos
        </button>
        <button
          onClick={() => setActiveTab('rescue')}
          className={`px-3 py-2.5 whitespace-nowrap transition-colors border-b-2 ${
            activeTab === 'rescue' ? 'border-sky-500 text-sky-400 bg-slate-900/50' : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Rescate ({rescueSnapshots?.length ?? 0})
        </button>
      </nav>

      {/* Contenido según Pestaña Activa */}
      <main className="flex-1 p-3 overflow-y-auto">
        {/* 1. REGISTRO EN VIVO INTEGRADO Y TÁCTIL (Mantenido montado para preservar jugada en preparación) */}
        {currentMatch && (
          <div className={activeTab === 'live' ? 'contents' : 'hidden'}>
            <LiveMatchConsole
              currentMatch={currentMatch}
              periods={currentPeriods || []}
              activePeriodId={activePeriodId || currentPeriods?.[0]?.id || ''}
              clockState={clockState}
              clockService={clockService}
              teams={allTeams || []}
              rosters={currentRosters || []}
              players={allPlayers || []}
              activeCourtParticipations={activeCourtParticipations}
              recentEvents={events?.filter((e) => e.status === 'active') || []}
              isOwnPossession={isOwnPossession}
              activePossessionTeamId={activePossession?.team_id}
              numericalSituationLabel={numericalSituationLabel}
              numericalSituationContext={
                numericalSituationContext === 'EQUAL' ||
                numericalSituationContext === 'SUPERIORITY' ||
                numericalSituationContext === 'INFERIORITY'
                  ? numericalSituationContext
                  : 'UNKNOWN'
              }
              homeScore={homeScore}
              awayScore={awayScore}
              onRecordAction={async (input, options) => {
                await recordAndHandlePossession(input, options);
              }}
              onUndoLastAction={handleUndoLastAction}
              onEditEvent={handleOpenEditEventModal}
              onOpenSubstitutionModal={() => setSubModalOpen(true)}
              onConfirmStartersLineup={handleConfirmStartersLineup}
              onSwitchPeriod={handleSwitchPeriod}
              onFinishPeriod={handleFinishCurrentPeriod}
              activePeriodIsEnded={activePeriodIsEnded}
              rivalOnCourtCount={rivalOnCourtCount}
              onSetRivalOnCourtCount={setRivalOnCourtCount}
              offensiveReboundToggle={offensiveReboundToggle}
              onToggleOffensiveRebound={setOffensiveReboundToggle}
              onNavigateToCoach={() => setActiveTab('coach')}
            />
          </div>
        )}

        {/* 1.B PESTAÑA PANEL DEL DT */}
        {activeTab === 'coach' && currentMatch && (
          <CoachDashboard
            currentMatch={currentMatch}
            periods={currentPeriods || []}
            teams={allTeams || []}
            rosters={currentRosters || []}
            events={events || []}
            clockState={
              clockState || {
                periodId: activePeriodId || '',
                running: false,
                accumulatedMs: 0,
                currentDisplayMs: 0,
                uncertain: false,
              }
            }
            activePeriodNumber={currentPeriods?.find((p) => p.id === activePeriodId)?.number || 1}
            homeScore={homeScore}
            awayScore={awayScore}
            activePossession={activePossession}
            numericalSituationContext={numericalSituationContext}
            numericalSituationLabel={numericalSituationLabel}
            onNavigateToLive={() => setActiveTab('live')}
            onNavigateToEvents={() => setActiveTab('events')}
          />
        )}

        {/* 2. PESTAÑA ESTADÍSTICAS DEL PARTIDO */}
        {activeTab === 'stats' && matchStats && (
          <div className="flex flex-col gap-4 text-xs">
            {/* Filtros de la pestaña */}
            <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-slate-400 font-semibold text-[11px]">
                <Filter className="w-3.5 h-3.5 text-sky-400" /> Filtros:
              </div>
              <div className="flex gap-2">
                <select
                  value={statsPeriodFilter}
                  onChange={(e) => setStatsPeriodFilter(e.target.value)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-[11px]"
                >
                  <option value="ALL">Todo el partido</option>
                  {currentPeriods?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.number}º Tiempo
                    </option>
                  ))}
                </select>

                <select
                  value={statsTeamFilter}
                  onChange={(e) => setStatsTeamFilter(e.target.value)}
                  className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-[11px]"
                >
                  <option value="ALL">Ambos equipos</option>
                  <option value={matchStats.home_team_id}>{matchStats.home_team_name}</option>
                  <option value={matchStats.away_team_id}>{matchStats.away_team_name}</option>
                </select>
              </div>
            </div>

            {/* Marcador por períodos */}
            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col gap-2">
              <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px]">
                Desglose del Marcador por Período
              </span>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 bg-slate-900 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">Final</span>
                  <span className="font-extrabold font-mono text-base text-white">
                    {matchStats.final_home_score} – {matchStats.final_away_score}
                  </span>
                </div>
                {matchStats.periods_summary.map((ps) => (
                  <div key={ps.period_id} className="p-2 bg-slate-900 rounded border border-slate-800">
                    <span className="text-[10px] text-slate-400 block mb-0.5">{ps.period_number}T</span>
                    <span className="font-bold font-mono text-sm text-slate-200">
                      {ps.home_goals} – {ps.away_goals}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Comparativa de Totales Colectivos */}
            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col gap-2.5">
              <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px]">
                Métricas Colectivas
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                <div className="text-left font-sans text-slate-400 font-semibold truncate">
                  {matchStats.home_team_name}
                </div>
                <div className="text-slate-500 font-sans text-[11px]">Métrica</div>
                <div className="text-right font-sans text-slate-400 font-semibold truncate">
                  {matchStats.away_team_name}
                </div>

                {/* Goles */}
                <div className="font-bold text-white">{matchStats.home_shots.goals}</div>
                <div className="font-sans text-[11px] text-slate-300">Goles</div>
                <div className="font-bold text-white">{matchStats.away_shots.goals}</div>

                {/* Lanzamientos */}
                <div className="text-slate-200">{matchStats.home_shots.total_shots}</div>
                <div className="font-sans text-[11px] text-slate-400">Lanzamientos</div>
                <div className="text-slate-200">{matchStats.away_shots.total_shots}</div>

                {/* Efectividad % */}
                <div className="font-bold text-sky-400">
                  {matchStats.home_shots.effectiveness_pct !== null ? `${matchStats.home_shots.effectiveness_pct}%` : '—'}
                </div>
                <div className="font-sans text-[11px] text-slate-300">Efectividad Tiro</div>
                <div className="font-bold text-sky-400">
                  {matchStats.away_shots.effectiveness_pct !== null ? `${matchStats.away_shots.effectiveness_pct}%` : '—'}
                </div>

                {/* Desglose de Tiros */}
                <div className="text-[10px] text-slate-400">
                  {matchStats.home_shots.saved} parados / {matchStats.home_shots.missed} fuera
                </div>
                <div className="font-sans text-[10px] text-slate-500">Paradas / Fuera</div>
                <div className="text-[10px] text-slate-400">
                  {matchStats.away_shots.saved} parados / {matchStats.away_shots.missed} fuera
                </div>

                {/* Pérdidas */}
                <div className="text-rose-300">{matchStats.home_turnovers}</div>
                <div className="font-sans text-[11px] text-slate-400">Pérdidas</div>
                <div className="text-rose-300">{matchStats.away_turnovers}</div>

                {/* Recuperaciones */}
                <div className="text-emerald-300">{matchStats.home_steals}</div>
                <div className="font-sans text-[11px] text-slate-400">Recuperaciones</div>
                <div className="text-emerald-300">{matchStats.away_steals}</div>

                {/* Bloqueos */}
                <div className="text-indigo-300">{matchStats.home_blocks}</div>
                <div className="font-sans text-[11px] text-slate-400">Bloqueos</div>
                <div className="text-indigo-300">{matchStats.away_blocks}</div>

                {/* Exclusiones 2 Min */}
                <div className="text-amber-300">{matchStats.home_sanctions.two_minute_suspensions}</div>
                <div className="font-sans text-[11px] text-slate-400">Exclusiones 2 min</div>
                <div className="text-amber-300">{matchStats.away_sanctions.two_minute_suspensions}</div>
              </div>
            </div>

            {/* Posesiones y Eficiencia */}
            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col gap-2">
              <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px]">
                Posesiones y Eficiencia Ofensiva
              </span>
              {matchStats.home_possessions.has_data || matchStats.away_possessions.has_data ? (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    {/* Home Team */}
                    <div className="p-2 bg-slate-900 rounded border border-slate-800 flex flex-col gap-1">
                      <span className="font-bold text-slate-200">{matchStats.home_team_name}</span>
                      <span className="text-[11px] text-slate-400">
                        Posesiones completas: <strong>{matchStats.home_possessions.complete_possessions}</strong> de {matchStats.home_possessions.total_possessions}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Goles en posesión: <strong>{matchStats.home_possessions.goals_in_tracked_possessions}</strong>
                      </span>
                      {matchStats.home_possessions.unassociated_goals > 0 && (
                        <span className="text-[10px] text-amber-400">
                          Goles sin vincular: {matchStats.home_possessions.unassociated_goals} (de {matchStats.home_possessions.total_match_goals})
                        </span>
                      )}
                      {matchStats.home_possessions.has_inconsistency && matchStats.home_possessions.inconsistency_reasons && (
                        <div className="p-1 bg-rose-950/60 border border-rose-800 rounded text-[9px] text-rose-300">
                          ⚠️ {matchStats.home_possessions.inconsistency_reasons[0]}
                        </div>
                      )}
                      <span className="text-[11px] text-sky-400 mt-1">
                        Goles / Posesión:{' '}
                        <strong>
                          {matchStats.home_possessions.goals_per_possession !== null
                            ? matchStats.home_possessions.goals_per_possession
                            : '—'}
                        </strong>
                      </span>
                    </div>

                    {/* Away Team */}
                    <div className="p-2 bg-slate-900 rounded border border-slate-800 flex flex-col gap-1">
                      <span className="font-bold text-slate-200">{matchStats.away_team_name}</span>
                      <span className="text-[11px] text-slate-400">
                        Posesiones completas: <strong>{matchStats.away_possessions.complete_possessions}</strong> de {matchStats.away_possessions.total_possessions}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        Goles en posesión: <strong>{matchStats.away_possessions.goals_in_tracked_possessions}</strong>
                      </span>
                      {matchStats.away_possessions.unassociated_goals > 0 && (
                        <span className="text-[10px] text-amber-400">
                          Goles sin vincular: {matchStats.away_possessions.unassociated_goals} (de {matchStats.away_possessions.total_match_goals})
                        </span>
                      )}
                      {matchStats.away_possessions.has_inconsistency && matchStats.away_possessions.inconsistency_reasons && (
                        <div className="p-1 bg-rose-950/60 border border-rose-800 rounded text-[9px] text-rose-300">
                          ⚠️ {matchStats.away_possessions.inconsistency_reasons[0]}
                        </div>
                      )}
                      <span className="text-[11px] text-sky-400 mt-1">
                        Goles / Posesión:{' '}
                        <strong>
                          {matchStats.away_possessions.goals_per_possession !== null
                            ? matchStats.away_possessions.goals_per_possession
                            : '—'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Advertencia de cobertura parcial de posesiones */}
                  {(matchStats.home_possessions.coverage_status === 'PARTIAL' || matchStats.away_possessions.coverage_status === 'PARTIAL') && (
                    <div className="p-2 bg-amber-950/70 border border-amber-700/80 rounded text-[11px] text-amber-200 flex flex-col gap-0.5">
                      <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Cobertura Parcial de Posesiones
                      </div>
                      <p className="text-[10px]">
                        Existen goles o tiros en el partido registrados fuera del seguimiento de posesiones (ej. acciones anteriores a la activación de posesiones o cargas manuales). Los ratios consideran únicamente las posesiones completas analizadas.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  No se registraron posesiones estructuradas en este partido. Las métricas ofensivas requieren inicio de posesión.
                </p>
              )}
            </div>

            {/* Evolución del Marcador (Timeline) */}
            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col gap-2">
              <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" /> Evolución del Marcador
              </span>
              <div className="max-h-44 overflow-y-auto flex flex-col gap-1 pr-1">
                {matchStats.score_progression.map((sp, idx) => {
                  const isHomeScorer = sp.scoring_team_id === matchStats.home_team_id;
                  return (
                    <div
                      key={idx}
                      className="p-1.5 bg-slate-900/90 rounded border border-slate-800 flex items-center justify-between text-[11px]"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-slate-400 text-[10px]">{sp.clock_formatted}</span>
                        <span className="font-semibold text-[10px] text-slate-500">({sp.period_number}T)</span>
                        <span className={isHomeScorer ? 'text-sky-300 font-medium' : 'text-rose-300 font-medium'}>
                          {sp.scoring_player_name || (isHomeScorer ? matchStats.home_team_name : matchStats.away_team_name)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-slate-100">
                          {sp.home_score} – {sp.away_score}
                        </span>
                        <span className={`font-mono text-[10px] ${sp.difference > 0 ? 'text-emerald-400' : sp.difference < 0 ? 'text-rose-400' : 'text-slate-500'}`}>
                          ({sp.difference > 0 ? `+${sp.difference}` : sp.difference})
                        </span>
                      </div>
                    </div>
                  );
                })}
                {matchStats.score_progression.length === 0 && (
                  <p className="text-[11px] text-slate-500 italic py-2 text-center">No hay goles registrados.</p>
                )}
              </div>
            </div>

            {/* Estadísticas Individuales de Jugadores */}
            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px]">
                  Rendimiento Individual ({matchStats.home_team_name})
                </span>
                <span className="text-[10px] text-slate-400">Minutos & +/-</span>
              </div>

              {/* Advertencia de cobertura parcial de formación */}
              {matchStats.player_stats.some((p) => p.team_id === matchStats.home_team_id && p.plus_minus_coverage === 'PARTIAL') && (
                <div className="p-2 bg-amber-950/70 border border-amber-700/80 rounded text-[11px] text-amber-200 flex flex-col gap-0.5">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Cobertura Parcial de Formación en Cancha
                  </div>
                  <p className="text-[10px]">
                    Existen goles en el partido registrados antes de confirmar la formación en cancha (o en momentos sin jugadores en pista). El +/- individual solo incluye los goles ocurridos durante la presencia física registrada del jugador.
                  </p>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-1">Jugador</th>
                      <th className="py-1 text-center">Goles</th>
                      <th className="py-1 text-center">Tiros</th>
                      <th className="py-1 text-center">% Tiro</th>
                      <th className="py-1 text-center">Asist</th>
                      <th className="py-1 text-center">Pérd</th>
                      <th className="py-1 text-center">Min</th>
                      <th className="py-1 text-center">+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchStats.player_stats
                      .filter((p) => p.team_id === matchStats.home_team_id)
                      .map((p) => (
                        <tr key={p.roster_id} className="border-b border-slate-800 hover:bg-slate-800/40">
                          <td className="py-1.5 font-medium text-slate-200 truncate max-w-[110px]">
                            {p.shirt_number} · {p.display_name}
                          </td>
                          <td className="py-1.5 text-center font-bold text-white">{p.goals}</td>
                          <td className="py-1.5 text-center text-slate-400">{p.total_shots}</td>
                          <td className="py-1.5 text-center font-mono font-bold text-sky-400">
                            {p.shot_effectiveness_pct !== null ? `${p.shot_effectiveness_pct}%` : '—'}
                          </td>
                          <td className="py-1.5 text-center text-emerald-400">{p.assists}</td>
                          <td className="py-1.5 text-center text-rose-400">{p.turnovers}</td>
                          <td className="py-1.5 text-center font-mono text-slate-300">
                            {p.minutes_played_formatted}
                          </td>
                          <td className="py-1.5 text-center font-mono font-bold">
                            {p.plus_minus !== null ? (
                              <div>
                                <span className={p.plus_minus > 0 ? 'text-emerald-400' : p.plus_minus < 0 ? 'text-rose-400' : 'text-slate-400'}>
                                  {p.plus_minus > 0 ? `+${p.plus_minus}` : p.plus_minus}
                                  {p.plus_minus_coverage === 'PARTIAL' && '*'}
                                </span>
                                {p.plus_minus_coverage === 'PARTIAL' ? (
                                  <span className="text-[9px] text-amber-400 block font-normal" title={p.plus_minus_note}>
                                    Parcial
                                  </span>
                                ) : p.team_lineup_coverage === 'PARTIAL' ? (
                                  <span className="text-[9px] text-sky-400/80 block font-normal" title={p.plus_minus_note}>
                                    Indiv. OK
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-slate-500 font-normal" title="Sin datos de participación">
                                —
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Estadísticas de Porteros */}
            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col gap-2">
              <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px]">
                Efectividad de Porteros
              </span>
              <p className="text-[10px] text-slate-400">
                Fórmula oficial: <code className="text-sky-300">Atajadas / (Atajadas + Goles Recibidos)</code>. Los tiros fuera no distorsionan el denominador.
              </p>

              {/* Resumen de auditoría de tiros enfrentados */}
              <div className="p-2 bg-slate-950 rounded border border-slate-800 flex flex-col gap-1 text-[10px]">
                <div className="text-slate-300">
                  <span className="font-bold text-slate-200">{matchStats.home_team_name}:</span> Recibió {matchStats.home_goalkeeper_summary.total_opposing_shots} tiros ({matchStats.home_goalkeeper_summary.identified_shots} asignados a arqueros, {matchStats.home_goalkeeper_summary.unattributed_shots} sin arquero/colectivos, {matchStats.home_goalkeeper_summary.empty_net_goals} a portería vacía).
                </div>
                <div className="text-slate-300">
                  <span className="font-bold text-slate-200">{matchStats.away_team_name}:</span> Recibió {matchStats.away_goalkeeper_summary.total_opposing_shots} tiros ({matchStats.away_goalkeeper_summary.identified_shots} asignados a arqueros, {matchStats.away_goalkeeper_summary.unattributed_shots} sin arquero/colectivos, {matchStats.away_goalkeeper_summary.empty_net_goals} a portería vacía).
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-700 text-slate-400">
                      <th className="py-1">Portero</th>
                      <th className="py-1 text-center">Atajadas</th>
                      <th className="py-1 text-center">Goles Rec</th>
                      <th className="py-1 text-center">Tiros Puerta</th>
                      <th className="py-1 text-center">% Paradas</th>
                      <th className="py-1 text-center">Port. Vacía</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matchStats.goalkeeper_stats.map((g, idx) => (
                      <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/40">
                        <td className="py-1.5 font-medium text-slate-200 max-w-[130px]">
                          <div>
                            {g.display_name}
                            {g.is_unknown_or_collective && (
                              <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-amber-900/60 border border-amber-600 text-amber-300">
                                Colectivo
                              </span>
                            )}
                          </div>
                          {g.unattributed_explanation && (
                            <div className="text-[9px] text-amber-400/80 font-normal leading-tight">
                              {g.unattributed_explanation}
                            </div>
                          )}
                        </td>
                        <td className="py-1.5 text-center font-bold text-emerald-400">{g.saves}</td>
                        <td className="py-1.5 text-center text-rose-400">{g.goals_conceded}</td>
                        <td className="py-1.5 text-center text-slate-300">{g.shots_on_target}</td>
                        <td className="py-1.5 text-center font-mono font-bold text-sky-400">
                          {g.save_pct !== null ? `${g.save_pct}%` : '—'}
                        </td>
                        <td className="py-1.5 text-center text-amber-300">{g.empty_net_goals_conceded}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 3. PESTAÑA MAPAS DE LANZAMIENTOS Y PÉRDIDAS */}
        {activeTab === 'maps' && (
          <TacticalAnalysisMap
            currentMatch={currentMatch}
            periods={currentPeriods || []}
            teams={allTeams || []}
            rosters={currentRosters || []}
            events={events || []}
          />
        )}

        {/* 4. PESTAÑA ACUMULADOS MULTI-PARTIDO */}
        {activeTab === 'aggregates' && (
          <div className="flex flex-col gap-4 text-xs">
            <div className="p-3 bg-slate-800/60 rounded-lg border border-slate-700 flex flex-col gap-2">
              <div className="flex flex-wrap justify-between items-center gap-2">
                <span className="font-bold text-sky-400 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> Historial y Estadísticas Acumuladas
                </span>
                <label className="flex items-center gap-1.5 cursor-pointer bg-slate-900/90 px-2.5 py-1 rounded border border-slate-700 text-[11px] text-slate-300 hover:text-white select-none">
                  <input
                    type="checkbox"
                    checked={includeDemoInAggregates}
                    onChange={(e) => setIncludeDemoInAggregates(e.target.checked)}
                    className="rounded text-sky-500 bg-slate-800 border-slate-600 focus:ring-0 cursor-pointer"
                  />
                  <span>Incluir partidos de demostración</span>
                </label>
              </div>
              <p className="text-[10px] text-slate-400">
                Ponderación matemática exacta: <code className="text-sky-300">sum(goles) / sum(tiros)</code> sobre la totalidad de partidos, sin promediar porcentajes.
              </p>

              {aggregatedStats ? (
                <div className="flex flex-col gap-3">
                  {/* Totales consolidados */}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Partidos</span>
                      <span className="font-extrabold text-base text-white">{aggregatedStats.matches_count}</span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 block mb-0.5">Efectividad Tiro</span>
                      <span className="font-extrabold text-base text-sky-400">
                        {aggregatedStats.aggregate_shot_effectiveness_pct !== null ? `${aggregatedStats.aggregate_shot_effectiveness_pct}%` : '—'}
                      </span>
                    </div>
                    <div className="p-2 bg-slate-900 rounded border border-slate-800">
                      <span className="text-[10px] text-slate-400 block mb-0.5">% Paradas GK</span>
                      <span className="font-extrabold text-base text-emerald-400">
                        {aggregatedStats.aggregate_save_pct !== null ? `${aggregatedStats.aggregate_save_pct}%` : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Tabla de Jugadores Acumulada */}
                  <div className="flex flex-col gap-1.5">
                    <span className="font-bold text-slate-300 text-[11px]">Jugadores en el Historial</span>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-400">
                            <th className="py-1">Jugador</th>
                            <th className="py-1 text-center">PJ</th>
                            <th className="py-1 text-center">Goles</th>
                            <th className="py-1 text-center">Tiros</th>
                            <th className="py-1 text-center">% Acum</th>
                            <th className="py-1 text-center">Asist</th>
                            <th className="py-1 text-center">+/-</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(aggregatedStats.players).map((p, idx) => (
                            <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/40">
                              <td className="py-1.5 font-medium text-slate-200 truncate max-w-[120px]">
                                {p.shirt_number} · {p.display_name}
                              </td>
                              <td className="py-1.5 text-center text-slate-400">{p.matches_played}</td>
                              <td className="py-1.5 text-center font-bold text-white">{p.goals}</td>
                              <td className="py-1.5 text-center text-slate-400">{p.shots}</td>
                              <td className="py-1.5 text-center font-mono font-bold text-sky-400">
                                {p.effectiveness_pct !== null ? `${p.effectiveness_pct}%` : '—'}
                              </td>
                              <td className="py-1.5 text-center text-emerald-400">{p.assists}</td>
                              <td className="py-1.5 text-center font-mono font-bold">
                                {p.plus_minus !== null ? (
                                  <span className={p.plus_minus > 0 ? 'text-emerald-400' : p.plus_minus < 0 ? 'text-rose-400' : 'text-slate-400'}>
                                    {p.plus_minus > 0 ? `+${p.plus_minus}` : p.plus_minus}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Tabla de Arqueros Acumulada */}
                  <div className="flex flex-col gap-1.5 mt-2">
                    <span className="font-bold text-slate-300 text-[11px]">Porteros en el Historial</span>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-400">
                            <th className="py-1">Portero</th>
                            <th className="py-1 text-center">PJ</th>
                            <th className="py-1 text-center">Atajadas</th>
                            <th className="py-1 text-center">Goles Rec</th>
                            <th className="py-1 text-center">Tiros Puerta</th>
                            <th className="py-1 text-center">% Paradas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.values(aggregatedStats.goalkeepers).map((gk, idx) => (
                            <tr key={idx} className="border-b border-slate-800 hover:bg-slate-800/40">
                              <td className="py-1.5 font-medium text-slate-200 truncate max-w-[120px]">
                                {gk.display_name}
                              </td>
                              <td className="py-1.5 text-center text-slate-400">{gk.matches_played}</td>
                              <td className="py-1.5 text-center font-bold text-emerald-400">{gk.saves}</td>
                              <td className="py-1.5 text-center text-rose-400">{gk.goals_conceded}</td>
                              <td className="py-1.5 text-center text-slate-300">{gk.shots_on_target}</td>
                              <td className="py-1.5 text-center font-mono font-bold text-sky-400">
                                {gk.save_pct !== null ? `${gk.save_pct}%` : '—'}
                              </td>
                            </tr>
                          ))}
                          {Object.keys(aggregatedStats.goalkeepers).length === 0 && (
                            <tr>
                              <td colSpan={6} className="py-2 text-center text-slate-500 italic">
                                Sin arqueros con registro nominal directo en el historial.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Auditoría de datos no asignados y portería vacía en historial */}
                  <div className="p-2 bg-slate-950 rounded border border-slate-800 text-[10px] text-slate-400 flex flex-col gap-0.5">
                    <div>
                      • Goles recibidos a portería vacía en el historial: <strong className="text-amber-300">{aggregatedStats.total_empty_net_goals}</strong> (no imputados a ningún arquero individual).
                    </div>
                    <div>
                      • Tiros sin arquero nominal asignado en el historial: <strong className="text-amber-300">{aggregatedStats.total_unattributed_shots}</strong> ({aggregatedStats.total_unattributed_goals} goles).
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-slate-900/60 rounded border border-slate-800 text-center text-slate-400 italic text-[11px]">
                  No hay partidos oficiales en el historial acumulado. Marque la casilla <strong className="text-sky-300">"Incluir partidos de demostración"</strong> para visualizar el análisis de los partidos de prueba.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 5. HISTORIAL DE EVENTOS Y CORRECCIONES */}
        {activeTab === 'events' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Eventos del Partido (Orden Deportivo)
              </span>
              <button
                onClick={() => {
                  setPastPeriodId(activePeriodId || currentPeriods?.[0]?.id || '');
                  setPastTeamId(ownTeamId || '');
                  setPastTimeStr(formatTime(clockState?.currentDisplayMs || 0));
                  setPastActionModalOpen(true);
                }}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Agregar Acción Pasada
              </button>
            </div>

            {/* Auditoría en pantalla de eventos PERIOD_END */}
            {(() => {
              const periodEndEvents = events?.filter((e) => e.type === 'PERIOD_END') || [];
              if (periodEndEvents.length === 0) return null;
              return (
                <div className="p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-[11px] text-slate-300 flex flex-col gap-1 shadow-sm">
                  <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    Auditoría de Eventos de Fin de Período ({periodEndEvents.length} registrados):
                  </span>
                  <div className="flex flex-col gap-1 mt-0.5">
                    {periodEndEvents.map((pe, idx) => {
                      const pObj = currentPeriods?.find((p) => p.id === pe.period_id);
                      return (
                        <div key={idx} className="flex items-center gap-2 font-mono text-[10px] bg-slate-900/60 p-1 rounded border border-slate-800/80">
                          <span className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-bold">
                            {pObj ? `${pObj.number}T` : 'Período ?'}
                          </span>
                          <span>Reloj: <strong>{formatTime(pe.clock_ms)}</strong></span>
                          <span className="text-slate-400">seq: {pe.sport_seq}</span>
                          <span className="text-slate-500 text-[9px]">ID: {pe.id.slice(0, 8)}...</span>
                          {pe.status === 'voided' && <span className="text-rose-400 font-bold ml-auto">[ANULADO]</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {events && events.length === 0 && (
              <p className="text-xs text-slate-500 italic text-center py-6">No hay eventos registrados en este partido.</p>
            )}

            <div className="flex flex-col gap-1.5">
              {events
                ?.slice()
                .sort((a, b) => {
                  const pNumA = currentPeriods?.find((p) => p.id === a.period_id)?.number ?? 1;
                  const pNumB = currentPeriods?.find((p) => p.id === b.period_id)?.number ?? 1;
                  if (pNumA !== pNumB) return pNumB - pNumA;
                  if (a.clock_ms !== b.clock_ms) return b.clock_ms - a.clock_ms;
                  return b.sport_seq - a.sport_seq;
                })
                .map((ev) => {
                  const isVoided = ev.status === 'voided';
                  const team = allTeams?.find((t) => t.id === ev.match_team_id);
                  const shooterParticipant = ev.participants.find((p) => p.role === 'SHOOTER');
                  const shooterRoster = currentRosters?.find((r) => r.id === shooterParticipant?.roster_id);
                  const evPeriod = currentPeriods?.find((p) => p.id === ev.period_id);
                  const periodBadge = evPeriod ? `${evPeriod.number}T` : 'Per';

                  return (
                    <div
                      key={ev.id}
                      className={`p-2.5 rounded border flex flex-col gap-1.5 text-xs transition-all ${
                        isVoided
                          ? 'bg-slate-900/40 border-slate-800 opacity-50 line-through'
                          : 'bg-slate-800/80 border-slate-700'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-2">
                          <span className="px-1 py-0.5 rounded bg-slate-700 font-mono text-[9px] text-slate-300 font-semibold">
                            {periodBadge}
                          </span>
                          <span className="font-mono text-sky-400 font-bold">{formatTime(ev.clock_ms)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${getEventBadgeClass(ev)}`}
                          >
                            {getEventDisplayLabel(ev, periodBadge)}
                          </span>
                          {isVoided && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold">
                              ANULADO
                            </span>
                          )}
                        </div>

                        {!isVoided && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleOpenEditEventModal(ev)}
                              className="p-1 text-slate-400 hover:text-sky-300"
                              title="Editar acción"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleVoidEvent(ev)}
                              className="p-1 text-slate-400 hover:text-rose-400"
                              title="Anular acción"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-between items-center text-[11px] text-slate-400">
                        <span>
                          {team ? team.short_name : 'General'} {shooterRoster ? `• ${shooterRoster.display_name_snapshot}` : ''}
                        </span>
                        <span className="font-mono text-[10px]">
                          seq:{ev.sport_seq} | rev:v{ev.version}
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* 6. GESTIÓN DE PARTIDOS */}
        {activeTab === 'matches' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lista de Partidos</span>
              <button
                onClick={handleOpenMatchModal}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo Partido
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {allMatches?.map((m) => {
                const isActive = m.id === currentMatchId;
                const hName = m.home_team_name_snapshot || allTeams?.find((t) => t.id === m.home_team_id)?.name || 'Local';
                const aName = m.away_team_name_snapshot || allTeams?.find((t) => t.id === m.away_team_id)?.name || 'Rival';
                return (
                  <div
                    key={m.id}
                    className={`p-3 rounded-lg border flex flex-col gap-2 transition-all ${
                      isActive ? 'bg-sky-950/40 border-sky-500' : 'bg-slate-800/80 border-slate-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-sm text-slate-100">
                          {hName} <span className="text-slate-500 font-normal">vs</span> {aName}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{m.competition || 'Sin competición'}</span>
                          <span>•</span>
                          <span>{new Date(m.scheduled_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {m.is_demo && (
                          <span className="px-1.5 py-0.5 bg-amber-950/80 text-amber-300 border border-amber-800 text-[10px] rounded font-bold uppercase tracking-wider">
                            Demo
                          </span>
                        )}
                        {isActive ? (
                          <span className="px-2 py-0.5 bg-sky-600/30 text-sky-400 border border-sky-500/40 text-[10px] rounded font-bold">
                            ACTIVO
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setCurrentMatchId(m.id);
                              setActiveTab('live');
                            }}
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded font-medium"
                          >
                            Cargar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setEditingMatch(m);
                            setEditMatchForm({
                              competition: m.competition || '',
                              venue: m.venue || '',
                              status: m.status,
                              scheduled_at: m.scheduled_at ? new Date(m.scheduled_at).toISOString().slice(0, 16) : '',
                            });
                          }}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs rounded font-medium flex items-center gap-1"
                          title="Editar datos del partido"
                        >
                          <Edit3 className="w-3 h-3" /> Editar
                        </button>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-500 flex justify-between items-center font-mono border-t border-slate-700/50 pt-1.5">
                      <span>Períodos: {m.rules_config.periods_count} ({m.rules_config.period_duration_ms / 60000}m)</span>
                      <span>Rev: v{m.match_revision}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 7. GESTIÓN DE EQUIPOS */}
        {activeTab === 'teams' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Catálogo de Equipos</span>
              <button
                onClick={() => setShowTeamModal(true)}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo Equipo
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {allTeams?.map((team) => (
                <div
                  key={team.id}
                  className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                    team.archived ? 'bg-slate-900/60 border-slate-800 opacity-60' : 'bg-slate-800 border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0"
                      style={{ backgroundColor: team.color_primary }}
                    />
                    <div>
                      <div className="font-bold text-slate-200">
                        {team.name}{' '}
                        <span className="font-mono text-slate-400 font-normal">({team.short_name})</span>
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {team.is_own ? 'Equipo Propio' : 'Equipo Rival'} {team.archived && '• Archivado'}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => managementService.archiveTeam(team.id, !team.archived)}
                    className="p-1 text-slate-400 hover:text-slate-200"
                    title={team.archived ? 'Restaurar equipo' : 'Archivar equipo'}
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 8. GESTIÓN DE JUGADORES */}
        {activeTab === 'players' && (
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Catálogo de Jugadores</span>
              <button
                onClick={() => setShowPlayerModal(true)}
                className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1 shadow"
              >
                <Plus className="w-3.5 h-3.5" /> Nuevo Jugador
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {allPlayers?.map((player) => {
                const assignedTeam = allTeams?.find((t) => t.id === player.team_id);
                return (
                  <div
                    key={player.id}
                    className={`p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                      player.archived ? 'bg-slate-900/60 border-slate-800 opacity-60' : 'bg-slate-800 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 h-6 rounded bg-slate-700 text-sky-400 font-bold font-mono flex items-center justify-center shrink-0">
                        {player.default_number ?? '-'}
                      </span>
                      <div>
                        <div className="font-bold text-slate-200">
                          {player.first_name} {player.last_name || ''}
                          {player.is_goalkeeper && (
                            <span className="ml-1.5 px-1 py-0.2 bg-amber-900/60 border border-amber-600 text-amber-300 text-[9px] rounded font-mono">
                              POR
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Pos: {player.position || 'N/A'} {assignedTeam ? `• ${assignedTeam.short_name}` : ''}{' '}
                          {player.archived && '• Archivado'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => managementService.archivePlayer(player.id, !player.archived)}
                      className="p-1 text-slate-400 hover:text-slate-200"
                      title={player.archived ? 'Restaurar jugador' : 'Archivar jugador'}
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 9. EXPORTACIÓN EXTERNA, TRANSFERENCIA Y RESPALDOS COMPLETOS (Fase 5) */}
        {activeTab === 'transfer' && (
          <div className="flex flex-col gap-6">
            {/* Notificación de Estado Global de Exportación/Respaldo */}
            {exportFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center justify-between shadow-md transition-all ${
                  exportFeedback.kind === 'success'
                    ? 'bg-emerald-950/80 border-emerald-600 text-emerald-200'
                    : 'bg-rose-950/80 border-rose-600 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  {exportFeedback.kind === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{exportFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setExportFeedback(null)}
                  className="text-xs px-2 py-0.5 rounded bg-slate-900/60 hover:bg-slate-900 text-slate-300 font-bold ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* SECCIÓN 1: EXPORTACIÓN PARA ANÁLISIS EXTERNO (EXCEL XLSX Y CSV MODULAR) */}
            <div className="bg-slate-900/90 rounded-xl border border-slate-700/80 p-4 shadow-xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-950/60 border border-emerald-600/70 text-emerald-400 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      1. Exportación de Partido para Análisis Externo
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Partido:{' '}
                      <span className="text-slate-200 font-semibold">
                        {currentMatch?.home_team_name_snapshot || homeTeam?.name || 'Local'} vs{' '}
                        {currentMatch?.away_team_name_snapshot || awayTeam?.name || 'Rival'}
                      </span>
                    </p>
                  </div>
                </div>
                <span className="self-start sm:self-auto text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 font-mono">
                  Offline • XLSX y CSV
                </span>
              </div>

              {/* Grid 2 Columnas para Excel y CSV */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                {/* Tarjeta A: Planilla Completa Excel XLSX */}
                <div className="bg-slate-950/70 rounded-lg p-3.5 border border-slate-800 flex flex-col justify-between gap-3">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4" /> Planilla Completa Microsoft Excel (.xlsx)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">7 Hojas Oficiales</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Genera un libro estructurado con las 7 hojas completas del partido:{' '}
                      <strong className="text-slate-200">Partido, Equipos, Jugadores, Porteros, Lanzamientos, Posesiones</strong> y{' '}
                      <strong className="text-slate-200">Eventos</strong>.
                    </p>
                    <ul className="text-[10px] text-slate-400 space-y-1 bg-slate-900/60 p-2 rounded border border-slate-800">
                      <li>• Encabezados normalizados en español.</li>
                      <li>• Distingue cero real de datos ausentes (<code className="text-sky-300">ND</code> / <code className="text-sky-300">—</code>).</li>
                      <li>• Excluye eventos anulados de las estadísticas y los rotula con su motivo en auditoría.</li>
                      <li>• No inventa jugadores ficticios para rivales colectivos.</li>
                    </ul>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportXLSX}
                    disabled={exportLoading || !currentMatch}
                    className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <FileDown className="w-4 h-4" />
                    {exportLoading ? 'Generando Excel...' : 'Descargar Planilla Excel (.xlsx)'}
                  </button>
                </div>

                {/* Tarjeta B: Exportación Modular CSV */}
                <div className="bg-slate-950/70 rounded-lg p-3.5 border border-slate-800 flex flex-col justify-between gap-3">
                  <div className="flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-400 flex items-center gap-1.5">
                        <FileText className="w-4 h-4" /> Exportación Modular a CSV (.csv)
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">UTF-8 con BOM</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Exporta tablas individuales seleccionadas para importar en hojas de cálculo, scripts de Python, R o bases de datos relacionales.
                    </p>

                    {/* Selector de Tabla */}
                    <div>
                      <label className="block text-slate-400 text-[11px] mb-1 font-semibold">
                        Tabla a Exportar:
                      </label>
                      <select
                        value={csvTableChoice}
                        onChange={(e) => setCsvTableChoice(e.target.value as ExportTableKey)}
                        className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs font-medium focus:border-sky-500 outline-none"
                      >
                        <option value="partido">Ficha Resumen del Partido</option>
                        <option value="equipos">Estadísticas Colectivas de Equipos</option>
                        <option value="jugadores">Planilla Individual (+/-, Minutos, Goles)</option>
                        <option value="porteros">Eficacia y Atajadas de Porteros</option>
                        <option value="lanzamientos">Detalle de Tiros (Origen, Destino, Fase)</option>
                        <option value="posesiones">Posesiones y Goles por Posesión</option>
                        <option value="eventos">Cronología y Auditoría de Acciones</option>
                      </select>
                    </div>

                    {/* Selector de Separador */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-slate-400 text-[11px] font-semibold">Separador:</span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="csvDelim"
                            value=";"
                            checked={csvDelimiter === ';'}
                            onChange={() => setCsvDelimiter(';')}
                            className="text-sky-500 focus:ring-0"
                          />
                          Punto y coma (;)
                        </label>
                        <label className="flex items-center gap-1 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="radio"
                            name="csvDelim"
                            value=","
                            checked={csvDelimiter === ','}
                            onChange={() => setCsvDelimiter(',')}
                            className="text-sky-500 focus:ring-0"
                          />
                          Coma (,)
                        </label>
                      </div>
                    </div>

                    {/* Casilla de Protección contra Inyección de Fórmulas */}
                    <label className="flex items-start gap-2 cursor-pointer bg-slate-900/60 p-2 rounded border border-slate-800 text-[10px] text-slate-400">
                      <input
                        type="checkbox"
                        checked={csvProtectFormulas}
                        onChange={(e) => setCsvProtectFormulas(e.target.checked)}
                        className="rounded bg-slate-800 border-slate-700 text-sky-500 mt-0.5 shrink-0 focus:ring-0"
                      />
                      <span>
                        Protección contra inyección de fórmulas CSV (antepone apóstrofe a textos con <code className="text-amber-300">=, +, -, @</code> respetando números como +/- negativo).
                      </span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    disabled={exportLoading || !currentMatch}
                    className="w-full py-2.5 px-3 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-lg shadow-md flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  >
                    <FileText className="w-4 h-4" />
                    {exportLoading ? 'Generando CSV...' : 'Descargar Tabla en CSV (.csv)'}
                  </button>
                </div>
              </div>
            </div>

            {/* SECCIÓN 2: TRANSFERENCIA DE PARTIDO INDIVIDUAL (JSON) */}
            <div className="bg-slate-900/90 rounded-xl border border-slate-700/80 p-4 shadow-xl flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <div className="w-8 h-8 rounded-lg bg-sky-950/60 border border-sky-600/70 text-sky-400 flex items-center justify-center shrink-0">
                  <Laptop className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                    2. Transferencia de Partido Individual entre Dispositivos
                  </h2>
                  <p className="text-[11px] text-slate-400">
                    Mover o sincronizar únicamente el partido activo ({currentMatch?.id.slice(0, 8)}...) entre PC y móvil.
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-300">
                Exporta el partido seleccionado a un archivo <code className="text-sky-300">.json</code> autocontenido con huella digital SHA-256 para transferirlo sin conexión, o importa comparando eventos locales para evitar sobrescrituras accidentales.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleExportJson}
                  className="py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
                >
                  <Download className="w-4 h-4" /> Exportar Partido a JSON
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
                >
                  <Upload className="w-4 h-4" /> Seleccionar e Importar JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFileSelected}
                />
              </div>

              {/* Vista Previa de Importación de Partido Individual */}
              {importAnalysis && (
                <div className="mt-2 p-3 bg-slate-950 rounded-lg border-2 border-sky-500 flex flex-col gap-2.5 shadow-2xl">
                  <h3 className="font-bold text-xs text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-4 h-4" /> Análisis de Importación de Partido
                  </h3>

                  {importAnalysis.kind === 'INVALID' && (
                    <div className="text-xs text-rose-400 flex flex-col gap-1">
                      <span className="font-bold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> Archivo Rechazado de Forma Atómica:
                      </span>
                      <p>{importAnalysis.error}</p>
                      <button
                        onClick={() => setImportAnalysis(null)}
                        className="mt-2 py-1 bg-slate-800 rounded text-slate-300 font-semibold text-xs"
                      >
                        Cerrar
                      </button>
                    </div>
                  )}

                  {importAnalysis.kind === 'IDENTICAL' && (
                    <div className="text-xs text-slate-300 flex flex-col gap-1">
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> Partido 100% Idéntico (Idempotente)
                      </span>
                      <p className="text-slate-400">
                        La huella digital de este archivo coincide con el estado local. No se requieren cambios ni se duplicarán registros.
                      </p>
                      <button
                        onClick={() => setImportAnalysis(null)}
                        className="mt-2 py-1 bg-slate-800 rounded text-slate-300 font-semibold text-xs"
                      >
                        Aceptar
                      </button>
                    </div>
                  )}

                  {importAnalysis.kind === 'NEW' && (
                    <div className="text-xs text-slate-300 flex flex-col gap-2">
                      <span className="text-sky-400 font-bold">Partido Nuevo Detectado:</span>
                      <div className="p-2 bg-slate-900 rounded font-mono text-[11px] text-slate-400 flex flex-col gap-0.5">
                        <span>ID: {importAnalysis.envelope.match.id}</span>
                        <span>Equipos: {importAnalysis.envelope.teams.map((t) => t.name).join(' vs ')}</span>
                        <span>Eventos: {importAnalysis.envelope.events.length}</span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmImport(false)}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold"
                        >
                          Confirmar e Importar
                        </button>
                        <button
                          onClick={() => setImportAnalysis(null)}
                          className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {importAnalysis.kind === 'CONFLICT' && (
                    <div className="text-xs text-slate-300 flex flex-col gap-2">
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <AlertTriangle className="w-4 h-4 text-amber-400" /> Conflicto / Diferencias Detectadas:
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-[11px] p-2 bg-slate-900 rounded border border-slate-800">
                        <div>
                          <span className="font-bold text-slate-400 block">LOCAL:</span>
                          <span>Eventos: {importAnalysis.localEventCount}</span>
                          <br />
                          <span>Rev: v{importAnalysis.localRevision}</span>
                        </div>
                        <div>
                          <span className="font-bold text-sky-400 block">ARCHIVO:</span>
                          <span>Eventos: {importAnalysis.incomingEventCount}</span>
                          <br />
                          <span>Rev: v{importAnalysis.incomingRevision}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-amber-300/90 italic">
                        Se creará una copia de rescate local antes de reemplazar para permitir deshacer.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmImport(true)}
                          className="flex-1 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-bold"
                        >
                          Autorizar Reemplazo
                        </button>
                        <button
                          onClick={() => setImportAnalysis(null)}
                          className="px-3 py-1.5 bg-slate-800 text-slate-400 rounded font-medium"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SECCIÓN 3: RESPALDO INTEGRAL Y RESTAURACIÓN ATÓMICA (12 TABLAS) */}
            <div className="bg-slate-900/90 rounded-xl border border-slate-700/80 p-4 shadow-xl flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-950/60 border border-amber-600/70 text-amber-400 flex items-center justify-center shrink-0">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                      3. Respaldo Integral y Restauración Atómica de Base de Datos
                    </h2>
                    <p className="text-[11px] text-slate-400">
                      Copia completa de seguridad de las 12 tablas locales de IndexedDB con verificación criptográfica SHA-256 (compatible con respaldos anteriores FNV-1a).
                    </p>
                  </div>
                </div>
                <span className="self-start sm:self-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-700/60 font-mono">
                  12 Tablas • Transacción Atómica
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">
                A diferencia de la transferencia de un solo partido, el respaldo completo guarda{' '}
                <strong className="text-slate-200">todos los partidos, equipos, jugadores del catálogo, eventos, auditorías, posesiones, participaciones y copias de rescate</strong>.
                La restauración se ejecuta bajo una transacción atómica estricta: si ocurre un fallo o inconsistencia, ningún dato se modifica (rollback total).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleCreateFullBackup}
                  disabled={exportLoading}
                  className="py-2.5 px-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-lg shadow-md text-xs flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <Download className="w-4 h-4" />
                  {exportLoading ? 'Generando Copia...' : 'Descargar Copia de Seguridad Completa (.json)'}
                </button>

                <button
                  type="button"
                  onClick={() => backupFileInputRef.current?.click()}
                  disabled={restoreLoading}
                  className="py-2.5 px-3 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-900 text-slate-200 border border-slate-600 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-transform"
                >
                  <Upload className="w-4 h-4" /> Inspeccionar y Restaurar Respaldo
                </button>
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleBackupFileSelected}
                />
              </div>

              {/* Panel de Inspección y Previsualización de Respaldo Completo */}
              {backupInspection && (
                <div className="mt-2 p-4 bg-slate-950 rounded-xl border-2 border-amber-500 flex flex-col gap-3.5 shadow-2xl">
                  {/* Respaldo Inválido / Rechazado */}
                  {!backupInspection.valid ? (
                    <div className="flex flex-col gap-2 text-xs text-rose-300">
                      <div className="flex items-center gap-2 font-bold text-rose-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>Archivo de Respaldo Rechazado por Seguridad e Integridad</span>
                      </div>
                      <p className="bg-rose-950/60 p-2.5 rounded border border-rose-800/80 font-mono text-[11px] text-rose-200">
                        {backupInspection.error}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setBackupInspection(null);
                          setBackupRawPayload(null);
                        }}
                        className="self-end mt-1 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded text-xs"
                      >
                        Cerrar Inspección
                      </button>
                    </div>
                  ) : (
                    /* Respaldo Válido: Tabla Comparativa y Confirmación */
                    <div className="flex flex-col gap-3 text-xs">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-slate-800 pb-2">
                        <div className="flex items-center gap-2 font-bold text-amber-400">
                          <Database className="w-4 h-4 shrink-0" />
                          <span>Inspección de Respaldo: Comparativa de Registros</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span>Esquema: v{backupInspection.envelope.schema_version}</span>
                          <span>•</span>
                          <span>Fecha: {backupInspection.createdAtFormatted}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5 p-2.5 bg-slate-900/90 rounded border border-slate-800 text-[11px] text-slate-300">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                          <CheckCircle className="w-4 h-4 shrink-0" />
                          <span>Huella digital válida: {backupInspection.fingerprintAlgorithmLabel}</span>
                        </div>
                        <div className="text-[10px] font-mono text-slate-400 break-all">
                          Huella de integridad: <span className="text-slate-200 font-bold">{backupInspection.fingerprint}</span>
                        </div>
                      </div>

                      {/* Tabla Comparativa de Registros */}
                      <div className="overflow-x-auto rounded border border-slate-800">
                        <table className="w-full text-left text-[11px] text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 uppercase font-mono text-[10px]">
                            <tr>
                              <th className="py-1.5 px-3">Tabla del Sistema</th>
                              <th className="py-1.5 px-3 text-right">En Archivo</th>
                              <th className="py-1.5 px-3 text-right">En Sistema Local</th>
                              <th className="py-1.5 px-3 text-right">Diferencia</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 font-mono">
                            {[
                              { key: 'matches', label: 'Partidos' },
                              { key: 'matchPeriods', label: 'Períodos' },
                              { key: 'teams', label: 'Equipos' },
                              { key: 'players', label: 'Jugadores (Catálogo)' },
                              { key: 'matchRosters', label: 'Convocatorias / Planteles' },
                              { key: 'matchEvents', label: 'Eventos de Partido' },
                              { key: 'eventRevisions', label: 'Revisiones y Auditoría' },
                              { key: 'possessions', label: 'Posesiones' },
                              { key: 'playerParticipations', label: 'Participación en Cancha' },
                              { key: 'rescueSnapshots', label: 'Copias de Rescate' },
                            ].map((row) => {
                              const inc = (backupInspection.incomingCounts as any)[row.key] ?? 0;
                              const loc = (backupInspection.currentLocalCounts as any)[row.key] ?? 0;
                              const diff = inc - loc;
                              return (
                                <tr key={row.key} className="hover:bg-slate-900/40">
                                  <td className="py-1 px-3 text-slate-200">
                                    {row.label}
                                    <span className="text-[9px] text-slate-500 ml-1.5 font-normal">({row.key})</span>
                                  </td>
                                  <td className="py-1 px-3 text-right font-bold text-sky-400">{inc}</td>
                                  <td className="py-1 px-3 text-right text-slate-400">{loc}</td>
                                  <td
                                    className={`py-1 px-3 text-right font-bold ${
                                      diff > 0
                                        ? 'text-emerald-400'
                                        : diff < 0
                                        ? 'text-amber-400'
                                        : 'text-slate-500'
                                    }`}
                                  >
                                    {diff > 0 ? `+${diff}` : diff}
                                  </td>
                                </tr>
                              );
                            })}
                            {(() => {
                              const totalInc = Object.values(backupInspection.incomingCounts).reduce((s: number, n: number) => s + n, 0);
                              const totalLoc = Object.values(backupInspection.currentLocalCounts).reduce((s: number, n: number) => s + n, 0);
                              const totalDiff = totalInc - totalLoc;
                              return (
                                <tr className="bg-slate-900/80 font-bold text-slate-100 border-t border-slate-700">
                                  <td className="py-1.5 px-3">Total General de Registros</td>
                                  <td className="py-1.5 px-3 text-right text-sky-300">{totalInc}</td>
                                  <td className="py-1.5 px-3 text-right text-slate-300">{totalLoc}</td>
                                  <td className="py-1.5 px-3 text-right text-amber-300">
                                    {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                                  </td>
                                </tr>
                              );
                            })()}
                          </tbody>
                        </table>
                      </div>

                      {/* Advertencia Crítica y Botón de Respaldo Preventivo */}
                      <div className="bg-amber-950/60 border border-amber-600/80 rounded-lg p-3 flex flex-col gap-2 text-amber-200">
                        <div className="flex items-center gap-1.5 font-bold text-amber-300 text-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>ADVERTENCIA CRÍTICA: Reemplazo Completo de la Base de Datos</span>
                        </div>
                        <p className="text-[11px] leading-relaxed">
                          La restauración sustituirá <strong>todos los registros actuales</strong> de la aplicación por los datos contenidos en este archivo. Para su tranquilidad, puede descargar una copia preventiva de sus datos actuales antes de proceder.
                        </p>
                        <button
                          type="button"
                          onClick={handleDownloadPreRestoreSafetyBackup}
                          className="self-start px-2.5 py-1 bg-amber-900/80 hover:bg-amber-800 border border-amber-600 text-amber-100 rounded text-[11px] font-semibold flex items-center gap-1.5 shadow"
                        >
                          <Download className="w-3.5 h-3.5" /> Descargar Copia Preventiva de Seguridad Ahora
                        </button>
                      </div>

                      {/* Confirmación Explícita Obligatoria */}
                      <label className="flex items-start gap-2.5 cursor-pointer bg-slate-900 p-2.5 rounded-lg border border-slate-700 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={backupConfirmedSafety}
                          onChange={(e) => setBackupConfirmedSafety(e.target.checked)}
                          className="rounded bg-slate-800 border-slate-600 text-amber-500 mt-0.5 shrink-0 focus:ring-0"
                        />
                        <span className="font-semibold text-amber-300">
                          He verificado la previsualización y autorizo el reemplazo atómico de la base de datos con los registros de este archivo de respaldo.
                        </span>
                      </label>

                      {/* Botones de Acción */}
                      <div className="flex flex-col sm:flex-row gap-2 mt-1">
                        <button
                          type="button"
                          onClick={handleConfirmRestoreBackup}
                          disabled={!backupConfirmedSafety || restoreLoading}
                          className="flex-1 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-lg shadow text-xs flex items-center justify-center gap-2"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${restoreLoading ? 'animate-spin' : ''}`} />
                          {restoreLoading ? 'Restaurando Base de Datos...' : 'Confirmar y Restaurar Base de Datos Atómicamente'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setBackupInspection(null);
                            setBackupRawPayload(null);
                            setBackupConfirmedSafety(false);
                          }}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 10. COPIAS DE RESCATE */}
        {activeTab === 'rescue' && (
          <div className="flex flex-col gap-3">
            <div className="bg-slate-800/40 p-3 rounded-lg border border-slate-700 text-xs text-slate-300 flex flex-col gap-1.5">
              <span className="font-bold text-sky-400 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" /> Copias de Seguridad de Rescate
              </span>
              <p>
                Instantáneas íntegras guardadas antes de autorizar reemplazos en el partido activo.
              </p>
            </div>

            {rescueSnapshots && rescueSnapshots.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-6">No hay copias de rescate pendientes para este partido.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {rescueSnapshots?.map((snap) => (
                  <div key={snap.id} className="p-2.5 bg-slate-800 rounded border border-slate-700 flex flex-col gap-1.5 text-xs">
                    <div className="flex justify-between items-center text-slate-400 font-mono text-[10px]">
                      <span>{snap.created_at}</span>
                      <span className="text-amber-400 font-semibold">{snap.reason}</span>
                    </div>
                    <span className="text-slate-300 text-[11px]">
                      Partido: {snap.match_id.slice(0, 8)}... | Eventos: {(snap.full_payload as any).events?.length ?? 0}
                    </span>
                    <button
                      onClick={handleRestoreRescue}
                      className="self-end px-3 py-1 bg-amber-700 hover:bg-amber-600 text-white font-bold rounded text-xs"
                    >
                      Restaurar Versión Previa
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>




      {/* MODAL SUSTITUCIÓN */}
      {subModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3 text-xs shadow-2xl">
            <h3 className="font-bold text-sm text-sky-400 flex items-center gap-1.5">
              <ArrowRightLeft className="w-4 h-4" /> Registrar Sustitución
            </h3>

            <div>
              <label className="block text-slate-400 mb-1">Sale de Cancha</label>
              <select
                value={subOutRosterId}
                onChange={(e) => setSubOutRosterId(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
              >
                <option value="">Seleccione jugador que sale...</option>
                {activeCourtParticipations
                  .filter((p) => p.team_id === ownTeamId)
                  .map((p) => {
                    const r = currentRosters?.find((ros) => ros.id === p.roster_id);
                    return (
                      <option key={p.id} value={p.roster_id}>
                        {r?.display_name_snapshot || 'Jugador'}
                      </option>
                    );
                  })}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1">Entra a Cancha</label>
              <select
                value={subInRosterId}
                onChange={(e) => setSubInRosterId(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
              >
                <option value="">Seleccione jugador que entra...</option>
                {currentRosters
                  ?.filter(
                    (r) =>
                      r.team_id === ownTeamId &&
                      !activeCourtParticipations.some((p) => p.roster_id === r.id)
                  )
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.display_name_snapshot} ({r.role === 'GK' ? 'Portero' : 'Campo'})
                    </option>
                  ))}
              </select>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={handleConfirmSubstitution}
                className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow"
              >
                Confirmar Sustitución
              </button>
              <button
                onClick={() => setSubModalOpen(false)}
                className="px-3 py-2 bg-slate-800 text-slate-400 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR ACCIÓN */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3 text-xs shadow-2xl">
            <h3 className="font-bold text-sm text-sky-400">Editar Acción Registrada</h3>
            <form onSubmit={handleSaveEditedEvent} className="flex flex-col gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Tiempo (mm:ss)</label>
                <input
                  type="text"
                  required
                  pattern="[0-9]{1,2}:[0-9]{2}"
                  value={editTimeStr}
                  onChange={(e) => setEditTimeStr(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Motivo de la Corrección</label>
                <input
                  type="text"
                  placeholder="ej. Ajuste de tiempo según cronómetro oficial"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow"
                >
                  Guardar Cambios
                </button>
                <button
                  type="button"
                  onClick={() => setEditingEvent(null)}
                  className="px-3 py-2 bg-slate-800 text-slate-400 rounded"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR ACCIÓN PASADA (RETROACTIVA) */}
      {pastActionModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3 text-xs shadow-2xl">
            <h3 className="font-bold text-sm text-sky-400">Registrar Acción Omitida / Pasada</h3>
            <form onSubmit={handleSavePastAction} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Período</label>
                  <select
                    value={pastPeriodId}
                    onChange={(e) => setPastPeriodId(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                  >
                    {currentPeriods?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.number}T
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Tiempo (mm:ss)</label>
                  <input
                    type="text"
                    required
                    pattern="[0-9]{1,2}:[0-9]{2}"
                    value={pastTimeStr}
                    onChange={(e) => setPastTimeStr(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Equipo</label>
                <select
                  value={pastTeamId}
                  onChange={(e) => setPastTeamId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                >
                  <option value={currentMatch?.home_team_id}>
                    {currentMatch?.home_team_name_snapshot || 'Local'}
                  </option>
                  <option value={currentMatch?.away_team_id}>
                    {currentMatch?.away_team_name_snapshot || 'Visitante'}
                  </option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Tipo de Evento</label>
                  <select
                    value={pastType}
                    onChange={(e) => setPastType(e.target.value as any)}
                    className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                  >
                    <option value="SHOT">Lanzamiento</option>
                    <option value="TURNOVER">Pérdida</option>
                    <option value="SANCTION">Sanción</option>
                  </select>
                </div>

                {pastType === 'SHOT' && (
                  <div>
                    <label className="block text-slate-400 mb-1">Resultado Tiro</label>
                    <select
                      value={pastShotResult}
                      onChange={(e) => setPastShotResult(e.target.value as any)}
                      className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                    >
                      <option value="GOAL">GOL</option>
                      <option value="SAVED">Atajada</option>
                      <option value="MISSED">Fuera</option>
                      <option value="POST">Poste</option>
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Jugador (opcional)</label>
                <select
                  value={pastRosterId}
                  onChange={(e) => setPastRosterId(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                >
                  <option value="">(Sin asignar / Colectivo)</option>
                  {currentRosters
                    ?.filter((r) => r.team_id === pastTeamId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.display_name_snapshot}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow"
                >
                  Registrar Acción
                </button>
                <button
                  type="button"
                  onClick={() => setPastActionModalOpen(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-400 rounded"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVO EQUIPO (Fase 2) */}
      {showTeamModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3 text-xs shadow-2xl">
            <h3 className="font-bold text-sm text-sky-400">Crear Nuevo Equipo</h3>
            <form onSubmit={handleSaveTeam} className="flex flex-col gap-3">
              <div>
                <label className="block text-slate-400 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  placeholder="ej. Colegio Ward"
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Abreviatura</label>
                  <input
                    type="text"
                    required
                    maxLength={5}
                    placeholder="WAR"
                    value={newTeam.short_name}
                    onChange={(e) => setNewTeam({ ...newTeam, short_name: e.target.value.toUpperCase() })}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 uppercase font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Color Principal</label>
                  <input
                    type="color"
                    value={newTeam.color_primary}
                    onChange={(e) => setNewTeam({ ...newTeam, color_primary: e.target.value })}
                    className="w-full h-8 bg-slate-800 border border-slate-700 rounded cursor-pointer p-0.5"
                  />
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={newTeam.is_own}
                    onChange={(e) => setNewTeam({ ...newTeam, is_own: e.target.checked })}
                    className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0"
                  />
                  <span className="text-slate-300 font-medium">¿Es equipo propio de mi club?</span>
                </label>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow"
                >
                  Guardar Equipo
                </button>
                <button
                  type="button"
                  onClick={() => setShowTeamModal(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-400 hover:text-slate-200 rounded font-medium"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NUEVO JUGADOR (Fase 2) */}
      {showPlayerModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3 text-xs shadow-2xl">
            <h3 className="font-bold text-sm text-sky-400">Crear Nuevo Jugador</h3>
            <form onSubmit={handleSavePlayer} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Nombre</label>
                  <input
                    type="text"
                    required
                    placeholder="Diego"
                    value={newPlayer.first_name}
                    onChange={(e) => setNewPlayer({ ...newPlayer, first_name: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Apellido (opcional)</label>
                  <input
                    type="text"
                    placeholder="Simonet"
                    value={newPlayer.last_name || ''}
                    onChange={(e) => setNewPlayer({ ...newPlayer, last_name: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Dorsal Habitual</label>
                  <input
                    type="number"
                    min={0}
                    max={99}
                    value={newPlayer.default_number ?? ''}
                    onChange={(e) => setNewPlayer({ ...newPlayer, default_number: Number(e.target.value) })}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Posición Principal</label>
                  <select
                    value={newPlayer.position || 'CB'}
                    onChange={(e) => setNewPlayer({ ...newPlayer, position: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                  >
                    <option value="GK">Portero (GK)</option>
                    <option value="LW">Extremo Izquierdo (LW)</option>
                    <option value="LB">Lateral Izquierdo (LB)</option>
                    <option value="CB">Central (CB)</option>
                    <option value="RB">Lateral Derecho (RB)</option>
                    <option value="RW">Extremo Derecho (RW)</option>
                    <option value="PV">Pivote (PV)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer mt-1">
                  <input
                    type="checkbox"
                    checked={newPlayer.is_goalkeeper || newPlayer.position === 'GK'}
                    onChange={(e) => setNewPlayer({ ...newPlayer, is_goalkeeper: e.target.checked })}
                    className="rounded bg-slate-800 border-slate-700 text-sky-600 focus:ring-0"
                  />
                  <span className="text-slate-300 font-medium">Identificar como Portero</span>
                </label>
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow"
                >
                  Guardar Jugador
                </button>
                <button
                  type="button"
                  onClick={() => setShowPlayerModal(false)}
                  className="px-3 py-2 bg-slate-800 text-slate-400 rounded"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONFIGURAR NUEVO PARTIDO (Fase 2) */}
      {showMatchModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3 text-xs shadow-2xl my-auto">
            <h3 className="font-bold text-sm text-sky-400">Configurar Nuevo Partido</h3>
            <form onSubmit={handleSaveMatch} className="flex flex-col gap-3">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Condición de Nuestro Club</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const ownTeams = allTeams?.filter((t) => t.is_own && !t.archived) || [];
                      const rivalTeams = allTeams?.filter((t) => !t.is_own && !t.archived) || [];
                      setMatchForm({
                        ...matchForm,
                        own_team_side: 'HOME',
                        home_team_id: ownTeams[0]?.id || matchForm.home_team_id,
                        away_team_id: rivalTeams[0]?.id || matchForm.away_team_id,
                      });
                    }}
                    className={`py-1.5 rounded font-bold text-xs border ${
                      matchForm.own_team_side === 'HOME'
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    ★ Somos Locales
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ownTeams = allTeams?.filter((t) => t.is_own && !t.archived) || [];
                      const rivalTeams = allTeams?.filter((t) => !t.is_own && !t.archived) || [];
                      setMatchForm({
                        ...matchForm,
                        own_team_side: 'AWAY',
                        home_team_id: rivalTeams[0]?.id || matchForm.home_team_id,
                        away_team_id: ownTeams[0]?.id || matchForm.away_team_id,
                      });
                    }}
                    className={`py-1.5 rounded font-bold text-xs border ${
                      matchForm.own_team_side === 'AWAY'
                        ? 'bg-sky-600 text-white border-sky-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700'
                    }`}
                  >
                    ★ Somos Visitantes
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Equipo Local {matchForm.own_team_side === 'HOME' ? '(Nuestro Club)' : '(Rival)'}
                </label>
                <select
                  required
                  value={matchForm.home_team_id}
                  onChange={(e) => setMatchForm({ ...matchForm, home_team_id: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                >
                  <option value="">Seleccionar equipo local...</option>
                  {allTeams?.filter((t) => !t.archived).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.short_name}) {t.is_own ? '★ Propio' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">
                  Equipo Visitante {matchForm.own_team_side === 'AWAY' ? '(Nuestro Club)' : '(Rival)'}
                </label>
                <select
                  required
                  value={matchForm.away_team_id}
                  onChange={(e) => setMatchForm({ ...matchForm, away_team_id: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                >
                  <option value="">Seleccionar equipo visitante...</option>
                  {allTeams?.filter((t) => !t.archived && t.id !== matchForm.home_team_id).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.short_name}) {t.is_own ? '★ Propio' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-400 mb-1">Competición</label>
                  <input
                    type="text"
                    value={matchForm.competition}
                    onChange={(e) => setMatchForm({ ...matchForm, competition: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Sede / Cancha</label>
                  <input
                    type="text"
                    placeholder="Polideportivo"
                    value={matchForm.venue}
                    onChange={(e) => setMatchForm({ ...matchForm, venue: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-100"
                  />
                </div>
              </div>

              {/* Selección de Jugadores Convocados de Nuestro Equipo */}
              {(() => {
                const ownTeamPlayers = matchForm.selected_player_ids.map((id) => allPlayers?.find((p) => p.id === id));
                const fieldCount = ownTeamPlayers.filter((p) => p && !p.is_goalkeeper && p.position !== 'GK').length;
                const gkCount = ownTeamPlayers.filter((p) => p && (p.is_goalkeeper || p.position === 'GK')).length;
                const meetsMinimum = fieldCount >= 5 && gkCount >= 1;

                return (
                  <div className="flex flex-col gap-2 border-t border-slate-800 pt-2">
                    <div className={`p-2 rounded text-[11px] flex flex-col gap-1 border ${
                      meetsMinimum ? 'bg-emerald-950/40 border-emerald-700/80 text-emerald-200' : 'bg-amber-950/40 border-amber-700/80 text-amber-200'
                    }`}>
                      <div className="font-bold flex justify-between items-center">
                        <span>Convocados: {fieldCount} jugadores de campo y {gkCount} arquero(s)</span>
                        {meetsMinimum ? (
                          <span className="text-emerald-400">✓ Válido</span>
                        ) : (
                          <span className="text-amber-400">Incompleto</span>
                        )}
                      </div>
                      <span className="text-[10px] opacity-90">
                        Mínimo para comenzar: 5 jugadores de campo y 1 arquero.
                      </span>
                    </div>

                    <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
                      {allPlayers?.filter((p) => !p.archived).map((p) => {
                        const isSelected = matchForm.selected_player_ids.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            className={`p-1.5 rounded border flex items-center justify-between text-[11px] ${
                              isSelected ? 'bg-sky-950/30 border-sky-600' : 'bg-slate-800/40 border-slate-700'
                            }`}
                          >
                            <label className="flex items-center gap-2 cursor-pointer flex-1 truncate">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setMatchForm({
                                      ...matchForm,
                                      selected_player_ids: [...matchForm.selected_player_ids, p.id],
                                      player_numbers: {
                                        ...matchForm.player_numbers,
                                        [p.id]: matchForm.player_numbers[p.id] ?? (p.default_number || 1),
                                      },
                                    });
                                  } else {
                                    setMatchForm({
                                      ...matchForm,
                                      selected_player_ids: matchForm.selected_player_ids.filter((id) => id !== p.id),
                                    });
                                  }
                                }}
                                className="rounded bg-slate-800 border-slate-700 text-sky-600"
                              />
                              <span className="truncate">
                                {p.first_name} {p.last_name || ''} ({p.is_goalkeeper || p.position === 'GK' ? 'Arquero' : p.position})
                              </span>
                            </label>

                            {isSelected && (
                              <div className="flex items-center gap-2 shrink-0">
                                <input
                                  type="number"
                                  min={0}
                                  max={99}
                                  value={matchForm.player_numbers[p.id] ?? p.default_number ?? 1}
                                  onChange={(e) =>
                                    setMatchForm({
                                      ...matchForm,
                                      player_numbers: {
                                        ...matchForm.player_numbers,
                                        [p.id]: Number(e.target.value),
                                      },
                                    })
                                  }
                                  className="w-10 px-1 py-0.5 bg-slate-900 border border-slate-600 rounded text-center font-mono font-bold text-sky-400"
                                />
                                <label className="flex items-center gap-1 text-[10px] text-slate-400">
                                  <input
                                    type="checkbox"
                                    checked={!!matchForm.player_starters[p.id]}
                                    onChange={(e) =>
                                      setMatchForm({
                                        ...matchForm,
                                        player_starters: {
                                          ...matchForm.player_starters,
                                          [p.id]: e.target.checked,
                                        },
                                      })
                                    }
                                    className="rounded bg-slate-800 border-slate-700 text-emerald-500"
                                  />
                                  Titular
                                </label>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex gap-2 mt-2">
                      <button
                        type="submit"
                        className={`flex-1 py-2 font-bold rounded shadow transition-all ${
                          meetsMinimum
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer active:scale-98'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700/80'
                        }`}
                      >
                        Crear y Comenzar
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMatchModal(false)}
                        className="px-3 py-2 bg-slate-800 text-slate-400 rounded"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                );
              })()}
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR PARTIDO */}
      {editingMatch && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-sm flex flex-col gap-3 text-xs shadow-2xl my-auto">
            <h3 className="font-bold text-sm text-sky-400">Editar Partido</h3>
            <p className="text-[11px] text-slate-400">
              Modificación de metadatos del partido sin alterar eventos ni jugadas registradas.
            </p>
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Competición / Torneo</label>
                <input
                  type="text"
                  value={editMatchForm.competition}
                  onChange={(e) => setEditMatchForm({ ...editMatchForm, competition: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200"
                  placeholder="Ej: Liga de Honor Caballeros"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Cancha / Sede</label>
                <input
                  type="text"
                  value={editMatchForm.venue}
                  onChange={(e) => setEditMatchForm({ ...editMatchForm, venue: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200"
                  placeholder="Ej: Polideportivo SAG Villa Ballester"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Estado del Partido</label>
                <select
                  value={editMatchForm.status}
                  onChange={(e) => setEditMatchForm({ ...editMatchForm, status: e.target.value as Match['status'] })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-semibold"
                >
                  <option value="scheduled">Programado (scheduled)</option>
                  <option value="live">En Juego / Vivo (live)</option>
                  <option value="finished">Finalizado (finished)</option>
                  <option value="abandoned">Suspendido / Abandonado (abandoned)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">Fecha y Hora</label>
                <input
                  type="datetime-local"
                  value={editMatchForm.scheduled_at}
                  onChange={(e) => setEditMatchForm({ ...editMatchForm, scheduled_at: e.target.value })}
                  className="w-full px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 font-mono text-[11px]"
                />
              </div>

              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={async () => {
                    if (!editingMatch) return;
                    try {
                      await managementService.updateMatch(editingMatch.id, {
                        competition: editMatchForm.competition,
                        venue: editMatchForm.venue,
                        status: editMatchForm.status,
                        scheduled_at: editMatchForm.scheduled_at ? new Date(editMatchForm.scheduled_at).toISOString() : editingMatch.scheduled_at,
                      });
                      setEditingMatch(null);
                    } catch (err: any) {
                      alert(err?.message || 'Error al actualizar el partido');
                    }
                  }}
                  className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded shadow transition-all cursor-pointer"
                >
                  Guardar Cambios
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMatch(null)}
                  className="px-3 py-2 bg-slate-800 text-slate-400 rounded hover:text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <footer className="p-2 bg-slate-950 border-t border-slate-800 text-[10px] text-slate-500 flex justify-between items-center">
        <span>HandStat Fase 5 (v1.3.0 · Build 2026-10-20-1330)</span>
        <span>Revisión de Partido: v{currentMatch?.match_revision ?? 1}</span>
      </footer>
    </div>
  );
};

export default App;
