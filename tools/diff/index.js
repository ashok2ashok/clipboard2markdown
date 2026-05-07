import { diffLines, copyText, downloadFile, toast, debounce } from '../../shared/utils.js';

let ctrl = null;

export default {
  id: 'diff',
  title: 'Diff Viewer',

  mount(container) {
    ctrl = new AbortController();
    const { signal } = ctrl;
    container.innerHTML = TEMPLATE();
    const el = s => container.querySelector(s);

    let mode = 'split'; // 'split' | 'unified'

    function computeDiff() {
      const a = el('#diff-a').value;
      const b = el('#diff-b').value;

      if (!a && !b) {
        el('#diff-output').innerHTML = '<p class="empty-state text-muted text-sm" style="padding:var(--sp-6)">Paste text in both panels to compare.</p>';
        updateStats(null);
        return;
      }

      const { ops, aLines, bLines } = diffLines(a, b);
      updateStats(ops);

      if (mode === 'unified') {
        renderUnified(ops, aLines, bLines, el('#diff-output'));
      } else {
        renderSplit(ops, aLines, bLines, el('#diff-output'));
      }
    }

    function updateStats(ops) {
      if (!ops) { el('#diff-stats').textContent = ''; return; }
      const adds = ops.filter(o => o.type === 'ins').length;
      const dels = ops.filter(o => o.type === 'del').length;
      const eq   = ops.filter(o => o.type === 'eq').length;
      el('#diff-stats').textContent = `+${adds} −${dels} =${eq} lines`;
    }

    function renderUnified(ops, aLines, bLines, out) {
      let aNum = 0, bNum = 0;
      const html = ops.map(op => {
        if (op.type === 'eq') {
          aNum++; bNum++;
          return `<div class="diff-line"><span class="diff-ln">${aNum}</span><span class="diff-ln">${bNum}</span><span class="diff-marker"> </span><span class="diff-text">${esc(aLines[op.a])}</span></div>`;
        }
        if (op.type === 'del') {
          aNum++;
          return `<div class="diff-line diff-del"><span class="diff-ln">${aNum}</span><span class="diff-ln"></span><span class="diff-marker">−</span><span class="diff-text">${esc(aLines[op.a])}</span></div>`;
        }
        if (op.type === 'ins') {
          bNum++;
          return `<div class="diff-line diff-add"><span class="diff-ln"></span><span class="diff-ln">${bNum}</span><span class="diff-marker">+</span><span class="diff-text">${esc(bLines[op.b])}</span></div>`;
        }
        return '';
      }).join('');
      out.innerHTML = `<div class="diff-output diff-unified">${html || '<p class="text-muted text-sm" style="padding:var(--sp-4)">No differences.</p>'}</div>`;
    }

    function renderSplit(ops, aLines, bLines, out) {
      // Build paired rows: align deletions with insertions
      const pairs = [];
      let i = 0;
      while (i < ops.length) {
        const op = ops[i];
        if (op.type === 'eq') {
          pairs.push({ left: { type: 'eq', text: aLines[op.a] }, right: { type: 'eq', text: bLines[op.b] } });
          i++;
        } else if (op.type === 'del') {
          // look ahead for matching ins
          const next = ops[i+1];
          if (next?.type === 'ins') {
            pairs.push({ left: { type: 'del', text: aLines[op.a] }, right: { type: 'ins', text: bLines[next.b] } });
            i += 2;
          } else {
            pairs.push({ left: { type: 'del', text: aLines[op.a] }, right: null });
            i++;
          }
        } else {
          pairs.push({ left: null, right: { type: 'ins', text: bLines[op.b] } });
          i++;
        }
      }

      let lNum = 0, rNum = 0;
      const rows = pairs.map(({ left, right }) => {
        const lClass = left ? (left.type === 'del' ? 'diff-del' : '') : 'diff-empty';
        const rClass = right ? (right.type === 'ins' ? 'diff-add' : '') : 'diff-empty';
        if (left?.type !== 'del' && left) lNum++;
        else if (left?.type === 'del') lNum++;
        if (right?.type !== 'ins' && right) rNum++;
        else if (right?.type === 'ins') rNum++;
        const lMark = left ? (left.type === 'del' ? '−' : ' ') : '';
        const rMark = right ? (right.type === 'ins' ? '+' : ' ') : '';
        const lLn = left ? lNum : '';
        const rLn = right ? rNum : '';
        return `<div class="diff-split-row">
          <div class="diff-split-cell ${lClass}"><span class="diff-ln">${lLn}</span><span class="diff-marker">${lMark}</span><span class="diff-text">${left ? esc(left.text) : ''}</span></div>
          <div class="diff-split-cell ${rClass}"><span class="diff-ln">${rLn}</span><span class="diff-marker">${rMark}</span><span class="diff-text">${right ? esc(right.text) : ''}</span></div>
        </div>`;
      }).join('');

      out.innerHTML = `<div class="diff-output diff-split-view">${rows || '<p class="text-muted text-sm" style="padding:var(--sp-4)">No differences.</p>'}</div>`;
    }

    function exportDiff() {
      const a = el('#diff-a').value;
      const b = el('#diff-b').value;
      if (!a && !b) return;
      const { ops, aLines, bLines } = diffLines(a, b);
      let aNum = 0, bNum = 0;
      const lines = ['--- original', '+++ modified'];
      ops.forEach(op => {
        if (op.type === 'eq')  { aNum++; bNum++; lines.push(' ' + aLines[op.a]); }
        if (op.type === 'del') { aNum++; lines.push('-' + aLines[op.a]); }
        if (op.type === 'ins') { bNum++; lines.push('+' + bLines[op.b]); }
      });
      downloadFile('diff.patch', lines.join('\n'));
    }

    const schedDiff = debounce(computeDiff, 300);

    el('#diff-a').addEventListener('input', schedDiff, { signal });
    el('#diff-b').addEventListener('input', schedDiff, { signal });

    el('#diff-mode-split').addEventListener('click', () => {
      mode = 'split';
      el('#diff-mode-split').classList.add('active');
      el('#diff-mode-unified').classList.remove('active');
      computeDiff();
    }, { signal });

    el('#diff-mode-unified').addEventListener('click', () => {
      mode = 'unified';
      el('#diff-mode-unified').classList.add('active');
      el('#diff-mode-split').classList.remove('active');
      computeDiff();
    }, { signal });

    el('#btn-diff-swap').addEventListener('click', () => {
      const tmp = el('#diff-a').value;
      el('#diff-a').value = el('#diff-b').value;
      el('#diff-b').value = tmp;
      computeDiff();
    }, { signal });

    el('#btn-diff-copy').addEventListener('click', async () => {
      const a = el('#diff-a').value;
      const b = el('#diff-b').value;
      if (!a && !b) return;
      const { ops, aLines, bLines } = diffLines(a, b);
      let aNum = 0, bNum = 0;
      const lines = ['--- original', '+++ modified'];
      ops.forEach(op => {
        if (op.type === 'eq')  { aNum++; bNum++; lines.push(' ' + aLines[op.a]); }
        if (op.type === 'del') { aNum++; lines.push('-' + aLines[op.a]); }
        if (op.type === 'ins') { bNum++; lines.push('+' + bLines[op.b]); }
      });
      await copyText(lines.join('\n'));
      toast('Diff copied!');
    }, { signal });

    el('#btn-diff-download').addEventListener('click', exportDiff, { signal });

    el('#btn-diff-clear').addEventListener('click', () => {
      el('#diff-a').value = '';
      el('#diff-b').value = '';
      el('#diff-output').innerHTML = '<p class="empty-state text-muted text-sm" style="padding:var(--sp-6)">Paste text in both panels to compare.</p>';
      el('#diff-stats').textContent = '';
    }, { signal });

    // Initial render
    computeDiff();
  },

  unmount() { ctrl?.abort(); ctrl = null; },
};

