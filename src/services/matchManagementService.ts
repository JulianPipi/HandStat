import { v4 as uuidv4 } from 'uuid';
import { HandballDatabase } from '../data/db';
import {
  TeamSchema,
  PlayerSchema,
  MatchSchema,
  MatchPeriodSchema,
  MatchRosterSchema,
  type Team,
  type Player,
  type Match,
  type MatchPeriod,
  type MatchRoster,
  type MatchRulesConfig
} from '../domain/schemas';

export interface CreateTeamInput {
  name: string;
  short_name: string;
  is_own: boolean;
  color_primary?: string;
}

export interface CreatePlayerInput {
  first_name: string;
  last_name?: string;
  default_number?: number;
  position?: 'GK' | 'LW' | 'LB' | 'CB' | 'RB' | 'RW' | 'PV';
  is_goalkeeper?: boolean;
  team_id?: string;
}

export interface RosterSelectionItem {
  player_id?: string;
  shirt_number: number;
  display_name: string;
  role: 'GK' | 'FIELD' | 'OFFICIAL';
  position_snapshot?: string;
  is_starter: boolean;
}

export interface CreateMatchInput {
  home_team_id: string;
  away_team_id: string;
  scheduled_at?: string;
  competition?: string;
  venue?: string;
  detail_level?: 'basic' | 'standard' | 'full';
  rules_config?: Partial<MatchRulesConfig>;
  home_roster: RosterSelectionItem[];
  away_roster?: RosterSelectionItem[]; // Opcional para rival colectivo
}

export class MatchManagementService {
  constructor(private db: HandballDatabase) {}

  // ==========================================
  // GESTIÓN DE EQUIPOS
  // ==========================================
  async createTeam(input: CreateTeamInput): Promise<Team> {
    const now = new Date().toISOString();
    const team: Team = TeamSchema.parse({
      id: uuidv4(),
      name: input.name.trim(),
      short_name: input.short_name.trim().toUpperCase(),
      is_own: input.is_own,
      color_primary: input.color_primary || (input.is_own ? '#0284c7' : '#16a34a'),
      archived: false,
      created_at: now,
      updated_at: now,
    });

    await this.db.teams.put(team);
    return team;
  }

  async updateTeam(id: string, updates: Partial<CreateTeamInput>): Promise<Team> {
    const existing = await this.db.teams.get(id);
    if (!existing) throw new Error(`Equipo ${id} no encontrado`);

    const now = new Date().toISOString();
    const updated: Team = TeamSchema.parse({
      ...existing,
      ...updates,
      name: updates.name ? updates.name.trim() : existing.name,
      short_name: updates.short_name ? updates.short_name.trim().toUpperCase() : existing.short_name,
      updated_at: now,
    });

    await this.db.teams.put(updated);
    return updated;
  }

  async archiveTeam(id: string, archived = true): Promise<void> {
    const existing = await this.db.teams.get(id);
    if (!existing) throw new Error(`Equipo ${id} no encontrado`);

    existing.archived = archived;
    existing.updated_at = new Date().toISOString();
    await this.db.teams.put(existing);
  }

  // ==========================================
  // GESTIÓN DE JUGADORES
  // ==========================================
  async createPlayer(input: CreatePlayerInput): Promise<Player> {
    const now = new Date().toISOString();
    const isGk = input.is_goalkeeper || input.position === 'GK';

    const player: Player = PlayerSchema.parse({
      id: uuidv4(),
      first_name: input.first_name.trim(),
      last_name: input.last_name?.trim() || undefined,
      default_number: input.default_number,
      position: input.position,
      is_goalkeeper: isGk,
      team_id: input.team_id,
      archived: false,
      created_at: now,
      updated_at: now,
    });

    await this.db.players.put(player);
    return player;
  }

