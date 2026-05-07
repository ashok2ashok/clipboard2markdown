import { extractLinks, copyText, downloadFile, toast, debounce } from '../../shared/utils.js';

let ctrl = null;

export default {
  id: 'links',
  title: 'Link Auditor',

  mount(container) {
    ctrl = new AbortController();
    const { signal } = ctrl;
    container.innerHTML = TEMPLATE();
    const el = s => container.querySelector(s);

    let allLinks = [];
    let filter = 'all'; // 'all' | 'inline' | 'ref' | 'image'

    function extract() {
      const md = el('#links-input').value;
      allLinks = extractLinks(md);
      el('#links-count').textContent = allLinks.length ? `${allLinks.length} links` : '';
      renderTable();
    }

    function renderTable() {
      const filtered = filter === 'all' ? allLinks : allLinks.filter(l => l.type === filter);
      const tbody = el('#links-tbody');

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:var(--sp-6);color:var(--text-muted)">
          ${allLinks.length ? 'No links match filter.' : 'No links found. Paste markdown above.'}
        </td></tr>`;
        return;
      }

      tbody.innerHTML = filtered.map((link, i) => {
        const typeLabel = { inline: 'Inline', ref: 'Reference', image: 'Image' }[link.type] || link.type;
        const typeBadge = `<span class="badge" style="background:${typeBg(link.type)};color:#fff">${typeLabel}</span>`;
        const urlDisplay = link.url
          ? `<a href="${escAttr(link.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);word-break:break-all" title="${escAttr(link.url)}">${esc(truncate(link.url, 60))}</a>`
          : `<span class="text-muted">[${esc(link.ref || '')}]</span>`;
        return `<tr>
          <td style="padding:var(--sp-2) var(--sp-3)">${typeBadge}</td>
          <td style="padding:var(--sp-2) var(--sp-3);color:var(--text)">${esc(link.text || link.alt || '')}</td>
          <td style="padding:var(--sp-2) var(--sp-3);font-size:var(--text-sm)">${urlDisplay}</td>
          <td style="padding:var(--sp-2) var(--sp-3)">
            <button class="btn btn-ghost btn-sm" data-idx="${i}" data-action="copy-url" title="Copy URL">
              <svg class="icon"><use href="#icon-copy"/></svg>
            </button>
          </td>
        </tr>`;
      }).join('');

      // Wire copy buttons
      tbody.querySelectorAll('[data-action="copy-url"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const idx = +btn.dataset.idx;
          const link = filtered[idx];
          if (link?.url) { await copyText(link.url); toast('URL copied!'); }
        }, { signal });
      });
    }

    function typeBg(type) {
      return { inline: '#3b82f6', ref: '#8b5cf6', image: '#10b981' }[type] || '#6b7280';
    }

    function exportCsv() {
      if (!allLinks.length) return;
      const rows = [['Type','Text','URL','Ref']];
      allLinks.forEach(l => rows.push([l.type, l.text||l.alt||'', l.url||'', l.ref||'']));
      const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
      downloadFile('links.csv', csv, 'text/csv');
    }

    function exportMarkdown() {
      if (!allLinks.length) return;
      const lines = allLinks.map(l => {
        if (l.type === 'image') return `![${l.alt||''}](${l.url||''})`;
        if (l.type === 'ref')   return `[${l.text}][${l.ref}]`;
        return `[${l.text}](${l.url||''})`;
      });
      downloadFile('links.md', lines.join('\n'));
    }

    const schedExtract = debounce(extract, 300);
    el('#links-input').addEventListener('input', schedExtract, { signal });

    // Filter tabs
    container.querySelectorAll('.link-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter;
        container.querySelectorAll('.link-filter-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderTable();
      }, { signal });
    });

    el('#btn-links-copy').addEventListener('click', async () => {
      const filtered = filter === 'all' ? allLinks : allLinks.filter(l => l.type === filter);
      const text = filtered.map(l => l.url || l.ref || '').filter(Boolean).join('\n');
      if (!text) return;
      await copyText(text);
      toast('URLs copied!');
    }, { signal });

    el('#btn-links-csv').addEventListener('click', exportCsv, { signal });
    el('#btn-links-md').addEventListener('click', exportMarkdown, { signal });

    el('#btn-links-clear').addEventListener('click', () => {
      el('#links-input').value = '';
      allLinks = [];
      el('#links-count').textContent = '';
      renderTable();
    }, { signal });

    // Initial render
    renderTable();
  },

  unmount() { ctrl?.abort(); ctrl = null; },
};

function esc(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function TEMPLATE() { return `
<div class="tool-shell">
  <div class="tool-header">
    <button class="menu-btn" aria-label="Open menu"><svg class="icon"><use href="#icon-menu"/></svg></button>
    <span class="tool-title">Link Auditor</span>
    <span class="tool-desc">Extract &amp; inspect all links</span>
    <div class="header-spacer"></div>
    <div class="tool-actions">
      <span id="links-count" class="badge" style="margin-right:var(--sp-2)"></span>
      <button class="btn btn-secondary btn-sm" id="btn-links-md">↓ MD</button>
      <button class="btn btn-secondary btn-sm" id="btn-links-csv">↓ CSV</button>
      <button class="btn btn-secondary btn-sm" id="btn-links-clear">Clear</button>
      <button class="btn btn-primary btn-sm" id="btn-links-copy"><svg class="icon"><use href="#icon-copy"/></svg> Copy URLs</button>
    </div>
  </div>
  <div class="tool-body flex-col" style="min-height:0">
    <!-- Input -->
    <div class="panel panel-editor" style="flex-shrink:0;border-bottom:1px solid var(--border)">
      <div class="panel-header"><span class="panel-label">Markdown Source</span></div>
      <textarea id="links-input" class="code-editor" style="height:180px" spellcheck="false"
        placeholder="Paste markdown with links…&#10;&#10;[Example](https://example.com)&#10;![Image](img.png)&#10;[Ref link][ref]&#10;&#10;[ref]: https://example.com" aria-label="Markdown source"></textarea>
    </div>
    <!-- Filter + Table -->
    <div style="display:flex;align-items:center;gap:var(--sp-3);padding:var(--sp-2) var(--sp-4);border-bottom:1px solid var(--border);background:var(--surface-2);flex-shrink:0">
      <span class="label" style="margin:0">Filter:</span>
      <div class="seg-ctrl">
        <button class="seg-btn link-filter-btn active" data-filter="all">All</button>
        <button class="seg-btn link-filter-btn" data-filter="inline">Inline</button>
        <button class="seg-btn link-filter-btn" data-filter="ref">Reference</button>
        <button class="seg-btn link-filter-btn" data-filter="image">Image</button>
      </div>
    </div>
    <div class="scroll-region" style="flex:1;overflow:auto">
      <table style="width:100%;border-collapse:collapse;font-size:var(--text-sm)">
        <thead style="position:sticky;top:0;background:var(--surface-2);z-index:1">
          <tr style="border-bottom:2px solid var(--border)">
            <th style="padding:var(--sp-2) var(--sp-3);text-align:left;font-weight:600;color:var(--text-muted);width:90px">Type</th>
            <th style="padding:var(--sp-2) var(--sp-3);text-align:left;font-weight:600;color:var(--text-muted)">Text / Alt</th>
            <th style="padding:var(--sp-2) var(--sp-3);text-align:left;font-weight:600;color:var(--text-muted)">URL / Ref</th>
            <th style="padding:var(--sp-2) var(--sp-3);width:40px"></th>
          </tr>
        </thead>
        <tbody id="links-tbody">
          <tr><td colspan="4" style="text-align:center;padding:var(--sp-6);color:var(--text-muted)">No links found. Paste markdown above.</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>`; }
