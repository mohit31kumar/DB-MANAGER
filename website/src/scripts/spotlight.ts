// Cursor spotlight: writes the pointer position into --mx/--my on
// [data-spotlight] elements so the CSS radial-gradient can track the
// cursor. One shared listener per element, updated only on real
// movement and skipped entirely for coarse pointers (touch), where
// there is no hover cursor to follow.

const COARSE = '(hover: none), (pointer: coarse)';

function init() {
  if (window.matchMedia(COARSE).matches) return;

  const targets = Array.from(document.querySelectorAll<HTMLElement>('[data-spotlight]'));
  if (!targets.length) return;

  for (const el of targets) {
    let frame = 0;
    let px = 0;
    let py = 0;

    const paint = () => {
      frame = 0;
      el.style.setProperty('--mx', `${px}px`);
      el.style.setProperty('--my', `${py}px`);
    };

    el.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerType !== 'mouse') return;
        const rect = el.getBoundingClientRect();
        px = event.clientX - rect.left;
        py = event.clientY - rect.top;
        // Coalesce to one write per frame; pointermove can fire far
        // more often than the compositor paints.
        if (!frame) frame = requestAnimationFrame(paint);
      },
      { passive: true }
    );
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}