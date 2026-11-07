const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  shy: '\u00ad',
  ndash: '\u2013',
  mdash: '\u2014',
  hyphen: '\u2010',
  lsquo: '\u2018',
  rsquo: '\u2019',
  sbquo: '\u201a',
  ldquo: '\u201c',
  rdquo: '\u201d',
  bdquo: '\u201e',
  hellip: '\u2026',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  middot: '\u00b7',
  bull: '\u2022',
  sect: '\u00a7',
  commat: '@',
  period: '.',
  lpar: '(',
  rpar: ')',
};

// Every pattern on page text is bounded so no input can make it rescan the rest of a 2 MB page per position.
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{1,31});/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

const BLOCK_TAGS: Record<string, true> = Object.fromEntries(
  'p div br hr li ul ol dl dt dd tr td th table thead tbody tfoot section article aside header footer nav main h1 h2 h3 h4 h5 h6 blockquote pre address figure figcaption form fieldset legend label option button'
    .split(' ')
    .map((name) => [name, true]),
);
const SKIPPED_ELEMENTS: Record<string, true> = { script: true, style: true, noscript: true, template: true, svg: true, head: true };

/** Index of the next `</name` at or after `from` (case-insensitive), or -1. */
function findClosingTag(html: string, name: string, from: number): number {
  for (let at = html.indexOf('</', from); at !== -1; at = html.indexOf('</', at + 2)) {
    if (html.slice(at + 2, at + 2 + name.length).toLowerCase() === name) return at;
  }
  return -1;
}

function extractTitle(html: string): string | null {
  const open = html.search(/<title\b[^>]{0,200}>/i);
  if (open === -1) return null;
  const start = html.indexOf('>', open) + 1;
  const end = findClosingTag(html, 'title', start);
  if (end === -1) return null;
  const title = decodeEntities(html.slice(start, Math.min(end, start + 1000)))
    .replace(/\s+/g, ' ')
    .trim();
  return title || null;
}

/** Readable text, the `<title>`, and `mailto:`/`tel:` link targets from an HTML document. Linear time. */
export function htmlToPage(html: string): { title: string | null; text: string; linkedContacts: string[] } {
  const linkedContacts: string[] = [];
  for (const match of html.matchAll(/href\s{0,10}=\s{0,10}["']\s{0,10}(mailto|tel):([^"'?\s<>]{1,254})/gi)) {
    try {
      linkedContacts.push(decodeURIComponent(decodeEntities(match[2])).trim());
    } catch {
      linkedContacts.push(decodeEntities(match[2]).trim());
    }
  }

  const parts: string[] = [];
  let at = 0;
  while (at < html.length) {
    const open = html.indexOf('<', at);
    if (open === -1) {
      parts.push(html.slice(at));
      break;
    }
    parts.push(html.slice(at, open));
    if (html.startsWith('<!--', open)) {
      const end = html.indexOf('-->', open + 4);
      if (end === -1) break; // an unclosed comment hides the rest, as in a browser
      parts.push(' ');
      at = end + 3;
      continue;
    }
    if (html[open + 1] === '!' || html[open + 1] === '?') {
      const end = html.indexOf('>', open + 2); // <!DOCTYPE ...>, <![CDATA[...]]>, <?xml ...?>
      if (end === -1) break;
      parts.push(' ');
      at = end + 1;
      continue;
    }
    // Name first: a stray "<" must not trigger a search for ">" that could run to the end of the page every time.
    const closing = html[open + 1] === '/';
    const name = (html.slice(open + (closing ? 2 : 1), open + 40).match(/^[a-z][a-z0-9-]*/i)?.[0] ?? '').toLowerCase();
    if (!name) {
      parts.push('<'); // "a < b": not a tag
      at = open + 1;
      continue;
    }
    const close = html.indexOf('>', open + 1);
    if (close === -1) break; // an unfinished tag hides the rest, as in a browser
    at = close + 1;
    if (!closing && SKIPPED_ELEMENTS[name]) {
      const end = findClosingTag(html, name, at);
      if (end === -1) break;
      const endClose = html.indexOf('>', end);
      at = endClose === -1 ? html.length : endClose + 1;
      parts.push(' ');
      continue;
    }
    parts.push(BLOCK_TAGS[name] ? '\n' : ' ');
  }

  const text = decodeEntities(parts.join(''))
    .replace(/[ \t\f\v\r\u00a0]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  return { title: extractTitle(html), text, linkedContacts };
}

/**
 * Folds the differences that don't change the words: whitespace, non-breaking spaces, soft hyphens,
 * zero-width characters, curly quotes, dash variants, and case.
 */
export function normalizeForMatch(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[\u2018\u2019\u201a\u201b\u2032\u02bc]/g, "'")
    .replace(/[\u201c\u201d\u201e\u201f\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
