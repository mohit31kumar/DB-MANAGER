// Copy-to-clipboard on code blocks, plus docs TOC scrollspy.
// The clipboard write falls back to a hidden textarea because the
// async Clipboard API needs a secure context, and this site is served
// over plain http on Pages previews and local dev.

function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy') ? resolve() : reject(new Error('copy rejected'));
    } catch (err) {
      reject(err as Error);
    } finally {
      ta.remove();
    }
  });
}

function initCopy() {
  const blocks = document.querySelectorAll<HTMLElement>('[data-code-block]');

  for (const block of blocks) {
    const button = block.querySelector<HTMLButtonElement>('[data-copy]');
    const pre = block.querySelector('pre');
    if (!button || !pre) continue;

    // Strip the injected button markup if any, then read the source.
    const source = (pre.textContent ?? '').replace(/\s+$/, '');

    button.addEventListener('click', async () => {
      // Remember the full markup (icon + label) so it can be restored exactly.
      const originalMarkup = button.innerHTML;
      try {
        await copyText(source);
        button.classList.add('is-copied');
        button.textContent = 'Copied';
        window.setTimeout(() => {
          button.classList.remove('is-copied');
          button.innerHTML = originalMarkup;
        }, 1800);
      } catch {
        button.textContent = 'Press Ctrl+C';
        window.setTimeout(() => {
          button.classList.remove('is-copied');
          button.innerHTML = originalMarkup;
        }, 2200);
      }
    });
  }
}

function initToc() {
  const toc = document.querySelector<HTMLElement>('[data-toc]');
  if (!toc) return;

  const links = Array.from(toc.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
  const sections = links
    .map((link) => {
      const id = decodeURIComponent(link.getAttribute('href')!.slice(1));
      const el = document.getElementById(id);
      return el ? { link, el } : null;
    })
    .filter((entry): entry is { link: HTMLAnchorElement; el: HTMLElement } => entry !== null);

  if (!sections.length) return;

  const setActive = (id: string) => {
    for (const { link, el } of sections) {
      const on = el.id === id;
      link.classList.toggle('is-active', on);
      if (on) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };

  // Track which section owns the reading line. rootMargin biases the
  // band upward so the active item changes as a heading reaches the
  // top third of the screen rather than only once it scrolls past.
  const observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    },
    { rootMargin: '-96px 0px -60% 0px', threshold: 0 }
  );

  for (const { el } of sections) observer.observe(el);

  // Sections shorter than the root band may never intersect; fall back
  // to a scroll-position check when nothing has been reported yet.
  let fallback = 0;
  window.addEventListener(
    'scroll',
    () => {
      window.clearTimeout(fallback);
      fallback = window.setTimeout(() => {
        if (toc.querySelector('a.is-active')) return;
        const line = 140;
        let current = sections[0].el.id;
        for (const { el } of sections) {
          if (el.getBoundingClientRect().top <= line) current = el.id;
        }
        setActive(current);
      }, 120);
    },
    { passive: true }
  );
}

function init() {
  initCopy();
  initToc();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}