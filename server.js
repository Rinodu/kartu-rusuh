const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { GameRoom, HELL } = require('./game');

const ROOT = path.join(__dirname, 'public');
const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');
fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'game.sqlite'));
db.exec('CREATE TABLE IF NOT EXISTS wins (id INTEGER PRIMARY KEY, player TEXT NOT NULL, mode TEXT NOT NULL, played_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
const saveWin = db.prepare('INSERT INTO wins (player, mode) VALUES (?, ?)');
const leaderboard = db.prepare('SELECT player, COUNT(*) AS wins FROM wins GROUP BY player ORDER BY wins DESC LIMIT 10');

const rooms = new Map();
const sessions = new Map();
const clients = new Set();
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

function json(res, obj, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
const server = http.createServer((req, res) => {
  if (req.url === '/api/health') return json(res, { ok: true, rooms: rooms.size });
  if (req.url === '/api/leaderboard') return json(res, leaderboard.all());
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, { error: 'Method not allowed' }, 405);
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return json(res, { error: 'Bad URL' }, 400); }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep)) return json(res, { error: 'Forbidden' }, 403);
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return json(res, { error: 'Not found' }, 404);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
});

function frame(opcode, data = Buffer.alloc(0)) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const header = payload.length < 126 ? 2 : payload.length < 65536 ? 4 : 10;
  const out = Buffer.allocUnsafe(header + payload.length);
  out[0] = 0x80 | opcode;
  if (header === 2) out[1] = payload.length;
  else if (header === 4) { out[1] = 126; out.writeUInt16BE(payload.length, 2); }
  else { out[1] = 127; out.writeBigUInt64BE(BigInt(payload.length), 2); }
  payload.copy(out, header);
  return out;
}
function send(client, data) {
  if (!client.socket.destroyed && client.socket.writable) client.socket.write(frame(1, JSON.stringify(data)));
}
function close(client) {
  if (client.closed) return;
  client.closed = true; clients.delete(client);
  if (client.token && sessions.get(client.token)?.client === client) {
    const session = sessions.get(client.token); session.client = null;
    if (session.room) {
      const p = session.room.get(session.pid);
      if (p) { p.online = false; session.room.say(`${p.name} terputus. Bisa masuk lagi lewat link room.`); broadcast(session.room); }
    }
  }
}
function broadcast(room) {
  for (const s of sessions.values()) if (s.room === room && s.client) send(s.client, { type: 'state', state: room.view(s.pid) });
}
function persisted(room, before) {
  if (before === 'playing' && room.status === 'ended' && room.lastWinner) {
    saveWin.run(room.get(room.lastWinner)?.name || 'Pemain', room.hell ? 'neraka' : 'klasik');
  }
}
function removeFromOldRoom(session) {
  const room = session.room;
  if (!room) return;
  if (room.status === 'playing') throw Error('Selesaikan ronde saat ini sebelum pindah room.');
  room.players = room.players.filter(p => p.id !== session.pid);
  if (room.owner === session.pid) room.owner = room.players[0]?.id || null;
  if (!room.players.length) rooms.delete(room.code);
  else broadcast(room);
  session.room = null;
}
function handle(client, msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') throw Error('Pesan tidak valid.');
  if (msg.type === 'hello') {
    if (client.token) throw Error('Sesi sudah aktif.');
    const token = /^[a-f0-9]{48}$/.test(msg.token) ? msg.token : crypto.randomBytes(24).toString('hex');
    let s = sessions.get(token);
    if (!s) { s = { token, pid: crypto.randomBytes(12).toString('hex'), room: null, client: null }; sessions.set(token, s); }
    if (s.client && s.client !== client) s.client.socket.end(frame(8));
    s.client = client; client.token = token;
    send(client, { type: 'hello', token, pid: s.pid });
    if (s.room) { const p = s.room.get(s.pid); if (p) p.online = true; broadcast(s.room); }
    return;
  }
  const s = sessions.get(client.token);
  if (!s || s.client !== client) throw Error('Sesi belum aktif.');
  if (msg.type === 'create') {
    removeFromOldRoom(s);
    const powers = Array.isArray(msg.powers) ? HELL.filter(kind => msg.powers.includes(kind)) : HELL;
    const room = new GameRoom(s.pid, msg.hell !== false, powers);
    while (rooms.has(room.code)) room.code = crypto.randomBytes(3).toString('hex').toUpperCase();
    room.add(s.pid, msg.name); rooms.set(room.code, room); s.room = room;
    broadcast(room); return;
  }
  if (msg.type === 'join') {
    const room = rooms.get(String(msg.code || '').trim().toUpperCase());
    if (!room) throw Error('Kode room tidak ditemukan. Pastikan PC host masih menyala.');
    if (s.room === room) { broadcast(room); return; }
    removeFromOldRoom(s); room.add(s.pid, msg.name); s.room = room;
    broadcast(room); return;
  }
  const room = s.room;
  if (!room) throw Error('Masuk room dulu.');
  const before = room.status;
  if (msg.type === 'start') room.start(s.pid);
  else if (msg.type === 'play') room.play(s.pid, msg.cardId, msg.color, msg.target);
  else if (msg.type === 'draw') room.draw(s.pid);
  else if (msg.type === 'react') room.react(s.pid, msg.cardId, msg.color);
  else if (msg.type === 'accept') { if (!room.pending || room.pending.target !== s.pid) throw Error('Tidak ada serangan untuk lu.'); room.resolve(); }
  else throw Error('Aksi tidak dikenal.');
  persisted(room, before); broadcast(room);
}
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  let originHost = null;
  try { if (origin) originHost = new URL(origin).host; } catch { return socket.destroy(); }
  if (req.url !== '/ws' || req.headers.upgrade?.toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key'] || (originHost && originHost !== req.headers.host)) return socket.destroy();
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  const client = { socket, buffer: Buffer.alloc(0), token: null, closed: false };
  clients.add(client);
  socket.on('data', data => {
    client.buffer = Buffer.concat([client.buffer, data]);
    if (client.buffer.length > 65536) return socket.destroy();
    while (client.buffer.length >= 2) {
      const b = client.buffer, opcode = b[0] & 15, fin = !!(b[0] & 128), masked = !!(b[1] & 128);
      let len = b[1] & 127, offset = 2;
      if (!fin || !masked) return socket.destroy();
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); offset = 4; }
      if (len === 127) return socket.destroy();
      if (len > 16384) return socket.destroy();
      if (b.length < offset + 4 + len) return;
      const mask = b.subarray(offset, offset + 4), payload = Buffer.from(b.subarray(offset + 4, offset + 4 + len));
      client.buffer = b.subarray(offset + 4 + len);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      if (opcode === 8) { socket.end(frame(8)); return; }
      if (opcode === 9) { socket.write(frame(10, payload)); continue; }
      if (opcode !== 1) return socket.destroy();
      try { handle(client, JSON.parse(payload.toString('utf8'))); }
      catch (error) { send(client, { type: 'error', message: error.message || 'Aksi gagal.' }); }
    }
  });
  if (head.length) socket.emit('data', head);
  socket.on('close', () => close(client)); socket.on('error', () => close(client));
});
setInterval(() => {
  for (const room of rooms.values()) { const before = room.status; if (room.tick()) { persisted(room, before); broadcast(room); } }
}, 250).unref();
server.listen(PORT, HOST, () => console.log(`Kartu Rusuh jalan di http://${HOST}:${server.address().port}`));

