import React from 'react';
import { ZONE_NAMES_ES } from '../services/exportService';

export interface HandballTacticalFieldProps {
  mode: 'SHOT' | 'TURNOVER';
  selectedOriginZone:
    | 'LW' | 'L6' | 'C6' | 'R6' | 'RW'
    | '7M' | 'L9' | 'C9' | 'R9'
    | 'LONG' | 'DEFENSE' | 'MIDCOURT' | 'UNKNOWN'
    | null;
  onSelectOriginZone: (
    zone:
      | 'LW' | 'L6' | 'C6' | 'R6' | 'RW'
      | '7M' | 'L9' | 'C9' | 'R9'
      | 'LONG' | 'DEFENSE' | 'MIDCOURT' | 'UNKNOWN'
  ) => void;
  selectedTargetZone:
    | 'TL' | 'TC' | 'TR'
    | 'ML' | 'MC' | 'MR'
    | 'BL' | 'BC' | 'BR'
    | 'POST_L' | 'POST_R' | 'BAR'
    | 'OUT_L' | 'OUT_TOP' | 'OUT_R'
    | 'UNKNOWN'
    | null;
  onSelectTargetZone: (
    target:
      | 'TL' | 'TC' | 'TR'
      | 'ML' | 'MC' | 'MR'
      | 'BL' | 'BC' | 'BR'
      | 'POST_L' | 'POST_R' | 'BAR'
      | 'OUT_L' | 'OUT_TOP' | 'OUT_R'
      | 'UNKNOWN'
  ) => void;
  shotResult?: 'GOAL' | 'SAVED' | 'MISSED' | 'POST' | 'BLOCKED';
  actingTeamName?: string;
  actingTeamColor?: string;
}

