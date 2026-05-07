import { store } from './shared/store.js';

// Tool registry — lazy loaded
const TOOLS = new Map([
  ['paste',       () => import('./tools/paste/index.js')],
  ['tables',      () => import('./tools/tables/index.js')],
  ['toc',         () => import('./tools/toc/index.js')],
  ['convert',     () => import('./tools/convert/index.js')],
  ['format',      () => import('./tools/format/index.js')],
  ['frontmatter', () => import('./tools/frontmatter/index.js')],
  ['diff',        () => import('./tools/diff/index.js')],
  ['links',       () => import('./tools/links/index.js')],
]);

const appLayout    = document.getElementById('appLayout');
const sidebar      = document.getElementById('sidebar');
const sidebarToggle= document.getElementById('sidebarToggle');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const toolRoot     = document.getElementById('toolRoot');
const toolLoading  = document.getElementById('toolLoading');
const themeToggle  = document.getElementById('themeToggle');
const themeIcon    = document.getElementById('themeIcon');

let currentTool = null;
let currentId   = null;

// ── Router ──
async function navigate(id) {
  if (!TOOLS.has(id)) id = 'paste';
  if (id === currentId) return;

  // Unmount current
  if (currentTool?.unmount) currentTool.unmount();
  currentTool = null;
  currentId = id;

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.tool === id);
    el.setAttribute('aria-current', el.dataset.tool === id ? 'page' : 'false');
  });

  // Show loading
  toolRoot.innerHTML = '';
  toolRoot.appendChild(toolLoading);
  toolLoading.style.display = 'flex';

  try {
    const mod = await TOOLS.get(id)();
    const tool = mod.default;

    // Hide loading, mount tool
    toolLoading.style.display = 'none';
    currentTool = tool;
    tool.mount(toolRoot);

    store.set('lastTool', id);
    document.title = (tool.title || 'Markdown Tools') + ' — Markdown Tools';
  } catch (err) {
    console.error('[mdtools] Tool load failed:', err);
    toolLoading.style.display = 'none';
    toolRoot.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" width="48" height="48"><use href="#icon-x"/></svg>
        <h3>Tool failed to load</h3>
        <p>Check your connection and refresh.</p>
      </div>`;
  }

  // Close mobile sidebar on navigate
  if (window.innerWidth <= 768) closeMobileSidebar();
}

function getRouteId() {
  const hash = location.hash.replace('#', '').split('?')[0] || '';
  if (hash.startsWith('share/')) return 'paste'; // share URL → paste tool
  return hash || store.get('lastTool', 'paste');
}

window.addEventListener('hashchange', () => navigate(getRouteId()));

// ── Sidebar ──
function applyCollapsed(collapsed) {
  appLayout.classList.toggle('collapsed', collapsed);
  sidebarToggle.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
  sidebarToggle.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
}

sidebarToggle.addEventListener('click', () => {
  const next = !store.get('sidebarCollapsed', false);
  store.set('sidebarCollapsed', next);
  applyCollapsed(next);
});

function closeMobileSidebar() {
  appLayout.classList.remove('sidebar-open');
}

sidebarOverlay.addEventListener('click', closeMobileSidebar);

// Menu button (injected by each tool's tool-header)
document.addEventListener('click', e => {
  if (e.target.closest('.menu-btn')) {
    appLayout.classList.toggle('sidebar-open');
  }
});

// Keyboard nav: Escape closes mobile sidebar
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMobileSidebar();
});

// ── Theme ──
function applyTheme(theme) {
  const dark = theme === 'dark' || (theme == null && window.matchMedia('(prefers-color-scheme:dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  themeIcon.setAttribute('href', dark ? '#icon-sun' : '#icon-moon');
  // Sync Bootstrap theme
  document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  store.set('theme', next);
  applyTheme(next);
});

window.matchMedia('(prefers-color-scheme:dark)').addEventListener('change', e => {
  if (store.get('theme') == null) applyTheme(null);
});

// ── Init ──
applyCollapsed(store.get('sidebarCollapsed', false));
applyTheme(store.get('theme', null));
navigate(getRouteId());
