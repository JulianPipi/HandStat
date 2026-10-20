import React, { useState, useMemo } from 'react';
import type {
  Match,
  MatchEvent,
  MatchPeriod,
  MatchRoster,
  MatchPossession,
  Team
} from '../domain/schemas';
import type { ClockSnapshot } from '../services/clockService';
import {
  calculateWindowBoundaries,
  filterEventsInWindow,
  calculateScoreProgression,
  calculateTurnoverBreakdown,
  calculateShotMapData,
  calculateSuspensionsAndSanctions,
  generateQuickInsights,
  formatClockMs,
  TURNOVER_REASON_NAMES_ES,
  type CoachWindowFilter,
} from '../services/coachDashboardService';
import {
  COURT_SECTORS,
  GOAL_GRID_SECTORS,
  GOAL_POSTS_AND_OUT_SECTORS,
  SPANISH_ZONE_NAMES,
} from '../constants/tacticalGeometry';
import {
  ArrowLeft,
  Clock,
  Shield,
  Target,
  AlertTriangle,
  Flame,
  ChevronDown,
  ChevronUp,
  Activity,
  UserCheck,
  Zap,
} from 'lucide-react';

export interface CoachDashboardProps {
  currentMatch: Match | undefined;
  periods: MatchPeriod[];
  teams: Team[];
  rosters: MatchRoster[];
  events: MatchEvent[];
  clockState: ClockSnapshot;
  activePeriodNumber: number;
  homeScore: number;
  awayScore: number;
  activePossession?: MatchPossession;
  numericalSituationContext?: string;
  numericalSituationLabel?: string;
  onNavigateToLive: () => void;
  onNavigateToEvents?: () => void;
}

