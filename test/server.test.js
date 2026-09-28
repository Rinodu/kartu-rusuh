const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function waitMessage(ws, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { ws.removeEventListener('message', onMessage); reject(Error('Timeout menunggu pesan server')); }, 3000);
    function onMessage(event) {
      const msg = JSON.parse(event.data);
      if (!predicate(msg)) return;
      clearTimeout(timeout); ws.removeEventListener('message', onMessage); resolve(msg);
    }
    ws.addEventListener('message', onMessage);
  });
}
function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve(ws), { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
}
function send(ws, data) { ws.send(JSON.stringify(data)); }

test('dua browser dapat membuat room, bergabung, dan melihat tangan masing-masing', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kartu-rusuh-test-'));
  const child = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: '0', HOST: '127.0.0.1', DATA_DIR: dataDir } });
  let a, b;
  try {
    const port = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(Error('Server tidak mulai')), 4000);
      child.stdout.on('data', chunk => { const match = String(chunk).match(/127\.0\.0\.1:(\d+)/); if (match) { clearTimeout(timeout); resolve(Number(match[1])); } });
      child.on('exit', code => reject(Error(`Server berhenti: ${code}`)));
    });
    a = await open(`ws://127.0.0.1:${port}/ws`);
    b = await open(`ws://127.0.0.1:${port}/ws`);
    let reply = waitMessage(a, x => x.type === 'hello'); send(a, { type: 'hello' }); const helloA = await reply;
    reply = waitMessage(b, x => x.type === 'hello'); send(b, { type: 'hello' }); const helloB = await reply;
    assert.notEqual(helloA.pid, helloB.pid);
    reply = waitMessage(a, x => x.type === 'state' && x.state.status === 'lobby'); send(a, { type: 'create', name: 'Alpha', hell: true, powers: ['death'] });
    const code = (await reply).state.code;
    reply = waitMessage(b, x => x.type === 'state' && x.state.players.length === 2); send(b, { type: 'join', code, name: 'Beta' }); await reply;
    const aState = waitMessage(a, x => x.type === 'state' && x.state.status === 'playing');
    const bState = waitMessage(b, x => x.type === 'state' && x.state.status === 'playing');
    send(a, { type: 'start' });
    const [av, bv] = await Promise.all([aState, bState]);
    assert.equal(av.state.hand.length, 7);
    assert.equal(bv.state.hand.length, 7);
    assert.equal(av.state.powers.join(','), 'death');
    assert.notDeepEqual(av.state.hand, bv.state.hand);
    assert.equal(av.state.players.length, 2);
  } finally {
    a?.close(); b?.close(); child.kill();
    if (child.exitCode === null) await new Promise(resolve => child.once('exit', resolve));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

