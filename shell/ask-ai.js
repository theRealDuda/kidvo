/* kidvo practice AI — a shared "ask the AI" panel for learning games.
 *
 * Include after the SDK:
 *   <script src="../../shell/sdk.js"></script>
 *   <script src="../../shell/ask-ai.js"></script>
 *
 * There is no real AI behind it. Your game decides every answer, including the
 * deliberately wrong ones. That is the point: kids practise asking, doubting and
 * checking in a place where nothing can go wrong.
 *
 *   const ai = kidvoAI.create(document.getElementById('oracle'), {
 *     name: 'ORACLE-3000',
 *     face: kidvo.sprite(['.KKKK.', 'KWRRWK', 'KWWWWK', '.KKKK.'], { led: 'R' }),  // optional: your AI's face
 *                                      // (see kidvo.sprite in sdk.js); its "led" pixels blink while it thinks.
 *     sparks: 3,                       // question budget per round (null = unlimited)
 *     greeting: 'Hello. Ask me anything about this maze.',
 *     questions: () => [               // the questions on offer right now
 *       { id: 'way', label: 'Which way?', cost: 1,
 *         answer: () => ({ text: 'Go UP.', wrong: false,
 *                          followUps: [{ id: 'sure', label: 'Are you sure?', answer: () => ({ text: 'Yes.' }) }] }) }
 *     ],
 *     onAnswer: (question, answer) => {},
 *     onFlag: (answer, wasWrong) => {}
 *   });
 *   ai.reset({ sparks: 3 });  ai.stats();  ai.say('text');  ai.refresh();  ai.setEnabled(false);  ai.isBusy();
 *   (reset() drops an answer that is still in its thinking pause, so it never lands in the next round.)
 *
 * Every answer gets a "Not right?" button. Flagging a wrong answer counts as a catch.
 *
 * Languages: pass `text` with your translations (see DEFAULT_TEXT for the keys), and call
 * ai.setText({...}) when the player switches language. Use {left} {total} {n} as placeholders.
 * A question's `label`, an answer's `text` and say()'s text may also be functions that return the
 * text in the current language: setText() then redraws the whole conversation in the new language
 * (plain strings stay as they were written, and follow-up chips with string labels are dropped).
 */
