// Lazy CDN loader — each dep loaded once, SRI-verified, cached as Promise

const cache = new Map();

const REGISTRY = {
  turndown: {
    url: 'https://cdn.jsdelivr.net/npm/turndown@7.2.0/dist/turndown.js',
    integrity: 'sha384-OGauEFaI5hnS8jXK4qdSGShAUAObMBKoLXgcL1ORhRh7ulx5jPZH35qVpacIEA4Z',
    global: 'TurndownService',
  },
  turndownGfm: {
    url: 'https://cdn.jsdelivr.net/npm/turndown-plugin-gfm@1.0.2/dist/turndown-plugin-gfm.js',
    integrity: 'sha384-2TroN1N6OfLQ+K4qttptnIfMREzUlMa3hW/nZqDZXv7Sm9BkESfGEupDEqCbzyRl',
    global: 'turndownPluginGfm',
  },
  marked: {
    url: 'https://cdn.jsdelivr.net/npm/marked@15.0.7/marked.min.js',
    integrity: 'sha384-H+hy9ULve6xfxRkWIh/YOtvDdpXgV2fmAGQkIDTxIgZwNoaoBal14Di2YTMR6MzR',
    global: 'marked',
  },
  dompurify: {
    url: 'https://cdn.jsdelivr.net/npm/dompurify@3.2.4/dist/purify.min.js',
    integrity: 'sha384-eEu5CTj3qGvu9PdJuS+YlkNi7d2XxQROAFYOr59zgObtlcux1ae1Il3u7jvdCSWu',
    global: 'DOMPurify',
  },
  githubCss: {
    url: 'https://cdn.jsdelivr.net/npm/github-markdown-css@5.8.1/github-markdown.min.css',
    integrity: 'sha384-CB5UrozGPrZ1wtKN7zzu52o1nSIKg24++ku8W0R+0l+XR5Rs3MQijT9HywGelTAH',
    type: 'css',
  },
};

function loadScript(name) {
  const reg = REGISTRY[name];
  return new Promise((resolve, reject) => {
    if (window[reg.global]) return resolve(window[reg.global]);
    const s = document.createElement('script');
    s.src = reg.url;
    s.integrity = reg.integrity;
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window[reg.global]);
    s.onerror = () => reject(new Error(`Failed to load ${name}`));
    document.head.appendChild(s);
  });
}

function loadCSS(name) {
  const reg = REGISTRY[name];
  return new Promise((resolve, reject) => {
    if (document.querySelector(`link[href="${reg.url}"]`)) return resolve();
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = reg.url;
    l.integrity = reg.integrity;
    l.crossOrigin = 'anonymous';
    l.onload = resolve;
    l.onerror = () => reject(new Error(`Failed to load ${name} CSS`));
    document.head.appendChild(l);
  });
}

export function load(...names) {
  return Promise.all(names.map(name => {
    if (!cache.has(name)) {
      const reg = REGISTRY[name];
      if (!reg) return Promise.reject(new Error(`Unknown dep: ${name}`));
      cache.set(name, reg.type === 'css' ? loadCSS(name) : loadScript(name));
    }
    return cache.get(name);
  }));
}

// Convenience: load deps needed for HTML→Markdown conversion
export async function loadConvertDeps() {
  const [TD, gfm] = await load('turndown', 'turndownGfm', 'dompurify');
  return { TurndownService: TD, turndownPluginGfm: gfm };
}

// Convenience: load deps needed for Markdown preview
export async function loadPreviewDeps() {
  const [mk, dp] = await load('marked', 'dompurify', 'githubCss');
  return { marked: mk, DOMPurify: dp };
}

// Build configured Turndown converter
export function buildConverter(flavor) {
  const FLAVORS = {
    gfm:           { headingStyle:'atx', tables:true,  strikethrough:true,  taskLists:true  },
    commonmark:    { headingStyle:'atx', tables:false, strikethrough:false, taskLists:false },
    pandoc:        { headingStyle:'atx', tables:true,  strikethrough:true,  taskLists:false },
    rmarkdown:     { headingStyle:'atx', tables:true,  strikethrough:true,  taskLists:false },
    multimarkdown: { headingStyle:'atx', tables:true,  strikethrough:false, taskLists:false },
  };
  const f = FLAVORS[flavor] || FLAVORS.gfm;
  const td = new window.TurndownService({
    headingStyle: f.headingStyle, hr: '---',
    bulletListMarker: '-', codeBlockStyle: 'fenced',
    fence: '```', emDelimiter: '*', strongDelimiter: '**', linkStyle: 'inlined',
  });
  const gfm = window.turndownPluginGfm;
  if (f.strikethrough && gfm) td.use(gfm.strikethrough);
  if (f.taskLists && gfm)    td.use(gfm.taskListItems);
  if (!f.tables)              td.keep(['table']);
  td.addRule('sup', { filter: 'sup', replacement: c => `^${c}^` });
  td.addRule('sub', { filter: 'sub', replacement: c => `~${c}~` });
  return td;
}
