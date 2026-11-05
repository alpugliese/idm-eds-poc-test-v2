import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * Content Special
 *
 * Migrazione di idm/components/common/content-special: fascia con carosello di immagini
 * (e una slide video facoltativa) e un pannello di testo a sinistra o a destra.
 * Sostituisce Swiper con scroll-snap CSS + JS vanilla (autoplay, paginazione, a11y).
 *
 * Contratto di authoring (tabella in DA):
 * | Content Special (varianti)                                                    |
 * | Riga senza immagini: pannello  ->  titolo (h2), testo, ultimo paragrafo = CTA  |
 * | Una riga per slide: immagine                                                   |
 * | Slide video: immagine (poster) + link a video (.mp4, YouTube, Vimeo) nella cella |
 *
 * Varianti: right (pannello a destra), black (pannello scuro), media-top (media sopra su mobile).
 * Default: pannello a sinistra, chiaro, media sotto su mobile.
 */

const AUTOPLAY_MS = 5000;
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)');
const PICTURE_SIZES = [{ media: '(min-width: 768px)', width: '2000' }, { width: '750' }];

/* ---------------------------------- video ---------------------------------- */

function parseVideo(url) {
  try {
    const u = new URL(url, window.location.href);
    const host = u.hostname.replace(/^www\./, '');
    const yt = 'https://www.youtube-nocookie.com/embed';
    const ytParams = 'autoplay=1&rel=0&playsinline=1';
    if (host === 'youtu.be') {
      return { type: 'embed', src: `${yt}/${u.pathname.slice(1)}?${ytParams}` };
    }
    if (host.endsWith('youtube.com')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop();
      return { type: 'embed', src: `${yt}/${id}?${ytParams}` };
    }
    if (host.endsWith('vimeo.com')) {
      const id = u.pathname.split('/').filter(Boolean).pop();
      return { type: 'embed', src: `https://player.vimeo.com/video/${id}?autoplay=1` };
    }
    if (/\.(mp4|webm)$/i.test(u.pathname)) return { type: 'file', src: u.href };
  } catch (e) {
    // url non valido: nessuna slide video
  }
  return null;
}

/** Eventi video_start / video_progress / video_complete, come nell'originale. */
function trackVideo(video) {
  const title = video.src.split('?')[0].split('/').pop();
  let last = 0;
  let started = false;
  const emit = (event, percent) => document.dispatchEvent(new CustomEvent('video_active', {
    detail: {
      event, video_title: title, video_percent: String(percent), video_duration: video.duration,
    },
  }));
  video.addEventListener('play', () => {
    if (!started) {
      started = true;
      emit('video_start', 0);
    }
  });
  video.addEventListener('timeupdate', () => {
    const step = [75, 50, 25, 10].find((t) => (video.currentTime / video.duration) * 100 > t);
    if (step && step > last) {
      last = step;
      emit('video_progress', step);
    }
  });
  video.addEventListener('ended', () => {
    emit('video_complete', 100);
    started = false;
    last = 0;
  });
}

let modal;

function getModal() {
  if (modal) return modal;
  modal = document.createElement('dialog');
  modal.className = 'content-special-modal';
  modal.setAttribute('aria-label', 'Video');
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'content-special-modal-close';
  close.setAttribute('aria-label', 'Chiudi');
  const content = document.createElement('div');
  content.className = 'content-special-modal-content';
  modal.append(close, content);
  close.addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });
  // alla chiusura si svuota il contenuto: ferma il video
  modal.addEventListener('close', () => content.replaceChildren());
  document.body.append(modal);
  return modal;
}

function openVideo(video) {
  const dialog = getModal();
  const content = dialog.querySelector('.content-special-modal-content');
  if (video.type === 'file') {
    const el = document.createElement('video');
    Object.assign(el, {
      controls: true, autoplay: true, playsInline: true, src: video.src,
    });
    trackVideo(el);
    content.replaceChildren(el);
  } else {
    const iframe = document.createElement('iframe');
    iframe.src = video.src;
    iframe.title = 'Video';
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
    iframe.allowFullscreen = true;
    content.replaceChildren(iframe);
  }
  dialog.showModal();
}

