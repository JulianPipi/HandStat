import { HandballDatabase } from '../data/db';
import type { Team, Match, MatchPeriod, MatchRoster, MatchEvent, MatchPossession, PlayerParticipationInterval } from '../domain/schemas';

export const DEMO_WORKSPACE_ID = '018f1a2b-0000-7e8f-9a0b-000000000001';
export const DEMO_DEVICE_ID = '8f8b8682-628a-4c4c-9f87-c12e8b9f0123';

// Identificadores fijos y deterministas para entornos de demostración
export const DEMO_TEAM_A_ID = '018f1a2b-aaaa-7e8f-9a0b-000000000001';
export const DEMO_TEAM_B_ID = '018f1a2b-bbbb-7e8f-9a0b-000000000002';

export const DEMO_MATCH_PRACTICE_ID = '018f1a2b-3c4d-7e8f-9a0b-111111111111';
export const DEMO_MATCH_FINISHED_ID = '018f1a2b-3c4d-7e8f-9a0b-222222222222';

// IDs antiguos que deben ser limpiados si existen
export const LEGACY_SEED_MATCH_ID = '018f1a2b-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
export const LEGACY_HOME_TEAM_ID = '018f1a2b-3333-7e8f-9a0b-000000000004';
export const LEGACY_AWAY_TEAM_ID = '018f1a2b-4444-7e8f-9a0b-000000000005';

export const DEMO_TEAM_A: Team = {
  id: DEMO_TEAM_A_ID,
  name: 'Equipo Demo A (Demostración)',
  short_name: 'DMA',
  is_own: true,
  color_primary: '#0284c7', // Azul zafiro
  archived: false,
  is_demo: true,
  created_at: '2026-10-19T10:00:00.000Z',
  updated_at: '2026-10-19T10:00:00.000Z',
};

export const DEMO_TEAM_B: Team = {
  id: DEMO_TEAM_B_ID,
  name: 'Equipo Demo B (Demostración)',
  short_name: 'DMB',
  is_own: false,
  color_primary: '#16a34a', // Verde esmeralda
  archived: false,
  is_demo: true,
  created_at: '2026-10-19T10:00:00.000Z',
  updated_at: '2026-10-19T10:00:00.000Z',
};

// 1. PARTIDO DE PRÁCTICA (Limpio, 1T activo, 0 eventos, listo para practicar)
export const DEMO_PRACTICE_MATCH: Match = {
  id: DEMO_MATCH_PRACTICE_ID,
  workspace_id: DEMO_WORKSPACE_ID,
  scheduled_at: '2026-10-19T18:00:00.000Z',
  venue: 'Polideportivo Municipal Demo',
  competition: 'Torneo de Demostración (Práctica En Vivo)',
  status: 'live',
  detail_level: 'standard',
  home_team_id: DEMO_TEAM_A.id,
  away_team_id: DEMO_TEAM_B.id,
  home_team_name_snapshot: DEMO_TEAM_A.name,
  away_team_name_snapshot: DEMO_TEAM_B.name,
  rules_config: {
    periods_count: 2,
    period_duration_ms: 1800000, // 30 min
    suspension_duration_ms: 120000, // 2 min
    max_roster_size: 16,
  },
  match_revision: 1,
  is_demo: true,
  created_at: '2026-10-19T10:00:00.000Z',
  updated_at: '2026-10-19T10:00:00.000Z',
  device_id: DEMO_DEVICE_ID,
};

export const DEMO_PRACTICE_PERIOD_1: MatchPeriod = {
  id: '018f1a2b-7777-7e8f-9a0b-111111111101',
  match_id: DEMO_MATCH_PRACTICE_ID,
  number: 1,
  kind: 'REGULAR',
  duration_ms: 1800000,
};

export const DEMO_PRACTICE_PERIOD_2: MatchPeriod = {
  id: '018f1a2b-7777-7e8f-9a0b-111111111102',
  match_id: DEMO_MATCH_PRACTICE_ID,
  number: 2,
  kind: 'REGULAR',
  duration_ms: 1800000,
};

