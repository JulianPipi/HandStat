import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1500,1200',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:4173/',
  ]);

  let wsUrl = null;
  for (let i = 0; i < 25; i++) {
    await sleep(400);
    try {
      const res = await fetch('http://127.0.0.1:9222/json');
      const list = await res.json();
      const page = list.find((p) => p.type === 'page');
      if (page && page.webSocketDebuggerUrl) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (e) {}
  }
  if (!wsUrl) return edgeProc.kill();

  const ws = new WebSocket(wsUrl);
  let id = 1;
  const map = new Map();
  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    if (d.id && map.has(d.id)) { map.get(d.id)(d.result); map.delete(d.id); }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const reqId = id++;
    map.set(reqId, res);
    ws.send(JSON.stringify({ id: reqId, method, params }));
  });

  await new Promise((r) => (ws.onopen = r));
  await send('Page.enable');
  await send('Runtime.enable');
  const evalJs = (expr) => send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });

  await sleep(3500);

  // Ir a Partidos y Cargar partido con datos
  await evalJs(`
    const matchesTab = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Partidos'));
    if (matchesTab) matchesTab.click();
  `);
  await sleep(800);

  await evalJs(`
    const loadBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cargar');
    if (loadBtn) loadBtn.click();
  `);
  await sleep(1000);

  // Ir a Panel del DT
  await evalJs(`
    const coachTab = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Panel del DT'));
    if (coachTab) coachTab.click();
  `);
  await sleep(1000);

  // Seleccionar Todo el partido
  await evalJs(`
    const allMatchBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Todo el partido'));
    if (allMatchBtn) allMatchBtn.click();
  `);
  await sleep(1000);

  // Scroll hacia la sección de canchas
  await evalJs(`
    window.scrollTo(0, 1400);
    document.documentElement.scrollTop = 1400;
    document.body.scrollTop = 1400;
    const m = document.querySelector('main');
    if (m) m.scrollTop = 1400;
  `);
  await sleep(1000);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_step6_coach_court_and_goal_maps.png'), Buffer.from(shot.data, 'base64'));
  console.log('Captura de cancha y arco completada');

  ws.close();
  edgeProc.kill();
}

main();
