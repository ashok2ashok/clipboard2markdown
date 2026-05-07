// Shared pure utilities — no side effects, no imports

// ── Debounce ──
export function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── Download file ──
export function downloadFile(filename, content, mime = 'text/markdown;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── URL share (compress markdown → URL hash) ──
export async function compressToURL(text) {
  if (typeof CompressionStream === 'undefined') {
    return '#share/' + encodeURIComponent(text).slice(0, 4000);
  }
  try {
    const cs = new CompressionStream('deflate-raw');
    const writer = cs.writable.getWriter();
    writer.write(new TextEncoder().encode(text));
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return '#share/' + b64;
  } catch {
    return '#share/' + encodeURIComponent(text).slice(0, 4000);
  }
}

export async function decompressFromURL(hash) {
  const data = hash.replace(/^#share\//, '');
  if (data.startsWith('%')) return decodeURIComponent(data);
  try {
    const b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const buf = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const ds = new DecompressionStream('deflate-raw');
    const writer = ds.writable.getWriter();
    writer.write(buf);
    writer.close();
    return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
  } catch {
    return decodeURIComponent(data);
  }
}

// ── Word / char count ──
export function wordCount(text) {
  if (!text.trim()) return { words: 0, chars: 0, lines: 0 };
  return {
    words: text.trim().split(/\s+/).length,
    chars: text.length,
    lines: text.split('\n').length,
  };
}

// ── Escape HTML ──
export function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
          .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Smart typography ──
const RE_SQ    = /[‘’´]/g;
const RE_DQ    = /[“”″]/g;
const RE_DASH_S= /[−•·▪]/g;
const RE_EN    = /[–―]/g;
const RE_EM    = /—/g;
const RE_EL    = /…/g;

export function smartTypography(str) {
  return str
    .replace(RE_SQ,"'").replace(RE_DQ,'"')
    .replace(RE_DASH_S,'-').replace(RE_EN,'--').replace(RE_EM,'---')
    .replace(RE_EL,'...');
}

// ── Prettify markdown ──
const RE_CRLF = /\r\n?/g;
const RE_HDG  = /^#{1,6} /;
const isRow   = l => l.charCodeAt(0) === 124;

export function prettifyMarkdown(md) {
  const lines = md.replace(RE_CRLF,'\n').split('\n').map(l => l.trimEnd());
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const prev = out.length ? out[out.length - 1] : '';
    const cur  = lines[i];
    const next = lines[i + 1] ?? '';
    // collapse 3+ blanks
    if (!cur && !prev && (i === 0 || !out[out.length - 2])) continue;
    // blank before heading (not after table row)
    if (RE_HDG.test(cur) && prev && !isRow(prev) && prev !== '') out.push('');
    out.push(cur);
    // blank after heading (not before table row)
    if (RE_HDG.test(cur) && next && next !== '' && !isRow(next)) out.push('');
  }
  return out.join('\n').trim();
}

// ── Table to markdown ──
const RE_PIPE = /\|/g;
const RE_WS   = /\s+/g;

export function tableToMarkdown(table) {
  const rows = Array.from(table.querySelectorAll('tr'));
  if (!rows.length) return '';
  let headerIdx = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].closest('thead') || rows[i].querySelector('th')) { headerIdx = i; break; }
  }
  const data = rows.map(row =>
    Array.from(row.querySelectorAll('th,td')).map(cell =>
      cell.textContent.trim().replace(RE_WS,' ').replace(RE_PIPE,'\\|') || ' '
    )
  );
  const maxCols = Math.max(...data.map(r => r.length), 1);
  const padded = data.map(r => {
    const pad = maxCols - r.length;
    return pad > 0 ? [...r, ...Array(pad).fill('')] : r;
  });
  const lines = [];
  padded.forEach((cells, i) => {
    lines.push('| ' + cells.join(' | ') + ' |');
    if (i === headerIdx) {
      const seps = Array.from(rows[i].querySelectorAll('th,td')).map(cell => {
        const a = (cell.getAttribute('align') || '').toLowerCase();
        return a === 'right' ? '--:' : a === 'center' ? ':-:' : '---';
      });
      while (seps.length < maxCols) seps.push('---');
      lines.push('| ' + seps.join(' | ') + ' |');
    }
  });
  return lines.join('\n');
}

// ── Array-based table to markdown ──
export function rowsToMarkdown(data, alignments = []) {
  if (!data.length) return '';
  const maxCols = Math.max(...data.map(r => r.length));
  const colW = Array.from({ length: maxCols }, (_, ci) =>
    Math.max(3, ...data.map(r => (r[ci] || '').length))
  );
  const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length));
  const lines = data.map((row, ri) => {
    const cells = Array.from({ length: maxCols }, (_, ci) => pad(row[ci] || '', colW[ci]));
    const line = '| ' + cells.join(' | ') + ' |';
    if (ri === 0) {
      const seps = Array.from({ length: maxCols }, (_, ci) => {
        const a = alignments[ci] || 'left';
        const d = '-'.repeat(colW[ci]);
        return a === 'right' ? d.slice(0,-1) + ':' : a === 'center' ? ':' + d.slice(1,-1) + ':' : d;
      });
      return line + '\n| ' + seps.join(' | ') + ' |';
    }
    return line;
  });
  return lines.join('\n');
}

