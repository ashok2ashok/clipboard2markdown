(() => {
  'use strict';

  // ─── Flavor definitions ───────────────────────────────────────────────────
  const FLAVORS = {
    gfm: {
      label: 'GitHub Flavored (GFM)',
      headingStyle: 'atx',
      tables: true,
      strikethrough: true,
      taskLists: true,
    },
    commonmark: {
      label: 'CommonMark',
      headingStyle: 'atx',
      tables: false,   // strict spec: no table syntax → keep as HTML
      strikethrough: false,
      taskLists: false,
    },
    pandoc: {
      label: 'Pandoc',
      headingStyle: 'atx',
      tables: true,
      strikethrough: true,
      taskLists: false,
    },
    rmarkdown: {
      label: 'R Markdown',
      headingStyle: 'atx',
      tables: true,
      strikethrough: true,
      taskLists: false,
    },
    multimarkdown: {
      label: 'MultiMarkdown',
      headingStyle: 'atx',
      tables: true,
      strikethrough: false,
      taskLists: false,
    },
  };

  // ─── DOM-based table → markdown ───────────────────────────────────────────
  // Pre-process tables using the real DOM before Turndown touches the HTML.
  // This bypasses Turndown's block-element flanking-whitespace logic that
  // inserts \n\n around every TR/TD/TBODY, causing blank lines between rows.
  //
  // Cell content uses textContent so inline formatting is kept simple.
  // For inline markdown inside cells (bold, links) Turndown would need to
  // re-enter — that tradeoff is acceptable for reliable table output.

  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';

    // Find the header row index (first row with <th> or inside <thead>)
    let headerIdx = 0;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].closest('thead') || rows[i].querySelector('th')) {
        headerIdx = i;
        break;
      }
    }

    const data = rows.map(row =>
      Array.from(row.querySelectorAll('th, td')).map(cell =>
        // collapse whitespace; escape pipes inside cell text
        cell.textContent.trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|') || ' '
      )
    );

    const maxCols = Math.max(...data.map(r => r.length), 1);

    // Pad all rows to equal width
    const padded = data.map(r => {
      const pad = maxCols - r.length;
      return pad > 0 ? [...r, ...Array(pad).fill('')] : r;
    });

    const lines = [];
    padded.forEach((cells, i) => {
      lines.push('| ' + cells.join(' | ') + ' |');
      if (i === headerIdx) {
        const seps = Array.from(rows[i].querySelectorAll('th, td')).map(cell => {
          const align = (cell.getAttribute('align') || '').toLowerCase();
          if (align === 'right')  return '--:';
          if (align === 'center') return ':-:';
          return '---';
        });
        while (seps.length < maxCols) seps.push('---');
        lines.push('| ' + seps.join(' | ') + ' |');
      }
    });

    return lines.join('\n');
  }

  // ─── Converter factory ────────────────────────────────────────────────────
  function buildConverter(flavorKey) {
    const flavor = FLAVORS[flavorKey];

    const td = new TurndownService({
      headingStyle:     flavor.headingStyle,
      hr:               '---',
      bulletListMarker: '-',
      codeBlockStyle:   'fenced',
      fence:            '```',
      emDelimiter:      '*',
      strongDelimiter:  '**',
      linkStyle:        'inlined',
    });

    // Use individual GFM plugins — NOT .gfm or .tables which add a `keep` rule
    // that silently preserves <td>-only tables as raw HTML.
    if (flavor.strikethrough) td.use(turndownPluginGfm.strikethrough);
    if (flavor.taskLists)     td.use(turndownPluginGfm.taskListItems);

    if (!flavor.tables) {
      // CommonMark: keep table HTML verbatim
      td.keep(['table']);
    }

    td.addRule('superscript', { filter: 'sup', replacement: c => `^${c}^` });
    td.addRule('subscript',   { filter: 'sub', replacement: c => `~${c}~` });

    return td;
  }

  // ─── marked: Markdown → HTML preview ─────────────────────────────────────
  marked.use({ breaks: true, gfm: true });

  // ─── Prettify ─────────────────────────────────────────────────────────────
  // Table-aware: never inserts blank lines adjacent to pipe-table rows.
  function prettify(md) {
    const lines = md
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(l => l.trimEnd());

    const out   = [];
    const isRow = l => /^\|/.test(l);

    for (let i = 0; i < lines.length; i++) {
      const prev = out.length > 0 ? out[out.length - 1] : '';
      const cur  = lines[i];
      const next = lines[i + 1] ?? '';

      // Collapse 3+ consecutive blank lines to 1
      if (!cur && !prev && (i === 0 || !out[out.length - 2])) continue;

      // Ensure blank line before ATX heading —
      // but NOT if previous line is a table row
      if (/^#{1,6} /.test(cur) && prev && !isRow(prev)) {
        if (prev !== '') out.push('');
      }

      out.push(cur);

      // Ensure blank line after ATX heading —
      // but NOT if next line is a table row (table can follow heading without gap)
      if (/^#{1,6} /.test(cur) && next && next !== '' && !isRow(next)) {
        out.push('');
      }
    }

    return out.join('\n').trim();
  }

  // ─── Smart typography (post-process, keeps td.escape intact for pipe tables)
  function smartTypography(str) {
    return str
      .replace(/[\u2018\u2019\u00b4]/g, "'")
      .replace(/[\u201c\u201d\u2033]/g,  '"')
      .replace(/[\u2212\u2022\u00b7\u25aa]/g, '-')
      .replace(/[\u2013\u2015]/g, '--')
      .replace(/\u2014/g, '---')
      .replace(/\u2026/g, '...');
  }

  // ─── State ────────────────────────────────────────────────────────────────
  let currentHtml   = '';
  let currentFlavor = 'gfm';

  const converters = Object.fromEntries(
    Object.keys(FLAVORS).map(k => [k, buildConverter(k)])
  );

  // ─── Mobile detection ─────────────────────────────────────────────────────
  const isMobile = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  // ─── DOM refs ─────────────────────────────────────────────────────────────
  const pastebin     = document.getElementById('pastebin');
  const output       = document.getElementById('output');
  const previewEl    = document.getElementById('preview-content');
  const htmlSource   = document.getElementById('html-source');
  const landing      = document.getElementById('landing');
  const app          = document.getElementById('app');
  const btnCopy      = document.getElementById('btn-copy');
  const flavorSelect = document.getElementById('flavor-select');

  // ─── Conversion pipeline ──────────────────────────────────────────────────
  function convert(html) {
    const flavor  = FLAVORS[currentFlavor];
    const td      = converters[currentFlavor];

    if (!flavor.tables) {
      // CommonMark: pass straight through
      return prettify(smartTypography(td.turndown(html)));
    }

    // Pre-process: extract tables from DOM, convert to markdown, replace with
    // unique placeholders that Turndown will pass through as plain text.
    const parser = new DOMParser();
    const doc    = parser.parseFromString(html, 'text/html');
    const tables = Array.from(doc.body.querySelectorAll('table'));

    const tableMap = new Map();
    tables.forEach((table, i) => {
      const key  = `XXTBL${i}XX`;
      const mdTbl = tableToMarkdown(table);
      tableMap.set(key, mdTbl);

      const placeholder = doc.createElement('p');
      placeholder.textContent = key;
      table.parentNode.replaceChild(placeholder, table);
    });

    let md = td.turndown(doc.body.innerHTML);

    // Restore table markdown in place of placeholders
    tableMap.forEach((mdTbl, key) => {
      md = md.replace(key, '\n\n' + mdTbl);
    });

    return prettify(smartTypography(md));
  }

  // ─── View switching ───────────────────────────────────────────────────────
  function showApp()     { landing.classList.add('d-none');    app.classList.remove('d-none'); }
  function showLanding() { app.classList.add('d-none'); landing.classList.remove('d-none'); }

  document.getElementById('nav-brand').addEventListener('click', showLanding);

  // ─── Preview sync ─────────────────────────────────────────────────────────
  function updatePreview() {
    previewEl.innerHTML = DOMPurify.sanitize(marked.parse(output.value || ''));
  }

  output.addEventListener('input', updatePreview);

  // ─── Flavor change → re-convert stored HTML ───────────────────────────────
  flavorSelect.addEventListener('change', () => {
    currentFlavor = flavorSelect.value;
    if (currentHtml) {
      output.value = convert(currentHtml);
      updatePreview();
      output.focus();
      output.select();
    }
  });

  // ─── Process pasted HTML ──────────────────────────────────────────────────
  function processHtml(html) {
    if (!html) return;
    currentHtml = html;
    htmlSource.textContent = html;
    showApp();
    output.value = convert(html);
    updatePreview();
    output.focus();
    output.select();
  }

  // ─── Paste via Clipboard API (mobile) ────────────────────────────────────
  async function pasteFromClipboard() {
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          if (item.types.includes('text/html')) {
            const blob = await item.getType('text/html');
            processHtml(await blob.text());
            return;
          }
          if (item.types.includes('text/plain')) {
            const blob = await item.getType('text/plain');
            const text = (await blob.text()).trim();
            if (text) processHtml('<p>' + text.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>');
            return;
          }
        }
      } catch {
        // Permission denied or API unavailable — fall through to paste zone
      }
    }
    // Fallback: focus the visible paste zone so the user can long-press → Paste
    const zone = document.getElementById('mobile-paste-zone');
    if (zone) zone.focus();
  }

  // ─── Mobile paste zone (long-press → native paste) ───────────────────────
  const mobilePasteZone = document.getElementById('mobile-paste-zone');
  if (mobilePasteZone) {
    mobilePasteZone.addEventListener('paste', e => {
      e.preventDefault();
      const cd  = e.clipboardData;
      const html = cd.getData('text/html');
      const text = cd.getData('text/plain').trim();
      mobilePasteZone.textContent = '';
      if (html) {
        processHtml(html);
      } else if (text) {
        processHtml('<p>' + text.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>');
      }
    });
  }

  // ─── Paste capture (desktop keyboard shortcut) ────────────────────────────
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      pastebin.innerHTML = '';
      pastebin.focus();
    }
  });

  pastebin.addEventListener('paste', () => {
    setTimeout(() => {
      const html = pastebin.innerHTML;
      pastebin.innerHTML = '';
      processHtml(html);
    }, 0);
  });

  // ─── Toolbar: Prettify ────────────────────────────────────────────────────
  document.getElementById('btn-prettify').addEventListener('click', () => {
    if (!output.value) return;
    output.value = prettify(output.value);
    updatePreview();
  });

  // ─── Toolbar: Copy ────────────────────────────────────────────────────────
  btnCopy.addEventListener('click', async () => {
    if (!output.value) return;
    await navigator.clipboard.writeText(output.value);
    btnCopy.textContent = 'Copied!';
    btnCopy.classList.add('copied');
    setTimeout(() => { btnCopy.textContent = 'Copy'; btnCopy.classList.remove('copied'); }, 1500);
  });

  // ─── Toolbar: Clear → landing ─────────────────────────────────────────────
  document.getElementById('btn-clear').addEventListener('click', () => {
    currentHtml = '';
    output.value = '';
    previewEl.innerHTML = '';
    htmlSource.textContent = '';
    document.getElementById('html-accordion').removeAttribute('open');
    showLanding();
  });

  // ─── Bootstrap dark mode ──────────────────────────────────────────────────
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = dark =>
    document.documentElement.setAttribute('data-bs-theme', dark ? 'dark' : 'light');
  applyTheme(mq.matches);
  mq.addEventListener('change', e => applyTheme(e.matches));

  // ─── Mobile UI setup ──────────────────────────────────────────────────────
  function setupMobileUI() {
    if (!isMobile) return;

    const stepCopy  = document.getElementById('step-copy');
    const stepPaste = document.getElementById('step-paste');
    if (stepCopy)  stepCopy.innerHTML  = 'Copy rich text anywhere (long-press → <strong>Copy</strong>)';
    if (stepPaste) stepPaste.innerHTML = 'Tap <strong>Paste from Clipboard</strong> below';

    document.getElementById('btn-mobile-paste')    ?.classList.remove('d-none');
    document.getElementById('mobile-paste-zone')   ?.classList.remove('d-none');
    document.getElementById('btn-mobile-paste-app')?.classList.remove('d-none');
  }

  // ─── On-load clipboard detection (mobile, permission already granted) ─────
  async function checkClipboardOnLoad() {
    if (!isMobile || !navigator.permissions || !navigator.clipboard?.read) return;
    try {
      const perm = await navigator.permissions.query({ name: 'clipboard-read' });
      if (perm.state !== 'granted') return;
      const items = await navigator.clipboard.read();
      const hasContent = items.some(item =>
        item.types.includes('text/html') || item.types.includes('text/plain')
      );
      if (!hasContent) return;
      const banner = document.getElementById('clipboard-banner');
      if (banner) banner.classList.remove('d-none');
    } catch {
      // Silently ignore — permission API or clipboard unavailable
    }
  }

  // ─── Mobile button wiring ─────────────────────────────────────────────────
  const clipboardBanner   = document.getElementById('clipboard-banner');
  const btnMobilePaste    = document.getElementById('btn-mobile-paste');
  const btnMobilePasteApp = document.getElementById('btn-mobile-paste-app');
  const btnBannerPaste    = document.getElementById('btn-banner-paste');
  const btnBannerDismiss  = document.getElementById('btn-banner-dismiss');

  btnMobilePaste   ?.addEventListener('click', pasteFromClipboard);
  btnMobilePasteApp?.addEventListener('click', pasteFromClipboard);
  btnBannerPaste   ?.addEventListener('click', () => {
    clipboardBanner?.classList.add('d-none');
    pasteFromClipboard();
  });
  btnBannerDismiss ?.addEventListener('click', () => clipboardBanner?.classList.add('d-none'));

  setupMobileUI();
  checkClipboardOnLoad();
})();
