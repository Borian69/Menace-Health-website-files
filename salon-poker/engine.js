/* Salon – Poker-Engine: Karten, Handbewertung, Side-Pots, Gewinnchancen, Bot-Logik */
(function (root) {
  'use strict';

  const RANKS = '23456789TJQKA';
  const SUITS = 'shdc';
  const RANK_NAME = { 2: 'Zwei', 3: 'Drei', 4: 'Vier', 5: 'Fünf', 6: 'Sechs', 7: 'Sieben', 8: 'Acht', 9: 'Neun', 10: 'Zehn', 11: 'Bube', 12: 'Dame', 13: 'König', 14: 'Ass' };
  const RANK_PLURAL = { 2: 'Zweien', 3: 'Dreien', 4: 'Vieren', 5: 'Fünfen', 6: 'Sechsen', 7: 'Siebenen', 8: 'Achten', 9: 'Neunen', 10: 'Zehnen', 11: 'Buben', 12: 'Damen', 13: 'Könige', 14: 'Asse' };
  const RANK_LABEL = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const CAT_NAME = ['Höchste Karte', 'Ein Paar', 'Zwei Paare', 'Drilling', 'Straße', 'Flush', 'Full House', 'Vierling', 'Straight Flush', 'Royal Flush'];

  // Karte = Zahl 0..51 : rank = (c >> 2) + 2, suit = c & 3
  const rankOf = c => (c >> 2) + 2;
  const suitOf = c => c & 3;

  function rand() {
    if (root.crypto && root.crypto.getRandomValues) {
      const a = new Uint32Array(1); root.crypto.getRandomValues(a); return a[0] / 4294967296;
    }
    return Math.random();
  }

  function newDeck() {
    const d = [];
    for (let i = 0; i < 52; i++) d.push(i);
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }

  // Schnelle 7-Karten-Bewertung -> Zahl (höher = besser)
  function score(cards) {
    const rc = new Array(15).fill(0), sc = [0, 0, 0, 0];
    let rmask = 0; const smask = [0, 0, 0, 0];
    for (const c of cards) { const r = rankOf(c), s = suitOf(c); rc[r]++; sc[s]++; rmask |= 1 << r; smask[s] |= 1 << r; }
    const pack = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 16 + (ks[i] || 0); return v; };
    const straightHigh = m => {
      if ((m & 0x4000) && (m & 0x3c) === 0x3c) { /* A-5 */ }
      for (let h = 14; h >= 6; h--) { const need = 0x1f << (h - 4); if ((m & need) === need) return h; }
      if ((m & (1 << 14)) && (m & 0x3c) === 0x3c) return 5;
      return 0;
    };
    let flushSuit = -1;
    for (let s = 0; s < 4; s++) if (sc[s] >= 5) flushSuit = s;
    if (flushSuit >= 0) {
      const sh = straightHigh(smask[flushSuit]);
      if (sh) return pack(sh === 14 ? 9 : 8, [sh]);
    }
    const quads = [], trips = [], pairs = [], singles = [];
    for (let r = 14; r >= 2; r--) {
      if (rc[r] === 4) quads.push(r); else if (rc[r] === 3) trips.push(r); else if (rc[r] === 2) pairs.push(r); else if (rc[r] === 1) singles.push(r);
    }
    if (quads.length) {
      const k = [...trips, ...pairs, ...singles].sort((a, b) => b - a)[0];
      return pack(7, [quads[0], k]);
    }
    if (trips.length && (trips.length > 1 || pairs.length)) {
      const t = trips[0]; const p = Math.max(trips[1] || 0, pairs[0] || 0);
      return pack(6, [t, p]);
    }
    if (flushSuit >= 0) {
      const ks = []; for (let r = 14; r >= 2 && ks.length < 5; r--) if (smask[flushSuit] & (1 << r)) ks.push(r);
      return pack(5, ks);
    }
    const st = straightHigh(rmask);
    if (st) return pack(4, [st]);
    if (trips.length) return pack(3, [trips[0], ...singles.slice(0, 2)]);
    if (pairs.length >= 2) {
      const k = [...pairs.slice(2), ...singles].sort((a, b) => b - a)[0];
      return pack(2, [pairs[0], pairs[1], k]);
    }
    if (pairs.length) return pack(1, [pairs[0], ...singles.slice(0, 3)]);
    return pack(0, singles.slice(0, 5));
  }

  const catOf = sc => Math.floor(sc / 1048576);
  function kicksOf(sc) { const k = []; let v = sc; for (let i = 0; i < 5; i++) { k.unshift(v % 16); v = Math.floor(v / 16); } return k; }

  function describe(sc) {
    const cat = catOf(sc), k = kicksOf(sc);
    switch (cat) {
      case 9: return 'Royal Flush';
      case 8: return 'Straight Flush bis ' + RANK_NAME[k[0]];
      case 7: return 'Vierling ' + RANK_PLURAL[k[0]];
      case 6: return 'Full House, ' + RANK_PLURAL[k[0]] + ' und ' + RANK_PLURAL[k[1]];
      case 5: return 'Flush, ' + RANK_NAME[k[0]] + ' hoch';
      case 4: return 'Straße bis ' + RANK_NAME[k[0]];
      case 3: return 'Drilling ' + RANK_PLURAL[k[0]];
      case 2: return 'Zwei Paare, ' + RANK_PLURAL[k[0]] + ' und ' + RANK_PLURAL[k[1]];
      case 1: return 'Ein Paar ' + RANK_PLURAL[k[0]];
      default: return RANK_NAME[k[0]] + ' hoch';
    }
  }

  // Beste 5 Karten (für Hervorhebung beim Showdown)
  function best5(cards) {
    const n = cards.length;
    if (n <= 5) return { cards: cards.slice(), score: score(cards) };
    let best = null, bestSc = -1;
    const idx = [];
    (function rec(start, picked) {
      if (picked.length === 5) { const five = picked.map(i => cards[i]); const s = score(five); if (s > bestSc) { bestSc = s; best = five; } return; }
      for (let i = start; i < n; i++) { picked.push(i); rec(i + 1, picked); picked.pop(); }
    })(0, idx);
    return { cards: best, score: bestSc };
  }
  function score5(five) { return score(five); }

  // Wichtige Karten einer Hand (die, die den Rang bilden) – für Glow
  function keyCards(cards) {
    const b = best5(cards); const cat = catOf(b.score); const k = kicksOf(b.score);
    if (cat === 1) return b.cards.filter(c => rankOf(c) === k[0]);
    if (cat === 2) return b.cards.filter(c => rankOf(c) === k[0] || rankOf(c) === k[1]);
    if (cat === 3 || cat === 7) return b.cards.filter(c => rankOf(c) === k[0]);
    if (cat === 0) return b.cards.filter(c => rankOf(c) === k[0]);
    return b.cards;
  }

  // Side-Pots: contributions = Einsätze je Spieler, folded = bool[]
  function buildPots(contrib, folded) {
    const levels = [...new Set(contrib.filter((c, i) => c > 0 && !folded[i]))].sort((a, b) => a - b);
    const pots = []; let prev = 0;
    for (const L of levels) {
      let amt = 0;
      contrib.forEach(c => { amt += Math.max(0, Math.min(c, L) - prev); });
      const elig = contrib.map((c, i) => i).filter(i => !folded[i] && contrib[i] >= L);
      if (amt > 0) pots.push({ amount: amt, eligible: elig });
      prev = L;
    }
    // Reste von gefoldeten Spielern über dem höchsten Level -> letzter Pot
    let rest = 0; contrib.forEach(c => { rest += Math.max(0, c - prev); });
    if (rest > 0 && pots.length) pots[pots.length - 1].amount += rest;
    // gleiche Berechtigte zusammenführen
    const merged = [];
    for (const p of pots) {
      const last = merged[merged.length - 1];
      if (last && last.eligible.join() === p.eligible.join()) last.amount += p.amount; else merged.push({ ...p });
    }
    return merged;
  }

  // Gewinnchance per Monte-Carlo
  function equity(hole, board, nOpp, iters) {
    iters = iters || 400;
    if (nOpp <= 0) return 1;
    const used = new Set([...hole, ...board]);
    const rest = []; for (let i = 0; i < 52; i++) if (!used.has(i)) rest.push(i);
    let win = 0;
    const need = 5 - board.length;
    for (let it = 0; it < iters; it++) {
      // teilweise mischen
      const take = need + nOpp * 2;
      for (let i = 0; i < take; i++) { const j = i + Math.floor(Math.random() * (rest.length - i)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      const b = board.concat(rest.slice(0, need));
      const my = score(hole.concat(b));
      let best = 0, ties = 0, lose = false;
      for (let o = 0; o < nOpp; o++) {
        const s = score([rest[need + o * 2], rest[need + o * 2 + 1], ...b]);
        if (s > my) { lose = true; break; }
        if (s === my) ties++;
      }
      if (!lose) win += ties ? 1 / (ties + 1) : 1;
      void best;
    }
    return win / iters;
  }

  /* Gewinnchance gegen Gegner mit eingegrenztem Bereich.
     fracs: je Gegner der Anteil der stärksten Hände, die er hier realistisch hält (1 = jede Hand).
     Rangfolge: vor dem Flop nach Starthand-Stärke, danach nach aktueller Hand mit dem Board. */
  function equityRange(hole, board, fracs, iters) {
    iters = iters || 1200;
    const nOpp = fracs.length; if (!nOpp) return 1;
    const used = new Set([...hole, ...board]);
    const rest = []; for (let i = 0; i < 52; i++) if (!used.has(i)) rest.push(i);
    let combos = null;
    if (fracs.some(f => f < 1)) {
      combos = [];
      for (let i = 0; i < rest.length; i++) for (let j = i + 1; j < rest.length; j++) {
        const h = [rest[i], rest[j]];
        combos.push({ h, s: board.length >= 3 ? score(h.concat(board)) : preflopStrength(h) });
      }
      combos.sort((a, b) => b.s - a.s);
    }
    const lists = fracs.map(f => f < 1 ? combos.slice(0, Math.max(12, Math.ceil(combos.length * f))) : null);
    let win = 0, n = 0;
    for (let it = 0; it < iters; it++) {
      const taken = new Set(), hands = [];
      let ok = true;
      for (const L of lists) {
        let h = null;
        if (L) { for (let t = 0; t < 30 && !h; t++) { const c = L[Math.floor(Math.random() * L.length)].h; if (!taken.has(c[0]) && !taken.has(c[1])) h = c; } }
        else { for (let t = 0; t < 60 && !h; t++) { const a = rest[Math.floor(Math.random() * rest.length)], b = rest[Math.floor(Math.random() * rest.length)]; if (a !== b && !taken.has(a) && !taken.has(b)) h = [a, b]; } }
        if (!h) { ok = false; break; }
        taken.add(h[0]); taken.add(h[1]); hands.push(h);
      }
      if (!ok) continue;
      const b = board.slice();
      while (b.length < 5) { const c = rest[Math.floor(Math.random() * rest.length)]; if (!taken.has(c)) { taken.add(c); b.push(c); } }
      const my = score(hole.concat(b));
      let lose = false, ties = 0;
      for (const h of hands) { const sc = score(h.concat(b)); if (sc > my) { lose = true; break; } if (sc === my) ties++; }
      n++;
      if (!lose) win += ties ? 1 / (ties + 1) : 1;
    }
    return n ? win / n : 0;
  }

  /* Outs: Karten im Stapel, die deine Hand in eine bessere Kategorie heben –
     und zwar mit deinen eigenen Karten (eine Karte, die nur das Board verbessert, zählt nicht). */
  function outs(hole, board) {
    if (board.length < 3 || board.length > 4) return null;
    const cur = catOf(score(hole.concat(board)));
    const used = new Set([...hole, ...board]);
    const byCat = {}; let count = 0;
    for (let c = 0; c < 52; c++) {
      if (used.has(c)) continue;
      const nb = board.concat(c), mine = catOf(score(hole.concat(nb)));
      if (mine > cur && mine > catOf(score(nb))) { count++; byCat[mine] = (byCat[mine] || 0) + 1; }
    }
    const left = 52 - used.size;
    const prob = board.length === 3 ? 1 - ((left - count) / left) * ((left - 1 - count) / (left - 1)) : count / left;
    return { count, byCat, cur, prob, rule: count * (board.length === 3 ? 4 : 2) };
  }

  // Vorab-Einschätzung der Starthand (0..1)
  function preflopStrength(hole) {
    const a = rankOf(hole[0]), b = rankOf(hole[1]);
    const hi = Math.max(a, b), lo = Math.min(a, b), suited = suitOf(hole[0]) === suitOf(hole[1]);
    const val = { 14: 10, 13: 8, 12: 7, 11: 6 };
    let s = val[hi] || hi / 2;
    if (a === b) s = Math.max(5, s * 2);
    if (suited) s += 2;
    const gap = hi - lo - 1;
    if (a !== b) { if (gap === 1) s -= 1; else if (gap === 2) s -= 2; else if (gap === 3) s -= 4; else if (gap >= 4) s -= 5; if (gap <= 1 && hi < 12) s += 1; }
    return Math.max(0, Math.min(1, (s + 1) / 21));
  }

  function startingHandName(hole) {
    const a = rankOf(hole[0]), b = rankOf(hole[1]);
    const suited = suitOf(hole[0]) === suitOf(hole[1]);
    if (a === b) return 'Paar ' + RANK_PLURAL[a];
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return RANK_NAME[hi] + '–' + RANK_NAME[lo] + (suited ? ', gleiche Farbe' : '');
  }

  // Persönlichkeiten der Gegner
  const PERSONAS = {
    vivienne: { name: 'Vivienne', style: 'vorsichtig', loose: -0.06, aggr: 0.35, bluff: 0.03, slow: 0.05, mistake: 0.07, read: 'Vivienne spielt sehr vorsichtig. Wenn sie erhöht, hat sie meistens wirklich etwas.' },
    baron: { name: 'Baron', style: 'solide', loose: -0.02, aggr: 0.6, bluff: 0.08, slow: 0.08, mistake: 0.05, read: 'Der Baron spielt solide. Seine Erhöhungen sind meist ehrlich, gelegentlich blufft er.' },
    maxim: { name: 'Maxim', style: 'wild', loose: 0.12, aggr: 0.85, bluff: 0.26, slow: 0.04, mistake: 0.12, read: 'Maxim blufft oft. Ein Erhöhen von ihm bedeutet nicht automatisch eine starke Hand.' },
    ottilie: { name: 'Ottilie', style: 'listig', loose: 0.02, aggr: 0.55, bluff: 0.12, slow: 0.3, mistake: 0.07, read: 'Ottilie ist listig. Mit starken Händen schiebt sie gern erst einmal, um dich hereinzulocken.' }
  };

  /* Bot-Entscheidung.
     ctx: { hole, board, toCall, pot, stack, bet, currentBet, minRaiseTo, bb, nOpp, street, persona } */
  function botDecide(ctx) {
    const p = ctx.persona;
    let eq = ctx.board.length === 0
      ? 0.55 * preflopStrength(ctx.hole) + 0.45 * equity(ctx.hole, [], ctx.nOpp, 220)
      : equity(ctx.hole, ctx.board, ctx.nOpp, 320);
    const fairShare = 1 / (ctx.nOpp + 1);
    // relative Stärke: 1 = doppelt so gut wie Durchschnitt
    let rel = eq / fairShare;
    rel += p.loose * 3;
    const potOdds = ctx.toCall > 0 ? ctx.toCall / (ctx.pot + ctx.toCall) : 0;
    const r = Math.random();
    const maxTo = ctx.bet + ctx.stack;
    const sizeTo = frac => {
      const target = ctx.currentBet + Math.max(ctx.minRaiseTo - ctx.currentBet, Math.round((ctx.pot + ctx.toCall) * frac / ctx.bb) * ctx.bb);
      return Math.min(maxTo, Math.max(ctx.minRaiseTo, target));
    };
    let act;
    const strong = rel > 1.75, good = rel > 1.2;
    if (ctx.toCall === 0) {
      if (strong && r < p.slow) act = { type: 'check', why: 'slow' };
      else if (strong || (good && r < p.aggr)) act = { type: 'raise', to: sizeTo(0.5 + Math.random() * 0.4), why: 'value' };
      else if (r < p.bluff) act = { type: 'raise', to: sizeTo(0.45 + Math.random() * 0.3), why: 'bluff' };
      else act = { type: 'check', why: 'weak' };
    } else {
      const needEq = potOdds;
      if (strong && r < p.aggr && !(r < p.slow)) act = { type: 'raise', to: sizeTo(0.6 + Math.random() * 0.5), why: 'value' };
      else if (eq > needEq * 1.05 || (good && ctx.toCall <= ctx.bb * 3)) act = { type: 'call', why: 'odds' };
      else if (r < p.bluff * 0.45 && ctx.toCall < ctx.stack * 0.35) act = { type: 'raise', to: sizeTo(0.7), why: 'bluff' };
      else act = { type: 'fold', why: 'weak' };
    }
    // Fehler einbauen
    if (Math.random() < p.mistake) {
      if (act.type === 'fold' && ctx.toCall < ctx.stack * 0.5) act = { type: 'call', why: 'mistake' };
      else if (act.type === 'call' && Math.random() < 0.5) act = { type: 'fold', why: 'mistake' };
      else if (act.type === 'check' && Math.random() < 0.5) act = { type: 'raise', to: sizeTo(0.6), why: 'mistake' };
    }
    if (act.type === 'raise') {
      if (act.to >= maxTo) act = { type: 'allin', why: act.why };
      else if (act.to <= ctx.currentBet) act = ctx.toCall ? { type: 'call', why: act.why } : { type: 'check', why: act.why };
    }
    if (act.type === 'call' && ctx.toCall >= ctx.stack) act = { type: 'allin', why: act.why };
    act.eq = eq;
    return act;
  }

  const api = { RANKS, SUITS, RANK_NAME, RANK_PLURAL, RANK_LABEL, CAT_NAME, rankOf, suitOf, newDeck, score, catOf, kicksOf, describe, best5, keyCards, buildPots, equity, equityRange, outs, preflopStrength, startingHandName, PERSONAS, botDecide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PokerEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
