/* kidvo SDK — include it in your app with:
 *   <script src="../../shell/sdk.js"></script>
 *
 * It gives you window.kidvo:
 *   kidvo.ready(fn)            fn({ appId, winId }) once the desktop said hello
 *   kidvo.emit(topic, data)    tell everyone something happened (topic becomes "<your-app-id>:<topic>")
 *   kidvo.on(pattern, fn)      listen: "maze:solved", "maze:*", "shell:windows" or "*" (up to 32 patterns per app)
 *   kidvo.open(appId)          open another app
 *   kidvo.notify(text)         show a small toast on the desktop
 *   kidvo.setTitle(text)       change your window title
 *   kidvo.windows()            list open windows with their positions
 *   kidvo.apps()               list installed apps: [{ id, name, type, skills, open }] (skills from the manifest)
 *   kidvo.lang                 the language the player chose: "en", "hu", "ro", ...
 *   kidvo.onLang(fn)           fn(lang) now and whenever the player switches language
 *   kidvo.t(key, vars)         your text in the current language, e.g. kidvo.t('steps', { n: 3 })
 *                              (falls back to English; keys ending in _one/_few/_other are plural forms)
 *   kidvo.band                 who is playing: "explorers" (7–9), "investigators" (10–13), or null until a child chose
 *   kidvo.onBand(fn)           fn(band) now and whenever it changes (a child may change it in another game)
 *   kidvo.setBand(band)        the child chose in your game: the desktop remembers it and every game hears it.
 *                              Your page's <html> carries data-band="explorers" or "investigators" for your CSS.
 *   kidvo.sprite(rows, opts)   pixel art without image files. rows are strings, one letter per pixel, "." for empty:
 *                              K ink, W white, R coral, Y yellow, and your own in opts.colors ({ G: '#7be0c3' }).
 *                              Returns an inline <svg>; opts.scale: 3 makes every pixel 3px (without it your CSS
 *                              sets the size). Pixels of the letter opts.led get class="led" for your CSS to blink.
 *   kidvo.speak(text, {fresh}) read a line aloud when the player switched read-aloud on (in the top bar), with a voice
 *                              that runs on the device only; fresh: true drops what was still waiting to be read.
 *                              Resolves true if it will be read. Games never use speechSynthesis themselves.
 *   kidvo.store.get/set/remove small per-app storage kept in the visitor's browser
 *   kidvo.setHotspot(rect)     overlays only: one clickable spot {x, y, w, h} (max 140x140); clicks arrive as "shell:poke"
 *                              ({ x, y, long }: long is true for a long press, a right-click or the context-menu key)
 *   kidvo.setModal(on)         built-in pet only; ignored for every other app. While on, Vo's overlay sits above
 *                              the windows and takes every click, for his garage card; off when the card closes
 *   kidvo.standalone           true when your page is opened outside the desktop
 *
 * Texts live in lang/<code>.js files in your folder, loaded after this script:
 *   kidvoStrings('en', { hello: 'Hello {name}!', steps_one: '{n} step', steps_other: '{n} steps' });
 *
 * All calls return Promises. Everything works (quietly) when opened standalone,
 * so you can develop your app by opening its index.html directly (?lang=hu and ?band=explorers work there).
 */