export const HandballTacticalField: React.FC<HandballTacticalFieldProps> = ({
  mode,
  selectedOriginZone,
  onSelectOriginZone,
  selectedTargetZone,
  onSelectTargetZone,
  shotResult = 'GOAL',
  actingTeamName: _actingTeamName,
  actingTeamColor: _actingTeamColor = '#f43f5e',
}) => {
  // Color de resaltado activo idéntico a la referencia funcional (coral / salmon vibrante)
  const highlightColor = '#f43f5e';
  const highlightBorder = '#ffffff';

  // Nombres legibles en español de los casilleros del arco
  const TARGET_NAMES_ES: Record<string, string> = {
    TL: 'Ángulo Superior Izquierdo',
    TC: 'Arriba al Centro',
    TR: 'Ángulo Superior Derecho',
    ML: 'Medio Izquierdo',
    MC: 'Centro del Arco',
    MR: 'Medio Derecho',
    BL: 'Abajo a la Izquierda',
    BC: 'Abajo al Centro',
    BR: 'Abajo a la Derecha',
    BAR: 'Travesaño',
    POST_L: 'Poste Izquierdo',
    POST_R: 'Poste Derecho',
    OUT_TOP: 'Fuera Alto (Arriba)',
    OUT_L: 'Fuera Desviado a la Izquierda',
    OUT_R: 'Fuera Desviado a la Derecha',
    UNKNOWN: 'No observado',
  };

  return (
    <div className="flex flex-col gap-2 w-full select-none">
      {/* Barra Informativa de Selecciones Activas */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-1.5 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Origen:</span>
          {selectedOriginZone ? (
            <span className="px-2 py-0.5 rounded font-bold text-xs bg-rose-600/30 text-rose-300 border border-rose-500/50 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>{ZONE_NAMES_ES[selectedOriginZone] || selectedOriginZone}</span>
            </span>
          ) : (
            <span className="text-amber-400/90 italic text-[11px]">Toca un sector en la cancha</span>
          )}
        </div>

        {mode === 'SHOT' && shotResult !== 'BLOCKED' && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Destino:</span>
            {selectedTargetZone ? (
              <span className="px-2 py-0.5 rounded font-bold text-xs bg-rose-600/30 text-rose-300 border border-rose-500/50 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>{TARGET_NAMES_ES[selectedTargetZone] || selectedTargetZone}</span>
              </span>
            ) : (
              <span className="text-amber-400/90 italic text-[11px]">Toca un casillero en el arco</span>
            )}
          </div>
        )}
      </div>

      {/* Contenedor Gráfico SVG de Media Cancha y Arco */}
      <div className="relative w-full bg-slate-950 rounded-2xl border-2 border-slate-800 p-2 sm:p-3 shadow-2xl flex flex-col items-center">
        {/* Leyenda Superior de Orientación */}
        <div className="w-full flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400 font-semibold px-2 pb-1 border-b border-slate-850">
          <span className="flex items-center gap-1 text-slate-400 font-bold">
            <span>◄ IZQUIERDA</span>
          </span>
          <span className="text-amber-400 font-bold tracking-wide text-center">
            Perspectiva del lanzador (de frente al arco)
          </span>
          <span className="flex items-center gap-1 text-slate-400 font-bold">
            <span>DERECHA ►</span>
          </span>
        </div>

        {/* SVG Interactivo */}
        <svg
          viewBox="0 0 500 620"
          className="w-full h-auto max-w-[500px] touch-manipulation my-1"
          style={{ maxHeight: '72vh' }}
        >
          <defs>
            {/* Patrón a rayas para postes y travesaño */}
            <pattern id="goalStripes" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="10" height="20" fill="#ef4444" />
              <rect x="10" width="10" height="20" fill="#ffffff" />
            </pattern>

            {/* Red decorativa de fondo (sin interceptar clics) */}
            <pattern id="netPattern" width="16" height="16" patternUnits="userSpaceOnUse">
              <path d="M 16 0 L 0 0 0 16" fill="none" stroke="#475569" strokeWidth="1" strokeOpacity="0.45" />
            </pattern>
          </defs>

          {/* ============================================================== */}
          {/* SECCIÓN 1: ARCO Y DESTINO (y = 0 a 140) */}
          {/* ============================================================== */}

          {/* Fuera Alto (OUT_TOP) */}
          {mode === 'SHOT' && (
            <g
              onClick={() => onSelectTargetZone('OUT_TOP')}
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
            >
              <rect
                x="135"
                y="2"
                width="230"
                height="18"
                rx="6"
                fill={selectedTargetZone === 'OUT_TOP' ? highlightColor : '#1e293b'}
                stroke={selectedTargetZone === 'OUT_TOP' ? highlightBorder : '#475569'}
                strokeWidth={selectedTargetZone === 'OUT_TOP' ? '2.5' : '1'}
                className="transition-all duration-150 group-hover:brightness-125"
              />
              <text
                x="250"
                y="14"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="9"
                fontWeight="bold"
                pointerEvents="none"
              >
                FUERA ARRIBA (ALTO)
              </text>
            </g>
          )}

          {/* Fuera Izquierda (OUT_L) */}
          {mode === 'SHOT' && (
            <g
              onClick={() => onSelectTargetZone('OUT_L')}
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
            >
              <rect
                x="45"
                y="24"
                width="82"
                height="110"
                rx="8"
                fill={selectedTargetZone === 'OUT_L' ? highlightColor : '#0f172a'}
                stroke={selectedTargetZone === 'OUT_L' ? highlightBorder : '#334155'}
                strokeWidth={selectedTargetZone === 'OUT_L' ? '2.5' : '1'}
                className="transition-all duration-150 group-hover:brightness-125"
              />
              <text
                x="86"
                y="75"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="bold"
                pointerEvents="none"
              >
                FUERA IZQ
              </text>
              <text
                x="86"
                y="90"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                pointerEvents="none"
              >
                (Desviado)
              </text>
            </g>
          )}

          {/* Fuera Derecha (OUT_R) */}
          {mode === 'SHOT' && (
            <g
              onClick={() => onSelectTargetZone('OUT_R')}
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
            >
              <rect
                x="373"
                y="24"
                width="82"
                height="110"
                rx="8"
                fill={selectedTargetZone === 'OUT_R' ? highlightColor : '#0f172a'}
                stroke={selectedTargetZone === 'OUT_R' ? highlightBorder : '#334155'}
                strokeWidth={selectedTargetZone === 'OUT_R' ? '2.5' : '1'}
                className="transition-all duration-150 group-hover:brightness-125"
              />
              <text
                x="414"
                y="75"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="10"
                fontWeight="bold"
                pointerEvents="none"
              >
                FUERA DER
              </text>
              <text
                x="414"
                y="90"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="8"
                pointerEvents="none"
              >
                (Desviado)
              </text>
            </g>
          )}

          {/* Travesaño (BAR) */}
          <g
            onClick={() => onSelectTargetZone('BAR')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <rect
              x="135"
              y="24"
              width="230"
              height="16"
              rx="3"
              fill={selectedTargetZone === 'BAR' ? highlightColor : 'url(#goalStripes)'}
              stroke={selectedTargetZone === 'BAR' ? highlightBorder : '#ef4444'}
              strokeWidth={selectedTargetZone === 'BAR' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:brightness-125 shadow-md"
            />
            {selectedTargetZone === 'BAR' && (
              <text
                x="250"
                y="36"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="9"
                fontWeight="bold"
                pointerEvents="none"
              >
                TRAVESAÑO
              </text>
            )}
          </g>

          {/* Poste Izquierdo (POST_L) */}
          <g
            onClick={() => onSelectTargetZone('POST_L')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <rect
              x="135"
              y="40"
              width="18"
              height="94"
              rx="2"
              fill={selectedTargetZone === 'POST_L' ? highlightColor : 'url(#goalStripes)'}
              stroke={selectedTargetZone === 'POST_L' ? highlightBorder : '#ef4444'}
              strokeWidth={selectedTargetZone === 'POST_L' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:brightness-125 shadow-md"
            />
            {selectedTargetZone === 'POST_L' && (
              <text
                x="144"
                y="90"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8"
                fontWeight="bold"
                pointerEvents="none"
                transform="rotate(-90 144 90)"
              >
                POSTE IZQ
              </text>
            )}
          </g>

          {/* Poste Derecho (POST_R) */}
          <g
            onClick={() => onSelectTargetZone('POST_R')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <rect
              x="347"
              y="40"
              width="18"
              height="94"
              rx="2"
              fill={selectedTargetZone === 'POST_R' ? highlightColor : 'url(#goalStripes)'}
              stroke={selectedTargetZone === 'POST_R' ? highlightBorder : '#ef4444'}
              strokeWidth={selectedTargetZone === 'POST_R' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:brightness-125 shadow-md"
            />
            {selectedTargetZone === 'POST_R' && (
              <text
                x="356"
                y="90"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="8"
                fontWeight="bold"
                pointerEvents="none"
                transform="rotate(90 356 90)"
              >
                POSTE DER
              </text>
            )}
          </g>

          {/* Red de Fondo Decorativa dentro del arco */}
          <rect
            x="153"
            y="40"
            width="194"
            height="94"
            fill="url(#netPattern)"
            pointerEvents="none"
          />

          {/* CUADRÍCULA REAL 3x3 DENTRO DEL ARCO */}
          {[
            { code: 'TL', col: 0, row: 0, label: 'Arr Izq' },
            { code: 'TC', col: 1, row: 0, label: 'Arr Cen' },
            { code: 'TR', col: 2, row: 0, label: 'Arr Der' },
            { code: 'ML', col: 0, row: 1, label: 'Med Izq' },
            { code: 'MC', col: 1, row: 1, label: 'Centro' },
            { code: 'MR', col: 2, row: 1, label: 'Med Der' },
            { code: 'BL', col: 0, row: 2, label: 'Abj Izq' },
            { code: 'BC', col: 1, row: 2, label: 'Abj Cen' },
            { code: 'BR', col: 2, row: 2, label: 'Abj Der' },
          ].map((cell) => {
            const cellW = 194 / 3; // ~64.66
            const cellH = 94 / 3; // ~31.33
            const cellX = 153 + cell.col * cellW;
            const cellY = 40 + cell.row * cellH;
            const isSelected = selectedTargetZone === cell.code;

            return (
              <g
                key={cell.code}
                onClick={() => onSelectTargetZone(cell.code as any)}
                className="cursor-pointer group"
                role="button"
                tabIndex={0}
              >
                <rect
                  x={cellX + 1}
                  y={cellY + 1}
                  width={cellW - 2}
                  height={cellH - 2}
                  rx="3"
                  fill={isSelected ? highlightColor : '#0f172a'}
                  fillOpacity={isSelected ? 1 : 0.65}
                  stroke={isSelected ? highlightBorder : '#64748b'}
                  strokeWidth={isSelected ? '2.5' : '1'}
                  className="transition-all duration-150 group-hover:fill-slate-700/80"
                />
                <text
                  x={cellX + cellW / 2}
                  y={cellY + cellH / 2 + 4}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={isSelected ? '11' : '9.5'}
                  fontWeight={isSelected ? 'bold' : '600'}
                  pointerEvents="none"
                >
                  {cell.code}
                </text>
              </g>
            );
          })}

          {/* ============================================================== */}
          {/* SECCIÓN 2: CANCHA DE BALONMANO (y = 135 a 620) */}
          {/* ============================================================== */}

          {/* Línea de Gol (Goal Line) */}
          <line x1="20" y1="135" x2="480" y2="135" stroke="#ffffff" strokeWidth="2.5" />

          {/* Área de Portería de 6 Metros (Fondo azul profundo con curva de 6m) */}
          <path
            d="M 20 135
               C 80 150, 150 215, 250 218
               C 350 215, 420 150, 480 135
               L 480 135
               Z"
            fill="#1e3a8a"
            fillOpacity="0.85"
            stroke="#ffffff"
            strokeWidth="3.5"
            pointerEvents="none"
          />

          {/* SECTORES DE CANCHA (Superficies exactas y continuas) */}

          {/* 1. Extremo Izquierdo (LW) */}
          <g
            onClick={() => onSelectOriginZone('LW')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 20 135
                 C 38 145, 56 153, 75 162
                 L 85 275
                 L 20 240
                 Z"
              fill={selectedOriginZone === 'LW' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'LW' ? 1 : 0.8}
              stroke={selectedOriginZone === 'LW' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'LW' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="46"
              y="195"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="11"
              fontWeight="bold"
              pointerEvents="none"
            >
              LW
            </text>
            <text
              x="46"
              y="208"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="8"
              pointerEvents="none"
            >
              Extremo Izq
            </text>
          </g>

          {/* 2. 6 Metros Izquierdo (L6) */}
          <g
            onClick={() => onSelectOriginZone('L6')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 75 162
                 C 105 180, 140 200, 180 212
                 L 175 325
                 C 145 310, 115 295, 85 275
                 Z"
              fill={selectedOriginZone === 'L6' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'L6' ? 1 : 0.8}
              stroke={selectedOriginZone === 'L6' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'L6' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="128"
              y="245"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="11"
              fontWeight="bold"
              pointerEvents="none"
            >
              L6
            </text>
            <text
              x="128"
              y="258"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="8"
              pointerEvents="none"
            >
              6m Izq
            </text>
          </g>

          {/* 3. 6 Metros Central / Pivote (C6) */}
          <g
            onClick={() => onSelectOriginZone('C6')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 180 212
                 C 205 216, 225 218, 250 218
                 C 275 218, 295 216, 320 212
                 L 325 325
                 C 300 332, 275 335, 250 335
                 C 225 335, 200 332, 175 325
                 Z"
              fill={selectedOriginZone === 'C6' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'C6' ? 1 : 0.8}
              stroke={selectedOriginZone === 'C6' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'C6' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="250"
              y="235"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="11"
              fontWeight="bold"
              pointerEvents="none"
            >
              C6
            </text>
            <text
              x="250"
              y="248"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="8"
              pointerEvents="none"
            >
              Pivote 6m
            </text>
          </g>

          {/* 4. 6 Metros Derecho (R6) */}
          <g
            onClick={() => onSelectOriginZone('R6')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 320 212
                 C 360 200, 395 180, 425 162
                 L 415 275
                 C 385 295, 355 310, 325 325
                 Z"
              fill={selectedOriginZone === 'R6' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'R6' ? 1 : 0.8}
              stroke={selectedOriginZone === 'R6' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'R6' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="372"
              y="245"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="11"
              fontWeight="bold"
              pointerEvents="none"
            >
              R6
            </text>
            <text
              x="372"
              y="258"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="8"
              pointerEvents="none"
            >
              6m Der
            </text>
          </g>

          {/* 5. Extremo Derecho (RW) */}
          <g
            onClick={() => onSelectOriginZone('RW')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 425 162
                 C 444 153, 462 145, 480 135
                 L 480 240
                 L 415 275
                 Z"
              fill={selectedOriginZone === 'RW' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'RW' ? 1 : 0.8}
              stroke={selectedOriginZone === 'RW' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'RW' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="454"
              y="195"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="11"
              fontWeight="bold"
              pointerEvents="none"
            >
              RW
            </text>
            <text
              x="454"
              y="208"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="8"
              pointerEvents="none"
            >
              Extremo Der
            </text>
          </g>

          {/* Marca / Botón de 7 Metros (7M) */}
          <g
            onClick={() => onSelectOriginZone('7M')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <rect
              x="220"
              y="270"
              width="60"
              height="28"
              rx="8"
              fill={selectedOriginZone === '7M' ? highlightColor : '#1e293b'}
              stroke={selectedOriginZone === '7M' ? highlightBorder : '#ffffff'}
              strokeWidth={selectedOriginZone === '7M' ? '3' : '2'}
              className="transition-all duration-150 group-hover:scale-105"
            />
            <text
              x="250"
              y="288"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12"
              fontWeight="bold"
              pointerEvents="none"
            >
              7m
            </text>
          </g>

          {/* Línea Discontinua de 9 Metros (Curva visual blanca punteada) */}
          <path
            d="M 20 240
               C 85 275, 160 330, 250 335
               C 340 330, 415 275, 480 240"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            strokeDasharray="9 7"
            pointerEvents="none"
          />

          {/* 6. Lateral Izquierdo 9m (L9) */}
          <g
            onClick={() => onSelectOriginZone('L9')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 20 240
                 L 85 275
                 C 115 295, 145 310, 175 325
                 L 150 480
                 L 20 480
                 Z"
              fill={selectedOriginZone === 'L9' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'L9' ? 1 : 0.8}
              stroke={selectedOriginZone === 'L9' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'L9' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="92"
              y="390"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12"
              fontWeight="bold"
              pointerEvents="none"
            >
              L9
            </text>
            <text
              x="92"
              y="405"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9"
              pointerEvents="none"
            >
              Lateral Izq 9m
            </text>
          </g>

          {/* 7. Central 9m (C9) - EXACTAMENTE COMO EN LA REFERENCIA STEAZZI */}
          <g
            onClick={() => onSelectOriginZone('C9')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 175 325
                 C 200 332, 225 335, 250 335
                 C 275 335, 300 332, 325 325
                 L 350 480
                 L 150 480
                 Z"
              fill={selectedOriginZone === 'C9' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'C9' ? 1 : 0.8}
              stroke={selectedOriginZone === 'C9' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'C9' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="250"
              y="400"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="13"
              fontWeight="bold"
              pointerEvents="none"
            >
              C9
            </text>
            <text
              x="250"
              y="416"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9.5"
              fontWeight="600"
              pointerEvents="none"
            >
              Central 9m
            </text>
          </g>

          {/* 8. Lateral Derecho 9m (R9) */}
          <g
            onClick={() => onSelectOriginZone('R9')}
            className="cursor-pointer group"
            role="button"
            tabIndex={0}
          >
            <path
              d="M 325 325
                 C 355 310, 385 295, 415 275
                 L 480 240
                 L 480 480
                 L 350 480
                 Z"
              fill={selectedOriginZone === 'R9' ? highlightColor : '#0f172a'}
              fillOpacity={selectedOriginZone === 'R9' ? 1 : 0.8}
              stroke={selectedOriginZone === 'R9' ? highlightBorder : '#38bdf8'}
              strokeWidth={selectedOriginZone === 'R9' ? '3' : '1.5'}
              className="transition-all duration-150 group-hover:fill-slate-800"
            />
            <text
              x="408"
              y="390"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12"
              fontWeight="bold"
              pointerEvents="none"
            >
              R9
            </text>
            <text
              x="408"
              y="405"
              textAnchor="middle"
              fill="#94a3b8"
              fontSize="9"
              pointerEvents="none"
            >
              Lateral Der 9m
            </text>
          </g>

          {/* ============================================================== */}
          {/* SECCIÓN 3: SECTORES POSTERIORES (y = 480 a 590) */}
          {/* ============================================================== */}
          {mode === 'TURNOVER' ? (
            // En pérdidas: Zona Defensiva y Medio Campo
            <g>
              {/* Zona Defensiva (DEFENSE) */}
              <g
                onClick={() => onSelectOriginZone('DEFENSE')}
                className="cursor-pointer group"
                role="button"
                tabIndex={0}
              >
                <rect
                  x="20"
                  y="485"
                  width="225"
                  height="75"
                  rx="8"
                  fill={selectedOriginZone === 'DEFENSE' ? highlightColor : '#0f172a'}
                  fillOpacity={selectedOriginZone === 'DEFENSE' ? 1 : 0.8}
                  stroke={selectedOriginZone === 'DEFENSE' ? highlightBorder : '#38bdf8'}
                  strokeWidth={selectedOriginZone === 'DEFENSE' ? '3' : '1.5'}
                  className="transition-all duration-150 group-hover:fill-slate-800"
                />
                <text
                  x="132"
                  y="525"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="12"
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  DEFENSA
                </text>
                <text
                  x="132"
                  y="540"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  pointerEvents="none"
                >
                  Zona Defensiva Propia
                </text>
              </g>

              {/* Medio Campo (MIDCOURT) */}
              <g
                onClick={() => onSelectOriginZone('MIDCOURT')}
                className="cursor-pointer group"
                role="button"
                tabIndex={0}
              >
                <rect
                  x="255"
                  y="485"
                  width="225"
                  height="75"
                  rx="8"
                  fill={selectedOriginZone === 'MIDCOURT' ? highlightColor : '#0f172a'}
                  fillOpacity={selectedOriginZone === 'MIDCOURT' ? 1 : 0.8}
                  stroke={selectedOriginZone === 'MIDCOURT' ? highlightBorder : '#38bdf8'}
                  strokeWidth={selectedOriginZone === 'MIDCOURT' ? '3' : '1.5'}
                  className="transition-all duration-150 group-hover:fill-slate-800"
                />
                <text
                  x="367"
                  y="525"
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="12"
                  fontWeight="bold"
                  pointerEvents="none"
                >
                  MEDIO CAMPO
                </text>
                <text
                  x="367"
                  y="540"
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  pointerEvents="none"
                >
                  Zona Central / Transición
                </text>
              </g>
            </g>
          ) : (
            // En tiros: Larga Distancia (LONG)
            <g
              onClick={() => onSelectOriginZone('LONG')}
              className="cursor-pointer group"
              role="button"
              tabIndex={0}
            >
              <rect
                x="20"
                y="485"
                width="460"
                height="75"
                rx="8"
                fill={selectedOriginZone === 'LONG' ? highlightColor : '#0f172a'}
                fillOpacity={selectedOriginZone === 'LONG' ? 1 : 0.8}
                stroke={selectedOriginZone === 'LONG' ? highlightBorder : '#38bdf8'}
                strokeWidth={selectedOriginZone === 'LONG' ? '3' : '1.5'}
                className="transition-all duration-150 group-hover:fill-slate-800"
              />
              <text
                x="250"
                y="525"
                textAnchor="middle"
                fill="#ffffff"
                fontSize="13"
                fontWeight="bold"
                pointerEvents="none"
              >
                LARGA DISTANCIA (LONG)
              </text>
              <text
                x="250"
                y="542"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="9.5"
                pointerEvents="none"
              >
                Campo propio / Mayor a 9 metros
              </text>
            </g>
          )}

          {/* Línea Central de la Cancha (Midcourt line) */}
          <line x1="20" y1="580" x2="480" y2="580" stroke="#ffffff" strokeWidth="3" />
          <text
            x="250"
            y="605"
            textAnchor="middle"
            fill="#64748b"
            fontSize="10"
            fontWeight="bold"
            letterSpacing="2"
          >
            LÍNEA CENTRAL
          </text>
        </svg>

        {/* Botón de Selección Explícita "No observado" */}
        <div className="w-full flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-850">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-semibold">Zona no identificada:</span>
            <button
              type="button"
              onClick={() => onSelectOriginZone('UNKNOWN')}
              className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
                selectedOriginZone === 'UNKNOWN'
                  ? 'bg-rose-600 text-white border-rose-400 font-bold shadow ring-2 ring-rose-400'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Origen no observado
            </button>
          </div>

          {mode === 'SHOT' && shotResult !== 'BLOCKED' && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400 font-semibold">Arco no identificado:</span>
              <button
                type="button"
                onClick={() => onSelectTargetZone('UNKNOWN')}
                className={`px-3 py-1 rounded-lg border text-xs font-semibold transition-all ${
                  selectedTargetZone === 'UNKNOWN'
                    ? 'bg-rose-600 text-white border-rose-400 font-bold shadow ring-2 ring-rose-400'
                    : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                Destino no observado
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
