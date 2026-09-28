const $ = id => document.getElementById(id);
const COLORS = { merah: '#ed5e62', biru: '#55a7f0', hijau: '#5dc99c', kuning: '#f5c75c' };
const LABEL = { skip: 'LEWAT', reverse: 'PUTAR BALIK', draw2: '+2', wild: 'GANTI WARNA', kiamat: '+100 KIAMAT', death: 'INSTANT DEATH', swap: 'TUKAR NASIB', mirror: 'CERMIN ABSOLUT', shield: 'PERISAI', revive: 'BANGKIT', curse: 'KUTUKAN +3' };
const SYMBOL = { skip: '⊘', reverse: '↻', draw2: '+2', wild: '✦', kiamat: '☄', death: '☠', swap: '⇄', mirror: '◇', shield: '⬡', revive: '✦', curse: '☣' };
const ART = { kiamat: '/assets/kiamat.png', death: '/assets/instant-death.png', swap: '/assets/tukar-nasib.png', mirror: '/assets/cermin.png', shield: '/assets/perisai.png', revive: '/assets/bangkit.png', curse: '/assets/kutukan.png' };
const TARGETED = new Set(['kiamat', 'death', 'swap', 'curse']);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
let ws, state, token = sessionStorage.getItem('kr-token'), myId, reconnectDelay = 800;
let choice = null, selectedColor = null, selectedTarget = null, soundOn = false, audioContext;
let hellMode = true;
let toastTimer;

