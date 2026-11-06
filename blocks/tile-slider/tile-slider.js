import ICONS from './icons.js';
import DEFAULT_I18N from './i18n.js';

/**
 * Tile Slider (alloggi)
 *
 * Migrazione del componente AEM idm/components/custom-components/tile-slider.
 * Le tile non sono authored: arrivano da una query a {apimBaseUrl}/digital-backend/algolia/search,
 * composta con i filtri scritti dall'editore nella tabella del blocco.
 *
 * Contratto di authoring (una riga per voce, prima colonna = chiave):
 * | Tile Slider |                                                                   |
 * | headline    | Titolo (anche come Titolo 2/3 di DA)                              |
 * | subtitle    | Sottotitolo                                                       |
 * | filter      | location | ID1, ID2          (filtro comune a tutte le tab, max 2)  |
 * | tab         | Nome tab | tipo filtro | valori (terzo filtro, uno per tab)         |
 * | editorial   | Nome tab | titolo | immagine | alt | testo bottone | link          |
 * | sort        | random | default                                                  |
 * | min tiles   | 1-5                                                               |
 * | button label| testo del bottone delle card                                      |
 * | cta         | link sotto lo slider                                              |
 * | language    | it | en | de   (solo se non e' deducibile dal percorso)            |
 * | anchor      | id HTML del blocco                                                |
 *
 * Configurazioni tecniche (foglio /configs.json) e testi (foglio /{lingua}/placeholders.json):
 * vedi README del blocco.
 */

const HITS_PER_PAGE = 5;
const EDITORIAL_MIN_TOTAL = 5;
const SEARCH_PATH = '/digital-backend/algolia/search';
const REQUEST_TIMEOUT = 15000;
const ALLOWED_INDEX_LANGUAGES = ['de', 'it', 'en'];
const TRUSTYOU_KEY = '0806c986-73a8-40ff-a374-f8218f57d6d2';
const RANDOM_VALUES_KEY = 'tile-slider-random-values';
const DAM_PREFIX = '/content/dam/idm/';
const MOBILE = window.matchMedia('(max-width: 767px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const SVG_NS = 'http://www.w3.org/2000/svg';

const DEFAULT_CONFIG = {
  apimBaseUrl: '',
  algoliaIndexEnv: 'prod',
  winterDateFrom: '',
  winterDateTo: '',
  randomValues: '',
  assetBaseUrl: 'https://www.suedtirol.info',
  renditionCard: '/jcr:content/renditions/web-rendition-5.webp',
  renditionLarge: '/jcr:content/renditions/web-rendition-5.webp',
  defaultLanguage: 'it',
};

/* ---------------------------------- utilita' ---------------------------------- */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value === undefined || value === null || value === false) return;
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.flat().filter((child) => child !== null && child !== undefined));
  return node;
}

