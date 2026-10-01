// Navbar behaviour: scrolled state, scroll-progress bar, active route,
// and the mobile disclosure menu.

function init() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const progress = document.querySelector<HTMLElement>('[data-nav-progress]');
  const toggle = document.querySelector<HTMLButtonElement>('[data-nav-toggle]');
  const links = document.querySelector<HTMLElement>('[data-nav-links]');

  /* ---- scrolled state + progress ---- */
  if (nav) {
    let ticking = false;

    const update = () => {
      const y = window.scrollY;
      nav.classList.toggle('is-scrolled', y > 12);

      if (progress) {
        const max = document.documentElement.scrollHeight - window.innerHeight;
        const ratio = max > 0 ? Math.min(Math.max(y / max, 0), 1) : 0;
        progress.style.scale = `${ratio} 1`;
      }
      ticking = false;
    };

    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
      },
      { passive: true }
    );
    update();
  }

  /* ---- active route ---- */
  // Compare against the base path so this works under /DB-MANAGER/ too.
  const base = document.documentElement.dataset.base ?? '/';
  const here = window.location.pathname;
  const normalize = (p: string) => p.replace(/\/$/, '') || '/';

  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]')) {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('http')) continue;
    const path = normalize(new URL(href, window.location.origin).pathname);
    if (path === normalize(here) || (path === normalize(base) && normalize(here) === normalize(base))) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  }

  /* ---- mobile menu ---- */
  if (toggle && links) {
    const setOpen = (open: boolean) => {
      links.dataset.open = String(open);
      toggle.setAttribute('aria-expanded', String(open));
    };

    setOpen(false);

    toggle.addEventListener('click', () => {
      setOpen(links.dataset.open !== 'true');
    });

    // Close after following a link.
    links.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && links.dataset.open === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener('click', (event) => {
      if (links.dataset.open !== 'true') return;
      if (links.contains(event.target as Node) || toggle.contains(event.target as Node)) return;
      setOpen(false);
    });

    // Reset once the layout goes wide enough to show the inline links.
    const wide = window.matchMedia('(min-width: 721px)');
    wide.addEventListener('change', () => setOpen(false));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}