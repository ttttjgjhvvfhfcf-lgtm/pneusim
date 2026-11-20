/* PneuSim – Palette, Inspektor, Diagramm */
(function () {
  const PS = globalThis.PS;
  const UI = (PS.UI = {});
  const esc = PS.esc;
  const icon = (id) => `<svg class="ic"><use href="#i-${id}"/></svg>`;
  UI.icon = icon;

  /* Vorschau-Symbol für Palette und Inspektor */
  UI.thumb = function (item, pad) {
    const T = PS.types[item.type];
    const c = { id: 'thumb', type: item.type, x: 0, y: 0, rot: item.rot || 0, flip: !!item.flip, label: '', p: Object.assign(T.defaults(), PS.copy(item.p || {})) };
    const ctx = { sim: null, rt: null, thumb: true, rot: c.rot, flip: c.flip, conn: () => false, sensors: () => [], pp: () => 0, flow: () => 0, cylLabel: () => null };
    const b = PS.worldBBox(c);
    pad = pad == null ? 4 : pad;
    const tr = `${c.rot ? `rotate(${c.rot * 90}) ` : ''}${c.flip ? 'scale(-1 1)' : ''}`;
    return `<svg class="sym" viewBox="${b.x0 - pad} ${b.y0 - pad} ${b.x1 - b.x0 + 2 * pad} ${b.y1 - b.y0 + 2 * pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g transform="${tr}">${T.draw(c, ctx)}</g></svg>`;
  };

  /* ===================================================== Palette */
  UI.buildPalette = function (ed, listEl, searchEl) {
    const items = [];
    let html = '';
    PS.PALETTE.forEach((grp, gi) => {
      html += `<details open data-g="${gi}"><summary>${esc(grp.cat)}</summary>`;
      grp.items.forEach((it) => {
        const idx = items.length;
        const item = Object.assign({}, it);
        if (it.type === 'cylD' || it.type === 'cylS') { item.rot = 2; item.flip = true; } // Anschlüsse nach unten
        items.push(item);
        html += `<div class="pitem" draggable="true" tabindex="0" role="button" data-i="${idx}" data-name="${esc((it.name + ' ' + grp.cat).toLowerCase())}" title="${esc(it.name)}">${UI.thumb(item)}<span>${esc(it.name)}</span></div>`;
      });
      html += '</details>';
    });
    listEl.innerHTML = html;
    UI.items = items;
    listEl.querySelectorAll('.pitem').forEach((el) => {
      const idx = +el.dataset.i;
      el.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('application/x-pneusim', String(idx));
        e.dataTransfer.setData('text/plain', items[idx].name);
        e.dataTransfer.effectAllowed = 'copy';
      });
      el.addEventListener('click', () => { if (ed.mode === 'edit') { ed.addPart(items[idx]); if (UI.onPartAdded) UI.onPartAdded(); } });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } });
    });
    searchEl.addEventListener('input', () => {
      const q = searchEl.value.trim().toLowerCase();
      listEl.querySelectorAll('.pitem').forEach((el) => { el.style.display = !q || el.dataset.name.includes(q) ? '' : 'none'; });
      listEl.querySelectorAll('details').forEach((d) => { const any = [...d.querySelectorAll('.pitem')].some((e) => e.style.display !== 'none'); d.style.display = any ? '' : 'none'; if (q && any) d.open = true; });
    });
  };

  /* ===================================================== Inspektor */
  const LIVE = {
    src: ['pressure'], wu: ['pset'], reg: ['pset'], rel: ['pset'], thr: ['open'], grv: ['open'], timer: ['delay'],
    cylD: ['load', 'mass'], cylS: ['load', 'mass'], valve: ['pilotP'],
  };

  class Inspector {
    constructor(ed, body, tabProps, tabSim) {
      this.ed = ed; this.body = body; this.tabs = { props: tabProps, sim: tabSim };
      this.tab = 'props';
      tabProps.addEventListener('click', () => this.setTab('props'));
      tabSim.addEventListener('click', () => this.setTab('sim'));
      this.simEls = null;
    }
    setTab(t) {
      this.tab = t;
      this.tabs.props.classList.toggle('on', t === 'props');
      this.tabs.sim.classList.toggle('on', t === 'sim');
      this.render();
    }
    render() {
      const sc = this.body.scrollTop;
      if (this.tab === 'sim') this.renderSim(); else this.renderProps();
      this.body.scrollTop = sc;
    }

    /* ---------- Eigenschaften ---------- */
    renderProps() {
      const ed = this.ed;
      const comps = ed.selComps();
      const wires = [...ed.sel].filter((id) => id[0] === 'w');
      if (this.tab === 'props' && ed.mode === 'sim') {
        this.body.innerHTML = `<div class="empty"><h3>Simulation läuft</h3><p>Während der Simulation lassen sich Bauteile nicht bearbeiten. Wechsle zu <b>Bearbeiten</b> oder nutze den Reiter <b>Bedienung</b>.</p></div>`;
        return;
      }
      if (comps.length === 1 && !wires.length) return this.renderComp(comps[0]);
      if (comps.length > 1) {
        this.body.innerHTML = `<div class="title"><div><h2>${comps.length} Bauteile</h2><small>Mehrfachauswahl</small></div></div>` + this.actions() + `<p class="empty">Verschieben per Ziehen, Pfeiltasten verschieben im Raster.</p>`;
        return this.bindActions();
      }
      if (wires.length) {
        this.body.innerHTML = `<div class="title"><div><h2>Leitung</h2><small>${wires.length > 1 ? wires.length + ' Leitungen' : 'Rohr-/Schlauchleitung'}</small></div></div>` +
          `<div class="btnrow"><button class="btn sm" id="wReroute">${icon('rotate')} Neu verlegen</button><button class="btn sm danger" data-a="del">${icon('trash')} Löschen</button></div>` +
          `<p class="empty" style="margin-top:12px">Leitungen werden automatisch geführt. Auf eine Leitung ziehen erzeugt eine Verzweigung. „Neu verlegen“ verwirft manuelle Knickpunkte.</p>`;
        this.body.querySelector('#wReroute').onclick = () => { wires.forEach((id) => { const w = ed.wireById(id); if (w) w.via = null; }); ed.rerouteWires(); ed.commit(); };
        return this.bindActions();
      }
      this.renderEmpty();
    }

    renderEmpty() {
      const d = this.ed.doc;
      this.body.innerHTML =
        `<div class="sec"><h3>Schaltplan</h3><div class="row"><label for="docName">Name</label><input type="text" id="docName" value="${esc(d.name)}"></div>` +
        `<div class="kv"><span>Bauteile</span><b>${d.comps.filter((c) => c.type !== 'junction' && c.type !== 'note').length}</b><span>Leitungen</span><b>${d.wires.length}</b></div></div>` +
        `<div class="empty"><h3>So geht's</h3><ul><li>Bauteile aus der Bibliothek ziehen oder anklicken.</li><li>Auf einen <b style="color:var(--port)">roten Anschluss</b> drücken und zu einem anderen ziehen.</li><li>Bauteil anklicken, um Eigenschaften (Druck, Hub, Betätigung …) zu ändern.</li><li>Oben auf <b>Simulation</b> wechseln und Taster bedienen.</li></ul></div>` +
        `<div class="sec"><h3>Druckfarben (Simulation)</h3>` +
        [0, 2, 4, 6].map((p) => `<div class="legend-p"><i style="background:${PS.pcol(p, 6) || 'var(--wire)'}"></i>${p === 0 ? 'drucklos (Umgebung)' : p + ' bar Überdruck'}</div>`).join('') + `</div>`;
      const nm = this.body.querySelector('#docName');
      nm.oninput = () => { this.ed.doc.name = nm.value; clearTimeout(this._nt); this._nt = setTimeout(() => this.ed.commit(), 400); };
    }

    actions() {
      return `<div class="btnrow" style="margin-bottom:14px">` +
        `<button class="btn sm" data-a="rot" title="Drehen (R)">${icon('rotate')} Drehen</button>` +
        `<button class="btn sm" data-a="flip" title="Spiegeln (M)">${icon('flip')} Spiegeln</button>` +
        `<button class="btn sm" data-a="dup" title="Duplizieren (Strg+D)">${icon('copy')}</button>` +
        `<button class="btn sm danger" data-a="del" title="Löschen (Entf)">${icon('trash')}</button></div>`;
    }
    bindActions() {
      const ed = this.ed;
      this.body.querySelectorAll('[data-a]').forEach((b) => {
        b.onclick = () => { const a = b.dataset.a; if (a === 'rot') ed.rotateSel(1); else if (a === 'flip') ed.flipSel(); else if (a === 'dup') ed.duplicate(); else if (a === 'del') ed.deleteSelection(); };
      });
    }

    renderComp(c) {
      const ed = this.ed, T = PS.types[c.type];
      let h = `<div class="title"><div class="thumb">${UI.thumb({ type: c.type, p: c.p, rot: 0, flip: false }, 3)}</div><div><h2>${esc(T.name)}</h2><small>${esc(c.label || '')}</small></div></div>`;
      h += this.actions();
      if (!T.noLabel) h += `<div class="row"><label for="pLabel">Bezeichnung</label><input type="text" id="pLabel" value="${esc(c.label || '')}" maxlength="12"></div>`;
      (T.params || []).forEach((p) => {
        if (p.when && !p.when(c.p)) return;
        const v = c.p[p.k];
        const id = 'pp_' + p.k;
        if (p.type === 'num') {
          h += `<div class="row"><label for="${id}">${esc(p.label)}</label><div class="numrow"><input type="range" data-k="${p.k}" data-r="1" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" aria-label="${esc(p.label)}"><div class="unit"><input type="number" id="${id}" data-k="${p.k}" data-n="1" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"><em>${esc(p.unit || '')}</em></div></div></div>`;
        } else if (p.type === 'sel') {
          h += `<div class="row"><label for="${id}">${esc(p.label)}</label><select id="${id}" data-k="${p.k}" data-s="1">${p.opts.map((o) => `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>`;
        } else if (p.type === 'bool') {
          h += `<div class="row"><label class="check"><input type="checkbox" data-k="${p.k}" data-b="1"${v ? ' checked' : ''}> ${esc(p.label)}</label></div>`;
        } else if (p.type === 'text') {
          h += `<div class="row"><label for="${id}">${esc(p.label)}</label><input type="text" id="${id}" data-k="${p.k}" data-t="1" value="${esc(v)}"></div>`;
        } else if (p.type === 'bind') {
          const cyls = ed.doc.comps.filter((o) => o.type === 'cylD' || o.type === 'cylS');
          const def = PS.ACT[p.k === 'bindL' ? c.p.left : c.p.right] || {};
          const bd = v || null;
          h += `<div class="row"><label for="${id}">${esc(p.label)} → Zylinder</label><select id="${id}" data-k="${p.k}" data-bc="1"><option value="">— nicht zugeordnet —</option>${cyls.map((o) => `<option value="${o.id}"${bd && bd.cyl === o.id ? ' selected' : ''}>${esc(o.label || o.id)}</option>`).join('')}</select></div>`;
          if (bd) {
            h += `<div class="row"><label>Position am Hub</label><div class="numrow"><input type="range" data-k="${p.k}" data-bp="1" min="0" max="100" step="1" value="${Math.round(bd.pos * 100)}" aria-label="Position"><div class="unit"><input type="number" data-k="${p.k}" data-bpn="1" min="0" max="100" step="1" value="${Math.round(bd.pos * 100)}"><em>%</em></div></div></div>` +
              `<div class="btnrow" style="margin:-4px 0 12px"><button class="btn sm" data-k="${p.k}" data-pos="0">hinten (0 %)</button><button class="btn sm" data-k="${p.k}" data-pos="100">vorn (100 %)</button></div>`;
            if (def.oneway) h += `<div class="row"><label for="${id}d">Wirkrichtung</label><select id="${id}d" data-k="${p.k}" data-bd="1"><option value="1"${(bd.dir || (bd.pos >= 0.5 ? 1 : -1)) === 1 ? ' selected' : ''}>beim Ausfahren</option><option value="-1"${(bd.dir || (bd.pos >= 0.5 ? 1 : -1)) === -1 ? ' selected' : ''}>beim Einfahren</option></select></div>`;
          } else if (!cyls.length) h += `<p class="empty" style="margin:-6px 0 12px">Noch kein Zylinder im Schaltplan.</p>`;
        }
      });
      this.body.innerHTML = h;
      this.bindActions();
      const lab = this.body.querySelector('#pLabel');
      if (lab) lab.oninput = () => { c.label = lab.value; ed.labelChanged(c); this.body.querySelector('.title small').textContent = c.label; };

      const apply = (k, v, rerender) => {
        c.p[k] = v; ed.paramChanged(c);
        if (rerender) this.renderProps();
      };
      this.body.querySelectorAll('input[data-r]').forEach((r) => {
        const n = this.body.querySelector(`input[data-n][data-k="${r.dataset.k}"]`);
        r.oninput = () => { n.value = r.value; apply(r.dataset.k, +r.value); };
      });
      this.body.querySelectorAll('input[data-n]').forEach((n) => {
        const r = this.body.querySelector(`input[data-r][data-k="${n.dataset.k}"]`);
        n.onchange = () => { let v = parseFloat(String(n.value).replace(',', '.')); if (!isFinite(v)) v = c.p[n.dataset.k]; v = PS.clamp(v, +n.min, +n.max); n.value = v; r.value = v; apply(n.dataset.k, v); };
      });
      this.body.querySelectorAll('select[data-s]').forEach((s) => { s.onchange = () => apply(s.dataset.k, s.value, true); });
      this.body.querySelectorAll('input[data-b]').forEach((b) => { b.onchange = () => apply(b.dataset.k, b.checked, true); });
      this.body.querySelectorAll('input[data-t]').forEach((t) => { t.oninput = () => apply(t.dataset.k, t.value); });
      const setBind = (k, mut) => { const cur = c.p[k] ? Object.assign({}, c.p[k]) : null; const nx = mut(cur); c.p[k] = nx; ed.paramChanged(c); };
      this.body.querySelectorAll('select[data-bc]').forEach((s) => {
        s.onchange = () => { setBind(s.dataset.k, (cur) => (s.value ? { cyl: s.value, pos: cur ? cur.pos : (c.p[s.dataset.k === 'bindL' ? 'left' : 'right'] === 'rollerIdle' ? 1 : 1) } : null)); this.renderProps(); };
      });
      this.body.querySelectorAll('input[data-bp]').forEach((r) => {
        const n = this.body.querySelector(`input[data-bpn][data-k="${r.dataset.k}"]`);
        r.oninput = () => { n.value = r.value; setBind(r.dataset.k, (cur) => Object.assign(cur || {}, { pos: +r.value / 100 })); };
      });
      this.body.querySelectorAll('input[data-bpn]').forEach((n) => {
        const r = this.body.querySelector(`input[data-bp][data-k="${n.dataset.k}"]`);
        n.onchange = () => { const v = PS.clamp(parseFloat(n.value) || 0, 0, 100); n.value = v; r.value = v; setBind(n.dataset.k, (cur) => Object.assign(cur || {}, { pos: v / 100 })); };
      });
      this.body.querySelectorAll('button[data-pos]').forEach((b) => { b.onclick = () => { setBind(b.dataset.k, (cur) => Object.assign(cur || {}, { pos: +b.dataset.pos / 100 })); this.renderProps(); }; });
      this.body.querySelectorAll('select[data-bd]').forEach((s) => { s.onchange = () => setBind(s.dataset.k, (cur) => Object.assign(cur || {}, { dir: +s.value })); });
    }

    /* ---------- Simulation / Bedienung ---------- */
    renderSim() {
      const ed = this.ed, sim = ed.sim;
      if (!sim || ed.mode !== 'sim') {
        this.body.innerHTML = `<div class="empty"><h3>Bedienung</h3><p>Starte oben die <b>Simulation</b>, um Taster, Hebel und Magnetventile zu bedienen und Messwerte zu sehen.</p></div>`;
        this.simEls = null;
        return;
      }
      const comps = ed.doc.comps;
      let h = '';
      const ctl = [];
      comps.forEach((c) => {
        if (c.type !== 'valve') return;
        ['L', 'R'].forEach((sd) => {
          const kind = sd === 'L' ? c.p.left : c.p.right, def = PS.ACT[kind];
          if (def && def.manual) ctl.push({ c, sd, def, kind });
        });
      });
      if (ctl.length) {
        h += `<div class="sec"><h3>Betätigung</h3>`;
        ctl.forEach((o, i) => {
          const two = ctl.filter((x) => x.c === o.c).length > 1;
          h += `<div class="ctl"><div><b>${esc(o.c.label || o.c.type)}</b><small>${esc(o.def.name)}${two ? (o.sd === 'L' ? ' (links)' : ' (rechts)') : ''}</small></div><button class="sw" data-i="${i}" aria-pressed="false">${o.def.latch ? 'Aus' : 'Drücken'}</button></div>`;
        });
        h += `<small class="empty">Taster: gedrückt halten · <kbd>Umschalt</kbd>+Klick rastet ein.</small></div>`;
      }
      const cyls = comps.filter((c) => c.type === 'cylD' || c.type === 'cylS');
      if (cyls.length) {
        h += `<div class="sec"><h3>Zylinder</h3>`;
        cyls.forEach((c) => {
          h += `<div class="ctl" style="display:block"><div style="display:flex;justify-content:space-between"><b>${esc(c.label || c.id)}</b><span data-cyl="${c.id}" data-f="pos" style="font-variant-numeric:tabular-nums">0 mm</span></div><div class="bar"><i data-cyl="${c.id}" data-f="bar"></i></div>` +
            `<div class="kv"><span>Druck A (Kolbenseite)</span><b data-cyl="${c.id}" data-f="pA">–</b>${c.type === 'cylD' ? `<span>Druck B (Stangenseite)</span><b data-cyl="${c.id}" data-f="pB">–</b>` : ''}<span>Geschwindigkeit</span><b data-cyl="${c.id}" data-f="v">–</b><span>Hubzeit aus / ein</span><b data-cyl="${c.id}" data-f="t">–</b></div></div>`;
        });
        h += `</div>`;
      }
      const gs = comps.filter((c) => c.type === 'gauge');
      if (gs.length) {
        h += `<div class="sec"><h3>Manometer</h3>`;
        gs.forEach((c) => { h += `<div class="ctl"><b>${esc(c.label || c.id)}</b><span data-g="${c.id}" style="font-variant-numeric:tabular-nums;font-weight:700">–</span></div>`; });
        h += `</div>`;
      }
      const live = [];
      comps.forEach((c) => (LIVE[c.type] || []).forEach((k) => {
        const T = PS.types[c.type], pd = (T.params || []).find((p) => p.k === k);
        if (pd && pd.type === 'num' && (!pd.when || pd.when(c.p))) live.push({ c, T, pd });
      }));
      if (live.length) {
        h += `<div class="sec"><h3>Live einstellen</h3>`;
        live.forEach((o, i) => {
          h += `<div class="live-sl"><label for="lv${i}">${esc(o.c.label || o.T.name)} · ${esc(o.pd.label)}</label><output id="lvo${i}">${PS.fmt(o.c.p[o.pd.k], o.pd.step < 1 ? 1 : 0)} ${esc(o.pd.unit || '')}</output><input id="lv${i}" type="range" min="${o.pd.min}" max="${o.pd.max}" step="${o.pd.step}" value="${o.c.p[o.pd.k]}"></div>`;
        });
        h += `</div>`;
      }
      if (sim.warnings.length) h += `<div class="sec"><h3>Hinweise</h3><ul class="warnlist">${sim.warnings.map((w) => `<li>${esc(w.msg)}</li>`).join('')}</ul></div>`;
      if (!ctl.length && !cyls.length && !gs.length && !live.length) h += `<div class="empty"><h3>Leerer Schaltplan</h3><p>Füge im Bearbeiten-Modus Bauteile hinzu.</p></div>`;
      this.body.innerHTML = h;
      this.simEls = { ctl };

      this.body.querySelectorAll('.sw').forEach((b) => {
        const o = ctl[+b.dataset.i];
        const setOn = (v) => ed.simSetMan(o.c.id, o.sd, v);
        if (o.def.latch) b.onclick = () => setOn(!sim.rt[o.c.id].man[o.sd]);
        else {
          b.onpointerdown = (e) => { b.setPointerCapture(e.pointerId); if (e.shiftKey) setOn(!sim.rt[o.c.id].man[o.sd]); else { setOn(true); b._held = true; } };
          const rel = () => { if (b._held) { b._held = false; setOn(false); } };
          b.onpointerup = rel; b.onpointercancel = rel; b.onlostpointercapture = rel;
          b.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!b._held) { b._held = true; setOn(true); } } };
          b.onkeyup = (e) => { if (e.key === ' ' || e.key === 'Enter') rel(); };
        }
      });
      live.forEach((o, i) => {
        const r = this.body.querySelector('#lv' + i), out = this.body.querySelector('#lvo' + i);
        r.oninput = () => { o.c.p[o.pd.k] = +r.value; out.textContent = `${PS.fmt(+r.value, o.pd.step < 1 ? 1 : 0)} ${o.pd.unit || ''}`; const g = ed.compEls.get(o.c.id); ed.renderSim(true); };
      });
      this.update(sim);
    }

    update(sim) {
      if (this.tab !== 'sim' || !this.simEls || !sim) return;
      const b = this.body;
      this.simEls.ctl.forEach((o, i) => {
        const btn = b.querySelector(`.sw[data-i="${i}"]`);
        if (!btn) return;
        const on = !!sim.rt[o.c.id].man[o.sd];
        if (btn._on !== on) { btn._on = on; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on); if (o.def.latch) btn.textContent = on ? 'Ein' : 'Aus'; }
      });
      const set = (sel, txt) => { const e = b.querySelector(sel); if (e && e.textContent !== txt) e.textContent = txt; };
      this.ed.doc.comps.forEach((c) => {
        const rt = sim.rt[c.id];
        if (c.type === 'cylD' || c.type === 'cylS') {
          set(`[data-cyl="${c.id}"][data-f="pos"]`, `${(rt.x * 1000).toFixed(0)} mm`);
          const bar = b.querySelector(`[data-cyl="${c.id}"][data-f="bar"]`); if (bar) bar.style.width = (rt.x / rt.L * 100).toFixed(1) + '%';
          set(`[data-cyl="${c.id}"][data-f="pA"]`, PS.fmt(rt.pA, 2) + ' bar');
          set(`[data-cyl="${c.id}"][data-f="pB"]`, PS.fmt(rt.pB, 2) + ' bar');
          set(`[data-cyl="${c.id}"][data-f="v"]`, PS.fmt(Math.abs(rt.v), 2) + ' m/s');
          set(`[data-cyl="${c.id}"][data-f="t"]`, `${rt.tExt != null ? PS.fmt(rt.tExt, 2) : '–'} / ${rt.tRet != null ? PS.fmt(rt.tRet, 2) : '–'} s`);
        } else if (c.type === 'gauge') {
          set(`[data-g="${c.id}"]`, PS.fmt(sim.P[rt.node] - PS.P0, 2) + ' bar');
        }
      });
    }
  }
  UI.Inspector = Inspector;

  /* ===================================================== Diagramm */
  const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f'];
  class Scope {
    constructor(canvas, legendEl, winEl, clearEl) {
      this.cv = canvas; this.legend = legendEl; this.win = 10; this.series = []; this.t = []; this.rows = [];
      winEl.addEventListener('change', () => { this.win = +winEl.value; this.draw(); });
      clearEl.addEventListener('click', () => { this.t = []; this.rows = []; this.draw(); });
      new ResizeObserver(() => this.draw()).observe(canvas);
    }
    setup(sim, doc) {
      this.t = []; this.rows = []; this.series = [];
      let ci = 0;
      doc.comps.forEach((c) => {
        if (c.type === 'cylD' || c.type === 'cylS') this.series.push({ id: c.id, label: (c.label || c.id) + ' Weg', kind: 'pos', col: COLORS[ci++ % COLORS.length], get: () => (sim.rt[c.id].x / sim.rt[c.id].L) * 100 });
      });
      doc.comps.forEach((c) => {
        if (c.type === 'gauge') this.series.push({ id: c.id, label: (c.label || c.id) + ' Druck', kind: 'p', col: COLORS[ci++ % COLORS.length], get: () => sim.P[sim.rt[c.id].node] - PS.P0 });
      });
      this.pmax = Math.max(2, Math.ceil(sim.maxSupply + 0.5));
      this.legend.innerHTML = this.series.map((s) => `<span><i style="background:${s.col};${s.kind === 'p' ? 'height:0;border-top:2px dashed ' + s.col + ';background:none' : ''}"></i>${esc(s.label)}</span>`).join('') || '<span class="empty">Keine Zylinder/Manometer im Schaltplan</span>';
      this.draw();
    }
    sample(sim) {
      if (!this.series.length) return;
      const n = this.t.length;
      if (n && sim.t - this.t[n - 1] < 0.01) return;
      if (n && sim.t < this.t[n - 1]) { this.t = []; this.rows = []; }
      this.t.push(sim.t); this.rows.push(this.series.map((s) => s.get()));
      if (this.t.length > 9000) { this.t.splice(0, 1500); this.rows.splice(0, 1500); }
    }
    draw() {
      const cv = this.cv;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const g = cv.getContext('2d');
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const cs = getComputedStyle(document.documentElement);
      const text = cs.getPropertyValue('--muted').trim() || '#667', line = cs.getPropertyValue('--line').trim() || '#ddd';
      g.clearRect(0, 0, w, h);
      const L = 46, R = 44, T = 8, B = 22, pw = w - L - R, ph = h - T - B;
      g.font = '11px system-ui, sans-serif'; g.fillStyle = text; g.strokeStyle = line; g.lineWidth = 1;
      const tEnd = this.t.length ? Math.max(this.win, this.t[this.t.length - 1]) : this.win, t0 = tEnd - this.win;
      const X = (t) => L + ((t - t0) / this.win) * pw;
      const Yp = (v) => T + ph - (v / 100) * ph;
      const Yb = (v) => T + ph - (v / this.pmax) * ph;
      g.textAlign = 'right'; g.textBaseline = 'middle';
      [0, 50, 100].forEach((v) => { g.beginPath(); g.moveTo(L, Yp(v)); g.lineTo(L + pw, Yp(v)); g.stroke(); g.fillText(v + ' %', L - 6, Yp(v)); });
      g.textAlign = 'left';
      const hasP = this.series.some((s) => s.kind === 'p');
      if (hasP) for (let v = 0; v <= this.pmax; v += this.pmax > 8 ? 4 : 2) g.fillText(v + ' bar', L + pw + 6, Yb(v));
      g.textAlign = 'center'; g.textBaseline = 'top';
      const step = this.win / 5;
      for (let i = 0; i <= 5; i++) { const t = t0 + i * step; g.fillText(t.toFixed(this.win <= 10 ? 1 : 0) + ' s', X(t), T + ph + 5); g.beginPath(); g.moveTo(X(t), T); g.lineTo(X(t), T + ph); g.globalAlpha = 0.5; g.stroke(); g.globalAlpha = 1; }
      g.save(); g.beginPath(); g.rect(L, T - 2, pw, ph + 4); g.clip();
      this.series.forEach((s, si) => {
        g.strokeStyle = s.col; g.lineWidth = s.kind === 'pos' ? 2.2 : 1.6; g.setLineDash(s.kind === 'p' ? [5, 4] : []);
        g.beginPath();
        let started = false;
        for (let i = 0; i < this.t.length; i++) {
          if (this.t[i] < t0 - 0.1) continue;
          const x = X(this.t[i]), y = s.kind === 'pos' ? Yp(this.rows[i][si]) : Yb(Math.max(0, this.rows[i][si]));
          if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y);
        }
        g.stroke();
      });
      g.restore(); g.setLineDash([]);
    }
  }
  UI.Scope = Scope;
})();