/* ---------------------------------- slide ---------------------------------- */

function buildSlide(row, eager) {
  const cell = row.firstElementChild;
  const img = cell.querySelector('img');
  const link = cell.querySelector('a');
  const slide = document.createElement('div');
  slide.className = 'content-special-slide';
  if (img) slide.append(createOptimizedPicture(img.src, img.alt, eager, PICTURE_SIZES));

  const video = link ? parseVideo(link.href) : null;
  if (video) {
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'content-special-play';
    play.setAttribute('aria-label', link.textContent.trim() || 'Riproduci video');
    play.addEventListener('click', () => openVideo(video));
    slide.append(play);
  }
  return slide;
}

/* -------------------------------- carosello -------------------------------- */

function buildMedia(slides) {
  const media = document.createElement('div');
  media.className = 'content-special-media';
  const track = document.createElement('div');
  track.className = 'content-special-track';
  track.append(...slides);
  media.append(track);
  if (slides.length < 2) return media;

  media.setAttribute('role', 'group');
  media.setAttribute('aria-roledescription', 'carousel');
  slides.forEach((slide, i) => {
    slide.setAttribute('role', 'group');
    slide.setAttribute('aria-roledescription', 'slide');
    slide.setAttribute('aria-label', `${i + 1} / ${slides.length}`);
  });

  let current = 0;
  let timer;

  const goTo = (i) => track.scrollTo({
    left: i * track.clientWidth,
    behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth',
  });

  const dots = document.createElement('div');
  dots.className = 'content-special-dots';
  const buttons = slides.map((slide, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', `Slide ${i + 1}`);
    button.addEventListener('click', () => goTo(i));
    return button;
  });
  dots.append(...buttons);
  media.append(dots);

  const setCurrent = (i) => {
    current = i;
    buttons.forEach((b, n) => b.classList.toggle('active', n === i));
  };
  setCurrent(0);

  // slide attiva = quella visibile almeno al 60%
  const slideObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) setCurrent(slides.indexOf(entry.target));
    });
  }, { root: track, threshold: 0.6 });
  slides.forEach((slide) => slideObserver.observe(slide));

  // autoplay (come Swiper in IDM): parte quando il carosello e' visibile, si ferma con il focus
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  const start = () => {
    if (timer) return;
    timer = setInterval(() => goTo((current + 1) % slides.length), AUTOPLAY_MS);
  };
  media.addEventListener('focusin', stop);
  media.addEventListener('focusout', start);
  new IntersectionObserver(([entry]) => (entry.isIntersecting ? start() : stop())).observe(media);

  return media;
}

/* --------------------------------- pannello -------------------------------- */

function isCta(el, last) {
  const link = el.querySelector('a');
  return el === last && !!link && el.textContent.trim() === link.textContent.trim();
}

function buildPanel(panelRows) {
  const panel = document.createElement('div');
  panel.className = 'content-special-panel';
  panelRows.forEach((row) => [...row.children].forEach((cell) => panel.append(...cell.childNodes)));

  const items = [...panel.children];
  const last = items.at(-1);
  items.forEach((el) => {
    if (el.matches('h1, h2, h3, h4, h5, h6')) {
      el.classList.add('content-special-title');
    } else if (isCta(el, last)) {
      el.classList.add('content-special-cta');
      const link = el.querySelector('a');
      // se decorateButtons non l'ha gia' fatto (link non in grassetto/corsivo)
      if (!link.classList.contains('button')) link.className = 'button primary';
    } else {
      el.classList.add('content-special-text');
    }
  });
  return panel;
}

export default function decorate(block) {
  const rows = [...block.children];
  const slideRows = rows.filter((row) => row.querySelector('picture, img'));
  const panelRows = rows.filter((row) => !slideRows.includes(row));
  const eager = block.closest('.section') === document.querySelector('main .section');

  const container = document.createElement('div');
  container.className = 'content-special-container';
  if (panelRows.length) container.append(buildPanel(panelRows));
  container.append(buildMedia(slideRows.map((row, i) => buildSlide(row, eager && i === 0))));
  block.replaceChildren(container);
}