function icon(name, className = '') {
  const { w, d } = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} 1024`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `tile-slider-icon ${className}`.trim());
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

async function fetchJson(url) {
  try {
    const resp = await fetch(url);
    return resp.ok ? await resp.json() : null;
  } catch (e) {
    return null;
  }
}

/** Righe di un foglio EDS (singolo o multi-foglio) con le chiavi delle colonne in minuscolo. */
function sheetRows(json) {
  const data = json?.data || json?.default?.data || [];
  return data.map((row) => Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), String(value).trim()]),
  ));
}

let configPromise;
function loadConfig() {
  if (!configPromise) {
    configPromise = fetchJson('/configs.json').then((json) => {
      const config = { ...DEFAULT_CONFIG };
      sheetRows(json).forEach(({ key, value }) => {
        if (key && value) config[key] = value;
      });
      config.apimBaseUrl = config.apimBaseUrl.replace(/\/+$/, '');
      config.assetBaseUrl = config.assetBaseUrl.replace(/\/+$/, '');
      return config;
    });
  }
  return configPromise;
}

const i18nPromises = {};
function loadI18n(lang) {
  if (!i18nPromises[lang]) {
    i18nPromises[lang] = (async () => {
      const dict = { ...(DEFAULT_I18N[lang] || DEFAULT_I18N.en) };
      const json = (await fetchJson(`/${lang}/placeholders.json`))
        || (await fetchJson('/placeholders.json'));
      sheetRows(json).forEach(({ key, text }) => {
        if (key && text) dict[key] = text;
      });
      return dict;
    })();
  }
  return i18nPromises[lang];
}

function resolveLanguage(override, config) {
  const segment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  if (override) return override;
  if (/^[a-z]{2}$/.test(segment)) return segment;
  return config.defaultLanguage;
}

/** Data ISO (anche senza anno) -> mese*100+giorno; l'anno non conta. */
function monthDay(value) {
  const match = /(?:\d{4}-)?(\d{2})-(\d{2})/.exec(value || '');
  return match ? Number(match[1]) * 100 + Number(match[2]) : null;
}

function currentSeason(config, now = new Date()) {
  const from = monthDay(config.winterDateFrom);
  const to = monthDay(config.winterDateTo);
  if (from === null || to === null) return 'summer';
  const today = (now.getMonth() + 1) * 100 + now.getDate();
  const inWinter = from <= to ? today >= from && today <= to : today >= from || today <= to;
  return inWinter ? 'winter' : 'summer';
}

function randomValueFilters(config) {
  let values = '';
  try {
    values = sessionStorage.getItem(RANDOM_VALUES_KEY) || '';
  } catch (e) {
    // sessionStorage non disponibile
  }
  values = values || config.randomValues;
  if (!values) return [];
  try {
    sessionStorage.setItem(RANDOM_VALUES_KEY, values);
  } catch (e) {
    // sessionStorage non disponibile
  }
  return values.split('-').map((value, index) => `randomValue:${value}<score=${100 - index}>`);
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function damUrl(src, config, rendition) {
  if (!src) return '';
  return src.startsWith(DAM_PREFIX) ? `${config.assetBaseUrl}${src}${rendition}` : src;
}

/* ------------------------------ lettura della tabella ------------------------------ */

const FILTER_NAMES = {
  location: 'location',
  type: 'type',
  accommodationtype: 'type',
  accotype: 'type',
  accotypeid: 'type',
  hasapartment: 'hasApartment',
  apartment: 'hasApartment',
  feature: 'features',
  features: 'features',
  badge: 'badges',
  badges: 'badges',
  theme: 'themes',
  themes: 'themes',
  odhtag: 'odhTags',
  odhtags: 'odhTags',
  category: 'purgedCat',
  accommodationcategory: 'purgedCat',
  accocategoryid: 'purgedCat',
  accessible: 'accessible',
  accessibleaccommodations: 'accessible',
};

const CATEGORY_GROUPS = {
  '1starOpt': '1', '2starsOpt': '2', '3starsOpt': '3', '4starsOpt': '4', '5starsOpt': '5',
};

const normalizeKey = (text) => (text || '').toLowerCase().replace(/[^a-z]/g, '');

/** Valori di una cella: un valore per riga o separati da virgola. */
function cellValues(cell) {
  if (!cell) return [];
  const blocks = [...cell.querySelectorAll('p, li')];
  const texts = blocks.length ? blocks.map((b) => b.textContent) : [cell.textContent];
  return texts.flatMap((text) => text.split(/[,;\n]+/)).map((v) => v.trim()).filter(Boolean);
}

/**
 * Traduce tipo e valori scritti dall'editore nel filtro usato dalla query.
 * Come faceva il modello Java: dei tag/percorsi si tiene l'ultimo segmento (l'ID),
 * le feature "cluster" (/content/dam/idm/fc...) diventano tagIds, le categorie raggruppate
 * (3starsOpt) diventano il valore numerico.
 */
function buildFilter(rawType, values) {
  const name = FILTER_NAMES[normalizeKey(rawType)];
  if (!name) return null;
  if (name === 'accessible') return { name, values: [] };
  if (!values.length) return null;
  const isCluster = name === 'features' && values[0].startsWith(`${DAM_PREFIX.slice(0, -1)}/fc`);
  const parsed = values.map((value) => {
    const last = value.includes('/') ? value.slice(value.lastIndexOf('/') + 1) : value;
    return name === 'purgedCat' ? (CATEGORY_GROUPS[last] || last) : last;
  });
  return { name: isCluster ? 'tagIds' : name, values: parsed };
}

function cellLink(cell) {
  const anchor = cell?.querySelector('a');
  if (anchor) return { href: anchor.getAttribute('href'), text: anchor.textContent.trim() };
  const text = cell?.textContent.trim() || '';
  return text ? { href: text, text } : null;
}

function parseBlock(block) {
  const cfg = {
    headline: '',
    headingTag: 'h2',
    subtitle: '',
    baseFilters: [],
    tabs: [],
    editorials: {},
    sort: 'random',
    minTiles: 1,
    buttonLabel: '',
    cta: null,
    language: '',
    anchor: '',
  };
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const [keyCell, a, b, c, d, e, f] = cells;
    const text = (cell) => cell?.textContent.trim() || '';
    switch (normalizeKey(keyCell?.textContent)) {
      case 'headline': {
        cfg.headline = text(a);
        const heading = a?.querySelector('h1, h2, h3, h4, h5, h6');
        if (heading) cfg.headingTag = heading.tagName.toLowerCase();
        break;
      }
      case 'subtitle': cfg.subtitle = text(a); break;
      case 'filter': {
        const filter = buildFilter(text(a), cellValues(b));
        if (filter) cfg.baseFilters.push(filter);
        break;
      }
      case 'tab':
        cfg.tabs.push({ name: text(a), filter: buildFilter(text(b), cellValues(c)) });
        break;
      case 'editorial': {
        const picture = c?.querySelector('picture');
        const img = c?.querySelector('img');
        cfg.editorials[text(a).toLowerCase()] = {
          title: text(b),
          picture,
          alt: text(d) || img?.getAttribute('alt') || '',
          label: text(e),
          link: cellLink(f),
        };
        break;
      }
      case 'sort':
      case 'sortorder': cfg.sort = text(a).toLowerCase() === 'default' ? 'default' : 'random'; break;
      case 'mintiles':
      case 'minimumtiles': cfg.minTiles = Math.min(5, Math.max(1, parseInt(text(a), 10) || 1)); break;
      case 'buttonlabel': cfg.buttonLabel = text(a); break;
      case 'cta': cfg.cta = cellLink(a); break;
      case 'language': cfg.language = text(a).toLowerCase(); break;
      case 'anchor': cfg.anchor = text(a); break;
      default: break;
    }
  });
  if (!cfg.tabs.length) cfg.tabs.push({ name: 'default', filter: null });
  return cfg;
}

/* ----------------------------------- la query ----------------------------------- */

function filterExpression({ name, values }) {
  if (name === 'accessible') return 'accessible:true';
  const quote = (field, value) => `${field}:"${value}"`;
  let parts;
  if (name === 'location') {
    parts = values.flatMap((value) => (value === 'dolomitesRegion'
      ? ['isDolomitesRegion:true']
      : ['regionId', 'tvsId', 'municipalityId', 'districtId'].map((f) => quote(f, value))));
  } else if (name === 'odhTags') {
    parts = values.flatMap((value) => (
      ['odhTags', 'redactionalTags', 'customTags', 'tagIds'].map((f) => quote(f, value))));
  } else {
    parts = values.map((value) => quote(name, value));
  }
  return parts.length > 1 ? `(${parts.join(' OR ')})` : parts[0];
}

async function search(ctx, tab) {
  const filters = [...ctx.baseFilters, tab.filter].filter(Boolean)
    .map(filterExpression).join(' AND ');
  const body = {
    requests: [{
      indexName: ctx.indexName,
      params: {
        facets: [],
        filters,
        hitsPerPage: HITS_PER_PAGE,
        optionalFilters: ctx.optionalFilters,
        tagFilters: '',
      },
    }],
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const resp = await fetch(`${ctx.config.apimBaseUrl}${SEARCH_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`${SEARCH_PATH} ${resp.status} ${resp.statusText}`);
    const result = (await resp.json()).results?.[0] || {};
    return { hits: result.hits || [], total: result.nbHits };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------- card ------------------------------------- */