  async updatePlayer(id: string, updates: Partial<CreatePlayerInput>): Promise<Player> {
    const existing = await this.db.players.get(id);
    if (!existing) throw new Error(`Jugador ${id} no encontrado`);

    const now = new Date().toISOString();
    const isGk = updates.is_goalkeeper ?? (updates.position ? updates.position === 'GK' : existing.is_goalkeeper);

    const updated: Player = PlayerSchema.parse({
      ...existing,
      ...updates,
      first_name: updates.first_name ? updates.first_name.trim() : existing.first_name,
      last_name: updates.last_name !== undefined ? updates.last_name.trim() || undefined : existing.last_name,
      is_goalkeeper: isGk,
      updated_at: now,
    });

    await this.db.players.put(updated);
    return updated;
  }

  async archivePlayer(id: string, archived = true): Promise<void> {
    const existing = await this.db.players.get(id);
    if (!existing) throw new Error(`Jugador ${id} no encontrado`);

    existing.archived = archived;
    existing.updated_at = new Date().toISOString();
    await this.db.players.put(existing);
  }

  // ==========================================
  // GESTIÓN Y CREACIÓN DE PARTIDOS
  // ==========================================
  async createMatch(input: CreateMatchInput, deviceId = uuidv4()): Promise<Match> {
    // 1. Obtener y validar equipos
    const [homeTeam, awayTeam] = await Promise.all([
      this.db.teams.get(input.home_team_id),
      this.db.teams.get(input.away_team_id),
    ]);

    if (!homeTeam || !awayTeam) {
      throw new Error('Equipos seleccionados no existen en la base de datos');
    }
    if (homeTeam.id === awayTeam.id) {
      throw new Error('El equipo local y visitante no pueden ser el mismo');
    }

    // 2. Validar reglas de partido y límites de convocatoria
    const periodsCount = input.rules_config?.periods_count ?? 2;
    if (periodsCount < 1 || periodsCount > 4) {
      throw new Error('La cantidad de períodos debe ser entre 1 y 4');
    }

    const periodDurationMs = input.rules_config?.period_duration_ms ?? 1800000;
    if (periodDurationMs <= 0) {
      throw new Error('La duración de los períodos debe ser mayor a cero');
    }

    const suspensionDurationMs = input.rules_config?.suspension_duration_ms ?? 120000;
    const maxRosterSize = input.rules_config?.max_roster_size ?? 16;
    if (maxRosterSize < 7 || maxRosterSize > 30) {
      throw new Error('El límite de convocatoria debe estar entre 7 y 30 jugadores');
    }

    // Validar duplicidad de dorsales, jugadores, titulares y coherencia de porteros
    this.validateRosterItems(input.home_roster, maxRosterSize, 'local');

    if (input.away_roster && input.away_roster.length > 0) {
      this.validateRosterItems(input.away_roster, maxRosterSize, 'visitante');
    }

    // Regla de aplicación para equipo propio: mínimo 5 jugadores de campo y 1 arquero
    const ownTeamIsHome = homeTeam.is_own;
    const ownTeamIsAway = awayTeam.is_own;

    if (ownTeamIsHome) {
      this.validateMinimumOwnRoster(input.home_roster, homeTeam.name);
    } else if (ownTeamIsAway) {
      this.validateMinimumOwnRoster(input.away_roster || [], awayTeam.name);
    }

    const matchId = uuidv4();
    const now = new Date().toISOString();

    const match: Match = MatchSchema.parse({
      id: matchId,
      workspace_id: uuidv4(),
      scheduled_at: input.scheduled_at || now,
      competition: input.competition?.trim() || undefined,
      venue: input.venue?.trim() || undefined,
      status: 'live',
      detail_level: input.detail_level || 'standard',
      home_team_id: homeTeam.id,
      away_team_id: awayTeam.id,
      home_team_name_snapshot: homeTeam.name,
      away_team_name_snapshot: awayTeam.name,
      rules_config: {
        periods_count: periodsCount,
        period_duration_ms: periodDurationMs,
        suspension_duration_ms: suspensionDurationMs,
        max_roster_size: maxRosterSize,
      },
      match_revision: 1,
      created_at: now,
      updated_at: now,
      device_id: deviceId,
    });

    // 3. Crear Períodos
    const periods: MatchPeriod[] = [];
    for (let i = 1; i <= periodsCount; i++) {
      periods.push(
        MatchPeriodSchema.parse({
          id: uuidv4(),
          match_id: matchId,
          number: i,
          kind: 'REGULAR',
          duration_ms: periodDurationMs,
        })
      );
    }

    // 4. Crear Convocatoria (Roster)
    const rosters: MatchRoster[] = [];

    // Convocatoria local
    for (const item of input.home_roster) {
      rosters.push(
        MatchRosterSchema.parse({
          id: uuidv4(),
          match_id: matchId,
          team_id: homeTeam.id,
          player_id: item.player_id,
          shirt_number: item.shirt_number,
          display_name_snapshot: item.display_name.trim(),
          role: item.role,
          position_snapshot: item.position_snapshot,
          is_starter: item.is_starter,
        })
      );
    }

    // Convocatoria visitante (si fue provista expresamente).
    // Si no fue provista (rival colectivo), NO se inventan jugadores ni dorsales ficticios.
    // Las acciones rivales se registrarán de forma colectiva a nivel de equipo.
    if (input.away_roster && input.away_roster.length > 0) {
      for (const item of input.away_roster) {
        rosters.push(
          MatchRosterSchema.parse({
            id: uuidv4(),
            match_id: matchId,
            team_id: awayTeam.id,
            player_id: item.player_id,
            shirt_number: item.shirt_number,
            display_name_snapshot: item.display_name.trim(),
            role: item.role,
            position_snapshot: item.position_snapshot,
            is_starter: item.is_starter,
          })
        );
      }
    }

    // 5. Guardar todo atómicamente en IndexedDB
    await this.db.transaction('rw', [this.db.matches, this.db.matchPeriods, this.db.matchRosters], async () => {
      await this.db.matches.put(match);
      await this.db.matchPeriods.bulkAdd(periods);
      if (rosters.length > 0) {
        await this.db.matchRosters.bulkAdd(rosters);
      }
    });

    return match;
  }

