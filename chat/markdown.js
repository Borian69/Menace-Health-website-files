/* Markdown → HTML für die Antworten des Modells.

   Bewusst klein und ohne Bibliothek: Absätze, Überschriften, fett,
   kursiv, durchgestrichen, Code, Codeblöcke, Listen (auch
   verschachtelt), Zitate, Tabellen, Trennlinien und Links.

   Sicherheit: Jeder Text wird maskiert, bevor Tags dazukommen. Die
   einzigen Tags im Ergebnis sind die, die dieser Code selbst schreibt;
   Links gehen nur auf http(s). So kann eine Antwort kein eigenes HTML
   oder Skript in die Seite bringen. */

'use strict';

const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^ {0,3}([-*_])( *\1){2,} *$/;
const QUOTE = /^ {0,3}>/;
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function esc(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const indentOf = (line) => line.length - line.trimStart().length;

function nextFilled(lines, i) {
  while (i < lines.length && !lines[i].trim()) i++;
  return i < lines.length ? i : -1;
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length
    && lines[i + 1].includes('|') && TABLE_SEP.test(lines[i + 1]);
}

/** Beginnt in dieser Zeile ein neuer Block (beendet also einen Absatz)? */
function startsBlock(lines, i) {
  const line = lines[i];
  return FENCE.test(line) || HEADING.test(line) || RULE.test(line)
    || QUOTE.test(line) || LIST_ITEM.test(line) || isTableStart(lines, i);
}

/* ── Inline: fett, kursiv, Code, Links ───────────────────── */

function inline(text) {
  // Code und Links zuerst herausnehmen, damit darin nichts umgesetzt
  // wird — ein Unterstrich in einer URL ist kein Kursivbeginn.
  const saved = [];
  const keep = (html) => `\u0000${saved.push(html) - 1}\u0000`;
  const link = (url, label) => keep(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`);

  let s = text
    .replace(/(`+)([\s\S]+?)\1/g, (_, __, code) => keep(`<code>${esc(code.trim())}</code>`))
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => link(url, inline(label)))
    .replace(/https?:\/\/[^\s<>()]*[^\s<>().,:;!?"'*_~]/g, (url) => link(url, esc(url)));

  s = esc(s)
    .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<strong>$2</strong>')
    .replace(/\*(?=[^\s*])([^*\n]*?[^\s*])\*/g, '<em>$1</em>')
    .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_\n]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<em>$2</em>')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
    .replace(/\n/g, '<br>');

  return s.replace(/\u0000(\d+)\u0000/g, (_, n) => saved[n]);
}

/* ── Blöcke ──────────────────────────────────────────────── */

function cells(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function table(lines, i) {
  const head = cells(lines[i]);
  const align = cells(lines[i + 1]).map((c) => {
    if (c.startsWith(':') && c.endsWith(':')) return ' style="text-align:center"';
    if (c.endsWith(':')) return ' style="text-align:right"';
    return '';
  });
  i += 2;

  // Reine Zahlen (auch mit Einheit wie % oder €) stehen tabellarisch.
  const NUMBER = /^[-+−]?[\d.,\s%€$:/]*\d[\d.,\s%€$:/]*$/;
  const cell = (tag, text, k) => {
    const html = inline(text || '');
    return `<${tag}${align[k] || ''}>${NUMBER.test(text || '') ? `<span class="n">${html}</span>` : html}</${tag}>`;
  };
  let body = '';
  while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
    const row = cells(lines[i++]);
    body += `<tr>${head.map((_, k) => cell('td', row[k], k)).join('')}</tr>`;
  }
  const html = `<div class="md-tabelle"><table><thead><tr>${head.map((h, k) => cell('th', h, k)).join('')}</tr></thead>`
    + `<tbody>${body}</tbody></table></div>`;
  return { html, next: i };
}

/* Eine Liste samt Unterpunkten. Was tiefer eingerückt ist als der
   Spiegelstrich, gehört zum Punkt darüber und wird als eigener
   Markdown-Text gelesen — so entstehen verschachtelte Listen und
   Codeblöcke innerhalb eines Punkts von selbst. */
function list(lines, i) {
  const first = lines[i].match(LIST_ITEM);
  const indent = first[1].length;
  const ordered = /\d/.test(first[2]);
  const start = ordered ? parseInt(first[2], 10) : 1;
  let items = '';

  for (;;) {
    const m = lines[i].match(LIST_ITEM);
    const content = m[1].length + m[2].length + Math.max(m[3].length, 1);
    const body = [m[4]];
    i++;

    while (i < lines.length) {
      const line = lines[i];
      if (line.trim()) {
        if (indentOf(line) < indent + 2) break;
        body.push(line.slice(Math.min(indentOf(line), content)));
      } else {
        const n = nextFilled(lines, i);
        if (n === -1 || indentOf(lines[n]) < indent + 2) break;
        body.push('');
      }
      i++;
    }
    items += `<li>${blocks(body)}</li>`;

    const n = nextFilled(lines, i);
    const next = n !== -1 && lines[n].match(LIST_ITEM);
    if (!next || /\d/.test(next[2]) !== ordered) break;
    i = n;
  }

  const html = ordered
    ? `<ol${start !== 1 ? ` start="${start}"` : ''}>${items}</ol>`
    : `<ul>${items}</ul>`;
  return { html, next: i };
}

function blocks(lines) {
  let out = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let m;

    if (!line.trim()) { i++; continue; }

    if ((m = line.match(FENCE))) {
      const fence = m[1];
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith(fence)) code.push(lines[i++]);
      i++;   // schließender Zaun; fehlt er noch (Antwort läuft), ist das egal
      out += `<pre><code>${esc(code.join('\n'))}</code></pre>`;
      continue;
    }

    if ((m = line.match(HEADING))) {
      // # und ## werden h3, alles darunter h4. h1/h2 des Design-Systems
      // (Instrument Serif, 36–72 px) sind innerhalb einer Antwort zu laut.
      const level = m[1].length <= 2 ? 3 : 4;
      out += `<h${level}>${inline(m[2])}</h${level}>`;
      i++;
      continue;
    }

    if (RULE.test(line)) { out += '<hr>'; i++; continue; }

    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) inner.push(lines[i++].replace(/^ {0,3}> ?/, ''));
      out += `<blockquote>${blocks(inner)}</blockquote>`;
      continue;
    }

    if (isTableStart(lines, i)) {
      const t = table(lines, i);
      out += t.html;
      i = t.next;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const l = list(lines, i);
      out += l.html;
      i = l.next;
      continue;
    }

    const para = [lines[i++].trim()];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines, i)) para.push(lines[i++].trim());
    out += `<p>${inline(para.join('\n'))}</p>`;
  }
  return out;
}

/** Markdown-Text → sicheres HTML. */
function renderMarkdown(text) {
  const lines = String(text)
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .split('\n');
  return blocks(lines);
}
