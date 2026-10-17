/* Moch — Bewegung · v4.0
   Federn nach Apple, kritisch gedämpft: Response 0,3–0,7 s, kein Nachfedern.
   Jede Animation startet am sichtbaren Wert, übernimmt die Geschwindigkeit und ist
   jederzeit unterbrechbar. prefers-reduced-motion setzt jeden Wert sofort.

   Einbinden:  <script src="motion/moch-motion.js" defer></script>  →  window.Moch
   Markup und Klassen: Komponentenschicht (ds-bundle/styles.css), Abschnitt APP-SCHICHT.
   Referenz-App: beispiel-app.html (Bordbuch). */
(function (global) {
  'use strict';
  const rm = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const fmt = n => n.toLocaleString('de-DE');
  /* Text sicher ins HTML: Nutzerdaten nie roh in innerHTML */
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Gedämpfte Feder: Auslenkung x0, Geschwindigkeit v0, Dämpfung z, Response T (s), Zeit t (s) */
  function spring(x0, v0, z, T, t) {
    const w = 2 * Math.PI / T;
    if (z >= 1) { const e = Math.exp(-w * t), B = v0 + w * x0; return { x: e * (x0 + B * t), v: e * (v0 - w * B * t) }; }
    const a = z * w, wd = w * Math.sqrt(1 - z * z), B = (v0 + a * x0) / wd, e = Math.exp(-a * t);
    const c = Math.cos(wd * t), s = Math.sin(wd * t), x = e * (x0 * c + B * s);
    return { x, v: -a * x + e * wd * (B * c - x0 * s) };
  }

  /* Ein animierbarer Wert. apply(v) schreibt ihn ins DOM. */
  function Anim(apply, init = 0) {
    let val = init, vel = 0, raf = 0;
    apply(val);
    return {
      get value() { return val; },
      get running() { return !!raf; },
      stop() { cancelAnimationFrame(raf); raf = 0; },
      set(v) { cancelAnimationFrame(raf); raf = 0; val = v; vel = 0; apply(v); },
      to(target, { z = 1, T = .4, v = vel, delay = 0 } = {}, done) {
        cancelAnimationFrame(raf); raf = 0;
        if (!Number.isFinite(target)) return;                       /* NaN/∞ nie animieren */
        if (!Number.isFinite(v)) v = 0;
        if (rm.matches) { val = target; vel = 0; apply(val); done && done(); return; }
        const x0 = val - target, t0 = performance.now() + delay;
        const ruhe = Math.max(Math.abs(x0), 1e-3) * .002;          /* Ruheschwelle relativ zur Strecke */
        const step = now => {
          const t = Math.max(0, (now - t0) / 1000), s = spring(x0, v, z, T, t);
          val = target + s.x; vel = s.v; apply(val);
          if (t > 0 && Math.abs(s.x) < ruhe && Math.abs(s.v) * T < ruhe * 10) {
            val = target; vel = 0; apply(val); raf = 0; done && done(); return;
          }
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      }
    };
  }

  /* Zählwerk: <span class="zw"></span> in .zaehlwerk. Startet bei 0 und rollt beim ersten
     zaehle() hoch – Ziffer für Ziffer von links nach rechts, 45 ms versetzt. */
  function Zaehlwerk(el, start = 0) {
    let walzen = [];
    /* Screenreader lesen den Wert als Text, die Walzen sind Dekoration der Zahl */
    const sr = document.createElement('span');
    sr.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
    const baue = (n, alt = '') => {
      el.textContent = ''; walzen = [];
      const ziffern = alt.padStart(fmt(n).replace(/\D/g, '').length, '0');
      let k = 0;
      fmt(n).split('').forEach(ch => {
        if (!/\d/.test(ch)) { const p = document.createElement('span'); p.className = 'punkt'; p.setAttribute('aria-hidden', 'true'); p.textContent = ch; el.appendChild(p); return; }
        const z = document.createElement('span'); z.className = 'ziffer'; z.setAttribute('aria-hidden', 'true');
        const col = document.createElement('span');
        for (let i = 0; i < 10; i++) { const d = document.createElement('i'); d.textContent = i; col.appendChild(d); }
        z.appendChild(col); el.appendChild(z);
        walzen.push(Anim(v => { col.style.transform = `translateY(${-v}em)`; }, +ziffern[k++] || 0));
      });
      el.appendChild(sr);
    };
    baue(start);
    sr.textContent = fmt(start);
    return {
      zaehle(n, { T = .55, stagger = 45 } = {}) {
        if (!Number.isFinite(n)) return;
        const s = fmt(n).replace(/\D/g, '');
        /* andere Stellenzahl: neu bauen, aber am sichtbaren Wert starten */
        if (s.length !== walzen.length) baue(n, walzen.map(w => String(Math.round(w.value) % 10)).join('').slice(-s.length));
        sr.textContent = fmt(n);
        [...s].forEach((d, i) => walzen[i].to(+d, { z: 1, T, delay: i * stagger }));
      }
    };
  }

  /* Zahl zählt hoch (Einträge, Summen). el.textContent wird gesetzt. */
  function Zaehler(el, start = 0, format = v => fmt(Math.round(v))) {
    const a = Anim(v => { el.textContent = format(v); }, start);
    return { zu: (n, T = .7) => a.to(n, { z: 1, T }), anim: a };
  }

  /* Linie zieht von links auf: setzt --d 0…1 auf allen Elementen (z. B. .dataline). */
  function zieheLinie(els, { T = .8, delay = 0 } = {}) {
    const list = [...els];
    const a = Anim(d => list.forEach(e => e.style.setProperty('--d', d)), 0);
    a.to(1, { z: 1, T, delay });
    return a;
  }

  /* Bemaßung: .mass bekommt --wert 0…1 zwischen von und bis. */
  function Mass(el, von, bis) {
    const a = Anim(p => el.style.setProperty('--wert', p), 0);
    const spanne = bis - von;
    return { zeige(n, T = .7) { const p = spanne ? (n - von) / spanne : (n >= bis ? 1 : 0); a.to(Math.min(1, Math.max(0, p)), { z: 1, T }); return Math.max(0, bis - n); } };
  }

  /* Titel: Wörter in Spans zerlegen, Auftritt über [data-auftritt].an */
  function titelWoerter(h) {
    const woerter = h.textContent.trim().split(/\s+/);
    h.textContent = '';
    woerter.forEach((w, i) => {
      if (i) h.appendChild(document.createTextNode(' '));
      const s = document.createElement('span'); s.className = 'wort'; s.style.setProperty('--i', i); s.textContent = w; h.appendChild(s);
    });
  }
  function zeigeTitel(kopf) { kopf.classList.remove('an'); void kopf.offsetWidth; kopf.classList.add('an'); }

  /* Gestaffelter Auftritt: .rein → .da, Schritt in ms (Gruppen 70, Listen 35) */
  function staffel(els, schritt = 70, start = 120) {
    [...els].forEach((el, i) => { el.classList.remove('da'); el.classList.add('rein'); setTimeout(() => el.classList.add('da'), start + i * schritt); });
  }

  /* Chips: Druckpunkt merken (Füllung wächst von dort), Haptik 8 ms */
  function chipDruck(root = document) {
    root.addEventListener('pointerdown', e => {
      const c = e.target.closest('.chip'); if (!c) return;
      const r = c.getBoundingClientRect();
      c.style.setProperty('--x', `${e.clientX - r.left}px`); c.style.setProperty('--y', `${e.clientY - r.top}px`);
    });
    root.addEventListener('click', e => { if (e.target.closest('.chip') && navigator.vibrate) navigator.vibrate(8); });
  }

  /* „Weitere anzeigen“: Container bekommt .offen, Chips darin gestaffelt (--i) */
  function mehr(btn, container, { zu = 'Weitere anzeigen', auf = 'Weniger anzeigen' } = {}) {
    container.querySelectorAll('.mehr-wrap .chip').forEach((c, i) => c.style.setProperty('--i', i));
    btn.addEventListener('click', () => {
      const offen = container.classList.toggle('offen');
      btn.setAttribute('aria-expanded', String(offen));
      const t = btn.querySelector('span'); if (t) t.textContent = offen ? auf : zu;
    });
  }

  /* Bedingte Hauptaktion: zeige(true|false) federt .aktion herein oder heraus (--a) */
  function Bedingt(el) {
    const a = Anim(v => el.style.setProperty('--a', v), 0);
    return { zeige(ok) { if (ok === el.classList.contains('da')) return; el.classList.toggle('da', ok); a.to(ok ? 1 : 0, { z: 1, T: .35 }); } };
  }

  /* Toast: erscheint, geht nach --dur-toast (3,2 s) */
  function Toast(el) {
    let tt = 0;
    const ziel = () => el.querySelector('span') || el.appendChild(document.createElement('span'));
    /* zeige(fett, rest): beides als Text – Nutzerdaten werden nie als HTML gelesen */
    return { zeige(fett, rest = '', ms = 3200) {
      const t = ziel(); t.textContent = '';
      if (fett) { const b = document.createElement('b'); b.textContent = fett; t.appendChild(b); t.appendChild(document.createTextNode(' ')); }
      t.appendChild(document.createTextNode(rest));
      el.classList.add('da'); clearTimeout(tt); tt = setTimeout(() => el.classList.remove('da'), ms); } };
  }

  /* Kopf: großer Titel wandert beim Scrollen in die Leiste (--p 0…1 über 60 px) */
  function kopf(seite, leiste, miniText) {
    const upd = () => {
      const p = Math.min(1, Math.max(0, seite.scrollTop / 60)).toFixed(3);
      leiste.style.setProperty('--p', p); seite.style.setProperty('--p', p);
      const mini = leiste.querySelector('.mini');
      if (miniText != null && mini) mini.textContent = miniText;
    };
    seite.addEventListener('scroll', upd, { passive: true });
    return upd;
  }

  /* Seiten: Tippen auf Tabs oder Wischen. 1:1 am Finger, Gummiband 0,3 an den Rändern,
     Momentum-Projektion v/1000 · d/(1−d) mit d = 0,998, Feder mit übernommener Geschwindigkeit. */
  function Seiten({ rahmen, track, tabs, ind, onWechsel }) {
    const n = track.children.length, W = () => rahmen.clientWidth || 1;
    let aktiv = 0;
    const trackA = Anim(x => { track.style.transform = `translate3d(${-x}px,0,0)`; });
    const indPos = i => { const b = tabs[Math.max(0, Math.min(tabs.length - 1, i))]; return b ? b.offsetLeft + b.offsetWidth / 2 - ind.offsetWidth / 2 : 0; };
    const indA = Anim(x => { ind.style.transform = `translateX(${x}px)`; });
    indA.set(indPos(0));
    function gehe(i, v = 0) {
      i = Math.max(0, Math.min(n - 1, i));
      const war = aktiv; aktiv = i;
      tabs.forEach((t, j) => t.setAttribute('aria-selected', String(j === i)));
      trackA.to(i * W(), { z: Math.abs(v) > 500 ? .85 : 1, T: .4, v });
      indA.to(indPos(i), { z: 1, T: .35 });
      onWechsel && onWechsel(i, war);
    }
    tabs.forEach((t, i) => t.addEventListener('click', () => gehe(i)));
    let g = null;
    track.addEventListener('pointerdown', e => {
      if (n < 2 || g || !e.isPrimary || e.button !== 0 || e.target.closest('input,textarea,select,button,a')) return;
      g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, mode: trackA.running ? 'drag' : 'warte', start: trackA.value, s: [] };
      if (g.mode === 'drag') { trackA.stop(); g.start = trackA.value; track.setPointerCapture(e.pointerId); }
    });
    global.addEventListener('pointermove', e => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (g.mode === 'warte') {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { g.mode = 'drag'; g.x0 = e.clientX; g.start = trackA.value; track.setPointerCapture(e.pointerId); }
        else if (Math.abs(dy) > 10) g = null;
        return;
      }
      let x = g.start - (e.clientX - g.x0); const max = (n - 1) * W();
      if (x < 0) x *= .3; if (x > max) x = max + (x - max) * .3;
      trackA.set(x); g.s.push([e.timeStamp, x]); if (g.s.length > 6) g.s.shift();
      const f = x / W(), i0 = Math.max(0, Math.min(n - 2, Math.floor(f))), r = Math.min(1, Math.max(0, f - i0));
      indA.set(indPos(i0) + (indPos(i0 + 1) - indPos(i0)) * r);
    });
    const ende = e => {
      if (!g || e.pointerId !== g.id) return;
      if (g.mode === 'drag') {
        /* nur Samples der letzten 100 ms: wer anhält und loslässt, wirft nicht */
        const s = g.s.filter(([t]) => e.timeStamp - t < 100);
        const v = s.length > 1 ? (s[s.length - 1][1] - s[0][1]) / ((s[s.length - 1][0] - s[0][0]) / 1000 || 1) : 0;
        const ziel = trackA.value + (v / 1000) * .998 / .002;   /* Momentum-Projektion */
        gehe(Math.max(aktiv - 1, Math.min(aktiv + 1, Math.round(ziel / W()))), v);   /* höchstens eine Seite */
      }
      g = null;
    };
    global.addEventListener('pointerup', ende); global.addEventListener('pointercancel', ende);
    global.addEventListener('resize', () => { trackA.set(aktiv * W()); indA.set(indPos(aktiv)); });
    return { gehe, get aktiv() { return aktiv; } };
  }

  global.Moch = { spring, Anim, Zaehlwerk, Zaehler, zieheLinie, Mass, titelWoerter, zeigeTitel, staffel,
    chipDruck, mehr, Bedingt, Toast, kopf, Seiten, fmt, esc, reduziert: rm };
})(window);