function toast(message) {
  $('toast').textContent = message; $('toast').classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3500);
}
function beep(freq = 440) {
  if (!soundOn) return;
  try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); const o = audioContext.createOscillator(), g = audioContext.createGain(); o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(.06, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .13); o.connect(g); g.connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + .14); } catch {}
}
function send(data) { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); else toast('Server belum terhubung. Tunggu sebentar.'); }
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  ws.onopen = () => { $('conn-dot').classList.add('online'); $('conn-text').textContent = 'Server aktif'; reconnectDelay = 800; send({ type: 'hello', token }); };
  ws.onmessage = event => {
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    if (msg.type === 'hello') {
      token = msg.token; myId = msg.pid; sessionStorage.setItem('kr-token', token);
      const roomCode = new URLSearchParams(location.search).get('room');
      if (roomCode && localStorage.getItem('kr-name')) send({ type: 'join', code: roomCode, name: getName() });
    } else if (msg.type === 'state') { const old = state; state = msg.state; render(); if (old && (old.turn !== state.turn || old.pending?.kind !== state.pending?.kind || old.status !== state.status)) beep(state.pending ? 260 : state.status === 'ended' ? 740 : 520); }
    else if (msg.type === 'error') toast(msg.message);
  };
  ws.onclose = () => { $('conn-dot').classList.remove('online'); $('conn-text').textContent = 'Menyambung ulang…'; setTimeout(connect, reconnectDelay); reconnectDelay = Math.min(reconnectDelay * 1.5, 6000); };
  ws.onerror = () => ws.close();
}
function getName() { const value = $('player-name').value.trim() || localStorage.getItem('kr-name') || 'Pemain'; localStorage.setItem('kr-name', value); return value; }
function show(section) { for (const id of ['home', 'lobby', 'game', 'ended']) $(id).classList.toggle('hidden', id !== section); }
function displayName(pid) { return state?.players.find(p => p.id === pid)?.name || 'Pemain'; }
function cardName(c) { return c.kind === 'number' ? String(c.value) : LABEL[c.kind] || c.kind; }
function cardHTML(c, small = false, disabled = false) {
  const special = !c.color, art = ART[c.kind];
  return `<button class="card ${c.color || 'wild'} ${special ? 'hell' : ''} ${esc(c.kind)} kind-${esc(c.kind)} ${small ? 'small' : ''}" ${disabled ? 'disabled' : ''} data-card="${esc(c.id)}" title="${esc(cardName(c))}"><span class="card-face">${art ? `<span class="card-art" style="background-image:url('${art}')"></span>` : ''}<span class="card-corner">${esc(c.kind === 'number' ? c.value : SYMBOL[c.kind] || '✦')}</span>${!art ? `<span class="card-symbol">${esc(c.kind === 'number' ? c.value : SYMBOL[c.kind] || '✦')}</span>` : ''}<span class="card-label">${esc(cardName(c))}</span></span></button>`;
}
function render() {
  if (!state) return;
  const url = new URL(location.href); url.searchParams.set('room', state.code); history.replaceState(null, '', url);
  if (state.status === 'lobby') return renderLobby();
  if (state.status === 'ended') return renderEnd();
  renderGame();
}
function renderLobby() {
  show('lobby'); $('lobby-code').textContent = state.code; $('share-code').textContent = state.code;
  document.querySelector('.status-chip').innerHTML = state.hell ? 'MODE NERAKA <b>ON</b>' : 'MODE KLASIK';
  $('hell-rule').textContent = state.hell ? 'Serangan Neraka bisa mengeliminasi pemain.' : 'Kartu aksi bisa membalik dan melewatkan giliran.';
  $('enabled-powers').textContent = state.hell ? `Power up aktif: ${state.powers.map(x => LABEL[x]).join(', ') || 'tidak ada'}` : '';
  document.querySelector('.mini-card-preview').classList.toggle('hidden', !state.hell);
  $('player-count').textContent = `${state.players.length}/8`;
  $('lobby-players').innerHTML = state.players.map((p, i) => `<div class="lobby-person"><span class="avatar" style="background:hsl(${(i * 75 + 260) % 360} 36% 48%)">${esc(p.name.slice(0, 1).toUpperCase())}</span><div><b>${esc(p.name)}</b><small>${p.id === state.owner ? 'HOST' : p.online ? 'SIAP BIKIN RUSUH' : 'TERPUTUS'}</small></div></div>`).join('');
  $('start').classList.toggle('hidden', state.owner !== myId); $('start').disabled = state.players.length < 2;
}
function renderGame() {
  show('game'); $('round-no').textContent = state.round; $('room-badge').textContent = `ROOM ${state.code}`;
  document.querySelector('.game-head .eyebrow').firstChild.textContent = `${state.hell ? 'MODE NERAKA' : 'MODE KLASIK'} · RONDE `;
  const mine = state.turn === myId, defending = state.pending?.target === myId, me = state.players.find(p => p.id === myId);
  $('turn-label').textContent = state.pending ? `${displayName(state.pending.target)} sedang diserang!` : mine ? 'Giliran lu. Bikin rusuh!' : `Giliran ${displayName(state.turn)}`;
  $('players').innerHTML = state.players.map(p => `<div class="player-chip ${p.id === state.turn ? 'active' : ''} ${!p.alive ? 'dead' : ''} ${!p.online ? 'offline' : ''}"><span class="p-icon">${esc(p.name.slice(0,1).toUpperCase())}</span>${esc(p.name)} ${p.id === myId ? '(lu)' : ''}<b>${p.alive ? p.count : '☠'}</b></div>`).join('');
  $('discard-slot').innerHTML = state.top ? cardHTML(state.top, true, true) : '';
  $('color-ring').style.backgroundColor = COLORS[state.color] || '#b78ae4';
  $('color-ring').style.color = COLORS[state.color] || '#b78ae4';
  $('deck-count').textContent = state.deckCount ?? '∞';
  $('log').innerHTML = state.log.map(line => `<div>${esc(line)}</div>`).join('');
  $('attack-banner').classList.toggle('hidden', !state.pending);
  if (state.pending) $('attack-banner').textContent = `${displayName(state.pending.target)} terkena ${state.pending.kind === 'kiamat' ? `+${state.pending.amount} KIAMAT` : 'INSTANT DEATH'} — balas sekarang!`;
  $('draw').disabled = !mine || !!state.pending || !me?.alive;
  $('accept').classList.toggle('hidden', !defending);
  $('hint').textContent = defending ? 'Mainkan Cermin / Perisai, atau terima serangan.' : mine ? 'Klik kartu yang cocok, atau ambil 1 kartu.' : me?.alive ? 'Tunggu giliran lu.' : 'Lu tersingkir. Tonton sampai ronde berikutnya.';
  $('hand-count').textContent = `${state.hand.length} kartu`;
  $('hand-status').textContent = defending ? '⚠ LU DISERANG' : mine ? '✦ PILIH KARTU' : me?.alive ? 'MENUNGGU' : 'TERELIMINASI';
  $('hand').innerHTML = state.hand.map(c => cardHTML(c, false, !cardEnabled(c, mine, defending))).join('');
  $('hand').querySelectorAll('[data-card]').forEach(btn => btn.addEventListener('click', () => onCard(btn.dataset.card)));
  updateTimer();
}
function renderEnd() {
  show('ended'); $('winner-text').textContent = state.lastWinner === myId ? 'LU MENANG! 🏆' : `${displayName(state.lastWinner)} menang!`;
  $('end-subtitle').textContent = state.lastWinner === myId ? 'Nikmati sebentar. Mereka pasti mau balas dendam.' : 'Belum selesai. Saatnya rematch.';
  $('end-players').innerHTML = [...state.players].sort((a,b) => b.wins - a.wins).map(p => `<div><span>${esc(p.name)}</span><b>${p.wins} menang</b></div>`).join('');
  $('rematch').classList.toggle('hidden', state.owner !== myId);
  $('rematch-hint').textContent = state.owner === myId ? 'Host bisa langsung memulai ronde baru.' : 'Menunggu host memulai ronde baru…';
}
function cardEnabled(c, mine, defending) {
  if (defending) return ['mirror', 'shield'].includes(c.kind) || (state.pending.kind === 'kiamat' && c.kind === 'draw2' && c.color === state.color);
  if (!mine || state.pending) return false;
  return playable(c);
}
function playable(c) {
  if (!c.color) return true;
  return c.color === state.color || c.kind === state.top?.kind || (c.kind === 'number' && state.top?.kind === 'number' && c.value === state.top.value);
}
function onCard(cardId) {
  const c = state.hand.find(x => x.id === cardId); if (!c) return;
  const reacting = state.pending?.target === myId;
  if (reacting && c.kind === 'draw2') { send({ type: 'react', cardId }); return; }
  if (!reacting && !TARGETED.has(c.kind) && c.color) { send({ type: 'play', cardId }); return; }
  choice = { card: c, reacting }; selectedColor = c.color || null; selectedTarget = null;
  $('choice-title').textContent = cardName(c);
  $('choice-desc').textContent = reacting ? 'Pilih warna baru sebelum membalas.' : TARGETED.has(c.kind) ? 'Pilih siapa yang akan terkena.' : 'Pilih warna berikutnya.';
  $('target-picker').classList.toggle('hidden', reacting || !TARGETED.has(c.kind));
  $('color-picker').classList.toggle('hidden', !!c.color);
  $('target-picker').innerHTML = state.players.filter(p => p.id !== myId && p.alive).map(p => `<button data-target="${esc(p.id)}">${esc(p.name)} · ${p.count} kartu</button>`).join('');
  $('target-picker').querySelectorAll('button').forEach(btn => btn.onclick = () => { selectedTarget = btn.dataset.target; paintChoices(); });
  $('color-picker').innerHTML = Object.entries(COLORS).map(([key, value]) => `<button data-color="${key}" style="background:${value}" title="${key}" aria-label="${key}"></button>`).join('');
  $('color-picker').querySelectorAll('button').forEach(btn => btn.onclick = () => { selectedColor = btn.dataset.color; paintChoices(); });
  paintChoices(); $('choice').classList.remove('hidden');
}
function paintChoices() {
  $('target-picker').querySelectorAll('button').forEach(btn => btn.classList.toggle('selected', btn.dataset.target === selectedTarget));
  $('color-picker').querySelectorAll('button').forEach(btn => btn.classList.toggle('selected', btn.dataset.color === selectedColor));
  $('choice-confirm').disabled = !selectedColor || (!choice?.reacting && TARGETED.has(choice?.card.kind) && !selectedTarget);
}
function updateTimer() {
  if (!state?.deadline || state.status !== 'playing') return;
  const sec = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)); $('timer').textContent = sec; $('timer').classList.toggle('urgent', sec <= 5);
}
$('mode-hell').onclick = () => setMode(true);
$('mode-classic').onclick = () => setMode(false);
function setMode(hell) {
  hellMode = hell; $('mode-hell').classList.toggle('selected', hell); $('mode-classic').classList.toggle('selected', !hell);
  $('deck-settings').classList.toggle('hidden', !hell); $('create').firstChild.textContent = hell ? 'Buat Room Neraka ' : 'Buat Room Klasik ';
  document.querySelector('.mode-banner').classList.toggle('hidden', !hell);
}
$('create').onclick = () => send({ type: 'create', name: getName(), hell: hellMode, powers: [...document.querySelectorAll('.power-grid input:checked')].map(x => x.value) });
$('join').onclick = () => send({ type: 'join', code: $('room-code').value.trim(), name: getName() });
$('room-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('join').click(); });
$('copy-link').onclick = async () => { try { await navigator.clipboard.writeText(location.href); toast('Link room disalin!'); } catch { toast(`Bagikan kode room: ${state.code}`); } };
$('start').onclick = $('rematch').onclick = () => send({ type: 'start' });
$('draw').onclick = () => send({ type: 'draw' });
$('accept').onclick = () => send({ type: 'accept' });
$('choice-close').onclick = () => $('choice').classList.add('hidden');
document.querySelector('.modal-backdrop').onclick = () => $('choice').classList.add('hidden');
$('choice-confirm').onclick = () => { if (!choice) return; send({ type: choice.reacting ? 'react' : 'play', cardId: choice.card.id, color: selectedColor, target: selectedTarget }); $('choice').classList.add('hidden'); };
$('sound').onclick = () => { soundOn = !soundOn; $('sound').style.color = soundOn ? '#ffcc65' : ''; toast(soundOn ? 'Suara aktif' : 'Suara mati'); beep(); };
$('player-name').value = localStorage.getItem('kr-name') || '';
const invite = new URLSearchParams(location.search).get('room'); if (invite) $('room-code').value = invite;
setInterval(updateTimer, 150);
connect();

