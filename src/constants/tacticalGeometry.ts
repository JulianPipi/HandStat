/**
 * Definiciones canónicas y geométricas compartidas para la Cancha Táctica
 * y el Arco 3x3 de Handball.
 * Reutilizado tanto en el selector En Vivo como en los Mapas de Análisis.
 */

export interface CourtSectorDef {
  code: string;
  name: string;
  shortLabel: string;
  category: 'WING' | '6M' | '9M' | '7M' | 'LONG';
  categoryLabel: string;
  center: { x: number; y: number };
  pathD?: string;
  rect?: { x: number; y: number; width: number; height: number; rx?: number };
}

export interface GoalSectorDef {
  code: string;
  name: string;
  shortLabel: string;
  kind: 'GRID' | 'POST' | 'OUT';
  center: { x: number; y: number };
  rect: { x: number; y: number; width: number; height: number; rx?: number };
}

export const COURT_SECTORS: CourtSectorDef[] = [
  {
    code: 'LW',
    name: 'Extremo Izquierdo',
    shortLabel: 'LW',
    category: 'WING',
    categoryLabel: 'Extremo',
    center: { x: 46, y: 200 },
    pathD: `M 20 135 C 38 145, 56 153, 75 162 L 85 275 L 20 240 Z`,
  },
  {
    code: 'L6',
    name: '6m Lateral Izquierdo',
    shortLabel: 'L6',
    category: '6M',
    categoryLabel: 'Línea de 6m',
    center: { x: 128, y: 245 },
    pathD: `M 75 162 C 105 180, 140 200, 180 212 L 175 325 C 145 310, 115 295, 85 275 Z`,
  },
  {
    code: 'C6',
    name: '6m Central (Pivote)',
    shortLabel: 'C6',
    category: '6M',
    categoryLabel: 'Línea de 6m',
    center: { x: 250, y: 242 },
    pathD: `M 180 212 C 205 216, 225 218, 250 218 C 275 218, 295 216, 320 212 L 325 325 C 300 332, 275 335, 250 335 C 225 335, 200 332, 175 325 Z`,
  },
  {
    code: 'R6',
    name: '6m Lateral Derecho',
    shortLabel: 'R6',
    category: '6M',
    categoryLabel: 'Línea de 6m',
    center: { x: 372, y: 245 },
    pathD: `M 320 212 C 360 200, 395 180, 425 162 L 415 275 C 385 295, 355 310, 325 325 Z`,
  },
  {
    code: 'RW',
    name: 'Extremo Derecho',
    shortLabel: 'RW',
    category: 'WING',
    categoryLabel: 'Extremo',
    center: { x: 454, y: 200 },
    pathD: `M 425 162 C 444 153, 462 145, 480 135 L 480 240 L 415 275 Z`,
  },
  {
    code: '7M',
    name: 'Penal de 7 Metros',
    shortLabel: '7m',
    category: '7M',
    categoryLabel: 'Penal 7m',
    center: { x: 250, y: 284 },
    rect: { x: 220, y: 270, width: 60, height: 28, rx: 8 },
  },
  {
    code: 'L9',
    name: '9m Lateral Izquierdo',
    shortLabel: 'L9',
    category: '9M',
    categoryLabel: 'Exterior 9m',
    center: { x: 92, y: 395 },
    pathD: `M 20 240 L 85 275 C 115 295, 145 310, 175 325 L 150 480 L 20 480 Z`,
  },
  {
    code: 'C9',
    name: '9m Central',
    shortLabel: 'C9',
    category: '9M',
    categoryLabel: 'Exterior 9m',
    center: { x: 250, y: 405 },
    pathD: `M 175 325 C 200 332, 225 335, 250 335 C 275 335, 300 332, 325 325 L 350 480 L 150 480 Z`,
  },
  {
    code: 'R9',
    name: '9m Lateral Derecho',
    shortLabel: 'R9',
    category: '9M',
    categoryLabel: 'Exterior 9m',
    center: { x: 408, y: 395 },
    pathD: `M 325 325 C 355 310, 385 295, 415 275 L 480 240 L 480 480 L 350 480 Z`,
  },
  {
    code: 'LONG',
    name: 'Larga Distancia / Contragolpe',
    shortLabel: 'Largo',
    category: 'LONG',
    categoryLabel: 'Larga Distancia',
    center: { x: 250, y: 545 },
    rect: { x: 20, y: 505, width: 460, height: 75, rx: 12 },
  },
];

