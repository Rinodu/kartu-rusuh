const crypto = require('node:crypto');

const COLORS = ['merah', 'biru', 'hijau', 'kuning'];
const HELL = ['kiamat', 'death', 'swap', 'mirror', 'shield', 'revive', 'curse'];
const MAX_PLAYERS = 8;
const TURN_MS = 15000;
const REACT_MS = 9000;

function id() { return crypto.randomBytes(9).toString('hex'); }
function code() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }
function card(kind, color = null, value = null) { return { id: id(), kind, color, value }; }
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function makeDeck(hell, powers = HELL) {
  const d = [];
  for (const color of COLORS) {
    d.push(card('number', color, 0));
    for (let n = 1; n <= 9; n++) for (let x = 0; x < 2; x++) d.push(card('number', color, n));
    for (let x = 0; x < 2; x++) {
      d.push(card('skip', color)); d.push(card('reverse', color)); d.push(card('draw2', color));
    }
  }
  for (let i = 0; i < 4; i++) d.push(card('wild'));
  if (hell) for (const kind of powers) for (let i = 0; i < (['kiamat', 'death'].includes(kind) ? 1 : 2); i++) d.push(card(kind));
  return shuffle(d);
}
function name(s) { return String(s || 'Pemain').trim().slice(0, 18).replace(/[<>]/g, '') || 'Pemain'; }

