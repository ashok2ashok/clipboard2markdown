import { rowsToMarkdown, copyText, downloadFile, toast } from '../../shared/utils.js';

let ctrl = null;
let rows = [];
let cols = 4;
let alignments = [];
let debouncedSync;

export default {
  id: 'tables',
  title: 'Table Editor',

  mount(container) {
    ctrl = new AbortController();
    const { signal } = ctrl;
    rows = [['Header 1','Header 2','Header 3','Header 4'],['','','',''],['','','','']];
    cols = 4;
    alignments = Array(cols).fill('left');
    container.innerHTML = TEMPLATE();
    debouncedSync = debounce(syncOutput, 120);

    const el = s => container.querySelector(s);

    function syncOutput() {
      const out = el('#tbl-output');
      if (out) out.value = rowsToMarkdown(rows, alignments);
    }

    function buildGrid() {
      const grid = el('#tbl-grid');
      if (!grid) return;
      const table = document.createElement('table');
      table.className = 'md-table';
      rows.forEach((row, ri) => {
        const tr = document.createElement('tr');
        row.forEach((cell, ci) => {
          const el = document.createElement(ri === 0 ? 'th' : 'td');
          el.style.minWidth = '90px';
          const inp = document.createElement('textarea');
          inp.className = 'cell-input';
          inp.value = cell;
          inp.rows = 1;
          inp.setAttribute('aria-label', ri === 0 ? `Header ${ci+1}` : `Row ${ri}, Col ${ci+1}`);
          inp.addEventListener('input', () => {
            rows[ri][ci] = inp.value;
            inp.style.height = 'auto';
            inp.style.height = inp.scrollHeight + 'px';
            debouncedSync();
          }, { signal });
          inp.addEventListener('keydown', e => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const next = e.shiftKey
                ? table.querySelectorAll('.cell-input')[ri * cols + ci - 1]
                : table.querySelectorAll('.cell-input')[ri * cols + ci + 1];
              next?.focus();
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              const below = table.querySelectorAll('.cell-input')[(ri+1) * cols + ci];
              below?.focus();
            }
          }, { signal });
          el.appendChild(inp);
          if (ri === 0) {
            const ab = document.createElement('button');
            ab.className = 'col-align';
            ab.title = 'Toggle alignment';
            ab.textContent = { left:'L', center:'C', right:'R' }[alignments[ci] || 'left'];
            ab.setAttribute('aria-label', `Column ${ci+1} alignment`);
            ab.addEventListener('click', () => {
              const cycle = { left:'center', center:'right', right:'left' };
              alignments[ci] = cycle[alignments[ci] || 'left'];
              ab.textContent = { left:'L', center:'C', right:'R' }[alignments[ci]];
              syncOutput();
            }, { signal });
            el.appendChild(ab);
          }
          tr.appendChild(el);
        });
        table.appendChild(tr);
      });
      grid.innerHTML = '';
      grid.appendChild(table);
      syncOutput();
    }

    function addRow() {
      rows.push(Array(cols).fill(''));
      buildGrid();
    }
    function removeRow() {
      if (rows.length <= 1) return;
      rows.pop();
      buildGrid();
    }
    function addCol() {
      cols++;
      alignments.push('left');
      rows = rows.map(r => [...r, '']);
      buildGrid();
    }
    function removeCol() {
      if (cols <= 1) return;
      cols--;
      alignments.pop();
      rows = rows.map(r => r.slice(0, cols));
      buildGrid();
    }

    container.querySelector('#btn-add-row').addEventListener('click', addRow, { signal });
    container.querySelector('#btn-del-row').addEventListener('click', removeRow, { signal });
    container.querySelector('#btn-add-col').addEventListener('click', addCol, { signal });
    container.querySelector('#btn-del-col').addEventListener('click', removeCol, { signal });

    container.querySelector('#btn-clear-tbl').addEventListener('click', () => {
      rows = [Array(cols).fill(''), Array(cols).fill('')];
      rows[0] = rows[0].map((_,i) => `Header ${i+1}`);
      buildGrid();
    }, { signal });

    container.querySelector('#btn-copy-tbl').addEventListener('click', async () => {
      const md = el('#tbl-output')?.value;
      if (!md) return;
      await copyText(md);
      toast('Copied!');
    }, { signal });

    container.querySelector('#btn-download-tbl').addEventListener('click', () => {
      const md = el('#tbl-output')?.value;
      if (!md) return;
      downloadFile('table.md', md);
    }, { signal });

    // Import existing pipe table
    const importArea = el('#tbl-import');
    container.querySelector('#btn-import-tbl').addEventListener('click', () => {
      importArea.classList.toggle('d-none');
    }, { signal });
    container.querySelector('#btn-parse-import').addEventListener('click', () => {
      const text = importArea.querySelector('textarea').value.trim();
      if (!text) return;
      const parsed = parsePipeTable(text);
      if (parsed.length) {
        rows = parsed;
        cols = Math.max(...parsed.map(r => r.length));
        rows = rows.map(r => { while (r.length < cols) r.push(''); return r; });
        alignments = Array(cols).fill('left');
        buildGrid();
        importArea.classList.add('d-none');
        importArea.querySelector('textarea').value = '';
        toast('Table imported');
      }
    }, { signal });

    buildGrid();
  },

  unmount() {
    ctrl?.abort();
    ctrl = null;
    rows = [];
  },
};

