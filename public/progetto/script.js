const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const toast = $('.toast');
let toastTimer;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

$$('[data-toast]').forEach((button) => {
  button.addEventListener('click', () => showToast(button.dataset.toast));
});

const navToggle = $('.nav-toggle');
const nav = $('#main-nav');

if (navToggle && nav) {
  navToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  $$('a', nav).forEach((link) => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

const modeButtons = $$('.mode-button');
const productDemos = $$('.product-demo');

function showDemoMode(name) {
  modeButtons.forEach((button) => {
    const active = button.dataset.demoMode === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });

  productDemos.forEach((demo) => {
    demo.classList.toggle('active', demo.dataset.demoView === name);
  });
}

modeButtons.forEach((button) => {
  button.addEventListener('click', () => showDemoMode(button.dataset.demoMode));
});

$$('[data-open-demo]').forEach((link) => {
  link.addEventListener('click', () => showDemoMode(link.dataset.openDemo));
});

const managerTabs = $$('.demo-tab');
const managerPanels = $$('.demo-panel');
const panelTitle = $('#panel-title');
const sidebar = $('.demo-sidebar');

function showManagerPanel(name) {
  managerTabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.panel === name));
  managerPanels.forEach((panel) => panel.classList.toggle('active', panel.id === `panel-${name}`));
  const activeTab = managerTabs.find((tab) => tab.dataset.panel === name);
  if (activeTab && panelTitle) panelTitle.textContent = activeTab.textContent.trim();
  if (sidebar) sidebar.classList.remove('mobile-open');
}

managerTabs.forEach((tab) => tab.addEventListener('click', () => showManagerPanel(tab.dataset.panel)));
$$('[data-switch]').forEach((button) => button.addEventListener('click', () => showManagerPanel(button.dataset.switch)));

const mobileMenu = $('.demo-mobile-menu');
if (mobileMenu && sidebar) {
  mobileMenu.addEventListener('click', () => sidebar.classList.toggle('mobile-open'));
}

const searchForm = $('#boat-search');
const resultsCount = $('#results-count');

if (searchForm) {
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const location = $('#search-location')?.value || 'la zona scelta';
    const guests = $('#search-guests')?.value || 'gli ospiti indicati';
    if (resultsCount) resultsCount.textContent = location.includes('Sardegna') ? '18' : location.includes('Amalfitana') ? '16' : '24';
    showToast(`Ricerca demo aggiornata: ${location}, ${guests}`);
  });
}

const filterButtons = $$('.filter-chip');
const boatCards = $$('.boat-result');

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const filter = button.dataset.filter;
    filterButtons.forEach((item) => item.classList.toggle('active', item === button));
    boatCards.forEach((card) => card.classList.toggle('filtered-out', !card.dataset.types.split(' ').includes(filter)));
    if (resultsCount) resultsCount.textContent = filter === 'tutte' ? '24' : filter === 'senza-patente' ? '9' : '15';
  });
});

$$('.save-boat').forEach((button) => {
  button.addEventListener('click', () => {
    const saved = button.classList.toggle('saved');
    button.textContent = saved ? '♥' : '♡';
    showToast(saved ? 'Barca salvata nei preferiti demo' : 'Barca rimossa dai preferiti demo');
  });
});

const bookingDrawer = $('#booking-drawer');
const drawerBoat = $('#drawer-boat');
const drawerPrice = $('#drawer-price');

function closeDrawer() {
  if (!bookingDrawer) return;
  bookingDrawer.classList.remove('open');
  bookingDrawer.setAttribute('aria-hidden', 'true');
}

$$('[data-booking]').forEach((button) => {
  button.addEventListener('click', () => {
    const [boat, price] = button.dataset.booking.split('|');
    if (drawerBoat) drawerBoat.textContent = boat;
    if (drawerPrice) drawerPrice.textContent = price;
    if (bookingDrawer) {
      bookingDrawer.classList.add('open');
      bookingDrawer.setAttribute('aria-hidden', 'false');
    }
  });
});

$('.drawer-close')?.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeDrawer();
});

/* ---------- Effetti premium ----------
   Tutto rispetta l'impostazione di sistema «riduci animazioni». */

const riduciMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Comparse progressive: i blocchi appaiono quando entrano nello schermo.
const daRivelare = $$('.section > *');
if (daRivelare.length && !riduciMovimento && 'IntersectionObserver' in window) {
  daRivelare.forEach((elemento, indice) => {
    elemento.classList.add('rivela');
    elemento.style.setProperty('--ritardo', `${Math.min(indice % 4, 3) * 0.08}s`);
  });
  const osservatore = new IntersectionObserver((voci, osservatore) => {
    voci.forEach((voce) => {
      if (!voce.isIntersecting) return;
      voce.target.classList.add('in-vista');
      osservatore.unobserve(voce.target);
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  daRivelare.forEach((elemento) => osservatore.observe(elemento));
}

// Intestazione compatta, barra di avanzamento e parallasse sull'immagine di testa.
const testata = $('.site-header');
const barraAvanzamento = $('#scroll-progress');
const immagineTestata = $('.hero-media');
let scorrimentoInCoda = false;

function aggiornaScorrimento() {
  const y = window.scrollY;
  if (testata) testata.classList.toggle('compatto', y > 40);
  if (barraAvanzamento) {
    const massimo = document.documentElement.scrollHeight - window.innerHeight;
    barraAvanzamento.style.width = `${massimo > 0 ? Math.min(100, (y / massimo) * 100) : 0}%`;
  }
  if (immagineTestata && !riduciMovimento) {
    immagineTestata.style.transform = `translate3d(0, ${Math.min(y, 900) * 0.22}px, 0) scale(1.06)`;
  }
  scorrimentoInCoda = false;
}

window.addEventListener('scroll', () => {
  if (scorrimentoInCoda) return;
  scorrimentoInCoda = true;
  requestAnimationFrame(aggiornaScorrimento);
}, { passive: true });
aggiornaScorrimento();

// Voce del menù della sezione visibile.
const vociMenu = $$('#main-nav a[href^="#"]');
const sezioniMenu = vociMenu.map((voce) => document.querySelector(voce.getAttribute('href'))).filter(Boolean);
if (sezioniMenu.length && 'IntersectionObserver' in window) {
  const guardiaSezioni = new IntersectionObserver((voci) => {
    voci.forEach((voce) => {
      if (!voce.isIntersecting) return;
      vociMenu.forEach((link) => link.classList.toggle('attivo', link.getAttribute('href') === `#${voce.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  sezioniMenu.forEach((sezione) => guardiaSezioni.observe(sezione));
}

// Carosello della flotta: frecce + trascinamento col mouse (sul telefono scorre col dito).
const risultati = $('.boat-results');
if (risultati) {
  const passo = () => {
    const card = $('.boat-result', risultati);
    return card ? card.getBoundingClientRect().width + 14 : 300;
  };

  $$('.carousel-arrow').forEach((freccia) => {
    freccia.addEventListener('click', () => {
      risultati.scrollBy({ left: Number(freccia.dataset.carousel) * passo(), behavior: riduciMovimento ? 'auto' : 'smooth' });
    });
  });

  let partenzaX = 0;
  let partenzaScorrimento = 0;
  let trascinando = false;
  let spostato = false;

  risultati.addEventListener('pointerdown', (evento) => {
    if (evento.pointerType !== 'mouse') return;
    trascinando = true;
    spostato = false;
    partenzaX = evento.clientX;
    partenzaScorrimento = risultati.scrollLeft;
    risultati.classList.add('in-corso');
  });

  risultati.addEventListener('pointermove', (evento) => {
    if (!trascinando) return;
    const delta = evento.clientX - partenzaX;
    if (Math.abs(delta) > 6) spostato = true;
    if (spostato) {
      risultati.scrollLeft = partenzaScorrimento - delta;
      if (evento.cancelable) evento.preventDefault();
    }
  });

  const fineTrascinamento = () => {
    trascinando = false;
    risultati.classList.remove('in-corso');
  };
  risultati.addEventListener('pointerup', fineTrascinamento);
  risultati.addEventListener('pointerleave', fineTrascinamento);
  risultati.addEventListener('pointercancel', fineTrascinamento);

  // Dopo un trascinamento il clic non deve aprire per sbaglio il dettaglio.
  risultati.addEventListener('click', (evento) => {
    if (!spostato) return;
    evento.preventDefault();
    evento.stopPropagation();
  }, true);
}