  private validateRosterItems(items: RosterSelectionItem[], maxSize: number, teamLabel: string) {
    if (items.length > maxSize) {
      throw new Error(`La convocatoria del equipo ${teamLabel} supera el límite configurado de ${maxSize} jugadores`);
    }

    const seenNumbers = new Set<number>();
    const seenPlayerIds = new Set<string>();
    let starterCount = 0;

    for (const item of items) {
      if (item.shirt_number < 0 || item.shirt_number > 99) {
        throw new Error(`Dorsal #${item.shirt_number} inválido en la convocatoria ${teamLabel}. Debe estar entre 0 y 99.`);
      }

      if (seenNumbers.has(item.shirt_number)) {
        throw new Error(`Dorsal repetido #${item.shirt_number} en la convocatoria del equipo ${teamLabel}`);
      }
      seenNumbers.add(item.shirt_number);

      if (item.player_id) {
        if (seenPlayerIds.has(item.player_id)) {
          throw new Error(`Jugador duplicado en la convocatoria del equipo ${teamLabel}`);
        }
        seenPlayerIds.add(item.player_id);
      }

      if (item.is_starter) {
        starterCount++;
      }
    }

    if (items.length > 0 && starterCount > 7) {
      throw new Error(`La convocatoria del equipo ${teamLabel} no puede tener más de 7 titulares simultáneos (actual: ${starterCount})`);
    }
  }

  private validateMinimumOwnRoster(items: RosterSelectionItem[], teamName: string) {
    const fieldPlayersCount = items.filter((item) => item.role === 'FIELD').length;
    const goalkeepersCount = items.filter((item) => item.role === 'GK').length;

    const missingMessages: string[] = [];
    if (fieldPlayersCount < 5) {
      missingMessages.push(`al menos 5 jugadores de campo (actual: ${fieldPlayersCount})`);
    }
    if (goalkeepersCount < 1) {
      missingMessages.push(`al menos 1 arquero (actual: ${goalkeepersCount})`);
    }

    if (missingMessages.length > 0) {
      throw new Error(
        `Convocatoria insuficiente para el equipo propio (${teamName}). La regla de la aplicación exige convocar ${missingMessages.join(' y ')}.`
      );
    }
  }

