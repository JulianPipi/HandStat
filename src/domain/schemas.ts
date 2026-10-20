import { z } from 'zod';

// ==========================================
// Identificadores y Tipos Base
// ==========================================
export const UUIDSchema = z.string().uuid();

export const TimestampSchema = z.string().datetime();

// ==========================================
// Esquemas de Equipos y Jugadores
// ==========================================
export const TeamSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1).max(80),
  short_name: z.string().min(2).max(5),
  is_own: z.boolean(),
  color_primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#0284c7'),
  archived: z.boolean().default(false),
  is_demo: z.boolean().optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

export type Team = z.infer<typeof TeamSchema>;

export const PlayerSchema = z.object({
  id: UUIDSchema,
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  default_number: z.number().int().min(0).max(99).optional(),
  position: z.enum(['GK', 'LW', 'LB', 'CB', 'RB', 'RW', 'PV']).optional(),
  is_goalkeeper: z.boolean().default(false),
  team_id: UUIDSchema.optional(), // Equipo habitual opcional
  archived: z.boolean().default(false),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

export type Player = z.infer<typeof PlayerSchema>;

// ==========================================
// Convocatoria / Roster del Partido
// ==========================================
export const MatchRosterSchema = z.object({
  id: UUIDSchema,
  match_id: UUIDSchema,
  team_id: UUIDSchema,
  player_id: UUIDSchema.optional(), // Opcional para rivales anónimos
  shirt_number: z.number().int().min(0).max(99),
  display_name_snapshot: z.string().min(1),
  role: z.enum(['GK', 'FIELD', 'OFFICIAL']),
  position_snapshot: z.string().optional(),
  is_starter: z.boolean(),
});

export type MatchRoster = z.infer<typeof MatchRosterSchema>;

// ==========================================
// Configuración y Partido
// ==========================
export const MatchRulesConfigSchema = z.object({
  periods_count: z.number().int().min(1).max(4).default(2),
  period_duration_ms: z.number().int().min(60000).default(1800000), // 30 min por defecto
  suspension_duration_ms: z.number().int().min(10000).default(120000), // 2 min
  max_roster_size: z.number().int().min(7).max(30).default(16), // Configurable sin límite rígido de 16
});

export type MatchRulesConfig = z.infer<typeof MatchRulesConfigSchema>;

export const MatchPeriodSchema = z.object({
  id: UUIDSchema,
  match_id: UUIDSchema,
  number: z.number().int().min(1).max(4),
  kind: z.enum(['REGULAR', 'EXTRA', 'SHOOTOUT']),
  duration_ms: z.number().int().min(0),
});

export type MatchPeriod = z.infer<typeof MatchPeriodSchema>;

export const MatchSchema = z.object({
  id: UUIDSchema,
  workspace_id: UUIDSchema,
  scheduled_at: TimestampSchema,
  competition: z.string().optional(),
  venue: z.string().optional(),
  status: z.enum(['draft', 'live', 'finished', 'reviewed']),
  detail_level: z.enum(['basic', 'standard', 'full']),
  home_team_id: UUIDSchema,
  away_team_id: UUIDSchema,
  home_team_name_snapshot: z.string().optional(),
  away_team_name_snapshot: z.string().optional(),
  rules_config: MatchRulesConfigSchema,
  match_revision: z.number().int().min(1).default(1),
  is_demo: z.boolean().optional(),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  device_id: UUIDSchema,
});

export type Match = z.infer<typeof MatchSchema>;

// ==========================================
// Eventos y Acciones Deportivas
// ==========================================
export const EventTypeSchema = z.enum([
  'PERIOD_START',
  'PERIOD_END',
  'CLOCK_PAUSE',
  'CLOCK_RESUME',
  'TIMEOUT',
  'LINEUP_SET',
  'SUBSTITUTION',
  'SHOT',
  'SEVEN_M_AWARDED',
  'TURNOVER',
  'SANCTION',
  'DEFENSE_SYSTEM_SET',
  'POSSESSION_SET',
  'NOTE'
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const ShotDetailSchema = z.object({
  result_code: z.enum(['GOAL', 'SAVED', 'MISSED', 'POST', 'BLOCKED']),
  phase_code: z.enum(['POSITIONAL', 'FASTBREAK', 'SECOND_WAVE', 'SEVEN_M', 'EMPTY_NET_LONG']).optional(),
  origin_zone_code: z.enum(['LW', 'L9', 'C9', 'R9', 'RW', 'L6', 'C6', 'R6', '7M', 'LONG', 'DEFENSE', 'MIDCOURT', 'UNKNOWN']).optional(),
  origin_x: z.number().min(0).max(1).optional(),
  origin_y: z.number().min(0).max(1).optional(),
  target_zone_code: z.enum([
    'TL', 'TC', 'TR',
    'ML', 'MC', 'MR',
    'BL', 'BC', 'BR',
    'POST_L', 'POST_R', 'BAR',
    'OUT_L', 'OUT_TOP', 'OUT_R',
    'UNKNOWN'
  ]).optional(),
  target_x: z.number().min(0).max(1).optional(),
  target_y: z.number().min(0).max(1).optional(),
  is_empty_net: z.boolean().default(false),
  numerical_context: z.enum(['EQUAL', 'SUPERIORITY', 'INFERIORITY', 'UNKNOWN']).optional(),
  shot_type: z.string().optional(),
  trajectory: z.string().optional(),
  defense_pressure: z.string().optional(),
});

export type ShotDetail = z.infer<typeof ShotDetailSchema>;

export const TurnoverDetailSchema = z.object({
  reason: z.enum([
    'BAD_PASS',
    'CATCH_ERROR',
    'STEAL',
    'TRAVELING',
    'DOUBLE_DRIBBLE',
    'OFFENSIVE_FOUL',
    'THREE_SECONDS',
    'PASSIVE_PLAY',
    'LINE_VIOLATION',
    'OTHER'
  ]).default('OTHER'),
  forced_by_defense: z.boolean().default(false),
  court_zone: z.enum([
    'LW', 'L9', 'C9', 'R9', 'RW', 'L6', 'C6', 'R6', '7M', 'LONG', 'DEFENSE', 'MIDCOURT', 'UNKNOWN'
  ]).optional(),
});

export type TurnoverDetail = z.infer<typeof TurnoverDetailSchema>;

export const SanctionDetailSchema = z.object({
  kind: z.enum(['YELLOW_CARD', 'TWO_MINUTE', 'RED_CARD', 'BLUE_CARD']),
  duration_ms: z.number().int().min(0).default(120000), // 2 min para exclusión
});

export type SanctionDetail = z.infer<typeof SanctionDetailSchema>;

export const EventParticipantSchema = z.object({
  roster_id: UUIDSchema,
  role: z.enum([
    'SHOOTER',
    'ASSIST',
    'GOALKEEPER',
    'BLOCKER',
    'TURNOVER_BY',
    'RECOVERED_BY',
    'FOULED',
    'FOULER',
    'SANCTIONED',
    'SUB_IN',
    'SUB_OUT',
    'ON_COURT'
  ])
});

export type EventParticipant = z.infer<typeof EventParticipantSchema>;

export const NumericalSituationSchema = z.object({
  own_count: z.number().int().min(0).max(10).optional(),
  rival_count: z.number().int().min(0).max(10).optional(),
  context: z.enum(['EQUAL', 'SUPERIORITY', 'INFERIORITY', 'UNKNOWN', 'INCOMPLETE']).default('UNKNOWN')
});

export type NumericalSituation = z.infer<typeof NumericalSituationSchema>;

export const MatchEventSchema = z.object({
  id: UUIDSchema,
  match_id: UUIDSchema,
  period_id: UUIDSchema,
  match_team_id: UUIDSchema.optional(), // Opcional en eventos neutrales de reloj
  type: EventTypeSchema,
  clock_ms: z.number().int().min(0),
  sport_seq: z.number().int().min(1), // Desempate de orden deportivo para eventos simultáneos
  audit_seq: z.number().int().min(1), // Orden de inserción/registro histórico
  status: z.enum(['active', 'voided']).default('active'),
  payload: z.record(z.any()).default({}),
  shot_detail: ShotDetailSchema.optional(),
  turnover_detail: TurnoverDetailSchema.optional(),
  sanction_detail: SanctionDetailSchema.optional(),
  numerical_situation: NumericalSituationSchema.optional(),
  participants: z.array(EventParticipantSchema).default([]),
  note: z.string().max(500).optional(),
  version: z.number().int().min(1).default(1),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
  device_id: UUIDSchema,
});

export type MatchEvent = z.infer<typeof MatchEventSchema>;

export const EventRevisionSchema = z.object({
  id: UUIDSchema,
  event_id: UUIDSchema,
  match_id: UUIDSchema,
  version: z.number().int().min(1),
  snapshot: z.record(z.any()),
  change_kind: z.enum(['create', 'edit', 'void', 'restore']),
  reason: z.string().optional(),
  changed_at: TimestampSchema,
  device_id: UUIDSchema,
});

export type EventRevision = z.infer<typeof EventRevisionSchema>;

// ==========================================
// Posesiones
// ==========================================
export const MatchPossessionSchema = z.object({
  id: UUIDSchema,
  match_id: UUIDSchema,
  period_id: UUIDSchema,
  team_id: UUIDSchema,
  start_clock_ms: z.number().int().min(0),
  end_clock_ms: z.number().int().min(0).optional(),
  start_event_id: UUIDSchema.optional(),
  end_event_id: UUIDSchema.optional(),
  start_reason: z.enum(['THROW_OFF', 'TURNOVER', 'STEAL', 'GOAL_CONCEDED', 'REBOUND', 'PERIOD_START', 'MANUAL']).default('THROW_OFF'),
  end_reason: z.enum(['GOAL', 'SAVED_REBOUND_OPPONENT', 'MISSED_OPPONENT', 'TURNOVER', 'PERIOD_END', 'MANUAL']).optional(),
  is_complete: z.boolean().default(false),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

export type MatchPossession = z.infer<typeof MatchPossessionSchema>;

// ==========================================
// Participación de Jugadores en Cancha
// ==========================================
export const PlayerParticipationIntervalSchema = z.object({
  id: UUIDSchema,
  match_id: UUIDSchema,
  period_id: UUIDSchema,
  roster_id: UUIDSchema,
  team_id: UUIDSchema,
  in_clock_ms: z.number().int().min(0),
  out_clock_ms: z.number().int().min(0).optional(),
  in_event_id: UUIDSchema.optional(),
  out_event_id: UUIDSchema.optional(),
  role_on_court: z.enum(['GK', 'FIELD']).default('FIELD'),
  is_active: z.boolean().default(true),
  created_at: TimestampSchema,
  updated_at: TimestampSchema,
});

export type PlayerParticipationInterval = z.infer<typeof PlayerParticipationIntervalSchema>;

// ==========================================
// Snapshot de Rescate (Pre-Import Rescue)
// ==========================================
export const MatchRescueSnapshotSchema = z.object({
  id: UUIDSchema,
  match_id: UUIDSchema,
  created_at: TimestampSchema,
  reason: z.string(),
  full_payload: z.record(z.any()), // Serialización íntegra previa
});

export type MatchRescueSnapshot = z.infer<typeof MatchRescueSnapshotSchema>;

// ==========================================
// Sobre de Transferencia JSON (Envelope)
// ==========================================
export const MatchExportEnvelopeSchema = z.object({
  schema_version: z.enum(['1.0.0', '1.1.0']),
  export_kind: z.literal('single_match'),
  exported_at: TimestampSchema,
  exported_by_device_id: UUIDSchema,
  app_version: z.string(),
  full_content_fingerprint: z.string().min(8), // Hash SHA-256 o FNV-1a de toda la estructura transferible
  match: MatchSchema,
  teams: z.array(TeamSchema).min(2).max(2),
  rosters: z.array(MatchRosterSchema),
  periods: z.array(MatchPeriodSchema).min(1),
  events: z.array(MatchEventSchema),
  revisions: z.array(EventRevisionSchema),
  possessions: z.array(MatchPossessionSchema).optional().default([]),
  participations: z.array(PlayerParticipationIntervalSchema).optional().default([]),
});

export type MatchExportEnvelope = z.infer<typeof MatchExportEnvelopeSchema>;

// ==========================================
// Sobre de Respaldo Completo Local (Full Backup)
// ==========================================
export const FullBackupEnvelopeSchema = z.object({
  schema_version: z.literal('1.0.0'),
  backup_kind: z.literal('full_local_database'),
  created_at: TimestampSchema,
  app_version: z.string(),
  counts: z.object({
    teams: z.number().int().nonnegative(),
    players: z.number().int().nonnegative(),
    matches: z.number().int().nonnegative(),
    matchPeriods: z.number().int().nonnegative(),
    matchRosters: z.number().int().nonnegative(),
    matchEvents: z.number().int().nonnegative(),
    eventRevisions: z.number().int().nonnegative(),
    rescueSnapshots: z.number().int().nonnegative(),
    possessions: z.number().int().nonnegative(),
    playerParticipations: z.number().int().nonnegative(),
  }),
  fingerprint: z.string().min(8),
  fingerprint_algorithm: z.enum(['sha-256', 'fnv1a-64']).optional(),
  data: z.object({
    teams: z.array(TeamSchema),
    players: z.array(PlayerSchema),
    matches: z.array(MatchSchema),
    matchPeriods: z.array(MatchPeriodSchema),
    matchRosters: z.array(MatchRosterSchema),
    matchEvents: z.array(MatchEventSchema),
    eventRevisions: z.array(EventRevisionSchema),
    rescueSnapshots: z.array(MatchRescueSnapshotSchema),
    possessions: z.array(MatchPossessionSchema),
    playerParticipations: z.array(PlayerParticipationIntervalSchema),
    clockAnchors: z.array(z.any()).default([]),
    metadata: z.array(z.any()).default([]),
  }),
});

export type FullBackupEnvelope = z.infer<typeof FullBackupEnvelopeSchema>;