export const CoachDashboard: React.FC<CoachDashboardProps> = ({
  currentMatch,
  periods,
  teams,
  rosters,
  events,
  clockState,
  activePeriodNumber,
  homeScore,
  awayScore,
  activePossession,
  numericalSituationLabel = 'Igualdad (6 vs 6)',
  onNavigateToLive,
}) => {
  // Filtro de ventana temporal (por defecto: Últimos 5 minutos)
  const [windowFilter, setWindowFilter] = useState<CoachWindowFilter>('LAST_5_MIN');

  // Toggle de tiros: rival por defecto
  const [shotTeamToggle, setShotTeamToggle] = useState<'RIVAL' | 'OWN'>('RIVAL');

  // Sector seleccionado para inspección en el mapa
  const [selectedCourtCode, setSelectedCourtCode] = useState<string | null>(null);
  const [selectedGoalCode, setSelectedGoalCode] = useState<string | null>(null);

  // Acordeón de respaldo de observación rápida
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);

  // Equipos local y visitante
  const homeTeam = currentMatch ? teams.find((t) => t.id === currentMatch.home_team_id) : undefined;
  const awayTeam = currentMatch ? teams.find((t) => t.id === currentMatch.away_team_id) : undefined;

  // Determinar equipo propio y rival
  const ownTeam = homeTeam?.is_own ? homeTeam : awayTeam?.is_own ? awayTeam : homeTeam;
  const rivalTeam = ownTeam?.id === homeTeam?.id ? awayTeam : homeTeam;

  const ownTeamId = ownTeam?.id || '';
  const rivalTeamId = rivalTeam?.id || '';

  // 1. Límites de la ventana continua según tiempo deportivo acumulado
  const windowBoundaries = useMemo(() => {
    return calculateWindowBoundaries(
      windowFilter,
      activePeriodNumber,
      clockState.currentDisplayMs,
      periods,
      currentMatch,
      events
    );
  }, [windowFilter, activePeriodNumber, clockState.currentDisplayMs, periods, currentMatch, events]);

  // 2. Eventos filtrados en la ventana continua
  const windowEvents = useMemo(() => {
    return filterEventsInWindow(events, windowBoundaries, periods, currentMatch);
  }, [events, windowBoundaries, periods, currentMatch]);

  // 3. Exclusiones y Sanciones (evaluadas dinámicamente con tiempo deportivo continuo)
  const suspensionsData = useMemo(() => {
    return calculateSuspensionsAndSanctions(
      events,
      activePeriodNumber,
      clockState.currentDisplayMs,
      teams,
      rosters,
      periods,
      currentMatch
    );
  }, [events, activePeriodNumber, clockState.currentDisplayMs, teams, rosters, periods, currentMatch]);

  // 4. Evolución del marcador y racha activa en la ventana
  const scoreProgression = useMemo(() => {
    return calculateScoreProgression(
      events,
      windowBoundaries,
      currentMatch?.home_team_id || '',
      currentMatch?.away_team_id || '',
      teams,
      rosters,
      periods,
      currentMatch
    );
  }, [events, windowBoundaries, currentMatch, teams, rosters, periods]);

  // 5. Pérdidas y recuperaciones de nuestro equipo
  const ownTurnovers = useMemo(() => {
    return calculateTurnoverBreakdown(windowEvents, ownTeamId, rosters);
  }, [windowEvents, ownTeamId, rosters]);

  // 6. Mapa de tiros del rival y propio
  const targetShotTeamId = shotTeamToggle === 'RIVAL' ? rivalTeamId : ownTeamId;
  const currentShotMap = useMemo(() => {
    return calculateShotMapData(windowEvents, targetShotTeamId);
  }, [windowEvents, targetShotTeamId]);

  const rivalShotMapForInsight = useMemo(() => {
    return calculateShotMapData(windowEvents, rivalTeamId);
  }, [windowEvents, rivalTeamId]);

  // 7. Resumen Rápido (máx 3 observaciones prioritarias con respaldo)
  const quickInsights = useMemo(() => {
    return generateQuickInsights(
      windowBoundaries,
      ownTeamId,
      rivalTeamId,
      teams,
      rosters,
      scoreProgression,
      ownTurnovers,
      rivalShotMapForInsight
    );
  }, [
    windowBoundaries,
    ownTeamId,
    rivalTeamId,
    teams,
    rosters,
    scoreProgression,
    ownTurnovers,
    rivalShotMapForInsight,
  ]);

  // Equipo en posesión actual
  const possessionTeam = activePossession?.team_id
    ? teams.find((t) => t.id === activePossession.team_id)
    : undefined;

  // Inspección del sector seleccionado
  const activeCourtSector = COURT_SECTORS.find((s) => s.code === selectedCourtCode);
  const activeCourtStat = selectedCourtCode ? currentShotMap.byZone[selectedCourtCode] : null;
  const courtSectorShots = useMemo(() => {
    if (!selectedCourtCode) return [];
    return currentShotMap.events.filter(
      (e) => (e.shot_detail?.origin_zone_code || 'UNKNOWN') === selectedCourtCode
    );
  }, [selectedCourtCode, currentShotMap]);

  const activeGoalSector = [...GOAL_GRID_SECTORS, ...GOAL_POSTS_AND_OUT_SECTORS].find(
    (s) => s.code === selectedGoalCode
  );
  const goalSectorShots = useMemo(() => {
    if (!selectedGoalCode) return [];
    return currentShotMap.events.filter(
      (e) => (e.shot_detail?.target_zone_code || 'UNKNOWN') === selectedGoalCode
    );
  }, [selectedGoalCode, currentShotMap]);

  return (
    <div className="flex flex-col gap-4 text-xs select-none max-w-7xl mx-auto pb-12">
      {/* 1. ENCABEZADO TÁCTICO Y NAVEGACIÓN */}
      <header className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-xl flex flex-col gap-3">
        {/* Barra superior de retorno y estado */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <button
            type="button"
            onClick={onNavigateToLive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/40 font-bold transition-all shadow-sm active:scale-95"
          >
            <ArrowLeft className="w-4 h-4 text-sky-400" />
            <span>Regresar al Registro En Vivo</span>
            <span className="text-[10px] text-sky-400/80 font-normal hidden sm:inline">
              (Jugada en preparación conservada)
            </span>
          </button>

          {/* Marcador Central en Vivo */}
          <div className="flex items-center gap-4 bg-slate-900 px-4 py-1.5 rounded-lg border border-slate-800">
            <div className="flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: homeTeam?.color_primary || '#0284c7' }}
              />
              <span className="font-extrabold text-sm text-white">
                {homeTeam?.short_name || 'LOC'}
              </span>
            </div>
            <div className="font-mono text-xl font-black text-white px-2 tracking-wider">
              {homeScore} – {awayScore}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm text-white">
                {awayTeam?.short_name || 'VIS'}
              </span>
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: awayTeam?.color_primary || '#ef4444' }}
              />
            </div>
          </div>

          {/* Reloj y Período */}
          <div className="flex items-center gap-2 text-slate-300">
            <span className="font-bold text-slate-200 bg-slate-900 px-2 py-1 rounded border border-slate-800 flex items-center gap-1.5">
              <Clock className={`w-3.5 h-3.5 ${clockState.running ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
              <span className="font-mono text-sm">{formatClockMs(clockState.currentDisplayMs)}</span>
              <span className="text-[10px] text-slate-400 font-sans">({activePeriodNumber}T)</span>
            </span>

            {/* Posesión Actual */}
            {possessionTeam && (
              <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                <span>Balón: {possessionTeam.short_name}</span>
              </span>
            )}
          </div>
        </div>

        {/* Selector de Filtros de Ventana */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 font-bold text-[11px] uppercase tracking-wider mr-1">
              Ventana de Análisis:
            </span>
            <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800">
              <button
                type="button"
                onClick={() => setWindowFilter('LAST_5_MIN')}
                className={`px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                  windowFilter === 'LAST_5_MIN'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ⏱️ Últimos 5 minutos (Por defecto)
              </button>
              <button
                type="button"
                onClick={() => setWindowFilter('CURRENT_PERIOD')}
                className={`px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                  windowFilter === 'CURRENT_PERIOD'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🕒 {activePeriodNumber}º Tiempo
              </button>
              <button
                type="button"
                onClick={() => setWindowFilter('FULL_MATCH')}
                className={`px-3 py-1.5 rounded-md font-bold text-xs transition-all ${
                  windowFilter === 'FULL_MATCH'
                    ? 'bg-sky-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                🏁 Todo el partido
              </button>
            </div>
          </div>

          {/* Rango Deportivo Acumulado */}
          <div className="text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800">
            <span className="text-sky-400 font-semibold">{windowBoundaries.label}</span>
            <span className="ml-1 text-slate-500">
              ({formatClockMs(windowBoundaries.durationMs)} de juego activo)
            </span>
          </div>
        </div>
      </header>

      {/* 2. EXCLUSIONES, SANCIONES Y SITUACIÓN NUMÉRICA */}
      <section className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-200 text-sm">
              Situación Numérica y Exclusiones de 2 Minutos
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-md bg-slate-900 font-bold border border-slate-800 text-slate-300">
              Situación:{' '}
              <strong className="text-amber-400 font-mono ml-1">{numericalSituationLabel}</strong>
            </span>
          </div>
        </div>

        {/* Exclusiones de 2 minutos activas y por cumplir */}
        {suspensionsData.activeSuspensions.length > 0 || suspensionsData.expiredSuspensions.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {/* Activas */}
            {suspensionsData.activeSuspensions.map((susp) => {
              const team = teams.find((t) => t.id === susp.teamId);
              return (
                <div
                  key={susp.eventId}
                  className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-600/40 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: team?.color_primary || '#f59e0b' }}
                    />
                    <div className="truncate">
                      <div className="font-bold text-white text-xs truncate">
                        {susp.shirtNumber !== undefined ? `#${susp.shirtNumber} ` : ''}
                        {susp.playerName}
                      </div>
                      <div className="text-[10px] text-amber-400/90">
                        {susp.teamName} · Exclusión de 2 min ({formatClockMs(susp.startClockMs)} [{susp.startPeriodNumber}T])
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono font-extrabold text-sm text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded border border-amber-500/50">
                      ⏱️ {susp.statusLabel}
                    </div>
                    <span className="text-[9px] text-amber-400/70 block mt-0.5">
                      {clockState.running ? 'Pausado con reloj' : 'Tiempo deportivo'}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Tiempo cumplido: Puede reingresar */}
            {suspensionsData.expiredSuspensions.slice(-2).map((susp) => (
              <div
                key={susp.eventId}
                className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-600/40 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 truncate">
                  <UserCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div className="truncate">
                    <div className="font-bold text-white text-xs truncate">
                      {susp.shirtNumber !== undefined ? `#${susp.shirtNumber} ` : ''}
                      {susp.playerName}
                    </div>
                    <div className="text-[10px] text-emerald-400/90">{susp.teamName}</div>
                  </div>
                </div>
                <div className="shrink-0 font-bold text-[11px] text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-500/50">
                  Puede reingresar
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Sin exclusiones de 2 minutos activas en este momento. Ambos equipos cuentan con igualdad reglamentaria.</span>
          </div>
        )}

        {/* Advertencia factual para jugadores al límite (2 exclusiones) */}
        {suspensionsData.playersAtExclusionLimit.length > 0 && (
          <div className="p-2.5 rounded-lg bg-amber-900/20 border border-amber-600/40 flex flex-wrap items-center gap-2 text-amber-300 text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="font-bold">Advertencia reglamentaria:</span>
            <span>Jugadores con 2 exclusiones acumuladas (al límite de descalificación):</span>
            <div className="flex flex-wrap gap-1.5 ml-1">
              {suspensionsData.playersAtExclusionLimit.map((p) => (
                <span
                  key={p.rosterId}
                  className="px-2 py-0.5 rounded bg-amber-950 text-amber-200 border border-amber-500/50 font-semibold text-[11px]"
                >
                  {p.playerName} {p.shirtNumber !== undefined ? `(#${p.shirtNumber})` : ''} · {p.teamName}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Descalificaciones / Expulsiones vigentes */}
        {suspensionsData.disqualifications.length > 0 && (
          <div className="p-2 rounded-lg bg-rose-950/30 border border-rose-600/40 flex flex-wrap items-center gap-2 text-rose-300 text-xs">
            <span className="font-bold text-rose-400">Descalificaciones vigentes:</span>
            {suspensionsData.disqualifications.map((d) => (
              <span
                key={d.eventId}
                className="px-2 py-0.5 rounded bg-rose-900/50 text-rose-200 border border-rose-500/40 text-[11px]"
              >
                {d.kind === 'RED_CARD' ? 'Tarjeta Roja' : 'Tarjeta Azul'} — {d.playerName} ({d.teamName})
              </span>
            ))}
          </div>
        )}
      </section>

      {/* 3. RESUMEN RÁPIDO (MÁXIMO 3 OBSERVACIONES PRIORITARIAS) */}
      <section className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex flex-col gap-2.5">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-sky-400" />
            <span className="font-bold text-slate-200 text-sm">
              Resumen Rápido para el Entrenador (Prioridades de la Ventana)
            </span>
          </div>
          <span className="text-[10px] text-slate-500">Datos objetivos verificables</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {quickInsights.map((insight) => {
            const isExpanded = expandedInsightId === insight.id;
            return (
              <div
                key={insight.id}
                className={`p-3 rounded-xl border transition-all flex flex-col justify-between ${
                  insight.category === 'RUN'
                    ? 'bg-rose-950/20 border-rose-600/30'
                    : insight.category === 'TURNOVER'
                    ? 'bg-amber-950/20 border-amber-600/30'
                    : 'bg-sky-950/20 border-sky-600/30'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">
                      {insight.title}
                    </span>
                    {insight.category === 'RUN' && <Flame className="w-3.5 h-3.5 text-rose-400" />}
                  </div>
                  <h4 className="font-bold text-white text-sm leading-snug mb-1">
                    {insight.highlight}
                  </h4>
                  <p className="text-slate-300 text-xs leading-relaxed">{insight.detail}</p>
                </div>

                {/* Botón para ver eventos de respaldo */}
                {insight.supportingEvents.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800/60">
                    <button
                      type="button"
                      onClick={() => setExpandedInsightId(isExpanded ? null : insight.id)}
                      className="w-full flex items-center justify-between text-[11px] font-semibold text-sky-400 hover:text-sky-300 transition-colors"
                    >
                      <span>
                        {isExpanded ? 'Ocultar respaldo' : `Ver ${insight.supportingEvents.length} eventos de respaldo`}
                      </span>
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    {/* Desglose de eventos de respaldo */}
                    {isExpanded && (
                      <div className="mt-2 flex flex-col gap-1 max-h-40 overflow-y-auto pr-1 scrollbar-thin">
                        {insight.supportingEvents.map((ev) => {
                          const time = formatClockMs(ev.clock_ms);
                          const shooter = ev.participants?.find((p) => p.role === 'SHOOTER');
                          const victim = ev.participants?.find((p) => p.role === 'TURNOVER_BY');
                          const rosterId = shooter?.roster_id || victim?.roster_id;
                          const roster = rosterId ? rosters.find((r) => r.id === rosterId) : undefined;
                          const actionDesc =
                            ev.type === 'SHOT'
                              ? `Tiro (${ev.shot_detail?.result_code === 'GOAL' ? 'Gol' : ev.shot_detail?.result_code})`
                              : `Pérdida (${ev.turnover_detail?.reason})`;

                          return (
                            <div
                              key={ev.id}
                              className="p-1.5 rounded bg-slate-900 border border-slate-800 text-[10px] flex items-center justify-between text-slate-300"
                            >
                              <span className="font-mono text-sky-400 font-bold">{time}</span>
                              <span className="truncate mx-1">
                                {roster?.display_name_snapshot || 'Colectivo'} — {actionDesc}
                              </span>
                              <span className="text-[9px] text-slate-500 shrink-0">
                                {ev.shot_detail?.origin_zone_code || ev.turnover_detail?.court_zone || ''}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 4. EVOLUCIÓN DEL MARCADOR Y RACHA ACTIVA */}
      <section className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-slate-200 text-sm">
              Evolución del Marcador en la Ventana
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs bg-slate-900 px-3 py-1 rounded-md border border-slate-800 text-slate-300">
              Inicio ventana: <strong className="font-mono text-white">{scoreProgression.startScore.home}–{scoreProgression.startScore.away}</strong>
              {' ➔ '}
              Actual: <strong className="font-mono text-white">{scoreProgression.endScore.home}–{scoreProgression.endScore.away}</strong>
            </div>
            <div className="text-xs bg-sky-950/60 px-3 py-1 rounded-md border border-sky-600/40 text-sky-300 font-bold">
              Parcial: {scoreProgression.partialScore.home} – {scoreProgression.partialScore.away}
            </div>
          </div>
        </div>

        {/* Racha activa sin respuesta */}
        {scoreProgression.unansweredRun && (
          <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-500/50 flex items-center justify-between gap-2 text-rose-200 text-xs">
            <div className="flex items-center gap-2">
              <Flame className="w-4 h-4 text-rose-400 animate-bounce" />
              <span className="font-extrabold text-white text-sm">
                Racha activa: {scoreProgression.unansweredRun.teamName} {scoreProgression.unansweredRun.goalsCount} goles seguidos
              </span>
              <span className="text-rose-300">
                (desde el minuto {formatClockMs(scoreProgression.unansweredRun.startClockMs)} [{scoreProgression.unansweredRun.startPeriodNumber}T])
              </span>
            </div>
            <span className="text-[11px] font-bold bg-rose-900 px-2 py-0.5 rounded text-rose-200 border border-rose-600">
              Parcial {scoreProgression.unansweredRun.goalsCount}–0
            </span>
          </div>
        )}

        {/* Secuencia cronológica de goles */}
        {scoreProgression.goalsSequence.length > 0 ? (
          <div>
            <span className="text-[11px] font-bold text-slate-400 block mb-1.5 uppercase tracking-wider">
              Secuencia de Goles en la Ventana ({scoreProgression.goalsSequence.length}):
            </span>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
              {scoreProgression.goalsSequence.map((g) => {
                const isHome = g.teamId === currentMatch?.home_team_id;
                return (
                  <div
                    key={g.eventId}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 min-w-[150px] shrink-0 flex flex-col gap-1 shadow"
                  >
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-mono text-sky-400 font-bold">
                        {formatClockMs(g.clockMs)} ({g.periodNumber}T)
                      </span>
                      <span
                        className={`font-bold px-1.5 py-0.2 rounded text-[9px] ${
                          isHome ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {g.teamName}
                      </span>
                    </div>
                    <div className="font-semibold text-white text-xs truncate">
                      {g.shirtNumber !== undefined ? `#${g.shirtNumber} ` : ''}
                      {g.playerName}
                    </div>
                    <div className="text-center font-mono font-black text-sm text-amber-300 bg-slate-950/80 py-0.5 rounded border border-slate-800">
                      {g.homeScoreAfter} – {g.awayScoreAfter}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-slate-400 text-xs italic bg-slate-900/40 p-2.5 rounded-lg border border-slate-800 text-center">
            Sin goles anotados en esta ventana de tiempo.
          </div>
        )}
      </section>

      {/* 5. PÉRDIDAS Y RECUPERACIONES (¿CÓMO ESTAMOS PERDIENDO LA PELOTA?) */}
      <section className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-slate-200 text-sm">
              ¿Cómo estamos perdiendo la pelota? (Pérdidas de {ownTeam?.short_name || 'Nuestro Equipo'})
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded bg-amber-950/50 text-amber-300 border border-amber-500/40 font-bold">
              Total: {ownTurnovers.total} {ownTurnovers.total === 1 ? 'pérdida' : 'pérdidas'}
            </span>
            {ownTurnovers.linkedRecoveriesCount > 0 && (
              <span className="px-2 py-1 rounded bg-rose-950/50 text-rose-300 border border-rose-500/40 font-semibold text-[11px]">
                {ownTurnovers.linkedRecoveriesCount} recuperadas por el rival
              </span>
            )}
          </div>
        </div>

        {ownTurnovers.total > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Desglose por Motivo */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-2">
              <span className="text-[11px] font-extrabold text-sky-400 uppercase tracking-wider">
                Por Motivo
              </span>
              <div className="flex flex-col gap-1.5">
                {Object.entries(ownTurnovers.byReason)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([code, item]) => {
                    const pct = Math.round((item.count / ownTurnovers.total) * 100);
                    return (
                      <div key={code} className="flex flex-col gap-0.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300 font-medium">{item.label}</span>
                          <span className="font-mono text-white font-bold">
                            {item.count} de {ownTurnovers.total} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Desglose por Jugador */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-2">
              <span className="text-[11px] font-extrabold text-sky-400 uppercase tracking-wider">
                Por Jugador
              </span>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                {ownTurnovers.byPlayer.map((p) => (
                  <div
                    key={p.rosterId}
                    className="p-1.5 rounded bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                  >
                    <span className="text-slate-200 truncate">
                      {p.shirtNumber !== undefined ? `#${p.shirtNumber} ` : ''}
                      {p.playerName}
                    </span>
                    <span className="font-mono font-bold text-amber-400 shrink-0 ml-2">
                      {p.count} {p.count === 1 ? 'pérdida' : 'pérdidas'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Desglose por Sector de Cancha */}
            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-2">
              <span className="text-[11px] font-extrabold text-sky-400 uppercase tracking-wider">
                Por Sector de Cancha
              </span>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                {Object.values(ownTurnovers.byZone)
                  .sort((a, b) => b.count - a.count)
                  .map((z) => (
                    <div
                      key={z.code}
                      className="p-1.5 rounded bg-slate-950 border border-slate-800 text-xs flex items-center justify-between"
                    >
                      <span className="text-slate-300 truncate">{z.name}</span>
                      <span className="font-mono font-bold text-sky-300 shrink-0 ml-2">
                        {z.count}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-emerald-400 text-xs bg-emerald-950/20 p-3 rounded-lg border border-emerald-800/40 text-center font-semibold">
            Excelente control de posesión: no se registran pérdidas de balón de {ownTeam?.short_name || 'nuestro equipo'} en esta ventana.
          </div>
        )}

        {/* Lista ordenada de pérdidas en la ventana */}
        {ownTurnovers.events.length > 0 && (
          <div className="mt-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
              Registro cronológico de pérdidas en la ventana:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
              {ownTurnovers.events.map((ev) => {
                const victim = ev.participants.find((p) => p.role === 'TURNOVER_BY');
                const roster = victim ? rosters.find((r) => r.id === victim.roster_id) : undefined;
                const reason = ev.turnover_detail?.reason || 'OTHER';
                const reasonLabel = TURNOVER_REASON_NAMES_ES[reason] || reason;
                const zone = ev.turnover_detail?.court_zone || 'UNKNOWN';
                const zoneName = SPANISH_ZONE_NAMES[zone] || zone;

                return (
                  <div
                    key={ev.id}
                    className="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] flex items-center justify-between text-slate-300"
                  >
                    <div className="truncate">
                      <span className="font-mono font-bold text-sky-400 mr-1.5">
                        {formatClockMs(ev.clock_ms)}
                      </span>
                      <span className="font-semibold text-white">
                        {roster?.display_name_snapshot || 'Colectivo'}
                      </span>
                      <div className="text-[10px] text-amber-400 truncate">
                        {reasonLabel} · {zoneName}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* 6. MAPA DE TIROS DEL RIVAL Y NUESTRO EQUIPO (¿DESDE DÓNDE NOS ESTÁ CONVIRTIENDO?) */}
      <section className="p-3 bg-slate-950 rounded-xl border border-slate-800 shadow-md flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-rose-400" />
            <span className="font-bold text-slate-200 text-sm">
              Mapa de Lanzamientos: Origen en Cancha y Destino al Arco
            </span>
          </div>

          {/* Toggle entre Rival y Nuestro Equipo */}
          <div className="inline-flex rounded-lg p-0.5 bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => {
                setShotTeamToggle('RIVAL');
                setSelectedCourtCode(null);
                setSelectedGoalCode(null);
              }}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                shotTeamToggle === 'RIVAL'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🎯 Tiros del Rival ({rivalTeam?.short_name || 'Rival'})
            </button>
            <button
              type="button"
              onClick={() => {
                setShotTeamToggle('OWN');
                setSelectedCourtCode(null);
                setSelectedGoalCode(null);
              }}
              className={`px-3 py-1 rounded-md font-bold text-xs transition-all ${
                shotTeamToggle === 'OWN'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🛡️ Tiros de Nuestro Equipo ({ownTeam?.short_name || 'Propio'})
            </button>
          </div>
        </div>

        {/* Resumen numérico de lanzamientos en la ventana */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
          <div className="p-2 bg-slate-900 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-400 block mb-0.5">Total Tiros</span>
            <span className="font-extrabold font-mono text-base text-white">
              {currentShotMap.totalShots}
            </span>
          </div>
          <div className="p-2 bg-emerald-950/40 rounded-lg border border-emerald-800/50">
            <span className="text-[10px] text-emerald-400 block mb-0.5">Goles</span>
            <span className="font-extrabold font-mono text-base text-emerald-300">
              {currentShotMap.goals}
            </span>
          </div>
          <div className="p-2 bg-sky-950/40 rounded-lg border border-sky-800/50">
            <span className="text-[10px] text-sky-400 block mb-0.5">Atajadas</span>
            <span className="font-extrabold font-mono text-base text-sky-300">
              {currentShotMap.saved}
            </span>
          </div>
          <div className="p-2 bg-amber-950/40 rounded-lg border border-amber-800/50">
            <span className="text-[10px] text-amber-400 block mb-0.5">Postes</span>
            <span className="font-extrabold font-mono text-base text-amber-300">
              {currentShotMap.post}
            </span>
          </div>
          <div className="p-2 bg-rose-950/40 rounded-lg border border-rose-800/50">
            <span className="text-[10px] text-rose-400 block mb-0.5">Desviados</span>
            <span className="font-extrabold font-mono text-base text-rose-300">
              {currentShotMap.missed}
            </span>
          </div>
          <div className="p-2 bg-purple-950/40 rounded-lg border border-purple-800/50">
            <span className="text-[10px] text-purple-400 block mb-0.5">Efectividad</span>
            <span className="font-extrabold font-mono text-base text-purple-300">
              {currentShotMap.goals} de {currentShotMap.totalShots}{' '}
              {currentShotMap.effectivenessPct !== null ? `(${currentShotMap.effectivenessPct}%)` : '—'}
            </span>
          </div>
        </div>

        {/* Visualización Gráfica: Cancha de Handball y Arco 3x3 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Cancha Táctica de Origen */}
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-2">
              <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-sky-400" />
                Origen en Cancha (Toca un sector para filtrar)
              </span>
              {selectedCourtCode && (
                <button
                  type="button"
                  onClick={() => setSelectedCourtCode(null)}
                  className="text-[10px] text-sky-400 hover:underline font-semibold"
                >
                  Limpiar selección
                </button>
              )}
            </div>

            <div className="w-full max-w-[420px] aspect-[500/540] relative bg-[#172554] rounded-lg border-2 border-slate-700 overflow-hidden shadow-inner">
              <svg viewBox="0 0 500 540" className="w-full h-full">
                {/* Arco superior decorativo */}
                <rect x="200" y="8" width="100" height="24" fill="#0f172a" stroke="#cbd5e1" strokeWidth="2.5" />
                <line x1="200" y1="32" x2="300" y2="32" stroke="#ffffff" strokeWidth="3" />

                {/* Área de 6m y línea discontinua de 9m de fondo */}
                <path
                  d="M 20 135 C 100 190, 400 190, 480 135 L 480 32 L 20 32 Z"
                  fill="#1e3a8a"
                  fillOpacity="0.45"
                />
                <path
                  d="M 20 240 C 130 330, 370 330, 480 240"
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth="2"
                  strokeDasharray="6,6"
                />

                {/* Sectores tácticos interactivos */}
                {COURT_SECTORS.map((sec) => {
                  const stat = currentShotMap.byZone[sec.code];
                  const attempts = stat?.attempts || 0;
                  const goals = stat?.goals || 0;
                  const isSelected = selectedCourtCode === sec.code;

                  let fillColor = '#0f172a';
                  let strokeColor = '#38bdf8';
                  let strokeWidth = '1';

                  if (isSelected) {
                    fillColor = '#f43f5e';
                    strokeColor = '#ffffff';
                    strokeWidth = '3';
                  } else if (goals > 0) {
                    fillColor = '#881337'; // Granate intenso para sectores con gol
                    strokeColor = '#f43f5e';
                    strokeWidth = '2';
                  } else if (attempts > 0) {
                    fillColor = '#1e293b';
                    strokeColor = '#38bdf8';
                    strokeWidth = '1.5';
                  }

                  const isPath = !!sec.pathD;

                  return (
                    <g
                      key={sec.code}
                      onClick={() => {
                        setSelectedCourtCode(isSelected ? null : sec.code);
                        setSelectedGoalCode(null);
                      }}
                      className="cursor-pointer group"
                      role="button"
                      tabIndex={0}
                    >
                      {isPath ? (
                        <path
                          d={sec.pathD}
                          fill={fillColor}
                          fillOpacity={isSelected ? 0.9 : 0.65}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                      ) : (
                        <rect
                          x={sec.rect!.x}
                          y={sec.rect!.y}
                          width={sec.rect!.width}
                          height={sec.rect!.height}
                          rx={sec.rect!.rx || 6}
                          fill={fillColor}
                          fillOpacity={isSelected ? 0.9 : 0.65}
                          stroke={strokeColor}
                          strokeWidth={strokeWidth}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                      )}

                      {/* Etiqueta del sector */}
                      <text
                        x={sec.center.x}
                        y={sec.center.y - 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {sec.shortLabel}
                      </text>
                      <text
                        x={sec.center.x}
                        y={sec.center.y + 10}
                        textAnchor="middle"
                        fill={attempts > 0 ? '#fecdd3' : '#94a3b8'}
                        fontSize="10"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {goals}/{attempts}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Arco 3x3 de Destino */}
          <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex flex-col items-center">
            <div className="w-full flex items-center justify-between mb-2">
              <span className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-amber-400" />
                Destino en Arco 3×3 (Toca un casillero)
              </span>
              {selectedGoalCode && (
                <button
                  type="button"
                  onClick={() => setSelectedGoalCode(null)}
                  className="text-[10px] text-sky-400 hover:underline font-semibold"
                >
                  Limpiar selección
                </button>
              )}
            </div>

            <div className="w-full max-w-[420px] aspect-[500/540] relative bg-[#090d16] rounded-lg border-2 border-slate-700 overflow-hidden shadow-inner">
              <svg viewBox="0 0 500 540" className="w-full h-full">
                {/* Cuadrícula 3x3 del arco */}
                {GOAL_GRID_SECTORS.map((sec) => {
                  const stat = currentShotMap.byTarget[sec.code];
                  const attempts = stat?.attempts || 0;
                  const goals = stat?.goals || 0;
                  const isSelected = selectedGoalCode === sec.code;

                  let fillColor = '#0f172a';
                  let strokeColor = '#475569';
                  let strokeWidth = '1.5';

                  if (isSelected) {
                    fillColor = '#f43f5e';
                    strokeColor = '#ffffff';
                    strokeWidth = '3';
                  } else if (goals > 0) {
                    fillColor = '#881337';
                    strokeColor = '#f43f5e';
                    strokeWidth = '2';
                  } else if (attempts > 0) {
                    fillColor = '#1e293b';
                    strokeColor = '#38bdf8';
                  }

                  return (
                    <g
                      key={sec.code}
                      onClick={() => {
                        setSelectedGoalCode(isSelected ? null : sec.code);
                        setSelectedCourtCode(null);
                      }}
                      className="cursor-pointer group"
                      role="button"
                      tabIndex={0}
                    >
                      <rect
                        x={sec.rect.x}
                        y={sec.rect.y}
                        width={sec.rect.width}
                        height={sec.rect.height}
                        rx={sec.rect.rx || 4}
                        fill={fillColor}
                        fillOpacity={isSelected ? 0.9 : 0.75}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        className="transition-all duration-150 group-hover:brightness-125"
                      />
                      <text
                        x={sec.center.x}
                        y={sec.center.y - 4}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="11"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {sec.shortLabel}
                      </text>
                      <text
                        x={sec.center.x}
                        y={sec.center.y + 11}
                        textAnchor="middle"
                        fill={attempts > 0 ? '#fecdd3' : '#94a3b8'}
                        fontSize="10"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {goals}/{attempts}
                      </text>
                    </g>
                  );
                })}

                {/* Postes y Fueras */}
                {GOAL_POSTS_AND_OUT_SECTORS.map((sec) => {
                  const stat = currentShotMap.byTarget[sec.code];
                  const attempts = stat?.attempts || 0;
                  const isSelected = selectedGoalCode === sec.code;

                  let fillColor = '#1e293b';
                  let strokeColor = '#475569';
                  let strokeWidth = '1';

                  if (isSelected) {
                    fillColor = '#f43f5e';
                    strokeColor = '#ffffff';
                    strokeWidth = '2.5';
                  } else if (attempts > 0) {
                    fillColor = '#7c2d12';
                    strokeColor = '#fb923c';
                  }

                  return (
                    <g
                      key={sec.code}
                      onClick={() => {
                        setSelectedGoalCode(isSelected ? null : sec.code);
                        setSelectedCourtCode(null);
                      }}
                      className="cursor-pointer group"
                      role="button"
                      tabIndex={0}
                    >
                      <rect
                        x={sec.rect.x}
                        y={sec.rect.y}
                        width={sec.rect.width}
                        height={sec.rect.height}
                        rx={sec.rect.rx || 3}
                        fill={fillColor}
                        fillOpacity={isSelected ? 0.9 : 0.7}
                        stroke={strokeColor}
                        strokeWidth={strokeWidth}
                        className="transition-all duration-150 group-hover:brightness-125"
                      />
                      <text
                        x={sec.center.x}
                        y={sec.center.y + 3}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="9"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {sec.shortLabel} ({attempts})
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Inspector de Sector Seleccionado */}
        {(selectedCourtCode || selectedGoalCode) && (
          <div className="p-3 bg-slate-900 rounded-xl border border-sky-600/40 flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <span className="font-bold text-white text-xs">
                {selectedCourtCode
                  ? `Lanzamientos desde ${activeCourtSector?.name || selectedCourtCode} (${activeCourtStat?.goals || 0} goles / ${activeCourtStat?.attempts || 0} tiros)`
                  : `Lanzamientos hacia ${activeGoalSector?.name || selectedGoalCode}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCourtCode(null);
                  setSelectedGoalCode(null);
                }}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Cerrar inspector ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {(selectedCourtCode ? courtSectorShots : goalSectorShots).map((ev) => {
                const shooter = ev.participants.find((p) => p.role === 'SHOOTER');
                const roster = shooter ? rosters.find((r) => r.id === shooter.roster_id) : undefined;
                const res = ev.shot_detail?.result_code || 'MISSED';

                return (
                  <div
                    key={ev.id}
                    className="p-2 rounded bg-slate-950 border border-slate-800 text-[11px] flex items-center justify-between"
                  >
                    <div>
                      <span className="font-mono text-sky-400 font-bold mr-1.5">
                        {formatClockMs(ev.clock_ms)}
                      </span>
                      <span className="font-semibold text-white">
                        {roster?.display_name_snapshot || 'Jugador'}
                      </span>
                    </div>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        res === 'GOAL'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-600'
                          : res === 'SAVED'
                          ? 'bg-sky-950 text-sky-300 border border-sky-600'
                          : 'bg-rose-950 text-rose-300 border border-rose-600'
                      }`}
                    >
                      {res === 'GOAL'
                        ? 'GOL'
                        : res === 'SAVED'
                        ? 'ATAJADA'
                        : res === 'POST'
                        ? 'POSTE'
                        : res === 'BLOCKED'
                        ? 'BLOQUEADO'
                        : 'DESVIADO'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
