/* PneuSim – Anwendung: Verdrahtung von Editor, Palette, Inspektor, Diagramm */
(function () {
  const PS = globalThis.PS;
  const UI = PS.UI;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { /* ignore */ } },
  };

  let ed, insp, scope;
  let lastUI = 0, lastScope = 0, saveT = null;

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2400);
  }

  /* ---------- Theme ---------- */
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
    const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    $('btnTheme').innerHTML = UI.icon(dark ? 'sun' : 'moon');
    if (scope) scope.draw();
  }

  /* ---------- Modus ---------- */
  function setHint() {
    const h = $('hint');
    if (ed.mode === 'sim') {
      h.innerHTML = '<b>Simulation</b> · Taster mit gedrückter Maustaste halten, Hebel anklicken, <kbd>Umschalt</kbd>+Klick rastet ein. <kbd>Leertaste</kbd> = Pause.';
      h.style.display = ''; h.classList.remove('fade');
      clearTimeout(setHint._t); setHint._t = setTimeout(() => h.classList.add('fade'), 9000);
    } else if (!ed.doc.comps.length) {
      h.innerHTML = '<b>Leerer Schaltplan.</b> Ziehe Bauteile aus der Bibliothek hierher – oder lade ein Beispiel über <b>Beispiele</b>.';
      h.style.display = ''; h.classList.remove('fade');
    } else h.style.display = 'none';
  }

  function setMode(m) {
    if (m === ed.mode) return;
    const sim = m === 'sim';
    document.body.classList.toggle('sim', sim);
    $('modeEdit').classList.toggle('on', !sim); $('modeSim').classList.toggle('on', sim);
    $('modeEdit').setAttribute('aria-pressed', !sim); $('modeSim').setAttribute('aria-pressed', sim);
    if (sim) { ed.enterSim(); insp.setTab('sim'); } else { ed.exitSim(); insp.setTab('props'); }
    updateRunUI();
    setHint();
    document.body.classList.remove('show-pal', 'show-ins');
    requestAnimationFrame(() => { ed.fitIfClipped(); scope.draw(); });
  }

  function updateRunUI() {
    const b = $('simPlay');
    b.innerHTML = `${UI.icon(ed.running ? 'pause' : 'play')}<span>${ed.running ? 'Pause' : 'Start'}</span>`;
    $('simStep').disabled = ed.running;
  }

  /* ---------- Datei ---------- */
  const slug = (s) => (s || 'schaltplan').toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-|-$/g, '') || 'schaltplan';
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function loadDoc(doc, msg) {
    if (ed.mode === 'sim') setMode('edit');
    ed.setDoc(doc, true);
    ed.commit();
    requestAnimationFrame(() => ed.fit());
    setHint();
    if (msg) toast(msg);
  }

  const EXPORT_CSS = `.sym .k{fill:none;stroke:#1d2736;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}.sym .kf{fill:#1d2736;stroke:#1d2736;stroke-width:1}
.sym .kp,.sym .pap{fill:#fff;stroke:#1d2736;stroke-width:1.6;stroke-linejoin:round}.sym .thin{stroke-width:1}.sym .dash{stroke-dasharray:4 3}.sym .dd{stroke-dasharray:9 3 2 3}.sym .ghost{display:none}
.sym .rod{stroke-width:3.4;stroke-linecap:butt}.sym .body{fill:none;stroke:#1d2736;stroke-width:1.8}.sym .chamber{stroke:none;opacity:.55}.sym .vsq.on{fill:rgba(37,99,235,.12)}
.sym .act-on{stroke:#0b7a8f!important;fill:rgba(11,122,143,.14)}.sym .act .hit{fill:none;stroke:none}.sym .junction{fill:#1d2736}.sym .needle{stroke:#c8321f;stroke-width:1.8}.sym .sensor{fill:#0b7a8f;stroke:#0b7a8f}
.sym .lbl{font:9px system-ui,sans-serif;fill:#6a7587}.sym .lbl.val{fill:#1d2736;font-weight:600}.sym .lbl.big{font-size:11px}.sym .lbl.sens{fill:#0b7a8f;font-weight:600}.sym .lbl.logic{font-size:11px;font-weight:700}.sym .note{fill:#1d2736;font-family:system-ui,sans-serif}
.sym .port-lbl{font-size:8.5px}.sym .exh-on{fill:#7dc4f2}.wire .wline{fill:none;stroke:#344154;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}.wire .wflow{display:none}
.clabel{font:600 11px system-ui,sans-serif;fill:#0b6a7c}.selbox{display:none}`;
  function exportSvgString() {
    const world = svg.querySelector('.world');
    const bb = world.getBBox();
    const pad = 24, x = bb.x - pad, y = bb.y - pad, w = bb.width + 2 * pad, h = bb.height + 2 * pad;
    const clone = world.cloneNode(true);
    clone.removeAttribute('transform');
    clone.querySelectorAll('.portsg,.hitbox,.whit,.l-over,.selbox,title').forEach((n) => n.remove());
    return { w, h, str: `<svg xmlns="http://www.w3.org/2000/svg" class="sym" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}"><style>${EXPORT_CSS}</style><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>${clone.innerHTML}</svg>` };
  }
  function exportSVG() {
    if (!ed.doc.comps.length) return toast('Der Schaltplan ist leer.');
    download(new Blob([exportSvgString().str], { type: 'image/svg+xml' }), slug(ed.doc.name) + '.svg');
  }
  function exportPNG() {
    if (!ed.doc.comps.length) return toast('Der Schaltplan ist leer.');
    const { w, h, str } = exportSvgString();
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'), k = 2;
      c.width = Math.round(w * k); c.height = Math.round(h * k);
      const g = c.getContext('2d'); g.scale(k, k); g.drawImage(img, 0, 0, w, h);
      c.toBlob((b) => b && download(b, slug(ed.doc.name) + '.png'));
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(str);
  }

  /* ---------- Menüs ---------- */
  function closeMenus() { document.querySelectorAll('details.menu[open]').forEach((d) => d.removeAttribute('open')); }
  function buildExamples() {
    const list = $('exList');
    list.innerHTML = PS.EXAMPLES.map((e, i) => `<button data-i="${i}"><svg class="ic"><use href="#i-book"/></svg><div><b>${PS.esc(e.name)}</b><span>${PS.esc(e.desc)}</span></div></button>`).join('');
    list.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { closeMenus(); loadDoc(PS.EXAMPLES[+b.dataset.i].build(), 'Beispiel geladen – mit Strg+Z rückgängig'); };
    });
  }

  /* ---------- Start ---------- */
  function init() {
    const svgEl = $('canvas');
    window.svg = svgEl;
    ed = new PS.Editor(svgEl, {
      onSelect: () => { if (insp.tab === 'props') insp.render(); },
      onChange: (doc) => {
        clearTimeout(saveT);
        saveT = setTimeout(() => store.set('pneusim.autosave', PS.Doc.serialize(doc)), 300);
        if (insp.tab === 'props' && !ed.sel.size) insp.render();
        if (doc.comps.length) $('hint').style.display = 'none'; else setHint();
      },
      onHistory: (u, r) => { $('btnUndo').disabled = !u; $('btnRedo').disabled = !r; },
      onSimCompiled: (sim) => {
        scope.setup(sim, ed.doc);
        if (insp.tab === 'sim') insp.render();
        const n = sim.warnings.length, b = $('simWarn');
        b.hidden = !n; b.textContent = n ? `⚠ ${n} Hinweis${n > 1 ? 'e' : ''}` : '';
        b.title = sim.warnings.map((w) => w.msg).join('\n');
      },
      onFrame: (sim, dt) => {
        const now = performance.now();
        if (!sim) return;
        if (ed.running) scope.sample(sim);
        if (now - lastScope > 66) { lastScope = now; if (document.body.classList.contains('scope')) scope.draw(); }
        if (now - lastUI > 90) { lastUI = now; insp.update(sim); $('simClock').textContent = `t = ${PS.fmt(sim.t, 2)} s`; }
      },
      onSimInput: () => insp.update(ed.sim),
      onRunState: updateRunUI,
      onTip: (txt, x, y) => {
        const tip = $('tip');
        if (!txt) { tip.style.display = 'none'; return; }
        tip.textContent = txt; tip.style.display = 'block'; tip.style.left = x + 14 + 'px'; tip.style.top = y + 14 + 'px';
      },
      onDropItem: (idx, x, y) => ed.addPart(UI.items[+idx], x, y),
    });
    ed.speed = 0.5;
    insp = new UI.Inspector(ed, $('insBody'), $('tabProps'), $('tabSim'));
    scope = new UI.Scope($('scopeCanvas'), $('scopeLegend'), $('scopeWin'), $('scopeClear'));
    UI.buildPalette(ed, $('palList'), $('palSearch'));
    UI.onPartAdded = () => { document.body.classList.remove('show-pal'); $('hint').style.display = 'none'; };
    buildExamples();
    window.PSapp = { ed, insp, scope, setMode, loadDoc, toast };

    /* Toolbar */
    $('modeEdit').onclick = () => setMode('edit');
    $('modeSim').onclick = () => setMode('sim');
    $('btnUndo').onclick = () => ed.undo();
    $('btnRedo').onclick = () => ed.redo();
    $('zIn').onclick = () => ed.zoomBy(1.25);
    $('zOut').onclick = () => ed.zoomBy(0.8);
    $('zFit').onclick = () => ed.fit();
    $('btnHelp').onclick = () => $('helpDlg').showModal();
    $('btnPal').onclick = () => { document.body.classList.toggle('show-pal'); document.body.classList.remove('show-ins'); };
    $('btnIns').onclick = () => { document.body.classList.toggle('show-ins'); document.body.classList.remove('show-pal'); };
    $('scrim').onclick = () => document.body.classList.remove('show-pal', 'show-ins');
    $('btnTheme').onclick = () => {
      const cur = document.documentElement.dataset.theme;
      const dark = cur === 'dark' || (!cur && matchMedia('(prefers-color-scheme: dark)').matches);
      const nx = dark ? 'light' : 'dark';
      store.set('pneusim.theme', nx); applyTheme(nx);
    };
    $('simPlay').onclick = () => { ed.simToggle(); updateRunUI(); };
    $('simStep').onclick = () => ed.simStep(0.02);
    $('simReset').onclick = () => { ed.simReset(); lastUI = 0; };
    $('simSpeed').querySelectorAll('button').forEach((b) => {
      b.onclick = () => { ed.speed = +b.dataset.v; $('simSpeed').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
    });
    $('btnScope').onclick = () => { document.body.classList.toggle('scope'); requestAnimationFrame(() => { ed.fitIfClipped(); scope.draw(); }); };
    document.querySelectorAll('#menuFile [data-act]').forEach((b) => {
      b.onclick = () => {
        closeMenus();
        const a = b.dataset.act;
        if (a === 'new') loadDoc(PS.Doc.create('Neuer Schaltplan'), 'Neuer Schaltplan');
        else if (a === 'open') $('fileIn').click();
        else if (a === 'save') { download(new Blob([PS.Doc.serialize(ed.doc)], { type: 'application/json' }), slug(ed.doc.name) + '.pneusim.json'); toast('Gespeichert'); }
        else if (a === 'svg') exportSVG();
        else if (a === 'png') exportPNG();
      };
    });
    $('fileIn').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { loadDoc(PS.Doc.parse(r.result), 'Datei geladen'); } catch (err) { toast(err.message); } };
      r.readAsText(f); e.target.value = '';
    };
    document.addEventListener('click', (e) => { if (!e.target.closest('details.menu')) closeMenus(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenus();
      const tag = (e.target.tagName || '').toLowerCase();
      if (ed.mode === 'sim' && e.code === 'Space' && tag !== 'input' && tag !== 'button' && tag !== 'select') { e.preventDefault(); ed.simToggle(); updateRunUI(); }
    });
    svgEl.addEventListener('dblclick', () => {});
    let rsT = null;
    window.addEventListener('resize', () => { scope.draw(); clearTimeout(rsT); rsT = setTimeout(() => ed.fitIfClipped(), 150); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(store.get('pneusim.theme')));

    applyTheme(store.get('pneusim.theme'));

    /* Start-Dokument */
    let doc = null;
    const saved = store.get('pneusim.autosave');
    if (saved) { try { doc = PS.Doc.parse(saved); if (!doc.comps.length) doc = null; } catch (_) { doc = null; } }
    if (new URLSearchParams(location.search).has('ex')) {
      const i = +new URLSearchParams(location.search).get('ex');
      if (PS.EXAMPLES[i]) doc = PS.EXAMPLES[i].build();
    }
    if (!doc) doc = PS.EXAMPLES[0].build();
    ed.setDoc(doc);
    requestAnimationFrame(() => { ed.fit(); setHint(); });
    if (innerHeight > 760 && innerWidth > 860) document.body.classList.add('scope');
    updateRunUI();
    $('btnUndo').disabled = true; $('btnRedo').disabled = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