  // ==========================================
  // ACTUALIZACIÓN AUDITADA DE PARTIDOS Y CONVOCATORIAS
  // ==========================================
  async updateMatch(
    matchId: string,
    updates: {
      competition?: string;
      venue?: string;
      scheduled_at?: string;
      status?: 'draft' | 'live' | 'finished' | 'reviewed';
      detail_level?: 'basic' | 'standard' | 'full';
    }
  ): Promise<Match> {
    const existing = await this.db.matches.get(matchId);
    if (!existing) throw new Error(`Partido ${matchId} no encontrado`);

    const now = new Date().toISOString();
    const updated: Match = MatchSchema.parse({
      ...existing,
      ...updates,
      competition: updates.competition !== undefined ? updates.competition.trim() || undefined : existing.competition,
      venue: updates.venue !== undefined ? updates.venue.trim() || undefined : existing.venue,
      match_revision: existing.match_revision + 1,
      updated_at: now,
    });

    await this.db.matches.put(updated);
    return updated;
  }

  async updateMatchRoster(
    matchId: string,
    teamId: string,
    updatedItems: RosterSelectionItem[]
  ): Promise<MatchRoster[]> {
    const match = await this.db.matches.get(matchId);
    if (!match) throw new Error(`Partido ${matchId} no encontrado`);

    const team = await this.db.teams.get(teamId);
    if (!team) throw new Error(`Equipo ${teamId} no encontrado`);

    // Validaciones de convocatoria
    this.validateRosterItems(updatedItems, match.rules_config.max_roster_size, team.name);
    if (team.is_own) {
      this.validateMinimumOwnRoster(updatedItems, team.name);
    }

    // AUDITORÍA ESTRICTA: Obtener eventos activos de este partido
    const matchEvents = await this.db.matchEvents.where('match_id').equals(matchId).toArray();
    const activeEvents = matchEvents.filter((e) => e.status === 'active');

    const participatingRosterIds = new Set<string>();
    for (const ev of activeEvents) {
      for (const p of ev.participants) {
        if (p.roster_id) participatingRosterIds.add(p.roster_id);
      }
    }

    const currentRosters = await this.db.matchRosters
      .where('match_id')
      .equals(matchId)
      .filter((r) => r.team_id === teamId)
      .toArray();

    // Validar que no se descarte a un jugador con acciones activas
    for (const cur of currentRosters) {
      const stillPresent = updatedItems.some(
        (item) => (item.player_id && item.player_id === cur.player_id) || item.shirt_number === cur.shirt_number
      );
      if (!stillPresent && participatingRosterIds.has(cur.id)) {
        throw new Error(
          `Restricción de Auditoría: No se puede desconvocar a #${cur.shirt_number} (${cur.display_name_snapshot}) porque tiene acciones activas registradas en el historial del partido.`
        );
      }
    }

    const newRosters: MatchRoster[] = updatedItems.map((item) => {
      const existingRecord = currentRosters.find(
        (cur) => (item.player_id && cur.player_id === item.player_id) || cur.shirt_number === item.shirt_number
      );

      return MatchRosterSchema.parse({
        id: existingRecord ? existingRecord.id : uuidv4(),
        match_id: matchId,
        team_id: teamId,
        player_id: item.player_id,
        shirt_number: item.shirt_number,
        display_name_snapshot: item.display_name.trim(),
        role: item.role,
        position_snapshot: item.position_snapshot,
        is_starter: item.is_starter,
      });
    });

    await this.db.transaction('rw', [this.db.matches, this.db.matchRosters], async () => {
      const currentIds = currentRosters.map((r) => r.id);
      await this.db.matchRosters.bulkDelete(currentIds);
      await this.db.matchRosters.bulkPut(newRosters);

      match.match_revision += 1;
      match.updated_at = new Date().toISOString();
      await this.db.matches.put(match);
    });

    return newRosters;
  }
}

