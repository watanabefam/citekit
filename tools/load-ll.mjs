// Load citekit's real shipping script (index.html) under a minimal DOM stub, so the
// adapters / ranking / dedupe can be driven from Node without a browser.
//
// This is the same technique tests/verify.mjs uses; it is factored out here so scripts under
// tools/ can reuse it without importing the test file. If you change index.html's globals,
// change this once.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function repoRoot(from = HERE) {
  return path.resolve(from, '..');
}

function installDomStub() {
  const noop = () => {};
  const makeEl = (tag = 'div') => ({
    tagName: tag, _l: {}, children: [], style: {}, dataset: {}, _h: '', _t: '',
    classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
      toggle(c,f){ if(f===undefined) f=!this._s.has(c); f?this._s.add(c):this._s.delete(c); return f; },
      contains(c){return this._s.has(c);} },
    addEventListener(ev, fn){ (this._l[ev] ||= []).push(fn); },
    dispatch(ev, obj){ (this._l[ev] || []).forEach(fn => fn(Object.assign({ preventDefault: noop, key: '' }, obj))); },
    appendChild(c){ this.children.push(c); return c; },
    append(...cs){ cs.forEach(c => this.children.push(c)); },
    prepend(c){ this.children.unshift(c); },
    insertAdjacentHTML(pos, h){ this._h += h; },
    setAttribute(k, v){ this['_a_' + k] = v; }, getAttribute(k){ return this['_a_' + k]; },
    querySelector(){ return makeEl(); },
    querySelectorAll(sel){ return sel === 'sup.cite' ? [] : []; },
    click(){ this.dispatch('click'); }, remove(){},
    focus: noop, close: noop, showModal: noop, scrollIntoView: noop,
    set textContent(v){ this._t = String(v); }, get textContent(){ return this._t; },
    set innerHTML(v){ this._h = String(v); }, get innerHTML(){ return this._h; },
    set className(v){ this.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); },
    get className(){ return [...this.classList._s].join(' '); },
    set disabled(v){ this._d = v; }, get disabled(){ return this._d; },
    value: '', checked: false, href: '', download: ''
  });

  const els = {};
  const q = s => els[s] || (els[s] = makeEl());
  const tabs = ['search', 'library'].map(t => { const e = makeEl(); e.dataset.tab = t; return e; });

  global.document = {
    getElementById: id => q('#' + id),
    querySelector: q, createElement: makeEl,
    querySelectorAll: sel => (sel === '.tab' ? tabs : []),
    addEventListener: noop, body: makeEl()
  };
  global.window = { addEventListener: noop, hermes: undefined };
  global.location = { origin: 'http://127.0.0.1:8777' };
  global.alert = m => { process.stderr.write('   [alert] ' + m + '\n'); };
  global.confirm = () => true;
  global.prompt = () => null;
  const store = {};
  global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  // Minimal arXiv-Atom parser: enough to exercise the real adapter's entry handling.
  global.DOMParser = class {
    parseFromString(xml) {
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map(m => {
        const inner = m[1];
        const title = (inner.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '';
        const summary = (inner.match(/<summary>([\s\S]*?)<\/summary>/) || [])[1] || '';
        const pdfTag = [...inner.matchAll(/<link\b[^>]*>/g)].map(x => x[0]).find(t => /title="pdf"/.test(t)) || '';
        const pdf = (pdfTag.match(/href="([^"]+)"/) || [])[1] || '';
        const published = (inner.match(/<published>([\s\S]*?)<\/published>/) || [])[1] || '';
        return {
          querySelector: sel => ({
            textContent: sel === 'title' ? title : sel === 'summary' ? summary : sel === 'published' ? published : '',
            getAttribute: () => (sel.startsWith('link') ? pdf : null)
          }),
          querySelectorAll: () => []
        };
      });
      return { querySelectorAll: sel => (sel === 'entry' ? entries : []) };
    }
  };
  global.URL.createObjectURL = () => 'blob:x';
  global.URL.revokeObjectURL = noop;
}

/** Load index.html and return its `window.LL` API. */
export async function loadLL(root = repoRoot()) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const m = html.match(/<script>([\s\S]*)<\/script>/);
  if (!m) throw new Error('could not find the <script> block in index.html');
  installDomStub();
  new Function('window', 'location', m[1])(global.window, global.location);
  const LL = global.window.LL;
  if (!LL) throw new Error('index.html did not expose window.LL');
  await new Promise(r => setTimeout(r, 50)); // let any load-time microtasks settle
  return LL;
}

export default loadLL;