function withUtm(ctx, url) {
  if (!url || !ctx.utm.length) return url;
  try {
    const target = new URL(url, window.location.href);
    ctx.utm.forEach(([key, value]) => target.searchParams.set(key, value));
    return target.href;
  } catch (e) {
    return url;
  }
}

function prepareImages(hit, season) {
  const images = hit[`${season}Imgs`] || [];
  const alts = hit[`${season}ImgsAltText`];
  const validAlts = Array.isArray(alts) && alts.length === images.length;
  return images.map((src, index) => ({
    src,
    alt: (validAlts && alts[index] && alts[index].trim())
      || `${hit.name || ''} - ${hit.region || ''} - #${index + 1} - suedtirol.info`,
  }));
}

function buildCarousel(ctx, images, labels) {
  const track = el('div', { class: 'tile-slider-track' });
  const slides = images.map(() => {
    const slide = el('div', { class: 'tile-slider-image' });
    track.append(slide);
    return slide;
  });
  const ensure = (index) => {
    const slide = slides[index];
    if (!slide || slide.firstChild) return;
    const { src, alt } = images[index];
    const img = el('img', {
      alt,
      width: 500,
      height: 500,
      loading: index === 0 ? 'eager' : 'lazy',
      fetchpriority: index === 0 ? 'high' : null,
    });
    img.addEventListener('error', () => {
      if (!img.dataset.fallback && src.startsWith(DAM_PREFIX)) {
        img.dataset.fallback = 'true';
        img.src = `${ctx.config.assetBaseUrl}${src}`;
      }
    });
    img.src = damUrl(src, ctx.config, ctx.config.renditionCard);
    slide.append(img);
  };
  ensure(0);

  const carousel = el('div', { class: 'tile-slider-carousel-inner', 'aria-hidden': 'true' }, track);
  if (images.length < 2) return carousel;

  const total = images.length;
  const fraction = el('div', { class: 'tile-slider-fraction' });
  const updateFraction = (index) => { fraction.textContent = `${index + 1} / ${total}`; };
  updateFraction(0);

  const go = (target) => {
    const index = (target + total) % total;
    ensure(index);
    ensure(index + 1);
    track.scrollTo({
      left: index * track.clientWidth,
      behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth',
    });
  };
  const current = () => Math.round(track.scrollLeft / (track.clientWidth || 1));
  const button = (cls, iconName, label, step) => {
    const btn = el('button', {
      type: 'button', class: `tile-slider-arrow ${cls}`, tabindex: '-1', 'aria-label': label,
    }, icon(iconName));
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      go(current() + step);
    });
    return btn;
  };

  let frame;
  track.addEventListener('scroll', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const index = Math.min(total - 1, Math.max(0, current()));
      updateFraction(index);
      ensure(index + 1);
    });
  }, { passive: true });

  carousel.append(
    button('tile-slider-prev', 'prev', labels.prev, -1),
    button('tile-slider-next', 'next', labels.next, 1),
    fraction,
  );
  carousel.addEventListener('pointerenter', () => ensure(1), { once: true });
  return carousel;
}