(() => {
  'use strict';
  const standalone = window.parent === window;
  const listeners = new Map();
  const pending = new Map();
  const readyFns = [];
  let info = null;
  let nextId = 0;

  /* ---------- language ---------- */
  const dictionaries = {};
  const langFns = new Set();
  const fromUrl = new URLSearchParams(location.search).get('lang');
  let lang = (fromUrl || (navigator.language || 'en')).slice(0, 2).toLowerCase();
  window.kidvoStrings = (code, strings) => { dictionaries[code] = Object.assign(dictionaries[code] || {}, strings); };
  function pick(code, key, vars) {
    const dict = dictionaries[code];
    if (!dict) return undefined;
    if (typeof vars.n === 'number') {
      let cat = 'other';
      try { cat = new Intl.PluralRules(code).select(vars.n); } catch { /* old browser */ }
      if (dict[key + '_' + cat] != null) return dict[key + '_' + cat];
      if (dict[key + '_other'] != null) return dict[key + '_other'];
    }
    return dict[key];
  }
  function t(key, vars) {
    vars = vars || {}; // null too: "no variables"
    const text = pick(lang, key, vars) ?? pick('en', key, vars) ?? key;
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  }
  function setLang(code) {
    if (!code || code === lang) return;
    lang = code;
    document.documentElement.lang = code;
    for (const fn of langFns) { try { fn(lang); } catch (err) { console.error('[kidvo]', err); } }
  }

  /* ---------- who is playing ---------- */
  const BANDS = ['explorers', 'investigators'];
  const bandFns = new Set();
  let band = null;
  function setBand(b) {
    if (!BANDS.includes(b) || b === band) return;
    band = b;
    document.documentElement.dataset.band = b;
    for (const fn of bandFns) { try { fn(band); } catch (err) { console.error('[kidvo]', err); } }
  }
  setBand(new URLSearchParams(location.search).get('band'));

  /* ---------- pixel art ---------- */
  // The same row strings as Vo's sprites (apps/pet/sprites.js), drawn as one <path> per colour.
  const PIXELS = { K: '#191833', W: '#ffffff', R: '#ff6b5b', Y: '#ffd23f' };
  function sprite(rows, opts = {}) {
    const NS = 'http://www.w3.org/2000/svg';
    const colors = Object.assign({}, PIXELS, opts.colors);
    const paths = {};
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (!colors[c]) continue;
        let w = 1;
        while (row[x + w] === c) w++;
        paths[c] = (paths[c] || '') + `M${x} ${y}h${w}v1h-${w}z`;
        x += w - 1;
      }
    });
    const cols = Math.max(0, ...rows.map(r => r.length));
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${cols} ${rows.length}`);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('aria-hidden', 'true');
    if (opts.scale > 0) { svg.setAttribute('width', cols * opts.scale); svg.setAttribute('height', rows.length * opts.scale); }
    for (const c of Object.keys(paths)) {
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('fill', colors[c]);
      p.setAttribute('d', paths[c]);
      if (c === opts.led) p.setAttribute('class', 'led');
      svg.append(p);
    }
    return svg;
  }

  const post = msg => { if (!standalone) window.parent.postMessage(Object.assign({ kidvo: 1 }, msg), '*'); };
  const matches = (p, t) => p === '*' || p === t || (p.endsWith(':*') && t.startsWith(p.slice(0, -1)));

  window.addEventListener('message', e => {
    if (e.source !== window.parent) return;
    const m = e.data;
    if (!m || m.kidvo !== 1) return;
    if (m.kind === 'init') {
      info = { appId: m.appId, winId: m.winId };
      setLang(m.lang);
      setBand(m.band);
      readyFns.splice(0).forEach(fn => fn(info));
    } else if (m.kind === 'lang') {
      setLang(m.lang);
    } else if (m.kind === 'band') {
      setBand(m.band);
    } else if (m.kind === 'event') {
      for (const [pattern, fns] of listeners) {
        if (!matches(pattern, m.topic)) continue;
        for (const fn of fns) {
          try { fn(m.data, { topic: m.topic, from: m.from }); } catch (err) { console.error('[kidvo]', err); }
        }
      }
    } else if (m.kind === 'reply') {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.reject(new Error(m.error)) : p.resolve(m.result);
    }
  });

  const call = (method, ...args) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    post({ kind: 'call', id, method, args });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error('kidvo: the desktop did not answer ' + method));
    }, 5000);
  });

  const mem = {};
  const kidvo = {
    standalone,
    ready(fn) { if (standalone) fn({ appId: null, winId: null }); else if (info) fn(info); else readyFns.push(fn); },
    emit(topic, data) { post({ kind: 'emit', topic: String(topic), data }); },
    on(pattern, fn) {
      if (!listeners.has(pattern)) { listeners.set(pattern, new Set()); post({ kind: 'sub', topic: pattern }); }
      listeners.get(pattern).add(fn);
      return () => listeners.get(pattern)?.delete(fn);
    },
    open: id => (standalone ? Promise.resolve(false) : call('open', id)),
    notify: text => (standalone ? Promise.resolve(false) : call('notify', String(text))),
    setTitle: text => (standalone ? Promise.resolve(false) : call('setTitle', String(text))),
    windows: () => (standalone ? Promise.resolve([]) : call('windows')),
    apps: () => (standalone ? Promise.resolve([]) : call('apps')),
    get lang() { return lang; },
    setHotspot(rect) { post({ kind: 'hotspot', rect: rect || null }); },
    setModal(on) { post({ kind: 'modal', on: !!on }); },
    onLang(fn) { langFns.add(fn); try { fn(lang); } catch (err) { console.error('[kidvo]', err); } return () => langFns.delete(fn); },
    // Silent until the desktop said hello: a card drawn before that (who is playing) is gone a moment later.
    speak: (text, opts = {}) => (standalone || !info || text == null ? Promise.resolve(false)
      : call('speak', String(text), opts.fresh === true).catch(() => false)),
    get band() { return band; },
    onBand(fn) { bandFns.add(fn); try { fn(band); } catch (err) { console.error('[kidvo]', err); } return () => bandFns.delete(fn); },
    // Takes effect here at once; the desktop's answer only says whether it was remembered for the other games.
    setBand(b) {
      if (!BANDS.includes(b)) return Promise.resolve(false);
      setBand(b);
      return standalone ? Promise.resolve(true) : call('setBand', b).catch(() => false);
    },
    t,
    sprite,
    store: standalone
      ? {
          get: async k => (k in mem ? mem[k] : null),
          set: async (k, v) => { mem[k] = JSON.parse(JSON.stringify(v)); return true; },
          remove: async k => { delete mem[k]; return true; }
        }
      : {
          get: k => call('store.get', k),
          set: (k, v) => call('store.set', k, v),
          remove: k => call('store.remove', k)
        }
  };
  window.kidvo = Object.freeze(kidvo);
  post({ kind: 'hello' });
})();
