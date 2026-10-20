import React, { useState, useEffect } from 'react';
import type {
  Match,
  MatchPeriod,
  Team,
  MatchRoster,
  Player,
  PlayerParticipationInterval,
} from '../domain/schemas';
import { Target, X, Check, Shield, AlertCircle, Zap, User } from 'lucide-react';

export interface VisualShotModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveShot: (shotData: {
    teamId: string;
    rosterId?: string;
    goalkeeperRosterId?: string;
    isEmptyNet: boolean;
    isFastbreak: boolean;
    originZone: 'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG';
    targetZone?: 'TL' | 'TC' | 'TR' | 'ML' | 'MC' | 'MR' | 'BL' | 'BC' | 'BR' | 'POST_L' | 'POST_R' | 'BAR' | 'OUT_L' | 'OUT_TOP' | 'OUT_R';
    resultCode: 'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED';
    assisterRosterId?: string;
    clockMs: number;
    periodId: string;
  }) => Promise<void>;
  currentMatch: Match;
  periods: MatchPeriod[];
  activePeriodId: string;
  currentClockMs: number;
  teams: Team[];
  rosters: MatchRoster[];
  players: Player[];
  activeCourtParticipations: PlayerParticipationInterval[];
  initialTeamId?: string;
  initialRosterId?: string;
  initialResultCode?: 'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED';
}

const POSITION_NAMES: Record<string, string> = {
  CB: 'Central',
  LB: 'Lateral Izquierdo',
  RB: 'Lateral Derecho',
  LW: 'Extremo Izquierdo',
  RW: 'Extremo Derecho',
  PV: 'Pivote',
  GK: 'Arquero / Portero',
};

const ORIGIN_ZONE_LABELS: Record<string, string> = {
  L6: '6m Extremo Izquierdo',
  C6: '6m Centro (Pivote)',
  R6: '6m Extremo Derecho',
  '7M': 'Penal 7 Metros',
  L9: '9m Lateral Izquierdo',
  C9: '9m Central',
  R9: '9m Lateral Derecho',
  LONG: 'Campo Largo / Contraataque',
};

