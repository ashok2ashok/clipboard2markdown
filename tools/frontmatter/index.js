import { parseFrontMatter, serializeFrontMatter, copyText, downloadFile, toast, debounce } from '../../shared/utils.js';

let ctrl = null;

export default {
  id: 'frontmatter',
  title: 'Front Matter',

  mount(container) {
    ctrl = new AbortController();
    const { signal } = ctrl;
    container.innerHTML = TEMPLATE();
    const el = s => container.querySelector(s);

    let fields = []; // [{ key, value, type }]

    function parse() {
      const src = el('#fm-input').value;
      const { data, content } = parseFrontMatter(src);
      el('#fm-content').value = content.trimStart();
      fields = Object.entries(data).map(([key, value]) => ({
        key,
        value,
        type: inferType(value),
      }));
      renderFields();
      renderOutput();
    }

    function inferType(value) {
      if (Array.isArray(value)) return 'array';
      if (typeof value === 'boolean') return 'boolean';
      if (typeof value === 'number') return 'number';
      return 'string';
    }

    function renderFields() {
      const list = el('#fm-fields');
      list.innerHTML = '';
      fields.forEach((f, i) => {
        const row = document.createElement('div');
        row.className = 'fm-row';
        row.innerHTML = `
          <input class="fm-key input" value="${esc(f.key)}" placeholder="key" aria-label="Field key ${i+1}">
          <select class="fm-type select" aria-label="Field type ${i+1}">
            <option value="string"${f.type==='string'?' selected':''}>string</option>
            <option value="number"${f.type==='number'?' selected':''}>number</option>
            <option value="boolean"${f.type==='boolean'?' selected':''}>bool</option>
            <option value="array"${f.type==='array'?' selected':''}>array</option>
          </select>
          ${renderValueInput(f, i)}
          <button class="btn btn-ghost btn-sm fm-del" aria-label="Delete field ${i+1}" title="Delete">
            <svg class="icon"><use href="#icon-x"/></svg>
          </button>`;
        const keyInp = row.querySelector('.fm-key');
        const typeInp = row.querySelector('.fm-type');
        const delBtn = row.querySelector('.fm-del');

        keyInp.addEventListener('input', () => { fields[i].key = keyInp.value; schedRender(); }, { signal });
        typeInp.addEventListener('change', () => {
          fields[i].type = typeInp.value;
          fields[i].value = defaultForType(typeInp.value);
          renderFields();
          renderOutput();
        }, { signal });
        delBtn.addEventListener('click', () => {
          fields.splice(i, 1);
          renderFields();
          renderOutput();
        }, { signal });

        // Wire value input(s)
        wireValueInputs(row, i, signal);
        list.appendChild(row);
      });
    }

    function renderValueInput(f, i) {
      if (f.type === 'boolean') {
        return `<label class="checkbox-wrap fm-val" style="flex:1"><input type="checkbox" class="fm-val-bool"${f.value?' checked':''}> ${f.value ? 'true' : 'false'}</label>`;
      }
      if (f.type === 'array') {
        const items = Array.isArray(f.value) ? f.value : [];
        return `<div class="fm-val" style="flex:1;display:flex;flex-direction:column;gap:4px">
          ${items.map((v, j) => `<div style="display:flex;gap:4px"><input class="fm-arr-item input" data-j="${j}" value="${esc(String(v))}" placeholder="item ${j+1}" style="flex:1"><button class="btn btn-ghost btn-sm fm-arr-del" data-j="${j}" title="Remove item">−</button></div>`).join('')}
          <button class="btn btn-ghost btn-sm fm-arr-add" style="align-self:flex-start">+ item</button>
        </div>`;
      }
      return `<input class="fm-val-inp input" style="flex:1" value="${esc(String(f.value ?? ''))}" placeholder="value" aria-label="Field value ${i+1}">`;
    }

    function wireValueInputs(row, i, signal) {
      const f = fields[i];
      if (f.type === 'boolean') {
        const cb = row.querySelector('.fm-val-bool');
        cb?.addEventListener('change', () => {
          fields[i].value = cb.checked;
          cb.nextSibling && (cb.parentElement.lastChild.textContent = cb.checked ? 'true' : 'false');
          schedRender();
        }, { signal });
      } else if (f.type === 'array') {
        row.querySelectorAll('.fm-arr-item').forEach(inp => {
          inp.addEventListener('input', () => {
            const j = +inp.dataset.j;
            if (!Array.isArray(fields[i].value)) fields[i].value = [];
            fields[i].value[j] = inp.value;
            schedRender();
          }, { signal });
        });
        row.querySelectorAll('.fm-arr-del').forEach(btn => {
          btn.addEventListener('click', () => {
            const j = +btn.dataset.j;
            fields[i].value.splice(j, 1);
            renderFields();
            renderOutput();
          }, { signal });
        });
        row.querySelector('.fm-arr-add')?.addEventListener('click', () => {
          if (!Array.isArray(fields[i].value)) fields[i].value = [];
          fields[i].value.push('');
          renderFields();
          renderOutput();
        }, { signal });
      } else {
        const inp = row.querySelector('.fm-val-inp');
        inp?.addEventListener('input', () => {
          fields[i].value = f.type === 'number' ? +inp.value : inp.value;
          schedRender();
        }, { signal });
      }
    }

    function defaultForType(type) {
      if (type === 'boolean') return false;
      if (type === 'number') return 0;
      if (type === 'array') return [];
      return '';
    }

    function renderOutput() {
      const data = {};
      fields.forEach(f => { if (f.key.trim()) data[f.key.trim()] = f.value; });
      const body = el('#fm-content').value;
      el('#fm-output').value = body.trim()
        ? serializeFrontMatter(data) + '\n' + body
        : serializeFrontMatter(data);
    }

    const schedRender = debounce(renderOutput, 150);

    el('#btn-fm-add').addEventListener('click', () => {
      fields.push({ key: '', value: '', type: 'string' });
      renderFields();
    }, { signal });

    el('#fm-content').addEventListener('input', schedRender, { signal });

    el('#fm-input').addEventListener('input', debounce(parse, 300), { signal });

    el('#btn-fm-parse').addEventListener('click', parse, { signal });

    el('#btn-fm-copy').addEventListener('click', async () => {
      await copyText(el('#fm-output').value || '');
      toast('Copied!');
    }, { signal });

    el('#btn-fm-download').addEventListener('click', () => {
      downloadFile('document.md', el('#fm-output').value || '');
    }, { signal });

    el('#btn-fm-clear').addEventListener('click', () => {
      el('#fm-input').value = '';
      el('#fm-content').value = '';
      el('#fm-output').value = '';
      el('#fm-fields').innerHTML = '';
      fields = [];
    }, { signal });
  },

  unmount() { ctrl?.abort(); ctrl = null; },
};

