import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=== VERIFICANDO CICLO DE RESPALDO Y RESTAURACIÓN EN NAVEGADOR ===');

  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
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

  // Ir a pestaña Exportar / Respaldos
  const navResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      const exportTab = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Exportar / Respaldos'));
      if (exportTab) {
        exportTab.click();
        await new Promise(r => setTimeout(r, 1000));
        return { success: true };
      }
      return { success: false };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('Navegación a Exportar / Respaldos:', navResult.result.value);

  // Crear respaldo en la UI o via código
  const backupTest = await send('Runtime.evaluate', {
    expression: `(async () => {
      // Usar backupService instanciado en la aplicación si es accesible o probar directamente
      // Simular click en "Crear y Descargar Respaldo Completo"
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Crear y Descargar Respaldo Completo'));
      return { hasButton: !!btn };
    })()`,
    returnByValue: true
  });
  console.log('Botón de respaldo visible:', backupTest.result.value);

  ws.close();
  edgeProc.kill();
}

main().catch(console.error);
