import 'fake-indexeddb/auto';
import * as XLSX from 'xlsx';
import { HandballDatabase } from '../src/data/db';
import { MatchManagementService } from '../src/services/matchManagementService';
import { ExportService } from '../src/services/exportService';

async function run() {
  const db = new HandballDatabase(`test_verification_${Date.now()}`);
  const managementService = new MatchManagementService(db);
  const exportService = new ExportService(db);

  const home = await managementService.createTeam({ name: 'River', short_name: 'RIV', is_own: true, color_primary: '#dc2626' });
  const away = await managementService.createTeam({ name: 'Ferro', short_name: 'FCO', is_own: false, color_primary: '#16a34a' });

  const p1 = await managementService.createPlayer({ first_name: 'A', last_name: 'A', default_number: 1, position: 'GK', is_goalkeeper: true, team_id: home.id });
  const p2 = await managementService.createPlayer({ first_name: 'B', last_name: 'B', default_number: 2, position: 'CB', is_goalkeeper: false, team_id: home.id });
  const p3 = await managementService.createPlayer({ first_name: 'C', last_name: 'C', default_number: 3, position: 'RW', is_goalkeeper: false, team_id: home.id });
  const p4 = await managementService.createPlayer({ first_name: 'D', last_name: 'D', default_number: 4, position: 'LW', is_goalkeeper: false, team_id: home.id });
  const p5 = await managementService.createPlayer({ first_name: 'E', last_name: 'E', default_number: 5, position: 'PV', is_goalkeeper: false, team_id: home.id });
  const p6 = await managementService.createPlayer({ first_name: 'F', last_name: 'F', default_number: 6, position: 'LB', is_goalkeeper: false, team_id: home.id });

  const match = await managementService.createMatch({
    home_team_id: home.id,
    away_team_id: away.id,
    scheduled_at: '2026-10-15T10:00:00Z',
    home_roster: [
      { shirt_number: 1, display_name: '1 · A', role: 'GK', is_starter: true, position_snapshot: 'GK' },
      { shirt_number: 2, display_name: '2 · B', role: 'FIELD', is_starter: true, position_snapshot: 'CB' },
      { shirt_number: 3, display_name: '3 · C', role: 'FIELD', is_starter: true, position_snapshot: 'RW' },
      { shirt_number: 4, display_name: '4 · D', role: 'FIELD', is_starter: true, position_snapshot: 'LW' },
      { shirt_number: 5, display_name: '5 · E', role: 'FIELD', is_starter: true, position_snapshot: 'PV' },
      { shirt_number: 6, display_name: '6 · F', role: 'FIELD', is_starter: true, position_snapshot: 'LB' },
    ],
    away_roster: [],
  });

  const periods = await db.matchPeriods.where('match_id').equals(match.id).toArray();
  const period1 = periods[0]!;

  // Posesión con possession_id ab5df3e6-1fe0-4a17-93ae-37f643aa9f9a
  const unassociatedPossId = 'ab5df3e6-1fe0-4a17-93ae-37f643aa9f9a';
  await db.possessions.add({
    id: unassociatedPossId,
    match_id: match.id,
    period_id: period1.id,
    team_id: home.id,
    start_clock_ms: 100000,
    end_clock_ms: 120000,
    start_reason: 'THROW_OFF',
    end_reason: 'GOAL',
    is_complete: true,
    created_at: new Date().toISOString(),
  });

  // Generar archivo XLSX a través de exportService.exportMatchToXLSX
  const { buffer, filename } = await exportService.exportMatchToXLSX(match.id);
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets['Posesiones']!;
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  console.log('FILENAME:', filename);
  const targetRowIndex = rows.findIndex((r) => r[14] === unassociatedPossId);
  const targetRow = rows[targetRowIndex];
  console.log('TARGET ROW INDEX (0-based):', targetRowIndex, 'EXCEL ROW (1-based):', targetRowIndex + 1);
  console.log('ID POSESION (col O / index 14):', targetRow[14]);
  console.log('ESTADO PERSISTIDO (col H / index 7):', targetRow[7]);
  console.log('VALIDEZ PARA METRICAS (col I / index 8):', targetRow[8]);
  console.log('OBSERVACION / INCONSISTENCIA (col J / index 9):', targetRow[9]);
  console.log('GOLES ASOCIADOS (col K / index 10):', targetRow[10]);

  // Resumen al pie
  const warningRow = rows.find((r) => r[0] === 'Advertencia de Cobertura / Inconsistencias');
  console.log('RESUMEN ADVERTENCIA:', warningRow);
}

run().catch(console.error);