function buildRating(hit, t) {
  const kinds = {
    star: ['star', 'sdt-plp-filters-category-star-label'],
    flower: ['filterVintage', 'sdt-plp-filters-category-flower-label'],
    sun: ['sunny', 'sdt-plp-filters-category-sun-label'],
  };
  const kind = kinds[hit.catType];
  if (!kind) return el('div');
  const count = (hit.catArray || []).length;
  const rating = el('div', { class: 'sdt-rating' });
  (hit.catArray || []).forEach(() => rating.append(icon(kind[0])));
  const label = t(`${kind[1]}-${count > 1 ? 'plural' : 'singular'}`);
  rating.append(el('span', { class: 'sr-only' }, `${count} ${label}`));
  if (hit.superiorClass === true) {
    rating.append(
      el('span', { class: 'superior-class', 'aria-hidden': 'true' }, 'S'),
      el('span', { class: 'sr-only' }, ' Superior'),
    );
  }
  return rating;
}

function buildTrustYou(hit, uid) {
  if (hit.trustYouActive !== true) return el('div');
  return el(
    'div',
    { class: 'trustyou-container tile-slider-hidden', id: `${uid}-trustyou-${hit.id}` },
    el('div', { class: 'badge-blue', id: `${uid}-trustyou-score-${hit.id}` }),
    el(
      'div',
      { class: 'trustyou-text' },
      el('div', { class: 'trustyou-label', id: `${uid}-trustyou-label-${hit.id}` }),
      el('div', { class: 'trustyou-reviews', id: `${uid}-trustyou-reviews-${hit.id}` }),
    ),
  );
}

/** Come hasTrustYouReviews di IDM: servono punteggio, descrizione e numero di recensioni. */
function hasTrustYouReviews(summary) {
  if (!summary) return false;
  const { score, score_description: description, reviews_count: count } = summary;
  if ([score, description, count].some((value) => value === null || value === undefined
    || value === '')) return false;
  return Number(score) > 0 && Number(count) > 0;
}

async function loadTrustYou(ctx, hit, card) {
  if (!hit.trustYouActive || !hit.trustYouId) return;
  const container = card.querySelector('.trustyou-container');
  const hide = () => container?.classList.add('tile-slider-hidden');
  try {
    const url = `https://api.trustyou.com/hotels/${hit.trustYouId}/seal.json`
      + `?lang=${ctx.lang}&key=${TRUSTYOU_KEY}&scale=5`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(resp.status);
    const summary = (await resp.json())?.response;
    if (!hasTrustYouReviews(summary)) {
      hide();
      return;
    }
    card.querySelector('.badge-blue').textContent = summary.score;
    container?.classList.remove('tile-slider-hidden');
    card.querySelector('.trustyou-label').textContent = summary.score_description;
    card.querySelector('.trustyou-reviews').textContent = `${summary.reviews_count} ${ctx.t('trustyou-badge-title')}`;
  } catch (e) {
    hide();
  }
}

