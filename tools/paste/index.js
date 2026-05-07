import { store } from '../../shared/store.js';
import { load, buildConverter } from '../../shared/deps.js';
import {
  debounce, downloadFile, compressToURL, decompressFromURL,
  wordCount, smartTypography, prettifyMarkdown, tableToMarkdown,
  copyText, toast, relTime,
} from '../../shared/utils.js';

const FLAVORS = [
  { id:'gfm',          label:'GitHub (GFM)' },
  { id:'commonmark',   label:'CommonMark'   },
  { id:'pandoc',       label:'Pandoc'       },
  { id:'rmarkdown',    label:'R Markdown'   },
  { id:'multimarkdown',label:'MultiMarkdown'},
];

const parser = new DOMParser();

let ctrl = null;
let currentHtml = '';
let currentFlavor = 'gfm';
let converters = {};
let flavorCache = new Map();
let splitMode = 'split'; // split | left | right
let previewTimer = 0;
let historyOpen = false;

export default {
  id: 'paste',
  title: 'Paste to Markdown',
  icon: 'paste',

  mount(container) {
    ctrl = new AbortController();
    const { signal } = ctrl;

    currentFlavor = store.get('flavor', 'gfm');
    splitMode = store.get('splitView', 'split');

    container.innerHTML = TEMPLATE(currentFlavor, splitMode);

    const el = id => container.querySelector('#' + id);

    const output      = el('md-output');
    const previewEl   = el('md-preview');
    const htmlSource  = el('html-source');
    const pastebin    = el('pastebin');
    const statusWords = el('status-words');
    const statusChars = el('status-chars');
    const toolBody    = el('tool-body');

    // Load shared URL
    if (location.hash.startsWith('#share/')) {
      decompressFromURL(location.hash).then(md => {
        output.value = md;
        updatePreview();
        updateStatus();
      });
    }

    // Build all converters
    load('turndown','turndownGfm','dompurify','githubCss').then(() => {
      marked.use({ breaks: true, gfm: true });
      FLAVORS.forEach(f => { converters[f.id] = buildConverter(f.id); });
      // If there's pending html from store (e.g. restored session), convert it
    });

    // ── Conversion ──
    function convert(html) {
      if (flavorCache.has(currentFlavor)) return flavorCache.get(currentFlavor);
      if (!converters[currentFlavor]) return '';
      let result;
      try {
        const td = converters[currentFlavor];
        const flavor = FLAVORS.find(f => f.id === currentFlavor);
        const hasTables = ['gfm','pandoc','rmarkdown','multimarkdown'].includes(currentFlavor);
        if (!hasTables) {
          result = prettifyMarkdown(applyOpts(td.turndown(html)));
        } else {
          const doc = parser.parseFromString(html, 'text/html');
          const tables = Array.from(doc.body.querySelectorAll('table'));
          const tableMap = new Map();
          tables.forEach((t, i) => {
            const key = `XXTBL${i}XX`;
            tableMap.set(key, tableToMarkdown(t));
            const p = doc.createElement('p'); p.textContent = key;
            t.parentNode.replaceChild(p, t);
          });
          let md = td.turndown(doc.body.innerHTML);
          tableMap.forEach((tbl, key) => { md = md.replace(key, '\n\n' + tbl); });
          result = prettifyMarkdown(applyOpts(md));
        }
      } catch(e) {
        console.error('[paste] conversion failed:', e);
        result = '';
      }
      flavorCache.set(currentFlavor, result);
      return result;
    }

    function applyOpts(md) {
      const opts = store.get('pasteOptions', {});
      if (opts.smartTypo) md = smartTypography(md);
      return md;
    }

    function processHtml(html) {
      if (!html) return;
      currentHtml = html;
      flavorCache.clear();
      htmlSource.textContent = html;
      output.value = convert(html);
      showApp();
      updatePreview();
      updateStatus();
      output.focus();
      output.select();
      // Save to history
      const words = output.value.trim().split(/\s+/);
      const title = words.slice(0,6).join(' ') + (words.length > 6 ? '…' : '');
      store.pushHistory({ title, markdown: output.value, html });
      renderHistory();
    }

    function showApp() {
      el('landing').classList.add('d-none');
      el('app-body').classList.remove('d-none');
    }
    function showLanding() {
      el('app-body').classList.add('d-none');
      el('landing').classList.remove('d-none');
    }

    // ── Preview ──
    function updatePreview() {
      if (typeof DOMPurify === 'undefined' || typeof marked === 'undefined') return;
      previewEl.innerHTML = DOMPurify.sanitize(marked.parse(output.value || ''));
    }
    const schedulePreview = debounce(updatePreview, 200);

    function updateStatus() {
      const { words, chars } = wordCount(output.value);
      statusWords.textContent = words.toLocaleString() + ' words';
      statusChars.textContent = chars.toLocaleString() + ' chars';
    }
    const scheduleStatus = debounce(updateStatus, 300);

    // ── Split view ──
    function applySplit(mode) {
      splitMode = mode;
      store.set('splitView', mode);
      const body = el('app-body');
      body.className = body.className.replace(/split-\w+/g,'').trim();
      body.classList.add('split-' + (mode === 'split' ? '2' : mode === 'left' ? 'left' : 'right'));
      container.querySelectorAll('.seg-btn[data-split]').forEach(b => {
        b.classList.toggle('active', b.dataset.split === mode);
      });
    }

    // ── History ──
    function renderHistory() {
      const list = el('history-list');
      if (!list) return;
      const history = store.getHistory();
      if (!history.length) {
        list.innerHTML = '<p class="history-empty">No history yet</p>';
        return;
      }
      list.innerHTML = history.map((h, i) => `
        <div class="history-item" data-idx="${i}" role="button" tabindex="0" aria-label="Restore: ${h.title}">
          <div class="history-item-title">${h.title}</div>
          <div class="history-item-meta">${relTime(h.ts)} · ${h.markdown.length} chars</div>
        </div>`).join('');
      list.querySelectorAll('.history-item').forEach(item => {
        const handler = () => {
          const h = history[+item.dataset.idx];
          if (h.html) processHtml(h.html);
          else { output.value = h.markdown; showApp(); updatePreview(); updateStatus(); }
          el('history-panel').classList.remove('open');
          historyOpen = false;
        };
        item.addEventListener('click', handler, { signal });
        item.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handler(); }, { signal });
      });
    }

    // ── Event listeners ──

    // Keyboard paste intercept
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && !e.target.matches('textarea,input,[contenteditable]')) {
        pastebin.innerHTML = '';
        pastebin.focus();
      }
    }, { signal });

    pastebin.addEventListener('paste', () => {
      setTimeout(() => {
        const html = pastebin.innerHTML;
        pastebin.innerHTML = '';
        if (html) processHtml(html);
      }, 0);
    }, { signal });

    // Drag & drop HTML file
    container.addEventListener('dragover', e => {
      e.preventDefault();
      el('drag-overlay').classList.add('active');
    }, { signal });
    container.addEventListener('dragleave', e => {
      if (!container.contains(e.relatedTarget)) el('drag-overlay').classList.remove('active');
    }, { signal });
    container.addEventListener('drop', e => {
      e.preventDefault();
      el('drag-overlay').classList.remove('active');
      const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.html') || f.type === 'text/html');
      if (file) {
        const reader = new FileReader();
        reader.onload = ev => processHtml(ev.target.result);
        reader.readAsText(file);
      }
    }, { signal });

    // Output edit
    output.addEventListener('input', () => { flavorCache.delete(currentFlavor); schedulePreview(); scheduleStatus(); }, { signal });

    // Flavor
    container.querySelectorAll('.flavor-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentFlavor = btn.dataset.flavor;
        store.set('flavor', currentFlavor);
        container.querySelectorAll('.flavor-btn').forEach(b => b.classList.toggle('active', b.dataset.flavor === currentFlavor));
        if (currentHtml) { output.value = convert(currentHtml); updatePreview(); updateStatus(); }
      }, { signal });
    });

    // Split view
    container.querySelectorAll('.seg-btn[data-split]').forEach(btn => {
      btn.addEventListener('click', () => applySplit(btn.dataset.split), { signal });
    });

    // Copy
    el('btn-copy').addEventListener('click', async () => {
      if (!output.value) return;
      await copyText(output.value);
      const btn = el('btn-copy');
      btn.classList.add('btn-copied');
      btn.querySelector('.btn-label').textContent = 'Copied!';
      setTimeout(() => { btn.classList.remove('btn-copied'); btn.querySelector('.btn-label').textContent = 'Copy'; }, 1500);
    }, { signal });

    // Download
    el('btn-download').addEventListener('click', () => {
      if (!output.value) return;
      downloadFile('document.md', output.value);
      toast('Downloaded document.md');
    }, { signal });

    // Share
    el('btn-share').addEventListener('click', async () => {
      if (!output.value) return;
      const hash = await compressToURL(output.value);
      const url = location.origin + location.pathname + hash;
      await copyText(url);
      toast('Share link copied!');
    }, { signal });

    // Prettify
    el('btn-prettify').addEventListener('click', () => {
      if (!output.value) return;
      output.value = prettifyMarkdown(output.value);
      updatePreview();
      toast('Prettified');
    }, { signal });

    // Clear
    el('btn-clear').addEventListener('click', () => {
      currentHtml = '';
      flavorCache.clear();
      output.value = '';
      previewEl.innerHTML = '';
      htmlSource.textContent = '';
      el('html-accordion').removeAttribute('open');
      showLanding();
    }, { signal });

    // History toggle
    el('btn-history').addEventListener('click', () => {
      historyOpen = !historyOpen;
      el('history-panel').classList.toggle('open', historyOpen);
      if (historyOpen) renderHistory();
    }, { signal });

    el('btn-history-close').addEventListener('click', () => {
      historyOpen = false;
      el('history-panel').classList.remove('open');
    }, { signal });

    el('btn-history-clear').addEventListener('click', () => {
      store.clearHistory();
      renderHistory();
    }, { signal });

    // Brand / nav back
    el('btn-brand').addEventListener('click', showLanding, { signal });

    // Smart typo toggle
    el('opt-smarttypo')?.addEventListener('change', e => {
      const opts = store.get('pasteOptions', {});
      store.set('pasteOptions', { ...opts, smartTypo: e.target.checked });
      if (currentHtml) { flavorCache.clear(); output.value = convert(currentHtml); updatePreview(); }
    }, { signal });

    // Mobile paste button
    el('btn-mobile-paste')?.addEventListener('click', async () => {
      if (navigator.clipboard?.read) {
        try {
          const items = await navigator.clipboard.read();
          for (const item of items) {
            if (item.types.includes('text/html')) {
              const blob = await item.getType('text/html');
              processHtml(await blob.text());
              return;
            }
          }
        } catch {}
      }
      pastebin.focus();
    }, { signal });

    // Init
    applySplit(splitMode);
    container.querySelectorAll('.flavor-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.flavor === currentFlavor);
    });
    const savedOpts = store.get('pasteOptions', {});
    if (el('opt-smarttypo')) el('opt-smarttypo').checked = !!savedOpts.smartTypo;
    renderHistory();

    // Check if starting from a shared URL
    if (!location.hash.startsWith('#share/')) showLanding();
    else el('landing').classList.add('d-none');
  },

  unmount() {
    ctrl?.abort();
    ctrl = null;
    converters = {};
    flavorCache.clear();
    currentHtml = '';
    historyOpen = false;
  },
};

