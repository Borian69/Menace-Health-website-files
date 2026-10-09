/* Protein-Rezeptbuch — eine Quelle für zwei Fassungen.
   Online (claude.ai-Artifact): Rezepte, Bewertungen und Favoriten liegen in der
   Artifact-Datenbank; Claude kann Rezepte nach Feedback anpassen.
   Offline (Handy-App): Rezepte sind eingebettet, Bewertungen und Favoriten liegen
   im Speicher des Geräts. Übertragen zwischen beiden per Kopieren und Einfügen.
   tools/bauen.py setzt window.RB_DATEN = {zutaten, regeln, rezepte, stand}. */
(() => {
  const RB = window.RB_DATEN || { zutaten: {}, regeln: {}, rezepte: null, stand: null };
  const S = {
    modus: RB.rezepte ? "lokal" : "online",
    rezepte: [], bewertungen: {}, favoriten: {}, suche: null, empfehlung: null, regeln: RB.regeln,
    q: "", typ: "alle", mahlzeit: "alle", flags: new Set(), sort: "neu", mehrOffen: false,
    aktiv: null, portionen: null, zeigeAbgelehnte: false, geladen: false, dbFehlt: false,
    entwurf: null, meldung: "", anp: null, runde: 0, datenMeldung: "", exportText: "", ausstehend: false,
  };
  let db = null, sample = null, scrollListe = 0, stopp = null;
  const el = document.getElementById("ansicht");
  const LOKAL = "rb-daten-v1";

  try {
    const g = JSON.parse(localStorage.getItem("rb-filter") || "{}");
    if (g.typ) S.typ = g.typ; if (g.sort) S.sort = g.sort; if (g.mahlzeit) S.mahlzeit = g.mahlzeit;
  } catch (e) {}
  const merke = () => { try { localStorage.setItem("rb-filter", JSON.stringify({ typ: S.typ, sort: S.sort, mahlzeit: S.mahlzeit })); } catch (e) {} };

  // ---------- Hilfen ----------
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const zahl = (x, d = 0) => Number(x).toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });
  const N = (x, d = 0) => `<span class="n">${zahl(x, d)}</span>`;
  const euro = x => `${N(x, 2)} €`;
  // Ziffern im Fließtext monospaced setzen (Signatur-Regel 1)
  const nTxt = s => esc(s).replace(/\d+(?:[.,]\d+)*/g, m => `<span class="n">${m}</span>`);
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
  const tageAlt = iso => iso ? (Date.now() - new Date(iso).getTime()) / 864e5 : 999;
  const datum = iso => iso ? new Date(iso).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const kurzDatum = iso => iso ? new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";
  const pressed = b => `aria-pressed="${b ? "true" : "false"}"`;
  const tippt = () => document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
  const URTEILE = { gern: "Sehr gut – wieder kochen", ok: "Okay", nein: "Nicht mein Fall" };
  const zufall = saat => () => { saat |= 0; saat = (saat + 0x6D2B79F5) | 0; let t = Math.imul(saat ^ (saat >>> 15), 1 | saat); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const woche = () => Math.floor(Date.now() / (7 * 864e5));

  // ---------- Nachrechnen und prüfen (dieselbe Logik wie tools/pruefen.py) ----------
  function anzeige(z, gramm) {
    if (gramm === 0) return "nach Bedarf";
    if (z.stueck_g) {
      const n = gramm / z.stueck_g;
      if (Math.abs(n - Math.round(n)) < 0.15 && Math.round(n) >= 1) {
        const [ein, mehr] = z.stueck.split("|"); const k = Math.round(n);
        return `${k} ${k === 1 ? ein : mehr}`;
      }
    }
    return gramm >= 1000 ? `${zahl(gramm / 1000, 2)} kg` : `${zahl(gramm)} g`;
  }
  function rechne(basis, liste) {
    const fehlend = [], zutaten = [];
    const summe = { kcal: 0, p: 0, f: 0, kh: 0, eur: 0 };
    for (const [zid, g0] of liste) {
      const z = RB.zutaten[zid], gramm = Math.max(0, Math.round(Number(g0) || 0));
      if (!z) { fehlend.push(zid); continue; }
      for (const k of ["kcal", "p", "f", "kh"]) summe[k] += z[k] * gramm / 100;
      const preis = z.eur_kg * gramm / 1000;
      summe.eur += preis;
      const alt = basis.zutaten.find(a => a.id === zid && a.gramm === gramm);
      zutaten.push({ id: zid, name: z.name, menge: alt ? alt.menge : anzeige(z, gramm), gramm, laden: z.laden, basic: !!z.basic,
        preis: Math.round(preis * 100) / 100, ...(z.stueck_g ? { stueck_g: z.stueck_g, stueck: z.stueck } : {}) });
    }
    if (fehlend.length) return { fehlend };
    const p = basis.portionen, pro = {};
    for (const k in summe) pro[k] = summe[k] / p;
    pro.eur += S.regeln.basics_pauschale_eur_portion ?? 0.1;
    const r1 = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;
    return { zutaten, werte: {
      kcal: Math.round(pro.kcal), protein: r1(pro.p), fett: r1(pro.f), kh: r1(pro.kh),
      protein_anteil: r1(pro.p * 4 / Math.max(pro.kcal, 1), 3), preis_portion: r1(pro.eur, 2),
      preis_30g_protein: r1(pro.eur / Math.max(pro.p, 0.1) * 30, 2),
      zutaten_anzahl: zutaten.filter(z => !z.basic).length,
      vegetarisch: !zutaten.some(z => RB.zutaten[z.id]?.tier),
    } };
  }
  function pruefe(r, w) {
    const g = S.regeln, gr = [];
    if (w.protein < g.protein_min_g_portion) gr.push(`nur ${zahl(w.protein, 1)} g Protein pro Portion (mind. ${g.protein_min_g_portion})`);
    if (w.protein_anteil < g.protein_anteil_min) gr.push(`Protein nur ${zahl(w.protein_anteil * 100)} % der Kalorien (mind. ${zahl(g.protein_anteil_min * 100)} %)`);
    if (r.arbeitszeit > g.arbeitszeit_max_min) gr.push(`${r.arbeitszeit} min Arbeitszeit (max. ${g.arbeitszeit_max_min})`);
    if (r.gesamtzeit > g.gesamtzeit_max_min) gr.push(`${r.gesamtzeit} min Gesamtzeit (max. ${g.gesamtzeit_max_min})`);
    if (w.zutaten_anzahl > g.zutaten_max) gr.push(`${w.zutaten_anzahl} Zutaten (max. ${g.zutaten_max})`);
    if (r.geraete > g.geraete_max) gr.push(`${r.geraete} Töpfe/Pfannen/Bleche (max. ${g.geraete_max})`);
    if (w.preis_portion > g.preis_portion_max_eur) gr.push(`${zahl(w.preis_portion, 2)} € pro Portion (max. ${zahl(g.preis_portion_max_eur, 2)})`);
    const basis = norm(r.sossenbasis);
    if ((g.sossenbasis_verboten || []).some(v => basis.includes(v))) gr.push(`Soßenbasis „${r.sossenbasis}“ ist nicht erlaubt`);
    if (r.typ === "kalt") for (const f of g.kalt_pflichtfelder || []) if (r.unterwegs?.[f] == null || r.unterwegs?.[f] === "") gr.push(`kaltes Rezept ohne Angabe „${f}“`);
    return gr;
  }

  // ---------- Speicher ----------
  function ladeLokal() {
    try {
      const d = JSON.parse(localStorage.getItem(LOKAL) || "{}");
      S.bewertungen = d.bewertungen || {}; S.favoriten = d.favoriten || {};
    } catch (e) { S.bewertungen = {}; S.favoriten = {}; }
  }
  function speichereLokal() {
    try { localStorage.setItem(LOKAL, JSON.stringify({ bewertungen: S.bewertungen, favoriten: S.favoriten })); return true; }
    catch (e) { return false; }
  }
  async function schreibeBewertung(id, obj) {
    if (S.modus === "online") await db.collection("bewertungen").doc(id).set(obj);
    S.bewertungen = { ...S.bewertungen, [id]: obj };
    if (S.modus === "lokal" && !speichereLokal()) throw { code: "speicher" };
  }
  async function schreibeFavorit(id, an) {
    const neu = { ...S.favoriten };
    if (an) neu[id] = { datum: new Date().toISOString() }; else delete neu[id];
    if (S.modus === "online") { const ref = db.collection("favoriten").doc(id); an ? await ref.set(neu[id]) : await ref.delete(); }
    S.favoriten = neu;
    if (S.modus === "lokal" && !speichereLokal()) throw { code: "speicher" };
  }
  const fehlertext = err => err?.code === "speicher"
    ? "Das Gerät lässt gerade nicht speichern (privates Fenster oder voller Speicher)."
    : err?.code === "invalid_argument" ? "Nur der Besitzer des Rezeptbuchs kann hier speichern."
    : "Speichern hat nicht geklappt. Bitte gleich noch einmal versuchen.";

  // ---------- Vorschläge: passend und mal was Neues ----------
  const schluessel = r => [...new Set([...r.zutaten.filter(z => !z.basic).map(z => "z:" + z.id), ...(r.tags || []).map(t => "t:" + t)])];
  const hauptzutat = r => r.zutaten.filter(z => !z.basic).sort((a, b) => b.gramm * (RB.zutaten[b.id]?.p || 0) - a.gramm * (RB.zutaten[a.id]?.p || 0))[0]?.id;
  function signale() {
    const out = [];
    for (const id in S.favoriten) out.push({ id, w: 3, art: "fav" });
    for (const [id, b] of Object.entries(S.bewertungen)) {
      const w = { gern: 2, ok: 0.5, nein: -3 }[b.urteil];
      if (w) out.push({ id, w, art: b.urteil });
    }
    return out.map(s => ({ ...s, r: S.rezepte.find(r => r.id === s.id) })).filter(s => s.r);
  }
  function vorschlaege() {
    const byId = id => S.rezepte.find(r => r.id === id);
    const e = S.empfehlung;
    if (S.runde === 0 && e && tageAlt(e.datum) <= 8) {
      const liste = [...(e.passend || []).map(x => ({ ...x, art: "passend" })), ...(e.neu || []).map(x => ({ ...x, art: "neu" }))]
        .map(x => ({ ...x, r: byId(x.id) })).filter(x => x.r && S.bewertungen[x.id]?.urteil !== "nein");
      if (liste.length) return { quelle: "claude", liste: liste.slice(0, 4) };
    }
    const rnd = zufall(woche() * 1000 + S.runde * 7 + 1);
    const sig = signale();
    const pool = S.rezepte.filter(r => S.bewertungen[r.id]?.urteil !== "nein" && tageAlt(S.bewertungen[r.id]?.datum) > 10);
    const mische = a => a.map(x => [rnd(), x]).sort((p, q) => p[0] - q[0]).map(x => x[1]);
    if (!sig.length) return { quelle: "start", liste: mische(pool).slice(0, 3).map(r => ({ r, art: "start", grund: "Noch keine Bewertungen. Ein guter Einstieg – sag danach, wie es war." })) };
    const w = {};
    for (const s of sig) for (const k of schluessel(s.r)) w[k] = (w[k] || 0) + s.w;
    const wert = r => { const k = schluessel(r); return k.reduce((a, x) => a + (w[x] || 0), 0) / Math.sqrt(k.length || 1); };
    const passend = [], haupt = new Set();
    for (const { r } of pool.map(r => ({ r, s: wert(r) + rnd() * 0.4 })).filter(x => x.s > 0.2).sort((a, b) => b.s - a.s)) {
      if (passend.length >= 2) break;
      const h = hauptzutat(r);
      if (haupt.has(h)) continue;
      haupt.add(h);
      const ks = new Set(schluessel(r));
      const vorbild = sig.filter(s => s.w > 0 && s.id !== r.id).map(s => ({ s, n: schluessel(s.r).filter(k => ks.has(k)).length })).sort((a, b) => b.n - a.n || b.s.w - a.s.w)[0];
      const grund = vorbild ? (vorbild.s.art === "fav" ? `Ähnlich wie dein Favorit „${vorbild.s.r.titel}“.` : `Weil dir „${vorbild.s.r.titel}“ geschmeckt hat.`) : "Passt zu dem, was dir bisher geschmeckt hat.";
      passend.push({ r, art: "passend", grund });
    }
    const gewaehlt = new Set(passend.map(x => x.r.id));
    const bekannt = new Set(Object.keys(w).filter(k => w[k] > 0));
    const kandidaten = pool.filter(r => !gewaehlt.has(r.id) && !S.bewertungen[r.id] && !S.favoriten[r.id])
      .map(r => ({ r, n: schluessel(r).filter(k => bekannt.has(k)).length })).sort((a, b) => a.n - b.n);
    const neu = [];
    if (kandidaten.length) {
      const fremd = kandidaten.slice(0, Math.max(3, Math.ceil(kandidaten.length * 0.4)));
      const { r } = fremd[Math.floor(rnd() * fremd.length)];
      const anders = r.zutaten.filter(z => !z.basic && !bekannt.has("z:" + z.id)).sort((a, b) => b.gramm - a.gramm).slice(0, 2).map(z => z.name);
      neu.push({ r, art: "neu", grund: anders.length ? `Mal was anderes als sonst: ${anders.join(" und ")}.` : "Noch nicht probiert und anders als deine bisherigen Favoriten." });
    }
    if (!passend.length) passend.push(...mische(pool.filter(r => !neu.some(x => x.r.id === r.id))).slice(0, 2).map(r => ({ r, art: "start", grund: "Zum Ausprobieren." })));
    return { quelle: "lokal", liste: [...passend, ...neu] };
  }

  // ---------- Liste ----------
  const FLAGS = [
    ["fav", "Favoriten", r => !!S.favoriten[r.id]],
    ["veg", "Vegetarisch", r => r.werte.vegetarisch],
    ["schnell", "≤ 10 min Arbeit", r => r.arbeitszeit <= 10],
    ["guenstig", "≤ 2,50 € pro Portion", r => r.werte.preis_portion <= 2.5],
    ["protein", "≥ 45 g Protein", r => r.werte.protein >= 45],
    ["prep", "Meal Prep", r => (r.tags || []).includes("Meal Prep")],
    ["neu", "Neu (14 Tage)", r => tageAlt(r.hinzugefuegt) <= 14 && r.herkunft === "suche"],
  ];
  const SORT = {
    neu: ["Neueste zuerst", (a, b) => (b.hinzugefuegt || "").localeCompare(a.hinzugefuegt || "") || a.titel.localeCompare(b.titel, "de")],
    protein: ["Meiste Protein", (a, b) => b.werte.protein - a.werte.protein],
    preis: ["Günstigste Portion", (a, b) => a.werte.preis_portion - b.werte.preis_portion],
    p30: ["Bestes Preis-Protein", (a, b) => a.werte.preis_30g_protein - b.werte.preis_30g_protein],
    zeit: ["Schnellste", (a, b) => a.gesamtzeit - b.gesamtzeit || a.arbeitszeit - b.arbeitszeit],
  };
  function gefiltert() {
    const terme = norm(S.q).split(/\s+/).filter(Boolean);
    let abgelehnt = 0;
    const liste = S.rezepte.filter(r => {
      if (S.typ !== "alle" && r.typ !== S.typ) return false;
      if (S.mahlzeit !== "alle" && r.mahlzeit !== S.mahlzeit) return false;
      for (const [k, , f] of FLAGS) if (S.flags.has(k) && !f(r)) return false;
      if (terme.length) {
        const heu = norm([r.titel, r.kurz, (r.tags || []).join(" "), r.zutaten.map(z => z.name).join(" "), r.sossenbasis].join(" "));
        if (!terme.every(t => heu.includes(t))) return false;
      }
      if (S.bewertungen[r.id]?.urteil === "nein" && !S.zeigeAbgelehnte) { abgelehnt++; return false; }
      return true;
    });
    liste.sort(SORT[S.sort][1]);
    return { liste, abgelehnt };
  }

  function fuerDich() {
    const { quelle, liste } = vorschlaege();
    if (!liste.length) return "";
    const LB = { passend: "Passt zu dir", neu: "Mal was Neues", start: "Zum Ausprobieren" };
    return `<section class="fuerdich" aria-labelledby="h-fd">
      <div class="kopf"><h2 class="sec" id="h-fd">${quelle === "claude" ? "Von Claude für dich ausgesucht" : "Für dich"}</h2>
        <button class="btn btn-quiet" id="andere">Andere Vorschläge</button></div>
      ${liste.map(x => `<div class="vor"><button data-id="${esc(x.r.id)}">
        <p class="lb">${LB[x.art] || "Für dich"}</p><h3>${esc(x.r.titel)}</h3>
        <p class="grund">${nTxt(x.grund || "")}</p>
        <div class="meta"><span><b>${N(x.r.werte.protein)} g</b> Protein</span><span>${N(x.r.gesamtzeit)} min</span><span>${euro(x.r.werte.preis_portion)}</span></div>
      </button></div>`).join("")}
    </section>`;
  }

  function zeileSuche() {
    if (S.modus === "lokal") return `<p class="dataline"><span>Offline-Fassung</span><span>Stand <b>${esc(kurzDatum(RB.stand))}</b></span><span><b>${N(S.rezepte.length)}</b> Rezepte</span></p>
      <p class="hinweis" style="margin-top:var(--s2)">Diese App funktioniert ganz ohne Netz. Neue Rezepte und Anpassungen aus dem Online-Rezeptbuch kommen mit dem nächsten Update dazu, sobald das Handy einmal online ist.</p>`;
    const s = S.suche;
    const z = !s || !s.letzter_lauf
      ? `<p class="dataline"><span>Suche im Hintergrund</span><span><b>aktiv</b></span>${s?.naechster_lauf ? `<span>Erster Lauf <b>${esc(datum(s.naechster_lauf))}</b></span>` : ""}</p>`
      : `<p class="dataline"><span>Letzte Suche <b>${esc(datum(s.letzter_lauf))}</b></span><span>Geprüft <b>${N(s.geprueft || 0)}</b></span><span>Aufgenommen <b>${N(s.aufgenommen || 0)}</b></span>${s.angepasst ? `<span>Angepasst <b>${N(s.angepasst)}</b></span>` : ""}${s.naechster_lauf ? `<span>Nächste <b>${esc(datum(s.naechster_lauf))}</b></span>` : ""}</p>`;
    return z + `<p class="hinweis" style="margin-top:var(--s2)">Die Suche im Hintergrund prüft neue Rezepte gegen dieselben Regeln, richtet sich nach deinen Bewertungen und passt Rezepte nach deinem Feedback an. Aufgenommen wird nur, was besteht.</p>`;
  }

  function datenBereich() {
    const text = S.modus === "lokal"
      ? "Bewertungen und Favoriten liegen nur auf diesem Handy. Kopiere sie, um sie zu sichern oder ins Online-Rezeptbuch zu übertragen – dort passt Claude die Rezepte nach deinem Feedback an."
      : "Hier überträgst du Bewertungen aus der Offline-App aufs Handy und zurück. Doppelte Einträge werden zusammengeführt, nichts wird überschrieben.";
    return `<details class="mehr daten" ${S.datenOffen ? "open" : ""}><summary>Bewertungen übertragen und sichern</summary>
      <p class="hinweis">${text}</p>
      <div class="reihe"><button class="btn btn-ghost" id="export">Bewertungen kopieren</button></div>
      ${S.exportText ? `<div class="feld"><label for="exporttext">Zum Kopieren markieren</label><textarea id="exporttext" readonly>${esc(S.exportText)}</textarea></div>` : ""}
      <div class="feld"><label for="importtext">Kopierte Bewertungen einfügen</label><textarea id="importtext" placeholder="Text aus der anderen Fassung hier einfügen"></textarea></div>
      <div class="reihe"><button class="btn btn-ghost" id="import">Einfügen und zusammenführen</button></div>
      <p class="hinweis" aria-live="polite">${esc(S.datenMeldung)}</p>
    </details>`;
  }

  function renderListe() {
    const { liste, abgelehnt } = gefiltert();
    const kalt = S.rezepte.filter(r => r.typ === "kalt").length;
    document.getElementById("kopfzeile").innerHTML = `Rezeptbuch · ${N(S.rezepte.length)} Rezepte · davon ${N(kalt)} kalt${S.modus === "lokal" ? " · offline" : ""}`;
    const ruhig = !S.q && S.typ === "alle" && S.mahlzeit === "alle" && !S.flags.size;
    el.innerHTML = `
      ${ruhig ? fuerDich() : ""}
      <div class="search">
        <label for="q">Suchen nach Gericht, Zutat oder Stichwort</label>
        <input type="search" id="q" value="${esc(S.q)}" placeholder="z. B. Hähnchen Reis, Linsen, Frühstück" autocomplete="off">
      </div>
      <div class="chips" role="group" aria-label="Warm oder kalt">
        ${[["alle", "Alle"], ["warm", "Warm"], ["kalt", "Kalt · Uni"]].map(([k, t]) => `<button class="btn btn-ghost" data-typ="${k}" ${pressed(S.typ === k)}>${t}</button>`).join("")}
        <button class="btn btn-ghost" data-flag="fav" ${pressed(S.flags.has("fav"))}>Favoriten${Object.keys(S.favoriten).length ? ` · ${N(Object.keys(S.favoriten).length)}` : ""}</button>
      </div>
      <div class="chips" role="group" aria-label="Mahlzeit">
        ${[["alle", "Jede Mahlzeit"], ["Hauptgericht", "Hauptgericht"], ["Frühstück", "Frühstück"], ["Snack", "Snack"]].map(([k, t]) => `<button class="btn btn-ghost" data-mahlzeit="${k}" ${pressed(S.mahlzeit === k)}>${t}</button>`).join("")}
      </div>
      <details class="mehr" ${S.mehrOffen || [...S.flags].some(f => f !== "fav") ? "open" : ""}><summary>Weitere Filter${[...S.flags].filter(f => f !== "fav").length ? ` · ${N([...S.flags].filter(f => f !== "fav").length)} aktiv` : ""}</summary>
      <div class="chips" role="group" aria-label="Weitere Filter">
        ${FLAGS.filter(([k]) => k !== "fav").map(([k, t]) => `<button class="btn btn-ghost" data-flag="${k}" ${pressed(S.flags.has(k))}>${nTxt(t)}</button>`).join("")}
      </div></details>
      <div class="toolbar">
        <div class="field"><label for="sort">Sortieren</label>
          <select id="sort">${Object.entries(SORT).map(([k, [t]]) => `<option value="${k}" ${S.sort === k ? "selected" : ""}>${t}</option>`).join("")}</select></div>
        <span class="count" aria-live="polite">${N(liste.length)} von ${N(S.rezepte.length)} Rezepten</span>
      </div>
      ${liste.length ? `<ul class="list">${liste.map(karte).join("")}</ul>` : `<div class="leer"><p class="sec">Kein Rezept passt.</p><p class="hinweis" style="margin:0">${S.flags.has("fav") && !Object.keys(S.favoriten).length ? "Du hast noch keine Favoriten. Öffne ein Rezept und tippe auf „Als Favorit merken“." : "Nimm einen Filter heraus oder such nach einer einzelnen Zutat."}</p></div>`}
      ${abgelehnt ? `<p class="hinweis" style="margin-top:var(--s2)">${N(abgelehnt)} ${abgelehnt === 1 ? "Rezept ist" : "Rezepte sind"} als „Nicht mein Fall“ ausgeblendet. <button class="btn btn-quiet" id="zeigeNein" style="padding:0 4px;min-height:44px">Anzeigen</button></p>` : ""}
      ${S.zeigeAbgelehnte ? `<p class="hinweis" style="margin-top:var(--s2)"><button class="btn btn-quiet" id="zeigeNein">Abgelehnte wieder ausblenden</button></p>` : ""}
      <div style="margin-top:var(--s5)">${zeileSuche()}</div>
      ${datenBereich()}`;
  }

  function karte(r) {
    const w = r.werte, b = S.bewertungen[r.id]?.urteil;
    const badges = [
      S.favoriten[r.id] ? `<span class="badge b-brand">✓ Favorit</span>` : "",
      r.typ === "kalt" ? `<span class="badge b-brass">Kalt · Uni</span>` : "",
      w.vegetarisch ? `<span class="badge">Vegetarisch</span>` : "",
      tageAlt(r.hinzugefuegt) <= 14 && r.herkunft === "suche" ? `<span class="badge b-brand">Neu</span>` : "",
      r.anpassungen?.length && r.original ? `<span class="badge">Angepasst</span>` : "",
      b === "nein" ? `<span class="badge">Nicht mein Fall</span>` : "",
    ].join("");
    return `<li class="item"><button data-id="${esc(r.id)}">
      <h3>${esc(r.titel)}</h3>
      <p class="kurz">${nTxt(r.kurz)}</p>
      <div class="meta"><span><b>${N(w.protein)} g</b> Protein</span><span>${N(w.kcal)} kcal</span>
        <span>${N(r.arbeitszeit)} / ${N(r.gesamtzeit)} min</span><span>${euro(w.preis_portion)}</span>
        ${badges ? `<span class="badges">${badges}</span>` : ""}</div>
    </button></li>`;
  }

  // ---------- Rezeptansicht ----------
  function menge(z, f) {
    if (f === 1 || z.gramm === 0) return z.menge;
    const g = z.gramm * f;
    if (z.stueck_g) {
      const n = Math.round((g / z.stueck_g) * 2) / 2;
      if (n >= 0.5) { const [ein, mehr] = z.stueck.split("|"); return `${zahl(n, n % 1 ? 1 : 0)} ${n <= 1 ? ein : mehr}`; }
    }
    const r = g < 20 ? Math.round(g) : g < 100 ? Math.round(g / 5) * 5 : Math.round(g / 10) * 10;
    return r >= 1000 ? `${zahl(r / 1000, 2)} kg` : `${zahl(r)} g`;
  }
  const rang = l => l.startsWith("Aldi") && !l.includes("Haltung") ? 0 : l.includes("Haltung") ? 1 : l === "Metzger" ? 2 : l === "Edeka" ? 3 : l.startsWith("Bio") ? 4 : 9;

  function regelListe(r) {
    const g = S.regeln, w = r.werte;
    const zeilen = [
      ["Protein pro Portion", `${N(w.protein, 1)} g`, `mind. ${N(g.protein_min_g_portion)} g`],
      ["Anteil Protein an den Kalorien", `${N(w.protein_anteil * 100)} %`, `mind. ${N(g.protein_anteil_min * 100)} %`],
      ["Arbeitszeit", `${N(r.arbeitszeit)} min`, `max. ${N(g.arbeitszeit_max_min)} min`],
      ["Gesamtzeit", `${N(r.gesamtzeit)} min`, `max. ${N(g.gesamtzeit_max_min)} min`],
      ["Zutaten ohne Vorrat", `${N(w.zutaten_anzahl)}`, `max. ${N(g.zutaten_max)}`],
      ["Töpfe, Pfannen, Bleche", `${N(r.geraete)}`, `max. ${N(g.geraete_max)}`],
      ["Preis pro Portion", euro(w.preis_portion), `max. ${euro(g.preis_portion_max_eur)}`],
      ["Soßenbasis", esc(r.sossenbasis || "keine Soße"), "nicht Skyr, Quark, Joghurt"],
    ];
    if (r.quelle?.url) zeilen.push(["Bewertung der Quelle", `${N(r.quelle.bewertung, 1)} bei ${N(r.quelle.bewertungen)}`, `mind. ${N(g.bewertung_min, 1)} bei ${N(g.bewertungen_anzahl_min)}`]);
    return `<ul class="check">${zeilen.map(([a, v, l]) => `<li><span class="ok">✓ erfüllt</span><span>${a}: <b>${v}</b></span><span class="lim">${l}</span></li>`).join("")}</ul>`;
  }

  function bewertungsBereich(r) {
    const b = S.bewertungen[r.id], e = S.entwurf?.id === r.id ? S.entwurf : { urteil: null, notiz: "" };
    const verlauf = (b?.verlauf || []).slice().sort((x, y) => (y.datum || "").localeCompare(x.datum || ""));
    let status = "";
    if (b?.antwort) status = `<div class="tipp"><p class="lb">Claude zu deinem Feedback</p><p>${nTxt(b.antwort)}</p></div>`;
    else if (b?.status === "offen") status = `<p class="hinweis">${S.modus === "lokal"
      ? "Dein Feedback ist gespeichert. Angepasst wird das Rezept, sobald du es ins Online-Rezeptbuch überträgst (unten in der Liste: „Bewertungen übertragen“)."
      : sample && !S.sampleAus ? "Dein Feedback ist gespeichert. Du kannst das Rezept jetzt anpassen lassen – oder die Suche im Hintergrund erledigt das am Sonntag." : "Dein Feedback ist gespeichert. Die Suche im Hintergrund passt das Rezept am Sonntag an."}</p>`;
    return `<section class="block" aria-labelledby="h-urt">
      <h2 class="sec" id="h-urt">Wie hat es geschmeckt?</h2>
      <p class="hinweis">Schreib dazu, was dir aufgefallen ist, zum Beispiel: „Sehr lecker, aber der Kreuzkümmel war zu viel.“ Dann wird das Rezept angepasst statt gestrichen.</p>
      <div class="urteil" role="group" aria-label="Urteil">${Object.entries(URTEILE).map(([k, l]) =>
        `<button class="btn btn-ghost" data-urteil="${k}" ${pressed(e.urteil === k)}>${l}</button>`).join("")}</div>
      <div class="feld"><label for="notiz">Dein Feedback (optional)</label>
        <textarea id="notiz" placeholder="Was war gut, was hat dir nicht geschmeckt, was würdest du ändern?">${esc(e.notiz)}</textarea></div>
      <div class="reihe"><button class="btn btn-primary" id="speichern">Bewertung speichern</button></div>
      <p class="hinweis" aria-live="polite" style="margin-top:var(--s1)">${esc(S.meldung)}</p>
      ${status}
      ${verlauf.length ? `<ul class="verlauf">${verlauf.slice(0, 8).map(v => `<li><span class="wann">${esc(kurzDatum(v.datum))}${v.urteil ? " · " + esc(URTEILE[v.urteil]) : ""}</span>${v.notiz ? nTxt(v.notiz) : '<span class="muted">ohne Text</span>'}</li>`).join("")}</ul>` : ""}
    </section>`;
  }

  function anpassBereich(r) {
    if (S.modus !== "online") return "";
    const b = S.bewertungen[r.id], a = S.anp?.id === r.id ? S.anp : null;
    const kannClaude = sample && !S.sampleAus;
    const hatText = (b?.verlauf || []).some(v => v.notiz);
    let inhalt = "";
    if (a?.status === "laeuft") inhalt = `<p>Claude liest dein Feedback und passt das Rezept an. Das dauert meist 20 bis 60 Sekunden.</p><div class="reihe"><button class="btn btn-ghost" id="anpStopp">Abbrechen</button></div>`;
    else if (a?.status === "vorschlag") inhalt = vorschlagAnsicht(r, a);
    else if (a?.status === "keine") inhalt = `<div class="tipp"><p class="lb">Keine Änderung nötig</p><p>${nTxt(a.antwort)}</p></div>`;
    else if (a?.status === "abgelehnt") inhalt = `<p class="fehler">Claudes Vorschlag hat die Prüfung nicht bestanden: ${a.gruende.map(esc).join(" · ")}. Das Rezept bleibt, wie es ist.</p><div class="reihe"><button class="btn btn-ghost" id="anpassen">Noch einmal versuchen</button></div>`;
    else if (a?.status === "fehler") inhalt = `<p class="fehler">${esc(a.text)}</p>${a.nochmal ? `<div class="reihe"><button class="btn btn-ghost" id="anpassen">Noch einmal versuchen</button></div>` : ""}`;
    else if (hatText && kannClaude) inhalt = `<p class="hinweis">Claude liest dein Feedback und schlägt eine geänderte Fassung vor. Du siehst vorher, was sich ändert, und sie wird genauso geprüft wie jedes andere Rezept.</p><div class="reihe"><button class="btn btn-ghost" id="anpassen">Nach meinem Feedback anpassen</button></div>`;
    else if (hatText) inhalt = `<p class="hinweis">Die Suche im Hintergrund passt das Rezept am Sonntag nach deinem Feedback an.</p>`;
    const original = r.original ? `<div class="reihe" style="margin-top:var(--s2)"><button class="btn btn-quiet" id="original">Originalfassung wiederherstellen</button></div>` : "";
    if (!inhalt && !original) return "";
    return `<section class="block" aria-labelledby="h-anp"><h2 class="sec" id="h-anp">Rezept anpassen</h2>${inhalt}${original}</section>`;
  }

  function vorschlagAnsicht(r, a) {
    const alt = new Map(r.zutaten.map(z => [z.id, z])), neu = new Map(a.rezept.zutaten.map(z => [z.id, z]));
    const zeilen = [];
    for (const [id, z] of alt) if (!neu.has(id)) zeilen.push(["raus", `${z.name} (${z.menge})`]);
    for (const [id, z] of neu) if (!alt.has(id)) zeilen.push(["neu", `${z.name} (${z.menge})`]);
    for (const [id, z] of neu) if (alt.has(id) && alt.get(id).gramm !== z.gramm) zeilen.push(["Menge", `${z.name}: ${alt.get(id).gramm} g → ${z.gramm} g`]);
    const w = a.rezept.werte, v = r.werte;
    const delta = (x, y, d = 0, e = "") => `${N(y, d)}${e} <span class="muted">(vorher ${zahl(x, d)}${e})</span>`;
    return `<div class="tipp"><p class="lb">Vorschlag</p><p>${nTxt(a.antwort)}</p></div>
      ${zeilen.length ? `<ul class="diff">${zeilen.map(([k, t]) => `<li><span class="art">${k}</span>${nTxt(t)}</li>`).join("")}</ul>` : `<p class="hinweis">Zutaten bleiben gleich, geändert sind Schritte oder Tipps.</p>`}
      <p class="dataline"><span>Protein <b>${delta(v.protein, w.protein, 0, " g")}</b></span><span>Kcal <b>${delta(v.kcal, w.kcal)}</b></span><span>Portion <b>${delta(v.preis_portion, w.preis_portion, 2, " €")}</b></span></p>
      <details class="mehr" style="margin-top:var(--s2)"><summary>Neue Schritte ansehen</summary><ol class="steps">${a.rezept.schritte.map(s => `<li><span>${nTxt(s)}</span></li>`).join("")}</ol></details>
      <div class="reihe" style="margin-top:var(--s2)"><button class="btn btn-ghost" id="uebernehmen">Änderung übernehmen</button><button class="btn btn-quiet" id="verwerfen">Verwerfen</button></div>`;
  }

  function renderDetail() {
    const r = S.rezepte.find(x => x.id === S.aktiv);
    if (!r) { S.aktiv = null; return renderListe(); }
    const p = S.portionen || r.portionen, f = p / r.portionen, w = r.werte;
    const gruppen = {};
    for (const z of r.zutaten) (gruppen[z.basic ? "Vorrat" : z.laden] ||= []).push(z);
    const reihenfolge = Object.keys(gruppen).sort((a, b) => rang(a) - rang(b));
    const summe = r.zutaten.reduce((s, z) => s + z.preis, 0) * f;
    const t = r.tipps || {}, u = r.unterwegs, fav = !!S.favoriten[r.id];
    const tipp = (lb, txt) => txt ? `<div class="tipp"><p class="lb">${lb}</p><p>${nTxt(txt)}</p></div>` : "";
    const letzte = r.anpassungen?.length ? r.anpassungen[r.anpassungen.length - 1] : null;
    el.innerHTML = `<article class="detail">
      <button class="btn btn-quiet" id="zurueck">← Alle Rezepte</button>
      <p class="eyebrow" style="margin-top:var(--s2)">${r.typ === "kalt" ? "Kalt · Uni" : "Warm"} · ${esc(r.mahlzeit)}${w.vegetarisch ? " · Vegetarisch" : ""}</p>
      <div class="shirt"><h1>${esc(r.titel)}</h1>
        <p class="kern">${N(w.protein)} g Protein pro Portion</p>
        <p>${N(w.protein_anteil * 100)} % der Kalorien · ${euro(w.preis_30g_protein)} je ${N(30)} g Protein</p></div>
      <p class="muted">${nTxt(r.kurz)}</p>
      <div class="reihe" style="margin-bottom:var(--s2)"><button class="btn btn-ghost" id="favorit" ${pressed(fav)}>${fav ? "Favorit" : "Als Favorit merken"}</button></div>
      ${letzte ? tipp(`Angepasst am ${kurzDatum(letzte.datum)}`, letzte.aenderung) : ""}
      <p class="dataline" style="margin-top:var(--s2)"><span><b>${N(w.kcal)}</b> kcal</span><span>Fett <b>${N(w.fett)} g</b></span><span>KH <b>${N(w.kh)} g</b></span>
        <span>Arbeit <b>${N(r.arbeitszeit)} min</b></span><span>Gesamt <b>${N(r.gesamtzeit)} min</b></span><span>Portion <b>${euro(w.preis_portion)}</b></span></p>

      <section class="block" aria-labelledby="h-zut">
        <h2 class="sec" id="h-zut">Einkauf und Zutaten</h2>
        <div class="stepper"><button class="btn btn-ghost" id="minus" aria-label="Eine Portion weniger" ${p <= 1 ? "disabled" : ""}>−</button>
          <output aria-live="polite">${N(p)} ${p === 1 ? "Portion" : "Portionen"}</output>
          <button class="btn btn-ghost" id="plus" aria-label="Eine Portion mehr" ${p >= 12 ? "disabled" : ""}>+</button></div>
        <div class="tbl"><table>
          <thead><tr><th>Menge</th><th>Zutat</th><th class="r">Preis</th></tr></thead>
          <tbody>${reihenfolge.map(l => `<tr class="laden"><th colspan="3">${esc(l)}</th></tr>` + gruppen[l].map(z =>
            `<tr><td class="menge">${nTxt(menge(z, f))}</td><td>${esc(z.name)}</td><td class="r">${z.preis ? euro(z.preis * f) : "–"}</td></tr>`).join("")).join("")}
            <tr><td></td><td class="sum">Zusammen, inkl. ${euro(0.1 * p)} für Gewürze</td><td class="r sum">${euro(summe + 0.1 * p)}</td></tr></tbody>
        </table></div>
        <p class="hinweis" style="margin-top:var(--s1)">Preise sind Richtwerte für Aldi, Edeka, Bio-Markt und Metzger, Stand Oktober <span class="n">2026</span>.</p>
      </section>

      <section class="block" aria-labelledby="h-schr">
        <h2 class="sec" id="h-schr">So geht’s</h2>
        <ol class="steps">${r.schritte.map(s => `<li><span>${nTxt(s)}</span></li>`).join("")}</ol>
      </section>

      <section class="block tipps" aria-labelledby="h-tipp">
        <h2 class="sec" id="h-tipp" style="margin:0">Sparen, abkürzen, aufwerten</h2>
        ${tipp("Günstiger strecken", t.strecken)}
        ${tipp("Fertigprodukte", t.fertig)}
        ${tipp("Proteinpulver (neutral)", t.pulver)}
        ${u ? `<div class="tipp"><p class="lb">Mitnehmen und vorkochen</p><p>Hält <span class="n">${zahl(u.haltbarkeit_tage)}</span> ${u.haltbarkeit_tage === 1 ? "Tag" : "Tage"} im Kühlschrank. ${u.kuehlakku ? "Mit Kühlakku transportieren." : "Kurz ohne Kühlung unproblematisch."} ${nTxt(u.transport)}</p></div>` : ""}
      </section>

      ${bewertungsBereich(r)}
      ${anpassBereich(r)}

      <section class="block" aria-labelledby="h-pr">
        <h2 class="sec" id="h-pr">Geprüft</h2>
        ${regelListe(r)}
        <p class="hinweis" style="margin-top:var(--s2)">${r.quelle?.url
          ? `Quelle: <a href="${esc(r.quelle.url)}" target="_blank" rel="noopener">${esc(r.quelle.name || r.quelle.url)}</a>. In eigenen Worten nacherzählt, Mengen und Werte nachgerechnet.`
          : "Grundstock: von Claude zusammengestellt. Ohne Fremdbewertung – dein Urteil oben zählt."} ${r.hinzugefuegt ? `Aufgenommen am ${esc(datum(r.hinzugefuegt))}.` : ""}</p>
      </section>
    </article>`;
  }

  function render() {
    if (S.dbFehlt) {
      el.innerHTML = `<div class="leer"><p class="sec">Die Rezeptdatenbank ist hier nicht erreichbar.</p><p class="hinweis" style="margin:0">Öffne das Rezeptbuch angemeldet auf claude.ai – oder nutze die Offline-App auf dem Handy.</p></div>`;
      return;
    }
    if (!S.geladen) return;
    if (!S.rezepte.length) {
      el.innerHTML = `<div class="leer"><p class="sec">Noch keine Rezepte.</p><p class="hinweis" style="margin:0">Der Grundstock wird gerade eingespielt.</p></div>`;
      return;
    }
    document.querySelector("header").hidden = !!S.aktiv;
    S.aktiv ? renderDetail() : renderListe();
  }
  // Updates aus der Datenbank warten, solange jemand tippt.
  const sanft = () => { if (tippt()) S.ausstehend = true; else render(); };
  document.addEventListener("focusout", () => setTimeout(() => { if (S.ausstehend && !tippt()) { S.ausstehend = false; render(); } }, 0));

  // ---------- Bewerten ----------
  async function speichern(r) {
    const e = S.entwurf?.id === r.id ? S.entwurf : null;
    const notiz = (document.getElementById("notiz")?.value || "").trim();
    if (!e?.urteil && !notiz) { S.meldung = "Wähle ein Urteil oder schreib ein paar Worte dazu."; return render(); }
    const alt = S.bewertungen[r.id];
    const eintrag = { datum: new Date().toISOString(), urteil: e?.urteil || null, notiz };
    const verlauf = [...(alt?.verlauf || []), eintrag].slice(-20);
    const obj = { titel: r.titel, urteil: e?.urteil || alt?.urteil || null, notiz, datum: eintrag.datum, verlauf,
      status: notiz ? "offen" : (alt?.status || "ohne-text"), ...(notiz ? {} : alt?.antwort ? { antwort: alt.antwort } : {}) };
    try {
      await schreibeBewertung(r.id, obj);
      S.entwurf = null; S.anp = null;
      S.meldung = notiz ? "Gespeichert. Danke – das Feedback fließt in die Anpassung ein." : "Gespeichert.";
    } catch (err) { S.meldung = fehlertext(err); }
    render();
  }

  // ---------- Anpassen mit Claude (nur online) ----------
  const FEHLER_CLAUDE = {
    rate_limited: ["Gerade zu viele Anfragen an Claude. Versuch es in ein paar Minuten noch einmal.", true],
    refused: ["Claude hat diese Anfrage abgelehnt. Formuliere das Feedback etwas anders.", false],
    session_expired: ["Bitte melde dich bei claude.ai neu an.", false],
    invalid_json: ["Claudes Antwort war unvollständig.", true],
    empty_completion: ["Claude hat nichts geantwortet.", true],
    prompt_too_large: ["Das Feedback ist zu lang. Kürze es etwas.", false],
  };
  function anfrage(r, b) {
    const notizen = (b.verlauf || []).filter(v => v.notiz).slice(-5).reverse()
      .map(v => `- ${kurzDatum(v.datum)}${v.urteil ? ` (${URTEILE[v.urteil]})` : ""}: ${v.notiz}`).join("\n");
    const katalog = Object.entries(RB.zutaten).map(([id, z]) => `${id}: ${z.name} (${z.laden})`).join("\n");
    const g = S.regeln;
    const rezept = { titel: r.titel, kurz: r.kurz, typ: r.typ, portionen: r.portionen, arbeitszeit: r.arbeitszeit, gesamtzeit: r.gesamtzeit,
      geraete: r.geraete, sossenbasis: r.sossenbasis, zutaten: r.zutaten.map(z => [z.id, z.gramm]), schritte: r.schritte, tipps: r.tipps };
    return `Du passt ein Rezept aus einem privaten Protein-Rezeptbuch an das Feedback des Kochs an. Er hat es gekocht und schreibt, was ihm aufgefallen ist.

Ziel: Das Gericht bleibt dasselbe, wird aber so geändert, dass das Feedback umgesetzt ist (z. B. eine Zutat ersetzen oder reduzieren, Würzung ändern, Garzeit anpassen). Nicht streichen, verbessern.

Feste Regeln, die das geänderte Rezept weiter erfüllen muss (es wird danach automatisch nachgerechnet):
- mindestens ${g.protein_min_g_portion} g Protein pro Portion und mindestens ${Math.round(g.protein_anteil_min * 100)} % der Kalorien aus Protein
- Arbeitszeit höchstens ${g.arbeitszeit_max_min} min, Gesamtzeit höchstens ${g.gesamtzeit_max_min} min
- höchstens ${g.zutaten_max} Zutaten ohne Vorrat (Öl, Knoblauch, Zitrone, Gewürze zählen nicht), höchstens ${g.geraete_max} Töpfe/Pfannen/Bleche
- höchstens ${String(g.preis_portion_max_eur).replace(".", ",")} € pro Portion
- Soßenbasis nie Skyr, Quark, Joghurt oder Proteinpudding
- Einkauf bei Aldi, sonst Edeka, sonst Bio-Markt; Fleisch vom Metzger, Geflügel Aldi Bio oder Haltungsform 3+

Erlaubte Zutaten (nur diese IDs verwenden):
${katalog}

Rezept (Mengen in Gramm für alle Portionen zusammen):
${JSON.stringify(rezept)}

Feedback, neuestes zuerst:
${notizen}

Antworte nur mit einem JSON-Objekt:
{"aendern": true, "antwort": "1–2 Sätze an den Koch in Du-Form: was du geändert hast und warum", "aenderung": "ein kurzer Satz, was anders ist", "zutaten": [["zutat_id", gramm], ...], "schritte": ["...", "..."], "kurz": "Kurzbeschreibung, nur falls sie sich ändern muss", "sossenbasis": "...", "arbeitszeit": 15, "gesamtzeit": 25, "geraete": 2, "tipps": {"strecken": "...", "fertig": "...", "pulver": null}}
Gib immer die vollständige Zutatenliste und alle Schritte zurück. Schreib Schritte auf Deutsch, kurz, ohne Markennamen.
Braucht das Rezept keine Änderung (z. B. nur Lob), antworte {"aendern": false, "antwort": "1–2 Sätze an den Koch"}.`;
  }
  async function anpassen(r) {
    const b = S.bewertungen[r.id];
    if (!b || !sample) return;
    stopp?.abort(); stopp = new AbortController();
    S.anp = { id: r.id, status: "laeuft" }; render();
    try {
      const v = await sample.json(anfrage(r, b), { signal: stopp.signal, cache: false });
      if (S.anp?.id !== r.id) return;
      if (!v || typeof v !== "object" || typeof v.antwort !== "string") throw { code: "invalid_json" };
      if (!v.aendern) {
        S.anp = { id: r.id, status: "keine", antwort: v.antwort };
        await schreibeBewertung(r.id, { ...b, status: "erledigt", antwort: v.antwort }).catch(() => {});
        return render();
      }
      if (!Array.isArray(v.zutaten) || !Array.isArray(v.schritte) || !v.schritte.length) throw { code: "invalid_json" };
      const zahlOder = (x, y) => Number.isFinite(Number(x)) && Number(x) > 0 ? Math.round(Number(x)) : y;
      const basis = { ...r,
        kurz: typeof v.kurz === "string" && v.kurz.trim() ? v.kurz.trim() : r.kurz,
        schritte: v.schritte.map(String).filter(s => s.trim()),
        sossenbasis: typeof v.sossenbasis === "string" ? v.sossenbasis : r.sossenbasis,
        arbeitszeit: zahlOder(v.arbeitszeit, r.arbeitszeit), gesamtzeit: zahlOder(v.gesamtzeit, r.gesamtzeit),
        geraete: Number.isFinite(Number(v.geraete)) ? Math.round(Number(v.geraete)) : r.geraete,
        tipps: { ...(r.tipps || {}), ...(v.tipps && typeof v.tipps === "object" ? v.tipps : {}) } };
      const liste = v.zutaten.filter(x => Array.isArray(x) && x.length >= 2).map(x => [String(x[0]), Number(x[1])]);
      const erg = rechne(r, liste);
      if (erg.fehlend) { S.anp = { id: r.id, status: "abgelehnt", gruende: [`unbekannte Zutat: ${erg.fehlend.join(", ")}`] }; return render(); }
      const rezept = { ...basis, zutaten: erg.zutaten, werte: erg.werte };
      const gruende = pruefe(rezept, erg.werte);
      S.anp = gruende.length ? { id: r.id, status: "abgelehnt", gruende } : { id: r.id, status: "vorschlag", rezept, antwort: v.antwort, aenderung: String(v.aenderung || v.antwort) };
    } catch (e) {
      if (e?.code === "cancelled") { S.anp = null; return render(); }
      const [text, nochmal] = FEHLER_CLAUDE[e?.code] || (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(e?.code)
        ? (S.sampleAus = true, ["Claude ist für dieses Rezeptbuch nicht freigegeben. Die Suche im Hintergrund passt das Rezept am Sonntag an.", false])
        : ["Die Anpassung hat nicht geklappt.", true]);
      S.anp = { id: r.id, status: "fehler", text, nochmal };
    }
    render();
  }
  async function uebernehmen(r) {
    const a = S.anp; if (!a || a.id !== r.id || a.status !== "vorschlag") return;
    const { id, original, anpassungen, ...rest } = r;
    const b = S.bewertungen[r.id];
    const jetzt = new Date().toISOString();
    const { id: _i, original: _o, anpassungen: _a, ...neu } = a.rezept;
    const doc = { ...neu, original: original || rest,
      anpassungen: [...(anpassungen || []), { datum: jetzt, feedback: b?.notiz || "", aenderung: a.aenderung }] };
    try {
      await db.collection("rezepte").doc(r.id).set(doc);
      if (b) await schreibeBewertung(r.id, { ...b, status: "angepasst", antwort: a.antwort });
      S.anp = null; S.meldung = "Das Rezept ist angepasst.";
    } catch (err) { S.anp = { ...a }; S.meldung = fehlertext(err); }
    render();
  }
  async function originalHerstellen(r) {
    if (!r.original) return;
    const doc = { ...r.original, anpassungen: [...(r.anpassungen || []), { datum: new Date().toISOString(), feedback: "", aenderung: "Originalfassung wiederhergestellt." }] };
    try { await db.collection("rezepte").doc(r.id).set(doc); S.meldung = "Die Originalfassung ist wieder da."; }
    catch (err) { S.meldung = fehlertext(err); }
    render();
  }

  // ---------- Übertragen zwischen Offline-App und Online-Rezeptbuch ----------
  function exportDaten() {
    return JSON.stringify({ format: "rezeptbuch-1", exportiert: new Date().toISOString(), bewertungen: S.bewertungen, favoriten: S.favoriten });
  }
  async function importDaten(text) {
    let d;
    try { d = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)); } catch (e) { d = null; }
    if (!d || d.format !== "rezeptbuch-1") { S.datenMeldung = "Der Text ist kein Export aus dem Rezeptbuch. Kopiere ihn noch einmal vollständig."; return render(); }
    let neuB = 0, neuF = 0;
    try {
      for (const [id, b] of Object.entries(d.bewertungen || {})) {
        if (!S.rezepte.some(r => r.id === id) || !b || typeof b !== "object") continue;
        const alt = S.bewertungen[id];
        const alle = new Map();
        for (const v of [...(alt?.verlauf || []), ...(Array.isArray(b.verlauf) ? b.verlauf : [])]) if (v?.datum) alle.set(v.datum, { datum: String(v.datum), urteil: URTEILE[v.urteil] ? v.urteil : null, notiz: String(v.notiz || "").slice(0, 2000) });
        const verlauf = [...alle.values()].sort((x, y) => x.datum.localeCompare(y.datum)).slice(-20);
        if (alt && verlauf.length === (alt.verlauf || []).length) continue;
        const letzte = verlauf[verlauf.length - 1];
        const neuer = !alt || letzte.datum > (alt.datum || "");
        const obj = { ...(alt || {}), titel: S.rezepte.find(r => r.id === id).titel, verlauf,
          urteil: [...verlauf].reverse().find(v => v.urteil)?.urteil || null,
          notiz: neuer ? letzte.notiz : alt.notiz, datum: neuer ? letzte.datum : alt.datum,
          status: neuer && letzte.notiz ? "offen" : (alt?.status || (letzte.notiz ? "offen" : "ohne-text")) };
        if (neuer && letzte.notiz) delete obj.antwort;
        await schreibeBewertung(id, obj); neuB++;
      }
      for (const [id, f] of Object.entries(d.favoriten || {})) {
        if (S.favoriten[id] || !S.rezepte.some(r => r.id === id)) continue;
        await schreibeFavorit(id, true); neuF++;
      }
      S.datenMeldung = neuB || neuF ? `Übernommen: ${neuB} ${neuB === 1 ? "Bewertung" : "Bewertungen"}, ${neuF} ${neuF === 1 ? "Favorit" : "Favoriten"}.` : "Alles war schon da. Nichts zu übernehmen.";
      const feld = document.getElementById("importtext"); if (feld) feld.value = "";
    } catch (err) { S.datenMeldung = fehlertext(err); }
    render();
  }

  // ---------- Bedienung ----------
  el.addEventListener("click", async e => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.id) { scrollListe = window.scrollY; S.aktiv = t.dataset.id; S.portionen = null; S.meldung = ""; S.entwurf = null; render(); window.scrollTo(0, 0); return; }
    if (t.id === "zurueck") { S.aktiv = null; render(); requestAnimationFrame(() => window.scrollTo(0, scrollListe)); return; }
    if (t.dataset.typ) { S.typ = t.dataset.typ; merke(); return render(); }
    if (t.dataset.mahlzeit) { S.mahlzeit = t.dataset.mahlzeit; merke(); return render(); }
    if (t.dataset.flag) { S.flags.has(t.dataset.flag) ? S.flags.delete(t.dataset.flag) : S.flags.add(t.dataset.flag); return render(); }
    if (t.id === "zeigeNein") { S.zeigeAbgelehnte = !S.zeigeAbgelehnte; return render(); }
    if (t.id === "andere") { S.runde++; return render(); }
    if (t.id === "export") {
      const text = exportDaten();
      try { await navigator.clipboard.writeText(text); S.exportText = ""; S.datenMeldung = "Kopiert. Füge den Text in der anderen Fassung unter „Kopierte Bewertungen einfügen“ ein."; }
      catch (err) { S.exportText = text; S.datenMeldung = "Kopieren ging nicht automatisch. Markiere den Text im Feld und kopiere ihn von Hand."; }
      S.datenOffen = true; render();
      document.getElementById("exporttext")?.select();
      return;
    }
    if (t.id === "import") { S.datenOffen = true; return importDaten(document.getElementById("importtext")?.value || ""); }
    const r = S.rezepte.find(x => x.id === S.aktiv);
    if (!r) return;
    if (t.id === "plus" || t.id === "minus") { S.portionen = Math.max(1, Math.min(12, (S.portionen || r.portionen) + (t.id === "plus" ? 1 : -1))); return render(); }
    if (t.id === "favorit") {
      try { await schreibeFavorit(r.id, !S.favoriten[r.id]); S.meldung = ""; } catch (err) { S.meldung = fehlertext(err); }
      return render();
    }
    if (t.dataset.urteil) {
      const notiz = document.getElementById("notiz")?.value || "";
      const alt = S.entwurf?.id === r.id ? S.entwurf.urteil : null;
      S.entwurf = { id: r.id, urteil: alt === t.dataset.urteil ? null : t.dataset.urteil, notiz };
      S.meldung = ""; return render();
    }
    if (t.id === "speichern") return speichern(r);
    if (t.id === "anpassen") return anpassen(r);
    if (t.id === "anpStopp") { stopp?.abort(); return; }
    if (t.id === "uebernehmen") return uebernehmen(r);
    if (t.id === "verwerfen") { S.anp = null; return render(); }
    if (t.id === "original") return originalHerstellen(r);
  });
  let tippPause;
  el.addEventListener("input", e => {
    if (e.target.id === "notiz") { const r = S.aktiv; S.entwurf = { id: r, urteil: S.entwurf?.id === r ? S.entwurf.urteil : null, notiz: e.target.value }; return; }
    if (e.target.id !== "q") return;
    S.q = e.target.value;
    clearTimeout(tippPause);
    tippPause = setTimeout(() => {
      const pos = e.target.selectionStart;
      render();
      const q = document.getElementById("q");
      if (q) { q.focus(); q.setSelectionRange(pos, pos); }
    }, 120);
  });
  el.addEventListener("change", e => { if (e.target.id === "sort") { S.sort = e.target.value; merke(); render(); } });
  el.addEventListener("toggle", e => {
    if (e.target.matches?.("details.daten")) S.datenOffen = e.target.open;
    else if (e.target.matches?.("details.mehr") && e.target.querySelector("[data-flag]")) S.mehrOffen = e.target.open;
  }, true);

  // ---------- Start ----------
  async function start() {
    if (S.modus === "lokal") {
      S.rezepte = RB.rezepte; ladeLokal(); S.geladen = true; render(); return;
    }
    const anf = window.claude?.use?.("db");
    db = anf ? await anf.catch(() => null) : null;
    if (!db) { S.dbFehlt = true; return render(); }
    const sAnf = window.claude?.use?.("sample");
    sAnf?.then(s => { sample = s || null; if (S.aktiv) sanft(); }).catch(() => {});
    db.collection("rezepte").limit(1000).onSnapshot(snap => {
      S.rezepte = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.werte && r.titel);
      S.geladen = true; sanft();
    }, () => { S.dbFehlt = true; render(); });
    const sammle = (name, ziel) => db.collection(name).onSnapshot(snap => {
      const neu = {}; snap.docs.forEach(d => { neu[d.id] = d.data(); }); S[ziel] = neu; if (S.geladen) sanft();
    }, () => {});
    sammle("bewertungen", "bewertungen");
    sammle("favoriten", "favoriten");
    db.collection("system").onSnapshot(snap => {
      for (const d of snap.docs) {
        if (d.id === "suche") S.suche = d.data();
        if (d.id === "regeln") S.regeln = { ...RB.regeln, ...d.data() };
        if (d.id === "empfehlung") S.empfehlung = d.data();
      }
      if (S.geladen && !S.aktiv) sanft();
    }, () => {});
  }
  start();
})();
