async function loadGallery() {
  const grid = document.getElementById('gallery-grid');
  const empty = document.getElementById('gallery-empty');
  try {
    const res = await fetch('gallery/assets/screenshots.json');
    if (!res.ok) throw new Error('Failed to load screenshots.json');
    const screenshots = await res.json();
    if (!Array.isArray(screenshots) || screenshots.length === 0) {
      grid.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    screenshots.sort((a, b) => (a.order || 0) - (b.order || 0));
    grid.innerHTML = screenshots.map((s, i) => `
      <div class="col-md-6 col-lg-4">
        <div class="screenshot-item" onclick="openLightbox('${s.src}', ${i})">
          <img src="gallery/assets/screenshots/${s.src}" alt="${escapeHtml(s.caption || '')}" loading="lazy">
          <div class="screenshot-caption">${escapeHtml(s.caption || '')}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Gallery load error:', err);
    grid.innerHTML = '<div class="col-12 text-center text-muted">Failed to load gallery.</div>';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function openLightbox(src, index) {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = 'gallery/assets/screenshots/' + src;
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  lightbox.classList.remove('active');
  img.src = '';
  document.body.style.overflow = '';
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeLightbox();
});

document.addEventListener('DOMContentLoaded', loadGallery);