function buildPrice(hit, ctx, ids) {
  const { t } = ctx;
  if (!hit.price || hit.price === '0.0' || hit.price === '0') return null;
  const from = t('sdt-plp-accommodation-price-from');
  const night = t('sdt-plp-accommodation-price-from-nigth-singolar');
  const unit = hit.priceFromPerUnitType === 'apartment'
    ? `1 ${night} / 1 ${t('sdt-plp-accommodation-price-apartment-unit')}`
    : `1 ${night} / 2 ${t('sdt-plp-accommodation-price-from-guest')}`;
  const vat = t('sdt-plp-accommodation-price-vat');
  return [
    el(
      'div',
      {
        id: ids.price,
        class: 'sdt-block-price',
        'aria-label': `${from} ${hit.price}€. ${t('sdt-tile-slider-accommodation-price-unit')}, ${vat}`,
      },
      el(
        'span',
        { class: 'sdt-price' },
        `${from} `,
        el('span', { class: 'num' }, hit.price),
        '€',
      ),
      el('span', { class: 'sdt-unit' }, unit),
    ),
    el('div', { class: 'sdt-tax' }, vat),
  ];
}

function buildCard(hit, ctx, index) {
  const { t } = ctx;
  const uid = `${ctx.uid}-${hit.id || hit.objectID || index}`;
  const ids = { title: `${uid}-title`, location: `${uid}-location`, price: `${uid}-price` };
  const bookable = hit.bookable === true;
  const href = withUtm(ctx, bookable ? hit.pdpOnLinePath : hit.pdpEnquiryPath);
  const buttonLabel = ctx.buttonLabel || t('sdt-plp-accommodation-btn-check');

  const card = el('article', {
    class: 'tile-slider-card sdt-card',
    'data-id': hit.id,
    'data-href': href,
    role: 'group',
    tabindex: '0',
    'aria-labelledby': `${ids.title} ${ids.price} ${ids.location}`,
  });

  /* immagini + etichetta di prenotazione + preferiti */
  const images = prepareImages(hit, ctx.season);
  const fav = el('button', {
    type: 'button',
    class: 'sdt-user-fav',
    'aria-pressed': 'false',
    'aria-label': t('sdt-fav-accesibility-label'),
  }, icon('favoriteBorder'));
  fav.addEventListener('click', () => {
    const pressed = fav.getAttribute('aria-pressed') !== 'true';
    fav.setAttribute('aria-pressed', String(pressed));
    fav.replaceChildren(icon(pressed ? 'favorite' : 'favoriteBorder'));
  });
  const media = el(
    'div',
    { class: 'block-img' },
    icon('homeBed', 'tile-slider-placeholder'),
    el('span', { class: 'sdt-booking-opt' }, t(bookable ? 'sdt-booking-opt-online' : 'sdt-booking-opt-enquiry')),
    buildCarousel(ctx, images, { prev: t('tile-slider-prev-image'), next: t('tile-slider-next-image') }),
    fav,
  );

  /* testi */
  const top = el(
    'div',
    { class: 'top-block' },
    el('div', { class: 'rating-actions' }, buildRating(hit, t), buildTrustYou(hit, uid)),
    el('h3', { class: 'title', id: ids.title }, hit.name),
    el(
      'div',
      { class: 'text location', id: ids.location },
      el('span', { class: 'sr-only' }, `${t('sdt-pdp-location-label')}:`),
      hit.locationAggregation || '',
    ),
  );

  const end = el('div', { class: 'end-block' });
  if (['1', '2', '3'].includes(String(hit.sustainableLevel))) {
    end.append(el(
      'div',
      { class: 'sdt-eco', id: `${uid}-eco` },
      `${t('sdt-plp-accommodation-eco-level')}\u00a0${hit.sustainableLevel}`,
    ));
  }
  if (hit.guestCardFlag === true) {
    end.append(el(
      'div',
      { class: 'sdt-guestcard', id: `${uid}-guestcard` },
      icon('guestcard', 'sdt-icon'),
      el('span', { class: 'text' }, t('sdt-plp-accommodation-guestcard')),
    ));
  }
  if (hit.bettAndBikeSport || hit.bettAndBike) {
    end.append(el(
      'div',
      { class: 'sdt-guestcard', id: `${uid}-bettbike` },
      icon('pedalBike', 'sdt-icon'),
      el('span', { class: 'text' }, t(hit.bettAndBikeSport
        ? 'sdt-plp-accommodation-pedal-bike-sport-required'
        : 'sdt-plp-accommodation-pedal-bike-required')),
    ));
  }
  const price = buildPrice(hit, ctx, ids);
  if (price) end.append(...price);
  if (href) {
    end.append(el(
      'a',
      {
        href,
        class: 'sdt-btn sdt-btn-darkOrange-2 check-availability-btn',
        target: '_blank',
        rel: 'noopener',
        'aria-label': t('sdt-plp-accommodation-btn-check'),
        'aria-describedby': `${ids.title} ${ids.location}`,
        tabindex: '-1',
      },
      icon('arrowForward'),
      el('span', {}, buttonLabel),
    ));
  }

  card.append(media, el('div', { class: 'block-info' }, top, end));
  return card;
}