export const VisualShotModal: React.FC<VisualShotModalProps> = ({
  isOpen,
  onClose,
  onSaveShot,
  currentMatch,
  periods,
  activePeriodId,
  currentClockMs,
  teams,
  rosters,
  players,
  activeCourtParticipations,
  initialTeamId,
  initialRosterId,
  initialResultCode = 'GOAL',
}) => {
  const ownTeam = teams.find((t) => t.id === currentMatch.home_team_id);
  const rivalTeam = teams.find((t) => t.id === currentMatch.away_team_id);

  // Estado del formulario
  const [selectedTeamId, setSelectedTeamId] = useState<string>(
    initialTeamId || currentMatch.home_team_id
  );
  const [selectedShooterId, setSelectedShooterId] = useState<string>(initialRosterId || '');
  const [isRivalCollective, setIsRivalCollective] = useState<boolean>(true);
  const [selectedGkId, setSelectedGkId] = useState<string>('');
  const [isEmptyNet, setIsEmptyNet] = useState<boolean>(false);
  const [isFastbreak, setIsFastbreak] = useState<boolean>(false);

  const [originZone, setOriginZone] = useState<
    'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG'
  >('C6');

  const [targetZone, setTargetZone] = useState<
    | 'TL'
    | 'TC'
    | 'TR'
    | 'ML'
    | 'MC'
    | 'MR'
    | 'BL'
    | 'BC'
    | 'BR'
    | 'POST_L'
    | 'POST_R'
    | 'BAR'
    | 'OUT_L'
    | 'OUT_TOP'
    | 'OUT_R'
    | undefined
  >('TC');

  const [resultCode, setResultCode] = useState<
    'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED'
  >(initialResultCode);

  const [assisterRosterId, setAssisterRosterId] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('00:00');
  const [selectedPeriodId, setSelectedPeriodId] = useState<string>(activePeriodId);
  const [isSaving, setIsSaving] = useState(false);

  // Inicialización al abrir
  useEffect(() => {
    if (isOpen) {
      const teamId = initialTeamId || currentMatch.home_team_id;
      setSelectedTeamId(teamId);
      setSelectedShooterId(initialRosterId || '');
      setResultCode(initialResultCode || 'GOAL');
      setSelectedPeriodId(activePeriodId || periods[0]?.id || '');
      setIsFastbreak(false);
      setIsEmptyNet(false);
      setAssisterRosterId('');

      // Formatear reloj
      const totalSecs = Math.floor(currentClockMs / 1000);
      const mins = Math.floor(totalSecs / 60).toString().padStart(2, '0');
      const secs = (totalSecs % 60).toString().padStart(2, '0');
      setTimeStr(`${mins}:${secs}`);

      // Si el equipo que ataca es rival
      const isRival = teamId === currentMatch.away_team_id;
      setIsRivalCollective(isRival && !initialRosterId);

      // Preseleccionar zona de origen según posición habitual del jugador si existe
      if (initialRosterId) {
        const ros = rosters.find((r) => r.id === initialRosterId);
        const pl = players.find((p) => p.id === ros?.player_id);
        if (pl) {
          if (pl.position === 'LW') setOriginZone('L6');
          else if (pl.position === 'RW') setOriginZone('R6');
          else if (pl.position === 'PV') setOriginZone('C6');
          else if (pl.position === 'LB') setOriginZone('L9');
          else if (pl.position === 'RB') setOriginZone('R9');
          else if (pl.position === 'CB') setOriginZone('C9');
          else setOriginZone('C6');
        }
      }

      // Preseleccionar arquero defensor (del equipo contrario al que ataca)
      const defendingTeamId =
        teamId === currentMatch.home_team_id
          ? currentMatch.away_team_id
          : currentMatch.home_team_id;

      const defendingGkOnCourt = activeCourtParticipations.find(
        (p) => p.team_id === defendingTeamId && p.role_on_court === 'GK'
      );
      if (defendingGkOnCourt) {
        setSelectedGkId(defendingGkOnCourt.roster_id);
      } else {
        const defaultDefendingGk = rosters.find(
          (r) => r.team_id === defendingTeamId && r.role === 'GK'
        );
        setSelectedGkId(defaultDefendingGk?.id || '');
      }
    }
  }, [
    isOpen,
    initialTeamId,
    initialRosterId,
    initialResultCode,
    activePeriodId,
    currentClockMs,
    currentMatch,
    rosters,
    players,
    activeCourtParticipations,
    periods,
  ]);

  if (!isOpen) return null;

  const isOwnAttacking = selectedTeamId === currentMatch.home_team_id;
  const defendingTeamId = isOwnAttacking
    ? currentMatch.away_team_id
    : currentMatch.home_team_id;

  // Jugadores del equipo atacante
  const attackingRosters = rosters.filter((r) => r.team_id === selectedTeamId);
  const defendingRosters = rosters.filter((r) => r.team_id === defendingTeamId);

  // Jugador lanzador seleccionado y su posición habitual
  const selectedShooterRoster = rosters.find((r) => r.id === selectedShooterId);
  const selectedShooterPlayer = players.find(
    (p) => p.id === selectedShooterRoster?.player_id
  );
  const habitualPosName = selectedShooterPlayer?.position
    ? POSITION_NAMES[selectedShooterPlayer.position] || selectedShooterPlayer.position
    : 'No especificada';

  // Manejador al hacer clic en zona de cancha
  const handleSelectOriginZone = (
    zone: 'LW' | 'L9' | 'C9' | 'R9' | 'RW' | 'L6' | 'C6' | 'R6' | '7M' | 'LONG'
  ) => {
    setOriginZone(zone);
  };

  // Manejador al hacer clic en la portería
  const handleSelectTargetZone = (
    zone:
      | 'TL'
      | 'TC'
      | 'TR'
      | 'ML'
      | 'MC'
      | 'MR'
      | 'BL'
      | 'BC'
      | 'BR'
      | 'POST_L'
      | 'POST_R'
      | 'BAR'
      | 'OUT_L'
      | 'OUT_TOP'
      | 'OUT_R'
  ) => {
    setTargetZone(zone);
    if (zone === 'POST_L' || zone === 'POST_R' || zone === 'BAR') {
      setResultCode('POST');
    } else if (zone === 'OUT_L' || zone === 'OUT_TOP' || zone === 'OUT_R') {
      setResultCode('MISSED');
    } else {
      // Si estaba en poste o fuera y hace clic dentro del arco, pasar a GOL o mantener ATAJADA
      if (resultCode === 'POST' || resultCode === 'MISSED') {
        setResultCode('GOAL');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    // Parsear tiempo mm:ss
    let clockMs = currentClockMs;
    if (timeStr && timeStr.includes(':')) {
      const parts = timeStr.split(':').map(Number);
      const m = parts[0];
      const s = parts[1];
      if (m !== undefined && s !== undefined && !isNaN(m) && !isNaN(s)) {
        clockMs = (m * 60 + s) * 1000;
      }
    }

    setIsSaving(true);
    try {
      await onSaveShot({
        teamId: selectedTeamId,
        rosterId: isOwnAttacking ? selectedShooterId : isRivalCollective ? undefined : selectedShooterId,
        goalkeeperRosterId: isEmptyNet ? undefined : selectedGkId || undefined,
        isEmptyNet,
        isFastbreak,
        originZone,
        targetZone,
        resultCode,
        assisterRosterId: isOwnAttacking && resultCode === 'GOAL' ? assisterRosterId || undefined : undefined,
        clockMs,
        periodId: selectedPeriodId,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl flex flex-col text-xs shadow-2xl overflow-hidden my-auto max-h-[95vh]">
        {/* Cabecera del Modal */}
        <div className="p-3.5 bg-slate-950 border-b border-slate-800 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-sky-950 border border-sky-800 text-sky-400">
              <Target className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-bold text-sm text-slate-100 flex items-center gap-2">
                Registro Visual de Lanzamiento
              </h2>
              <span className="text-[10px] text-slate-400">
                Selección táctica de origen en cancha y destino en portería
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo con Scroll */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-4">
          {/* SECCIÓN 1: EQUIPO, LANZADOR, ARQUERO Y TIEMPO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-950/70 rounded-xl border border-slate-800">
            {/* Equipo Atacante */}
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                1. Equipo Atacante
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTeamId(currentMatch.home_team_id);
                    setSelectedShooterId('');
                    setIsRivalCollective(false);
                  }}
                  className={`py-2 px-2.5 rounded-lg font-bold text-xs border text-left flex flex-col transition-all ${
                    isOwnAttacking
                      ? 'bg-sky-600/30 border-sky-500 text-white shadow-md ring-1 ring-sky-500'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wider font-semibold opacity-70">
                    Equipo Propio
                  </span>
                  <span className="truncate">{ownTeam?.name || 'Local'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTeamId(currentMatch.away_team_id);
                    setSelectedShooterId('');
                    setIsRivalCollective(true);
                  }}
                  className={`py-2 px-2.5 rounded-lg font-bold text-xs border text-left flex flex-col transition-all ${
                    !isOwnAttacking
                      ? 'bg-rose-600/30 border-rose-500 text-white shadow-md ring-1 ring-rose-500'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  <span className="text-[9px] uppercase tracking-wider font-semibold opacity-70">
                    Rival
                  </span>
                  <span className="truncate">{rivalTeam?.name || 'Visitante'}</span>
                </button>
              </div>
            </div>

            {/* Lanzador */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  2. Lanzador
                </label>
                {!isOwnAttacking && (
                  <label className="flex items-center gap-1 text-[10px] text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRivalCollective}
                      onChange={(e) => setIsRivalCollective(e.target.checked)}
                      className="rounded border-slate-700 text-rose-600 focus:ring-0"
                    />
                    Colectivo / Desconocido
                  </label>
                )}
              </div>

              {isOwnAttacking || !isRivalCollective ? (
                <div className="flex flex-col gap-1">
                  <select
                    value={selectedShooterId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedShooterId(id);
                      // Sugerir zona de tiro según posición habitual
                      const ros = rosters.find((r) => r.id === id);
                      const pl = players.find((p) => p.id === ros?.player_id);
                      if (pl) {
                        if (pl.position === 'LW') setOriginZone('L6');
                        else if (pl.position === 'RW') setOriginZone('R6');
                        else if (pl.position === 'PV') setOriginZone('C6');
                        else if (pl.position === 'LB') setOriginZone('L9');
                        else if (pl.position === 'RB') setOriginZone('R9');
                        else if (pl.position === 'CB') setOriginZone('C9');
                      }
                    }}
                    required={isOwnAttacking}
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-medium text-xs focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">Seleccione lanzador...</option>
                    {attackingRosters.map((r) => {
                      const pl = players.find((p) => p.id === r.player_id);
                      const posStr = pl?.position ? `(${POSITION_NAMES[pl.position] || pl.position})` : '';
                      const onCourt = activeCourtParticipations.some((p) => p.roster_id === r.id);
                      return (
                        <option key={r.id} value={r.id}>
                          #{r.shirt_number} {r.display_name_snapshot} {posStr} {onCourt ? '• [En cancha]' : ''}
                        </option>
                      );
                    })}
                  </select>

                  {/* Diferenciación explícita de posición habitual */}
                  {selectedShooterPlayer && (
                    <div className="p-1.5 bg-slate-900/90 rounded border border-slate-800 text-[10px] text-slate-300 flex items-center gap-1.5">
                      <User className="w-3 h-3 text-sky-400 shrink-0" />
                      <span>
                        Posición habitual:{' '}
                        <strong className="text-sky-300">{habitualPosName}</strong>
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-[11px] text-amber-300/90 italic flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                  Acción colectiva rival sin participante ficticio (D2).
                </div>
              )}
            </div>

            {/* Arquero Defensor y Portería Vacía */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  3. Portero Rival
                </label>
                <label className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEmptyNet}
                    onChange={(e) => setIsEmptyNet(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0"
                  />
                  Portería Vacía
                </label>
              </div>

              {!isEmptyNet ? (
                <select
                  value={selectedGkId}
                  onChange={(e) => setSelectedGkId(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-100 font-medium text-xs focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">(Portero no identificado / Colectivo)</option>
                  {defendingRosters
                    .filter((r) => r.role === 'GK' || !isOwnAttacking)
                    .map((r) => {
                      const onCourt = activeCourtParticipations.some((p) => p.roster_id === r.id);
                      return (
                        <option key={r.id} value={r.id}>
                          #{r.shirt_number} {r.display_name_snapshot} {r.role === 'GK' ? '(Arquero)' : ''} {onCourt ? '• [En cancha]' : ''}
                        </option>
                      );
                    })}
                </select>
              ) : (
                <div className="p-2 bg-amber-950/40 rounded-lg border border-amber-800/80 text-[11px] text-amber-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Tiro hacia arco desguarnecido (Empty Net).
                </div>
              )}

              {/* Período y Reloj */}
              <div className="grid grid-cols-2 gap-1.5 mt-2">
                <div>
                  <select
                    value={selectedPeriodId}
                    onChange={(e) => setSelectedPeriodId(e.target.value)}
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-[11px]"
                  >
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.number}º Tiempo
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="text"
                    required
                    pattern="[0-9]{1,2}:[0-9]{2}"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                    className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-[11px] font-mono text-center"
                    placeholder="mm:ss"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: RESULTADO DEL LANZAMIENTO */}
          <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col gap-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              4. Resultado del Tiro
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <button
                type="button"
                onClick={() => setResultCode('GOAL')}
                className={`py-2.5 px-2 rounded-xl font-extrabold text-xs flex flex-col items-center justify-center gap-1 border transition-all ${
                  resultCode === 'GOAL'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-950/50 ring-2 ring-emerald-500 scale-[1.02]'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span className="text-sm">⚽</span>
                <span>GOL</span>
              </button>

              <button
                type="button"
                onClick={() => setResultCode('SAVED')}
                className={`py-2.5 px-2 rounded-xl font-extrabold text-xs flex flex-col items-center justify-center gap-1 border transition-all ${
                  resultCode === 'SAVED'
                    ? 'bg-amber-600 text-white border-amber-400 shadow-lg shadow-amber-950/50 ring-2 ring-amber-500 scale-[1.02]'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span className="text-sm">🧤</span>
                <span>ATAJADA</span>
              </button>

              <button
                type="button"
                onClick={() => setResultCode('POST')}
                className={`py-2.5 px-2 rounded-xl font-extrabold text-xs flex flex-col items-center justify-center gap-1 border transition-all ${
                  resultCode === 'POST'
                    ? 'bg-orange-600 text-white border-orange-400 shadow-lg shadow-orange-950/50 ring-2 ring-orange-500 scale-[1.02]'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span className="text-sm">🥅</span>
                <span>POSTE</span>
              </button>

              <button
                type="button"
                onClick={() => setResultCode('MISSED')}
                className={`py-2.5 px-2 rounded-xl font-extrabold text-xs flex flex-col items-center justify-center gap-1 border transition-all ${
                  resultCode === 'MISSED'
                    ? 'bg-rose-700 text-white border-rose-400 shadow-lg shadow-rose-950/50 ring-2 ring-rose-500 scale-[1.02]'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span className="text-sm">💨</span>
                <span>FUERA</span>
              </button>

              <button
                type="button"
                onClick={() => setResultCode('BLOCKED')}
                className={`py-2.5 px-2 rounded-xl font-extrabold text-xs flex flex-col items-center justify-center gap-1 border transition-all col-span-2 sm:col-span-1 ${
                  resultCode === 'BLOCKED'
                    ? 'bg-slate-600 text-white border-slate-400 shadow-lg ring-2 ring-slate-400 scale-[1.02]'
                    : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                }`}
              >
                <span className="text-sm">🛡️</span>
                <span>BLOQUEADO</span>
              </button>
            </div>

            {/* Asistencia Opcional si es gol del equipo propio */}
            {isOwnAttacking && resultCode === 'GOAL' && (
              <div className="mt-2 pt-2 border-t border-slate-800 flex items-center gap-2">
                <span className="text-slate-400 text-[11px] font-medium shrink-0">
                  Pase Gol / Asistencia:
                </span>
                <select
                  value={assisterRosterId}
                  onChange={(e) => setAssisterRosterId(e.target.value)}
                  className="flex-1 px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs"
                >
                  <option value="">(Sin asistencia registrada)</option>
                  {attackingRosters
                    .filter((r) => r.id !== selectedShooterId)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        #{r.shirt_number} {r.display_name_snapshot}
                      </option>
                    ))}
                </select>
              </div>
            )}
          </div>

          {/* SECCIÓN 3: PANELES INTERACTIVOS (MEDIA CANCHA Y PORTERÍA) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {/* PANEL A: ORIGEN EN MEDIA CANCHA */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" /> 5. Origen en Cancha
                </span>
                <label className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-amber-300 text-[10px] font-semibold cursor-pointer hover:bg-slate-800 transition-colors">
                  <Zap className="w-3 h-3 text-amber-400" />
                  <input
                    type="checkbox"
                    checked={isFastbreak}
                    onChange={(e) => setIsFastbreak(e.target.checked)}
                    className="rounded border-slate-700 text-amber-500 focus:ring-0"
                  />
                  Contraataque
                </label>
              </div>

              {/* Diagrama Táctico de Media Cancha */}
              <div className="relative w-full bg-slate-900 rounded-xl border border-slate-800 p-2.5 flex flex-col items-center justify-between min-h-[260px] select-none">
                {/* Arco al fondo */}
                <div className="w-24 h-3 bg-slate-800 border-2 border-slate-600 rounded-t-sm flex items-center justify-center text-[9px] text-slate-400 font-mono tracking-widest">
                  ARCO
                </div>

                {/* Línea de 6 Metros (L6, C6, R6) */}
                <div className="w-full grid grid-cols-3 gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('L6')}
                    className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center ${
                      originZone === 'L6'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold">Extremo Izq</span>
                    <span className="text-[9px] font-mono opacity-80">(L6)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('C6')}
                    className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center ${
                      originZone === 'C6'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold">Pivote 6m</span>
                    <span className="text-[9px] font-mono opacity-80">(C6)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('R6')}
                    className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center ${
                      originZone === 'R6'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold">Extremo Der</span>
                    <span className="text-[9px] font-mono opacity-80">(R6)</span>
                  </button>
                </div>

                {/* Penal 7 Metros */}
                <div className="w-full flex justify-center my-1.5">
                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('7M')}
                    className={`py-1.5 px-6 rounded-lg border text-center transition-all flex items-center gap-1.5 ${
                      originZone === '7M'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold">Penal 7m</span>
                    <span className="text-[9px] font-mono opacity-80">(7M)</span>
                  </button>
                </div>

                {/* Línea de 9 Metros (L9, C9, R9) */}
                <div className="w-full grid grid-cols-3 gap-2 my-1">
                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('L9')}
                    className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center ${
                      originZone === 'L9'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold">Lateral Izq</span>
                    <span className="text-[9px] font-mono opacity-80">(L9)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('C9')}
                    className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center ${
                      originZone === 'C9'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold">Central 9m</span>
                    <span className="text-[9px] font-mono opacity-80">(C9)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('R9')}
                    className={`py-2 px-1 rounded-lg border text-center transition-all flex flex-col items-center ${
                      originZone === 'R9'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[11px] font-bold">Lateral Der</span>
                    <span className="text-[9px] font-mono opacity-80">(R9)</span>
                  </button>
                </div>

                {/* Campo Largo / Fondo */}
                <div className="w-full mt-1">
                  <button
                    type="button"
                    onClick={() => handleSelectOriginZone('LONG')}
                    className={`w-full py-1.5 px-2 rounded-lg border text-center transition-all flex items-center justify-center gap-1.5 ${
                      originZone === 'LONG'
                        ? 'bg-sky-600 text-white border-sky-400 shadow-md ring-2 ring-sky-400 font-bold'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-[10px] font-bold">Campo Propio / Contraataque Largo</span>
                    <span className="text-[9px] font-mono opacity-80">(LONG)</span>
                  </button>
                </div>
              </div>

              {/* Resumen del Origen */}
              <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
                <span>Zona Seleccionada:</span>
                <span className="font-bold text-sky-400">
                  {ORIGIN_ZONE_LABELS[originZone] || originZone}
                </span>
              </div>
            </div>

            {/* PANEL B: DESTINO EN PORTERÍA 3X3 */}
            <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" /> 6. Destino en Portería
                </span>
                <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800">
                  Vista del lanzador mirando al arco
                </span>
              </div>

              {/* Portería con Marco y Cuadrícula 3x3 */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-2.5 flex flex-col items-center justify-center min-h-[260px] select-none">
                {/* Zona Fuera Alto */}
                <div className="w-full flex justify-center mb-1">
                  <button
                    type="button"
                    onClick={() => handleSelectTargetZone('OUT_TOP')}
                    className={`py-1 px-4 rounded text-[10px] border transition-all ${
                      targetZone === 'OUT_TOP'
                        ? 'bg-rose-600 text-white border-rose-400 font-bold ring-1 ring-rose-400'
                        : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                    }`}
                  >
                    ⬆ Fuera Alto (OUT_TOP)
                  </button>
                </div>

                {/* Travesaño */}
                <div className="w-full max-w-[280px]">
                  <button
                    type="button"
                    onClick={() => handleSelectTargetZone('BAR')}
                    className={`w-full py-1 rounded-t border-t-4 border-x-4 text-[10px] font-bold transition-all ${
                      targetZone === 'BAR'
                        ? 'bg-orange-600 text-white border-orange-400 ring-2 ring-orange-400'
                        : 'bg-slate-800 text-slate-300 border-red-500/80 hover:bg-slate-700'
                    }`}
                  >
                    TRAVESAÑO (BAR)
                  </button>
                </div>

                {/* Marco con Postes y Cuadrícula 3x3 */}
                <div className="flex items-center justify-center w-full max-w-[320px]">
                  {/* Fuera Izq + Poste Izquierdo */}
                  <div className="flex items-center gap-1 mr-1">
                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('OUT_L')}
                      className={`h-28 w-7 rounded text-[9px] font-bold border transition-all flex items-center justify-center text-center [writing-mode:vertical-lr] ${
                        targetZone === 'OUT_L'
                          ? 'bg-rose-600 text-white border-rose-400 ring-1 ring-rose-400'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      Fuera Izq
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('POST_L')}
                      className={`h-28 w-4 rounded-l border-l-4 border-y-2 text-[9px] font-bold transition-all flex items-center justify-center [writing-mode:vertical-lr] ${
                        targetZone === 'POST_L'
                          ? 'bg-orange-600 text-white border-orange-400 ring-2 ring-orange-400'
                          : 'bg-slate-800 text-slate-300 border-red-500/80 hover:bg-slate-700'
                      }`}
                    >
                      POSTE
                    </button>
                  </div>

                  {/* Cuadrícula 3x3 */}
                  <div className="grid grid-cols-3 gap-1 flex-1 bg-slate-950 p-1.5 rounded border border-slate-700 shadow-inner">
                    {/* Fila Arriba */}
                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('TL')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'TL'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">TL</span>
                      <span className="text-[8px] opacity-75">Arr Izq</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('TC')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'TC'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">TC</span>
                      <span className="text-[8px] opacity-75">Arr Centro</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('TR')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'TR'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">TR</span>
                      <span className="text-[8px] opacity-75">Arr Der</span>
                    </button>

                    {/* Fila Medio */}
                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('ML')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'ML'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">ML</span>
                      <span className="text-[8px] opacity-75">Med Izq</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('MC')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'MC'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">MC</span>
                      <span className="text-[8px] opacity-75">Med Centro</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('MR')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'MR'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">MR</span>
                      <span className="text-[8px] opacity-75">Med Der</span>
                    </button>

                    {/* Fila Abajo */}
                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('BL')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'BL'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">BL</span>
                      <span className="text-[8px] opacity-75">Abj Izq</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('BC')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'BC'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">BC</span>
                      <span className="text-[8px] opacity-75">Abj Centro</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('BR')}
                      className={`h-10 rounded border flex flex-col items-center justify-center transition-all ${
                        targetZone === 'BR'
                          ? 'bg-emerald-600 text-white border-emerald-400 shadow ring-2 ring-emerald-400 font-bold'
                          : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-[10px] font-bold">BR</span>
                      <span className="text-[8px] opacity-75">Abj Der</span>
                    </button>
                  </div>

                  {/* Poste Derecho + Fuera Der */}
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('POST_R')}
                      className={`h-28 w-4 rounded-r border-r-4 border-y-2 text-[9px] font-bold transition-all flex items-center justify-center [writing-mode:vertical-lr] ${
                        targetZone === 'POST_R'
                          ? 'bg-orange-600 text-white border-orange-400 ring-2 ring-orange-400'
                          : 'bg-slate-800 text-slate-300 border-red-500/80 hover:bg-slate-700'
                      }`}
                    >
                      POSTE
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectTargetZone('OUT_R')}
                      className={`h-28 w-7 rounded text-[9px] font-bold border transition-all flex items-center justify-center text-center [writing-mode:vertical-lr] ${
                        targetZone === 'OUT_R'
                          ? 'bg-rose-600 text-white border-rose-400 ring-1 ring-rose-400'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      Fuera Der
                    </button>
                  </div>
                </div>
              </div>

              {/* Resumen del Destino */}
              <div className="p-2 bg-slate-900 rounded-lg border border-slate-800 text-[11px] text-slate-300 flex items-center justify-between">
                <span>Destino Seleccionado:</span>
                <span className="font-bold text-sky-400">
                  {targetZone ? targetZone : '(Sin destino especificado)'}
                </span>
              </div>
            </div>
          </div>

          {/* Botones de Acción Final */}
          <div className="p-3 bg-slate-950 border-t border-slate-800 flex justify-end gap-2.5 shrink-0 mt-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg shadow-sky-950/60 flex items-center gap-1.5 transition-all active:scale-95"
            >
              <Check className="w-4 h-4" />
              {isSaving ? 'Guardando Lanzamiento...' : 'Guardar Lanzamiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
