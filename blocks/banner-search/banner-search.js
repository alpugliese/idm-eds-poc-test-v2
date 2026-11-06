/* eslint-disable no-underscore-dangle */
import ICONS from './icons.js';
import DEFAULT_I18N from './i18n.js';
import DEFAULT_REGIONS from './regions.js';

/**
 * Banner Search
 *
 * Migrazione del componente AEM idm/components/custom-components/banner-search:
 * hero con immagini a dissolvenza, titolo e widget di ricerca (tab Alloggi / Esperienze).
 *
 * Contratto di authoring (una riga per voce, prima colonna = chiave):
 * | Banner Search     |                                                                  |
 * | title             | Titolo (H1)                                                      |
 * | image             | immagine di sfondo | alt          (ripetibile: slider a dissolvenza) |
 * | bottom image      | immagine in basso (linea delle montagne)                         |
 * | gradient          | 40 | 60                                                          |
 * | direction         | top-down | bottom-up                                             |
 * | tabs              | accommodation, experiences                                       |
 * | preselected tab   | accommodation | experiences                                      |
 * | default location  | etichetta | id | tipo (region, tvs, municipality, ...)           |
 * | accommodation search page | URL della pagina risultati alloggi                       |
 * | experience search page    | URL della pagina risultati esperienze                    |
 * | disable location search   | true                                                     |
 * | location label    | testo fisso mostrato al posto del campo localita'                |
 * | language          | it | en | de   (solo se non e' deducibile dal percorso)              |
 * | anchor            | id HTML del blocco                                               |
 *
 * Configurazioni tecniche (foglio /configs.json) e testi (foglio /{lingua}/placeholders.json):
 * le stesse del blocco tile-slider (apimBaseUrl, algoliaIndexEnv, assetBaseUrl) piu'
 * locationSearchEndpoint (opzionale).
 */

const SEARCH_PATH = '/digital-backend/algolia/search';
const REQUEST_TIMEOUT = 15000;
const SUGGEST_LANGUAGES = ['de', 'it', 'en', 'fr', 'pl', 'nl', 'cs'];
const INDEX_LANGUAGES = ['de', 'it', 'en'];
const SUGGESTIONS = 9;
const MIN_ACCOMMODATION_SUGGESTIONS = 3;
const LOCATION_PRIORITY = {
  mta: 1, region: 2, tvs: 3, municipality: 4, district: 5,
};
const MAX_NIGHTS = 60;
const MAX_ROOMS = 3;
const MAX_PERSONS_PER_ROOM = 15;
const SLIDE_DELAY = 4000;
const DESKTOP = window.matchMedia('(min-width: 960px)');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const SVG_NS = 'http://www.w3.org/2000/svg';
const DAY_MS = 86400000;

const DEFAULT_CONFIG = {
  apimBaseUrl: '',
  algoliaIndexEnv: 'prod',
  assetBaseUrl: 'https://www.suedtirol.info',
  locationSearchEndpoint: '',
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
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `bs-icon ${className}`.trim());
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ICONS[name]);
  svg.append(path);
  return svg;
}