function buildEditorialTile(editorial, ctx, index) {
  const id = `${ctx.uid}-editorial-title`;
  const picture = editorial.picture ? editorial.picture.cloneNode(true) : null;
  const img = picture?.querySelector('img');
  if (img) {
    img.alt = editorial.alt;
    img.setAttribute('aria-hidden', 'true');
    img.loading = index === 0 ? 'eager' : 'lazy';
  }
  const link = el(
    'a',
    {
      class: 'editorial-tile-link card-accommodation-bg',
      href: editorial.link?.href || null,
      target: '_blank',
      rel: 'noopener',
      'aria-labelledby': id,
    },
    el(
      'div',
      { class: 'block-img' },
      picture,
      el(
        'div',
        { class: 'block-info' },
        el('div', { class: 'sdt-title title', id }, editorial.title),
        el('div', { class: 'sdt-btn sdt-btn-gray-2 more-details-btn' }, icon('arrowForward'), el('span', {}, editorial.label)),
      ),
    ),
  );
  link.addEventListener('click', () => {
    document.dispatchEvent(new CustomEvent('teaser_click', {
      detail: {
        type: 'default_teaser',
        cta: editorial.label,
        index,
        itemName: editorial.title,
      },
    }));
  });
  return link;
}

/* ------------------------- interazione con le card (tastiera) ------------------------- */

const KNOWN_INTERNALS = '.sdt-rating, .title, .sdt-user-fav, .sdt-eco, .sdt-guestcard, '
  + '.sdt-block-price, .check-availability-btn';
const FOCUSABLES = `${KNOWN_INTERNALS}, a[href], button, [tabindex]`;

function focusables(card) {
  return [...card.querySelectorAll(FOCUSABLES)].filter((node) => {
    if (node.closest('[aria-hidden="true"]') || node.disabled) return false;
    if (MOBILE.matches && node.classList.contains('check-availability-btn')) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function setInternalsTabbable(card, enabled) {
  card.querySelectorAll(KNOWN_INTERNALS).forEach((node) => {
    node.tabIndex = enabled ? 0 : -1;
  });
}

function activateCard(card) {
  if (card.dataset.active === 'true') return;
  card.dataset.active = 'true';
  setInternalsTabbable(card, true);

  const onKeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      // eslint-disable-next-line no-use-before-define
      deactivateCard(card, true);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      const list = focusables(card);
      if (!list.length) return;
      const index = list.indexOf(document.activeElement);
      const step = event.shiftKey ? -1 : 1;
      list[(index + step + list.length) % list.length].focus();
    }
  };
  const onFocusout = (event) => {
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;
    requestAnimationFrame(() => {
      // eslint-disable-next-line no-use-before-define
      if (!card.contains(document.activeElement)) deactivateCard(card, false);
    });
  };
  card.addEventListener('keydown', onKeydown);
  card.addEventListener('focusout', onFocusout);
  card.trapHandlers = { onKeydown, onFocusout };

  const list = focusables(card);
  const initial = list.find((node) => node.matches('.sdt-rating, .sdt-user-fav, .title')) || list[0];
  (initial || card).focus({ preventScroll: true });
}

function deactivateCard(card, returnFocus) {
  if (card.dataset.active !== 'true') return;
  delete card.dataset.active;
  setInternalsTabbable(card, false);
  const { onKeydown, onFocusout } = card.trapHandlers || {};
  if (onKeydown) card.removeEventListener('keydown', onKeydown);
  if (onFocusout) card.removeEventListener('focusout', onFocusout);
  delete card.trapHandlers;
  if (returnFocus) card.focus({ preventScroll: true });
}

function initCard(card) {
  setInternalsTabbable(card, false);
  card.addEventListener('keydown', (event) => {
    if ((event.key === 'Enter' || event.key === ' ') && event.target === card) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activateCard(card);
      if (MOBILE.matches) card.click();
    }
  });
  card.addEventListener('click', (event) => {
    if (event.target.closest('button, a')) return;
    const url = card.dataset.href;
    if (url) window.open(url, '_blank', 'noopener');
  });
}