function esc(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function TEMPLATE() { return `
<div class="tool-shell">
  <div class="tool-header">
    <button class="menu-btn" aria-label="Open menu"><svg class="icon"><use href="#icon-menu"/></svg></button>
    <span class="tool-title">Diff Viewer</span>
    <span class="tool-desc">Compare two text documents</span>
    <div class="header-spacer"></div>
    <div class="tool-actions">
      <div class="seg-ctrl" style="margin-right:var(--sp-2)">
        <button class="seg-btn active" id="diff-mode-split">Split</button>
        <button class="seg-btn" id="diff-mode-unified">Unified</button>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-diff-swap" title="Swap panels">⇄ Swap</button>
      <button class="btn btn-secondary btn-sm" id="btn-diff-clear">Clear</button>
      <button class="btn btn-secondary btn-sm" id="btn-diff-download"><svg class="icon"><use href="#icon-download"/></svg></button>
      <button class="btn btn-primary btn-sm" id="btn-diff-copy"><svg class="icon"><use href="#icon-copy"/></svg> Copy Patch</button>
    </div>
  </div>
  <div class="tool-body flex-col" style="min-height:0">
    <!-- Input row -->
    <div class="split-2" style="height:220px;flex-shrink:0;border-bottom:1px solid var(--border)">
      <div class="panel panel-editor" style="display:flex;flex-direction:column">
        <div class="panel-header"><span class="panel-label">Original</span></div>
        <textarea id="diff-a" class="code-editor" style="flex:1" spellcheck="false" placeholder="Paste original text…" aria-label="Original text"></textarea>
      </div>
      <div class="panel panel-preview" style="display:flex;flex-direction:column">
        <div class="panel-header">
          <span class="panel-label">Modified</span>
          <span class="text-xs text-muted" id="diff-stats" style="margin-left:auto"></span>
        </div>
        <textarea id="diff-b" class="code-editor" style="flex:1" spellcheck="false" placeholder="Paste modified text…" aria-label="Modified text"></textarea>
      </div>
    </div>
    <!-- Diff output -->
    <div id="diff-output" class="scroll-region" style="flex:1;overflow:auto;background:var(--surface)">
      <p class="empty-state text-muted text-sm" style="padding:var(--sp-6)">Paste text in both panels to compare.</p>
    </div>
  </div>
</div>`; }
