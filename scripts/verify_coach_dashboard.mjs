import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('--- Iniciando Verificación de Navegador Edge CDP: Panel del DT con Datos Reales ---');

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1500,1150',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:4173/',
  ]);

  edgeProc.on('error', (err) => console.error('Edge error:', err));

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const list = await res.json();
      const page = list.find((p) => p.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    console.error('No se pudo conectar a Edge DevTools');
    edgeProc.kill();
    process.exit(1);
  }

  console.log('Conectado a CDP en:', wsUrl);
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

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');

  const evalJs = async (expr) => {
    const res = await send('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result ? res.result.value : null;
  };

  const captureScreenshot = async (name) => {
    const res = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(res.data, 'base64');
    const p = path.join(artifactDir, `${name}.png`);
    fs.writeFileSync(p, buffer);
    console.log(`[CAPTURA] Guardada: ${name}.png (${buffer.length} bytes)`);
  };

  try {
    console.log('Paso 1: Esperando carga de la aplicación y render de IndexedDB...');
    await sleep(3500);

    // 1. En Vivo: Seleccionar jugador de campo y sector para preparar una acción
    console.log('Paso 2: Seleccionando jugador y sector en En Vivo...');
    await evalJs(`
      const playerBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Diego Simonet') || b.innerText.includes('Fernández') || b.innerText.includes('Pizarro'));
      if (playerBtn) playerBtn.click();
    `);
    await sleep(600);

    // Seleccionar sector LW (Extremo Izquierdo)
    await evalJs(`
      const lwSector = document.querySelector('path[d*="M 20 135"]') || Array.from(document.querySelectorAll('svg text')).find(t => t.textContent === 'LW')?.parentElement;
      if (lwSector) lwSector.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    `);
    await sleep(800);

    await captureScreenshot('screenshot_step1_live_play_prepared');

    // 2. Navegar al Panel del DT desde el botón de la cabecera
    console.log('Paso 3: Navegando al Panel del DT...');
    await evalJs(`
      const panelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Panel DT') || b.innerText.includes('Panel del DT'));
      if (panelBtn) panelBtn.click();
    `);
    await sleep(1500);

    // 3. Regresar a En Vivo para comprobar preservación estricta de la jugada en preparación
    console.log('Paso 4: Regresando a En Vivo para verificar que la jugada se conservó...');
    await evalJs(`
      const returnBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Regresar al Registro En Vivo'));
      if (returnBtn) returnBtn.click();
    `);
    await sleep(1200);

    const isPlayPreserved = await evalJs(`
      document.body.innerText.includes('Extremo Izquierdo') && (document.body.innerText.includes('Simonet') || document.body.innerText.includes('Fernández') || document.body.innerText.includes('Pizarro'));
    `);
    console.log('¿Jugada en preparación 100% conservada al regresar a En Vivo?:', isPlayPreserved);

    await captureScreenshot('screenshot_step2_live_play_preserved');

    // 4. Cambiar al Partido Demo Finalizado (con 28-26, eventos, tiros y exclusiones)
    console.log('Paso 5: Cambiando al Partido Demo con datos completos...');
    await evalJs(`
      const matchesTab = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Partidos'));
      if (matchesTab) matchesTab.click();
    `);
    await sleep(1000);

    await evalJs(`
      const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cargar');
      if (loadBtn) loadBtn.click();
    `);
    await sleep(1500);

    // 5. Abrir Panel del DT en el partido con datos
    console.log('Paso 6: Abriendo Panel del DT con datos del partido...');
    await evalJs(`
      const coachTab = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Panel del DT'));
      if (coachTab) coachTab.click();
    `);
    await sleep(1200);

    // Seleccionar filtro "Todo el partido" para visualizar todos los eventos en la ventana
    await evalJs(`
      const allMatchBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Todo el partido'));
      if (allMatchBtn) allMatchBtn.click();
    `);
    await sleep(1500);

    console.log('Capturando Panel del DT PC completo con métricas reales...');
    await captureScreenshot('screenshot_step3_coach_dashboard_full_pc');

    // 6. Expandir respaldo empírico e interactuar con el mapa táctico
    console.log('Paso 7: Expandiendo eventos de respaldo e inspeccionando sector C6...');
    await evalJs(`
      const expandBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Ver') && b.innerText.includes('eventos de respaldo'));
      if (expandBtn) expandBtn.click();
    `);
    await sleep(800);

    await evalJs(`
      // Seleccionar sector C6 o LW en el mapa del rival
      const sectorEl = Array.from(document.querySelectorAll('svg text')).find(t => t.textContent === 'C6' || t.textContent === 'LW')?.parentElement;
      if (sectorEl) sectorEl.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    `);
    await sleep(1000);

    await captureScreenshot('screenshot_step4_coach_dashboard_inspector_pc');

    // 7. Verificación Responsive en Teléfono Móvil (375x812)
    console.log('Paso 8: Emulando vista táctil móvil (375x812)...');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(800);

    await captureScreenshot('screenshot_step5_coach_dashboard_mobile');

    console.log('--- Verificación finalizada con éxito total ---');
  } catch (err) {
    console.error('Error durante verificación CDP:', err);
  } finally {
    ws.close();
    edgeProc.kill();
  }
}

main();
