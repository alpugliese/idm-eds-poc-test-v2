import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Tile Mosaic
 *
 * Contratto di authoring (tabella in DA): una riga per tile.
 * | Tile Mosaic |                                                  |
 * | (immagine)  | ## Titolo  + [Testo del link](/percorso)         |
 * |             | ## Titolo solo testo + paragrafo (tile "testo")  |
 *
 * Colonna 1 (facoltativa): immagine. Colonna 2: titolo, testo e/o link.
 * Layout pensato per 6 tile (come il componente AEM type-grid-6).
 */

function buildTile(row) {
  const [media, body] = row.children;
  const li = document.createElement('li');
  const img = media?.querySelector('img');

  if (img) {
    li.className = 'tile tile-image';
    const picture = createOptimizedPicture(img.src, img.alt, false, [
      { media: '(min-width: 960px)', width: '1000' },
      { width: '750' },
    ]);
    media.replaceChildren(picture);
    media.className = 'tile-media';
    li.append(media);
  } else {
    li.className = 'tile tile-text';
  }

  if (body) {
    body.className = 'tile-body';
    // il boilerplate può aver già decorato il link come .button
    const link = body.querySelector('a');
    if (link) {
      link.className = 'tile-button';
      link.removeAttribute('title');
      link.closest('p')?.setAttribute('class', 'tile-button-wrapper');
      link.prepend(Object.assign(document.createElement('span'), {
        className: 'tile-arrow',
        ariaHidden: 'true',
      }));
    }
    li.append(body);
  }
  return li;
}

export default function decorate(block) {
  const ul = document.createElement('ul');
  ul.append(...[...block.children].map(buildTile));
  block.replaceChildren(ul);
}