// ── Template ──
function TEMPLATE(flavor, splitMode) {
  const splitClass = splitMode === 'split' ? 'split-2' : splitMode === 'left' ? 'split-left' : 'split-right';
  const flavOpts = FLAVORS.map(f =>
    `<button class="seg-btn flavor-btn${f.id === flavor ? ' active' : ''}" data-flavor="${f.id}">${f.label}</button>`
  ).join('');

  return `
<div class="tool-shell" id="tool-shell">
  <!-- Drag overlay -->
  <div class="drag-over-overlay" id="drag-overlay">
    <svg width="48" height="48"><use href="#icon-paste"/></svg>
    Drop HTML file to convert
  </div>

  <!-- Header -->
  <div class="tool-header">
    <button class="menu-btn" aria-label="Open menu"><svg class="icon"><use href="#icon-menu"/></svg></button>
    <button class="btn btn-ghost btn-sm" id="btn-brand" style="font-weight:600;padding:0 var(--sp-2)">clipboard2markdown</button>
    <span class="tool-desc text-muted" style="font-size:var(--text-xs)">Paste rich text → Markdown</span>
    <div class="header-spacer"></div>
    <div class="tool-actions">
      <div class="seg-ctrl d-none d-md-inline-flex">
        <button class="seg-btn${splitMode==='left'?' active':''}" data-split="left">Editor</button>
        <button class="seg-btn${splitMode==='split'?' active':''}" data-split="split">Split</button>
        <button class="seg-btn${splitMode==='right'?' active':''}" data-split="right">Preview</button>
      </div>
      <button class="btn btn-ghost btn-sm btn-icon" id="btn-history" title="Paste history" aria-label="History">
        <svg class="icon"><use href="#icon-history"/></svg>
      </button>
      <button class="btn btn-ghost btn-sm btn-icon" id="btn-share" title="Copy share link" aria-label="Share">
        <svg class="icon"><use href="#icon-share"/></svg>
      </button>
      <button class="btn btn-ghost btn-sm btn-icon" id="btn-download" title="Download .md" aria-label="Download">
        <svg class="icon"><use href="#icon-download"/></svg>
      </button>
      <button class="btn btn-ghost btn-sm" id="btn-prettify" title="Normalize spacing">Prettify</button>
      <button class="btn btn-primary btn-sm" id="btn-copy">
        <svg class="icon"><use href="#icon-copy"/></svg><span class="btn-label">Copy</span>
      </button>
      <button class="btn btn-danger btn-sm" id="btn-clear">Clear</button>
    </div>
  </div>

  <!-- Landing -->
  <div id="landing" class="empty-state" style="flex:1">
    <svg class="empty-icon" width="64" height="64"><use href="#icon-paste"/></svg>
    <h3>Paste rich text to convert</h3>
    <p>Copy anything from the web — docs, articles, tables — then paste it here.</p>
    <div class="empty-kbd">
      <kbd>Ctrl+V</kbd> <span class="text-muted">or</span> <kbd>⌘V</kbd>
      <span class="text-muted text-xs">anywhere in this window</span>
    </div>
    <button class="btn btn-primary d-md-none mt-4" id="btn-mobile-paste">Paste from Clipboard</button>
    <div class="divider" style="width:80%;max-width:320px;margin:var(--sp-4) auto"></div>
    <p class="text-xs text-muted">Or drop an <strong>.html</strong> file anywhere</p>
  </div>

  <!-- App body -->
  <div id="app-body" class="tool-body d-none ${splitClass}" style="position:relative">
    <!-- Editor panel -->
    <div class="panel panel-editor">
      <div class="panel-header">
        <span class="panel-label">Markdown</span>
        <div class="seg-ctrl">
          ${flavOpts}
        </div>
        <label class="checkbox-wrap ms-2 text-xs" style="white-space:nowrap">
          <input type="checkbox" id="opt-smarttypo"> <span>Smart quotes</span>
        </label>
      </div>
      <div class="panel-body">
        <textarea class="code-editor" id="md-output" spellcheck="false" aria-label="Markdown output" placeholder="Your markdown will appear here…"></textarea>
      </div>
      <details class="accordion" id="html-accordion">
        <summary><svg class="acc-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>Raw HTML</summary>
        <pre class="accordion-body" id="html-source" aria-label="Raw HTML source"></pre>
      </details>
    </div>

    <!-- Preview panel -->
    <div class="panel panel-preview">
      <div class="panel-header">
        <span class="panel-label">Preview</span>
      </div>
      <div class="panel-body">
        <div class="preview-pane">
          <article id="md-preview" class="markdown-body" aria-live="polite" aria-label="Markdown preview"></article>
        </div>
      </div>
    </div>

    <!-- History side panel -->
    <div class="history-panel" id="history-panel" role="complementary" aria-label="Paste history">
      <div class="history-header">
        <span>History</span>
        <div style="display:flex;gap:var(--sp-2)">
          <button class="btn btn-ghost btn-sm" id="btn-history-clear">Clear</button>
          <button class="btn-icon" id="btn-history-close" aria-label="Close history">
            <svg class="icon"><use href="#icon-x"/></svg>
          </button>
        </div>
      </div>
      <div class="history-list" id="history-list"></div>
    </div>
  </div>

  <!-- Status bar -->
  <div class="status-bar">
    <span id="status-words">0 words</span>
    <span id="status-chars">0 chars</span>
    <span style="flex:1"></span>
    <a href="https://markdownlivepreview.com/" target="_blank" rel="noopener noreferrer" class="text-xs text-muted" style="text-decoration:none">Open in Live Preview ↗</a>
  </div>

  <!-- Hidden paste target -->
  <div id="pastebin" contenteditable="true" tabindex="-1" aria-hidden="true"
       style="position:fixed;left:-9999px;width:1px;height:1px;overflow:hidden;opacity:0"></div>
</div>`;
}