function esc(s = '') {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function TEMPLATE() { return `
<div class="tool-shell">
  <div class="tool-header">
    <button class="menu-btn" aria-label="Open menu"><svg class="icon"><use href="#icon-menu"/></svg></button>
    <span class="tool-title">Front Matter</span>
    <span class="tool-desc">Parse &amp; edit YAML front matter</span>
    <div class="header-spacer"></div>
    <div class="tool-actions">
      <button class="btn btn-secondary btn-sm" id="btn-fm-clear">Clear</button>
      <button class="btn btn-secondary btn-sm" id="btn-fm-download"><svg class="icon"><use href="#icon-download"/></svg></button>
      <button class="btn btn-primary btn-sm" id="btn-fm-copy"><svg class="icon"><use href="#icon-copy"/></svg> Copy</button>
    </div>
  </div>
  <div class="tool-body split-2" style="align-items:stretch">
    <!-- Left: input + parsed fields -->
    <div class="panel panel-editor" style="display:flex;flex-direction:column;min-height:0">
      <div class="panel-header">
        <span class="panel-label">Source Markdown</span>
        <button class="btn btn-secondary btn-sm" id="btn-fm-parse" style="margin-left:auto">Parse</button>
      </div>
      <textarea id="fm-input" class="code-editor" style="height:160px;flex-shrink:0" spellcheck="false"
        placeholder="---&#10;title: My Post&#10;date: 2024-01-01&#10;tags: [markdown, tools]&#10;draft: false&#10;---&#10;&#10;Content here…" aria-label="Source markdown with front matter"></textarea>
      <div style="border-top:1px solid var(--border);padding:var(--sp-3) var(--sp-4);background:var(--surface-2);flex-shrink:0;display:flex;align-items:center;gap:var(--sp-3)">
        <span class="label" style="margin:0">Fields</span>
        <button class="btn btn-secondary btn-sm" id="btn-fm-add" style="margin-left:auto">+ Add Field</button>
      </div>
      <div id="fm-fields" style="overflow-y:auto;flex:1;padding:var(--sp-3) var(--sp-4);display:flex;flex-direction:column;gap:var(--sp-2)"></div>
    </div>
    <!-- Right: body editor + output -->
    <div class="panel panel-preview" style="display:flex;flex-direction:column;min-height:0">
      <div class="panel-header"><span class="panel-label">Document Body</span></div>
      <textarea id="fm-content" class="code-editor" style="height:160px;flex-shrink:0" spellcheck="false"
        placeholder="Markdown content (without front matter)…" aria-label="Document body"></textarea>
      <div style="border-top:1px solid var(--border);padding:var(--sp-3) var(--sp-4);background:var(--surface-2);flex-shrink:0">
        <span class="panel-label">Output</span>
      </div>
      <textarea id="fm-output" class="code-editor" style="flex:1" spellcheck="false" readonly aria-label="Output with front matter"></textarea>
    </div>
  </div>
</div>`; }
