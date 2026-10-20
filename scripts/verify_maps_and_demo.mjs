import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactDir = 'C:\\Users\\Fede\\.gemini\\antigravity\\brain\\a6b90b2f-c62a-4433-9323-057afa586262';

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('Starting Edge CDP automated verification for Tactical Maps & Demo Data...');
  const edgeProc = spawn(edgePath, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--window-size=1600,1100',
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
    console.error('Could not connect to Edge DevTools');
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
  await send('DOM.enable');

  console.log('Waiting for application to load and DB to seed demo data...');
  await sleep(3000);

  // Helper to evaluate script
  const evalScript = async (expression) => {
    const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return res.result?.value;
  };

  // 1. Check title and build tag
  const pageTitle = await evalScript(`document.querySelector('header h1')?.textContent`);
  const buildTag = await evalScript(`document.querySelector('header span.font-mono')?.textContent`);
  console.log('Header text:', pageTitle, '| Build:', buildTag);

  // 2. Load the Finished Demo Match to have rich events and stats in Mapas
  console.log('Navigating to Partidos tab to load Finished Demo match...');
  await evalScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const matchesBtn = buttons.find(b => b.textContent.includes('Partidos'));
      if (matchesBtn) matchesBtn.click();
    })()
  `);
  await sleep(1000);

  // Load the finished demo match
  const loadFinishedResult = await evalScript(`
    (() => {
      const cards = Array.from(document.querySelectorAll('div.border'));
      for (const card of cards) {
        if (card.textContent.includes('vs') && card.textContent.includes('Demostración') || card.textContent.includes('Demo')) {
          const loadBtn = Array.from(card.querySelectorAll('button')).find(b => b.textContent.includes('Cargar'));
          if (loadBtn) {
            loadBtn.click();
            return 'LOADED_DEMO';
          }
        }
      }
      return 'NO_LOAD_BTN_FOUND';
    })()
  `);
  console.log('Load match result:', loadFinishedResult);
  await sleep(1200);

  // 3. Switch to Mapas tab
  console.log('Switching to Mapas tab...');
  await evalScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const mapsBtn = buttons.find(b => b.textContent.includes('Mapas'));
      if (mapsBtn) mapsBtn.click();
    })()
  `);
  await sleep(1500);

  // Take PC screenshot of Mapas tab (Shots mode)
  console.log('Capturing PC screenshot of Tactical Analysis Map...');
  const screen1 = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_tactical_map_pc.png'), Buffer.from(screen1.data, 'base64'));
  console.log('Saved screenshot_tactical_map_pc.png');

  // 4. Click a sector to test interactive drawer inspection (e.g. C9 or LW)
  console.log('Clicking on court sector C9 to open sector inspector...');
  const clickSector = await evalScript(`
    (() => {
      // Find SVG group for C9
      const gList = Array.from(document.querySelectorAll('svg g[role="button"]'));
      const c9Group = gList.find(g => g.textContent.includes('C9') || g.getAttribute('key') === 'C9');
      if (c9Group) {
        c9Group.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return 'CLICKED_C9';
      }
      // Alternative: click any court sector
      if (gList.length > 0) {
        gList[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return 'CLICKED_FIRST_SECTOR';
      }
      return 'NOT_FOUND';
    })()
  `);
  console.log('Click sector result:', clickSector);
  await sleep(1000);

  const screenSector = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_tactical_map_sector_inspector.png'), Buffer.from(screenSector.data, 'base64'));
  console.log('Saved screenshot_tactical_map_sector_inspector.png');

  // 5. Switch to Turnovers mode
  console.log('Switching map to Pérdidas de Balón (Turnovers) mode...');
  await evalScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const turnoversBtn = buttons.find(b => b.textContent.includes('Pérdidas de Balón') || b.textContent.includes('Pérdidas'));
      if (turnoversBtn) turnoversBtn.click();
    })()
  `);
  await sleep(1000);

  const screenTurnovers = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_turnovers_map.png'), Buffer.from(screenTurnovers.data, 'base64'));
  console.log('Saved screenshot_turnovers_map.png');

  // 6. Test Mobile Viewport (iPhone 14 / modern mobile 390x844)
  console.log('Setting mobile viewport emulation (390x844)...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await sleep(1200);

  // Switch back to Shots mode on mobile
  await evalScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const shotsBtn = buttons.find(b => b.textContent.includes('Lanzamientos') && !b.textContent.includes('Filtro'));
      if (shotsBtn) shotsBtn.click();
    })()
  `);
  await sleep(1000);

  console.log('Capturing mobile screenshot of Tactical Analysis Map...');
  const screenMobile = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_tactical_map_mobile.png'), Buffer.from(screenMobile.data, 'base64'));
  console.log('Saved screenshot_tactical_map_mobile.png');

  // 7. Test Aggregates tab and Demo toggle
  console.log('Testing Acumulados tab with demo toggle...');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1400,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(500);

  await evalScript(`
    (() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const aggBtn = buttons.find(b => b.textContent.includes('Acumulados'));
      if (aggBtn) aggBtn.click();
    })()
  `);
  await sleep(1000);

  const screenAggDefault = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_aggregates_default.png'), Buffer.from(screenAggDefault.data, 'base64'));
  console.log('Saved screenshot_aggregates_default.png');

  // Toggle demo matches
  await evalScript(`
    (() => {
      const label = Array.from(document.querySelectorAll('label')).find(l => l.textContent.includes('demostración'));
      const checkbox = label ? label.querySelector('input') : null;
      if (checkbox) {
        checkbox.click();
      }
    })()
  `);
  await sleep(1500);

  const screenAggDemo = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(artifactDir, 'screenshot_aggregates_with_demo.png'), Buffer.from(screenAggDemo.data, 'base64'));
  console.log('Saved screenshot_aggregates_with_demo.png');

  console.log('All verification tasks and screenshots completed successfully!');
  ws.close();
  edgeProc.kill();
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
