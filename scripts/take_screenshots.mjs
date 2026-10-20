import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Launching Edge in headless mode with debugging port 9222...');
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1600,1100',
    '--disable-gpu',
    '--no-sandbox',
    'http://localhost:4173/',
  ]);

  edgeProc.on('error', (err) => console.error('Edge error:', err));

  // Wait for edge to open port
  let wsUrl = null;
  for (let i = 0; i < 20; i++) {
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
      // wait
    }
  }

  if (!wsUrl) {
    console.error('Could not obtain webSocketDebuggerUrl from Edge');
    edgeProc.kill();
    process.exit(1);
  }

  console.log('Connected to CDP at:', wsUrl);
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

  console.log('Enabling Page & Runtime...');
  await send('Page.enable');
  await send('Runtime.enable');

  // Wait 3 seconds for IndexedDB and React to initialize
  await sleep(3000);

  // Evaluate script to click match, go to live console, select player, select C9 and TR
  const evalResult = await send('Runtime.evaluate', {
    expression: `(async () => {
      // 1. If matches exist, click the first match or look for active tab
      const matchCards = document.querySelectorAll('button, div[role="button"]');
      let liveButton = Array.from(matchCards).find(b => b.textContent && b.textContent.includes('En Vivo'));
      
      // If we are on match selection, click first match
      if (!liveButton) {
        const selectMatchBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Cargar'));
        if (selectMatchBtn) {
          selectMatchBtn.click();
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      // Check for live tab
      liveButton = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('En Vivo'));
      if (liveButton) {
        liveButton.click();
        await new Promise(r => setTimeout(r, 1000));
      }

      // 2. Click a player in the roster (e.g. first starter button or player button)
      const playerBtns = Array.from(document.querySelectorAll('button')).filter(b => {
        return b.textContent && (b.textContent.includes('#') || b.textContent.includes('·') || b.textContent.includes('Titulares'));
      });
      // Try to select a player
      const actualPlayer = playerBtns.find(b => b.textContent && b.textContent.includes('#'));
      if (actualPlayer) {
        actualPlayer.click();
      }

      // 3. Click sector C9 on the SVG court
      const c9Element = document.querySelector('path[d*="M 175 325"]') || Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.includes('C9'));
      if (c9Element) {
        c9Element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      // 4. Click target TR on the SVG goal
      const trElement = Array.from(document.querySelectorAll('g[role="button"]')).find(g => g.textContent && g.textContent.trim() === 'TR');
      if (trElement) {
        trElement.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      }

      return {
        hasLiveConsole: !!document.querySelector('svg'),
        title: document.title,
        url: window.location.href
      };
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('DOM Evaluation Result:', evalResult);
  await sleep(1500);

  // Take PC screenshot (1600x1050)
  console.log('Capturing PC screenshot...');
  const pcScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  const pcPath = path.join(artifactDir, 'screenshot_pc.png');
  fs.writeFileSync(pcPath, Buffer.from(pcScreenshot.data, 'base64'));
  console.log('Saved PC screenshot to:', pcPath);

  // Set mobile device metrics (390 x 1450, device scale 2, mobile)
  console.log('Emulating mobile device (390x1450)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 1450,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(1200);

  // Take Mobile screenshot
  console.log('Capturing Mobile screenshot showing tactical field...');
  const mobileScreenshot = await send('Page.captureScreenshot', { format: 'png' });
  const mobilePath = path.join(artifactDir, 'screenshot_mobile.png');
  fs.writeFileSync(mobilePath, Buffer.from(mobileScreenshot.data, 'base64'));
  console.log('Saved Mobile screenshot to:', mobilePath);

  ws.close();
  edgeProc.kill();
  console.log('Screenshots completed successfully!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
