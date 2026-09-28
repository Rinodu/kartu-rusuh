const test = require('node:test');
const assert = require('node:assert/strict');
const { GameRoom } = require('../game');

function card(kind, color = null, value = null) { return { id: Math.random().toString(36).slice(2), kind, color, value }; }
function room(count = 2) {
  const g = new GameRoom('p1', true);
  for (let n = 1; n <= count; n++) g.add(`p${n}`, `Pemain ${n}`);
  g.start('p1'); g.turn = 0; g.color = 'merah'; g.discard = [card('number', 'merah', 4)];
  return g;
}

test('kartu pemain lain tetap tersembunyi dan hanya host bisa mulai', () => {
  const g = new GameRoom('p1'); g.add('p1', 'Satu'); g.add('p2', 'Dua');
  assert.throws(() => g.start('p2'), /host/);
  g.start('p1');
  assert.equal(g.view('p1').hand.length, 7);
  assert.equal(g.view('p1').players[1].count, 7);
  assert.notDeepEqual(g.view('p1').hand, g.view('p2').hand);
});

test('+100 dapat diblokir perisai dan giliran berpindah', () => {
  const g = room(); const boom = card('kiamat');
  g.get('p1').hand = [boom, card('number', 'biru', 9)];
  const shield = card('shield'); g.get('p2').hand = [shield, card('number', 'hijau', 2)];
  g.play('p1', boom.id, 'merah', 'p2');
  assert.equal(g.pending.amount, 100);
  g.react('p2', shield.id, 'biru');
  assert.equal(g.pending, null);
  assert.equal(g.get('p2').alive, true);
  assert.equal(g.players[g.turn].id, 'p1');
});

test('Instant Death dipantulkan lalu menyerang pengirim', () => {
  const g = room(); const death = card('death');
  g.get('p1').hand = [death, card('number', 'biru', 9)];
  const mirror = card('mirror'); g.get('p2').hand = [mirror, card('number', 'hijau', 2)];
  g.play('p1', death.id, 'merah', 'p2');
  g.react('p2', mirror.id, 'biru');
  assert.equal(g.pending.target, 'p1');
  g.resolve();
  assert.equal(g.get('p1').alive, false);
  assert.equal(g.lastWinner, 'p2');
});

test('Bangkit otomatis menyelamatkan sekali dengan tujuh kartu', () => {
  const g = room(3); const death = card('death');
  g.get('p1').hand = [death, card('number', 'biru', 1)];
  g.get('p2').hand = [card('revive')];
  g.play('p1', death.id, 'kuning', 'p2');
  g.resolve();
  assert.equal(g.get('p2').alive, true);
  assert.equal(g.get('p2').hand.length, 7);
  assert.equal(g.get('p2').revived, true);
});

test('dek kustom hanya berisi power up yang dipilih host', () => {
  const g = new GameRoom('p1', true, ['death']); g.add('p1', 'A'); g.add('p2', 'B'); g.start('p1');
  const all = [...g.deck, ...g.discard, ...g.players.flatMap(p => p.hand)];
  assert.equal(all.filter(c => c.kind === 'death').length, 1);
  assert.equal(all.filter(c => c.kind === 'kiamat').length, 0);
  assert.equal(all.filter(c => c.kind === 'mirror').length, 0);
});