/* ------------------------------ tab, pannelli e rendering ------------------------------ */

/* Trascinamento con il mouse (drag & drop) sulla lista; il touch scorre già in modo nativo. */
function enableDrag(list) {
  let startX = 0;
  let startLeft = 0;
  let down = false;
  let moved = false;

  list.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true;
    moved = false;
    startX = e.clientX;
    startLeft = list.scrollLeft;
  });
  list.addEventListener('pointermove', (e) => {
    if (!down) return;
    const dx = e.clientX - startX;
    if (!moved && Math.abs(dx) > 5) {
      moved = true;
      list.classList.add('is-dragging');
      list.setPointerCapture(e.pointerId);
    }
    if (moved) list.scrollLeft = startLeft - dx;
  });
  const end = () => {
    if (!down) return;
    down = false;
    list.classList.remove('is-dragging');
  };
  list.addEventListener('pointerup', end);
  list.addEventListener('pointercancel', end);
  list.addEventListener('click', (e) => {
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
      moved = false;
    }
  }, true);
  list.addEventListener('dragstart', (e) => e.preventDefault());
}

function showEmpty(tab) {
  tab.panel.querySelector('.tile-slider-info').classList.remove('hide-info');
  tab.panel.classList.remove('loading');
}

function renderTab(ctx, tab) {
  const hits = tab.hits.slice(0, HITS_PER_PAGE);
  const list = tab.panel.querySelector('.tile-slider-list');
  const cards = hits.map((hit, index) => buildCard(hit, ctx, index));
  const items = cards.map((card) => el('li', { class: 'tile-slider-slide' }, card));
  const showEditorial = tab.editorial && typeof tab.total === 'number'
    && tab.total > EDITORIAL_MIN_TOTAL;
  if (showEditorial) {
    items.push(el(
      'li',
      { class: 'tile-slider-slide editorial-card' },
      buildEditorialTile(tab.editorial, ctx, items.length),
    ));
  }
  list.replaceChildren(...items);
  cards.forEach(initCard);
  cards.forEach((card, index) => loadTrustYou(ctx, hits[index], card));
}

async function loadTab(ctx, tab) {
  if (tab.state !== 'idle') return;
  tab.state = 'loading';
  tab.panel.classList.add('loading');
  try {
    if (!ctx.config.apimBaseUrl) throw new Error('apimBaseUrl non configurato in /configs.json');
    const { hits, total } = await search(ctx, tab);
    tab.hits = hits;
    tab.total = total;
    if (hits.length && hits.length >= ctx.minTiles) {
      renderTab(ctx, tab);
      tab.panel.classList.remove('loading');
    } else {
      showEmpty(tab);
    }
    tab.state = 'done';
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Tile Slider: caricamento tile non riuscito', error);
    showEmpty(tab);
    tab.state = 'idle';
  }
}

function selectTab(ctx, tab, focus = false) {
  ctx.tabs.forEach((other) => {
    const active = other === tab;
    other.button.classList.toggle('active', active);
    other.button.setAttribute('aria-selected', String(active));
    other.button.tabIndex = active ? 0 : -1;
    other.panel.hidden = !active;
  });
  if (focus) tab.button.focus();
  loadTab(ctx, tab);
}