// ── GitHub heading slug ──
export function slugify(text) {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// ── Extract headings from markdown ──
export function extractHeadings(md) {
  const headings = [];
  const slugCount = {};
  const re = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    const level = m[1].length;
    const text = m[2].replace(/`[^`]*`/g, s => s.slice(1,-1)); // strip backticks
    let slug = slugify(text);
    if (slugCount[slug] !== undefined) {
      slugCount[slug]++;
      slug = slug + '-' + slugCount[slug];
    } else {
      slugCount[slug] = 0;
    }
    headings.push({ level, text, slug });
  }
  return headings;
}

// ── Parse links from markdown ──
export function extractLinks(md) {
  const links = [];
  // inline links: [text](url)
  const inlineRe = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  while ((m = inlineRe.exec(md)) !== null) {
    links.push({ text: m[1], url: m[2].trim(), type: 'inline', raw: m[0] });
  }
  // reference links: [text][id] + [id]: url
  const refRe = /^\[([^\]]+)\]:\s*(\S+)(?:\s+"[^"]*")?$/gm;
  while ((m = refRe.exec(md)) !== null) {
    links.push({ text: m[1], url: m[2].trim(), type: 'reference', raw: m[0] });
  }
  // images
  const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  while ((m = imgRe.exec(md)) !== null) {
    links.push({ text: m[1], url: m[2].trim(), type: 'image', raw: m[0] });
  }
  return links;
}

// ── Simple YAML front matter parser ──
export function parseFrontMatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!match) return { data: {}, body: content };
  const yaml = match[1];
  const body = content.slice(match[0].length);
  const data = {};
  const lines = yaml.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const kv = line.match(/^([^:#]+):\s*(.*)/);
    if (!kv) { i++; continue; }
    const key = kv[1].trim();
    let val = kv[2].trim();
    // array: next lines start with -
    if (val === '' && lines[i+1]?.match(/^\s+-\s/)) {
      const items = [];
      i++;
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        items.push(lines[i].replace(/^\s+-\s*/, '').trim());
        i++;
      }
      data[key] = items;
      continue;
    }
    // inline array
    if (val.startsWith('[')) {
      try { data[key] = JSON.parse(val); } catch { data[key] = val; }
    } else if (val === 'true') data[key] = true;
    else if (val === 'false') data[key] = false;
    else if (val !== '' && !isNaN(Number(val))) data[key] = Number(val);
    else data[key] = val.replace(/^["']|["']$/g, '');
    i++;
  }
  return { data, body };
}

export function serializeFrontMatter(data) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v)) {
      lines.push(`${k}:`);
      v.forEach(item => lines.push(`  - ${item}`));
    } else if (typeof v === 'string' && (v.includes(':') || v.includes('#') || v.includes("'"))) {
      lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// ── Myers diff (line-level) ──
export function diffLines(a, b) {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const n = aLines.length, m = bLines.length;

  // Guard for large inputs
  if (n + m > 10000) return simpleDiff(aLines, bLines);

  const max = n + m;
  const v = new Int32Array(2 * max + 1);
  const trace = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max]))
        ? v[k + 1 + max]
        : v[k - 1 + max] + 1;
      let y = x - k;
      while (x < n && y < m && aLines[x] === bLines[y]) { x++; y++; }
      v[k + max] = x;
      if (x >= n && y >= m) return backtrack(trace, aLines, bLines, max);
    }
  }
  return simpleDiff(aLines, bLines);
}

function backtrack(trace, aLines, bLines, max) {
  const ops = [];
  let x = aLines.length, y = bLines.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const k = x - y;
    const prevK = (k === -d || (k !== d && v[k - 1 + max] < v[k + 1 + max])) ? k + 1 : k - 1;
    const prevX = v[prevK + max];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) { ops.unshift({ type: 'eq', a: x-1, b: y-1 }); x--; y--; }
    if (d > 0) {
      if (x > prevX) { ops.unshift({ type: 'del', a: x-1 }); x--; }
      else { ops.unshift({ type: 'ins', b: y-1 }); y--; }
    }
  }
  return { ops, aLines, bLines };
}

function simpleDiff(aLines, bLines) {
  const ops = [];
  const maxLen = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < aLines.length && i < bLines.length) {
      if (aLines[i] === bLines[i]) ops.push({ type: 'eq', a: i, b: i });
      else { ops.push({ type: 'del', a: i }); ops.push({ type: 'ins', b: i }); }
    } else if (i < aLines.length) ops.push({ type: 'del', a: i });
    else ops.push({ type: 'ins', b: i });
  }
  return { ops, aLines, bLines };
}

// ── Copy to clipboard with fallback ──
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text, style: 'position:fixed;opacity:0'
    });
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return true;
  }
}

// ── Toast helper ──
export function toast(message, type = 'default', duration = 2500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  if (type === 'success') el.style.setProperty('--toast-accent', 'var(--success)');
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'toast-out 200ms var(--ease-io) both';
    setTimeout(() => el.remove(), 210);
  }, duration);
}

// ── Format relative time ──
export function relTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s/60) + 'm ago';
  if (s < 86400) return Math.floor(s/3600) + 'h ago';
  return Math.floor(s/86400) + 'd ago';
}