function parsePipeTable(text) {
  return text.split('\n')
    .filter(l => l.trim().startsWith('|'))
    .filter(l => !l.match(/^\|[-:\s|]+\|$/)) // skip separator
    .map(l => l.replace(/^\||\|$/g,'').split('|').map(c => c.trim()));
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function TEMPLATE() {
  return `
<div class="tool-shell">
  <div class="tool-header">
    <button class="menu-btn" aria-label="Open menu"><svg class="icon"><use href="#icon-menu"/></svg></button>
    <span class="tool-title">Table Editor</span>
    <span class="tool-desc">Build pipe tables visually</span>
    <div class="header-spacer"></div>
    <div class="tool-actions">
      <button class="btn btn-secondary btn-sm" id="btn-import-tbl">Import Table</button>
      <button class="btn btn-secondary btn-sm" id="btn-clear-tbl">Reset</button>
      <button class="btn btn-secondary btn-sm" id="btn-download-tbl">
        <svg class="icon"><use href="#icon-download"/></svg> Download
      </button>
      <button class="btn btn-primary btn-sm" id="btn-copy-tbl">
        <svg class="icon"><use href="#icon-copy"/></svg> Copy
      </button>
    </div>
  </div>
  <div class="tool-body flex-col overflow-auto">
    <div class="tbl-controls">
      <span class="label" style="margin:0;align-self:center">Rows/Cols:</span>
      <button class="btn btn-secondary btn-sm" id="btn-add-row">+ Row</button>
      <button class="btn btn-secondary btn-sm" id="btn-del-row">− Row</button>
      <button class="btn btn-secondary btn-sm" id="btn-add-col">+ Col</button>
      <button class="btn btn-secondary btn-sm" id="btn-del-col">− Col</button>
      <span class="text-xs text-muted" style="margin-left:auto">Tab = next cell · Enter = cell below · Click L/C/R to align column</span>
    </div>

    <!-- Import panel -->
    <div id="tbl-import" class="d-none" style="padding:var(--sp-4);border-bottom:1px solid var(--border);background:var(--surface-2)">
      <div class="label">Paste existing pipe table</div>
      <textarea class="textarea" rows="5" placeholder="| Header 1 | Header 2 |&#10;| --- | --- |&#10;| Cell | Cell |" style="margin-bottom:var(--sp-2)"></textarea>
      <button class="btn btn-primary btn-sm" id="btn-parse-import">Parse & Import</button>
    </div>

    <div class="tbl-grid-wrap" id="tbl-grid" style="flex:1"></div>

    <div class="tbl-output-wrap" style="border-top:1px solid var(--border)">
      <div class="panel-header">
        <span class="panel-label">Pipe Table Output</span>
      </div>
      <textarea id="tbl-output" class="code-editor" style="height:120px;border-top:none" spellcheck="false" readonly aria-label="Generated pipe table"></textarea>
    </div>
  </div>
</div>`;
}