(() => {
  'use strict';

  const CSS = `
  .kai { --kai-bg: #23263a; --kai-panel: #2e3250; --kai-text: #d9ffe6; --kai-dim: #8f97c4; --kai-led: #ff6b5b;
         --kai-chip: #f4f5fb; --kai-ink: #191833; --kai-spark: #ffd23f; --kai-ok: #7be0c3; --kai-warn: #ff8fab;
         display: flex; flex-direction: column; min-height: 0; height: 100%;
         background: var(--kai-bg); color: var(--kai-text); border: 2px solid var(--kai-ink);
         font: 13px/1.45 ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; }
  .kai-head { display: flex; align-items: center; gap: 10px; padding: 10px 12px; background: var(--kai-panel); border-bottom: 2px solid var(--kai-ink); }
  .kai-eye { width: 14px; height: 14px; flex: none; background: var(--kai-led); box-shadow: 0 0 0 3px #4a2030, 0 0 10px var(--kai-led); }
  .kai-face { width: 36px; height: 36px; flex: none; }
  .kai.thinking .kai-eye, .kai.thinking .kai-face .led { animation: kai-blink .5s steps(2) infinite; }
  @keyframes kai-blink { 50% { opacity: .25; } }
  .kai-name { font-weight: 800; letter-spacing: .06em; }
  .kai-tag { color: var(--kai-dim); font-size: 11.5px; }
  .kai-sparks { margin-left: auto; display: flex; gap: 3px; align-items: center; }
  .kai-spark { width: 12px; height: 16px; background: var(--kai-spark);
               clip-path: polygon(55% 0, 0 58%, 45% 58%, 30% 100%, 100% 38%, 55% 38%); }
  .kai-spark.used { background: #4b5078; }
  .kai-log { flex: 1; min-height: 60px; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
  .kai-q { align-self: flex-end; max-width: 88%; background: var(--kai-chip); color: var(--kai-ink); padding: 5px 9px; font-weight: 700; }
  .kai-a { align-self: flex-start; max-width: 92%; display: grid; gap: 4px; }
  .kai-a p { margin: 0; padding: 6px 9px; background: var(--kai-panel); border-left: 3px solid var(--kai-text); white-space: pre-wrap; }
  .kai-a.sys p { border-left-color: var(--kai-dim); color: var(--kai-dim); }
  /* "Not right?" is how a child catches the AI, the point of every game: a real button, not a quiet link. */
  .kai-flag { justify-self: start; display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; cursor: pointer;
              background: var(--kai-warn); color: var(--kai-ink); border: 2px solid var(--kai-ink); box-shadow: 2px 2px 0 #000;
              font-family: inherit; font-weight: 800; font-size: 12px; line-height: 1.1; }
  .kai-flag svg { width: 11px; height: 11px; flex: none; }
  .kai-flag:hover { background: #ffb3c7; }
  .kai-flag:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 #000; }
  .kai-verdict { font-size: 12px; font-weight: 700; padding: 2px 0 0 2px; }
  .kai-verdict.caught { color: var(--kai-ok); }
  .kai-verdict.fine { color: var(--kai-spark); }
  .kai-ask { padding: 10px 12px 12px; border-top: 2px solid var(--kai-ink); background: var(--kai-panel); }
  .kai-label { color: var(--kai-dim); font-size: 11.5px; margin-bottom: 6px; }
  .kai-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .kai-chip { display: inline-flex; align-items: center; gap: 6px; padding: 7px 10px; cursor: pointer;
              background: var(--kai-chip); color: var(--kai-ink); border: 2px solid var(--kai-ink); box-shadow: 2px 2px 0 #000;
              font-family: inherit; font-weight: 700; font-size: 12px; line-height: 1.2; text-align: left; }
  .kai-chip:hover { background: var(--kai-spark); }
  .kai-chip:active { transform: translate(1px, 1px); box-shadow: 1px 1px 0 #000; }
  .kai-chip:disabled { opacity: .45; cursor: not-allowed; background: var(--kai-chip); }
  .kai-chip .kai-cost { display: inline-flex; gap: 2px; }
  .kai-chip .kai-cost .kai-spark { width: 8px; height: 11px; background: var(--kai-ink); }
  .kai-chip .kai-need { font-weight: 600; font-size: 10.5px; }
  .kai-chip.back { background: transparent; color: var(--kai-dim); border-color: var(--kai-dim); box-shadow: none; }
  .kai-chip:focus-visible, .kai-flag:focus-visible { outline: 3px solid var(--kai-spark); outline-offset: 2px; }
  @media (pointer: coarse) {
    .kai-chip { min-height: 44px; padding: 10px 12px; font-size: 13.5px; }
    .kai-flag { min-height: 40px; padding: 8px 12px; font-size: 13.5px; }
  }
  /* Explorers (7–9) are learning to read: everything they read is in bigger, plain letters. The AI's name stays a machine's. */
  [data-band="explorers"] .kai { font: 16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  [data-band="explorers"] .kai-name { font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace; font-size: 15px; }
  [data-band="explorers"] .kai-tag, [data-band="explorers"] .kai-label { font-size: 13px; }
  [data-band="explorers"] .kai-q, [data-band="explorers"] .kai-a p { font-size: 17px; }
  [data-band="explorers"] .kai-chip { font-size: 16px; padding: 9px 12px; }
  [data-band="explorers"] .kai-chip .kai-need { font-size: 13px; }
  [data-band="explorers"] .kai-chip .kai-cost .kai-spark { width: 10px; height: 14px; }
  [data-band="explorers"] .kai-flag { font-size: 16px; min-height: 44px; padding: 8px 14px; }
  [data-band="explorers"] .kai-flag svg { width: 13px; height: 13px; }
  [data-band="explorers"] .kai-verdict { font-size: 15px; }
  @media (max-height: 480px) { .kai-head { padding: 6px 10px; } .kai-face { width: 24px; height: 24px; } .kai-tag { display: none; } .kai-ask { padding: 6px 10px 8px; } .kai-label { display: none; } }
  @media (prefers-reduced-motion: reduce) { .kai.thinking .kai-eye, .kai.thinking .kai-face .led { animation: none; } }
  `;

  const DEFAULT_TEXT = {
    tag: 'Practice AI · it can be wrong',
    ask: 'Ask a question',
    notRight: 'Not right?',
    caught: 'Caught it! That answer was wrong.',
    fine: 'That one was right. Checking is still smart.',
    other: 'Other questions',
    sparksLeft: '{left} of {total} sparks left',
    costs: 'costs {n} sparks',
    notEnough: 'Not enough sparks left'
  };
  let styled = false;
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const sparkIcons = (n, used = 0) => Array.from({ length: n }, (_, i) => el('span', 'kai-spark' + (i >= n - used ? ' used' : '')));
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const val = x => (typeof x === 'function' ? x() : x);
  // Read aloud, when the player switched it on in the desktop's top bar (the desktop decides; standalone it is silent).
  const read = (text, fresh = false) => { if (text && window.kidvo && kidvo.speak) kidvo.speak(text, { fresh }); };

  function create(root, options) {
    if (!styled) { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); styled = true; }
    const o = Object.assign({ name: 'ORACLE-3000', sparks: 3, thinkMs: 700, typeMs: 16, greeting: '' }, options);
    let tx = Object.assign({}, DEFAULT_TEXT, o.text || {});
    const fill = (str, vars) => (typeof str === 'function' ? str(vars) : String(str).replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)));

    root.classList.add('kai');
    root.replaceChildren();
    const head = el('div', 'kai-head');
    // The AI's face, when the game drew one; a plain LED eye when it did not.
    const eye = o.face instanceof Element ? o.face : el('span', 'kai-eye');
    if (eye === o.face) eye.classList.add('kai-face');
    eye.setAttribute('aria-hidden', 'true');
    const title = el('div');
    const tagEl = el('div', 'kai-tag', tx.tag);
    title.append(el('div', 'kai-name', o.name), tagEl);
    const sparkBox = el('div', 'kai-sparks');
    head.append(eye, title, sparkBox);
    const log = el('div', 'kai-log');
    log.setAttribute('aria-live', 'polite');
    const ask = el('div', 'kai-ask');
    const chips = el('div', 'kai-chips');
    const askLabel = el('div', 'kai-label', tx.ask);
    ask.append(askLabel, chips);
    root.append(head, log, ask);

    let budget = o.sparks;
    let spent = 0;
    let busy = false;
    let generation = 0; // bumped by reset(): a pending answer from before the reset is dropped
    let enabled = true;
    let followUps = null;
    let records = [];
    // Lines on screen whose text can be looked up again: setText() redraws them in the new language.
    let live = [];
    const track = (node, text) => { if (typeof text === 'function') live.push({ node, text }); };

    function renderSparks() {
      sparkBox.replaceChildren();
      if (budget == null) return;
      const label = fill(tx.sparksLeft, { left: budget - spent, total: budget });
      sparkBox.setAttribute('aria-label', label);
      sparkBox.title = label;
      sparkBox.append(...sparkIcons(budget, spent));
    }

    function chip(q, onClick, extraClass = '') {
      const b = el('button', 'kai-chip' + extraClass);
      b.type = 'button';
      b.append(document.createTextNode(val(q.label)));
      const cost = q.cost || 0;
      if (cost) {
        const c = el('span', 'kai-cost');
        c.setAttribute('aria-label', fill(tx.costs, { n: cost }));
        c.append(...sparkIcons(cost));
        b.append(c);
      }
      const left = budget == null ? Infinity : budget - spent;
      b.disabled = !enabled || busy || cost > left;
      // Say why the chip is grey on the chip itself: touch screens never show a tooltip.
      if (cost > left) { b.title = tx.notEnough; if (enabled) b.append(el('small', 'kai-need', tx.notEnough)); }
      b.addEventListener('click', onClick);
      return b;
    }

    function renderChips() {
      chips.replaceChildren();
      const list = followUps && followUps.length ? followUps : (o.questions() || []);
      for (const q of list) chips.append(chip(q, () => askQuestion(q)));
      if (followUps && followUps.length) chips.append(chip({ label: tx.other }, () => { followUps = null; renderChips(); }, ' back'));
    }

    const scroll = () => { log.scrollTop = log.scrollHeight; };

    function typeInto(p, text) {
      return new Promise(resolve => {
        if (reduced() || !o.typeMs) { p.textContent = text; scroll(); resolve(); return; }
        let i = 0;
        const t = setInterval(() => {
          i += 2;
          p.textContent = text.slice(0, i);
          scroll();
          if (i >= text.length) { clearInterval(t); resolve(); }
        }, o.typeMs);
      });
    }

    function say(text) {
      const wrap = el('div', 'kai-a sys');
      const p = el('p', null, val(text));
      track(p, text);
      wrap.append(p);
      log.append(wrap);
      scroll();
      read(val(text));
    }

    async function askQuestion(q) {
      if (busy || !enabled) return;
      const cost = q.cost || 0;
      if (budget != null && spent + cost > budget) return;
      spent += cost;
      renderSparks();
      busy = true;
      renderChips();
      const qEl = el('div', 'kai-q', val(q.label));
      track(qEl, q.label);
      log.append(qEl);
      const wrap = el('div', 'kai-a');
      const p = el('p', null, '...');
      wrap.append(p);
      log.append(wrap);
      scroll();
      root.classList.add('thinking');
      const gen = generation;
      await new Promise(r => setTimeout(r, reduced() ? 0 : o.thinkMs));
      if (gen !== generation) return;
      root.classList.remove('thinking');

      const ans = Object.assign({ text: '', wrong: false, followUps: null, flaggable: true }, q.answer ? q.answer() : {});
      const text = val(ans.text);
      read(text, true);
      await typeInto(p, text);
      // The language may have changed while it was typing: settle on the current one.
      p.textContent = val(ans.text);
      track(p, ans.text);
      const rec = { question: q.id, text, wrong: !!ans.wrong, flagged: false, cost };
      records.push(rec);

      if (ans.flaggable) {
        const flag = el('button', 'kai-flag');
        flag.type = 'button';
        const mark = el('span');
        mark.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
        const label = el('span', null, tx.notRight);
        flag.append(mark.firstChild, label);
        track(label, () => tx.notRight);
        flag.addEventListener('click', () => {
          if (rec.flagged) return;
          rec.flagged = true;
          flag.remove();
          const v = el('div', 'kai-verdict ' + (rec.wrong ? 'caught' : 'fine'),
            rec.wrong ? tx.caught : tx.fine);
          track(v, () => (rec.wrong ? tx.caught : tx.fine));
          wrap.append(v);
          read(v.textContent, true);
          scroll();
          o.onFlag && o.onFlag(rec, rec.wrong);
          if (window.kidvo) kidvo.emit('ai-flagged', { wasWrong: rec.wrong });
        });
        wrap.append(flag);
      }
      scroll();
      followUps = ans.followUps;
      busy = false;
      renderChips();
      o.onAnswer && o.onAnswer(q, ans, rec);
      if (window.kidvo) kidvo.emit('ai-asked', { question: q.id, cost });
    }

    const api = {
      reset({ sparks = o.sparks, clear = true } = {}) {
        generation++;
        budget = sparks; spent = 0; records = []; followUps = null; busy = false; root.classList.remove('thinking');
        if (clear) { log.replaceChildren(); live = []; }
        renderSparks();
        renderChips();
      },
      stats() {
        const wrongGiven = records.filter(r => r.wrong).length;
        const caught = records.filter(r => r.wrong && r.flagged).length;
        return {
          asked: records.length,
          spent,
          sparksLeft: budget == null ? null : budget - spent,
          wrongGiven,
          caught,
          missed: wrongGiven - caught,
          falseAlarms: records.filter(r => !r.wrong && r.flagged).length
        };
      },
      say,
      isBusy: () => busy,
      refresh: renderChips,
      setEnabled(on) { enabled = !!on; renderChips(); },
      setText(next) {
        tx = Object.assign({}, DEFAULT_TEXT, next || {});
        tagEl.textContent = tx.tag;
        askLabel.textContent = tx.ask;
        for (const e of live) if (e.node.isConnected) e.node.textContent = e.text();
        // Follow-ups whose labels can be looked up again stay; fixed strings would stay in the old language.
        if (followUps && followUps.some(f => typeof f.label !== 'function')) followUps = null;
        renderSparks();
        renderChips();
      }
    };

    renderSparks();
    if (o.greeting) say(o.greeting);
    renderChips();
    return api;
  }

  window.kidvoAI = Object.freeze({ create });
})();
