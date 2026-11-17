(() => {
'use strict';
const E = window.PokerEngine;
const $ = id => document.getElementById(id);
const stage = $('stage'), world = $('world'), labels = $('labels'), handLayer = $('hand');
const fmt = n => Math.round(n).toLocaleString('de-DE');
const SB = 10, BB = 20, START = 1500;
const ABORT = { abort: true };
const raf = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

/* ---------- Einstellungen ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('salon.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('salon.' + k, JSON.stringify(v)); } catch (e) {} }
};
const S = { learn: store.get('learn', true), sound: store.get('sound', true), music: store.get('music', true), amb: store.get('amb', true), speed: store.get('speed', 1) };

/* ---------- Bühne skalieren ---------- */
let forceLandscape = false;
function fit() {
  const w = innerWidth, h = innerHeight;
  $('rot').classList.toggle('on', h > w && w < 760 && !forceLandscape);
  const s = Math.min(w / 844, h / 390);
  stage.style.transform = `translate(-50%,-50%) scale(${s})`;
}
addEventListener('resize', fit); fit();
$('rotAnyway').onclick = () => { forceLandscape = true; fit(); };

/* ---------- 3D-Projektion (gleich wie die Weltkamera) ---------- */
const PERS = 900, TH = 55 * Math.PI / 180, CX = 422, CY = 320, HF = 128;
function proj(u, v, z) {
  const y = v * Math.cos(TH) - z * Math.sin(TH), zz = v * Math.sin(TH) + z * Math.cos(TH), s = PERS / (PERS - zz);
  return { x: CX + u * s, y: CY + y * s, s };
}

/* ---------- Raum und Tisch bauen ---------- */
const F = (u, v, w, h, z, cls, style, inner) => `<div class="${cls || ''}" style="left:${u - w / 2}px;top:${v - h / 2}px;width:${w}px;height:${h}px;transform:translateZ(${z}px);${style || ''}">${inner || ''}</div>`;
const ST = (u, v, w, h, cls, style, inner) => `<div class="${cls || ''}" style="left:${u - w / 2}px;top:${v - h}px;width:${w}px;height:${h}px;transform-origin:50% 100%;transform:rotateX(-90deg);${style || ''}">${inner || ''}</div>`;
function buildWorld() {
  let W = '';
  W += F(0, 230, 3200, 1700, 0, 'carpet');
  W += F(0, 30, 820, 500, 0.5, '', 'border-radius:50%;background:radial-gradient(ellipse 50% 50% at 50% 50%,rgba(0,0,0,.92) 0%,rgba(0,0,0,.75) 45%,rgba(0,0,0,0) 100%)');
  const wallIn =
    '<div style="left:0;right:0;bottom:0;height:26px;background:linear-gradient(180deg,#3a2010,#120803);border-top:1px solid rgba(228,196,60,.3)"></div>' +
    '<div class="velvet" style="left:1095px;top:0;width:150px;height:400px;clip-path:polygon(0 0,100% 0,80% 62%,100% 100%,0 100%,20% 62%)"></div>' +
    '<div class="velvet" style="left:1955px;top:0;width:150px;height:400px;clip-path:polygon(0 0,100% 0,80% 62%,100% 100%,0 100%,20% 62%)"></div>' +
    '<div style="left:1300px;top:170px;width:160px;height:200px;background:radial-gradient(ellipse 50% 50% at 50% 40%,rgba(255,190,110,.35) 0%,rgba(255,190,110,0) 70%)"></div>' +
    '<div style="left:1740px;top:170px;width:160px;height:200px;background:radial-gradient(ellipse 50% 50% at 50% 40%,rgba(255,190,110,.35) 0%,rgba(255,190,110,0) 70%)"></div>' +
    '<div style="left:1370px;top:240px;width:20px;height:30px;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,#efdb98,#9c7c2c);box-shadow:0 0 18px rgba(255,200,120,.7)"></div>' +
    '<div style="left:1810px;top:240px;width:20px;height:30px;border-radius:10px 10px 4px 4px;background:linear-gradient(180deg,#efdb98,#9c7c2c);box-shadow:0 0 18px rgba(255,200,120,.7)"></div>';
  W += `<div class="wall" style="left:-1600px;top:-1020px;width:3200px;height:400px;transform-origin:50% 100%;transform:rotateX(-90deg)">${wallIn}</div>`;
  const chair = (u, v, letter) => ST(u, v, 100, 175, 'chair chair-' + letter, '',
    `<div class="leather" style="left:0;top:0;width:100px;height:104px;border-radius:34px 34px 10px 10px;box-shadow:inset 0 3px 0 rgba(255,200,170,.18),inset 0 -10px 16px rgba(0,0,0,.5);display:flex;justify-content:center;padding-top:16px;box-sizing:border-box"><span style="font-family:'Bodoni Moda',serif;font-size:26px;color:rgba(228,196,60,.85)">${letter}</span></div>` +
    '<div style="left:10px;top:100px;width:10px;height:75px;background:linear-gradient(90deg,#120803,#3a2010,#120803)"></div><div style="right:10px;top:100px;width:10px;height:75px;background:linear-gradient(90deg,#120803,#3a2010,#120803)"></div>');
  W += chair(-160, -250, 'B') + chair(160, -250, 'M');
  for (const u of [-240, 240]) for (const v of [-70, 70])
    W += ST(u, v, 30, 98, '', 'background:linear-gradient(180deg,rgba(0,0,0,0) 0%,rgba(0,0,0,0) 90%,#b8962e 90%,#6e561c 100%),linear-gradient(90deg,#120803 0%,#4a2a14 45%,#241307 70%,#0c0502 100%);clip-path:polygon(8% 0,92% 0,72% 100%,28% 100%)');
  for (let i = 0; i < 9; i++) W += F(0, 0, 636, 346, 96 + 3 * i, 'skirt', 'border-radius:50%');
  // gepolsterter Rand aus Ringen
  const R = 8, A = 314, B = 166, N = 16, step = 320 / (N - 1);
  const dark = [18, 8, 3], mid = [54, 30, 13], light = [138, 88, 46];
  const mix = (a, b, t) => { t = Math.max(0, Math.min(1, t)); return '#' + a.map((x, k) => Math.round(x + (b[k] - x) * t).toString(16).padStart(2, '0')).join(''); };
  for (let i = 0; i < N; i++) {
    const p = (-70 + i * step) * Math.PI / 180, off = R * Math.cos(p), z = 134 + R * Math.sin(p), sn = Math.sin(p);
    let t = Math.max(0, sn); if (Math.cos(p) < 0) t *= 0.75;
    const col = t < 0.55 ? mix(dark, mid, 0.35 + sn * 0.65) : mix(mid, light, (t - 0.55) / 0.45);
    const w = Math.max(2, R * step * Math.PI / 180 * 1.5);
    W += F(0, 0, +(2 * (A + off + w / 2)).toFixed(1), +(2 * (B + off + w / 2)).toFixed(1), +z.toFixed(2), '', `border-radius:50%;box-sizing:border-box;border:${w.toFixed(1)}px solid ${col}`);
  }
  W += F(0, 0, 2 * A, 2 * B, 142.4, '', 'border-radius:50%;box-sizing:border-box;border:1px dashed rgba(249,236,229,.22)');
  W += F(0, 0, 624, 328, HF, '', 'border-radius:50%;background:radial-gradient(ellipse 50% 50% at 50% 50%,#0d8236 0%,#086928 40%,#054219 72%,#021f0b 92%,#010f05 100%)');
  W += F(0, 0, 616, 320, HF + 0.3, '', 'border-radius:50%;box-sizing:border-box;border:1.5px solid rgba(228,196,60,.55)');
  W += F(0, 0, 500, 226, HF + 0.6, '', 'border-radius:50%;box-sizing:border-box;border:1.5px solid rgba(228,196,60,.16)');
  W += F(0, 92, 320, 40, HF + 0.9, '', 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px',
    '<span style="position:static;font-family:\'Bodoni Moda\',serif;font-size:24px;letter-spacing:.55em;padding-left:.55em;color:rgba(228,196,60,.24)">SALON</span><span style="position:static;font-size:9px;letter-spacing:.4em;text-transform:uppercase;color:rgba(228,196,60,.22)">Blinds 10 / 20</span>');
  ['', '', '', 'Turn', 'River'].forEach((t, i) => { W += F(SLOT_U[i], 0, 74, 104, HF + 1, 'slot', '', t); });
  world.innerHTML = W;
}
const SLOT_U = [-168, -84, 0, 84, 168];

/* ---------- Sitzplätze ---------- */
const SEATS = [
  { key: 'you', you: true, dealer: [-140, 108], betPos: [-62, 94], from: [0, 170], bub: { x: 416, y: 258, al: 'c' } },
  { key: 'vivienne', dealer: [-262, 72], betPos: [-236, 36], from: [-330, -40], cards: [[-270, -50, -18], [-250, -44, -6]], pill: [26, 124], bub: { x: 65, y: 166, al: 'c' } },
  { key: 'baron', dealer: [-205, -100], betPos: [-112, -84], from: [-160, -190], cards: [[-172, -124, -12], [-148, -124, 8]], pill: [242, 100], bub: { x: 236, y: 72, al: 'r' } },
  { key: 'maxim', dealer: [205, -100], betPos: [112, -84], from: [160, -190], cards: [[148, -124, -8], [172, -124, 12]], pill: [528, 100], bub: { x: 612, y: 72, al: 'l' } },
  { key: 'ottilie', dealer: [262, 72], betPos: [236, 36], from: [330, -40], cards: [[250, -44, 6], [270, -50, 18]], pill: [744, 124], bub: { x: 783, y: 166, al: 'c' } }
];
const POT = [0, -108];
const P = SEATS.map((s, i) => ({ i, ...s, persona: s.you ? null : E.PERSONAS[s.key], name: s.you ? 'Du' : E.PERSONAS[s.key].name, stack: START, hole: [], bet: 0, contrib: 0, folded: false, allIn: false, acted: false, shown: 0 }));
const G = { gid: 0, dealer: Math.floor(Math.random() * 5), board: [], deck: [], pot: 0, currentBet: 0, minRaise: BB, street: '', handNo: 0, lastAggr: null, turn: null, userResolve: null, userReject: null, running: false };
let paused = false;

/* ---------- Karten ---------- */
const SYM = ['♠︎', '♥︎', '♦︎', '♣︎'];
const isRed = c => { const s = E.suitOf(c); return s === 1 || s === 2; };
function faceHTML(c) { const s = SYM[E.suitOf(c)]; return `<div class="ix"><b>${E.RANK_LABEL[E.rankOf(c)]}</b><i>${s}</i></div><div class="pp">${s}</div>`; }
function makeCard(c, size, down) {
  const el = document.createElement('div');
  el.className = `card ${size}${down ? ' down' : ''}${c != null && isRed(c) ? ' red' : ''}`;
  el.innerHTML = `<div class="face paper">${c != null ? faceHTML(c) : ''}</div><div class="bk back"></div>`;
  return el;
}
async function flipEl(el, up) {
  const base = el.style.transform || '';
  let a1, a2;
  try { a1 = el.animate([{ transform: base + ' scaleX(1)' }, { transform: base + ' scaleX(0)' }], { duration: 120, easing: 'ease-in', fill: 'forwards' }); await a1.finished; } catch (e) {}
  el.classList.toggle('down', !up);
  try { a2 = el.animate([{ transform: base + ' scaleX(0)' }, { transform: base + ' scaleX(1)' }], { duration: 170, easing: 'cubic-bezier(.33,1,.68,1)', fill: 'forwards' }); await a2.finished; } catch (e) {}
  try { a1 && a1.cancel(); a2 && a2.cancel(); } catch (e) {}
}
// Weltobjekt (Karte/Stapel) mit Position im 3D-Raum
function worldMover(inner, w, h) {
  const m = document.createElement('div');
  m.className = 'mover';
  m.style.left = '0px'; m.style.top = '0px'; m.style.width = '0px'; m.style.height = '0px';
  if (inner) { inner.style.left = (-w / 2) + 'px'; inner.style.top = (-h / 2) + 'px'; m.appendChild(inner); }
  world.appendChild(m);
  return m;
}
const place = (m, u, v, z, r) => { m.style.transform = `translate3d(${u}px,${v}px,${z}px) rotateZ(${r || 0}deg)`; };

/* ---------- Chips ---------- */
// Chips im Stil der Aktions-Knöpfe: gestreifter Rand, bedruckte Mitte
const DENOMS = [
  { v: 1000, base: '#E4C43C', stripe: '#361E0D', face: '#e9cd55', ink: '#2e1c06', ring: '#8a6d1f', label: '1K' },
  { v: 500, base: '#361E0D', stripe: '#E4C43C', face: '#3d2210', ink: '#E4C43C', ring: '#E4C43C', label: '500' },
  { v: 100, base: '#054a1c', stripe: '#F9ECE5', face: '#065422', ink: '#F9ECE5', ring: 'rgba(228,196,60,.7)', label: '100' },
  { v: 25, base: '#68150A', stripe: '#F9ECE5', face: '#701a0d', ink: '#F9ECE5', ring: 'rgba(228,196,60,.7)', label: '25' },
  { v: 10, base: '#1f2a44', stripe: '#F9ECE5', face: '#24314f', ink: '#F9ECE5', ring: 'rgba(228,196,60,.6)', label: '10' },
  { v: 5, base: '#F9ECE5', stripe: '#361E0D', face: '#fbf2ec', ink: '#361E0D', ring: 'rgba(54,30,13,.45)', label: '5' }
];
const shade = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = c => Math.min(255, Math.round(c * k)).toString(16).padStart(2, '0'); return '#' + f(n >> 16) + f((n >> 8) & 255) + f(n & 255); };
const COLS = [[0, 0], [31, 5], [-30, 6], [12, -24], [-16, -23]];
function stackHTML(amount) {
  let rest = amount; const cols = [];
  for (const d of DENOMS) { const n = Math.floor(rest / d.v); if (n) { cols.push([d, n]); rest -= n * d.v; } }
  if (rest > 0) cols.push([DENOMS[5], 1]);
  let h = '';
  cols.slice(0, COLS.length).forEach(([d, n], ci) => {
    const cnt = Math.min(n, 7), [cx, cy] = COLS[ci];
    const disc = (z, b, st, extra, inner) => `<div style="left:${cx - 16}px;top:${cy - 16}px;width:32px;height:32px;border-radius:50%;background:repeating-conic-gradient(${st} 0deg 15deg, ${b} 15deg 60deg);box-shadow:0 0 0 .7px rgba(0,0,0,.55)${extra || ''};transform:translateZ(${z.toFixed(1)}px)">${inner || ''}</div>`;
    for (let i = 0; i < cnt; i++) {
      const z0 = 0.4 + i * 3.4, top = i === cnt - 1;
      // Rand: drei dünne Schichten, unten dunkler
      h += disc(z0, shade(d.base, 0.5), shade(d.stripe, 0.55));
      h += disc(z0 + 1.1, shade(d.base, 0.66), shade(d.stripe, 0.7));
      h += disc(z0 + 2.2, shade(d.base, 0.82), shade(d.stripe, 0.86));
      if (top) {
        const face = `<div style="left:5.5px;top:5.5px;width:21px;height:21px;border-radius:50%;box-sizing:border-box;border:1px solid ${d.ring};background:radial-gradient(circle at 38% 32%, ${shade(d.face, 1.18)} 0%, ${d.face} 55%, ${shade(d.face, 0.85)} 100%);display:flex;align-items:center;justify-content:center"><span style="font-family:'Bodoni Moda',serif;font-weight:600;font-size:${d.label.length > 2 ? 7.5 : 9.5}px;line-height:1;color:${d.ink};letter-spacing:-.02em">${d.label}</span></div>` +
          '<div style="left:0;top:0;width:32px;height:32px;border-radius:50%;background:radial-gradient(ellipse 60% 45% at 35% 25%, rgba(255,245,225,.22), rgba(255,245,225,0) 70%);pointer-events:none"></div>';
        h += disc(z0 + 3.0, d.base, d.stripe, ',inset 0 0 0 1px rgba(255,240,210,.14)', face);
      }
    }
  });
  return h;
}
function makeStack(amount) { const m = worldMover(null); m.innerHTML = stackHTML(amount); return m; }

/* ---------- Klang ---------- */
const Snd = (() => {
  let ctx = null, master = null, sfx = null, noise = null; const buf = {};
  const FILES = { shuffle: 'sfx/shuffle.mp3', deal: 'sfx/deal.mp3', deal2: 'sfx/deal2.mp3', chips2: 'sfx/chips2.mp3', flip: 'sfx/flip.mp3', chips: 'sfx/chips.mp3', chipsBig: 'sfx/chips-big.mp3', collect: 'sfx/collect.mp3', win: 'sfx/win.mp3', coach: 'sfx/coach.mp3', check: 'sfx/check.mp3', whoosh: 'sfx/whoosh.mp3', whoosh2: 'sfx/whoosh2.mp3', whoosh3: 'sfx/whoosh3.mp3', whoosh4: 'sfx/whoosh4.mp3', whoosh5: 'sfx/whoosh5.mp3', ambience: 'sfx/ambience.mp3' };
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    sfx = ctx.createGain(); sfx.gain.value = 0.26; sfx.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    for (const [k, u] of Object.entries(FILES))
      fetch(u).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(a => ctx.decodeAudioData(a)).then(b => { buf[k] = b; }).catch(() => {});
  }
  function nz(t, dur, f, q, vol, type) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const fl = ctx.createBiquadFilter(); fl.type = type || 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  function tone(t, f, dur, vol, type, f2) {
    const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  const SYN = {
    deal(t) { nz(t, 0.09, 2600, 0.7, 0.22); nz(t + 0.01, 0.05, 6000, 1, 0.05, 'highpass'); },
    flip(t) { nz(t, 0.035, 3200, 1, 0.16); nz(t + 0.05, 0.05, 2200, 1, 0.14); },
    chips(t) { const n = 3 + Math.floor(Math.random() * 2); for (let i = 0; i < n; i++) { const tt = t + i * (0.035 + Math.random() * 0.03); tone(tt, 2400 + Math.random() * 1400, 0.05, 0.05, 'triangle'); nz(tt, 0.025, 5500, 1.5, 0.07); } },
    chipsBig(t) { for (let i = 0; i < 7; i++) { const tt = t + i * (0.028 + Math.random() * 0.03); tone(tt, 2200 + Math.random() * 1800, 0.05, 0.045, 'triangle'); nz(tt, 0.03, 5000, 1.2, 0.07); } },
    collect(t) { for (let i = 0; i < 9; i++) { const tt = t + i * 0.03; nz(tt, 0.04, 4200, 1.2, 0.05); tone(tt, 2600 + Math.random() * 1200, 0.04, 0.03, 'triangle'); } nz(t, 0.35, 1800, 0.6, 0.05); },
    check(t) { [0, 0.11].forEach(dd => { tone(t + dd, 150, 0.09, 0.3, 'sine', 70); nz(t + dd, 0.04, 900, 1, 0.1, 'lowpass'); }); },
    fold(t) { nz(t, 0.18, 1800, 0.6, 0.1); },
    coach(t) { tone(t, 2349, 0.9, 0.05); tone(t, 4698, 0.5, 0.015); },
    turn(t) { tone(t, 1568, 0.5, 0.03); tone(t + 0.07, 2093, 0.6, 0.025); },
    shuffle(t) { for (let i = 0; i < 16; i++) nz(t + i * 0.045, 0.05, 2200 + Math.random() * 1500, 0.8, 0.08); },
    win(t) { [784, 987.8, 1174.7, 1568].forEach((f, i) => { tone(t + i * 0.09, f, 1.6, 0.06); tone(t + i * 0.09, f * 2.76, 0.6, 0.01); }); SYN.chipsBig(t + 0.15); },
    tap(t) { tone(t, 900, 0.04, 0.035, 'sine', 600); },
    whoosh(t) { sweep(t, 0.42, 380, 2200, 0.05); },
    whoosh2(t) { sweep(t, 0.6, 1400, 300, 0.04); }
  };
  function sweep(t, dur, f1, f2, vol) {
    const s = ctx.createBufferSource(); s.buffer = noise;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.4;
    fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.55); fl.frequency.exponentialRampToValueAtTime(f1 * 0.8, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.05);
  }
  // Raumklang: Datei (Schleife) oder leiser synthetischer Salon
  let ambNode = null, ambGain = null, ambTimer = null;
  let ambTries = 0;
  function ambStart() {
    if (!ctx || ambNode || !S.amb) return;
    if (!buf.ambience && ambTries++ < 12) { setTimeout(ambStart, 700); return; }
    ambGain = ctx.createGain(); ambGain.gain.value = 0.0001; ambGain.connect(master);
    if (buf.ambience) { ambNode = ctx.createBufferSource(); ambNode.buffer = buf.ambience; ambNode.loop = true; ambNode.connect(ambGain); ambNode.start(); ambGain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 4); return; }
    // Raumrauschen
    const len = ctx.sampleRate * 4, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    ambNode = ctx.createBufferSource(); ambNode.buffer = b; ambNode.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    ambNode.connect(lp); lp.connect(ambGain); ambNode.start();
    ambGain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 3);
    const ev = () => {
      if (!ambNode) return;
      const t = ctx.currentTime + 0.05, r = Math.random();
      if (S.sound) {
        if (r < 0.45) { for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) { const tt = t + i * (0.04 + Math.random() * 0.05); tone(tt, 1900 + Math.random() * 900, 0.05, 0.008, 'triangle'); } }
        else if (r < 0.7) { tone(t, 3520 + Math.random() * 400, 1.2, 0.006); tone(t + 0.003, 5270, 0.8, 0.003); }
        else nz(t, 0.9, 300 + Math.random() * 300, 0.5, 0.01);
      }
      ambTimer = setTimeout(ev, 3500 + Math.random() * 6000);
    };
    ambTimer = setTimeout(ev, 2500);
  }
  function ambStop() { if (!ambNode) return; clearTimeout(ambTimer); const n = ambNode, g = ambGain; ambNode = null; try { g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.2); setTimeout(() => { try { n.stop(); } catch (e) {} }, 1400); } catch (e) {} }
  // Mischung: Lautstärke und natürliche Variation je Klang
  const MIX = { deal: [0.5, 0.06], deal2: [0.5, 0.06], flip: [0.55, 0.05], chips: [0.3, 0.05], chips2: [0.24, 0.05], chipsBig: [0.3, 0.04], collect: [0.28, 0.04], shuffle: [0.16, 0.03], check: [0.55, 0.05], win: [0.55, 0], coach: [0.32, 0.02], whoosh: [0.13, 0.12], whoosh2: [0.08, 0.14], fold: [0.35, 0.06], tap: [0.4, 0], turn: [0.3, 0] };
  const VARIANTS = { deal: ['deal', 'deal2'], chips: ['chips', 'chips2'], fold: ['deal2'], whoosh: ['whoosh', 'whoosh3', 'whoosh4', 'whoosh5', 'whoosh2'], whoosh2: ['whoosh2', 'whoosh4', 'whoosh5'] };
  const lastPick = {};
  function playBuf(key, vol, spread, delay) {
    const s = ctx.createBufferSource(); s.buffer = buf[key];
    s.playbackRate.value = 1 + (Math.random() * 2 - 1) * spread;
    const g = ctx.createGain(); g.gain.value = vol * (0.9 + Math.random() * 0.2);
    s.connect(g); g.connect(sfx); s.start(ctx.currentTime + 0.01 + (delay || 0));
  }
  function play(name) {
    if (!S.sound || !ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    const opts = VARIANTS[name] ? VARIANTS[name].filter(k => buf[k]) : (buf[name] ? [name] : []);
    const [vol, spread] = MIX[name] || [0.6, 0.04];
    if (opts.length) {
      // nie zweimal hintereinander dieselbe Variante
      let key = opts[Math.floor(Math.random() * opts.length)];
      if (opts.length > 1) while (key === lastPick[name]) key = opts[Math.floor(Math.random() * opts.length)];
      lastPick[name] = key;
      playBuf(key, vol, spread);
      if (name === 'win' && buf.collect) playBuf('collect', 0.2, 0.03, 0.12);
    } else if (SYN[name]) SYN[name](ctx.currentTime + 0.01);
  }
  return { init, play, ambStart, ambStop, ready: () => !!ctx };
})();
const snd = n => Snd.play(n);

