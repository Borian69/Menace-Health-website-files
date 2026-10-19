/* Walzwerk: das Zählwerk des Systems für Text mit Trennern — „7:30“
   oder „84,2“.

   Moch.Zaehlwerk nimmt nur ganze Zahlen und setzt selbst Tausenderpunkte.
   Eine Uhr braucht den Doppelpunkt und eine Zehnersekunde, die nach 5 auf
   0 rollt, nicht nach 9. Markup (.zw .ziffer .punkt) und Feder (Moch.Anim)
   sind die des Systems. Neu ist nur, dass jede Walze ihre Basis kennt und
   den kurzen Weg nimmt: Beim Herunterzählen ist 0 → 9 ein Schritt
   rückwärts, keine ganze Umdrehung. Dafür trägt jede Walze ihre Ziffern
   zweimal; beim Überlauf springt sie unsichtbar um eine Länge. */

const formVon = (text) => text.replace(/\d/g, '0');

export function Walzwerk(ziel, M) {
  let walzen = [];
  let muster = null;

  /* Screenreader lesen den Wert als Text; die Walzen sind Bild. */
  const vorlesen = document.createElement('span');
  vorlesen.className = 'sr';

  const sichtbar = () => walzen
    .map(({ basis, anim }) => String(((Math.round(anim.value) % basis) + basis) % basis))
    .join('');

  function baue(text, alt) {
    ziel.textContent = '';
    walzen = [];
    muster = formVon(text);
    const anzahl = text.replace(/\D/g, '').length;
    const start = alt.padStart(anzahl, '0').slice(-anzahl);
    let k = 0;
    [...text].forEach((zeichen, i) => {
      if (!/\d/.test(zeichen)) {
        const punkt = document.createElement('span');
        punkt.className = 'punkt';
        punkt.setAttribute('aria-hidden', 'true');
        punkt.textContent = zeichen;
        ziel.appendChild(punkt);
        return;
      }
      const basis = text[i - 1] === ':' ? 6 : 10;   // Zehnersekunde
      const ziffer = document.createElement('span');
      ziffer.className = 'ziffer';
      ziffer.setAttribute('aria-hidden', 'true');
      const saeule = document.createElement('span');
      for (let j = 0; j < basis * 2; j += 1) {
        const d = document.createElement('i');
        d.textContent = j % basis;
        saeule.appendChild(d);
      }
      ziffer.appendChild(saeule);
      ziel.appendChild(ziffer);
      const anfang = Math.min(Number(start[k]) || 0, basis - 1);
      k += 1;
      walzen.push({ basis, anim: M.Anim((v) => { saeule.style.transform = `translateY(${-v}em)`; }, anfang) });
    });
    ziel.appendChild(vorlesen);
  }

  return {
    /** Rollt auf den neuen Text. Ändert sich die Form (9:59 → 10:00),
        wird neu gebaut — am sichtbaren Wert, nicht bei null. */
    zeige(text, { T = 0.55, stagger = 45 } = {}) {
      if (formVon(text) !== muster) baue(text, muster === null ? '' : sichtbar());
      vorlesen.textContent = text;
      const ziffern = text.replace(/\D/g, '');
      walzen.forEach((walze, i) => {
        const { basis, anim } = walze;
        const jetzt = Math.round(anim.value);
        const von = ((jetzt % basis) + basis) % basis;
        let schritt = (((Number(ziffern[i]) - von) % basis) + basis) % basis;
        if (schritt > basis / 2) schritt -= basis;
        let nach = jetzt + schritt;
        if (nach < 0) { anim.set(anim.value + basis); nach += basis; }
        else if (nach > basis * 2 - 1) { anim.set(anim.value - basis); nach -= basis; }
        if (nach === anim.value) return;
        anim.to(nach, { z: 1, T, delay: i * stagger });
      });
    },
  };
}