class GameRoom {
  constructor(owner, hell = true, powers = HELL) {
    this.code = code(); this.players = []; this.owner = owner; this.hell = !!hell;
    this.powers = this.hell ? HELL.filter(kind => powers.includes(kind)) : [];
    this.status = 'lobby'; this.deck = []; this.discard = []; this.turn = 0; this.dir = 1;
    this.color = null; this.pending = null; this.deadline = null; this.log = [];
    this.wins = new Map(); this.lastWinner = null; this.round = 0;
  }
  add(pid, playerName) {
    if (this.players.length >= MAX_PLAYERS) throw Error('Room penuh.');
    if (this.status !== 'lobby' && this.status !== 'ended') throw Error('Ronde sedang berjalan. Tunggu ronde berikutnya.');
    if (this.players.some(p => p.id === pid)) return;
    this.players.push({ id: pid, name: name(playerName), hand: [], alive: true, online: true, revived: false });
    this.wins.set(pid, this.wins.get(pid) || 0);
    this.say(`${name(playerName)} bergabung.`);
  }
  say(s) { this.log.unshift(s); this.log.length = Math.min(this.log.length, 8); }
  get(pid) { return this.players.find(p => p.id === pid); }
  alive() { return this.players.filter(p => p.alive); }
  next(from = this.turn, steps = 1) {
    let i = from;
    for (let n = 0; n < steps; n++) {
      let attempts = 0;
      do { i = (i + this.dir + this.players.length) % this.players.length; attempts++; }
      while (!this.players[i].alive && attempts <= this.players.length);
    }
    return i;
  }
  start(pid) {
    if (pid !== this.owner) throw Error('Cuma host yang bisa mulai.');
    if (this.players.length < 2) throw Error('Butuh minimal 2 pemain.');
    this.round++; this.status = 'playing'; this.deck = makeDeck(this.hell, this.powers); this.discard = [];
    this.turn = (this.round - 1) % this.players.length; this.dir = 1; this.pending = null;
    this.lastWinner = null; this.log = [];
    for (const p of this.players) { p.hand = []; p.alive = true; p.revived = false; this.drawCards(p, 7); }
    const first = this.deck.findIndex(c => c.kind === 'number');
    this.discard.push(this.deck.splice(first, 1)[0]); this.color = this.discard[0].color;
    this.deadline = Date.now() + TURN_MS;
    this.say(`Ronde ${this.round} dimulai. ${this.players[this.turn].name} jalan duluan.`);
  }
  drawCards(p, count) {
    for (let x = 0; x < count; x++) {
      if (!this.deck.length && this.discard.length > 1) {
        const top = this.discard.pop(); this.deck = shuffle(this.discard); this.discard = [top];
      }
      if (!this.deck.length) break;
      p.hand.push(this.deck.pop());
    }
  }
  playable(c) {
    const top = this.discard.at(-1);
    if (!c.color) return true;
    return c.color === this.color || (c.kind === 'number' && top.kind === 'number' && c.value === top.value) || c.kind === top.kind;
  }
  requireTurn(pid) {
    if (this.status !== 'playing' || this.pending) throw Error('Aksi belum tersedia.');
    if (this.players[this.turn]?.id !== pid) throw Error('Belum giliran lu.');
  }
  advance(steps = 1) { this.turn = this.next(this.turn, steps); this.deadline = Date.now() + TURN_MS; }
  play(pid, cardId, chosenColor, targetId) {
    this.requireTurn(pid);
    const p = this.get(pid), idx = p.hand.findIndex(c => c.id === cardId);
    if (idx < 0) throw Error('Kartu tidak ada di tangan.');
    const c = p.hand[idx];
    if (!this.playable(c)) throw Error('Kartu ini tidak cocok.');
    if (!c.color && !COLORS.includes(chosenColor)) throw Error('Pilih warna dulu.');
    let target = null;
    if (c.kind === 'swap' || c.kind === 'death' || c.kind === 'kiamat' || c.kind === 'curse') {
      target = this.get(targetId);
      if (!target || target.id === pid || !target.alive) throw Error('Pilih target yang masih bermain.');
    }
    p.hand.splice(idx, 1); this.discard.push(c); this.color = c.color || chosenColor;
    this.say(`${p.name} memainkan ${label(c)}${target ? ` ke ${target.name}` : ''}.`);
    if (c.kind === 'kiamat' || c.kind === 'death') {
      this.pending = { kind: c.kind, attacker: pid, target: target.id, amount: c.kind === 'kiamat' ? 100 : 0 };
      this.deadline = Date.now() + REACT_MS;
      this.say(`${target.name} punya 9 detik untuk membalas!`);
      return;
    }
    if (c.kind === 'swap') {
      const hand = p.hand; p.hand = target.hand; target.hand = hand;
      this.say(`${p.name} menukar seluruh tangan dengan ${target.name}.`);
    }
    if (c.kind === 'curse') { this.drawCards(target, 3); this.say(`${target.name} mengambil 3 kartu kutukan.`); }
    if (c.kind === 'draw2') { const t = this.players[this.next()]; this.drawCards(t, 2); this.say(`${t.name} mengambil 2 kartu dan kehilangan giliran.`); }
    if (['mirror', 'shield', 'revive'].includes(c.kind)) this.say('Power up dibuang tanpa efek karena tidak dimainkan saat diserang.');
    if (c.kind === 'reverse') this.dir *= -1;
    this.finishOrAdvance(c.kind === 'skip' || c.kind === 'draw2' ? 2 : 1);
  }
  finishOrAdvance(steps = 1) {
    const winner = this.players.find(p => p.alive && p.hand.length === 0);
    if (winner || this.alive().length <= 1) { this.finish(winner || this.alive()[0]); return; }
    this.advance(steps);
  }
  finish(winner) {
    this.status = 'ended'; this.pending = null; this.deadline = null;
    this.lastWinner = winner?.id || null;
    if (winner) { this.wins.set(winner.id, (this.wins.get(winner.id) || 0) + 1); this.say(`${winner.name} MENANG!`); }
  }
  draw(pid) { this.requireTurn(pid); const p = this.get(pid); this.drawCards(p, 1); this.say(`${p.name} mengambil 1 kartu.`); this.advance(); }
  react(pid, cardId, chosenColor) {
    if (this.status !== 'playing' || !this.pending || this.pending.target !== pid) throw Error('Tidak ada serangan untuk lu.');
    const p = this.get(pid), idx = p.hand.findIndex(c => c.id === cardId);
    if (idx < 0) throw Error('Kartu tidak ada.');
    const c = p.hand[idx];
    if (!['mirror', 'shield'].includes(c.kind) && !(this.pending.kind === 'kiamat' && c.kind === 'draw2')) throw Error('Kartu ini tidak bisa membalas.');
    if (c.kind === 'draw2' && c.color !== this.color) throw Error('+2 harus cocok dengan warna saat ini.');
    if (!c.color && !COLORS.includes(chosenColor)) throw Error('Pilih warna dulu.');
    p.hand.splice(idx, 1); this.discard.push(c); this.color = c.color || chosenColor;
    const attack = this.pending;
    if (c.kind === 'shield') {
      this.say(`${p.name} memblokir ${label({kind: attack.kind})} dengan Perisai.`);
      this.pending = null; this.turn = this.players.indexOf(p); this.advance(); return;
    }
    if (c.kind === 'mirror') {
      this.say(`${p.name} MEMANTULKAN serangan ke ${this.get(attack.attacker).name}!`);
      this.pending = { ...attack, attacker: pid, target: attack.attacker };
      this.deadline = Date.now() + REACT_MS; return;
    }
    const next = this.players[this.next(this.players.indexOf(p))];
    this.pending = { kind: 'kiamat', attacker: pid, target: next.id, amount: attack.amount + 2 };
    this.deadline = Date.now() + REACT_MS;
    this.say(`${p.name} menumpuk +2. Utang ${this.pending.amount} pindah ke ${next.name}!`);
  }
  resolve() {
    const attack = this.pending; if (!attack) return;
    this.pending = null;
    const p = this.get(attack.target);
    if (!p || !p.alive) { this.finishOrAdvance(); return; }
    const revive = p.hand.findIndex(c => c.kind === 'revive');
    if (revive >= 0 && !p.revived) {
      p.hand.splice(revive, 1); p.hand = []; this.drawCards(p, 7); p.revived = true;
      this.say(`${p.name} terselamatkan oleh BANGKIT dan kembali dengan 7 kartu!`);
    } else {
      p.alive = false; p.hand = [];
      this.say(`${p.name} TERSINGKIR oleh ${attack.kind === 'kiamat' ? `+${attack.amount} Kiamat` : 'Instant Death'}!`);
    }
    this.turn = this.players.indexOf(p);
    this.finishOrAdvance();
  }
  tick(now = Date.now()) {
    if (this.status !== 'playing' || !this.deadline || now < this.deadline) return false;
    if (this.pending) { this.resolve(); return true; }
    const p = this.players[this.turn]; this.drawCards(p, 1); this.say(`${p.name} kehabisan waktu dan mengambil 1 kartu.`); this.advance(); return true;
  }
  view(pid) {
    const you = this.get(pid);
    return {
      code: this.code, status: this.status, owner: this.owner, hell: this.hell, powers: this.powers, round: this.round, deckCount: this.deck.length,
      turn: this.players[this.turn]?.id, dir: this.dir, color: this.color, top: this.discard.at(-1) || null,
      deadline: this.deadline, pending: this.pending && { ...this.pending }, log: this.log,
      players: this.players.map(p => ({ id: p.id, name: p.name, count: p.hand.length, alive: p.alive, online: p.online, wins: this.wins.get(p.id) || 0 })),
      hand: you?.hand || [], you: pid, lastWinner: this.lastWinner
    };
  }
}
function label(c) {
  return ({ number: c.value, skip: 'Lewat', reverse: 'Putar Balik', draw2: '+2', wild: 'Ganti Warna',
    kiamat: '+100 KIAMAT', death: 'INSTANT DEATH', swap: 'Tukar Nasib', mirror: 'Cermin Absolut',
    shield: 'Perisai', revive: 'Bangkit', curse: 'Kutukan +3' })[c.kind];
}
module.exports = { GameRoom, COLORS, HELL, label, TURN_MS, REACT_MS };