// Convocatoria de práctica (con titulares, banco, arqueros y pareja de cambio defensa-ataque)
export const DEMO_PRACTICE_ROSTERS: MatchRoster[] = [
  // Equipo Demo A
  { id: '018f1a2b-5555-7e8f-9a0b-110000000001', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 1, display_name_snapshot: '1 · Leonel Maciel (GK)', role: 'GK', position_snapshot: 'GK', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000002', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 2, display_name_snapshot: '2 · Federico Fernández (LW)', role: 'FIELD', position_snapshot: 'LW', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000003', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 4, display_name_snapshot: '4 · Sebastián Simonet (CB)', role: 'FIELD', position_snapshot: 'CB', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000004', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 6, display_name_snapshot: '6 · Diego Simonet (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000005', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 7, display_name_snapshot: '7 · Federico Pizarro (RW)', role: 'FIELD', position_snapshot: 'RW', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000006', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 9, display_name_snapshot: '9 · Lucas Moscariello (PV)', role: 'FIELD', position_snapshot: 'PV', is_starter: true },
  // Banco y pareja defensa-ataque (James Parker defensa / Diego Simonet ataque)
  { id: '018f1a2b-5555-7e8f-9a0b-110000000007', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 23, display_name_snapshot: '23 · James Parker (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: false },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000008', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 10, display_name_snapshot: '10 · Pedro Martínez Cami (CB)', role: 'FIELD', position_snapshot: 'CB', is_starter: false },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000009', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 3, display_name_snapshot: '3 · Pablo Simonet (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: false },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000010', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_A.id, shirt_number: 12, display_name_snapshot: '12 · Juan Bar (GK)', role: 'GK', position_snapshot: 'GK', is_starter: false },

  // Equipo Demo B
  { id: '018f1a2b-5555-7e8f-9a0b-110000000021', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 12, display_name_snapshot: '12 · Agustín Forlino (GK)', role: 'GK', position_snapshot: 'GK', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000022', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 11, display_name_snapshot: '11 · Ignacio Pizarro (LW)', role: 'FIELD', position_snapshot: 'LW', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000023', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 8, display_name_snapshot: '8 · Pablo Vainstein (RB)', role: 'FIELD', position_snapshot: 'RB', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000024', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 15, display_name_snapshot: '15 · Gonzalo Pérez Arce (RW)', role: 'FIELD', position_snapshot: 'RW', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000025', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 16, display_name_snapshot: '16 · Gonzalo Carou (PV)', role: 'FIELD', position_snapshot: 'PV', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000026', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 77, display_name_snapshot: '77 · Nicolás Bonanno (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: true },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000027', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 18, display_name_snapshot: '18 · Guillermo Fischer (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: false },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000028', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 13, display_name_snapshot: '13 · Santiago Baronetto (RW)', role: 'FIELD', position_snapshot: 'RW', is_starter: false },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000029', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 1, display_name_snapshot: '1 · Mariano Cánepa (PV)', role: 'FIELD', position_snapshot: 'PV', is_starter: false },
  { id: '018f1a2b-5555-7e8f-9a0b-110000000030', match_id: DEMO_MATCH_PRACTICE_ID, team_id: DEMO_TEAM_B.id, shirt_number: 88, display_name_snapshot: '88 · Manuel Crivelli (CB)', role: 'FIELD', position_snapshot: 'CB', is_starter: false },
];

// 2. PARTIDO DE DEMOSTRACIÓN FINALIZADO (28 - 26, estadísticas completas y reconciliadas)
export const DEMO_FINISHED_MATCH: Match = {
  id: DEMO_MATCH_FINISHED_ID,
  workspace_id: DEMO_WORKSPACE_ID,
  scheduled_at: '2026-10-18T19:00:00.000Z',
  venue: 'Microestadio Demo',
  competition: 'Liga de Honor Metropolitana (Partido Demo Finalizado)',
  status: 'finished',
  detail_level: 'full',
  home_team_id: DEMO_TEAM_A.id,
  away_team_id: DEMO_TEAM_B.id,
  home_team_name_snapshot: DEMO_TEAM_A.name,
  away_team_name_snapshot: DEMO_TEAM_B.name,
  rules_config: {
    periods_count: 2,
    period_duration_ms: 1800000,
    suspension_duration_ms: 120000,
    max_roster_size: 16,
  },
  match_revision: 2,
  is_demo: true,
  created_at: '2026-10-18T10:00:00.000Z',
  updated_at: '2026-10-18T20:45:00.000Z',
  device_id: DEMO_DEVICE_ID,
};

export const DEMO_FINISHED_PERIOD_1: MatchPeriod = {
  id: '018f1a2b-7777-7e8f-9a0b-222222222201',
  match_id: DEMO_MATCH_FINISHED_ID,
  number: 1,
  kind: 'REGULAR',
  duration_ms: 1800000,
};

export const DEMO_FINISHED_PERIOD_2: MatchPeriod = {
  id: '018f1a2b-7777-7e8f-9a0b-222222222202',
  match_id: DEMO_MATCH_FINISHED_ID,
  number: 2,
  kind: 'REGULAR',
  duration_ms: 1800000,
};

// Generador de convocatorias y eventos reconciliados para el partido terminado
export function generateFinishedMatchRostersAndEvents(): {
  rosters: MatchRoster[];
  periods: MatchPeriod[];
  events: MatchEvent[];
  possessions: MatchPossession[];
  participations: PlayerParticipationInterval[];
} {
  const p1 = DEMO_FINISHED_PERIOD_1;
  const p2 = DEMO_FINISHED_PERIOD_2;

  // Rosters para el partido finalizado
  const rosters: MatchRoster[] = [
    // Equipo Demo A
    { id: '018f1a2b-5555-7e8f-9a0b-220000000001', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_A.id, shirt_number: 1, display_name_snapshot: '1 · Leonel Maciel (GK)', role: 'GK', position_snapshot: 'GK', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000002', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_A.id, shirt_number: 2, display_name_snapshot: '2 · Federico Fernández (LW)', role: 'FIELD', position_snapshot: 'LW', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000003', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_A.id, shirt_number: 4, display_name_snapshot: '4 · Sebastián Simonet (CB)', role: 'FIELD', position_snapshot: 'CB', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000004', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_A.id, shirt_number: 6, display_name_snapshot: '6 · Diego Simonet (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000005', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_A.id, shirt_number: 7, display_name_snapshot: '7 · Federico Pizarro (RW)', role: 'FIELD', position_snapshot: 'RW', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000006', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_A.id, shirt_number: 9, display_name_snapshot: '9 · Lucas Moscariello (PV)', role: 'FIELD', position_snapshot: 'PV', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000007', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_A.id, shirt_number: 23, display_name_snapshot: '23 · James Parker (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: false },
    // Equipo Demo B
    { id: '018f1a2b-5555-7e8f-9a0b-220000000021', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_B.id, shirt_number: 12, display_name_snapshot: '12 · Agustín Forlino (GK)', role: 'GK', position_snapshot: 'GK', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000022', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_B.id, shirt_number: 11, display_name_snapshot: '11 · Ignacio Pizarro (LW)', role: 'FIELD', position_snapshot: 'LW', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000023', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_B.id, shirt_number: 8, display_name_snapshot: '8 · Pablo Vainstein (RB)', role: 'FIELD', position_snapshot: 'RB', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000024', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_B.id, shirt_number: 15, display_name_snapshot: '15 · Gonzalo Pérez Arce (RW)', role: 'FIELD', position_snapshot: 'RW', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000025', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_B.id, shirt_number: 16, display_name_snapshot: '16 · Gonzalo Carou (PV)', role: 'FIELD', position_snapshot: 'PV', is_starter: true },
    { id: '018f1a2b-5555-7e8f-9a0b-220000000026', match_id: DEMO_MATCH_FINISHED_ID, team_id: DEMO_TEAM_B.id, shirt_number: 77, display_name_snapshot: '77 · Nicolás Bonanno (LB)', role: 'FIELD', position_snapshot: 'LB', is_starter: true },
  ];

  const events: MatchEvent[] = [];
  const possessions: MatchPossession[] = [];
  const participations: PlayerParticipationInterval[] = [];

  // Definición de acciones representativas:
  // 1. Gol de extremo LW (Federico Fernández)
  // 2. Gol de 9m Central C9 (Diego Simonet)
  // 3. Gol de penal 7M (Federico Pizarro)
  // 4. Gol de pivote 6m C6 (Lucas Moscariello)
  // 5. Gol de arco a arco a portería vacía (Leonel Maciel)
  // 6. Atajada de Agustín Forlino ante tiro de Sebastián Simonet
  // 7. Tiro al poste de Federico Fernández (POST_L)
  // 8. Pérdida por pasos (TRAVELING) en C9
  // 9. Pérdida por mal pase (BAD_PASS) en L9 recuperada por Nicolás Bonanno (STEAL)
  // 10. Bloqueo defensivo (BLOCKED)
  // 11. Exclusión disciplinaria 2 minutos (TWO_MINUTE) a Nicolás Bonanno

  const now = '2026-10-18T19:00:00.000Z';
  let seq = 1;
  const addEvent = (evData: Partial<MatchEvent>): MatchEvent => {
    const ev: MatchEvent = {
      id: `018f1a2b-ee00-7e8f-9a0b-${seq.toString().padStart(12, '0')}`,
      match_id: DEMO_MATCH_FINISHED_ID,
      period_id: p1.id,
      clock_ms: 60000 * seq,
      sport_seq: seq,
      audit_seq: seq,
      status: 'active',
      type: 'SHOT',
      participants: [],
      created_at: '2026-10-18T19:00:00.000Z',
      ...evData,
    } as MatchEvent;
    seq++;
    events.push(ev);
    return ev;
  };

  const addPossession = (pData: Omit<MatchPossession, 'created_at' | 'updated_at'>): MatchPossession => {
    const p: MatchPossession = {
      ...pData,
      created_at: now,
      updated_at: now,
    };
    possessions.push(p);
    return p;
  };

  // 1. Inicio de período 1
  addEvent({
    type: 'PERIOD_START',
    clock_ms: 0,
    match_team_id: DEMO_TEAM_A.id,
    note: 'Inicio de partido - Saque de centro Equipo Demo A',
  });

  // Posesión 1: DMA anota gol desde LW
  const ev1 = addEvent({
    type: 'SHOT',
    clock_ms: 45000,
    match_team_id: DEMO_TEAM_A.id,
    participants: [
      { role: 'SHOOTER', roster_id: rosters[1]!.id },
      { role: 'GOALKEEPER', roster_id: rosters[7]!.id },
    ],
    shot_detail: {
      origin_zone_code: 'LW',
      target_zone_code: 'TR',
      result_code: 'GOAL',
      shot_type: 'JUMP',
      phase_code: 'POSITIONAL',
      is_empty_net: false,
    },
    payload: { score_snapshot: { home: 1, away: 0 } },
  });

  addPossession({
    id: '018f1a2b-pp00-7e8f-9a0b-000000000001',
    match_id: DEMO_MATCH_FINISHED_ID,
    period_id: p1.id,
    team_id: DEMO_TEAM_A.id,
    start_clock_ms: 0,
    end_clock_ms: 45000,
    start_reason: 'PERIOD_START',
    end_reason: 'GOAL',
    end_event_id: ev1.id,
    is_complete: true,
  });

  // Posesión 2: DMB anota gol desde C6 (Pivote Gonzalo Carou)
  const ev2 = addEvent({
    type: 'SHOT',
    clock_ms: 95000,
    match_team_id: DEMO_TEAM_B.id,
    participants: [
      { role: 'SHOOTER', roster_id: rosters[11]!.id },
      { role: 'GOALKEEPER', roster_id: rosters[0]!.id },
    ],
    shot_detail: {
      origin_zone_code: 'C6',
      target_zone_code: 'BL',
      result_code: 'GOAL',
      shot_type: 'STANDING',
      phase_code: 'POSITIONAL',
      is_empty_net: false,
    },
    payload: { score_snapshot: { home: 1, away: 1 } },
  });

  addPossession({
    id: '018f1a2b-pp00-7e8f-9a0b-000000000002',
    match_id: DEMO_MATCH_FINISHED_ID,
    period_id: p1.id,
    team_id: DEMO_TEAM_B.id,
    start_clock_ms: 45000,
    end_clock_ms: 95000,
    start_reason: 'GOAL_CONCEDED',
    end_reason: 'GOAL',
    end_event_id: ev2.id,
    is_complete: true,
  });

  // Posesión 3: DMA gol desde 9m Central (Diego Simonet)
  const ev3 = addEvent({
    type: 'SHOT',
    clock_ms: 145000,
    match_team_id: DEMO_TEAM_A.id,
    participants: [
      { role: 'SHOOTER', roster_id: rosters[3]!.id },
      { role: 'GOALKEEPER', roster_id: rosters[7]!.id },
    ],
    shot_detail: {
      origin_zone_code: 'C9',
      target_zone_code: 'TL',
      result_code: 'GOAL',
      shot_type: 'JUMP',
      phase_code: 'POSITIONAL',
      is_empty_net: false,
    },
    payload: { score_snapshot: { home: 2, away: 1 } },
  });

  addPossession({
    id: '018f1a2b-pp00-7e8f-9a0b-000000000003',
    match_id: DEMO_MATCH_FINISHED_ID,
    period_id: p1.id,
    team_id: DEMO_TEAM_A.id,
    start_clock_ms: 95000,
    end_clock_ms: 145000,
    start_reason: 'GOAL_CONCEDED',
    end_reason: 'GOAL',
    end_event_id: ev3.id,
    is_complete: true,
  });

  // Posesión 4: DMB pierde balón por pasos (TRAVELING) en C9
  const ev4 = addEvent({
    type: 'TURNOVER',
    clock_ms: 185000,
    match_team_id: DEMO_TEAM_B.id,
    participants: [{ role: 'TURNOVER_BY', roster_id: rosters[9]!.id }],
    turnover_detail: {
      reason: 'TRAVELING',
      court_zone: 'C9',
      forced_by_defense: false,
    },
  });

  addPossession({
    id: '018f1a2b-pp00-7e8f-9a0b-000000000004',
    match_id: DEMO_MATCH_FINISHED_ID,
    period_id: p1.id,
    team_id: DEMO_TEAM_B.id,
    start_clock_ms: 145000,
    end_clock_ms: 185000,
    start_reason: 'GOAL_CONCEDED',
    end_reason: 'TURNOVER',
    end_event_id: ev4.id,
    is_complete: true,
  });

  // Posesión 5: DMA gol de arquero a arco vacío (Leonel Maciel, arco a arco)
  const ev5 = addEvent({
    type: 'SHOT',
    clock_ms: 210000,
    match_team_id: DEMO_TEAM_A.id,
    participants: [{ role: 'SHOOTER', roster_id: rosters[0]!.id }],
    shot_detail: {
      origin_zone_code: 'LONG',
      target_zone_code: 'MC',
      result_code: 'GOAL',
      shot_type: 'GOAL_TO_GOAL',
      is_empty_net: true,
      phase_code: 'EMPTY_NET_LONG',
    },
    note: 'Gol de arco a arco a portería vacía',
    payload: { score_snapshot: { home: 3, away: 1 } },
  });

  addPossession({
    id: '018f1a2b-pp00-7e8f-9a0b-000000000005',
    match_id: DEMO_MATCH_FINISHED_ID,
    period_id: p1.id,
    team_id: DEMO_TEAM_A.id,
    start_clock_ms: 185000,
    end_clock_ms: 210000,
    start_reason: 'TURNOVER',
    end_reason: 'GOAL',
    end_event_id: ev5.id,
    is_complete: true,
  });

  // Posesión 6: DMB tiro con atajada de Leonel Maciel (SAVED en BR)
  const ev6 = addEvent({
    type: 'SHOT',
    clock_ms: 260000,
    match_team_id: DEMO_TEAM_B.id,
    participants: [
      { role: 'SHOOTER', roster_id: rosters[10]!.id },
      { role: 'GOALKEEPER', roster_id: rosters[0]!.id },
    ],
    shot_detail: {
      origin_zone_code: 'R9',
      target_zone_code: 'BR',
      result_code: 'SAVED',
      shot_type: 'JUMP',
      is_empty_net: false,
    },
  });

  addPossession({
    id: '018f1a2b-pp00-7e8f-9a0b-000000000006',
    match_id: DEMO_MATCH_FINISHED_ID,
    period_id: p1.id,
    team_id: DEMO_TEAM_B.id,
    start_clock_ms: 210000,
    end_clock_ms: 260000,
    start_reason: 'GOAL_CONCEDED',
    end_reason: 'SAVED_REBOUND_OPPONENT',
    end_event_id: ev6.id,
    is_complete: true,
  });

  // Posesión 7: Sanción 2 minutos a Nicolás Bonanno y Penal 7m convertido por Federico Pizarro
  addEvent({
    type: 'SANCTION',
    clock_ms: 295000,
    match_team_id: DEMO_TEAM_B.id,
    participants: [{ role: 'SANCTIONED', roster_id: rosters[12]!.id }],
    sanction_detail: {
      kind: 'TWO_MINUTE',
      duration_ms: 120000,
    },
    note: 'Exclusión 2 minutos',
  });

  const ev8 = addEvent({
    type: 'SHOT',
    clock_ms: 310000,
    match_team_id: DEMO_TEAM_A.id,
    participants: [
      { role: 'SHOOTER', roster_id: rosters[4]!.id },
      { role: 'GOALKEEPER', roster_id: rosters[7]!.id },
    ],
    shot_detail: {
      origin_zone_code: '7M',
      target_zone_code: 'TR',
      result_code: 'GOAL',
      shot_type: 'PENALTY',
      is_empty_net: false,
    },
    payload: { score_snapshot: { home: 4, away: 1 } },
  });

  addPossession({
    id: '018f1a2b-pp00-7e8f-9a0b-000000000007',
    match_id: DEMO_MATCH_FINISHED_ID,
    period_id: p1.id,
    team_id: DEMO_TEAM_A.id,
    start_clock_ms: 260000,
    end_clock_ms: 310000,
    start_reason: 'REBOUND',
    end_reason: 'GOAL',
    end_event_id: ev8.id,
    is_complete: true,
  });

  // Participaciones representativas de jugadores
  for (const r of rosters) {
    if (r.is_starter) {
      participations.push({
        id: `018f1a2b-par0-7e8f-9a0b-${r.id.slice(-12)}`,
        match_id: DEMO_MATCH_FINISHED_ID,
        period_id: p1.id,
        roster_id: r.id,
        team_id: r.team_id,
        in_clock_ms: 0,
        out_clock_ms: 1800000,
        role_on_court: r.role === 'GK' ? 'GK' : 'FIELD',
        is_active: false,
        created_at: now,
        updated_at: now,
      });
    }
  }

  return { rosters, periods: [p1, p2], events, possessions, participations };
}

/**
 * Limpia datos demostrativos antiguos de forma quirúrgica (solo por ID conocido)
 * y puebla el nuevo entorno de demostración sin tocar datos creados por el usuario.
 */
export async function cleanLegacySeedDataAndInitDemo(db: HandballDatabase): Promise<{
  cleanedLegacyMatches: number;
  initializedDemo: boolean;
}> {
  let cleanedCount = 0;
  let initialized = false;

  await db.transaction(
    'rw',
    [
      db.matches,
      db.teams,
      db.matchPeriods,
      db.matchRosters,
      db.matchEvents,
      db.eventRevisions,
      db.possessions,
      db.playerParticipations,
      db.metadata,
    ],
    async () => {
      // 1. Identificar y remover partidos de prueba legacy y temporales (SOLO por IDs conocidos)
      const allMatches = await db.matches.toArray();
      const legacyMatches = allMatches.filter(
        (m) =>
          m.id === LEGACY_SEED_MATCH_ID ||
          m.id.startsWith('test-flow-') ||
          m.id.startsWith('test-match-')
      );

      for (const m of legacyMatches) {
        await db.matches.delete(m.id);
        await db.matchPeriods.where('match_id').equals(m.id).delete();
        await db.matchRosters.where('match_id').equals(m.id).delete();
        await db.matchEvents.where('match_id').equals(m.id).delete();
        await db.possessions.where('match_id').equals(m.id).delete();
        await db.playerParticipations.where('match_id').equals(m.id).delete();
        cleanedCount++;
      }

      // Remover equipos seed legacy solo si no tienen partidos de usuario vinculados
      const userMatchesWithLegacyHome = allMatches.some(
        (m) => !legacyMatches.some((lm) => lm.id === m.id) && m.home_team_id === LEGACY_HOME_TEAM_ID
      );
      if (!userMatchesWithLegacyHome) {
        await db.teams.delete(LEGACY_HOME_TEAM_ID);
      }

      const userMatchesWithLegacyAway = allMatches.some(
        (m) => !legacyMatches.some((lm) => lm.id === m.id) && m.away_team_id === LEGACY_AWAY_TEAM_ID
      );
      if (!userMatchesWithLegacyAway) {
        await db.teams.delete(LEGACY_AWAY_TEAM_ID);
      }

      // 2. Comprobar si ya existe el nuevo entorno de demostración
      const demoPracticeExists = await db.matches.get(DEMO_MATCH_PRACTICE_ID);
      if (!demoPracticeExists) {
        // Crear Equipos Demo A y B
        await db.teams.bulkPut([DEMO_TEAM_A, DEMO_TEAM_B]);

        // Crear Partido de Práctica
        await db.matches.put(DEMO_PRACTICE_MATCH);
        await db.matchPeriods.bulkPut([DEMO_PRACTICE_PERIOD_1, DEMO_PRACTICE_PERIOD_2]);
        await db.matchRosters.bulkPut(DEMO_PRACTICE_ROSTERS);

        // Crear Partido Finalizado con estadísticas y eventos reconciliados
        const finishedData = generateFinishedMatchRostersAndEvents();
        await db.matches.put(DEMO_FINISHED_MATCH);
        await db.matchPeriods.bulkPut(finishedData.periods);
        await db.matchRosters.bulkPut(finishedData.rosters);
        await db.matchEvents.bulkPut(finishedData.events);
        await db.possessions.bulkPut(finishedData.possessions);
        await db.playerParticipations.bulkPut(finishedData.participations);

        // Registrar versión del entorno demo en metadata para evitar ejecuciones repetidas
        await db.metadata.put({ key: 'demo_environment_version', value: '2.0.0' });
        initialized = true;
      }
    }
  );

  return { cleanedLegacyMatches: cleanedCount, initializedDemo: initialized };
}

// Alias para compatibilidad con suites de pruebas existentes
export const seedInitialDataIfEmpty = cleanLegacySeedDataAndInitDemo;
export const SEED_MATCH = DEMO_PRACTICE_MATCH;
export const SEED_PERIOD_1 = DEMO_PRACTICE_PERIOD_1;
export const SEED_PERIOD_2 = DEMO_PRACTICE_PERIOD_2;
export const SEED_ROSTERS = DEMO_PRACTICE_ROSTERS;
export const SEED_HOME_TEAM = DEMO_TEAM_A;
export const SEED_AWAY_TEAM = DEMO_TEAM_B;
