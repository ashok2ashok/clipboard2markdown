import { load, buildConverter } from '../../shared/deps.js';
import { store } from '../../shared/store.js';
import { prettifyMarkdown, tableToMarkdown, copyText, downloadFile, toast, debounce, wordCount } from '../../shared/utils.js';

let ctrl = null;
const parser = new DOMParser();

export default {
  id: 'convert',
  title: 'MD ↔ HTML',

  mount(container) {
    ctrl = new AbortController();
    const { signal } = ctrl;
    let direction = 'md-to-html'; // or 'html-to-md'
    let flavor = store.get('flavor', 'gfm');

    container.innerHTML = TEMPLATE(flavor);
    const el = s => container.querySelector(s);

    load('turndown','turndownGfm','marked','dompurify','githubCss').then(() => {
      marked.use({ breaks: true, gfm: true });
      convert();
    });

    function convert() {
      const input = el('#conv-input').value;
      if (!input.trim()) { el('#conv-output').value = ''; updateStats(''); return; }
      try {
        if (direction === 'md-to-html') {
          const html = typeof DOMPurify !== 'undefined'
            ? DOMPurify.sanitize(marked.parse(input))
            : marked.parse(input);
          el('#conv-output').value = formatHtml(html);
        } else {
          const td = buildConverter(flavor);
          const doc = parser.parseFromString(input, 'text/html');
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
          el('#conv-output').value = prettifyMarkdown(md);
        }
        updateStats(el('#conv-output').value);
      } catch(e) {
        el('#conv-output').value = '<!-- Error: ' + e.message + ' -->';
      }
    }

    function updateStats(text) {
      const { words, chars, lines } = wordCount(text);
      el('#conv-stats').textContent = `${words} words · ${chars} chars · ${lines} lines`;
    }

    function setDirection(dir) {
      direction = dir;
      const isHtml = dir === 'md-to-html';
      el('#conv-dir-btn').textContent = isHtml ? 'MD → HTML' : 'HTML → MD';
      el('#conv-input-label').textContent  = isHtml ? 'Markdown' : 'HTML';
      el('#conv-output-label').textContent = isHtml ? 'HTML' : 'Markdown';
      el('#conv-input').placeholder = isHtml ? '# Hello World\n\nPaste **markdown** here…' : '<h1>Hello World</h1>\n<p>Paste <strong>HTML</strong> here…';
      el('#flavor-row').style.display = isHtml ? 'none' : '';
      convert();
    }

    const schedConvert = debounce(convert, 300);
    el('#conv-input').addEventListener('input', schedConvert, { signal });

    el('#conv-dir-btn').addEventListener('click', () => {
      // Swap input/output, flip direction
      const tmp = el('#conv-input').value;
      el('#conv-input').value = el('#conv-output').value;
      setDirection(direction === 'md-to-html' ? 'html-to-md' : 'md-to-html');
    }, { signal });

    container.querySelectorAll('.flavor-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        flavor = btn.dataset.flavor;
        store.set('flavor', flavor);
        container.querySelectorAll('.flavor-opt').forEach(b => b.classList.toggle('active', b.dataset.flavor === flavor));
        if (direction === 'html-to-md') convert();
      }, { signal });
    });

    el('#btn-conv-copy').addEventListener('click', async () => {
      const v = el('#conv-output').value;
      if (!v) return;
      await copyText(v);
      const btn = el('#btn-conv-copy');
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-copied');
      setTimeout(() => { btn.textContent = orig; btn.classList.remove('btn-copied'); }, 1500);
    }, { signal });

    el('#btn-conv-download').addEventListener('click', () => {
      const v = el('#conv-output').value;
      if (!v) return;
      const ext = direction === 'md-to-html' ? 'html' : 'md';
      downloadFile(`converted.${ext}`, v, direction === 'md-to-html' ? 'text/html' : 'text/markdown');
    }, { signal });

    el('#btn-conv-clear').addEventListener('click', () => {
      el('#conv-input').value = '';
      el('#conv-output').value = '';
      updateStats('');
    }, { signal });

    // Init
    setDirection('md-to-html');
    container.querySelectorAll('.flavor-opt').forEach(b => b.classList.toggle('active', b.dataset.flavor === flavor));
  },

  unmount() { ctrl?.abort(); ctrl = null; },
};

function formatHtml(html) {
  // Simple pretty-printer: add newlines around block elements
  return html
    .replace(/<(\/?(p|div|h[1-6]|ul|ol|li|table|tr|td|th|thead|tbody|blockquote|pre|code))/gi, '\n<$1')
    .replace(/^\n/, '')
    .split('\n').map(l => l.trim()).filter(l => l).join('\n');
}

function TEMPLATE(flavor) {
  const flavors = ['gfm','commonmark','pandoc','rmarkdown','multimarkdown'];
  const flavorBtns = flavors.map(f =>
    `<button class="seg-btn flavor-opt${f===flavor?' active':''}" data-flavor="${f}">${f}</button>`
  ).join('');
  return `
<div class="tool-shell">
  <div class="tool-header">
    <button class="menu-btn" aria-label="Open menu"><svg class="icon"><use href="#icon-menu"/></svg></button>
    <span class="tool-title">MD ↔ HTML</span>
    <span class="tool-desc">Bidirectional Markdown/HTML converter</span>
    <div class="header-spacer"></div>
    <div class="tool-actions">
      <button class="btn btn-secondary btn-sm" id="btn-conv-clear">Clear</button>
      <button class="btn btn-secondary btn-sm" id="btn-conv-download"><svg class="icon"><use href="#icon-download"/></svg></button>
      <button class="btn btn-primary btn-sm" id="btn-conv-copy"><svg class="icon"><use href="#icon-copy"/></svg> Copy</button>
    </div>
  </div>
  <div class="tool-body split-2">
    <!-- Input -->
    <div class="panel panel-editor">
      <div class="panel-header">
        <span class="panel-label" id="conv-input-label">Markdown</span>
        <button class="btn btn-secondary btn-sm" id="conv-dir-btn" title="Swap direction" style="margin-left:auto">MD → HTML</button>
      </div>
      <div id="flavor-row" style="display:none;padding:var(--sp-2) var(--sp-3);border-bottom:1px solid var(--border);background:var(--surface-2);flex-shrink:0">
        <div class="seg-ctrl">${flavorBtns}</div>
      </div>
      <textarea id="conv-input" class="code-editor" spellcheck="false" placeholder="# Hello World&#10;&#10;Paste **markdown** here…" aria-label="Input"></textarea>
    </div>
    <!-- Output -->
    <div class="panel panel-preview">
      <div class="panel-header">
        <span class="panel-label" id="conv-output-label">HTML</span>
        <span class="text-xs text-muted" id="conv-stats"></span>
      </div>
      <textarea id="conv-output" class="code-editor" spellcheck="false" readonly aria-label="Output"></textarea>
    </div>
  </div>
</div>`; }