async function fetchJson(url, options) {
  try {
    const resp = await fetch(url, options);
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

const regionPromises = {};
/** Regioni per "Le nostre regioni": foglio /<lingua>/regions.json (label, id, image) o default. */
function loadRegions(lang) {
  if (!regionPromises[lang]) {
    regionPromises[lang] = (async () => {
      const json = (await fetchJson(`/${lang}/regions.json`)) || (await fetchJson('/regions.json'));
      const rows = sheetRows(json)
        .filter((row) => row.label && row.id)
        .map((row) => ({ label: row.label, id: row.id, image: row.image || '' }));
      const regions = rows.length ? rows : DEFAULT_REGIONS;
      return regions.slice().sort((a, b) => a.label.localeCompare(b.label, lang));
    })();
  }
  return regionPromises[lang];
}

function resolveLanguage(override, config) {
  const segment = window.location.pathname.split('/').filter(Boolean)[0] || '';
  if (override) return override;
  if (/^[a-z]{2}$/.test(segment)) return segment;
  return config.defaultLanguage;
}

let idCounter = 0;
function uid(prefix) {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function isoDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nightsBetween(from, to) {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

/**
 * Evidenzia con <mark> le parti racchiuse in <em> (formato Algolia) senza usare innerHTML
 * (la pagina richiede Trusted Types). Ogni altro tag viene ignorato.
 */
function appendHighlight(node, html, fallback) {
  const source = html || fallback || '';
  source.split(/(<em>.*?<\/em>)/g).forEach((part) => {
    if (!part) return;
    const text = part.replace(/<[^>]+>/g, '');
    if (/^<em>/.test(part)) node.append(el('mark', {}, text));
    else node.append(text);
  });
}

/* --------------------------------- immagini ---------------------------------- */

function damUrl(src, config) {
  if (/^https?:/.test(src)) return src;
  if (src.startsWith('/content/dam/')) return `${config.assetBaseUrl}${src}`;
  return src;
}

const RENDITIONS = [
  ['(max-width: 420px)', '420h'],
  ['(min-width: 421px) and (max-width: 768px)', '768w'],
  ['(min-width: 769px) and (max-width: 1280px)', '1260w'],
  ['(min-width: 1281px)', '2700w'],
];

/** <picture> con le stesse rendition responsive dell'originale AEM (se il percorso e' DAM). */
function buildPicture(path, alt, eager, config, plain = false) {
  const full = damUrl(path, config);
  const picture = el('picture', { class: 'bs-picture' });
  if (path.includes('/content/dam/') && !plain) {
    RENDITIONS.forEach(([media, size]) => {
      [['wp', 'webp'], ['jp', 'jpeg']].forEach(([code, ext]) => {
        picture.append(el('source', {
          srcset: `${full}/_jcr_content/renditions/rendition_${size}_${code}.${ext}`,
          media,
          type: `image/${ext}`,
        }));
      });
    });
  }
  const img = el('img', {
    src: full,
    alt: alt || '',
    loading: eager ? 'eager' : 'lazy',
    fetchpriority: eager ? 'high' : 'low',
  });
  img.addEventListener('error', () => {
    picture.querySelectorAll('source').forEach((source) => source.remove());
    if (img.getAttribute('src') !== full) img.src = full;
    else img.classList.add('bs-hidden');
  }, { once: true });
  picture.append(img);
  return picture;
}

/* ------------------------------ parsing del blocco ------------------------------ */

function cellText(cell) {
  return cell ? cell.textContent.trim() : '';
}

function cellHref(cell) {
  const link = cell?.querySelector('a');
  return link ? link.getAttribute('href') : cellText(cell);
}

/** Immagine di una cella: <picture> authored in DA oppure URL/percorso scritto come testo. */
function cellImage(cell) {
  if (!cell) return null;
  const picture = cell.querySelector('picture');
  if (picture) return { node: picture.cloneNode(true) };
  const img = cell.querySelector('img');
  if (img) return { path: img.getAttribute('src') };
  const href = cellHref(cell);
  return href ? { path: href } : null;
}

function parseList(value) {
  return value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

function parseBlock(block) {
  const cfg = {
    title: '',
    slides: [],
    bottom: null,
    gradient: '40',
    direction: 'top-down',
    tabs: ['accommodation', 'experiences'],
    preselected: '',
    defaultLocation: null,
    accommodationPage: '',
    experiencePage: '',
    disableLocation: false,
    locationLabel: '',
    language: '',
    anchor: '',
  };
  [...block.children].forEach((row) => {
    const cells = [...row.children];
    const key = cellText(cells[0]).toLowerCase();
    const value = cellText(cells[1]);
    switch (key) {
      case 'title': cfg.title = value; break;
      case 'image': {
        const image = cellImage(cells[1]);
        if (image) cfg.slides.push({ ...image, alt: cellText(cells[2]) });
        break;
      }
      case 'bottom image': cfg.bottom = cellImage(cells[1]); break;
      case 'gradient': cfg.gradient = value.replace(/\D/g, '') || '40'; break;
      case 'direction': cfg.direction = value.toLowerCase().includes('bottom') ? 'bottom-up' : 'top-down'; break;
      case 'tabs': cfg.tabs = parseList(value).map((tab) => (tab.startsWith('exp') ? 'experiences' : 'accommodation')); break;
      case 'preselected tab': cfg.preselected = value.toLowerCase().startsWith('exp') ? 'experiences' : 'accommodation'; break;
      case 'default location':
        cfg.defaultLocation = {
          value, id: cellText(cells[2]), type: cellText(cells[3]).toLowerCase() || 'region',
        };
        break;
      case 'accommodation search page': cfg.accommodationPage = cellHref(cells[1]); break;
      case 'experience search page': cfg.experiencePage = cellHref(cells[1]); break;
      case 'disable location search': cfg.disableLocation = value.toLowerCase() === 'true'; break;
      case 'location label': cfg.locationLabel = value; break;
      case 'language': cfg.language = value.toLowerCase(); break;
      case 'anchor': cfg.anchor = value; break;
      default: break;
    }
  });
  if (!cfg.tabs.length) cfg.tabs = ['accommodation', 'experiences'];
  if (!cfg.tabs.includes(cfg.preselected)) [cfg.preselected] = cfg.tabs;
  return cfg;
}

/* ----------------------------- sfondo a dissolvenza ----------------------------- */

function buildBackground(cfg, config) {
  const deferred = [];
  const slides = cfg.slides.map((slide, index) => {
    const make = () => {
      const picture = slide.node || buildPicture(slide.path, slide.alt, index === 0, config);
      const img = picture.querySelector('img');
      if (img) {
        if (slide.alt && !img.alt) img.alt = slide.alt;
        img.loading = index === 0 ? 'eager' : 'lazy';
        if (index === 0) img.fetchPriority = 'high';
      }
      picture.setAttribute('aria-hidden', 'true');
      return picture;
    };
    const node = el(
      'div',
      { class: `bs-slide gradient${cfg.gradient} ${cfg.direction}${index === 0 ? ' is-active' : ''}` },
    );
    if (index === 0) node.append(make());
    // le altre immagini partono solo dopo il load: non competono con la LCP
    else deferred.push(() => node.append(make()));
    return node;
  });
  const bottom = cfg.bottom
    ? (cfg.bottom.node || buildPicture(cfg.bottom.path, '', false, config, true))
    : null;
  bottom?.classList.add('bs-bottom');
  const bg = el('div', { class: 'bs-bg', 'aria-hidden': 'true' }, el('div', { class: 'bs-slides' }, slides), bottom);

  if (slides.length > 1 && !REDUCED_MOTION.matches) {
    let current = 0;
    const fillDeferred = () => window.setTimeout(
      () => deferred.splice(0).forEach((fn) => fn()),
      500,
    );
    if (document.readyState === 'complete') fillDeferred();
    else window.addEventListener('load', fillDeferred, { once: true });
    window.setInterval(() => {
      if (document.hidden) return;
      bg.classList.add('is-rotating');
      slides[current].classList.remove('is-active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('is-active');
    }, SLIDE_DELAY);
  }
  return bg;
}

/* ----------------------------- servizi di ricerca ------------------------------ */

async function postSearch(ctx, request) {
  if (!ctx.config.apimBaseUrl) return [];
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  const json = await fetchJson(`${ctx.config.apimBaseUrl}${SEARCH_PATH}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests: [request] }),
    signal: controller.signal,
  });
  window.clearTimeout(timer);
  return json?.results?.[0]?.hits || [];
}

function indexLanguage(ctx) {
  return INDEX_LANGUAGES.includes(ctx.lang) ? ctx.lang : 'en';
}

function suggestLanguage(ctx) {
  return SUGGEST_LANGUAGES.includes(ctx.lang) ? ctx.lang : 'en';
}

async function searchLocations(ctx, term) {
  const endpoint = ctx.config.locationSearchEndpoint
    || `${ctx.config.apimBaseUrl}/digital-backend/locations/fulltext`;
  const lang = suggestLanguage(ctx).toUpperCase();
  const json = await fetchJson(`${endpoint}?search=${encodeURIComponent(term)}&lang=${lang}&excludeChildren=true`, { headers: { Accept: 'application/json' } });
  return (Array.isArray(json) ? json : []).map((result) => ({
    kind: 'location',
    type: String(result.type || '').toLowerCase(),
    value: result.translation_name,
    id: result.externalId || result.id,
    internalLocationId: result.id,
    metaRegionIds: result.childrenExternalIds || null,
    highlight: result._highlightResult?.title?.value,
  }));
}

async function searchAccommodations(ctx, term) {
  const hits = await postSearch(ctx, {
    indexName: `accommodations_${ctx.config.algoliaIndexEnv}_${indexLanguage(ctx)}`,
    query: term,
    hitsPerPage: SUGGESTIONS,
    attributesToRetrieve: ['name', 'bookable', 'pdpOnLinePath', 'pdpEnquiryPath', 'municipality', 'tvsId', 'municipalityId'],
    restrictSearchableAttributes: ['name'],
    analytics: true,
    analyticsTags: ['web'],
  });
  return hits.map((hit) => ({
    kind: 'accommodation',
    type: 'accommodation',
    value: hit.name,
    id: hit.objectID,
    sub: hit.municipality,
    highlight: hit._highlightResult?.name?.value,
    pdpPath: hit.bookable ? hit.pdpOnLinePath : hit.pdpEnquiryPath,
  }));
}

/** Localita' (mta, regioni, ...) piu' nomi di strutture, con almeno 3 posti per le strutture. */
async function suggestPlaces(ctx, term, withAccommodations) {
  const [locations, accommodations] = await Promise.all([
    searchLocations(ctx, term),
    withAccommodations ? searchAccommodations(ctx, term) : [],
  ]);
  const sorted = [...locations].sort(
    (a, b) => (LOCATION_PRIORITY[a.type] || 99) - (LOCATION_PRIORITY[b.type] || 99),
  );
  const reserved = Math.min(accommodations.length, MIN_ACCOMMODATION_SUGGESTIONS);
  const finalLocations = sorted.slice(0, SUGGESTIONS - reserved);
  return [
    ...finalLocations,
    ...accommodations.slice(0, SUGGESTIONS - finalLocations.length),
  ];
}

async function suggestExperiences(ctx, term) {
  const lang = suggestLanguage(ctx);
  const env = ctx.config.algoliaIndexEnv;
  const tagHits = await postSearch(ctx, {
    indexName: `tags_${env}_${lang}`,
    query: term,
    hitsPerPage: SUGGESTIONS,
    attributesToRetrieve: ['title', 'type', 'source'],
    restrictSearchableAttributes: ['title'],
    analytics: true,
    analyticsTags: ['web'],
  });
  const tags = tagHits.filter((hit) => hit.source === 'lts').map((hit) => ({
    kind: 'tag',
    type: hit.type,
    value: hit.title,
    id: hit.objectID,
    highlight: hit._highlightResult?.title?.value,
  }));
  if (tags.length >= SUGGESTIONS) return tags;
  const clusterHits = await postSearch(ctx, {
    indexName: `tagsgroups_${env}_${lang}_web`,
    query: term,
    hitsPerPage: SUGGESTIONS - tags.length,
    restrictSearchableAttributes: ['name'],
    analytics: true,
    analyticsTags: ['web'],
  });
  return [...tags, ...clusterHits.map((hit) => ({
    kind: 'cluster',
    type: 'default',
    value: hit.name,
    id: 'allExperiences',
    cluster: hit.id,
    highlight: hit._highlightResult?.name?.value,
  }))];
}

/* ------------------------------- campo con autocomplete ------------------------------- */

/**
 * Campo di ricerca con elenco di suggerimenti (pattern ARIA combobox/listbox).
 * options: { id, label, placeholder, iconName, ariaList, defaultItem, search, minChars }
 */
/** Scroll orizzontale con drag del mouse (il touch usa lo scroll nativo). */
function enableDragScroll(node) {
  let startX = 0;
  let startLeft = 0;
  let down = false;
  let moved = false;
  node.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    down = true;
    moved = false;
    startX = e.clientX;
    startLeft = node.scrollLeft;
  });
  window.addEventListener('pointermove', (e) => {
    if (!down) return;
    const delta = e.clientX - startX;
    if (!moved && Math.abs(delta) > 5) {
      moved = true;
      node.classList.add('is-dragging');
    }
    if (moved) node.scrollLeft = startLeft - delta;
  });
  window.addEventListener('pointerup', () => {
    if (!down) return;
    down = false;
    node.classList.remove('is-dragging');
  });
  node.addEventListener('click', (e) => {
    if (moved) {
      e.stopPropagation();
      e.preventDefault();
      moved = false;
    }
  }, true);
  node.addEventListener('dragstart', (e) => e.preventDefault());
}

function regionImageSrc(path, config) {
  const full = damUrl(path, config);
  if (!path.includes('/content/dam/') || path.includes('/renditions/')) return full;
  return `${full}/jcr:content/renditions/rendition_420h_wp.webp`;
}

function createAutocomplete(ctx, options) {
  const {
    id, label, placeholder, iconName, ariaList, defaultItem, search, regions = [],
  } = options;
  let selection = options.initial || null;
  let items = [];
  let active = -1;
  let timer;
  let requestId = 0;
  let open = false;

  const input = el('input', {
    id: `${id}-input`,
    type: 'search',
    role: 'combobox',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': `${id}-list`,
    'aria-autocomplete': 'list',
    autocomplete: 'off',
    placeholder,
  });
  if (selection) input.value = selection.value;
  const list = el('ul', {
    id: `${id}-list`, class: 'bs-suggestions', role: 'listbox', 'aria-label': ariaList || label,
  });
  const status = el('div', {
    class: 'bs-sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true',
  });
  const root = el(
    'div',
    { class: 'bs-field bs-autocomplete' },
    icon(iconName, 'bs-field-icon'),
    el('div', { class: 'bs-field-body' }, el('label', { class: 'bs-field-label', for: input.id }, label), input),
    el('div', { class: 'bs-overlay' }, list),
    status,
  );

  function syncEmpty() {
    root.classList.toggle('is-empty', !input.value);
  }

  const optionNodes = () => [...list.querySelectorAll('[role="option"]')];

  function setActive(index) {
    active = index;
    optionNodes().forEach((li, i) => {
      li.setAttribute('aria-selected', i === index ? 'true' : 'false');
      if (i === index) {
        input.setAttribute('aria-activedescendant', li.id);
        li.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
    if (index < 0) input.removeAttribute('aria-activedescendant');
  }

  function close() {
    open = false;
    root.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
    setActive(-1);
    window.clearTimeout(timer);
    requestId += 1;
    if (input.value && !selection) input.value = '';
    else if (selection) input.value = selection.value;
    syncEmpty();
  }

  function commit(item) {
    selection = item;
    input.value = item.value;
    close();
    root.dispatchEvent(new CustomEvent('bs-commit', { detail: item }));
  }

  function buildOption(item, index) {
    const text = el('span', { class: 'bs-suggestion-text' });
    appendHighlight(text, item.highlight, item.value);
    const li = el(
      'li',
      {
        id: `${id}-opt-${index}`, class: `bs-suggestion bs-suggestion-${item.kind}`, role: 'option', 'aria-selected': 'false',
      },
      icon(item.kind === 'accommodation' ? 'bed' : 'place', 'bs-suggestion-icon'),
      text,
      item.sub ? el('span', { class: 'bs-suggestion-sub' }, item.sub) : null,
    );
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => commit(item));
    return li;
  }

  function buildRegion(item, index) {
    const img = el('img', {
      src: item.imageSrc, alt: '', loading: 'lazy', width: '102', height: '102', draggable: 'false',
    });
    img.addEventListener('error', () => img.classList.add('bs-hidden'), { once: true });
    const li = el(
      'li',
      {
        id: `${id}-opt-${index}`, class: 'bs-region', role: 'option', 'aria-selected': 'false',
      },
      el('span', { class: 'bs-region-image' }, img),
      el('span', { class: 'bs-region-label' }, item.value),
    );
    li.addEventListener('mousedown', (e) => e.preventDefault());
    li.addEventListener('click', () => commit(item));
    return li;
  }

  function renderItems(newItems) {
    items = newItems;
    const nodes = [];
    let regionList = null;
    items.forEach((item, index) => {
      if (item.kind === 'region') {
        if (!regionList) {
          regionList = el('ul', { class: 'bs-regions-list', role: 'group', 'aria-label': ctx.t('bsRegionsTitle') });
          enableDragScroll(regionList);
          nodes.push(el(
            'li',
            { class: 'bs-regions', role: 'none' },
            el('div', { class: 'bs-regions-title' }, ctx.t('bsRegionsTitle')),
            regionList,
          ));
        }
        regionList.append(buildRegion(item, index));
      } else {
        nodes.push(buildOption(item, index));
      }
    });
    list.replaceChildren(...nodes);
    root.classList.toggle('has-regions', Boolean(regionList));
    active = -1;
    if (!items.length) {
      status.textContent = ctx.t('bsNoSuggestions');
      root.classList.remove('is-open');
    }
  }

  function show(newItems) {
    open = true;
    input.setAttribute('aria-expanded', 'true');
    renderItems(newItems);
    if (newItems.length) root.classList.add('is-open');
  }

  function showDefault() {
    show([...(defaultItem ? [defaultItem] : []), ...regions]);
  }

  input.addEventListener('focus', () => {
    if (!input.value) showDefault();
  });
  input.addEventListener('click', () => {
    if (!open) {
      if (!input.value) showDefault();
      else input.select();
    }
  });
  input.addEventListener('input', () => {
    selection = null;
    syncEmpty();
    window.clearTimeout(timer);
    status.textContent = '';
    if (input.value.length < 2) {
      showDefault();
      return;
    }
    timer = window.setTimeout(async () => {
      requestId += 1;
      const current = requestId;
      const term = input.value;
      const result = await search(term);
      if (current !== requestId || term !== input.value) return;
      show(result);
    }, 350);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        showDefault();
        return;
      }
      if (!items.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((active + step + items.length) % items.length);
    } else if (e.key === 'Enter') {
      if (open && items.length) {
        e.preventDefault();
        commit(items[Math.max(active, 0)]);
      }
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        close();
      }
    } else if (e.key === 'Tab') {
      close();
    }
  });
  input.addEventListener('blur', () => {
    window.setTimeout(() => { if (open && !root.contains(document.activeElement)) close(); }, 0);
  });
  document.addEventListener('click', (e) => {
    if (open && !e.composedPath().includes(root)) close();
  });

  syncEmpty();
  return {
    root,
    input,
    getSelection: () => selection,
    close,
  };
}

/* ------------------------------------ calendario ------------------------------------ */

function monthGrid(ctx, year, month, state, handlers) {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // settimana da lunedi'
  const today = startOfDay(new Date());
  const monthName = new Intl.DateTimeFormat(ctx.lang, { month: 'long', year: 'numeric' }).format(first);
  const weekdays = [...Array(7).keys()].map((i) => new Intl.DateTimeFormat(ctx.lang, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));

  const grid = el('div', { class: 'bs-month', role: 'group', 'aria-label': monthName });
  grid.append(el('div', { class: 'bs-month-name' }, monthName));
  const table = el('div', { class: 'bs-days' });
  weekdays.forEach((name) => table.append(el('span', { class: 'bs-weekday', 'aria-hidden': 'true' }, name)));
  for (let i = 0; i < offset; i += 1) table.append(el('span', { class: 'bs-day-empty' }));

  for (let day = 1; day <= days; day += 1) {
    const date = new Date(year, month, day);
    const time = date.getTime();
    const tooLate = state.from && !state.to
      && nightsBetween(state.from, date) > MAX_NIGHTS;
    const disabled = date < today || tooLate;
    const isStart = state.from && time === state.from.getTime();
    const isEnd = state.to && time === state.to.getTime();
    const end = state.to || state.hover;
    const inRange = state.from && end && time > state.from.getTime() && time < end.getTime();
    const classes = ['bs-day'];
    if (isStart) classes.push('is-start');
    if (isEnd) classes.push('is-end');
    if (inRange) classes.push('is-in-range');
    if (time === today.getTime()) classes.push('is-today');
    if (state.from && !state.to && state.hover && time === state.hover.getTime() && time > state.from.getTime()) classes.push('is-hover-end');
    const label = new Intl.DateTimeFormat(ctx.lang, { dateStyle: 'full' }).format(date);
    const button = el('button', {
      type: 'button', class: classes.join(' '), 'data-date': isoDate(date), 'aria-label': label, 'aria-pressed': isStart || isEnd ? 'true' : 'false', disabled,
    }, String(day));
    if (!disabled) {
      button.addEventListener('click', () => handlers.pick(date));
      button.addEventListener('mouseenter', () => handlers.hover(date));
    }
    table.append(button);
  }
  grid.append(table);
  return grid;
}

function createDatePicker(ctx, { onComplete }) {
  const today = startOfDay(new Date());
  // come IDM: di default oggi -> domani
  const state = { from: today, to: new Date(today.getTime() + DAY_MS), hover: null };
  let view = startOfDay(new Date());
  view.setDate(1);

  const shortFormat = new Intl.DateTimeFormat(ctx.lang, { day: 'numeric', month: 'short' });
  const valueNode = el('span', { class: 'bs-field-value bs-placeholder' }, ctx.t('bsDatesPlaceholder'));
  const button = el(
    'button',
    {
      type: 'button', class: 'bs-field bs-dates-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    },
    icon('dateRange', 'bs-field-icon'),
    el('span', { class: 'bs-field-body' }, el('span', { class: 'bs-field-label' }, ctx.t('dateLabel')), valueNode),
  );

  const months = el('div', { class: 'bs-months' });
  const nights = el('span', { class: 'bs-nights-count' }, '0');
  const prev = el('button', { type: 'button', class: 'bs-cal-nav bs-cal-prev', 'aria-label': ctx.t('prevMonth') }, icon('chevronLeft'));
  const next = el('button', { type: 'button', class: 'bs-cal-nav bs-cal-next', 'aria-label': ctx.t('nextMonth') }, icon('chevronRight'));
  const closeButton = el('button', { type: 'button', class: 'bs-panel-close', 'aria-label': ctx.t('btnCloseDatePicker') }, icon('close'));
  const panel = el(
    'div',
    {
      class: 'bs-panel bs-panel-dates', role: 'dialog', 'aria-label': ctx.t('bsDatesTitle'), hidden: true,
    },
    el('div', { class: 'bs-panel-header' }, el('span', { class: 'bs-panel-title' }, icon('dateRange'), ctx.t('bsDatesTitle')), closeButton),
    el('div', { class: 'bs-calendar', 'aria-label': ctx.t('datePickerCalendar') }, prev, next, months),
    el('div', { class: 'bs-nights' }, icon('moon'), ` ${ctx.t('numberOfNights')} `, nights),
  );

  function updateLabel() {
    if (state.from && state.to) {
      valueNode.textContent = `${shortFormat.format(state.from)} – ${shortFormat.format(state.to)}`;
      valueNode.classList.remove('bs-placeholder');
      nights.textContent = String(nightsBetween(state.from, state.to));
    } else if (state.from) {
      valueNode.textContent = shortFormat.format(state.from);
      valueNode.classList.remove('bs-placeholder');
      nights.textContent = '0';
    } else {
      valueNode.textContent = ctx.t('bsDatesPlaceholder');
      valueNode.classList.add('bs-placeholder');
      nights.textContent = '0';
    }
  }

  updateLabel();

  function render() {
    const count = DESKTOP.matches ? 2 : 1;
    const handlers = {
      pick(date) {
        if (!state.from || state.to || date <= state.from) {
          state.from = date;
          state.to = null;
          state.hover = null;
        } else {
          state.to = date;
        }
        updateLabel();
        render();
        if (state.to) onComplete();
      },
      hover(date) {
        if (state.from && !state.to) {
          state.hover = date;
          months.querySelectorAll('.bs-day').forEach((node) => {
            const time = new Date(`${node.dataset.date}T00:00:00`).getTime();
            node.classList.toggle('is-in-range', time > state.from.getTime() && time < date.getTime());
            node.classList.toggle('is-hover-end', time === date.getTime() && time > state.from.getTime());
          });
        }
      },
    };
    const grids = [];
    for (let i = 0; i < count; i += 1) {
      const date = new Date(view.getFullYear(), view.getMonth() + i, 1);
      grids.push(monthGrid(ctx, date.getFullYear(), date.getMonth(), state, handlers));
    }
    months.replaceChildren(...grids);
    months.classList.toggle('is-selecting', Boolean(state.from && !state.to));
    const current = startOfDay(new Date());
    prev.disabled = view.getFullYear() === current.getFullYear()
      && view.getMonth() === current.getMonth();
  }

  prev.addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
    render();
  });
  next.addEventListener('click', () => {
    view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    render();
  });
  DESKTOP.addEventListener('change', render);
  render();

  return {
    button,
    panel,
    closeButton,
    getRange: () => ({ from: state.from, to: state.to }),
    refresh: render,
  };
}

/* ------------------------------------ ospiti e camere ------------------------------------ */

function createGuests(ctx, { onConfirm }) {
  const rooms = [{ adults: 2, children: 0, ages: [] }];
  let showErrors = false;

  const summary = el('span', { class: 'bs-field-value' });
  const button = el(
    'button',
    {
      type: 'button', class: 'bs-field bs-guests-trigger', 'aria-haspopup': 'dialog', 'aria-expanded': 'false',
    },
    icon('bed', 'bs-field-icon'),
    el('span', { class: 'bs-field-body' }, el('span', { class: 'bs-field-label' }, ctx.t('searchGuestLabel')), summary),
  );
  const closeButton = el('button', { type: 'button', class: 'bs-panel-close', 'aria-label': ctx.t('bsClose') }, icon('close'));
  const body = el('div', { class: 'bs-guests-body' });
  const panel = el(
    'div',
    {
      class: 'bs-panel bs-panel-guests', role: 'dialog', 'aria-label': ctx.t('bsGuestsTitle'), hidden: true,
    },
    el('div', { class: 'bs-panel-header' }, el('span', { class: 'bs-panel-title' }, icon('person'), ctx.t('bsGuestsTitle')), closeButton),
    body,
  );

  function total() {
    return rooms.reduce((sum, room) => sum + room.adults + room.children, 0);
  }

  function updateSummary() {
    const persons = total();
    const people = ctx.t(persons === 1 ? 'searchGuest' : 'searchGuests');
    const roomLabel = ctx.t(rooms.length === 1 ? 'searchRoom' : 'searchRooms');
    summary.textContent = `${persons} ${people} / ${rooms.length} ${roomLabel}`;
  }

  function ageLabel(age) {
    if (age === 0) return `${ctx.t('searchSelectAgeItemLabelLess')} 1 ${ctx.t('searchSelectAgeItemLabel')}`;
    return `${age} ${ctx.t(age === 1 ? 'searchSelectAgeItemLabel' : 'searchSelectAgeItemLabelPlural')}`;
  }

  function counter(roomIndex, type, labelKey, subKey, addKey, removeKey) {
    const room = rooms[roomIndex];
    const persons = room.adults + room.children;
    const value = room[type];
    const min = type === 'adults' ? 1 : 0;
    const key = `${roomIndex}-${type}`;
    const minus = el('button', {
      type: 'button', class: 'bs-counter-btn', 'data-key': `${key}-minus`, 'aria-label': ctx.t(removeKey), disabled: value <= min,
    }, icon('remove'));
    const plus = el('button', {
      type: 'button', class: 'bs-counter-btn', 'data-key': `${key}-plus`, 'aria-label': ctx.t(addKey), disabled: persons >= MAX_PERSONS_PER_ROOM,
    }, icon('add'));
    minus.addEventListener('click', () => {
      room[type] -= 1;
      if (type === 'children') room.ages.pop();
      // eslint-disable-next-line no-use-before-define
      render(`${key}-minus`);
    });
    plus.addEventListener('click', () => {
      room[type] += 1;
      if (type === 'children') room.ages.push('');
      // eslint-disable-next-line no-use-before-define
      render(`${key}-plus`);
    });
    return el(
      'div',
      { class: `bs-guest-row bs-guest-row--${type}` },
      el('div', { class: 'bs-guest-label' }, el('strong', {}, ctx.t(labelKey)), el('span', { class: 'bs-guest-sub' }, ctx.t(subKey))),
      el('div', { class: 'bs-counter' }, minus, el('output', { class: 'bs-counter-value', 'aria-live': 'polite' }, String(value)), plus),
    );
  }

  function agesBlock(roomIndex) {
    const room = rooms[roomIndex];
    if (!room.children) return null;
    const selects = room.ages.map((age, childIndex) => {
      const select = el('select', {
        class: 'bs-age-select', 'data-key': `${roomIndex}-age-${childIndex}`, 'aria-label': `${ctx.t('searchSelectAgeTitle').replace('*', '')} ${childIndex + 1}`, 'aria-invalid': showErrors && age === '' ? 'true' : null,
      }, el('option', { value: '' }, ctx.t('searchSelectAgeLabel')));
      for (let i = 0; i <= 17; i += 1) {
        select.append(el('option', { value: String(i), selected: age === i }, ageLabel(i)));
      }
      select.addEventListener('change', () => {
        room.ages[childIndex] = select.value === '' ? '' : Number(select.value);
        // eslint-disable-next-line no-use-before-define
        render(`${roomIndex}-age-${childIndex}`);
      });
      return el('div', { class: `bs-age${showErrors && age === '' ? ' has-error' : ''}` }, select);
    });
    return el(
      'div',
      { class: 'bs-ages' },
      el('div', { class: 'bs-ages-list' }, selects),
      el('p', { class: `bs-ages-hint${showErrors && room.ages.includes('') ? ' has-error' : ''}` }, showErrors && room.ages.includes('') ? ctx.t('searchSelectAgeError') : ctx.t('searchChildAgeReq')),
    );
  }

  function roomCard(roomIndex) {
    const remove = roomIndex > 0
      ? el('button', {
        type: 'button', class: 'bs-room-remove', 'data-key': `${roomIndex}-remove`, 'aria-label': `${ctx.t('bsRemoveRoom')} ${roomIndex + 1}`,
      }, icon('trash'))
      : null;
    remove?.addEventListener('click', () => {
      rooms.splice(roomIndex, 1);
      // eslint-disable-next-line no-use-before-define
      render('add-room');
    });
    return el(
      'section',
      { class: 'bs-room' },
      el('div', { class: 'bs-room-header' }, el('span', { class: 'bs-room-title' }, icon('bed'), `${ctx.t('bsRoom')} ${roomIndex + 1}`), remove),
      el(
        'div',
        { class: 'bs-room-body' },
        el('div', { class: 'bs-guest-section' }, counter(roomIndex, 'adults', 'bsAdults', 'bsAdultsAges', 'addAdult', 'removeAdult')),
        el(
          'div',
          { class: 'bs-guest-section bs-guest-section-children' },
          counter(roomIndex, 'children', 'bsChildren', 'bsChildrenAges', 'addChild', 'removeChild'),
          agesBlock(roomIndex),
        ),
      ),
    );
  }

  function render(focusKey) {
    updateSummary();
    const addRoom = el('button', {
      type: 'button', class: 'bs-add-room', 'data-key': 'add-room', disabled: rooms.length >= MAX_ROOMS,
    }, icon('add'), ctx.t('searchBtnAddRoom'));
    addRoom.addEventListener('click', () => {
      rooms.push({ adults: 2, children: 0, ages: [] });
      render('add-room');
    });
    const confirm = el('button', { type: 'button', class: 'bs-confirm', 'data-key': 'confirm' }, icon('checkCircle'), ctx.t('searchBtnGuestConfirm'));
    confirm.addEventListener('click', () => {
      const invalid = rooms.some((room) => room.ages.includes(''));
      showErrors = invalid;
      if (invalid) {
        render();
        panel.querySelector('.bs-age.has-error select')?.focus();
        return;
      }
      onConfirm();
    });
    body.replaceChildren(
      ...rooms.map((_, index) => roomCard(index)),
      el('div', { class: 'bs-guests-footer' }, addRoom, confirm),
    );
    if (focusKey) {
      const target = body.querySelector(`[data-key="${focusKey}"]`);
      if (target && !target.disabled) target.focus();
      else body.querySelector('[data-key="confirm"]')?.focus();
    }
  }
  render();

  return {
    button,
    panel,
    closeButton,
    /** Stringa nel formato IDM: "adulti-bambini|eta,eta#adulti-bambini..." */
    toParam: () => rooms.map((room) => `${room.adults}-${room.children}${room.children ? `|${room.ages.join(',')}` : ''}`).join('#'),
    roomCount: () => rooms.length,
    summaryText: () => summary.textContent,
  };
}

/* ------------------------------- gruppo di pannelli ------------------------------- */

/** Un solo pannello aperto per volta; chiusura con Esc o click fuori; focus restituito. */
function createPanels(container) {
  const entries = [];
  function closeAll(restoreFocus) {
    entries.forEach(({ button, panel }) => {
      if (!panel.hidden) {
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        if (restoreFocus) button.focus();
      }
    });
    container.classList.remove('has-open-panel');
  }
  function open(entry) {
    closeAll(false);
    entry.panel.hidden = false;
    entry.button.setAttribute('aria-expanded', 'true');
    container.classList.add('has-open-panel');
    entry.panel.querySelector('button:not(:disabled), select')?.focus({ preventScroll: true });
  }
  function register(button, panel, closeButton) {
    const entry = { button, panel };
    entries.push(entry);
    button.addEventListener('click', () => {
      if (panel.hidden) open(entry);
      else closeAll(true);
    });
    closeButton.addEventListener('click', () => closeAll(true));
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeAll(true);
      }
    });
    return entry;
  }
  document.addEventListener('click', (e) => {
    // composedPath: il nodo cliccato puo' essere gia' stato sostituito da un re-render
    if (!e.composedPath().includes(container)) closeAll(false);
  });
  container.addEventListener('focusin', (e) => {
    const inside = entries.some(
      ({ button, panel }) => button.contains(e.target) || panel.contains(e.target),
    );
    if (!inside) closeAll(false);
  });
  return { register, open, closeAll };
}

/* ------------------------------------ ricerca ------------------------------------ */

function resolveSearchUrl(page, params) {
  if (!page) return '';
  const url = new URL(page, window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
}

function saveSession(values) {
  try {
    Object.entries(values).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    });
  } catch (e) {
    // sessionStorage non disponibile: la ricerca funziona comunque via parametri URL
  }
}

function buildSearchButton(ctx, onClick) {
  const button = el(
    'button',
    { type: 'button', class: 'bs-search-button' },
    icon('search'),
    el('span', { class: 'bs-search-label' }, ctx.t('bsSearchButton')),
  );
  button.addEventListener('click', onClick);
  return button;
}

/* ---------------------------------- scheda Alloggi ---------------------------------- */

function buildAccommodationForm(ctx) {
  const { cfg } = ctx;
  const bar = el('div', { class: 'bs-bar' });
  const form = el('div', { class: 'bs-form bs-form-accommodation' }, bar);

  const defaultLocation = cfg.defaultLocation || { value: ctx.t('location'), id: '', type: 'region' };
  let locationField;
  if (cfg.disableLocation) {
    const label = cfg.locationLabel || defaultLocation.value;
    locationField = {
      root: el(
        'div',
        { class: 'bs-field bs-field-static' },
        icon('place', 'bs-field-icon'),
        el('div', { class: 'bs-field-body' }, el('span', { class: 'bs-field-label' }, ctx.t('searchLabel')), el('span', { class: 'bs-field-value' }, label)),
      ),
      getSelection: () => ({ ...defaultLocation, value: label, kind: 'location' }),
    };
  } else {
    locationField = createAutocomplete(ctx, {
      id: uid('bs-location'),
      label: ctx.t('searchLabel'),
      placeholder: ctx.t('searchLabel'),
      iconName: 'place',
      defaultItem: { ...defaultLocation, kind: 'location' },
      regions: ctx.regions,
      search: (term) => suggestPlaces(ctx, term, true),
    });
  }

  const panels = createPanels(form);
  const guests = createGuests(ctx, { onConfirm: () => panels.closeAll(true) });
  const dates = createDatePicker(ctx, {
    onComplete: () => {
      panels.closeAll(false);
      panels.open(guestsEntry); // eslint-disable-line no-use-before-define
    },
  });
  const datesEntry = panels.register(dates.button, dates.panel, dates.closeButton);
  const guestsEntry = panels.register(guests.button, guests.panel, guests.closeButton);
  locationField.root.addEventListener?.('bs-commit', () => panels.open(datesEntry));
  locationField.root.addEventListener?.('focusin', () => panels.closeAll(false));

  function search() {
    const selection = locationField.getSelection();
    const { from, to } = dates.getRange();
    const params = {
      fulltext: selection?.value || '',
      searchedItemId: selection?.kind === 'accommodation' ? '' : (selection?.id || ''),
      category: selection?.type || '',
      internalLocationId: selection?.internalLocationId || '',
      dateFrom: from && to ? isoDate(from) : '',
      dateTo: from && to ? isoDate(to) : '',
      guests: guests.toParam(),
      rooms: guests.roomCount(),
      language: ctx.lang,
    };
    saveSession({
      fulltext: params.fulltext,
      searchTerm: params.fulltext,
      searchedItemId: params.searchedItemId,
      category: params.category,
      internalLocationId: params.internalLocationId,
      metaRegionId: selection?.metaRegionIds ? params.searchedItemId : '',
      dateFrom: from && to ? from.toString() : '',
      dateTo: from && to ? to.toString() : '',
      guests: params.guests,
      rooms: String(params.rooms),
      pdpPath: selection?.pdpPath || '',
      language: ctx.lang,
    });
    if (selection?.pdpPath) {
      window.location.href = new URL(selection.pdpPath, ctx.config.assetBaseUrl).toString();
      return;
    }
    const target = resolveSearchUrl(cfg.accommodationPage, params);
    if (target) window.location.href = target;
  }

  bar.append(
    el('div', { class: 'bs-item bs-item-location' }, locationField.root),
    el('div', { class: 'bs-item bs-item-dates' }, dates.button, dates.panel),
    el('div', { class: 'bs-item bs-item-guests' }, guests.button, guests.panel),
    buildSearchButton(ctx, search),
  );
  return form;
}

/* --------------------------------- scheda Esperienze --------------------------------- */

function buildExperienceForm(ctx) {
  const { cfg } = ctx;
  const bar = el('div', { class: 'bs-bar bs-bar-experiences' });
  const form = el('div', { class: 'bs-form bs-form-experiences' }, bar);

  const defaultLocation = cfg.defaultLocation || { value: ctx.t('location'), id: '', type: 'region' };
  const locationField = createAutocomplete(ctx, {
    id: uid('bs-exp-location'),
    label: ctx.t('searchEELocationLabel'),
    placeholder: ctx.t('location'),
    iconName: 'place',
    ariaList: ctx.t('searchSuggestionExpMessage'),
    defaultItem: { ...defaultLocation, kind: 'location' },
    search: (term) => suggestPlaces(ctx, term, false),
  });
  const activityField = createAutocomplete(ctx, {
    id: uid('bs-exp-activity'),
    label: ctx.t('searchEEActivityLabel'),
    placeholder: ctx.t('searchAllExperiencesLabel'),
    iconName: 'ticket',
    ariaList: ctx.t('searchSuggestionExpMessage'),
    defaultItem: {
      kind: 'tag', type: 'default', id: 'allExperiences', value: ctx.t('searchAllExperiencesLabel'),
    },
    search: (term) => suggestExperiences(ctx, term),
  });
  locationField.root.addEventListener('bs-commit', () => activityField.input.focus());

  function search() {
    const location = locationField.getSelection();
    const activity = activityField.getSelection();
    const params = {
      location: location?.value || '',
      locationId: location?.id || '',
      locationType: location?.type || '',
      activity: activity && activity.id !== 'allExperiences' ? activity.value : '',
      activityId: activity && activity.id !== 'allExperiences' ? activity.id : '',
      activityType: activity?.type || '',
      cluster: activity?.cluster || '',
      language: ctx.lang,
    };
    saveSession({
      'expevents-activities-fulltext': params.activity,
      'expevents-activities-searchedItemId': params.activityId,
      'expevents-activities-category': params.activityType,
      'expevents-activities-cluster': params.cluster,
      'expevents-activities-location': params.location,
      language: ctx.lang,
    });
    const target = resolveSearchUrl(cfg.experiencePage, params);
    if (target) window.location.href = target;
  }

  bar.append(
    el('div', { class: 'bs-item bs-item-location' }, locationField.root),
    el('div', { class: 'bs-item bs-item-activity' }, activityField.root),
    buildSearchButton(ctx, search),
  );
  return form;
}

/* ------------------------------ tab, modale e layout ------------------------------ */

function buildTabs(ctx, panels) {
  const tabs = ctx.cfg.tabs.map((name) => {
    const id = uid('bs-tab');
    const button = el(
      'button',
      {
        type: 'button', role: 'tab', class: 'bs-tab', id, 'aria-selected': 'false', tabindex: '-1', 'aria-controls': panels[name].id,
      },
      ctx.t(name === 'accommodation' ? 'bsTabAccommodation' : 'bsTabExperiences'),
    );
    panels[name].setAttribute('aria-labelledby', id);
    return { name, button };
  });
  const nav = el('div', { class: 'bs-tabs', role: 'tablist' }, tabs.map((tab) => tab.button));

  let selected = ctx.cfg.preselected;
  function select(name, focus) {
    selected = name;
    tabs.forEach((tab) => {
      const on = tab.name === name;
      tab.button.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.button.tabIndex = on ? 0 : -1;
      panels[tab.name].hidden = !on;
      if (on && focus) tab.button.focus();
    });
  }
  tabs.forEach((tab, index) => {
    tab.button.addEventListener('click', () => select(tab.name, false));
    tab.button.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      select(tabs[(index + step + tabs.length) % tabs.length].name, true);
    });
  });
  select(ctx.cfg.preselected, false);
  return { nav, select, current: () => selected };
}

function buildMobile(ctx, panels, host, tabsApi) {
  const dialog = el('dialog', { class: 'bs-modal', 'aria-labelledby': uid('bs-modal-title') });
  const titleId = dialog.getAttribute('aria-labelledby');
  const title = el('h2', { class: 'bs-modal-title', id: titleId });
  const closeButton = el('button', { type: 'button', class: 'bs-modal-close', 'aria-label': ctx.t('bsClose') }, icon('close'));
  const content = el('div', { class: 'bs-modal-body' });
  dialog.append(el('div', { class: 'bs-modal-header' }, title, closeButton), content);

  let openName = '';
  function restore() {
    if (!openName) return;
    host.append(panels[openName]);
    openName = '';
    tabsApi.select(tabsApi.current(), false);
  }
  function close() {
    if (dialog.open) dialog.close();
    restore();
  }
  function openModal(name) {
    openName = name;
    title.replaceChildren(icon(name === 'accommodation' ? 'bed' : 'ticket'), ctx.t(name === 'accommodation' ? 'bsMobileAccommodation' : 'bsMobileExperiences'));
    panels[name].hidden = false;
    content.replaceChildren(panels[name]);
    dialog.showModal();
  }
  closeButton.addEventListener('click', close);
  dialog.addEventListener('close', restore);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  DESKTOP.addEventListener('change', () => {
    if (DESKTOP.matches) close();
  });

  const buttons = ctx.cfg.tabs.map((name) => {
    const button = el(
      'button',
      { type: 'button', class: name === ctx.cfg.preselected ? 'active' : '' },
      icon(name === 'accommodation' ? 'bed' : 'ticket'),
      el('span', { class: 'bs-mobile-label' }, ctx.t(name === 'accommodation' ? 'bsMobileAccommodation' : 'bsMobileExperiences')),
    );
    button.addEventListener('click', () => {
      if (button.classList.contains('active')) {
        openModal(name);
        return;
      }
      buttons.forEach((other) => other.classList.remove('active'));
      button.classList.add('active');
    });
    return button;
  });
  const options = el('div', { class: 'bs-mobile-options' }, buttons);
  return { options, dialog };
}

/* ------------------------------------- decorate ------------------------------------- */

export default async function decorate(block) {
  const cfg = parseBlock(block);
  const config = await loadConfig();
  const lang = resolveLanguage(cfg.language, config);
  const i18nPromise = loadI18n(lang);
  const regionsPromise = cfg.tabs.includes('accommodation') ? loadRegions(lang) : Promise.resolve([]);
  if (/^https?:/.test(config.assetBaseUrl) && !document.querySelector(`link[rel="preconnect"][href="${config.assetBaseUrl}"]`)) {
    document.head.append(el('link', { rel: 'preconnect', href: config.assetBaseUrl }));
  }

  // sfondo (LCP) subito, senza attendere i testi
  const background = buildBackground(cfg, config);
  block.textContent = '';
  block.lang = lang;
  if (cfg.anchor) block.id = cfg.anchor;
  block.append(background);

  const dict = await i18nPromise;
  const regions = (await regionsPromise).map((region) => ({
    kind: 'region',
    type: 'region',
    id: region.id,
    value: region.label,
    imageSrc: region.image ? regionImageSrc(region.image, config) : '',
  }));
  const ctx = {
    cfg, config, lang, regions, t: (key) => dict[key] ?? key,
  };

  const panels = {};
  if (cfg.tabs.includes('accommodation')) {
    panels.accommodation = el('div', { class: 'bs-tabpanel', role: 'tabpanel', id: uid('bs-panel') }, buildAccommodationForm(ctx));
  }
  if (cfg.tabs.includes('experiences')) {
    panels.experiences = el('div', { class: 'bs-tabpanel', role: 'tabpanel', id: uid('bs-panel') }, buildExperienceForm(ctx));
  }

  const tabsApi = buildTabs(ctx, panels);
  const { nav } = tabsApi;
  const panelHost = el('div', { class: 'bs-panels' }, Object.values(panels));
  const mobile = buildMobile(ctx, panels, panelHost, tabsApi);

  const content = el(
    'div',
    { class: 'bs-content' },
    el('div', { class: 'bs-brand' }),
    cfg.title ? el('h1', { class: 'bs-title' }, cfg.title) : null,
    el('div', { class: 'bs-mobile' }, mobile.options),
    el('div', { class: 'bs-desktop' }, nav, panelHost),
  );

  block.append(content, mobile.dialog);
  block.classList.add('is-ready');
}
