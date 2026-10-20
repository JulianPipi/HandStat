import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9223',
    '--window-size=1600,1200',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:4173/',
  ]);

  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      const res = await fetch('http://127.0.0.1:9223/json');
      const list = await res.json();
      const page = list.find((p) => p.type === 'page');
      if (page && page.webSocketDebuggerUrl) {
        wsUrl = page.webSocketDebuggerUrl;
        break;
      }
    } catch (e) {}
  }

  if (!wsUrl) {
    edgeProc.kill();
    process.exit(1);
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

  await new Promise((resolve) => ws.onopen = resolve);

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = idCounter++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(3000);

  // Click En Vivo, expand Configurar Pareja, and select Poste
  await send('Runtime.evaluate', {
    expression: `(async () => {
      const liveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('En Vivo'));
      if (liveButton) liveButton.click();
      await new Promise(r => setTimeout(r, 600));

      // Click "Configurar Pareja"
      const pairConfigBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Configurar Pareja'));
      if (pairConfigBtn) pairConfigBtn.click();
      await new Promise(r => setTimeout(r, 400));

      // Click "Poste"
      const posteBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.trim() === 'Poste');
      if (posteBtn) posteBtn.click();
      await new Promise(r => setTimeout(r, 400));
    })()`,
    awaitPromise: true,
  });

  await sleep(1500);

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const outPath = path.join(artifactDir, 'screenshot_features.png');
  fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
  console.log('Saved feature screenshot to:', outPath);

  ws.close();
  edgeProc.kill();
}

main().catch(console.error);