function buildTabs(ctx, cfg) {
  const ordered = cfg.sort === 'default' || cfg.tabs.length < 2 ? cfg.tabs : shuffle(cfg.tabs);
  ctx.tabs = ordered.map((def, index) => {
    const id = `${ctx.uid}-${index + 1}`;
    const button = el('button', {
      type: 'button',
      class: 'nav-item',
      role: 'tab',
      id: `${id}-tab`,
      'aria-controls': `${id}-panel`,
      'aria-selected': 'false',
    }, def.name);
    const loader = el(
      'div',
      { class: 'tile-slider-loader', 'aria-hidden': 'true' },
      el('div', { class: 'loader-items' }, ...Array.from({ length: 6 }, () => el('div', { class: 'loader-dot' }))),
    );
    const dragList = el('ul', { class: 'tile-slider-list' });
    enableDrag(dragList);
    const panel = el(
      'div',
      {
        class: 'tile-slider-panel', role: 'tabpanel', id: `${id}-panel`, 'aria-labelledby': `${id}-tab`, hidden: true,
      },
      el(
        'p',
        { class: 'tile-slider-info hide-info', role: 'status' },
        icon('info', 'icon-info'),
        ctx.t('sdt-tile-slider-info-label'),
      ),
      el('div', { class: 'tile-slider-carousel' }, loader, dragList),
    );
    const editorial = cfg.editorials[def.name.toLowerCase()];
    button.addEventListener('click', () => selectTab(ctx, ctx.tabs[index], false));
    return {
      def, button, panel, editorial, filter: def.filter, state: 'idle', hits: null, total: 0,
    };
  });

  const nav = el(
    'div',
    {
      class: 'tile-slider-nav',
      role: 'tablist',
      'aria-labelledby': ctx.titleId,
      'aria-describedby': ctx.instructionsId,
      hidden: ctx.tabs.length < 2,
    },
    ...ctx.tabs.map((tab) => tab.button),
  );
  nav.addEventListener('keydown', (event) => {
    const index = ctx.tabs.findIndex((tab) => tab.button === document.activeElement);
    if (index < 0) return;
    const last = ctx.tabs.length - 1;
    const targets = {
      ArrowRight: index === last ? 0 : index + 1,
      ArrowDown: index === last ? 0 : index + 1,
      ArrowLeft: index === 0 ? last : index - 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (event.key in targets) {
      event.preventDefault();
      selectTab(ctx, ctx.tabs[targets[event.key]], true);
    }
  });
  return nav;
}

let instanceCount = 0;

export default async function decorate(block) {
  const cfg = parseBlock(block);
  instanceCount += 1;
  const config = await loadConfig();
  const lang = resolveLanguage(cfg.language, config);
  const dict = await loadI18n(lang);
  const indexLang = ALLOWED_INDEX_LANGUAGES.includes(lang) ? lang : 'en';

  const uid = `tile-slider-${instanceCount}`;
  const ctx = {
    uid,
    config,
    lang,
    t: (key) => dict[key] ?? key,
    indexName: `accommodations_${config.algoliaIndexEnv}_${indexLang}`,
    baseFilters: cfg.baseFilters,
    optionalFilters: randomValueFilters(config),
    season: currentSeason(config),
    minTiles: cfg.minTiles,
    buttonLabel: cfg.buttonLabel,
    utm: [...new URLSearchParams(window.location.search)]
      .filter(([key]) => key.startsWith('utm_')),
    titleId: `${uid}-title`,
    instructionsId: `${uid}-instructions`,
    tabs: [],
  };

  block.lang = lang;
  if (cfg.anchor) block.id = cfg.anchor;
  const header = (cfg.headline || cfg.subtitle) ? el(
    'div',
    { class: 'tile-slider-header' },
    cfg.headline && el(cfg.headingTag, { class: 'tile-slider-title', id: ctx.titleId }, cfg.headline),
    cfg.subtitle && el('p', { class: 'tile-slider-subtitle' }, cfg.subtitle),
  ) : null;
  const nav = buildTabs(ctx, cfg);
  const cta = cfg.cta && el(
    'a',
    {
      class: 'sdt-btn sdt-btn-gray-3 tile-slider-cta', href: cfg.cta.href, target: '_blank', rel: 'noopener',
    },
    cfg.cta.text,
  );

  block.replaceChildren(
    ...[
      header,
      el('p', { class: 'sr-only', id: ctx.instructionsId }, ctx.t('sdt-tile-slider-instructions')),
      nav,
      el('div', { class: 'tile-slider-panels' }, ...ctx.tabs.map((tab) => tab.panel)),
      cta,
    ].filter(Boolean),
  );

  // la prima tab e' attiva subito, ma la query parte solo quando lo slider e' visibile
  const first = ctx.tabs[0];
  first.button.classList.add('active');
  first.button.setAttribute('aria-selected', 'true');
  first.button.tabIndex = 0;
  first.panel.hidden = false;
  ctx.tabs.slice(1).forEach((tab) => { tab.button.tabIndex = -1; });
  const observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      observer.disconnect();
      loadTab(ctx, ctx.tabs.find((tab) => tab.button.classList.contains('active')));
    }
  }, { threshold: 0.2 });
  observer.observe(block);
}