export const GOAL_GRID_SECTORS: GoalSectorDef[] = [
  // Fila Superior
  { code: 'TL', name: 'Ángulo Superior Izquierdo', shortLabel: 'TL', kind: 'GRID', center: { x: 185, y: 55 }, rect: { x: 154, y: 41, width: 62.6, height: 29.3, rx: 3 } },
  { code: 'TC', name: 'Arriba al Centro', shortLabel: 'TC', kind: 'GRID', center: { x: 250, y: 55 }, rect: { x: 218.6, y: 41, width: 62.6, height: 29.3, rx: 3 } },
  { code: 'TR', name: 'Ángulo Superior Derecho', shortLabel: 'TR', kind: 'GRID', center: { x: 315, y: 55 }, rect: { x: 283.3, y: 41, width: 62.6, height: 29.3, rx: 3 } },
  // Fila Media
  { code: 'ML', name: 'Medio Izquierdo', shortLabel: 'ML', kind: 'GRID', center: { x: 185, y: 86 }, rect: { x: 154, y: 72.3, width: 62.6, height: 29.3, rx: 3 } },
  { code: 'MC', name: 'Centro del Arco', shortLabel: 'MC', kind: 'GRID', center: { x: 250, y: 86 }, rect: { x: 218.6, y: 72.3, width: 62.6, height: 29.3, rx: 3 } },
  { code: 'MR', name: 'Medio Derecho', shortLabel: 'MR', kind: 'GRID', center: { x: 315, y: 86 }, rect: { x: 283.3, y: 72.3, width: 62.6, height: 29.3, rx: 3 } },
  // Fila Baja
  { code: 'BL', name: 'Abajo a la Izquierda', shortLabel: 'BL', kind: 'GRID', center: { x: 185, y: 118 }, rect: { x: 154, y: 103.6, width: 62.6, height: 29.3, rx: 3 } },
  { code: 'BC', name: 'Abajo al Centro', shortLabel: 'BC', kind: 'GRID', center: { x: 250, y: 118 }, rect: { x: 218.6, y: 103.6, width: 62.6, height: 29.3, rx: 3 } },
  { code: 'BR', name: 'Abajo a la Derecha', shortLabel: 'BR', kind: 'GRID', center: { x: 315, y: 118 }, rect: { x: 283.3, y: 103.6, width: 62.6, height: 29.3, rx: 3 } },
];

export const GOAL_POSTS_AND_OUT_SECTORS: GoalSectorDef[] = [
  { code: 'OUT_TOP', name: 'Fuera Arriba (Alto)', shortLabel: 'Fuera Alto', kind: 'OUT', center: { x: 250, y: 11 }, rect: { x: 135, y: 2, width: 230, height: 18, rx: 6 } },
  { code: 'OUT_L', name: 'Fuera Izquierda (Desviado)', shortLabel: 'Fuera Izq', kind: 'OUT', center: { x: 86, y: 75 }, rect: { x: 45, y: 24, width: 82, height: 110, rx: 8 } },
  { code: 'OUT_R', name: 'Fuera Derecha (Desviado)', shortLabel: 'Fuera Der', kind: 'OUT', center: { x: 414, y: 75 }, rect: { x: 373, y: 24, width: 82, height: 110, rx: 8 } },
  { code: 'BAR', name: 'Travesaño', shortLabel: 'Travesaño', kind: 'POST', center: { x: 250, y: 29 }, rect: { x: 130, y: 22, width: 240, height: 16, rx: 3 } },
  { code: 'POST_L', name: 'Poste Izquierdo', shortLabel: 'Poste Izq', kind: 'POST', center: { x: 144, y: 87 }, rect: { x: 135, y: 40, width: 18, height: 94, rx: 2 } },
  { code: 'POST_R', name: 'Poste Derecho', shortLabel: 'Poste Der', kind: 'POST', center: { x: 356, y: 87 }, rect: { x: 347, y: 40, width: 18, height: 94, rx: 2 } },
];

export const ALL_GOAL_SECTORS = [...GOAL_GRID_SECTORS, ...GOAL_POSTS_AND_OUT_SECTORS];

export const SPANISH_ZONE_NAMES: Record<string, string> = {
  LW: 'Extremo Izquierdo',
  L6: '6m Lateral Izquierdo',
  C6: '6m Central (Pivote)',
  R6: '6m Lateral Derecho',
  RW: 'Extremo Derecho',
  '7M': 'Penal de 7 Metros',
  L9: '9m Lateral Izquierdo',
  C9: '9m Central',
  R9: '9m Lateral Derecho',
  LONG: 'Larga Distancia / Contragolpe',
  DEFENSE: 'Zona Defensiva Propia',
  MIDCOURT: 'Mitad de Cancha',
  UNKNOWN: 'Zona Desconocida / No Observada',
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
  OUT_TOP: 'Fuera Arriba (Alto)',
  OUT_L: 'Fuera Izquierda (Desviado)',
  OUT_R: 'Fuera Derecha (Desviado)',
};
