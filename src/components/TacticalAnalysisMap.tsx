import React, { useState, useMemo } from 'react';
import type { Match, MatchEvent, MatchPeriod, MatchRoster, Team } from '../domain/schemas';
import {
  COURT_SECTORS,
  GOAL_GRID_SECTORS,
  GOAL_POSTS_AND_OUT_SECTORS,
  SPANISH_ZONE_NAMES,
} from '../constants/tacticalGeometry';
import { Target, AlertCircle, Filter, Eye } from 'lucide-react';

export interface TacticalAnalysisMapProps {
  currentMatch: Match | undefined;
  periods: MatchPeriod[];
  teams: Team[];
  rosters: MatchRoster[];
  events: MatchEvent[];
}

type MapMode = 'SHOTS' | 'TURNOVERS';

interface SectorStats {
  attempts: number;
  goals: number;
  saved: number;
  missed: number;
  post: number;
  blocked: number;
  effectivenessPct: number | null;
  events: MatchEvent[];
}

interface TurnoverSectorStats {
  count: number;
  byReason: Record<string, number>;
  events: MatchEvent[];
}

export const TacticalAnalysisMap: React.FC<TacticalAnalysisMapProps> = ({
  currentMatch,
  periods,
  teams,
  rosters,
  events,
}) => {
  const [mode, setMode] = useState<MapMode>('SHOTS');
  const [teamFilter, setTeamFilter] = useState<string>('ALL');
  const [periodFilter, setPeriodFilter] = useState<string>('ALL');
  const [playerFilter, setPlayerFilter] = useState<string>('ALL');
  const [resultFilter, setResultFilter] = useState<string>('ALL');

  // Selección activa para inspector detallado
  const [selectedCourtCode, setSelectedCourtCode] = useState<string | null>(null);
  const [selectedGoalCode, setSelectedGoalCode] = useState<string | null>(null);

  const homeTeam = currentMatch ? teams.find((t) => t.id === currentMatch.home_team_id) : undefined;
  const awayTeam = currentMatch ? teams.find((t) => t.id === currentMatch.away_team_id) : undefined;

  // Filtrado de eventos activos
  const activeEvents = useMemo(() => {
    if (!currentMatch) return [];
    return events.filter((ev) => ev.status === 'active' && ev.match_id === currentMatch.id);
  }, [events, currentMatch?.id]);

  // Eventos de tiro filtrados
  const filteredShots = useMemo(() => {
    return activeEvents.filter((ev) => {
      if (ev.type !== 'SHOT') return false;
      if (teamFilter !== 'ALL' && ev.match_team_id !== teamFilter) return false;
      if (periodFilter !== 'ALL' && ev.period_id !== periodFilter) return false;

      // Filtro de jugador lanzador
      if (playerFilter !== 'ALL') {
        const shooter = ev.participants.find((p) => p.role === 'SHOOTER');
        if (!shooter || shooter.roster_id !== playerFilter) return false;
      }

      // Filtro de resultado
      if (resultFilter !== 'ALL') {
        const res = ev.shot_detail?.result_code;
        if (res !== resultFilter) return false;
      }

      return true;
    });
  }, [activeEvents, teamFilter, periodFilter, playerFilter, resultFilter]);

  // Eventos de pérdida filtrados
  const filteredTurnovers = useMemo(() => {
    return activeEvents.filter((ev) => {
      if (ev.type !== 'TURNOVER') return false;
      if (teamFilter !== 'ALL' && ev.match_team_id !== teamFilter) return false;
      if (periodFilter !== 'ALL' && ev.period_id !== periodFilter) return false;

      if (playerFilter !== 'ALL') {
        const victim = ev.participants.find((p) => p.role === 'TURNOVER_BY');
        if (!victim || victim.roster_id !== playerFilter) return false;
      }

      return true;
    });
  }, [activeEvents, teamFilter, periodFilter, playerFilter]);

  // Estadísticas agregadas por sector de cancha (Origen)
  const courtStats = useMemo(() => {
    const stats: Record<string, SectorStats> = {};
    const unspecifiedEvents: MatchEvent[] = [];

    // Inicializar todos los sectores conocidos en 0
    for (const sec of COURT_SECTORS) {
      stats[sec.code] = {
        attempts: 0,
        goals: 0,
        saved: 0,
        missed: 0,
        post: 0,
        blocked: 0,
        effectivenessPct: null,
        events: [],
      };
    }

    for (const ev of filteredShots) {
      const code = ev.shot_detail?.origin_zone_code;
      if (!code || code === 'UNKNOWN') {
        unspecifiedEvents.push(ev);
        continue;
      }
      const s = stats[code];
      if (!s) {
        unspecifiedEvents.push(ev);
        continue;
      }

      s.attempts++;
      s.events.push(ev);

      const res = ev.shot_detail?.result_code;
      if (res === 'GOAL') s.goals++;
      else if (res === 'SAVED') s.saved++;
      else if (res === 'MISSED') s.missed++;
      else if (res === 'POST') s.post++;
      else if (res === 'BLOCKED') s.blocked++;
    }

    // Calcular porcentajes
    for (const code of Object.keys(stats)) {
      const s = stats[code];
      if (s) {
        s.effectivenessPct = s.attempts > 0 ? Math.round((s.goals / s.attempts) * 1000) / 10 : null;
      }
    }

    return {
      bySector: stats,
      unspecified: {
        attempts: unspecifiedEvents.length,
        goals: unspecifiedEvents.filter((e) => e.shot_detail?.result_code === 'GOAL').length,
        events: unspecifiedEvents,
      },
    };
  }, [filteredShots]);

  // Estadísticas agregadas por sector de arco (Destino)
  const goalStats = useMemo(() => {
    const stats: Record<string, SectorStats> = {};
    const unspecifiedEvents: MatchEvent[] = [];

    const allGoalCodes = [...GOAL_GRID_SECTORS, ...GOAL_POSTS_AND_OUT_SECTORS];
    for (const sec of allGoalCodes) {
      stats[sec.code] = {
        attempts: 0,
        goals: 0,
        saved: 0,
        missed: 0,
        post: 0,
        blocked: 0,
        effectivenessPct: null,
        events: [],
      };
    }

    for (const ev of filteredShots) {
      const code = ev.shot_detail?.target_zone_code;
      if (!code || code === 'UNKNOWN') {
        unspecifiedEvents.push(ev);
        continue;
      }
      const s = stats[code];
      if (!s) {
        unspecifiedEvents.push(ev);
        continue;
      }

      s.attempts++;
      s.events.push(ev);

      const res = ev.shot_detail?.result_code;
      if (res === 'GOAL') s.goals++;
      else if (res === 'SAVED') s.saved++;
      else if (res === 'MISSED') s.missed++;
      else if (res === 'POST') s.post++;
      else if (res === 'BLOCKED') s.blocked++;
    }

    for (const code of Object.keys(stats)) {
      const s = stats[code];
      if (s) {
        s.effectivenessPct = s.attempts > 0 ? Math.round((s.goals / s.attempts) * 1000) / 10 : null;
      }
    }

    return {
      bySector: stats,
      unspecified: {
        attempts: unspecifiedEvents.length,
        goals: unspecifiedEvents.filter((e) => e.shot_detail?.result_code === 'GOAL').length,
        events: unspecifiedEvents,
      },
    };
  }, [filteredShots]);

  // Estadísticas de pérdidas por zona
  const turnoverStats = useMemo(() => {
    const stats: Record<string, TurnoverSectorStats> = {};
    const unspecifiedEvents: MatchEvent[] = [];

    for (const sec of COURT_SECTORS) {
      stats[sec.code] = { count: 0, byReason: {}, events: [] };
    }

    for (const ev of filteredTurnovers) {
      const code = ev.turnover_detail?.court_zone;
      if (!code || code === 'UNKNOWN') {
        unspecifiedEvents.push(ev);
        continue;
      }
      const s = stats[code];
      if (!s) {
        unspecifiedEvents.push(ev);
        continue;
      }

      s.count++;
      s.events.push(ev);

      const reason = ev.turnover_detail?.reason || 'OTHER';
      s.byReason[reason] = (s.byReason[reason] || 0) + 1;
    }

    return {
      bySector: stats,
      unspecified: {
        count: unspecifiedEvents.length,
        events: unspecifiedEvents,
      },
    };
  }, [filteredTurnovers]);

  const DEFAULT_SECTOR_STATS: SectorStats = {
    attempts: 0,
    goals: 0,
    saved: 0,
    missed: 0,
    post: 0,
    blocked: 0,
    effectivenessPct: null,
    events: [],
  };

  const DEFAULT_TURNOVER_STATS: TurnoverSectorStats = {
    count: 0,
    byReason: {},
    events: [],
  };

  const getCourtSectorStat = (code: string): SectorStats => courtStats.bySector[code] ?? DEFAULT_SECTOR_STATS;
  const getGoalSectorStat = (code: string): SectorStats => goalStats.bySector[code] ?? DEFAULT_SECTOR_STATS;
  const getTurnoverSectorStat = (code: string): TurnoverSectorStats => turnoverStats.bySector[code] ?? DEFAULT_TURNOVER_STATS;

  // Formato de tiempo MM:SS
  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const secs = (totalSecs % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  // Colorimetría accesible para eficacia (no depende sólo del color; va acompañada de texto explícito y bordes)
  const getEfficiencyStyle = (attempts: number, pct: number | null, isSelected: boolean) => {
    if (attempts === 0) {
      return {
        fill: isSelected ? '#334155' : '#0f172a',
        fillOpacity: 0.8,
        stroke: isSelected ? '#38bdf8' : '#334155',
        strokeWidth: isSelected ? '3' : '1.5',
        badgeBg: 'bg-slate-800 text-slate-400 border-slate-700',
        label: 'Sin tiros',
      };
    }
    if (pct === null) {
      return {
        fill: isSelected ? '#334155' : '#0f172a',
        fillOpacity: 0.8,
        stroke: isSelected ? '#38bdf8' : '#475569',
        strokeWidth: isSelected ? '3' : '1.5',
        badgeBg: 'bg-slate-800 text-slate-300 border-slate-600',
        label: '0%',
      };
    }
    if (pct >= 66.7) {
      return {
        fill: isSelected ? '#047857' : '#065f46',
        fillOpacity: 0.9,
        stroke: isSelected ? '#ffffff' : '#34d399',
        strokeWidth: isSelected ? '3.5' : '2',
        badgeBg: 'bg-emerald-950 text-emerald-300 border-emerald-500 font-bold',
        label: `${pct}%`,
      };
    }
    if (pct >= 40.0) {
      return {
        fill: isSelected ? '#b45309' : '#854d0e',
        fillOpacity: 0.9,
        stroke: isSelected ? '#ffffff' : '#fbbf24',
        strokeWidth: isSelected ? '3.5' : '2',
        badgeBg: 'bg-amber-950 text-amber-300 border-amber-500 font-bold',
        label: `${pct}%`,
      };
    }
    return {
      fill: isSelected ? '#b91c1c' : '#881337',
      fillOpacity: 0.9,
      stroke: isSelected ? '#ffffff' : '#f43f5e',
      strokeWidth: isSelected ? '3.5' : '2',
      badgeBg: 'bg-rose-950 text-rose-300 border-rose-500 font-bold',
      label: `${pct}%`,
    };
  };

  // Colorimetría para pérdidas (Turnovers)
  const getTurnoverStyle = (count: number, isSelected: boolean) => {
    if (count === 0) {
      return {
        fill: isSelected ? '#334155' : '#0f172a',
        fillOpacity: 0.8,
        stroke: isSelected ? '#38bdf8' : '#334155',
        strokeWidth: isSelected ? '3' : '1.5',
        badgeBg: 'bg-slate-800 text-slate-400 border-slate-700',
      };
    }
    if (count >= 4) {
      return {
        fill: isSelected ? '#be123c' : '#881337',
        fillOpacity: 0.9,
        stroke: isSelected ? '#ffffff' : '#f43f5e',
        strokeWidth: isSelected ? '3.5' : '2',
        badgeBg: 'bg-rose-950 text-rose-300 border-rose-500 font-bold',
      };
    }
    return {
      fill: isSelected ? '#c2410c' : '#7c2d12',
      fillOpacity: 0.85,
      stroke: isSelected ? '#ffffff' : '#fb923c',
      strokeWidth: isSelected ? '3' : '1.5',
      badgeBg: 'bg-orange-950 text-orange-300 border-orange-500 font-bold',
    };
  };

  const TURNOVER_REASON_NAMES: Record<string, string> = {
    BAD_PASS: 'Mal Pase',
    CATCH_ERROR: 'Mala Recepción',
    TRAVELING: 'Pasos',
    DOUBLE_DRIBBLE: 'Doble Dribling',
    OFFENSIVE_FOUL: 'Falta en Ataque',
    PASSIVE_PLAY: 'Juego Pasivo',
    LINE_VIOLATION: 'Infracción de Área (Línea)',
    OTHER: 'Otra / No especificada',
  };

  const SHOT_RESULT_NAMES: Record<string, string> = {
    GOAL: 'Gol',
    SAVED: 'Atajada',
    MISSED: 'Desviado',
    POST: 'Poste',
    BLOCKED: 'Bloqueado',
  };

  // Sector de cancha actualmente seleccionado para inspección
  const activeCourtSector = COURT_SECTORS.find((s) => s.code === selectedCourtCode);
  const activeCourtStats = selectedCourtCode ? courtStats.bySector[selectedCourtCode] : null;
  const activeCourtTurnovers = selectedCourtCode ? turnoverStats.bySector[selectedCourtCode] : null;

  // Sector de arco actualmente seleccionado para inspección
  const activeGoalSector = [...GOAL_GRID_SECTORS, ...GOAL_POSTS_AND_OUT_SECTORS].find((s) => s.code === selectedGoalCode);
  const activeGoalStats = selectedGoalCode ? goalStats.bySector[selectedGoalCode] : null;

  return (
    <div className="flex flex-col gap-4 text-xs select-none">
      {/* 1. BARRA SUPERIOR DE SELECTOR DE MODO Y FILTROS */}
      <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col gap-3 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-200 text-sm flex items-center gap-1.5">
              <Target className="w-4 h-4 text-sky-400" /> Mapas Tácticos de Balonmano
            </span>
            <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              Misma geometría canónica que En Vivo
            </span>
          </div>

          {/* Selector de Modo: Tiros vs Pérdidas */}
          <div className="flex items-center p-0.5 bg-slate-900 rounded-lg border border-slate-800 text-[11px]">
            <button
              type="button"
              onClick={() => {
                setMode('SHOTS');
                setSelectedCourtCode(null);
                setSelectedGoalCode(null);
              }}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                mode === 'SHOTS'
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Lanzamientos ({filteredShots.length})
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('TURNOVERS');
                setSelectedCourtCode(null);
                setSelectedGoalCode(null);
              }}
              className={`px-3 py-1 rounded-md font-semibold transition-all ${
                mode === 'TURNOVERS'
                  ? 'bg-rose-600 text-white shadow'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Pérdidas de Balón ({filteredTurnovers.length})
            </button>
          </div>
        </div>

        {/* Barra de Filtros */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {/* Filtro Equipo */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-sky-400" /> Equipo:
            </label>
            <select
              value={teamFilter}
              onChange={(e) => setTeamFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-750 rounded text-slate-200 text-xs"
            >
              <option value="ALL">Ambos equipos</option>
              {homeTeam && <option value={homeTeam.id}>{currentMatch?.home_team_name_snapshot || homeTeam.name} (Local)</option>}
              {awayTeam && <option value={awayTeam.id}>{currentMatch?.away_team_name_snapshot || awayTeam.name} (Rival)</option>}
            </select>
          </div>

          {/* Filtro Período */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">Período:</label>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-750 rounded text-slate-200 text-xs"
            >
              <option value="ALL">Todo el partido</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.number}º Período ({p.kind})
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Jugador */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">Jugador:</label>
            <select
              value={playerFilter}
              onChange={(e) => setPlayerFilter(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-750 rounded text-slate-200 text-xs"
            >
              <option value="ALL">Todos los jugadores</option>
              {rosters.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.shirt_number} {r.display_name_snapshot}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro Resultado (solo modo SHOTS) */}
          <div>
            <label className="block text-[10px] font-bold text-slate-400 mb-1">
              {mode === 'SHOTS' ? 'Resultado:' : 'Filtro de Pérdida:'}
            </label>
            {mode === 'SHOTS' ? (
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-750 rounded text-slate-200 text-xs"
              >
                <option value="ALL">Todos los resultados</option>
                <option value="GOAL">Solo Goles</option>
                <option value="SAVED">Solo Atajadas</option>
                <option value="MISSED">Solo Desviados</option>
                <option value="POST">Solo Postes</option>
                <option value="BLOCKED">Solo Bloqueados</option>
              </select>
            ) : (
              <div className="px-2 py-1.5 bg-slate-900/60 border border-slate-800 rounded text-slate-400 text-xs italic">
                Mostrando todas las pérdidas
              </div>
            )}
          </div>
        </div>

        {/* LEYENDA Y DEFINICIÓN DE VALORES */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-900/70 rounded-lg border border-slate-850 text-[10px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-300">Definición de valores:</span>
            <span>«Goles / Tiros (Eficacia %)»</span>
          </div>
          {mode === 'SHOTS' ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
                <span>Alta (&gt;66%)</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-white" />
                <span>Media (40-66%)</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white" />
                <span>Baja (&lt;40%)</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600" />
                <span>Sin tiros (0/0)</span>
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border border-white" />
                <span>Alta concentración (&ge;4 pérdidas)</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500 border border-white" />
                <span>Frecuente (1-3)</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-600" />
                <span>0 pérdidas</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 2. CUERPO PRINCIPAL: MAPAS TÁCTICOS Y DETALLE SELECCIONADO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* COLUMNA MAPA: MEDIA CANCHA + ARCO (lg:col-span-8) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="bg-slate-950 rounded-2xl border-2 border-slate-800 p-2 sm:p-4 shadow-xl flex flex-col items-center">
            {/* Orientación */}
            <div className="w-full flex items-center justify-between text-[11px] text-slate-400 font-semibold px-2 pb-1.5 border-b border-slate-850">
              <span className="font-bold text-slate-300">◄ BANDA IZQUIERDA</span>
              <span className="text-amber-400 font-bold tracking-wide">
                Perspectiva del lanzador (de frente al arco)
              </span>
              <span className="font-bold text-slate-300">BANDA DERECHA ►</span>
            </div>

            {/* SVG EXACTAMENTE REUTILIZADO */}
            <svg
              viewBox="0 0 500 600"
              className="w-full h-auto max-w-[500px] touch-manipulation my-1"
              style={{ maxHeight: '72vh' }}
            >
              <defs>
                <pattern id="analysisGoalStripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="10" height="20" fill="#ef4444" />
                  <rect x="10" width="10" height="20" fill="#ffffff" />
                </pattern>
                <pattern id="analysisNetPattern" width="16" height="16" patternUnits="userSpaceOnUse">
                  <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#475569" strokeWidth="1" strokeOpacity="0.45" />
                </pattern>
              </defs>

              {/* SECCIÓN ARCO (Solo visible en modo SHOTS) */}
              {mode === 'SHOTS' && (
                <g>
                  {/* Fuera Alto */}
                  {(() => {
                    const sec = GOAL_POSTS_AND_OUT_SECTORS.find((s) => s.code === 'OUT_TOP')!;
                    const st = getGoalSectorStat('OUT_TOP');
                    const isSel = selectedGoalCode === 'OUT_TOP';
                    return (
                      <g
                        key="OUT_TOP"
                        onClick={() => {
                          setSelectedGoalCode(isSel ? null : 'OUT_TOP');
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
                          rx={sec.rect.rx}
                          fill={isSel ? '#f43f5e' : st.attempts > 0 ? '#881337' : '#1e293b'}
                          stroke={isSel ? '#ffffff' : st.attempts > 0 ? '#f43f5e' : '#475569'}
                          strokeWidth={isSel ? '2.5' : '1'}
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
                          FUERA ALTO ({st.attempts})
                        </text>
                      </g>
                    );
                  })()}

                  {/* Fuera Izquierda */}
                  {(() => {
                    const sec = GOAL_POSTS_AND_OUT_SECTORS.find((s) => s.code === 'OUT_L')!;
                    const st = getGoalSectorStat('OUT_L');
                    const isSel = selectedGoalCode === 'OUT_L';
                    return (
                      <g
                        key="OUT_L"
                        onClick={() => {
                          setSelectedGoalCode(isSel ? null : 'OUT_L');
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
                          rx={sec.rect.rx}
                          fill={isSel ? '#f43f5e' : st.attempts > 0 ? '#881337' : '#0f172a'}
                          stroke={isSel ? '#ffffff' : st.attempts > 0 ? '#f43f5e' : '#334155'}
                          strokeWidth={isSel ? '2.5' : '1'}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                        <text
                          x={sec.center.x}
                          y={sec.center.y - 2}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="9.5"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          FUERA IZQ
                        </text>
                        <text
                          x={sec.center.x}
                          y={sec.center.y + 12}
                          textAnchor="middle"
                          fill={st.attempts > 0 ? '#fecdd3' : '#94a3b8'}
                          fontSize="9"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          {st.attempts} tiros
                        </text>
                      </g>
                    );
                  })()}

                  {/* Fuera Derecha */}
                  {(() => {
                    const sec = GOAL_POSTS_AND_OUT_SECTORS.find((s) => s.code === 'OUT_R')!;
                    const st = getGoalSectorStat('OUT_R');
                    const isSel = selectedGoalCode === 'OUT_R';
                    return (
                      <g
                        key="OUT_R"
                        onClick={() => {
                          setSelectedGoalCode(isSel ? null : 'OUT_R');
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
                          rx={sec.rect.rx}
                          fill={isSel ? '#f43f5e' : st.attempts > 0 ? '#881337' : '#0f172a'}
                          stroke={isSel ? '#ffffff' : st.attempts > 0 ? '#f43f5e' : '#334155'}
                          strokeWidth={isSel ? '2.5' : '1'}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                        <text
                          x={sec.center.x}
                          y={sec.center.y - 2}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="9.5"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          FUERA DER
                        </text>
                        <text
                          x={sec.center.x}
                          y={sec.center.y + 12}
                          textAnchor="middle"
                          fill={st.attempts > 0 ? '#fecdd3' : '#94a3b8'}
                          fontSize="9"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          {st.attempts} tiros
                        </text>
                      </g>
                    );
                  })()}

                  {/* Travesaño (BAR) */}
                  {(() => {
                    const sec = GOAL_POSTS_AND_OUT_SECTORS.find((s) => s.code === 'BAR')!;
                    const st = getGoalSectorStat('BAR');
                    const isSel = selectedGoalCode === 'BAR';
                    return (
                      <g
                        key="BAR"
                        onClick={() => {
                          setSelectedGoalCode(isSel ? null : 'BAR');
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
                          rx={sec.rect.rx}
                          fill={isSel ? '#f43f5e' : st.attempts > 0 ? '#b91c1c' : 'url(#analysisGoalStripes)'}
                          stroke={isSel ? '#ffffff' : '#ef4444'}
                          strokeWidth={isSel ? '3' : '1.5'}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                        <text
                          x={sec.center.x}
                          y={sec.center.y + 3}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="8.5"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          TRAVESAÑO {st.attempts > 0 ? `(${st.attempts})` : ''}
                        </text>
                      </g>
                    );
                  })()}

                  {/* Poste Izquierdo */}
                  {(() => {
                    const sec = GOAL_POSTS_AND_OUT_SECTORS.find((s) => s.code === 'POST_L')!;
                    const st = getGoalSectorStat('POST_L');
                    const isSel = selectedGoalCode === 'POST_L';
                    return (
                      <g
                        key="POST_L"
                        onClick={() => {
                          setSelectedGoalCode(isSel ? null : 'POST_L');
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
                          rx={sec.rect.rx}
                          fill={isSel ? '#f43f5e' : st.attempts > 0 ? '#b91c1c' : 'url(#analysisGoalStripes)'}
                          stroke={isSel ? '#ffffff' : '#ef4444'}
                          strokeWidth={isSel ? '3' : '1.5'}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                      </g>
                    );
                  })()}

                  {/* Poste Derecho */}
                  {(() => {
                    const sec = GOAL_POSTS_AND_OUT_SECTORS.find((s) => s.code === 'POST_R')!;
                    const st = getGoalSectorStat('POST_R');
                    const isSel = selectedGoalCode === 'POST_R';
                    return (
                      <g
                        key="POST_R"
                        onClick={() => {
                          setSelectedGoalCode(isSel ? null : 'POST_R');
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
                          rx={sec.rect.rx}
                          fill={isSel ? '#f43f5e' : st.attempts > 0 ? '#b91c1c' : 'url(#analysisGoalStripes)'}
                          stroke={isSel ? '#ffffff' : '#ef4444'}
                          strokeWidth={isSel ? '3' : '1.5'}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                      </g>
                    );
                  })()}

                  {/* Red de fondo decorativa */}
                  <rect x="153" y="40" width="194" height="94" fill="url(#analysisNetPattern)" pointerEvents="none" />

                  {/* Cuadrícula 3x3 del Arco */}
                  {GOAL_GRID_SECTORS.map((sec) => {
                    const st = getGoalSectorStat(sec.code);
                    const isSel = selectedGoalCode === sec.code;
                    const style = getEfficiencyStyle(st.attempts, st.effectivenessPct, isSel);

                    return (
                      <g
                        key={sec.code}
                        onClick={() => {
                          setSelectedGoalCode(isSel ? null : sec.code);
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
                          rx={sec.rect.rx}
                          fill={style.fill}
                          fillOpacity={style.fillOpacity}
                          stroke={style.stroke}
                          strokeWidth={style.strokeWidth}
                          className="transition-all duration-150 group-hover:brightness-125"
                        />
                        {/* Código de zona */}
                        <text
                          x={sec.center.x}
                          y={sec.center.y - 3}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="9.5"
                          fontWeight="bold"
                          pointerEvents="none"
                        >
                          {sec.code}
                        </text>
                        {/* Goles / Tiros y Eficacia */}
                        <text
                          x={sec.center.x}
                          y={sec.center.y + 9}
                          textAnchor="middle"
                          fill="#e2e8f0"
                          fontSize="8"
                          fontWeight="600"
                          pointerEvents="none"
                        >
                          {st.goals}/{st.attempts}
                        </text>
                      </g>
                    );
                  })}
                </g>
              )}

              {/* SECCIÓN CANCHA (y = 135 a 600) */}
              {/* Línea de gol blanca */}
              <line x1="20" y1="135" x2="480" y2="135" stroke="#ffffff" strokeWidth="2.5" />

              {/* Área de 6m azul de fondo */}
              <path
                d="M 20 135 C 80 150, 150 215, 250 218 C 350 215, 420 150, 480 135 L 480 135 Z"
                fill="#1e3a8a"
                fillOpacity="0.85"
                stroke="#ffffff"
                strokeWidth="3.5"
                pointerEvents="none"
              />

              {/* Curva punteada de 9 metros */}
              <path
                d="M 20 240 C 85 275, 160 330, 250 335 C 340 330, 415 275, 480 240"
                fill="none"
                stroke="#ffffff"
                strokeWidth="3"
                strokeDasharray="9 7"
                pointerEvents="none"
              />

              {/* SECTORES DE CANCHA */}
              {COURT_SECTORS.map((sec) => {
                const isSel = selectedCourtCode === sec.code;
                const cStat = getCourtSectorStat(sec.code);
                const tStat = getTurnoverSectorStat(sec.code);

                // Estilo según modo
                const style =
                  mode === 'SHOTS'
                    ? getEfficiencyStyle(cStat.attempts, cStat.effectivenessPct, isSel)
                    : getTurnoverStyle(tStat.count, isSel);

                return (
                  <g
                    key={sec.code}
                    onClick={() => {
                      setSelectedCourtCode(isSel ? null : sec.code);
                      setSelectedGoalCode(null);
                    }}
                    className="cursor-pointer group"
                    role="button"
                    tabIndex={0}
                  >
                    {sec.pathD ? (
                      <path
                        d={sec.pathD}
                        fill={style.fill}
                        fillOpacity={style.fillOpacity}
                        stroke={style.stroke}
                        strokeWidth={style.strokeWidth}
                        className="transition-all duration-150 group-hover:brightness-125"
                      />
                    ) : sec.rect ? (
                      <rect
                        x={sec.rect.x}
                        y={sec.rect.y}
                        width={sec.rect.width}
                        height={sec.rect.height}
                        rx={sec.rect.rx}
                        fill={style.fill}
                        fillOpacity={style.fillOpacity}
                        stroke={style.stroke}
                        strokeWidth={style.strokeWidth}
                        className="transition-all duration-150 group-hover:brightness-125"
                      />
                    ) : null}

                    {/* Texto del sector */}
                    <text
                      x={sec.center.x}
                      y={sec.center.y - 6}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize={sec.code === 'C9' || sec.code === 'L9' || sec.code === 'R9' ? '13' : '11'}
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {sec.shortLabel}
                    </text>

                    {/* Datos según modo */}
                    {mode === 'SHOTS' ? (
                      <text
                        x={sec.center.x}
                        y={sec.center.y + 8}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="9.5"
                        fontWeight="600"
                        pointerEvents="none"
                      >
                        {cStat.goals}/{cStat.attempts} ({cStat.effectivenessPct !== null ? `${cStat.effectivenessPct}%` : '—'})
                      </text>
                    ) : (
                      <text
                        x={sec.center.x}
                        y={sec.center.y + 8}
                        textAnchor="middle"
                        fill="#ffffff"
                        fontSize="10"
                        fontWeight="bold"
                        pointerEvents="none"
                      >
                        {tStat.count} {tStat.count === 1 ? 'pérdida' : 'pérdidas'}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* ACCIONES SIN REGISTRO ESPACIAL / ZONA DESCONOCIDA (ND) */}
          {((mode === 'SHOTS' && (courtStats.unspecified.attempts > 0 || goalStats.unspecified.attempts > 0)) ||
            (mode === 'TURNOVERS' && turnoverStats.unspecified.count > 0)) && (
            <div className="p-3 bg-amber-950/30 rounded-xl border border-amber-800/60 flex flex-col gap-2">
              <div className="flex items-center justify-between text-amber-300 font-bold">
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  Acciones sin zona espacial registrada (Zona Desconocida / ND):
                </span>
                <span className="font-mono text-xs">
                  {mode === 'SHOTS'
                    ? `${courtStats.unspecified.attempts} tiros (${courtStats.unspecified.goals} goles)`
                    : `${turnoverStats.unspecified.count} pérdidas`}
                </span>
              </div>
              <p className="text-[11px] text-amber-200/80">
                HandStat no inventa ubicaciones geométricas cuando el operador registró un tiro o pérdida sin sector
                definido. Estas acciones se preservan íntegramente en las estadísticas totales y en la auditoría.
              </p>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: INSPECTOR DETALLADO DEL SECTOR SELECCIONADO (lg:col-span-4) */}
        <div className="lg:col-span-4 bg-slate-950 p-3.5 rounded-2xl border border-slate-800 flex flex-col gap-3 shadow-xl max-h-[750px] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-sky-400" /> Detalle del Sector
            </span>
            {(selectedCourtCode || selectedGoalCode) && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCourtCode(null);
                  setSelectedGoalCode(null);
                }}
                className="text-[10px] text-slate-400 hover:text-slate-200 underline"
              >
                Limpiar selección
              </button>
            )}
          </div>

          {/* SI SE SELECCIONÓ UN SECTOR DE CANCHA (TIROS O PÉRDIDAS) */}
          {selectedCourtCode && activeCourtSector && (
            <div className="flex flex-col gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-400">
                      {activeCourtSector.categoryLabel}
                    </span>
                    <h3 className="font-extrabold text-sm text-white">{activeCourtSector.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-slate-200 border border-slate-700">
                    {activeCourtSector.code}
                  </span>
                </div>

                {mode === 'SHOTS' && activeCourtStats && (
                  <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-slate-800/80 text-center">
                    <div className="p-1.5 bg-slate-950 rounded border border-slate-850">
                      <div className="text-[10px] text-slate-400 font-bold">Tiros</div>
                      <div className="text-sm font-extrabold text-white">{activeCourtStats.attempts}</div>
                    </div>
                    <div className="p-1.5 bg-slate-950 rounded border border-slate-850">
                      <div className="text-[10px] text-slate-400 font-bold">Goles</div>
                      <div className="text-sm font-extrabold text-emerald-400">{activeCourtStats.goals}</div>
                    </div>
                    <div className="p-1.5 bg-slate-950 rounded border border-slate-850">
                      <div className="text-[10px] text-slate-400 font-bold">Eficacia</div>
                      <div className="text-sm font-extrabold text-sky-400">
                        {activeCourtStats.effectivenessPct !== null ? `${activeCourtStats.effectivenessPct}%` : '—'}
                      </div>
                    </div>
                  </div>
                )}

                {mode === 'TURNOVERS' && activeCourtTurnovers && (
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex flex-col gap-1.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-bold">Total de Pérdidas:</span>
                      <span className="font-extrabold text-rose-400 font-mono text-sm">
                        {activeCourtTurnovers.count}
                      </span>
                    </div>
                    {Object.keys(activeCourtTurnovers.byReason).length > 0 && (
                      <div className="flex flex-col gap-1 text-[11px] bg-slate-950 p-2 rounded border border-slate-850">
                        <span className="font-bold text-slate-400 text-[10px] uppercase">Desglose por motivo:</span>
                        {Object.entries(activeCourtTurnovers.byReason).map(([reason, count]) => (
                          <div key={reason} className="flex justify-between text-slate-300">
                            <span>{TURNOVER_REASON_NAMES[reason] || reason}</span>
                            <span className="font-mono font-bold text-rose-300">{count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* LISTADO DE ACCIONES INDIVIDUALES CORRESPONDIENTES */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Acciones registradas en este sector ({mode === 'SHOTS' ? activeCourtStats?.events.length : activeCourtTurnovers?.events.length}):
                </span>

                <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto pr-1">
                  {(mode === 'SHOTS' ? activeCourtStats?.events : activeCourtTurnovers?.events)?.map((ev) => {
                    const team = teams.find((t) => t.id === ev.match_team_id);
                    const period = periods.find((p) => p.id === ev.period_id);
                    const participant = ev.participants.find((p) => p.role === 'SHOOTER' || p.role === 'TURNOVER_BY');
                    const roster = participant ? rosters.find((r) => r.id === participant.roster_id) : null;
                    const resName = ev.shot_detail?.result_code ? SHOT_RESULT_NAMES[ev.shot_detail.result_code] : '';

                    return (
                      <div
                        key={ev.id}
                        className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-0.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1.5" style={{ color: team?.color_primary || '#38bdf8' }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: team?.color_primary || '#38bdf8' }} />
                            <span>{team?.short_name || team?.name}</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {period ? `${period.number}T` : ''} · {formatTime(ev.clock_ms)}
                          </span>
                        </div>

                        <div className="text-slate-200 flex justify-between items-center mt-0.5">
                          <span>
                            {roster ? `#${roster.shirt_number} ${roster.display_name_snapshot}` : ev.note || 'Jugador no identificado'}
                          </span>
                          {ev.type === 'SHOT' && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                ev.shot_detail?.result_code === 'GOAL'
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {resName}
                            </span>
                          )}
                          {ev.type === 'TURNOVER' && (
                            <span className="text-[10px] font-semibold text-rose-400">
                              {TURNOVER_REASON_NAMES[ev.turnover_detail?.reason || ''] || 'Pérdida'}
                            </span>
                          )}
                        </div>

                        {ev.shot_detail?.target_zone_code && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <span>Destino en arco:</span>
                            <span className="font-semibold text-slate-300">
                              {SPANISH_ZONE_NAMES[ev.shot_detail.target_zone_code] || ev.shot_detail.target_zone_code}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SI SE SELECCIONÓ UN CASILLERO DEL ARCO (SOLO SHOTS) */}
          {selectedGoalCode && activeGoalSector && mode === 'SHOTS' && (
            <div className="flex flex-col gap-3">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-1">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                      Destino en Portería (3x3)
                    </span>
                    <h3 className="font-extrabold text-sm text-white">{activeGoalSector.name}</h3>
                  </div>
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-slate-800 text-slate-200 border border-slate-700">
                    {activeGoalSector.code}
                  </span>
                </div>

                {activeGoalStats && (
                  <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-slate-800/80 text-center">
                    <div className="p-1.5 bg-slate-950 rounded border border-slate-855">
                      <div className="text-[10px] text-slate-400 font-bold">Tiros</div>
                      <div className="text-sm font-extrabold text-white">{activeGoalStats.attempts}</div>
                    </div>
                    <div className="p-1.5 bg-slate-950 rounded border border-slate-855">
                      <div className="text-[10px] text-slate-400 font-bold">Goles</div>
                      <div className="text-sm font-extrabold text-emerald-400">{activeGoalStats.goals}</div>
                    </div>
                    <div className="p-1.5 bg-slate-950 rounded border border-slate-855">
                      <div className="text-[10px] text-slate-400 font-bold">Eficacia</div>
                      <div className="text-sm font-extrabold text-sky-400">
                        {activeGoalStats.effectivenessPct !== null ? `${activeGoalStats.effectivenessPct}%` : '—'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* LISTADO DE ACCIONES CON ESTE DESTINO */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Tiros dirigidos a este casillero ({activeGoalStats?.events.length}):
                </span>

                <div className="flex flex-col gap-1.5 max-h-[380px] overflow-y-auto pr-1">
                  {activeGoalStats?.events.map((ev) => {
                    const team = teams.find((t) => t.id === ev.match_team_id);
                    const period = periods.find((p) => p.id === ev.period_id);
                    const participant = ev.participants.find((p) => p.role === 'SHOOTER');
                    const roster = participant ? rosters.find((r) => r.id === participant.roster_id) : null;
                    const resName = ev.shot_detail?.result_code ? SHOT_RESULT_NAMES[ev.shot_detail.result_code] : '';

                    return (
                      <div
                        key={ev.id}
                        className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-0.5 text-[11px]"
                      >
                        <div className="flex items-center justify-between font-bold">
                          <span className="flex items-center gap-1.5" style={{ color: team?.color_primary || '#38bdf8' }}>
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: team?.color_primary || '#38bdf8' }} />
                            <span>{team?.short_name || team?.name}</span>
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            {period ? `${period.number}T` : ''} · {formatTime(ev.clock_ms)}
                          </span>
                        </div>

                        <div className="text-slate-200 flex justify-between items-center mt-0.5">
                          <span>
                            {roster ? `#${roster.shirt_number} ${roster.display_name_snapshot}` : ev.note || 'Lanzador no identificado'}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              ev.shot_detail?.result_code === 'GOAL'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                : 'bg-rose-950 text-rose-300 border border-rose-800'
                            }`}
                          >
                            {resName}
                          </span>
                        </div>

                        {ev.shot_detail?.origin_zone_code && (
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <span>Origen en cancha:</span>
                            <span className="font-semibold text-slate-300">
                              {SPANISH_ZONE_NAMES[ev.shot_detail.origin_zone_code] || ev.shot_detail.origin_zone_code}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ESTADO VACÍO CUANDO NO HAY SELECCIÓN */}
          {!selectedCourtCode && !selectedGoalCode && (
            <div className="p-6 bg-slate-900/40 rounded-xl border border-slate-850 flex flex-col items-center justify-center text-center gap-2 text-slate-400 my-auto">
              <Eye className="w-8 h-8 text-slate-600 mb-1" />
              <span className="font-bold text-slate-300 text-xs">Ningún sector seleccionado</span>
              <p className="text-[11px] text-slate-500">
                Toca cualquier sector de la cancha o cuadrícula del arco para ver sus estadísticas detalladas,
                porcentaje de eficacia y el listado de jugadas correspondientes.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
