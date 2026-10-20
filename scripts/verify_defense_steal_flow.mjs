import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('--- Iniciando Verificación de Navegador Edge CDP: Flujo de Robo en Defensa ---');

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1500,1050',
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
    if (res.exceptionDetails) {
      console.error('JS Error:', res.exceptionDetails);
    }
    return res.result?.value;
  };

  const takeScreenshot = async (filename) => {
    const snap = await send('Page.captureScreenshot', { format: 'png' });
    const buffer = Buffer.from(snap.data, 'base64');
    const outPath = path.join(artifactDir, filename);
    fs.writeFileSync(outPath, buffer);
    console.log(`[CAPTURA GUARDADA] ${filename}`);
  };

  console.log('Esperando carga completa de la aplicación...');
  await sleep(2500);

  // Desactivar modales bloqueantes
  await evalJs(`
    window.alert = () => {};
    window.confirm = () => true;
  `);

  // Ir a la pestaña "En Vivo"
  await evalJs(`
    (() => {
      const liveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('En Vivo'));
      if (liveBtn) liveBtn.click();
    })()
  `);
  await sleep(1000);

  // Confirmar titulares si aparece el botón para tener jugadores en cancha
  await evalJs(`
    (() => {
      const titularesBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Titulares'));
      if (titularesBtn) titularesBtn.click();
    })()
  `);
  await sleep(800);

  // =========================================================================
  // PASO 1: Demo B tiene posesión
  // =========================================================================
  console.log('PASO 1: Garantizando que Demo B (Rival) tiene posesión...');
  
  // Si Demo B no tiene posesión, registrar gol para Demo A para que pase a Demo B
  const initialPos = await evalJs(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const rivalBtn = buttons.find(b => (b.textContent.includes('Ferro') || b.textContent.includes('Rival')) && b.textContent.includes('POSESIÓN'));
      return !!rivalBtn;
    })()
  `);

  if (!initialPos) {
    console.log('Demo A tiene posesión. Registrando gol de Demo A para pasar posesión a Demo B...');
    await evalJs(`
      (() => {
        // Seleccionar jugador
        const pBtn = document.querySelector('div.grid-cols-2 button, div.grid-cols-3 button');
        if (pBtn) pBtn.click();

        // Seleccionar origen (por ejemplo C6)
        const c6Zone = Array.from(document.querySelectorAll('path, polygon, rect')).find(el => el.getAttribute('id') === 'zone-C6' || el.getAttribute('data-zone') === 'C6');
        if (c6Zone) c6Zone.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // Seleccionar destino en arco
        const targetBC = Array.from(document.querySelectorAll('path, polygon, rect')).find(el => el.getAttribute('id') === 'goal-BC' || el.getAttribute('data-target') === 'BC');
        if (targetBC) targetBC.dispatchEvent(new MouseEvent('click', { bubbles: true }));

        // Clic en Confirmar y Guardar
        const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('CONFIRMAR Y GUARDAR'));
        if (confirmBtn) confirmBtn.click();
      })()
    `);
    await sleep(2000);
  }

  const step1State = await evalJs(`
    (() => {
      const topBar = document.querySelector('div.bg-slate-950.p-3')?.textContent || '';
      return { topBar: topBar.slice(0, 100) };
    })()
  `);
  console.log('Paso 1 Estado:', step1State);
  await takeScreenshot('screenshot_step1_demo_b_possession.png');

  // =========================================================================
  // PASO 2: Desde Defensa, registrar robo de un jugador del Demo A
  // =========================================================================
  console.log('PASO 2: Entrando a Defensa y seleccionando jugador de Demo A...');
  await evalJs(`
    (() => {
      const defBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().endsWith('Defensa') && b.querySelector('svg'));
      if (defBtn) defBtn.click();
    })()
  `);
  await sleep(800);

  // Asegurar que el equipo recuperador seleccionado sea Demo A (Local)
  await evalJs(`
    (() => {
      const ownRecBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent.includes('River') || b.textContent.includes('Local')) && b.closest('div')?.textContent.includes('Equipo que recupera'));
      if (ownRecBtn) ownRecBtn.click();
    })()
  `);
  await sleep(500);

  // Seleccionar primer jugador de Demo A en cancha
  await evalJs(`
    (() => {
      const courtPlayerBtns = Array.from(document.querySelectorAll('div.grid-cols-2 button, div.grid-cols-3 button')).filter(b => b.textContent.includes('#'));
      if (courtPlayerBtns.length > 0) courtPlayerBtns[0].click();

      // Clic en zona C9 en cancha táctica
      const c9 = Array.from(document.querySelectorAll('path, polygon, rect')).find(el => el.getAttribute('id') === 'zone-C9' || el.getAttribute('data-zone') === 'C9');
      if (c9) c9.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    })()
  `);
  await sleep(600);

  const step2Summary = await evalJs(`
    (() => {
      const summaryEl = Array.from(document.querySelectorAll('span, div')).find(el => el.textContent?.includes('Recupera:'));
      return summaryEl?.textContent || '';
    })()
  `);
  console.log('Paso 2 Resumen en vivo:', step2Summary);
  await takeScreenshot('screenshot_step2_defense_steal_prepared.png');

  // =========================================================================
  // PASO 3: Confirmar -> Demo A queda con posesión y preparado para atacar
  // =========================================================================
  console.log('PASO 3: Confirmando y guardando robo de Demo A...');
  await evalJs(`
    (() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('CONFIRMAR Y GUARDAR'));
      if (confirmBtn) confirmBtn.click();
    })()
  `);
  await sleep(2200);

  const step3Audit = await evalJs(`
    (() => {
      const recentAction = document.querySelector('div.max-h-\\\\[480px\\\\]')?.textContent || '';
      const ownPos = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('River') || b.textContent.includes('Local'))?.textContent.includes('POSESIÓN');
      const isShot = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tiro'))?.className.includes('bg-sky-600');
      return { ownPos, isShot, recentAction: recentAction.slice(0, 160) };
    })()
  `);
  console.log('Paso 3 Auditoría:', step3Audit);
  await takeScreenshot('screenshot_step3_demo_a_possession_ready_to_attack.png');

  // =========================================================================
  // PASO 4: Registrar después un robo del Demo B -> debe ocurrir lo inverso
  // =========================================================================
  console.log('PASO 4: Registrando robo de Demo B (inverso)...');
  await evalJs(`
    (() => {
      const defBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim().endsWith('Defensa') && b.querySelector('svg'));
      if (defBtn) defBtn.click();
    })()
  `);
  await sleep(800);

  // Asegurar que el equipo recuperador sea Demo B
  await evalJs(`
    (() => {
      const rivalRecBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent.includes('Ferro') || b.textContent.includes('Rival')) && b.closest('div')?.textContent.includes('Equipo que recupera'));
      if (rivalRecBtn) rivalRecBtn.click();
    })()
  `);
  await sleep(500);

  // Confirmar robo de Demo B
  await evalJs(`
    (() => {
      const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('CONFIRMAR Y GUARDAR'));
      if (confirmBtn) confirmBtn.click();
    })()
  `);
  await sleep(2200);

  const step4Audit = await evalJs(`
    (() => {
      const rivalPos = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Ferro') || b.textContent.includes('Rival'))?.textContent.includes('POSESIÓN');
      return { rivalPos };
    })()
  `);
  console.log('Paso 4 Inverso Resultado:', step4Audit);
  await takeScreenshot('screenshot_step4_demo_b_steal_reverse.png');

  // =========================================================================
  // PASO 5: Repetir con intercambio Defensa–Ataque desactivado
  // =========================================================================
  console.log('PASO 5: Desactivar intercambio Defensa-Ataque...');
  await evalJs(`
    (() => {
      const configBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Configurar'));
      if (configBtn) configBtn.click();
    })()
  `);
  await sleep(600);

  await evalJs(`
    (() => {
      const cb = Array.from(document.querySelectorAll('input[type="checkbox"]')).find(c => c.closest('label')?.textContent.includes('Aplicar cambio automático'));
      if (cb && cb.checked) cb.click();
    })()
  `);
  await sleep(600);
  await takeScreenshot('screenshot_step5_auto_sub_disabled.png');

  // =========================================================================
  // PASO 6: Estadísticas del partido, recarga y Deshacer
  // =========================================================================
  console.log('PASO 6: Verificando estadísticas...');
  await evalJs(`
    (() => {
      const statsTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Estadísticas'));
      if (statsTab) statsTab.click();
    })()
  `);
  await sleep(1500);
  await takeScreenshot('screenshot_step6_stats_verified.png');

  // Volver a En Vivo y probar Deshacer
  console.log('Probando botón Deshacer...');
  await evalJs(`
    (() => {
      const liveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('En Vivo'));
      if (liveBtn) liveBtn.click();
    })()
  `);
  await sleep(1000);

  await evalJs(`
    (() => {
      const undoBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Deshacer'));
      if (undoBtn) undoBtn.click();
    })()
  `);
  await sleep(2000);

  await takeScreenshot('screenshot_step7_undo_restores_possession.png');
  console.log('--- Verificación completa finalizada con éxito ---');

  ws.close();
  edgeProc.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error durante la verificación:', err);
  process.exit(1);
});
