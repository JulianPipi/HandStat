import { spawn } from 'child_process';

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
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

  const res = await send('Runtime.evaluate', {
    expression: `(async () => {
      const openReq = indexedDB.open('HandballAnalyticsDB');
      return new Promise((resolve, reject) => {
        openReq.onsuccess = async () => {
          const db = openReq.result;
          const tx = db.transaction(['matches', 'teams', 'players', 'matchEvents'], 'readonly');
          const getAll = (storeName) => new Promise(res => {
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => res(req.result);
          });
          const [matches, teams, players, matchEvents] = await Promise.all([
            getAll('matches'),
            getAll('teams'),
            getAll('players'),
            getAll('matchEvents')
          ]);
          resolve({
            matches: matches.map(m => ({ id: m.id, home: m.home_team_name_snapshot || m.home_team_id, away: m.away_team_name_snapshot || m.away_team_id, status: m.status, competition: m.competition, created_at: m.created_at, is_demo: m.is_demo })),
            teams: teams.map(t => ({ id: t.id, name: t.name, is_own: t.is_own, archived: t.archived })),
            playersCount: players.length,
            eventsCount: matchEvents.length
          });
        };
        openReq.onerror = e => reject(e);
      });
    })()`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('Current DB Inventory:', JSON.stringify(res.result.value, null, 2));

  ws.close();
  edgeProc.kill();
}

main().catch(console.error);
