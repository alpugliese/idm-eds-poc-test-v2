/**
 * Article Layout
 *
 * Migrazione del componente AEM idm/components/common/article-layout.
 *
 * Contratto di authoring (tabella in DA). Due modi equivalenti:
 *  a) una riga, due celle: testo | media;
 *  b) una riga per elemento (titolo, paragrafo, ...) in colonna 1; il media in colonna 2.
 * | Article Layout (varianti)                                         |
 * | Colonna 1: testo                        | Colonna 2: media (facoltativa) |
 *   - logo (facoltativo): immagine da sola, PRIMA del titolo
 *   - titolo (h1-h6)
 *   - hashtag (facoltativi): paragrafo di soli #tag
 *   - intro: il primo paragrafo dopo il titolo, SOLO con la variante has-intro
 *   - testo: tutto il resto
 *   - CTA (facoltativa): ultimo paragrafo, un solo link
 *
 * Senza media = layout solo testo (typeLayout 2). Con media = testo + media (typeLayout 3).
 *
 * Varianti (nel nome del blocco): has-intro, media-left, text-33, text-66,
 * columns-2, vertical, logo-square.
 * Solo testo: a tutta larghezza; con text-66 occupa 8 colonne su 12 (typeText type1).
 */

const HEADING = 'h1, h2, h3, h4, h5, h6';
const LINK = ':scope > a, :scope > strong > a, :scope > em > a';

function isLogo(el) {
  return el.tagName === 'P' && !!el.querySelector('picture') && !el.textContent.trim();
}

function isHashtagLine(el) {
  return el.tagName === 'P' && /^(#[\p{L}\p{N}_-]+\s*)+$/u.test(el.textContent.trim());
}

function isCta(el) {
  if (!el || el.tagName !== 'P') return false;
  const link = el.querySelector(LINK);
  return !!link && el.textContent.trim() === link.textContent.trim();
}

function decorateText(cell) {
  const items = [...cell.children];
  const headingIndex = items.findIndex((el) => el.matches(HEADING));
  const cta = isCta(items.at(-1)) ? items.at(-1) : null;
  const body = document.createElement('div');
  body.className = 'article-layout-body';
  // l'intro esiste solo con la variante has-intro (nell'originale e' un campo a parte)
  let hasIntro = !cell.closest('.article-layout')?.classList.contains('has-intro');

  items.forEach((el, i) => {
    if (el === cta) {
      el.classList.add('article-layout-cta');
      const link = el.querySelector('a');
      // se decorateButtons non l'ha gia' fatto (link non in grassetto/corsivo)
      if (!link.classList.contains('button')) link.className = 'button primary';
    } else if (isLogo(el) && (headingIndex === -1 || i < headingIndex)) {
      el.classList.add('article-layout-logo');
    } else if (el.matches(HEADING)) {
      el.classList.add('article-layout-title');
    } else if (isHashtagLine(el)) {
      el.classList.add('article-layout-hashtags');
    } else if (!hasIntro && i > headingIndex && el.tagName === 'P') {
      el.classList.add('article-layout-intro');
      hasIntro = true;
    } else {
      body.append(el);
    }
  });

  if (body.children.length) {
    if (cta) cell.insertBefore(body, cta);
    else cell.append(body);
  }
}

export default function decorate(block) {
  const text = document.createElement('div');
  text.className = 'article-layout-text';
  let media = null;

  // la colonna 1 di ogni riga e' testo; la colonna 2 (prima non vuota) e' il media.
  // Funziona sia con una riga a 2 celle, sia con una riga per elemento.
  [...block.children].forEach((row) => {
    const [first, second] = row.children;
    if (first) text.append(...first.childNodes);
    const hasMedia = second && (second.querySelector('picture, img, video') || second.textContent.trim());
    if (hasMedia && !media) {
      media = second;
      media.className = 'article-layout-media';
    }
  });

  decorateText(text);

  if (media) {
    block.replaceChildren(text, media);
  } else {
    block.classList.add('text-only');
    block.replaceChildren(text);
  }
}
