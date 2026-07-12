// Interactividad de la portada: menú móvil + filtro de categorías de la
// bitácora. Se sirve como archivo externo (no inline) para que la CSP del
// sitio mantenga `script-src 'self'` en TODAS las páginas: localStorage es
// por-origen, así que un XSS en cualquier página podría leer el token de
// /taller. Sin scripts inline, esa vía queda cerrada. Ver public/.htaccess.

// Menú móvil: alterna el panel, cambia el icono y cierra al navegar,
// al hacer clic fuera o con Escape.
const menuBtn = document.getElementById('menu-btn');
const menu = document.getElementById('menu-movil');
const setMenu = (abierto) => {
  menu.hidden = !abierto;
  menuBtn.setAttribute('aria-expanded', String(abierto));
  menuBtn.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  menuBtn.querySelector('[data-icon="abrir"]').classList.toggle('hidden', abierto);
  menuBtn.querySelector('[data-icon="cerrar"]').classList.toggle('hidden', !abierto);
};
menuBtn.addEventListener('click', () => setMenu(menu.hidden));
menu.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('click', (e) => {
  if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') setMenu(false);
});

// Filtro de categorías de la bitácora (equivalente al setState del prototipo).
const chips = document.querySelectorAll('[data-cat-btn]');
const cards = document.querySelectorAll('[data-cat]');
chips.forEach((chip) => {
  chip.addEventListener('click', () => {
    const cat = chip.dataset.catBtn;
    chips.forEach((c) => c.classList.toggle('activo', c === chip));
    cards.forEach((card) => {
      card.style.display = cat === 'todos' || card.dataset.cat === cat ? '' : 'none';
    });
  });
});
