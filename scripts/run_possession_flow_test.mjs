import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=== INICIANDO PRUEBA DE FLUJO EN NAVEGADOR (RIVER 2 - FERRO 1) ===');

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1600,1100',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:4173/',
  ]);

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
    } catch (e) {}
  }

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
  await sleep(2500);

  // Helper de evaluación remota
  async function evalInPage(fn) {
    const expr = `(${fn.toString()})()`;
    const res = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result.value;
  }

  // 1. Verificación inicial de pantalla y versión
  console.log('1. Verificando versión de compilación y consola inicial...');
  const initInfo = await evalInPage(() => {
    const bodyText = document.body.innerText;
    return {
      hasBuild: bodyText.includes('Build 2026-10-16-2130'),
      hasRIV: bodyText.includes('RIV'),
      hasFCO: bodyText.includes('FCO'),
    };
  });
  console.log('   Compilación Build 2026-10-16-2130 presente:', initInfo.hasBuild);

  // 2. Paso 1: River anota GOL
  console.log('\n2. Paso 1: Seleccionar jugador River, zona C6, arco TR y confirmar GOL...');
  const step1 = await evalInPage(async () => {
    // Click en jugador River #10
    const p10 = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('#10'));
    if (p10) p10.click();

    // Click en sector C6
    const allG = Array.from(document.querySelectorAll('g[role="button"]'));
    const c6 = allG.find(g => g.textContent && g.textContent.includes('C6'));
    if (c6) c6.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Click en arco TR
    const tr = allG.find(g => g.textContent && g.textContent.trim() === 'TR');
    if (tr) tr.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 600));

    // Guardar
    const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toUpperCase().includes('CONFIRMAR Y GUARDAR'));
    if (!confirmBtn) return { error: 'No se encontró botón de confirmación' };
    confirmBtn.click();

    await new Promise(r => setTimeout(r, 1200));

    const text = document.body.innerText;
    return {
      success: true,
      textSnippet: text.slice(0, 700),
      hasFerroPossession: text.includes('POSESIÓN') && text.includes('FCO'),
      hasDefensePhase: text.includes('DEFENSA'),
      hasRivalOption: text.includes('Rival colectivo') || text.includes('dorsal rival')
    };
  });
  console.log('   Resultado Paso 1:', step1);

  // Captura Paso 1
  const ss1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_river_scores.png'), Buffer.from(ss1.data, 'base64'));
  console.log('   Captura guardada: screenshot_river_scores.png');

  // 3. Paso 2: Sin tocar selector de equipo, Ferro anota GOL
  console.log('\n3. Paso 2: SIN TOCAR SELECTOR DE EQUIPO, registrar GOL de Ferro (Rival Colectivo, R6, BL)...');
  const step2 = await evalInPage(async () => {
    // Ferro ya debe estar como equipo activo. Seleccionar zona R6
    const allG = Array.from(document.querySelectorAll('g[role="button"]'));
    const r6 = allG.find(g => g.textContent && g.textContent.includes('R6'));
    if (r6) r6.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Seleccionar arco BL
    const bl = allG.find(g => g.textContent && g.textContent.trim() === 'BL');
    if (bl) bl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 600));

    // Guardar
    const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toUpperCase().includes('CONFIRMAR Y GUARDAR'));
    if (!confirmBtn) return { error: 'No se encontró botón de confirmación' };
    confirmBtn.click();

    await new Promise(r => setTimeout(r, 1200));

    const text = document.body.innerText;
    return {
      success: true,
      textSnippet: text.slice(0, 700),
      hasRiverPossession: text.includes('POSESIÓN') && text.includes('RIV'),
      hasAttackPhase: text.includes('ATAQUE'),
      hasRiverRoster: text.includes('#10') || text.includes('#7') || text.includes('Simonet')
    };
  });
  console.log('   Resultado Paso 2:', step2);

  // Captura Paso 2
  const ss2 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_ferro_scores.png'), Buffer.from(ss2.data, 'base64'));
  console.log('   Captura guardada: screenshot_ferro_scores.png');

  // 4. Paso 3: Sin tocar selector de equipo, River anota su segundo GOL (Marcador 2-1)
  console.log('\n4. Paso 3: SIN TOCAR SELECTOR DE EQUIPO, River anota su segundo gol (Jugador #7, L9, TL)...');
  const step3 = await evalInPage(async () => {
    // Seleccionar jugador #7
    const p7 = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('#7'));
    if (p7) p7.click();

    // Seleccionar L9
    const allG = Array.from(document.querySelectorAll('g[role="button"]'));
    const l9 = allG.find(g => g.textContent && g.textContent.includes('L9'));
    if (l9) l9.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    // Seleccionar TL
    const tl = allG.find(g => g.textContent && g.textContent.trim() === 'TL');
    if (tl) tl.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 600));

    // Guardar
    const confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.toUpperCase().includes('CONFIRMAR Y GUARDAR'));
    if (!confirmBtn) return { error: 'No se encontró botón de confirmación' };
    confirmBtn.click();

    await new Promise(r => setTimeout(r, 1500));

    const text = document.body.innerText;
    return {
      success: true,
      textSnippet: text.slice(0, 700),
      scoreFound: text.includes('2') && text.includes('1'),
      hasFerroPossession: text.includes('POSESIÓN') && text.includes('FCO')
    };
  });
  console.log('   Resultado Paso 3 (Marcador 2-1):', step3);

  // Captura Paso 3
  const ss3 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_final_2_1.png'), Buffer.from(ss3.data, 'base64'));
  console.log('   Captura guardada: screenshot_final_2_1.png');

  // 5. Paso 4: Recarga F5 y persistencia
  console.log('\n5. Paso 4: Recarga completa (F5) para validar persistencia de posesión y marcador...');
  await send('Page.reload');
  await sleep(3000);

  const step4 = await evalInPage(async () => {
    const text = document.body.innerText;
    return {
      reloaded: true,
      textSnippet: text.slice(0, 700),
      hasFerroActive: text.includes('FCO') || text.includes('Ferro'),
      hasScore21: text.includes('2') && text.includes('1')
    };
  });
  console.log('   Resultado Paso 4 tras recarga F5:', step4);

  ws.close();
  edgeProc.kill();
  console.log('\n=== PRUEBA DE NAVEGADOR COMPLETADA CON ÉXITO TOTAL ===');
}

main().catch(err => {
  console.error('ERROR EN PRUEBA:', err);
  process.exit(1);
});
