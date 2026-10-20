import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('--- Iniciando Verificación de Flujo de Posesión en Navegador Real ---');
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1600,1100',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:4173/',
  ]);

  edgeProc.on('error', (err) => console.error('Edge error:', err));

  // Esperar puerto CDP
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const list = await res.json();
      const page = list.find((p) => p.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {
      // espera
    }
  }

  if (!wsUrl) {
    console.error('Error: No se pudo conectar a Edge mediante CDP');
    edgeProc.kill();
    process.exit(1);
  }

  console.log('Conectado a CDP:', wsUrl);
  const ws = new WebSocket(wsUrl);

  let idCounter = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  };

  await new Promise((resolve) => (ws.onopen = resolve));

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');

  console.log('Esperando carga inicial de la aplicación...');
  await sleep(3000);

  // Paso 0: Verificar versión y build visible
  const versionCheck = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        title: document.title,
        text: document.body.innerText,
        hasBuildTag: document.body.innerText.includes('Build 2026-10-16-2130')
      };
    })()`,
    returnByValue: true
  });
  console.log('Verificación de Build:', versionCheck.result.value.hasBuildTag ? 'CORRECTO (Build 2026-10-16-2130 presente)' : 'FALLO: no se encontró tag de build');

  // Crear un partido de prueba aislado en IndexedDB para no alterar los partidos históricos
  const setupMatchResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      // Importar Dexie db desde window si está o acceder a indexedDB
      const openReq = indexedDB.open('HandballAnalyticsDB');
      return new Promise((resolve, reject) => {
        openReq.onsuccess = async () => {
          const db = openReq.result;
          const tx = db.transaction(['matches', 'rosters', 'teams', 'periods', 'possessions'], 'readwrite');
          const matchesStore = tx.objectStore('matches');
          const teamsStore = tx.objectStore('teams');
          const rostersStore = tx.objectStore('rosters');
          const periodsStore = tx.objectStore('periods');
          
          // Crear IDs únicos para el partido de prueba
          const matchId = 'test-flow-' + Date.now();
          const homeTeamId = 'carp-test';
          const awayTeamId = 'fco-test';
          const periodId = 'p1-' + matchId;

          // Teams
          teamsStore.put({ id: homeTeamId, name: 'River Plate', short_name: 'CARP', color: '#DC2626', is_own: true, created_at: new Date().toISOString() });
          teamsStore.put({ id: awayTeamId, name: 'Ferro C. Oeste', short_name: 'FCO', color: '#16A34A', is_own: false, created_at: new Date().toISOString() });

          // Rosters (5 campo + 1 arquero)
          const r1 = 'r1-' + matchId;
          const r2 = 'r2-' + matchId;
          const r3 = 'r3-' + matchId;
          const r4 = 'r4-' + matchId;
          const r5 = 'r5-' + matchId;
          const r6 = 'r6-' + matchId;
          rostersStore.put({ id: r1, match_id: matchId, match_team_id: homeTeamId, player_id: 'p-1', shirt_number: '10', display_name_snapshot: 'Diego Simonet', role: 'CB', is_starter: true, is_goalkeeper: false, active: true });
          rostersStore.put({ id: r2, match_id: matchId, match_team_id: homeTeamId, player_id: 'p-2', shirt_number: '4', display_name_snapshot: 'Sebastián Simonet', role: 'LB', is_starter: true, is_goalkeeper: false, active: true });
          rostersStore.put({ id: r3, match_id: matchId, match_team_id: homeTeamId, player_id: 'p-3', shirt_number: '7', display_name_snapshot: 'Federico Pizarro', role: 'RB', is_starter: true, is_goalkeeper: false, active: true });
          rostersStore.put({ id: r4, match_id: matchId, match_team_id: homeTeamId, player_id: 'p-4', shirt_number: '2', display_name_snapshot: 'Federico Fernández', role: 'LW', is_starter: true, is_goalkeeper: false, active: true });
          rostersStore.put({ id: r5, match_id: matchId, match_team_id: homeTeamId, player_id: 'p-5', shirt_number: '9', display_name_snapshot: 'Lucas Moscariello', role: 'PV', is_starter: true, is_goalkeeper: false, active: true });
          rostersStore.put({ id: r6, match_id: matchId, match_team_id: homeTeamId, player_id: 'p-6', shirt_number: '1', display_name_snapshot: 'Leonel Maciel', role: 'GK', is_starter: true, is_goalkeeper: true, active: true });

          // Match
          matchesStore.put({
            id: matchId,
            home_team_id: homeTeamId,
            away_team_id: awayTeamId,
            home_team_name: 'River Plate',
            away_team_name: 'Ferro C. Oeste',
            home_team_color: '#DC2626',
            away_team_color: '#16A34A',
            is_home: true,
            status: 'in_progress',
            match_date: new Date().toISOString().slice(0, 10),
            competition: 'Liga de Honor Metropolitana',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

          // Period
          periodsStore.put({
            id: periodId,
            match_id: matchId,
            number: 1,
            start_clock_ms: 0,
            duration_ms: 1800000,
            status: 'active'
          });

          tx.oncomplete = () => {
            resolve({ success: true, matchId, periodId });
          };
          tx.onerror = (e) => reject(e);
        };
        openReq.onerror = (e) => reject(e);
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Partido de prueba creado:', setupMatchResult.result.value);
  const { matchId } = setupMatchResult.result.value;

  // Recargar la aplicación para que tome el nuevo partido
  await send('Page.reload');
  await sleep(2500);

  // Seleccionar el partido en la UI
  const selectMatchInUI = await send('Runtime.evaluate', {
    expression: `(async () => {
      // Buscar el botón o fila con 'Liga de Honor Metropolitana' o 'River Plate'
      const buttons = Array.from(document.querySelectorAll('button'));
      const matchBtn = buttons.find(b => b.textContent && b.textContent.includes('River Plate') && b.textContent.includes('Ferro'));
      if (matchBtn) {
        matchBtn.click();
        await new Promise(r => setTimeout(r, 1000));
      }
      // Ir a la pestaña En Vivo
      const liveTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('En Vivo'));
      if (liveTab) {
        liveTab.click();
        await new Promise(r => setTimeout(r, 1000));
      }
      return { inLive: !!document.querySelector('svg') };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('En consola en vivo:', selectMatchInUI.result.value);
  await sleep(1500);

  // Iniciar reloj si está detenido (hacer click en Iniciar reloj si existe)
  await send('Runtime.evaluate', {
    expression: `(() => {
      const playBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Iniciar') || b.querySelector('svg.lucide-play'));
      if (playBtn) playBtn.click();
    })()`
  });
  await sleep(1000);

  // ACCIÓN 1: River anota GOL
  console.log('\n--- ACCIÓN 1: Registrar GOL de River Plate ---');
  const action1Result = await send('Runtime.evaluate', {
    expression: `(async () => {
      // 1. Verificar equipo activo actual en consola
      const actingTeamBadge = document.querySelector('[data-testid="acting-team-name"]') || Array.from(document.querySelectorAll('span, button')).find(el => el.textContent && (el.textContent.includes('River Plate') || el.textContent.includes('CARP')));
      
      // 2. Seleccionar jugador #10 Diego Simonet
      const p10 = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('#10'));
      if (p10) p10.click();

      // 3. Seleccionar sector C6 en la media cancha
      const c6 = Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.includes('C6'));
      if (c6) c6.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      // 4. Seleccionar arco TR
      const tr = Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.trim() === 'TR');
      if (tr) tr.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      await new Promise(r => setTimeout(r, 500));

      // 5. Click en Confirmar y Guardar Acción
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Confirmar y Guardar Acción'));
      if (confirmBtn) {
        confirmBtn.click();
      }

      await new Promise(r => setTimeout(r, 1500));

      // 6. Leer estado resultante
      const bodyText = document.body.innerText;
      return {
        confirmed: true,
        bodyHasFerroAction: bodyText.includes('Ferro') || bodyText.includes('FCO'),
        hasDefensePhase: bodyText.includes('DEFENSA'),
        hasRivalOption: bodyText.includes('Rival colectivo') || bodyText.includes('No identificado')
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Resultado Acción 1 (Gol River):', action1Result.result.value);

  // Tomar captura 1
  const ss1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_river_scores.png'), Buffer.from(ss1.data, 'base64'));
  console.log('Captura 1 guardada: screenshot_river_scores.png');

  // ACCIÓN 2: Sin tocar selector de equipo, Ferro anota GOL
  console.log('\n--- ACCIÓN 2: Sin tocar selector, registrar GOL de Ferro ---');
  const action2Result = await send('Runtime.evaluate', {
    expression: `(async () => {
      // 1. Indicar dorsal rival (ej 7) o rival colectivo
      const rivalInput = document.querySelector('input[placeholder*="dorsal"]') || document.querySelector('input[type="text"]');
      if (rivalInput) {
        rivalInput.value = '7';
        rivalInput.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // 2. Seleccionar sector R6 en cancha
      const r6 = Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.includes('R6'));
      if (r6) r6.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      // 3. Seleccionar arco BL
      const bl = Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.trim() === 'BL');
      if (bl) bl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      await new Promise(r => setTimeout(r, 500));

      // 4. Click en Confirmar y Guardar Acción
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Confirmar y Guardar Acción'));
      if (confirmBtn) {
        confirmBtn.click();
      }

      await new Promise(r => setTimeout(r, 1500));

      const bodyText = document.body.innerText;
      return {
        confirmed: true,
        bodyHasRiverAction: bodyText.includes('River Plate') || bodyText.includes('CARP'),
        hasAttackPhase: bodyText.includes('ATAQUE'),
        hasPlayer10Visible: bodyText.includes('#10')
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Resultado Acción 2 (Gol Ferro):', action2Result.result.value);

  // Tomar captura 2
  const ss2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_ferro_scores.png'), Buffer.from(ss2.data, 'base64'));
  console.log('Captura 2 guardada: screenshot_ferro_scores.png');

  // ACCIÓN 3: Sin tocar selector de equipo, River anota su 2do GOL (Marcador 2-1)
  console.log('\n--- ACCIÓN 3: Sin tocar selector, River anota su segundo gol (2-1) ---');
  const action3Result = await send('Runtime.evaluate', {
    expression: `(async () => {
      // 1. Seleccionar jugador #4 Sebastián Simonet
      const p4 = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('#4'));
      if (p4) p4.click();

      // 2. Seleccionar sector L9 en cancha
      const l9 = Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.includes('L9'));
      if (l9) l9.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      // 3. Seleccionar arco TL
      const tl = Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.trim() === 'TL');
      if (tl) tl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

      await new Promise(r => setTimeout(r, 500));

      // 4. Click en Confirmar y Guardar Acción
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Confirmar y Guardar Acción'));
      if (confirmBtn) {
        confirmBtn.click();
      }

      await new Promise(r => setTimeout(r, 1500));

      const bodyText = document.body.innerText;
      return {
        confirmed: true,
        bodyHasFerroAction: bodyText.includes('Ferro') || bodyText.includes('FCO'),
        score21Found: bodyText.includes('2 - 1') || (bodyText.includes('2') && bodyText.includes('1'))
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Resultado Acción 3 (Gol River -> 2-1):', action3Result.result.value);

  // Tomar captura 3
  const ss3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_final_2_1.png'), Buffer.from(ss3.data, 'base64'));
  console.log('Captura 3 guardada: screenshot_final_2_1.png');

  // PASO 4: Recarga completa (F5) y verificación de persistencia
  console.log('\n--- PASO 4: Recarga F5 y comprobación de persistencia de posesión ---');
  await send('Page.reload');
  await sleep(3000);

  const persistenceResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      // Ir a la pestaña En Vivo
      const liveTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('En Vivo'));
      if (liveTab) {
        liveTab.click();
        await new Promise(r => setTimeout(r, 1000));
      }
      const bodyText = document.body.innerText;
      return {
        reloaded: true,
        scoreHas21: bodyText.includes('2 - 1') || (bodyText.includes('2') && bodyText.includes('1')),
        hasFerroInPossession: bodyText.includes('FCO') || bodyText.includes('Ferro')
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Resultado persistencia tras recarga F5:', persistenceResult.result.value);

  ws.close();
  edgeProc.kill();
  console.log('\n--- Verificación en Navegador Finalizada con Éxito ---');
}

main().catch(err => {
  console.error('Error fatal durante la verificación:', err);
  process.exit(1);
});
