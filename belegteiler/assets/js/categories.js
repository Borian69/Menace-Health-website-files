/* Kategorien in fester Reihenfolge — sie bestimmt auch die Sortierung
   in der Review-Ansicht und auf der fertigen Übersicht. */

export const CATEGORIES = [
  { id: 'obst_gemuese',  label: 'Obst & Gemüse',        color: '#6FCF6A' },
  { id: 'brot',          label: 'Brot & Backwaren',     color: '#D9A15B' },
  { id: 'molkerei',      label: 'Milch & Käse',         color: '#EBE3C4' },
  { id: 'fleisch_fisch', label: 'Fleisch & Fisch',      color: '#E07A6B' },
  { id: 'tiefkuehl',     label: 'Tiefkühl',             color: '#7FC4E8' },
  { id: 'vorrat',        label: 'Vorrat & Konserven',   color: '#C9A87C' },
  { id: 'suesses',       label: 'Süßes & Snacks',       color: '#D68FC0' },
  { id: 'getraenke',     label: 'Getränke',             color: '#5EC8C0' },
  { id: 'pfand',         label: 'Pfand & Leergut',      color: '#9BA7A2' },
  { id: 'drogerie',      label: 'Drogerie & Gesundheit',color: '#9C8FE0' },
  { id: 'haushalt',      label: 'Haushalt',             color: '#8FA0AC' },
  { id: 'tier',          label: 'Tierbedarf',           color: '#C7B48F' },
  { id: 'rabatt',        label: 'Rabatte',              color: '#0BBE6E' },
  { id: 'sonstiges',     label: 'Sonstiges',            color: '#7C8A85' },
];

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

export const category = (id) => BY_ID.get(id) || BY_ID.get('sonstiges');

export const categoryIds = CATEGORIES.map((category) => category.id);

/** Reihenfolge-Index für die Sortierung. */
export const categoryRank = (id) => {
  const index = categoryIds.indexOf(id);
  return index === -1 ? categoryIds.length : index;
};

/* Notfall-Zuordnung: greift nur, wenn die Erkennung keine oder eine
   unbekannte Kategorie geliefert hat. */
const KEYWORDS = [
  ['pfand',         /pfand|leergut|einweg|mehrweg/i],
  ['rabatt',        /rabatt|nachlass|coupon|gutschein|treue|aktion\s*-|preisvorteil/i],
  ['getraenke',     /wasser|cola|limo|saft|schorle|bier|wein|sekt|kaffee|tee|espresso|energy|spezi|nektar|drink/i],
  ['obst_gemuese',  /apfel|äpfel|banane|tomate|gurke|salat|zwiebel|kartoffel|karotte|möhre|paprika|zitrone|orange|beere|traube|avocado|brokkoli|spinat|pilz|birne|melone|mango|kiwi|lauch|kohl|zucchini|aubergine/i],
  ['brot',          /brot|brötchen|semmel|baguette|toast|croissant|brezel|kuchen|gebäck|knäcke/i],
  ['molkerei',      /milch|joghurt|jogurt|käse|quark|butter|sahne|schmand|frischkäse|gouda|mozzarella|skyr|pudding/i],
  ['fleisch_fisch', /hähnchen|hackfleisch|schnitzel|wurst|salami|schinken|steak|rind|schwein|pute|lachs|thunfisch|fisch|garnele|aufschnitt|bratwurst/i],
  ['tiefkuehl',     /tiefkühl|tk\b|pizza|eiscreme|speiseeis|pommes/i],
  ['suesses',       /schokolade|schoko|keks|chips|bonbon|riegel|gummi|nuss|nüsse|süß|snack|waffel|popcorn|salzstange/i],
  ['drogerie',      /shampoo|duschgel|zahnpasta|zahnbürste|deo|creme|windel|binden|tampon|rasier|apotheke|vitamin|tablette|pflaster|seife/i],
  ['haushalt',      /spülmittel|waschmittel|weichspüler|reiniger|müllbeutel|klopapier|toilettenpapier|küchenrolle|schwamm|batterie|kerze|alufolie|frischhalte/i],
  ['tier',          /katze|hunde|hund\b|tierfutter|whiskas|katzenstreu|leckerli/i],
  ['vorrat',        /nudel|pasta|reis|mehl|zucker|salz|öl|essig|konserve|dose|soße|sauce|ketchup|senf|honig|marmelade|müsli|cornflakes|gewürz|brühe/i],
];

export function guessCategory(name = '') {
  for (const [id, pattern] of KEYWORDS) {
    if (pattern.test(name)) return id;
  }
  return 'sonstiges';
}

export function normaliseCategory(id, name) {
  // "sonstiges" gilt als „nicht zugeordnet“ — dann greift noch die
  // Stichwortsuche, bevor die Position im Sammelbecken landet.
  if (id && BY_ID.has(id) && id !== 'sonstiges') return id;
  return guessCategory(name);
}
