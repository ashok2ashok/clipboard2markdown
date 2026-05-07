import { prettifyMarkdown, smartTypography, copyText, downloadFile, toast, debounce, diffLines } from '../../shared/utils.js';

let ctrl = null;

export default {
  id: 'format',
  title: 'Formatter',

  mount(container) {
    ctrl = new AbortController();
    const { signal } = ctrl;
    container.innerHTML = TEMPLATE();
    const el = s => container.querySelector(s);

    function getOptions() {
      return {
        normalize:    el('#opt-normalize').checked,
        blanks:       el('#opt-blanks').checked,
        trailing:     el('#opt-trailing').checked,
        listMarkers:  el('#opt-list').checked,
        smartTypo:    el('#opt-smarttypo').checked,
        finalNewline: el('#opt-newline').checked,
      };
    }

    function format(md, opts) {
      let out = md;
      if (opts.trailing)    out = out.split('\n').map(l => l.trimEnd()).join('\n');
      if (opts.normalize)   out = prettifyMarkdown(out);
      if (opts.blanks)      out = out.replace(/\n{3,}/g, '\n\n');
      if (opts.listMarkers) out = normalizeListMarkers(out);
      if (opts.smartTypo)   out = smartTypography(out);
      if (opts.finalNewline && !out.endsWith('\n')) out += '\n';
      return out;
    }

    function normalizeListMarkers(md) {
      // Normalize *, + to - for unordered lists (not inside code blocks)
      const inCode = false;
      return md.split('\n').map(line => {
        if (/^\s*[*+]\s/.test(line)) return line.replace(/^(\s*)[*+](\s)/, '$1-$2');
        return line;
      }).join('\n');
    }

    function lint(md) {
      const warnings = [];
      const lines = md.split('\n');
      const headings = {};
      lines.forEach((l, i) => {
        const hm = l.match(/^(#{1,6})\s+(.+)/);
        if (hm) {
          const text = hm[2].trim();
          if (headings[text]) warnings.push({ line: i+1, msg: `Duplicate heading: "${text}"` });
          headings[text] = true;
        }
        // Bare URL (not in markdown link)
        if (/https?:\/\/[^\s)>]+/.test(l) && !/\]\(https?:/.test(l) && !l.startsWith('    ') && !l.startsWith('\t')) {
          warnings.push({ line: i+1, msg: 'Bare URL — wrap in <…> or [text](url)' });
        }
        // Trailing whitespace
        if (/\s+$/.test(l)) warnings.push({ line: i+1, msg: 'Trailing whitespace' });
        // ATX heading missing space
        if (/^#{1,6}[^#\s]/.test(l)) warnings.push({ line: i+1, msg: 'Heading missing space after #' });
      });
      return warnings;
    }

    function run() {
      const input = el('#fmt-input').value;
      const opts  = getOptions();
      const output = format(input, opts);
      el('#fmt-output').value = output;

      // Diff view
      const showDiff = el('#opt-diff').checked;
      const diffEl   = el('#fmt-diff');
      if (showDiff && input !== output) {
        diffEl.style.display = 'block';
        renderDiff(input, output, diffEl);
      } else {
        diffEl.style.display = 'none';
      }

      // Lint
      const warns = lint(input);
      const lintEl = el('#fmt-lint');
      if (warns.length) {
        lintEl.innerHTML = warns.map(w =>
          `<div class="badge badge-danger" style="margin:2px;display:inline-flex">L${w.line}: ${w.msg}</div>`
        ).join('');
      } else {
        lintEl.innerHTML = '<span class="badge badge-success">No issues found</span>';
      }
    }

    function renderDiff(a, b, container) {
      const { ops, aLines, bLines } = diffLines(a, b);
      let aNum = 0, bNum = 0;
      const html = ops.map(op => {
        if (op.type === 'eq')  { aNum++; bNum++; return `<div class="diff-line"><span class="diff-ln">${aNum}</span><span class="diff-ln">${bNum}</span><span class="diff-marker"> </span><span class="diff-text">${esc(aLines[op.a])}</span></div>`; }
        if (op.type === 'del') { aNum++; return `<div class="diff-line diff-del"><span class="diff-ln">${aNum}</span><span class="diff-ln"></span><span class="diff-marker">−</span><span class="diff-text">${esc(aLines[op.a])}</span></div>`; }
        if (op.type === 'ins') { bNum++; return `<div class="diff-line diff-add"><span class="diff-ln"></span><span class="diff-ln">${bNum}</span><span class="diff-marker">+</span><span class="diff-text">${esc(bLines[op.b])}</span></div>`; }
        return '';
      }).join('');
      container.innerHTML = `<div class="diff-output">${html}</div>`;
    }

    function esc(s='') { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    const schedRun = debounce(run, 250);
    el('#fmt-input').addEventListener('input', schedRun, { signal });
    container.querySelectorAll('.fmt-opt').forEach(inp => {
      inp.addEventListener('change', run, { signal });
    });

    el('#btn-apply').addEventListener('click', () => {
      const out = el('#fmt-output').value;
      el('#fmt-input').value = out;
      run();
      toast('Applied to input');
    }, { signal });

    el('#btn-copy-fmt').addEventListener('click', async () => {
      await copyText(el('#fmt-output').value || '');
      toast('Copied!');
    }, { signal });

    el('#btn-download-fmt').addEventListener('click', () => {
      downloadFile('formatted.md', el('#fmt-output').value || '');
    }, { signal });

    el('#btn-clear-fmt').addEventListener('click', () => {
      el('#fmt-input').value = '';
      el('#fmt-output').value = '';
      el('#fmt-diff').style.display = 'none';
      el('#fmt-lint').innerHTML = '';
    }, { signal });
  },

  unmount() { ctrl?.abort(); ctrl = null; },
};

function TEMPLATE() { return `
<div class="tool-shell">
  <div class="tool-header">
    <button class="menu-btn" aria-label="Open menu"><svg class="icon"><use href="#icon-menu"/></svg></button>
    <span class="tool-title">Formatter</span>
    <span class="tool-desc">Normalize &amp; lint Markdown</span>
    <div class="header-spacer"></div>
    <div class="tool-actions">
      <button class="btn btn-secondary btn-sm" id="btn-apply" title="Copy formatted back to input">Apply to Input</button>
      <button class="btn btn-secondary btn-sm" id="btn-clear-fmt">Clear</button>
      <button class="btn btn-secondary btn-sm" id="btn-download-fmt"><svg class="icon"><use href="#icon-download"/></svg></button>
      <button class="btn btn-primary btn-sm" id="btn-copy-fmt"><svg class="icon"><use href="#icon-copy"/></svg> Copy</button>
    </div>
  </div>
  <div class="tool-body flex-col">
    <!-- Options -->
    <div style="display:flex;flex-wrap:wrap;gap:var(--sp-4);padding:var(--sp-3) var(--sp-4);border-bottom:1px solid var(--border);background:var(--surface-2);flex-shrink:0;align-items:center">
      <label class="checkbox-wrap"><input type="checkbox" class="fmt-opt" id="opt-normalize" checked> Normalize headings</label>
      <label class="checkbox-wrap"><input type="checkbox" class="fmt-opt" id="opt-blanks" checked> Collapse blank lines</label>
      <label class="checkbox-wrap"><input type="checkbox" class="fmt-opt" id="opt-trailing" checked> Trim trailing spaces</label>
      <label class="checkbox-wrap"><input type="checkbox" class="fmt-opt" id="opt-list"> Normalize list markers</label>
      <label class="checkbox-wrap"><input type="checkbox" class="fmt-opt" id="opt-smarttypo"> ASCII quotes/dashes</label>
      <label class="checkbox-wrap"><input type="checkbox" class="fmt-opt" id="opt-newline" checked> Ensure final newline</label>
      <label class="checkbox-wrap"><input type="checkbox" class="fmt-opt" id="opt-diff"> Show diff</label>
    </div>
    <!-- Lint bar -->
    <div id="fmt-lint" style="padding:var(--sp-2) var(--sp-4);border-bottom:1px solid var(--border);min-height:32px;display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-1);flex-shrink:0;background:var(--surface)"></div>
    <!-- Editors -->
    <div class="split-2" style="flex:1;min-height:0">
      <div class="panel panel-editor">
        <div class="panel-header"><span class="panel-label">Input</span></div>
        <textarea id="fmt-input" class="code-editor" spellcheck="false" placeholder="Paste markdown to format…" aria-label="Markdown input"></textarea>
      </div>
      <div class="panel panel-preview" style="display:flex;flex-direction:column">
        <div class="panel-header"><span class="panel-label">Formatted</span></div>
        <textarea id="fmt-output" class="code-editor" spellcheck="false" readonly style="flex:1" aria-label="Formatted output"></textarea>
        <div id="fmt-diff" class="scroll-region" style="display:none;border-top:1px solid var(--border);max-height:240px;overflow:auto"></div>
      </div>
    </div>
  </div>
</div>`; }