const Music = (() => {
  const TRACKS = ['music/track1.mp3', 'music/track2.mp3', 'music/track3.mp3'];
  let avail = [], el = null, idx = 0, fadeT = null;
  async function probe() {
    for (const t of TRACKS) { try { const r = await fetch(t, { method: 'HEAD' }); if (r.ok && !/text\/html/.test(r.headers.get('content-type') || '')) avail.push(t); } catch (e) {} }
    const tog = $('tMusic');
    if (!avail.length) { tog.disabled = true; tog.setAttribute('aria-checked', 'false'); $('musicNote').textContent = 'Jazz der 1920er und 30er – die Musikdateien folgen.'; }
    else tog.setAttribute('aria-checked', String(S.music));
  }
  function fade(to, done) {
    clearInterval(fadeT);
    fadeT = setInterval(() => {
      if (!el) return clearInterval(fadeT);
      const v = el.volume + (to > el.volume ? 0.01 : -0.01);
      if (Math.abs(to - el.volume) <= 0.011) { el.volume = to; clearInterval(fadeT); if (done) done(); } else el.volume = Math.max(0, Math.min(1, v));
    }, 60);
  }
  function start() {
    if (!avail.length || !S.music) return;
    if (!el) {
      el = new Audio(); el.volume = 0; el.preload = 'auto';
      el.addEventListener('ended', () => { idx = (idx + 1) % avail.length; el.src = avail[idx]; el.play().catch(() => {}); });
      el.src = avail[idx];
    }
    el.play().then(() => fade(0.16)).catch(() => {});
  }
  function stop() { if (el) fade(0, () => el.pause()); }
  return { probe, start, stop };
})();

