import Dexie, { type Table } from 'dexie';
import type {
  Team,
  Player,
  Match,
  MatchPeriod,
  MatchRoster,
  MatchEvent,
  EventRevision,
  MatchRescueSnapshot,
  MatchPossession,
  PlayerParticipationInterval
} from '../domain/schemas';

export interface ClockAnchorState {
  match_id: string;
  period_id: string;
  running: boolean;
  accumulated_ms: number;
  anchor_wall_timestamp: number | null; // Date.now() en el momento de iniciar/pausar
  uncertain: boolean;
  uncertain_reason?: string;
  updated_at: string;
}

export interface AppMetadata {
  key: string;
  value: any;
}

export class HandballDatabase extends Dexie {
  teams!: Table<Team, string>;
  players!: Table<Player, string>;
  matches!: Table<Match, string>;
  matchPeriods!: Table<MatchPeriod, string>;
  matchRosters!: Table<MatchRoster, string>;
  matchEvents!: Table<MatchEvent, string>;
  eventRevisions!: Table<EventRevision, string>;
  rescueSnapshots!: Table<MatchRescueSnapshot, string>;
  clockAnchors!: Table<ClockAnchorState, string>;
  metadata!: Table<AppMetadata, string>;
  possessions!: Table<MatchPossession, string>;
  playerParticipations!: Table<PlayerParticipationInterval, string>;

  constructor(databaseName = 'HandballAnalyticsDB') {
    super(databaseName);

    // Definición de esquema para IndexedDB vía Dexie
    this.version(1).stores({
      teams: 'id, name, is_own',
      players: 'id, first_name, default_number',
      matches: 'id, workspace_id, scheduled_at, status, home_team_id, away_team_id',
      matchPeriods: 'id, match_id, number',
      matchRosters: 'id, match_id, team_id, player_id, shirt_number',
      matchEvents: 'id, match_id, period_id, clock_ms, sport_seq, audit_seq, type, status',
      eventRevisions: 'id, event_id, match_id, version',
      rescueSnapshots: 'id, match_id, created_at',
      clockAnchors: '[match_id+period_id]',
      metadata: 'key'
    });

    // Versión 2: añade índices para archivado y equipo de pertenencia de jugadores
    this.version(2).stores({
      teams: 'id, name, is_own, archived',
      players: 'id, first_name, team_id, default_number, is_goalkeeper, archived',
      matches: 'id, workspace_id, scheduled_at, status, home_team_id, away_team_id',
      matchPeriods: 'id, match_id, number',
      matchRosters: 'id, match_id, team_id, player_id, shirt_number',
      matchEvents: 'id, match_id, period_id, clock_ms, sport_seq, audit_seq, type, status',
      eventRevisions: 'id, event_id, match_id, version',
      rescueSnapshots: 'id, match_id, created_at',
      clockAnchors: '[match_id+period_id]',
      metadata: 'key'
    });

    // Versión 3: añade tablas para posesiones y participación de jugadores en cancha
    this.version(3).stores({
      teams: 'id, name, is_own, archived',
      players: 'id, first_name, team_id, default_number, is_goalkeeper, archived',
      matches: 'id, workspace_id, scheduled_at, status, home_team_id, away_team_id',
      matchPeriods: 'id, match_id, number',
      matchRosters: 'id, match_id, team_id, player_id, shirt_number',
      matchEvents: 'id, match_id, period_id, clock_ms, sport_seq, audit_seq, type, status',
      eventRevisions: 'id, event_id, match_id, version',
      rescueSnapshots: 'id, match_id, created_at',
      clockAnchors: '[match_id+period_id]',
      metadata: 'key',
      possessions: 'id, match_id, period_id, team_id, start_clock_ms, end_clock_ms, is_complete',
      playerParticipations: 'id, match_id, period_id, roster_id, team_id, in_clock_ms, out_clock_ms, is_active'
    });
  }
}

// Instancia singleton para uso en la aplicación
export const db = new HandballDatabase();
