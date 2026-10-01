// Scroll-reveal: fade/slide sections in as they enter the viewport.
// Elements opt in with data-reveal and can opt out with
// data-reveal="none" (used for above-the-fold content so it never
// flashes on load). Stagger siblings via data-reveal-delay.
//
// Marks <html> with .reveal-ready before hiding anything, so if this
// module never runs (no JS, blocked bundle, reduced motion) content
// stays visible rather than stuck at opacity 0.

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function init() {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  if (!targets.length) return;

  if (reducedMotion || !('IntersectionObserver' in window)) {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  // Anything already in view on load should be visible immediately
  // rather than waiting for the observer's first callback.
  document.documentElement.classList.add('reveal-ready');

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target as HTMLElement;
        el.classList.add('is-revealed');
        observer.unobserve(el);
      });
    },
    { rootMargin: '0px 0px -12% 0px', threshold: 0.08 }
  );

  targets.forEach((el, i) => {
    // Explicit delay wins; otherwise stagger within the same parent so
    // grids cascade instead of popping in together.
    const explicit = el.dataset.revealDelay;
    const index = Number(el.dataset.revealIndex ?? i);
    el.style.setProperty('--reveal-delay', `${explicit ?? Math.min(index * 70, 420)}ms`);
    observer.observe(el);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}