/* ---------- Ablaufsteuerung ---------- */
async function sleep(ms) {
  const gid = G.gid;
  await new Promise(r => setTimeout(r, ms));
  while (paused) await new Promise(r => setTimeout(r, 120));
  if (gid !== G.gid) throw ABORT;
}
const nonFolded = () => P.filter(p => !p.folded);
const actorsCount = () => P.filter(p => !p.folded && !p.allIn).length;
const potTotal = () => G.pot + P.reduce((s, p) => s + p.bet, 0);

/* ---------- Labels (projiziert) ---------- */
const UI = { pills: [], bubs: [], betl: [], potl: null };
function buildLabels() {
  labels.innerHTML = '';
  P.forEach(p => {
    if (p.pill) {
      const el = document.createElement('div');
      el.className = 'pill abs'; el.style.left = p.pill[0] + 'px'; el.style.top = p.pill[1] + 'px';
      el.innerHTML = `<span class="n">${p.name}</span><span class="c">${fmt(p.stack)}</span><span class="dots"><i></i><i></i><i></i></span>`;
      labels.appendChild(el); UI.pills[p.i] = el;
    }
    const wrap = document.createElement('div');
    wrap.className = 'abs'; wrap.style.left = p.bub.x + 'px'; wrap.style.top = p.bub.y + 'px';
    wrap.style.transform = p.bub.al === 'c' ? 'translateX(-50%)' : p.bub.al === 'r' ? 'translateX(-100%)' : 'none';
    wrap.innerHTML = '<div class="bub"></div>';
    labels.appendChild(wrap); UI.bubs[p.i] = wrap.firstChild;
    const bl = document.createElement('div'); bl.className = 'betl abs'; bl.style.opacity = 0;
    const pt = proj(p.betPos[0] + 26, p.betPos[1], HF + 14); bl.style.left = pt.x + 'px'; bl.style.top = pt.y + 'px';
    labels.appendChild(bl); UI.betl[p.i] = bl;
  });
  const pl = document.createElement('div'); pl.id = 'potl'; pl.className = 'abs';
  const pt = proj(POT[0], POT[1], HF + 34); pl.style.left = pt.x + 'px'; pl.style.top = pt.y + 'px';
  pl.innerHTML = '<span>Pot</span><b id="potV">0</b>'; pl.style.opacity = 0;
  labels.appendChild(pl); UI.potl = pl;
}
function bubble(p, text, kind) {
  const b = UI.bubs[p.i]; b.textContent = text; b.className = 'bub on' + (kind ? ' ' + kind : '');
}
function clearBubbles(keepFold) { P.forEach(p => { if (keepFold && p.folded) return; UI.bubs[p.i].classList.remove('on'); }); }
const shownStack = P.map(p => p.stack);
function countTo(el, i, to) {
  const from = shownStack[i]; shownStack[i] = to;
  if (from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), d = 700;
  const step = now => { const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function renderPills() {
  P.forEach(p => {
    if (p.you) countTo($('myStack'), 0, p.stack);
    else { const el = UI.pills[p.i]; countTo(el.querySelector('.c'), p.i, p.stack); el.classList.toggle('out', p.folded); }
  });
}
function setTurn(p) {
  G.turn = p;
  P.forEach(q => { if (UI.pills[q.i]) UI.pills[q.i].classList.toggle('turn', q === p); });
}

/* ---------- Einsätze & Pot ---------- */
const betStacks = [];
let potStack = null;
async function renderBets() {
  for (const p of P) {
    const lbl = UI.betl[p.i];
    if (p.bet > 0) {
      if (!betStacks[p.i]) {
        const m = makeStack(p.bet); betStacks[p.i] = m; m._amt = p.bet;
        place(m, p.from[0], p.from[1], HF + 0.5); m.style.opacity = 0;
        await raf(); place(m, p.betPos[0], p.betPos[1], HF + 0.5); m.style.opacity = 1;
      } else if (betStacks[p.i]._amt !== p.bet) {
        const main = betStacks[p.i], delta = p.bet - main._amt; main._amt = p.bet;
        if (delta > 0) {
          const fly = makeStack(delta); place(fly, p.from[0], p.from[1], HF + 0.5); fly.style.opacity = 0;
          await raf(); place(fly, p.betPos[0] + 4, p.betPos[1] - 2, HF + 6); fly.style.opacity = 1;
          setTimeout(() => { main.innerHTML = stackHTML(p.bet); fly.remove(); }, 560);
        } else main.innerHTML = stackHTML(p.bet);
      }
      lbl.textContent = fmt(p.bet); lbl.style.opacity = 1;
    } else lbl.style.opacity = 0;
  }
  renderPotLabel();
}
function renderPotLabel() { const t = potTotal(); $('potV').textContent = fmt(t); UI.potl.style.opacity = t > 0 ? 1 : 0; }
function renderPot() {
  if (potStack) { potStack.remove(); potStack = null; }
  if (G.pot > 0) { potStack = makeStack(G.pot); place(potStack, POT[0], POT[1], HF + 0.5); }
  renderPotLabel();
}
async function collectBets() {
  let any = false;
  P.forEach(p => {
    const m = betStacks[p.i];
    if (m) { any = true; place(m, POT[0], POT[1], HF + 0.5); setTimeout(() => m.remove(), 560); betStacks[p.i] = null; UI.betl[p.i].style.opacity = 0; }
    G.pot += p.bet; p.bet = 0;
  });
  if (any) { snd('collect'); await sleep(580); }
  renderPot(); clearBubbles(true);
}

/* ---------- Dealer-Knopf ---------- */
let dealerBtn = null;
function moveDealer(initial) {
  if (!dealerBtn) {
    const d = document.createElement('div');
    d.className = 'paper'; d.style.cssText = 'width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:\'Bodoni Moda\',serif;font-size:13px;font-weight:600;color:#361E0D;box-shadow:0 0 0 1px #b9a99a,0 2px 3px rgba(0,0,0,.6)';
    d.innerHTML = '<span style="position:static">D</span>';
    dealerBtn = worldMover(d, 26, 26);
  }
  const s = P[G.dealer].dealer; place(dealerBtn, s[0], s[1], HF + 2);
  if (initial) dealerBtn.style.transition = 'none';
  else dealerBtn.style.transition = '';
}

/* ---------- Karten austeilen ---------- */
const dealtEls = { opp: [[], [], [], [], []], board: [], hand: [] };
const HAND_POS = [[340, 288, -8], [412, 284, 7]];
async function dealHole(p, k) {
  const d = P[G.dealer].dealer;
  if (p.you) {
    const el = makeCard(p.hole[k], 'hcard', true); el.classList.add('abs');
    const [x, y, r] = HAND_POS[k]; el.style.left = x + 'px'; el.style.top = y + 'px';
    const src = proj(d[0], d[1], HF);
    el.style.transform = `translate(${src.x - x - 40}px,${src.y - y - 56}px) rotate(0deg) scale(.32)`; el.style.opacity = 0;
    handLayer.appendChild(el); dealtEls.hand[k] = el;
    await raf(); el.style.transform = `rotate(${r}deg)`; el.style.opacity = 1;
  } else {
    const el = makeCard(null, 'scard', true);
    const m = worldMover(el, 34, 48); place(m, d[0], d[1], HF + 2); m.style.opacity = 0;
    dealtEls.opp[p.i][k] = m;
    await raf(); const c = p.cards[k]; place(m, c[0], c[1], HF + 2 + k * 0.3, c[2]); m.style.opacity = 1;
  }
  snd('deal');
  await sleep(130);
}
async function dealBoard(idxs) {
  const d = P[G.dealer].dealer;
  for (const i of idxs) {
    const el = makeCard(G.board[i], 'wcard shadow3', true);
    const m = worldMover(el, 74, 104); place(m, d[0], d[1], HF + 2); m.style.opacity = 0;
    dealtEls.board[i] = m;
    await raf(); place(m, SLOT_U[i], 0, HF + 1.5); m.style.opacity = 1;
    snd('deal'); await sleep(170);
  }
  await sleep(380);
  for (const i of idxs) { snd('flip'); flipEl(dealtEls.board[i].firstChild, true); await sleep(160); }
  await sleep(250);
}
async function foldAnim(p) {
  if (p.you) { dealtEls.hand.forEach(el => { if (el) { el.style.opacity = 0.32; el.style.transform += ' translateY(24px)'; el.classList.remove('glow'); } }); return; }
  dealtEls.opp[p.i].forEach(m => { if (m) { place(m, POT[0] * 0.3, -30, HF + 2, 90); m.style.opacity = 0; setTimeout(() => m.remove(), 600); } });
  dealtEls.opp[p.i] = [];
}
async function revealOpp(p) {
  const ms = dealtEls.opp[p.i]; if (!ms.length || p.shown) return; p.shown = 1;
  for (let k = 0; k < 2; k++) {
    const m = ms[k]; if (!m) continue;
    const card = m.firstChild;
    card.className = `card mcard down${isRed(p.hole[k]) ? ' red' : ''}`;
    card.querySelector('.face').innerHTML = faceHTML(p.hole[k]);
    card.style.left = '-23px'; card.style.top = '-32px';
    const c = p.cards[k]; place(m, c[0] + (k ? 12 : -12) * Math.sign(c[0]) * 0.4, c[1] + 8, HF + 2 + k * 0.3, c[2] * 0.5);
    snd('flip'); flipEl(card, true); await sleep(140);
  }
}

/* ---------- Deine Hand & Glow ---------- */
function updateHandLabel() {
  const me = P[0];
  const K = $('handK'), V = $('handV');
  document.querySelectorAll('.gflat,.hcard.glow').forEach(e => e.classList.remove('gflat', 'glow'));
  if (!me.hole.length) { K.textContent = 'Deine Hand'; V.textContent = '–'; return; }
  if (!G.board.length) {
    K.textContent = 'Deine Starthand'; V.textContent = E.startingHandName(me.hole);
    if (E.rankOf(me.hole[0]) === E.rankOf(me.hole[1]) && !me.folded) dealtEls.hand.forEach(e => e && e.classList.add('glow'));
    return;
  }
  const all = me.hole.concat(G.board), sc = E.score(all);
  K.textContent = me.folded ? 'Du hättest' : 'Deine Hand'; V.textContent = E.describe(sc);
  if (E.catOf(sc) >= 1 && !me.folded) glowCards(E.keyCards(all), me);
}
function glowCards(keys, owner) {
  keys.forEach(c => {
    const bi = G.board.indexOf(c);
    if (bi >= 0 && dealtEls.board[bi]) dealtEls.board[bi].firstChild.classList.add('gflat');
    const hi = owner.hole.indexOf(c);
    if (hi >= 0) {
      if (owner.you && dealtEls.hand[hi]) dealtEls.hand[hi].classList.add('glow');
      else if (!owner.you && dealtEls.opp[owner.i][hi]) dealtEls.opp[owner.i][hi].firstChild.classList.add('gflat');
    }
  });
}

/* ---------- Lernmodus ---------- */
const LEARN = {
  start: { t: 'Die Blinds', toast: ['Neue Runde', 'Blinds 10 / 20'], b: '<p>Jede Runde beginnt mit zwei Pflichteinsätzen, damit immer etwas im Topf liegt.</p><ul><li><b>Small Blind (10)</b> zahlt der Spieler links neben dem Dealer-Knopf „D“.</li><li><b>Big Blind (20)</b> zahlt der Spieler danach.</li><li>Der Knopf wandert jede Runde einen Platz weiter – so ist jeder mal dran.</li></ul>' },
  preflop: { t: 'Deine zwei Karten', toast: ['Preflop', 'Erste Setzrunde'], b: '<p>Jeder bekommt zwei verdeckte Karten – nur du siehst deine. Jetzt kommt die erste Setzrunde, der <b>Preflop</b>.</p><p>Später liegen fünf offene Karten in der Mitte. Am Ende zählt die beste Kombination aus <b>fünf</b> deiner sieben Karten.</p>' },
  action: { t: 'Du bist dran', b: '<ul><li><b>Passen</b> – Karten weglegen. Du zahlst nichts mehr, bist aber raus.</li><li><b>Check</b> – weiter, ohne zu zahlen. Geht nur, solange niemand gesetzt hat.</li><li><b>Mitgehen</b> – so viel zahlen wie der höchste Einsatz.</li><li><b>Erhöhen</b> – mehr setzen. Die anderen müssen nachziehen oder passen.</li></ul><p>Unsicher? Die Glühbirne oben rechts ist dein Coach.</p>' },
  flop: { t: 'Der Flop', toast: ['Der Flop', 'Drei Gemeinschaftskarten'], b: '<p>Drei Karten liegen jetzt offen in der Mitte. Sie gehören <b>allen</b> – jeder kombiniert sie mit seinen zwei Karten.</p><p>Danach folgt die zweite Setzrunde. Ab jetzt beginnt immer der Spieler links vom Dealer.</p>' },
  turn: { t: 'Der Turn', toast: ['Der Turn', 'Vierte Karte'], b: '<p>Die vierte Gemeinschaftskarte. Wieder darf jeder setzen, mitgehen oder passen.</p><p>Noch nichts getroffen? Frag dich, ob die letzte Karte deine Hand noch retten kann – der Coach rechnet es dir aus.</p>' },
  river: { t: 'Der River', toast: ['Der River', 'Letzte Karte'], b: '<p>Die fünfte und letzte Karte. Jetzt steht fest, was jeder hat.</p><p>In der letzten Setzrunde wird gern geblufft. Achte darauf, wer setzt – und wie oft er das sonst tut.</p>' },
  showdown: { t: 'Der Showdown', toast: ['Showdown', 'Karten auf den Tisch'], b: '<p>Alle, die noch dabei sind, decken auf. Jeder nutzt die besten <b>fünf</b> aus seinen zwei Karten und den fünf in der Mitte.</p><p>Die höhere Kombination gewinnt. Bei Gleichstand entscheidet die nächsthöhere Karte – der <b>Kicker</b>.</p>' }
};
const learnSeen = {};
let toastT = null;
function toast(t, s) {
  $('toastT').textContent = t; $('toastS').textContent = s || '';
  const el = $('toast'); el.classList.add('on'); snd('whoosh2'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2300);
}
async function learn(topic) {
  const L = LEARN[topic];
  if (S.learn && (learnSeen[topic] || 0) < 2) {
    learnSeen[topic] = (learnSeen[topic] || 0) + 1;
    $('learnK').textContent = topic === 'start' ? 'Lernmodus · Runde ' + G.handNo : 'Lernmodus';
    $('learnT').textContent = L.t; $('learnB').innerHTML = L.b;
    $('learn').classList.add('on'); snd('whoosh');
    const gid = G.gid;
    await new Promise(res => { G.learnDone = res; });
    $('learn').classList.remove('on');
    if (gid !== G.gid) throw ABORT;
    await sleep(200);
  } else if (L.toast) toast(L.toast[0], L.toast[1]);
}
$('learnOk').onclick = () => { snd('tap'); G.learnDone && G.learnDone(); };
$('learnOff').onclick = () => { S.learn = false; store.set('learn', false); syncSettings(); G.learnDone && G.learnDone(); };

/* ---------- Coach ---------- */
function halfPotTo() { const me = P[0]; const toCall = G.currentBet - me.bet; return clampRaise(G.currentBet + Math.round((potTotal() + toCall) * 0.5 / 10) * 10); }
function coachHTML() {
  const me = P[0];
  if (!me.hole.length) return '<p>Sobald du Karten hast, sage ich dir, wie gut sie sind und was ich tun würde.</p>';
  if (me.folded) return '<p>Du hast diese Runde gepasst. Schau in Ruhe zu, wie die anderen spielen – beim Showdown siehst du ihre Karten.</p>';
  const nOpp = nonFolded().length - 1;
  const eq = nOpp ? E.equity(me.hole, G.board, nOpp, G.board.length ? 1400 : 1000) : 1;
  const pct = Math.round(eq * 100);
  const L = [];
  if (!G.board.length) {
    const ps = E.preflopStrength(me.hole);
    const cls = ps > 0.72 ? 'eine sehr starke Starthand' : ps > 0.55 ? 'eine gute Starthand' : ps > 0.4 ? 'spielbar, aber nichts Besonderes' : 'eine schwache Starthand';
    L.push(`Du hast <b>${E.startingHandName(me.hole)}</b> – ${cls}.`);
  } else L.push(`Du hast gerade <b>${E.describe(E.score(me.hole.concat(G.board)))}</b>.`);
  const often = eq >= 0.5 ? 'öfter als jedes zweite Mal' : `etwa jedes ${Math.max(2, Math.round(1 / Math.max(eq, 0.02)))}. Mal`;
  L.push(`Gegen ${nOpp} Gegner gewinnst du etwa <b>${pct} %</b> – also ${often}.`);
  let rec = '';
  if (G.turn === me) {
    const toCall = G.currentBet - me.bet, pot = potTotal(), fair = 1 / (nOpp + 1);
    if (toCall > 0) {
      const need = toCall / (pot + toCall);
      L.push(`Du zahlst ${fmt(Math.min(toCall, me.stack))}, um ${fmt(pot + toCall)} zu gewinnen. Das lohnt sich ab etwa <b>${Math.round(need * 100)} %</b> Gewinnchance.`);
      if (eq > fair * 1.8 && eq > need * 1.6 && me.stack > toCall) rec = 'Erhöhen – du bist sehr wahrscheinlich vorne. Hol mehr Chips in den Topf.';
      else if (eq >= need) rec = 'Mitgehen – deine Chance ist größer als der Preis.';
      else rec = 'Passen – auf Dauer verlierst du hier mehr, als du gewinnst.';
    } else {
      rec = eq > fair * 1.6 ? `Setzen – zum Beispiel ${fmt(halfPotTo())}. Wer schwächer ist, soll dafür bezahlen.` : 'Check – es kostet nichts, die nächste Karte anzusehen.';
    }
    const ag = G.lastAggr; if (ag && !ag.you && !ag.folded && G.currentBet > 0) L.push(ag.persona.read);
  } else L.push('Wenn du dran bist, sage ich dir, was ich tun würde.');
  return L.map(l => `<p>${l}</p>`).join('') + (rec ? `<div class="rec"><b>Mein Tipp:</b> ${rec}</div>` : '');
}
function openCoach() { $('coachBody').innerHTML = coachHTML(); $('coach').classList.add('on'); snd('coach'); }
function closeCoach() { $('coach').classList.remove('on'); }
$('coachBtn').onclick = () => { if ($('coach').classList.contains('on')) closeCoach(); else openCoach(); };
$('coachX').onclick = closeCoach;

/* ---------- Deine Aktionen ---------- */
function minRaiseTo() { return G.currentBet === 0 ? BB : G.currentBet + G.minRaise; }
function clampRaise(v) { const me = P[0]; return Math.max(Math.min(minRaiseTo(), me.bet + me.stack), Math.min(me.bet + me.stack, v)); }
let raiseVal = 0;
function configureActions() {
  const me = P[0], toCall = G.currentBet - me.bet;
  if (toCall <= 0) { $('callIn').innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>'; $('callL').textContent = 'Check'; $('bCall').setAttribute('aria-label', 'Check'); }
  else if (toCall >= me.stack) { $('callIn').textContent = fmt(me.stack); $('callL').textContent = 'All-in'; $('bCall').setAttribute('aria-label', 'All-in mitgehen'); }
  else { $('callIn').textContent = fmt(toCall); $('callL').textContent = 'Mitgehen'; $('bCall').setAttribute('aria-label', 'Mitgehen ' + toCall); }
  const canRaise = me.stack > toCall && nonFolded().filter(p => !p.allIn).length > 1;
  $('bRaise').parentElement.style.visibility = canRaise ? 'visible' : 'hidden';
  $('raiseL').textContent = G.currentBet === 0 ? 'Setzen' : 'Erhöhen';
  resetRaiseChip();
}
function resetRaiseChip() { $('raiseIn').innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>'; }
function setRaise(v) {
  const me = P[0], max = me.bet + me.stack;
  raiseVal = clampRaise(v);
  const r = $('raiseR'); r.value = raiseVal;
  const pc = ((raiseVal - r.min) / Math.max(1, r.max - r.min)) * 100; r.style.setProperty('--p', pc + '%');
  $('raiseAmt').textContent = raiseVal >= max ? 'All-in · ' + fmt(max) : fmt(raiseVal);
  $('raiseIn').textContent = raiseVal >= max ? 'All-in' : fmt(raiseVal);
  $('raiseL').textContent = 'Bestätigen';
}
function openRaise() {
  const me = P[0], r = $('raiseR');
  r.min = Math.min(minRaiseTo(), me.bet + me.stack); r.max = me.bet + me.stack; r.step = 10;
  $('raiseK').textContent = G.currentBet === 0 ? 'Setzen' : 'Erhöhen auf';
  $('raise').classList.add('on'); setRaise(Math.max(minRaiseTo(), halfPotTo()));
}
function closeRaise() { $('raise').classList.remove('on'); resetRaiseChip(); if (G.turn === P[0]) $('raiseL').textContent = G.currentBet === 0 ? 'Setzen' : 'Erhöhen'; }
$('raiseR').oninput = e => setRaise(+e.target.value);
$('raiseX').onclick = closeRaise;
document.querySelectorAll('.presets button').forEach(b => b.onclick = () => {
  const me = P[0], toCall = G.currentBet - me.bet, pot = potTotal();
  const v = { min: minRaiseTo(), half: G.currentBet + Math.round((pot + toCall) * 0.5 / 10) * 10, pot: G.currentBet + Math.round((pot + toCall) / 10) * 10, all: me.bet + me.stack }[b.dataset.p];
  snd('tap'); setRaise(v);
});
function userAct(a) { if (G.userResolve) { const r = G.userResolve; G.userResolve = null; r(a); } }
$('bFold').onclick = () => userAct({ type: 'fold' });
$('bCall').onclick = () => { const me = P[0], toCall = G.currentBet - me.bet; userAct(toCall <= 0 ? { type: 'check' } : toCall >= me.stack ? { type: 'allin' } : { type: 'call' }); };
$('bRaise').onclick = () => {
  if (!$('raise').classList.contains('on')) { snd('tap'); openRaise(); return; }
  const me = P[0]; userAct(raiseVal >= me.bet + me.stack ? { type: 'allin' } : { type: 'raise', to: raiseVal });
};
function enableActions(on) {
  $('actions').classList.toggle('off', !on); $('actions').classList.toggle('my', on);
  $('handl').classList.toggle('turn', on); $('coachBtn').classList.toggle('ready', on);
}

/* ---------- Bewegungen der Spieler ---------- */
const EASE = 'cubic-bezier(.65,0,.35,1)';
function actAnim(p, type) {
  const hot = type === 'raise' || type === 'allin';
  const pill = UI.pills[p.i];
  if (pill) {
    if (type === 'check') pill.animate([{ transform: 'none' }, { transform: 'translateY(2px)' }, { transform: 'none' }, { transform: 'translateY(2px)' }, { transform: 'none' }], { duration: 420, easing: 'ease-in-out' });
    else pill.animate([
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(228,196,60,0)' },
      { transform: `scale(${hot ? 1.1 : 1.05})`, boxShadow: `0 0 0 ${hot ? 3 : 2}px rgba(228,196,60,${hot ? .9 : .5}), 0 0 ${hot ? 26 : 14}px rgba(228,196,60,${hot ? .55 : .3})` },
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(228,196,60,0)' }], { duration: hot ? 760 : 560, easing: EASE });
  }
  const chair = world.querySelector('.chair-' + (p.key === 'baron' ? 'B' : p.key === 'maxim' ? 'M' : '_'));
  if (chair) chair.animate([{ transform: 'rotateX(-90deg)' }, { transform: `rotateX(${hot ? -80 : -85}deg)` }, { transform: 'rotateX(-90deg)' }], { duration: hot ? 820 : 620, easing: EASE });
  // Karten leicht anheben (Spieler schaut nach / schiebt Chips)
  (dealtEls.opp[p.i] || []).forEach((m, k) => {
    if (!m || !m.firstChild) return;
    m.firstChild.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${hot ? -7 : -4}px) rotate(${k ? 3 : -3}deg)` }, { transform: 'translateY(0)' }], { duration: hot ? 700 : 520, easing: EASE, delay: k * 60 });
  });
  if (hot) {
    const b = UI.bubs[p.i]; b.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.35)' }, { filter: 'brightness(1)' }], { duration: 900, easing: EASE });
  }
}

/* ---------- Spielzüge ---------- */
function commit(p, amt) { amt = Math.max(0, Math.min(amt, p.stack)); p.stack -= amt; p.bet += amt; p.contrib += amt; if (p.stack === 0) p.allIn = true; }
async function apply(p, a) {
  const toCall = G.currentBet - p.bet;
  if (a.type === 'fold' && toCall <= 0 && !p.you) a = { type: 'check' };
  if (a.type === 'fold') { p.folded = true; bubble(p, 'Passt', 'dim'); snd('fold'); foldAnim(p); if (p.you) updateHandLabel(); }
  else if (a.type === 'check') { bubble(p, 'Check'); snd('check'); }
  else if (a.type === 'call') { const amt = Math.min(toCall, p.stack); commit(p, amt); bubble(p, p.allIn ? 'All-in' : 'Geht mit ' + fmt(amt)); snd('chips'); }
  else {
    const to = a.type === 'allin' ? p.bet + p.stack : Math.min(a.to, p.bet + p.stack);
    if (to <= G.currentBet) { const amt = Math.min(toCall, p.stack); commit(p, amt); bubble(p, p.allIn ? 'All-in' : 'Geht mit ' + fmt(amt)); snd('chips'); }
    else {
      const inc = to - G.currentBet, wasBet = G.currentBet === 0;
      commit(p, to - p.bet);
      if (inc >= G.minRaise) { G.minRaise = inc; P.forEach(q => { if (q !== p) q.acted = false; }); }
      G.currentBet = to; G.lastAggr = p;
      bubble(p, p.allIn ? 'All-in ' + fmt(to) : (wasBet ? 'Setzt ' : 'Erhöht auf ') + fmt(to), 'hot');
      snd('chipsBig');
    }
  }
  p.acted = true;
  if (a.type !== 'fold') actAnim(p, a.type);
  renderBets(); renderPills();
  await sleep(360);
}
async function botTurn(p) {
  setTurn(p);
  const t0 = performance.now();
  const a = E.botDecide({ hole: p.hole, board: G.board, toCall: G.currentBet - p.bet, pot: potTotal(), stack: p.stack, bet: p.bet, currentBet: G.currentBet, minRaiseTo: minRaiseTo(), bb: BB, nOpp: nonFolded().length - 1, persona: p.persona });
  const think = (620 + Math.random() * 850 + (a.type === 'raise' || a.type === 'allin' ? 380 : 0)) * S.speed;
  await sleep(Math.max(200, think - (performance.now() - t0)));
  setTurn(null);
  return a;
}
async function userTurn(p) {
  setTurn(p); configureActions(); enableActions(true); snd('turn');
  if (S.learn) { await learn('action'); if (G.turn === p) openCoach(); }
  const gid = G.gid;
  const a = await new Promise((res, rej) => { G.userResolve = res; G.userReject = rej; });
  if (gid !== G.gid) throw ABORT;
  enableActions(false); closeRaise(); closeCoach(); setTurn(null);
  return a;
}
async function bettingRound(start) {
  let i = start;
  for (let guard = 0; guard < 400; guard++) {
    if (nonFolded().length === 1) return false;
    const actors = P.filter(p => !p.folded && !p.allIn);
    if (!actors.some(p => !p.acted || p.bet < G.currentBet)) return true;
    if (actors.length === 1 && actors[0].bet >= G.currentBet) return true;
    const p = P[i];
    if (!p.folded && !p.allIn && (!p.acted || p.bet < G.currentBet)) {
      const a = p.you ? await userTurn(p) : await botTurn(p);
      await apply(p, a);
    }
    i = (i + 1) % 5;
  }
  return true;
}

/* ---------- Eine Hand ---------- */
function resetHand() {
  world.querySelectorAll('.mover').forEach(m => { if (m !== dealerBtn) m.remove(); });
  handLayer.innerHTML = '';
  dealtEls.opp = [[], [], [], [], []]; dealtEls.board = []; dealtEls.hand = [];
  betStacks.length = 0; potStack = null;
  P.forEach(p => { p.hole = []; p.bet = 0; p.contrib = 0; p.folded = false; p.allIn = false; p.acted = false; p.shown = 0; UI.pills[p.i] && UI.pills[p.i].classList.remove('win', 'out'); });
  G.board = []; G.deck = E.newDeck(); G.pot = 0; G.currentBet = 0; G.minRaise = BB; G.lastAggr = null;
  clearBubbles(); UI.betl.forEach(b => b.style.opacity = 0); renderPot(); updateHandLabel(); closeCoach();
}
async function playHand() {
  G.handNo++;
  for (const p of P) if (!p.you && p.stack <= 0) { p.stack = START; }
  if (P[0].stack <= 0) await bustDialog();
  resetHand(); renderPills();
  G.dealer = (G.dealer + 1) % 5; moveDealer();
  snd('shuffle'); await sleep(650);
  await learn('start');
  const sb = P[(G.dealer + 1) % 5], bb = P[(G.dealer + 2) % 5];
  commit(sb, SB); bubble(sb, 'Small Blind', 'dim'); snd('chips'); renderBets(); await sleep(260);
  commit(bb, BB); bubble(bb, 'Big Blind', 'dim'); snd('chips'); renderBets();
  G.currentBet = BB; G.minRaise = BB; G.street = 'preflop'; renderPills();
  await sleep(420);
  for (let r = 0; r < 2; r++) for (let k = 1; k <= 5; k++) { const p = P[(G.dealer + k) % 5]; p.hole.push(G.deck.pop()); await dealHole(p, r); }
  await sleep(250);
  snd('flip'); for (const el of dealtEls.hand) { flipEl(el, true); await sleep(110); }
  await sleep(200); updateHandLabel();
  await learn('preflop');
  let alive = await bettingRound(P.indexOf(bb) === 4 ? 0 : P.indexOf(bb) + 1);
  if (alive) {
    for (const st of ['flop', 'turn', 'river']) {
      await collectBets();
      if (actorsCount() < 2) for (const p of nonFolded()) if (!p.you) await revealOpp(p);
      G.street = st; G.currentBet = 0; G.minRaise = BB; G.lastAggr = null; P.forEach(p => { p.acted = false; });
      const n = st === 'flop' ? 3 : 1, idx = [];
      for (let k = 0; k < n; k++) { G.board.push(G.deck.pop()); idx.push(G.board.length - 1); }
      await dealBoard(idx); updateHandLabel();
      await learn(st);
      if (actorsCount() >= 2) { alive = await bettingRound((G.dealer + 1) % 5); if (!alive) break; }
    }
  }
  await collectBets();
  if (alive && nonFolded().length > 1) await showdown(); else await winByFold();
}

/* ---------- Auszahlung & Ergebnis ---------- */
async function payout(wins) {
  if (potStack) potStack.style.opacity = 1;
  const entries = [...wins.entries()];
  const gid = G.gid;
  entries.forEach(([w, amt], k) => {
    const m = makeStack(amt); place(m, POT[0], POT[1], HF + 0.5);
    requestAnimationFrame(() => requestAnimationFrame(() => { place(m, w.from[0] * 0.92, w.from[1] * 0.92, HF + 0.5); m.style.opacity = 0; }));
    setTimeout(() => m.remove(), 700);
  });
  if (potStack) { potStack.remove(); potStack = null; }
  snd('collect');
  await sleep(520);
  if (gid !== G.gid) return;
  entries.forEach(([w, amt]) => { w.stack += amt; if (UI.pills[w.i]) UI.pills[w.i].classList.add('win'); });
  G.pot = 0; renderPot(); renderPills();
}
let resultDone = null;
async function showResult(o) {
  $('resK').textContent = o.k; $('resBig').textContent = o.big; $('resBig').className = 'big' + (o.me ? ' me tglow' : '');
  $('resSub').textContent = o.sub || ''; $('resWhy').innerHTML = o.why || ''; $('resLines').innerHTML = o.lines || '';
  $('resBox').classList.toggle('shimmer', !!o.me);
  if (o.me) { $('resBox').classList.remove('shimmer'); void $('resBox').offsetWidth; $('resBox').classList.add('shimmer'); }
  $('result').classList.add('on'); snd('whoosh');
  const gid = G.gid;
  await new Promise(res => { resultDone = res; });
  $('result').classList.remove('on');
  if (gid !== G.gid) throw ABORT;
  await sleep(250);
}
$('resNext').onclick = () => { snd('tap'); resultDone && resultDone(); };
async function winByFold() {
  const w = nonFolded()[0];
  const amt = P.reduce((s, p) => s + p.contrib, 0);
  await payout(new Map([[w, amt]]));
  if (w.you) snd('win');
  await showResult({
    k: 'Alle anderen haben gepasst', me: w.you,
    big: w.you ? 'Du gewinnst ' + fmt(amt) : w.name + ' gewinnt ' + fmt(amt),
    sub: w.you ? 'Ohne Showdown – deine Karten bleiben geheim.' : 'Ohne Showdown.',
    why: w.you ? 'Wer als Letzter übrig bleibt, gewinnt den Topf – egal, welche Karten er hat. Darum funktioniert Bluffen.' : `${w.name} musste die Karten nicht zeigen. Vielleicht hatte ${({ vivienne: 'sie', baron: 'er', maxim: 'er', ottilie: 'sie' })[w.key]} etwas – vielleicht war es ein Bluff.`
  });
}
async function showdown() {
  G.street = 'showdown';
  await learn('showdown');
  const live = nonFolded();
  for (const p of live) if (!p.you) { await revealOpp(p); await sleep(200); }
  await sleep(350);
  const sc = new Map(live.map(p => [p, E.score(p.hole.concat(G.board))]));
  const pots = E.buildPots(P.map(p => p.contrib), P.map(p => p.folded));
  const wins = new Map();
  for (const pot of pots) {
    const el = pot.eligible.map(i => P[i]);
    const best = Math.max(...el.map(p => sc.get(p)));
    const ws = el.filter(p => sc.get(p) === best).sort((a, b) => ((a.i - G.dealer + 4) % 5) - ((b.i - G.dealer + 4) % 5));
    const share = Math.floor(pot.amount / ws.length / 5) * 5, rem = pot.amount - share * ws.length;
    ws.forEach((w, k) => wins.set(w, (wins.get(w) || 0) + share + (k === 0 ? rem : 0)));
  }
  const ranked = [...wins.entries()].sort((a, b) => b[1] - a[1]);
  const [w0, a0] = ranked[0];
  document.querySelectorAll('.gflat,.hcard.glow').forEach(e => e.classList.remove('gflat', 'glow'));
  glowCards(E.best5(w0.hole.concat(G.board)).cards, w0);
  await sleep(500);
  await payout(wins);
  const meWin = wins.has(P[0]);
  if (meWin) snd('win'); else snd('chips');
  const s0 = sc.get(w0);
  const others = live.filter(p => !wins.has(p)).sort((a, b) => sc.get(b) - sc.get(a));
  let why = '';
  if (ranked.length > 1 && sc.get(ranked[1][0]) === s0) why = 'Gleichstand – der Topf wird geteilt.';
  else if (others.length) {
    const s1 = sc.get(others[0]), c0 = E.catOf(s0), c1 = E.catOf(s1);
    why = c0 !== c1 ? `<b>${E.CAT_NAME[c0]}</b> schlägt <b>${E.CAT_NAME[c1]}</b> (${others[0].you ? 'deine Hand' : others[0].name}).`
      : `Beide haben ${E.CAT_NAME[c0]} – dann entscheiden die höheren Karten${c0 <= 2 ? ' bzw. der Kicker' : ''}.`;
  }
  if (ranked.length > 1 && sc.get(ranked[1][0]) !== s0) why += ` ${ranked.slice(1).map(([p, a]) => (p.you ? 'Du bekommst' : p.name + ' bekommt') + ' ' + fmt(a) + ' aus einem Nebentopf').join(', ')}.`;
  const lines = live.map(p => `<b>${p.you ? 'Du' : p.name}</b> ${E.describe(sc.get(p))}`).join('&nbsp; · &nbsp;');
  await showResult({
    k: 'Showdown', me: w0.you || meWin,
    big: (w0.you ? 'Du gewinnst ' : w0.name + ' gewinnt ') + fmt(a0),
    sub: 'mit ' + E.describe(s0), why, lines
  });
}

/* ---------- Pleite ---------- */
function bustDialog() {
  return new Promise(res => {
    $('bust').classList.add('on');
    $('rebuy').onclick = () => { P[0].stack = START; $('bust').classList.remove('on'); renderPills(); res(); };
    $('restart').onclick = () => { $('bust').classList.remove('on'); newGame(); };
  });
}

/* ---------- Spielstart ---------- */
async function loop(gid) {
  try { while (gid === G.gid) await playHand(); }
  catch (e) { if (e !== ABORT) { console.error(e); } }
}
function newGame() {
  G.gid++;
  if (G.userReject) { const r = G.userReject; G.userReject = null; G.userResolve = null; try { r(ABORT); } catch (e) {} }
  if (G.learnDone) G.learnDone(); if (resultDone) resultDone();
  ['learn', 'result', 'bust'].forEach(id => $(id).classList.remove('on'));
  enableActions(false); closeRaise(); closeCoach(); setTurn(null);
  P.forEach(p => { p.stack = START; shownStack[p.i] = START; });
  G.handNo = 0; G.dealer = Math.floor(Math.random() * 5);
  const gid = G.gid;
  setTimeout(() => loop(gid), 60);
}

/* ---------- Regelbuch ---------- */
const C = s => { const r = '23456789TJQKA'.indexOf(s[0]); return r * 4 + 'shdc'.indexOf(s[1]); };
const mini = (s, dim) => { const c = C(s); return `<div class="card mini paper${isRed(c) ? ' red' : ''}${dim ? ' dim' : ''}"><div class="ix"><b>${E.RANK_LABEL[E.rankOf(c)]}</b><i>${SYM[E.suitOf(c)]}</i></div></div>`; };
const HANDS = [
  ['Royal Flush', 'As Ks Qs Js Ts', 0, 'Ass bis Zehn in einer Farbe. Die beste Hand überhaupt – extrem selten.'],
  ['Straight Flush', '9h 8h 7h 6h 5h', 0, 'Fünf Karten in Folge und in einer Farbe.'],
  ['Vierling', 'Qs Qh Qd Qc 3s', 4, 'Vier Karten mit gleichem Wert.'],
  ['Full House', 'Kh Kd Ks 7c 7h', 0, 'Ein Drilling plus ein Paar.'],
  ['Flush', 'Ad Jd 8d 6d 2d', 0, 'Fünf Karten einer Farbe, die Reihenfolge ist egal.'],
  ['Straße', 'Ts 9d 8c 7h 6s', 0, 'Fünf Karten in Folge, Farbe egal. Das Ass darf auch unten stehen: A-2-3-4-5.'],
  ['Drilling', '8s 8h 8d Kc 4h', 3, 'Drei Karten mit gleichem Wert.'],
  ['Zwei Paare', 'Jh Jc 4s 4d Ah', 4, 'Zwei verschiedene Paare.'],
  ['Ein Paar', 'Ts Td Kh 6c 3s', 2, 'Zwei Karten mit gleichem Wert.'],
  ['Höchste Karte', 'Ah Jc 8s 5d 2h', 1, 'Nichts davon? Dann zählt die höchste Karte.']
];
const BOOK = {
  ablauf: `<h4>So läuft eine Runde</h4><p>Ziel ist es, die Chips der anderen zu gewinnen – entweder mit der besten Hand am Ende oder weil alle anderen aufgeben.</p><ol>
    <li><b>Blinds:</b> Die zwei Spieler links vom Dealer-Knopf zahlen Pflichteinsätze (10 und 20).</li>
    <li><b>Preflop:</b> Jeder bekommt zwei verdeckte Karten. Erste Setzrunde.</li>
    <li><b>Flop:</b> Drei offene Karten in der Mitte. Zweite Setzrunde.</li>
    <li><b>Turn:</b> Die vierte offene Karte. Dritte Setzrunde.</li>
    <li><b>River:</b> Die fünfte offene Karte. Letzte Setzrunde.</li>
    <li><b>Showdown:</b> Wer noch dabei ist, deckt auf. Die beste Kombination aus fünf von sieben Karten gewinnt.</li></ol>
    <p>In jeder Setzrunde ist reihum jeder dran, bis alle gleich viel gesetzt haben oder nur noch einer übrig ist.</p>`,
  haende: '<h4>Die Rangfolge der Hände</h4><p>Von oben nach unten: Die obere Hand schlägt immer die untere.</p>' + HANDS.map((h, i) => {
    const cs = h[1].split(' '); const n = h[2];
    return `<div class="hr"><span class="no">${i + 1}</span><span class="nm">${h[0]}</span><span class="cs">${cs.map((c, k) => mini(c, n && k >= n)).join('')}</span><span class="ds">${h[3]}</span></div>`;
  }).join(''),
  aktionen: `<h4>Was du tun kannst</h4><dl class="dl">
    <dt>Passen</dt><dd>Englisch <i>Fold</i>. Du legst deine Karten weg und bist für diese Runde raus. Was du schon gesetzt hast, bleibt im Topf.</dd>
    <dt>Check</dt><dd>Du gibst weiter, ohne zu zahlen. Geht nur, wenn in dieser Setzrunde noch niemand gesetzt hat.</dd>
    <dt>Setzen</dt><dd>Englisch <i>Bet</i>. Der erste Einsatz in einer Setzrunde.</dd>
    <dt>Mitgehen</dt><dd>Englisch <i>Call</i>. Du zahlst genau so viel wie der höchste Einsatz.</dd>
    <dt>Erhöhen</dt><dd>Englisch <i>Raise</i>. Du setzt mehr als der höchste Einsatz. Mindestens um so viel, wie zuletzt erhöht wurde.</dd>
    <dt>All-in</dt><dd>Alle deine Chips. Du kannst danach nichts mehr setzen, spielst aber bis zum Ende um den Teil des Topfs, den du abdeckst.</dd></dl>`,
  begriffe: `<h4>Kleines Lexikon</h4><dl class="dl">
    <dt>Pot</dt><dd>Der Topf – alle Chips, um die gerade gespielt wird.</dd>
    <dt>Dealer-Knopf</dt><dd>Die Scheibe mit „D“. Zeigt, wer in dieser Runde gibt. Wandert jede Runde weiter.</dd>
    <dt>Position</dt><dd>Wer später dran ist, sieht mehr von den anderen. Darum ist eine späte Position ein Vorteil.</dd>
    <dt>Gemeinschaftskarten</dt><dd>Die fünf offenen Karten in der Mitte. Jeder darf sie nutzen.</dd>
    <dt>Kicker</dt><dd>Die Beikarte, die bei gleicher Kombination entscheidet. Paar Damen mit Ass schlägt Paar Damen mit König.</dd>
    <dt>Bluff</dt><dd>Setzen mit einer schwachen Hand, damit die anderen aufgeben.</dd>
    <dt>Pot Odds</dt><dd>Das Verhältnis aus dem, was du zahlen musst, und dem, was du gewinnen kannst. Zahlst du 20 für einen Topf von 100, brauchst du gut 1 von 6 Gewinnen.</dd>
    <dt>Nebentopf</dt><dd>Entsteht, wenn jemand All-in ist und die anderen weiter setzen. Er kann nur den Teil gewinnen, den er selbst abgedeckt hat.</dd></dl>`
};
function openBook(tab) {
  document.querySelectorAll('#bookTabs button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  $('bookPane').innerHTML = BOOK[tab]; $('bookPane').scrollTop = 0;
  if (!$('book').classList.contains('on')) snd('whoosh'); $('book').classList.add('on'); paused = true;
}
document.querySelectorAll('#bookTabs button[data-t]').forEach(b => b.onclick = () => { snd('tap'); openBook(b.dataset.t); });
$('bookBtn').onclick = () => { Snd.init(); openBook('ablauf'); };
$('bookClose').onclick = () => { $('book').classList.remove('on'); paused = $('settings').classList.contains('on'); if (!G.running) { $('start').classList.add('on'); paused = false; } };
$('goBook').onclick = () => { Snd.init(); $('start').classList.remove('on'); openBook('ablauf'); };

/* ---------- Einstellungen ---------- */
function syncSettings() {
  $('tLearn').setAttribute('aria-checked', String(S.learn));
  $('tSound').setAttribute('aria-checked', String(S.sound));
  $('tAmb').setAttribute('aria-checked', String(S.amb));
  if (!$('tMusic').disabled) $('tMusic').setAttribute('aria-checked', String(S.music));
  document.querySelectorAll('#tSpeed button').forEach(b => b.classList.toggle('on', +b.dataset.s === S.speed));
}
$('setBtn').onclick = () => { Snd.init(); syncSettings(); snd('whoosh'); $('settings').classList.add('on'); paused = true; };
$('setClose').onclick = () => { $('settings').classList.remove('on'); paused = $('book').classList.contains('on'); };
$('tLearn').onclick = () => { S.learn = !S.learn; store.set('learn', S.learn); syncSettings(); };
$('tSound').onclick = () => { S.sound = !S.sound; store.set('sound', S.sound); syncSettings(); snd('tap'); };
$('tAmb').onclick = () => { S.amb = !S.amb; store.set('amb', S.amb); syncSettings(); Snd.init(); S.amb ? Snd.ambStart() : Snd.ambStop(); };
$('tMusic').onclick = () => { S.music = !S.music; store.set('music', S.music); syncSettings(); S.music ? Music.start() : Music.stop(); };
document.querySelectorAll('#tSpeed button').forEach(b => b.onclick = () => { S.speed = +b.dataset.s; store.set('speed', S.speed); syncSettings(); });
$('newGame').onclick = () => { $('settings').classList.remove('on'); paused = false; newGame(); };

/* ---------- Start ---------- */
function begin(learnMode) {
  Snd.init(); S.learn = learnMode; store.set('learn', learnMode);
  for (const k in learnSeen) delete learnSeen[k];
  $('start').classList.remove('on'); G.running = true; Music.start(); setTimeout(() => Snd.ambStart(), 1200); newGame();
}
$('goLearn').onclick = () => begin(true);
$('goFree').onclick = () => begin(false);

/* ---------- Zigarrenrauch ---------- */
const Smoke = (() => {
  const cv = $('smoke'); if (!cv) return { start() {} };
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = 844 * DPR; cv.height = 390 * DPR;
  const g = cv.getContext('2d'); g.scale(DPR, DPR);
  // weicher, unregelmäßiger Rauch-Sprite
  const sp = document.createElement('canvas'); sp.width = sp.height = 128;
  const sg = sp.getContext('2d');
  for (let i = 0; i < 9; i++) {
    const x = 64 + (Math.random() - 0.5) * 34, y = 64 + (Math.random() - 0.5) * 34, r = 26 + Math.random() * 26;
    const gr = sg.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(232,222,206,.32)'); gr.addColorStop(0.6, 'rgba(232,222,206,.1)'); gr.addColorStop(1, 'rgba(232,222,206,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
  }
  const P = [];
  // Dunst im ganzen Raum: große, sehr blasse Schwaden, die langsam treiben
  function puff(initial) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    P.push({ x: initial ? Math.random() * 844 : (dir > 0 ? -220 : 1064), y: 20 + Math.random() * 360,
      vx: dir * (0.06 + Math.random() * 0.1), vy: -0.01 - Math.random() * 0.03,
      size: 260 + Math.random() * 260, grow: 0.05, life: 2600 + Math.random() * 1600, age: initial ? Math.random() * 1800 : 0,
      a: 0.045 + Math.random() * 0.03, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.0008, seed: Math.random() * 100 });
  }
  for (let i = 0; i < 16; i++) puff(true);
  let t = 0, last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden || now - last < 33) return;
    last = now; t++;
    if (P.length < 16) puff(false);
    g.clearRect(0, 0, 844, 390);
    g.globalCompositeOperation = 'screen';
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.age++;
      if (p.age > p.life || p.x < -500 || p.x > 1350) { P.splice(i, 1); continue; }
      const k = p.age / p.life;
      p.x += p.vx + Math.sin(t * 0.006 + p.seed) * 0.05; p.y += p.vy + Math.cos(t * 0.005 + p.seed) * 0.03; p.size += p.grow; p.rot += p.vr;
      const fade = Math.min(1, k * 5) * Math.min(1, (1 - k) * 4);
      g.globalAlpha = p.a * fade;
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(sp, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
    }
    g.globalCompositeOperation = 'source-over';
  }
  return { start() { requestAnimationFrame(frame); } };
})();
Smoke.start();
buildWorld(); buildLabels(); moveDealer(true); renderPills(); syncSettings(); Music.probe();
window.__salon = { G, P, newGame };
})();
