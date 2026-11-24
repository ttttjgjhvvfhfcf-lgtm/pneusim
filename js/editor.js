/* PneuSim – Editor und Simulationsansicht (SVG) */
(function () {
  const PS = globalThis.PS;
  const NS = 'http://www.w3.org/2000/svg';
  const G = PS.G;
  const clamp = PS.clamp;
  const mk = (tag, attrs, parent) => {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const ptStr = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ');

  class Editor {
    constructor(svg, cb) {
      this.svg = svg;
      this.cb = cb || {};
      this.doc = PS.Doc.create();
      this.view = { x: 60, y: 40, k: 1 };
      this.sel = new Set();
      this.mode = 'edit';
      this.compEls = new Map();
      this.wireEls = new Map();
      this.hist = []; this.hi = -1;
      this.clip = null;
      this.sim = null; this.running = false; this.speed = 1;
      this.connSet = new Set();
      this.spaceDown = false;
      this.cache = new Map();
      this.build();
      this.bind();
    }

    /* ------------------------------------------------------------ Aufbau */
    build() {
      this.svg.innerHTML =
        `<defs><pattern id="pgrid" width="50" height="50" patternUnits="userSpaceOnUse">` +
        `<path class="gl-minor" d="M10 0V50M20 0V50M30 0V50M40 0V50M0 10H50M0 20H50M0 30H50M0 40H50"/>` +
        `<path class="gl-major" d="M0 0V50M0 0H50"/></pattern></defs>` +
        `<rect class="gridrect" width="100%" height="100%" fill="url(#pgrid)"/>` +
        `<g class="world"><g class="l-wires"></g><g class="l-comps"></g><g class="l-over"></g></g>`;
      this.pat = this.svg.querySelector('#pgrid');
      this.world = this.svg.querySelector('.world');
      this.lWires = this.svg.querySelector('.l-wires');
      this.lComps = this.svg.querySelector('.l-comps');
      this.lOver = this.svg.querySelector('.l-over');
      this.applyView();
    }

    applyView() {
      const v = this.view;
      this.world.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.k})`);
      this.pat.setAttribute('patternTransform', `translate(${v.x} ${v.y}) scale(${v.k})`);
      this.svg.classList.toggle('zoom-out', v.k < 0.55);
      if (this.cb.onView) this.cb.onView(v);
    }
    toWorld(e) {
      const r = this.svg.getBoundingClientRect();
      return [(e.clientX - r.left - this.view.x) / this.view.k, (e.clientY - r.top - this.view.y) / this.view.k];
    }
    zoomAt(cx, cy, f) {
      const v = this.view, k = clamp(v.k * f, 0.2, 4);
      v.x = cx - (cx - v.x) * (k / v.k); v.y = cy - (cy - v.y) * (k / v.k); v.k = k;
      this.applyView();
    }
    zoomBy(f) { const r = this.svg.getBoundingClientRect(); this.zoomAt(r.width / 2, r.height / 2, f); }
    fit() {
      const cs = this.doc.comps;
      const r = this.svg.getBoundingClientRect();
      if (!cs.length) { this.view = { x: 60, y: 40, k: 1 }; this.applyView(); return; }
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      cs.forEach((c) => {
        const b = PS.worldBBox(c);
        x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
        if (c.type === 'cylD' || c.type === 'cylS') { // ausgefahrene Kolbenstange mit einbeziehen
          const [px, py] = PS.worldPoint(c, 254, 15);
          x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
        }
      });
      const pad = 50;
      const k = clamp(Math.min((r.width - 2 * pad) / (x1 - x0), (r.height - 2 * pad) / (y1 - y0)), 0.25, 1.6);
      this.view = { k, x: (r.width - (x1 - x0) * k) / 2 - x0 * k, y: (r.height - (y1 - y0) * k) / 2 - y0 * k };
      this.applyView();
    }

    /* Ansicht anpassen, falls Teile des Plans abgeschnitten sind (z. B. nach Größenänderung) */
    fitIfClipped() {
      const cs = this.doc.comps;
      if (!cs.length) return;
      const r = this.svg.getBoundingClientRect(), v = this.view;
      let clipped = false;
      cs.forEach((c) => {
        const b = PS.worldBBox(c);
        const sx0 = b.x0 * v.k + v.x, sy0 = b.y0 * v.k + v.y, sx1 = b.x1 * v.k + v.x, sy1 = b.y1 * v.k + v.y;
        if (sx0 < 4 || sy0 < 4 || sx1 > r.width - 4 || sy1 > r.height - 4) clipped = true;
      });
      if (clipped) this.fit();
    }

    /* ------------------------------------------------------------ Dokument */
    setDoc(doc, keepHistory) {
      this.doc = doc;
      this.sel.clear();
      this.lComps.innerHTML = ''; this.lWires.innerHTML = '';
      this.compEls.clear(); this.wireEls.clear();
      this.doc.wires.forEach((w) => (w._pts = null));
      this.renderAll();
      if (!keepHistory) { this.hist = []; this.hi = -1; this.commit(true); }
      this.fireSelect();
    }
    snapshot() { return PS.Doc.serialize(this.doc); }
    commit(silent) {
      const s = this.snapshot();
      if (this.hist[this.hi] === s) return;
      this.hist = this.hist.slice(0, this.hi + 1);
      this.hist.push(s);
      if (this.hist.length > 120) this.hist.shift();
      this.hi = this.hist.length - 1;
      if (!silent && this.cb.onChange) this.cb.onChange(this.doc);
      if (this.cb.onHistory) this.cb.onHistory(this.hi > 0, this.hi < this.hist.length - 1);
    }
    loadSnap(s) {
      const sel = new Set(this.sel);
      this.setDoc(PS.Doc.parse(s), true);
      sel.forEach((id) => { if (this.compEls.has(id) || this.wireEls.has(id)) this.sel.add(id); });
      this.refreshSelection();
      if (this.cb.onChange) this.cb.onChange(this.doc);
      if (this.cb.onHistory) this.cb.onHistory(this.hi > 0, this.hi < this.hist.length - 1);
    }
    undo() { if (this.mode === 'edit' && this.hi > 0) { this.hi--; this.loadSnap(this.hist[this.hi]); } }
    redo() { if (this.mode === 'edit' && this.hi < this.hist.length - 1) { this.hi++; this.loadSnap(this.hist[this.hi]); } }

    /* ------------------------------------------------------------ Darstellung */
    byId(id) { return this.doc.comps.find((c) => c.id === id); }
    wireById(id) { return this.doc.wires.find((w) => w.id === id); }

    symCtx(c) {
      const sim = this.sim, doc = this.doc, self = this;
      const ctx = {
        rot: c.rot, flip: c.flip, doc,
        conn: (pid) => self.connSet.has(c.id + ':' + pid),
        sensors: (id) => (PS.opts.showSensors ? PS.Doc.sensorsOf(doc, id) : []),
        cylLabel: (id) => { const cc = self.byId(id); return cc ? cc.label || cc.type : null; },
        refLabel: (id) => { const cc = self.byId(id); return cc ? cc.label || cc.type : null; },
        sim: null, rt: null, ecol: () => null,
      };
      if (sim && this.mode === 'sim') {
        ctx.sim = sim; ctx.rt = sim.rt[c.id];
        ctx.pp = (pid) => sim.pg(c.id, pid);
        ctx.flow = (pid) => (self.flows && self.flows[c.id + ':' + pid]) || 0;
        ctx.ecol = (pid) => {
          const net = sim.eport[c.id + ':' + pid];
          return net == null || !sim.elec ? null : PS.ecol(sim.elec.pot(net), sim.elec.cur[net]);
        };
      } else { ctx.pp = () => 0; ctx.flow = () => 0; }
      return ctx;
    }

    refreshConn() { this.connSet = PS.Doc.connSet(this.doc); }

    renderAll() {
      this.refreshConn();
      const obs = PS.obstacles(this.doc);
      this.doc.comps.forEach((c) => this.renderComp(c));
      this.doc.wires.forEach((w) => { w._pts = null; });
      this.doc.wires.forEach((w) => { w._pts = PS.routeWire(this.doc, w, obs); this.renderWire(w); });
      this.refreshPortStates();
      this.refreshSelection();
    }

    renderComp(c) {
      const T = PS.types[c.type];
      if (!T) return;
      let g = this.compEls.get(c.id);
      if (!g) {
        g = mk('g', { class: 'comp t-' + c.type, 'data-cid': c.id }, this.lComps);
        g.innerHTML = '<rect class="selbox" rx="4"/><g class="rg"><rect class="hitbox"/><g class="sym"></g><g class="portsg"></g></g><text class="clabel"></text>';
        this.compEls.set(c.id, g);
        g._sym = g.querySelector('.sym'); g._rg = g.querySelector('.rg'); g._ports = g.querySelector('.portsg');
        g._hit = g.querySelector('.hitbox'); g._sel = g.querySelector('.selbox'); g._lbl = g.querySelector('.clabel');
      }
      g.setAttribute('transform', `translate(${c.x} ${c.y})`);
      g._rg.setAttribute('transform', `${c.rot ? `rotate(${c.rot * 90}) ` : ''}${c.flip ? 'scale(-1 1)' : ''}`);
      const lb = T.bbox(c);
      g._hit.setAttribute('x', lb.x0); g._hit.setAttribute('y', lb.y0);
      g._hit.setAttribute('width', lb.x1 - lb.x0); g._hit.setAttribute('height', lb.y1 - lb.y0);
      const wb = PS.worldBBox(c);
      g._sel.setAttribute('x', wb.x0 - c.x - 2); g._sel.setAttribute('y', wb.y0 - c.y - 2);
      g._sel.setAttribute('width', wb.x1 - wb.x0 + 4); g._sel.setAttribute('height', wb.y1 - wb.y0 + 4);
      const body = PS.worldBody(c);
      g._lbl.setAttribute('x', body.x0 - c.x); g._lbl.setAttribute('y', body.y0 - c.y - 6);
      g._lbl.textContent = c.label || '';
      g._sym.innerHTML = T.draw(c, this.symCtx(c));
      g._symStr = null;
      // Ports
      const ports = T.ports(c);
      g._ports.innerHTML = ports.map((p) => `<circle class="port${p.kind === 'exh' || p.kind === 'bus' ? ' exh' : ''}" cx="${p.x}" cy="${p.y}" r="5" data-cid="${c.id}" data-pid="${p.id}"><title>Anschluss ${PS.esc(p.label || p.id)}</title></circle>`).join('');
    }

    refreshPortStates() {
      this.refreshConn();
      this.compEls.forEach((g, id) => {
        g._ports.querySelectorAll('.port').forEach((p) => p.classList.toggle('conn', this.connSet.has(id + ':' + p.dataset.pid)));
      });
    }

    /* Domäne eines Anschlusses: 'e' = elektrisch, sonst 'p' = pneumatisch */
    portDom(ref) {
      const c = this.byId(ref.c), T = c && PS.types[c.type];
      const pd = T && T.ports(c).find((p) => p.id === ref.p);
      return pd && pd.dom === 'e' ? 'e' : 'p';
    }

    renderWire(w) {
      let g = this.wireEls.get(w.id);
      if (!g) {
        g = mk('g', { class: 'wire', 'data-wid': w.id }, this.lWires);
        g.innerHTML = '<path class="whit"/><path class="wline"/><path class="wflow"/>';
        this.wireEls.set(w.id, g);
        g._line = g.querySelector('.wline'); g._hit = g.querySelector('.whit'); g._flow = g.querySelector('.wflow');
      }
      const d = w._pts ? ptStr(w._pts) : '';
      g._line.setAttribute('d', d); g._hit.setAttribute('d', d); g._flow.setAttribute('d', d);
      w._dom = this.portDom(w.a);
      g.classList.toggle('elec', w._dom === 'e');
      g.classList.toggle('sel', this.sel.has(w.id));
      if (this.sel.has(w.id) && !(this.drag && this.drag.type === 'seg') && this.sel.size === 1) this.refreshHandles();
    }

    removeEls(ids) {
      ids.forEach((id) => {
        const g = this.compEls.get(id) || this.wireEls.get(id);
        if (g) g.remove();
        this.compEls.delete(id); this.wireEls.delete(id);
      });
    }

    rerouteWires(compIds) {
      const set = compIds ? new Set(compIds) : null;
      const obs = PS.obstacles(this.doc);
      this.doc.wires.forEach((w) => {
        if (!set || set.has(w.a.c) || set.has(w.b.c)) { w._pts = PS.routeWire(this.doc, w, obs); this.renderWire(w); }
      });
    }

    refreshSelection() {
      this.compEls.forEach((g, id) => g.classList.toggle('sel', this.sel.has(id)));
      this.wireEls.forEach((g, id) => g.classList.toggle('sel', this.sel.has(id)));
      this.refreshHandles();
    }

    /* Griffe zum Verschieben der inneren Leitungsabschnitte */
    refreshHandles() {
      this.lOver.querySelectorAll('.seghandle').forEach((n) => n.remove());
      if (this.mode !== 'edit' || this.sel.size !== 1) return;
      const id = [...this.sel][0];
      if (id[0] !== 'w') return;
      const w = this.wireById(id);
      if (!w || !w._pts) return;
      const pts = w._pts;
      for (let i = 1; i <= pts.length - 3; i++) {
        const a = pts[i], b = pts[i + 1];
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 20) continue;
        const horiz = a[1] === b[1];
        mk('rect', { class: 'seghandle ' + (horiz ? 'hh' : 'hv'), x: (a[0] + b[0]) / 2 - 4, y: (a[1] + b[1]) / 2 - 4, width: 8, height: 8, rx: 2, 'data-wid': w.id, 'data-seg': i }, this.lOver);
      }
    }
    fireSelect() { if (this.cb.onSelect) this.cb.onSelect([...this.sel]); }
    select(ids, add) {
      if (!add) this.sel.clear();
      ids.forEach((id) => this.sel.add(id));
      this.refreshSelection(); this.fireSelect();
    }
    toggleSel(id) { if (this.sel.has(id)) this.sel.delete(id); else this.sel.add(id); this.refreshSelection(); this.fireSelect(); }

    /* ------------------------------------------------------------ Bearbeiten */
    addPart(item, x, y) {
      if (this.mode !== 'edit') return null;
      const T = PS.types[item.type];
      const probe = { x: 0, y: 0, rot: item.rot || 0, flip: !!item.flip, type: item.type, p: Object.assign(T.defaults(), PS.copy(item.p || {})) };
      const b = PS.worldBBox(probe);
      if (x == null) {
        const r = this.svg.getBoundingClientRect();
        x = (r.width / 2 - this.view.x) / this.view.k + ((this.doc.comps.length * 20) % 120);
        y = (r.height / 2 - this.view.y) / this.view.k + ((this.doc.comps.length * 20) % 120);
      }
      const px = PS.snap(x - (b.x0 + b.x1) / 2), py = PS.snap(y - (b.y0 + b.y1) / 2);
      const c = PS.Doc.addComp(this.doc, item.type, px, py, item.p, { rot: item.rot, flip: item.flip });
      this.renderComp(c); this.refreshPortStates();
      this.commit();
      this.select([c.id]);
      return c;
    }

    deleteSelection() {
      if (this.mode !== 'edit' || !this.sel.size) return;
      const ids = [...this.sel];
      const gone = [];
      ids.forEach((id) => {
        if (id[0] === 'c') {
          this.doc.wires.filter((w) => w.a.c === id || w.b.c === id).forEach((w) => gone.push(w.id));
          PS.Doc.removeComp(this.doc, id); gone.push(id);
        } else { this.doc.wires = this.doc.wires.filter((w) => w.id !== id); gone.push(id); }
      });
      this.removeEls(gone);
      this.sel.clear();
      this.refreshPortStates();
      // Geberzuordnungen können sich geändert haben
      this.doc.comps.forEach((c) => this.renderComp(c));
      this.commit(); this.fireSelect();
    }

    selComps() { return [...this.sel].filter((id) => id[0] === 'c').map((id) => this.byId(id)).filter(Boolean); }

    transformSel(fn) {
      if (this.mode !== 'edit') return;
      const cs = this.selComps();
      if (!cs.length) return;
      cs.forEach(fn);
      cs.forEach((c) => this.renderComp(c));
      this.rerouteWires(cs.map((c) => c.id));
      this.commit(); this.fireSelect();
    }
    rotateSel(d) { this.transformSel((c) => (c.rot = (c.rot + (d || 1) + 4) & 3)); }
    flipSel() { this.transformSel((c) => (c.flip = !c.flip)); }
    nudge(dx, dy) {
      this.transformSel((c) => { c.x += dx; c.y += dy; });
    }

    paramChanged(c, noCommit) {
      this.renderComp(c);
      this.refreshPortStates();
      // Anschlüsse können sich verschoben haben (Ventil) → Leitungen neu führen, Geber-Marken aktualisieren
      this.rerouteWires([c.id]);
      this.refreshRefs(c);
      if (!noCommit) { clearTimeout(this._pt); this._pt = setTimeout(() => this.commit(), 350); }
    }

    /* Bauteile neu zeichnen, die Namen/Positionen anderer Bauteile anzeigen (Geber, Spulen, Relais) */
    refreshRefs(except) {
      this.doc.comps.forEach((o) => { if (o !== except && ['cylD', 'cylS', 'valve', 'timer', 'kcont'].includes(o.type)) this.renderComp(o); });
    }

    labelChanged(c) {
      const g = this.compEls.get(c.id);
      if (g) g._lbl.textContent = c.label || '';
      this.refreshRefs(c);
      clearTimeout(this._pt); this._pt = setTimeout(() => this.commit(), 350);
    }

    copy() {
      const cs = this.selComps();
      if (!cs.length) return;
      const ids = new Set(cs.map((c) => c.id));
      this.clip = { comps: PS.copy(cs), wires: PS.copy(this.doc.wires.filter((w) => ids.has(w.a.c) && ids.has(w.b.c)).map((w) => ({ a: w.a, b: w.b, via: w.via }))) };
    }
    paste(dx, dy) {
      if (this.mode !== 'edit' || !this.clip) return;
      dx = dx == null ? 30 : dx; dy = dy == null ? 30 : dy;
      const map = {}, newIds = [];
      this.clip.comps.forEach((c0) => {
        const c = PS.Doc.addComp(this.doc, c0.type, c0.x + dx, c0.y + dy, c0.p, { rot: c0.rot, flip: c0.flip, label: PS.Doc.labelFor(this.doc, c0.type, c0.p) });
        map[c0.id] = c.id; newIds.push(c.id);
      });
      this.clip.wires.forEach((w) => {
        PS.Doc.addWire(this.doc, { c: map[w.a.c], p: w.a.p }, { c: map[w.b.c], p: w.b.p }, w.via ? w.via.map((p) => [p[0] + dx, p[1] + dy]) : null);
      });
      // Geberzuordnungen innerhalb der Kopie umlenken
      newIds.forEach((id) => {
        const c = this.byId(id);
        PS.Doc.eachBind(c, (k, bd) => PS.Doc.REFS.forEach((r) => { if (bd[r] && map[bd[r]]) c.p[k] = Object.assign({}, c.p[k], { [r]: map[bd[r]] }); }));
      });
      this.clip.comps.forEach((c) => { c.x += dx; c.y += dy; });
      this.setDocKeep();
      this.select(newIds);
      this.commit();
    }
    duplicate() { this.copy(); this.paste(); }
    setDocKeep() {
      const sel = new Set(this.sel);
      this.lComps.innerHTML = ''; this.lWires.innerHTML = ''; this.compEls.clear(); this.wireEls.clear();
      this.renderAll();
      sel.forEach((id) => { if (this.compEls.has(id) || this.wireEls.has(id)) this.sel.add(id); });
      this.refreshSelection();
    }
    selectAll() { this.select([...this.doc.comps.map((c) => c.id), ...this.doc.wires.map((w) => w.id)]); }

    clearAll() { this.setDoc(PS.Doc.create('Neuer Schaltplan')); }

    /* Leitungen */
    addWire(a, b, via) {
      if (a.c === b.c && a.p === b.p) return null;
      if (a.c === b.c && !PS.types[this.byId(a.c).type].junction) return null;
      if (this.portDom(a) !== this.portDom(b)) return null; // Pneumatik und Elektrik nicht mischen
      if (this.doc.wires.some((w) => (w.a.c === a.c && w.a.p === a.p && w.b.c === b.c && w.b.p === b.p) || (w.a.c === b.c && w.a.p === b.p && w.b.c === a.c && w.b.p === a.p))) return null;
      const w = PS.Doc.addWire(this.doc, a, b, via && via.length ? via : null);
      w._pts = PS.routeWire(this.doc, w);
      this.renderWire(w);
      this.refreshPortStates();
      this.commit();
      return w;
    }

    /* Leitung an Punkt (x,y) teilen und Verzweigung einsetzen */
    splitWire(w, x, y) {
      const pts = w._pts || [];
      const n = PS.nearestOnPath(pts, x, y);
      if (!n) return null;
      let jx = n.x, jy = n.y;
      const a = pts[n.seg], b = pts[n.seg + 1];
      if (a[1] === b[1]) jx = clamp(PS.snap(x), Math.min(a[0], b[0]), Math.max(a[0], b[0]));
      else jy = clamp(PS.snap(y), Math.min(a[1], b[1]), Math.max(a[1], b[1]));
      jx = PS.snap(jx); jy = PS.snap(jy);
      if (pts.some((p, i) => (i === 0 || i === pts.length - 1) && p[0] === jx && p[1] === jy)) return null;
      const before = pts.slice(1, n.seg + 1).concat(), after = pts.slice(n.seg + 1, -1);
      const j = PS.Doc.addComp(this.doc, w._dom === 'e' ? 'ejunction' : 'junction', jx, jy);
      const w1 = PS.Doc.addWire(this.doc, w.a, { c: j.id, p: '1' }, before);
      const w2 = PS.Doc.addWire(this.doc, { c: j.id, p: '1' }, w.b, after);
      this.doc.wires = this.doc.wires.filter((o) => o !== w);
      this.removeEls([w.id]);
      this.renderComp(j);
      [w1, w2].forEach((o) => { o._pts = PS.routeWire(this.doc, o); this.renderWire(o); });
      return j;
    }

    /* ------------------------------------------------------------ Eingabe */
    bind() {
      const svg = this.svg;
      svg.addEventListener('pointerdown', (e) => this.onDown(e));
      svg.addEventListener('pointermove', (e) => this.onMove(e));
      svg.addEventListener('pointerup', (e) => this.onUp(e));
      svg.addEventListener('pointercancel', (e) => this.onUp(e));
      svg.addEventListener('contextmenu', (e) => e.preventDefault());
      svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const r = svg.getBoundingClientRect();
        if (e.shiftKey && !e.ctrlKey) { this.view.x -= e.deltaY; this.applyView(); return; }
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        this.zoomAt(e.clientX - r.left, e.clientY - r.top, f);
      }, { passive: false });
      svg.addEventListener('dblclick', (e) => { if (this.cb.onDblClick) this.cb.onDblClick(e); });
      this.keyHandler = (e) => this.onKey(e);
      document.addEventListener('keydown', this.keyHandler);
      document.addEventListener('keyup', (e) => { if (e.code === 'Space') { this.spaceDown = false; svg.classList.remove('panning'); } });
      svg.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
      svg.addEventListener('drop', (e) => {
        e.preventDefault();
        const idx = e.dataTransfer.getData('application/x-pneusim');
        if (!idx) return;
        const [x, y] = this.toWorld(e);
        if (this.cb.onDropItem) this.cb.onDropItem(idx, x, y);
      });
      this.touches = new Map();
    }

    onKey(e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (this.mode === 'sim') return;
      if (e.code === 'Space') { this.spaceDown = true; this.svg.classList.add('panning'); e.preventDefault(); return; }
      if (e.key === 'Escape') { if (this.wiring) this.cancelWire(); else { this.select([]); } return; }
      if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteSelection(); e.preventDefault(); return; }
      if (ctrl && e.key.toLowerCase() === 'z') { e.shiftKey ? this.redo() : this.undo(); e.preventDefault(); return; }
      if (ctrl && e.key.toLowerCase() === 'y') { this.redo(); e.preventDefault(); return; }
      if (ctrl && e.key.toLowerCase() === 'c') { this.copy(); return; }
      if (ctrl && e.key.toLowerCase() === 'x') { this.copy(); this.deleteSelection(); return; }
      if (ctrl && e.key.toLowerCase() === 'v') { this.paste(); e.preventDefault(); return; }
      if (ctrl && e.key.toLowerCase() === 'd') { this.duplicate(); e.preventDefault(); return; }
      if (ctrl && e.key.toLowerCase() === 'a') { this.selectAll(); e.preventDefault(); return; }
      if (ctrl) return;
      const k = e.key.toLowerCase();
      if (k === 'r') this.rotateSel(e.shiftKey ? -1 : 1);
      else if (k === 'm' || k === 'f') this.flipSel();
      else if (e.key === 'ArrowLeft') { this.nudge(-G, 0); e.preventDefault(); }
      else if (e.key === 'ArrowRight') { this.nudge(G, 0); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.nudge(0, -G); e.preventDefault(); }
      else if (e.key === 'ArrowDown') { this.nudge(0, G); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') this.zoomBy(1.2);
      else if (e.key === '-') this.zoomBy(1 / 1.2);
      else if (e.key === '0') this.fit();
    }

    nearestPort(x, y, maxD, excl) {
      let best = null;
      this.doc.comps.forEach((c) => {
        PS.worldPorts(c).forEach((p) => {
          if (excl && excl(c, p)) return;
          const d = Math.hypot(p.x - x, p.y - y);
          if (d <= maxD && (!best || d < best.d)) best = { d, c: c.id, p: p.id, x: p.x, y: p.y, dir: p.dir };
        });
      });
      return best;
    }

    onDown(e) {
      this.svg.focus && this.svg.focus({ preventScroll: true });
      if (this.touches.size >= 1 && e.pointerType === 'touch') { /* Mehrfingergeste */ }
      if (e.pointerType === 'touch') {
        this.touches.set(e.pointerId, [e.clientX, e.clientY]);
        if (this.touches.size === 2) { this.startPinch(); return; }
      }
      const pan = e.button === 1 || e.button === 2 || this.spaceDown;
      if (pan) { this.drag = { type: 'pan', sx: e.clientX, sy: e.clientY, vx: this.view.x, vy: this.view.y }; this.svg.setPointerCapture(e.pointerId); e.preventDefault(); return; }
      if (e.button !== 0) return;
      const t = e.target;
      const pos = this.toWorld(e);
      if (this.mode === 'sim') return this.simDown(e, t);

      const handle = t.closest && t.closest('.seghandle');
      if (handle && !this.wiring) {
        const w = this.wireById(handle.dataset.wid);
        this.drag = { type: 'seg', w, i: +handle.dataset.seg, pts: PS.copy(w._pts), start: pos, moved: false };
        this.svg.setPointerCapture(e.pointerId);
        return;
      }
      const portEl = t.closest && t.closest('.port');
      if (this.wiring) { this.wiring.down = [e.clientX, e.clientY]; this.wiring.moved = false; this.svg.setPointerCapture(e.pointerId); return; }
      if (portEl) {
        const pc = this.byId(portEl.dataset.cid);
        const isJ = !!(pc && PS.types[pc.type].junction);
        if (isJ && !e.shiftKey) {
          // Verzweigung: Ziehen startet eine Leitung, Klick wählt sie aus, Umschalt+Ziehen verschiebt sie
          this.jPress = { cid: pc.id, pid: portEl.dataset.pid, x: e.clientX, y: e.clientY, e };
          this.svg.setPointerCapture(e.pointerId);
          return;
        }
        if (!isJ) { this.startWire(portEl.dataset.cid, portEl.dataset.pid, e); return; }
      }
      const compEl = t.closest && t.closest('.comp');
      const wireEl = t.closest && t.closest('.wire');
      if (compEl) {
        const id = compEl.dataset.cid;
        if (e.shiftKey) this.toggleSel(id);
        else if (!this.sel.has(id)) this.select([id]);
        const ids = this.selComps();
        this.drag = { type: 'move', start: pos, orig: new Map(ids.map((c) => [c.id, [c.x, c.y]])), moved: false, sx: e.clientX, sy: e.clientY };
        this.svg.setPointerCapture(e.pointerId);
      } else if (wireEl) {
        const id = wireEl.dataset.wid;
        if (e.shiftKey) this.toggleSel(id); else this.select([id]);
      } else {
        if (!e.shiftKey) this.select([]);
        this.drag = { type: 'rubber', start: pos, cur: pos, add: e.shiftKey };
        this.svg.setPointerCapture(e.pointerId);
      }
    }

    startPinch() {
      const pts = [...this.touches.values()];
      this.drag = { type: 'pinch', d0: Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]), k0: this.view.k, c0: [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], vx: this.view.x, vy: this.view.y };
    }

    onMove(e) {
      if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, [e.clientX, e.clientY]);
        if (this.drag && this.drag.type === 'pinch' && this.touches.size >= 2) {
          const pts = [...this.touches.values()], r = this.svg.getBoundingClientRect();
          const d = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
          const k = clamp(this.drag.k0 * d / this.drag.d0, 0.2, 4);
          const c = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
          const cx0 = this.drag.c0[0] - r.left, cy0 = this.drag.c0[1] - r.top;
          this.view.k = k;
          this.view.x = c[0] - r.left - (cx0 - this.drag.vx) * (k / this.drag.k0);
          this.view.y = c[1] - r.top - (cy0 - this.drag.vy) * (k / this.drag.k0);
          this.applyView();
          return;
        }
      }
      const pos = this.toWorld(e);
      if (this.jPress && Math.hypot(e.clientX - this.jPress.x, e.clientY - this.jPress.y) > 4) {
        const j = this.jPress; this.jPress = null;
        this.startWire(j.cid, j.pid, e);
        this.updateWirePreview(e, pos);
        return;
      }
      if (this.sim && this.mode === 'sim' && !(this.drag && this.drag.type === 'pan')) { this.simHover(e); return; }
      const d = this.drag;
      if (d) {
        if (d.type === 'pan') { this.view.x = d.vx + e.clientX - d.sx; this.view.y = d.vy + e.clientY - d.sy; this.applyView(); }
        else if (d.type === 'move') {
          if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) return;
          d.moved = true;
          const dx = PS.snap(pos[0] - d.start[0]), dy = PS.snap(pos[1] - d.start[1]);
          const ids = [];
          d.orig.forEach((o, id) => { const c = this.byId(id); if (c.x !== o[0] + dx || c.y !== o[1] + dy) { c.x = o[0] + dx; c.y = o[1] + dy; ids.push(id); } });
          if (ids.length) {
            ids.forEach((id) => this.renderComp(this.byId(id)));
            this.scheduleReroute(d.orig, dx, dy);
          }
        } else if (d.type === 'rubber') { d.cur = pos; this.drawRubber(); }
        else if (d.type === 'seg') {
          const pts = PS.copy(d.pts), a = pts[d.i], b = pts[d.i + 1];
          if (a[1] === b[1]) { const y = PS.snap(pos[1]); a[1] = y; b[1] = y; } else { const x = PS.snap(pos[0]); a[0] = x; b[0] = x; }
          d.moved = true;
          d.w.via = pts.slice(1, -1);
          d.w._pts = PS.routeWire(this.doc, d.w);
          this.renderWire(d.w);
        }
      }
      if (this.wiring) this.updateWirePreview(e, pos);
    }

    scheduleReroute(orig, dx, dy) {
      if (this._rr) return;
      this._rr = requestAnimationFrame(() => {
        this._rr = null;
        const set = new Set(orig.keys());
        const obs = PS.obstacles(this.doc);
        this.doc.wires.forEach((w) => {
          const ma = set.has(w.a.c), mb = set.has(w.b.c);
          if (!ma && !mb) return;
          if (ma && mb && Array.isArray(w.via)) {
            // beide Enden bewegen sich: Zwischenpunkte mitnehmen
            if (w._moved == null) w._moved = [0, 0];
            const sx = dx - w._moved[0], sy = dy - w._moved[1];
            w.via = w.via.map((p) => [p[0] + sx, p[1] + sy]);
            w._moved = [dx, dy];
          }
          w._pts = PS.routeWire(this.doc, w, obs);
          this.renderWire(w);
        });
      });
    }

    onUp(e) {
      if (e.pointerType === 'touch') { this.touches.delete(e.pointerId); if (this.drag && this.drag.type === 'pinch') { if (this.touches.size < 2) this.drag = null; return; } }
      try { this.svg.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      if (this.drag && this.drag.type === 'pan') { this.drag = null; return; }
      if (this.jPress) { const j = this.jPress; this.jPress = null; this.select([j.cid]); return; }
      if (this.mode === 'sim') { this.simUp(e); return; }
      const d = this.drag;
      if (this.wiring) { this.wireUp(e); return; }
      if (!d) return;
      this.drag = null;
      if (d.type === 'seg') { this.refreshHandles(); if (d.moved) this.commit(); return; }
      if (d.type === 'move') {
        this.doc.wires.forEach((w) => { delete w._moved; });
        if (d.moved) { this.rerouteWires([...d.orig.keys()]); this.refreshPortStates(); this.commit(); this.fireSelect(); }
      } else if (d.type === 'rubber') {
        this.clearRubber();
        const x0 = Math.min(d.start[0], d.cur[0]), x1 = Math.max(d.start[0], d.cur[0]), y0 = Math.min(d.start[1], d.cur[1]), y1 = Math.max(d.start[1], d.cur[1]);
        if (x1 - x0 < 3 && y1 - y0 < 3) return;
        const ids = this.doc.comps.filter((c) => { const b = PS.worldBBox(c); return b.x1 >= x0 && b.x0 <= x1 && b.y1 >= y0 && b.y0 <= y1; }).map((c) => c.id);
        this.select(ids, d.add);
      }
    }

    drawRubber() {
      const d = this.drag;
      let r = this.lOver.querySelector('.rubber');
      if (!r) r = mk('rect', { class: 'rubber' }, this.lOver);
      r.setAttribute('x', Math.min(d.start[0], d.cur[0])); r.setAttribute('y', Math.min(d.start[1], d.cur[1]));
      r.setAttribute('width', Math.abs(d.cur[0] - d.start[0])); r.setAttribute('height', Math.abs(d.cur[1] - d.start[1]));
    }
    clearRubber() { const r = this.lOver.querySelector('.rubber'); if (r) r.remove(); }

    /* ---- Leitung ziehen ---- */
    startWire(cid, pid, e) {
      const c = this.byId(cid);
      const port = PS.worldPorts(c).find((p) => p.id === pid);
      this.wiring = { a: { c: cid, p: pid }, dom: port.dom === 'e' ? 'e' : 'p', start: port, via: [], cur: [port.x, port.y], down: [e.clientX, e.clientY], moved: false, click: false, hover: null, obs: PS.obstacles(this.doc) };
      this.svg.classList.add('wiring');
      this.svg.setPointerCapture(e.pointerId);
      this.updateWirePreview(e, [port.x, port.y]);
    }
    cancelWire() {
      this.wiring = null;
      this.svg.classList.remove('wiring');
      const p = this.lOver.querySelector('.wprev'); if (p) p.remove();
      this.lOver.querySelectorAll('.pmark').forEach((n) => n.remove());
    }
    updateWirePreview(e, pos) {
      const w = this.wiring;
      if (!w) return;
      if (Math.hypot(e.clientX - w.down[0], e.clientY - w.down[1]) > 4) w.moved = true;
      const hov = this.nearestPort(pos[0], pos[1], 14, (c, p) => c.id === w.a.c || (p.dom === 'e' ? 'e' : 'p') !== w.dom);
      w.hover = hov;
      w.cur = hov ? [hov.x, hov.y] : [PS.snap(pos[0]), PS.snap(pos[1])];
      const target = hov ? { x: hov.x, y: hov.y, dir: hov.dir } : { x: w.cur[0], y: w.cur[1], dir: 'any' };
      const pts = PS.routePreview(this.doc, w.start, w.via, target, w.obs);
      let path = this.lOver.querySelector('.wprev');
      if (!path) path = mk('path', { class: 'wprev' }, this.lOver);
      path.setAttribute('d', ptStr(pts));
      this.lOver.querySelectorAll('.pmark').forEach((n) => n.remove());
      if (hov) mk('circle', { class: 'pmark', cx: hov.x, cy: hov.y, r: 7 }, this.lOver);
      this.wirePos = pos;
    }
    wireUp(e) {
      const w = this.wiring;
      const pos = this.toWorld(e);
      this.updateWirePreview(e, pos);
      const wireEl = document.elementFromPoint(e.clientX, e.clientY);
      const overWire = wireEl && wireEl.closest ? wireEl.closest('.wire') : null;
      if (w.hover) {
        const via = w.via;
        const ok = this.addWire(w.a, { c: w.hover.c, p: w.hover.p }, via);
        this.cancelWire();
        if (ok) this.select([ok.id]);
        return;
      }
      if (overWire && (w.moved || w.click)) {
        const tw = this.wireById(overWire.dataset.wid);
        if (tw && tw._pts && tw._dom === w.dom) {
          const j = this.splitWire(tw, pos[0], pos[1]);
          if (j) {
            const ok = this.addWire(w.a, { c: j.id, p: '1' }, w.via);
            this.cancelWire(); this.refreshPortStates(); this.commit();
            if (ok) this.select([ok.id]);
            return;
          }
        }
      }
      if (w.moved || w.click) {
        const last = w.via.length ? w.via[w.via.length - 1] : [w.start.x, w.start.y];
        if (w.cur[0] !== last[0] || w.cur[1] !== last[1]) w.via.push(w.cur.slice());
      }
      w.click = true;
      this.updateWirePreview(e, pos);
    }

    /* ------------------------------------------------------------ Simulation */
    enterSim() {
      if (this.wiring) this.cancelWire();
      this.mode = 'sim';
      this.svg.classList.add('simmode');
      this.select([]);
      this.compile();
      this.last = performance.now();
      this.running = true;
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }
    exitSim() {
      this.mode = 'edit';
      this.svg.classList.remove('simmode');
      cancelAnimationFrame(this.raf);
      this.sim = null; this.running = false;
      this.wireEls.forEach((g) => { g._line.removeAttribute('style'); g._flow.removeAttribute('style'); g._line.classList.remove('live'); g.classList.remove('flowing', 'short'); g._q = undefined; g._eq = undefined; g._on = undefined; });
      this.doc.comps.forEach((c) => this.renderComp(c));
      this.refreshPortStates();
    }
    compile() {
      this.doc.wires.forEach((w) => { w.len = w._pts ? PS.pathLen(w._pts) : 60; });
      this.sim = PS.compile(this.doc);
      this.flows = {};
      this.cache.clear();
      this.simHeld = null;
      if (this.cb.onSimCompiled) this.cb.onSimCompiled(this.sim);
      this.renderSim(true);
    }
    simReset() { this.compile(); this.last = performance.now(); }
    simToggle() { this.running = !this.running; this.last = performance.now(); if (this.cb.onRunState) this.cb.onRunState(this.running); }
    simStep(dt) { if (this.sim) { this.sim.advance(dt || 0.02); this.renderSim(); if (this.cb.onFrame) this.cb.onFrame(this.sim); } }

    loop(ts) {
      if (this.mode !== 'sim') return;
      const dtReal = Math.min(0.05, Math.max(0, (ts - this.last) / 1000));
      this.last = ts;
      if (this.running && this.sim) this.sim.advance(dtReal * this.speed, 30000);
      this.renderSim();
      if (this.cb.onFrame) this.cb.onFrame(this.sim, dtReal);
      this.raf = requestAnimationFrame((t) => this.loop(t));
    }

    renderSim(force) {
      const sim = this.sim;
      if (!sim) return;
      this.flows = sim.portFlows();
      this.doc.comps.forEach((c) => {
        const T = PS.types[c.type];
        if (!T || (!T.dyn && !force)) return;
        const g = this.compEls.get(c.id);
        if (!g) return;
        const s = T.draw(c, this.symCtx(c));
        if (s !== g._symStr) { g._sym.innerHTML = s; g._symStr = s; }
      });
      const P = sim.P;
      const pref = sim.maxSupply || 6;
      this.doc.wires.forEach((w) => {
        const g = this.wireEls.get(w.id);
        if (!g) return;
        const en = sim.ewireNet[w.id];
        if (en != null && sim.elec) { // elektrische Leitung: Potenzial und Stromfluss
          const pot = sim.elec.pot(en), cur = sim.elec.cur[en] ? 1 : 0, key = pot + ':' + cur;
          if (g._eq !== key) {
            g._eq = key;
            g._line.style.stroke = PS.ecol(pot, cur) || '';
            g._line.style.strokeWidth = cur ? '3.2' : '';
            g.classList.toggle('short', pot === 'S');
          }
          return;
        }
        const n = sim.wireNode[w.id];
        const pg = n == null ? 0 : P[n] - PS.P0;
        const q = Math.round(pg * 10);
        if (g._q !== q) {
          g._q = q;
          const col = PS.pcol(pg, pref);
          if (col) { g._line.style.stroke = col; g._line.classList.add('live'); g._line.style.strokeWidth = (2 + Math.min(1.4, pg / pref * 1.4)).toFixed(2); }
          else { g._line.style.stroke = ''; g._line.style.strokeWidth = ''; g._line.classList.remove('live'); }
        }
        // Strömung entlang der Leitung (Richtung a -> b)
        const fa = -(this.flows[w.a.c + ':' + w.a.p] || 0), fb = this.flows[w.b.c + ':' + w.b.p] || 0;
        const f = Math.abs(fa) > Math.abs(fb) ? fa : fb;
        const mag = Math.abs(f);
        const on = mag > 0.02 && pg > -0.5;
        if (on !== g._on) { g._on = on; g.classList.toggle('flowing', on); }
        if (on) {
          const dir = f >= 0 ? 'normal' : 'reverse';
          const dur = clamp(1.2 / (0.4 + Math.log10(1 + mag * 20)), 0.25, 2.5).toFixed(2) + 's';
          if (g._dir !== dir) { g._flow.style.animationDirection = dir; g._dir = dir; }
          if (g._dur !== dur) { g._flow.style.animationDuration = dur; g._dur = dur; }
          const col2 = PS.pcol(Math.max(pg, 0.5), pref);
          if (g._fc !== col2) { g._flow.style.stroke = col2 || ''; g._fc = col2; }
        }
      });
    }

    simDown(e, t) {
      const compEl = t.closest && t.closest('.comp');
      if (!compEl) return;
      const c = this.byId(compEl.dataset.cid);
      if (!c || !this.sim) return;
      const rt = this.sim.rt[c.id];
      if (!rt || !rt.man) return;
      const ops = PS.operables(c);
      if (!ops.length) return;
      const actEl = t.closest('[data-act]');
      const op = (actEl && ops.find((o) => o.side === actEl.dataset.act)) || ops[0];
      if (op.latch || e.shiftKey) rt.man[op.side] = !rt.man[op.side];
      else { rt.man[op.side] = true; this.simHeld = { cid: c.id, side: op.side }; this.svg.setPointerCapture(e.pointerId); }
      this.renderSim();
      if (this.cb.onSimInput) this.cb.onSimInput();
    }
    simUp() {
      const h = this.simHeld;
      if (h && this.sim) { const rt = this.sim.rt[h.cid]; if (rt) rt.man[h.side] = false; this.simHeld = null; if (this.cb.onSimInput) this.cb.onSimInput(); }
    }
    /* Bedienung von außen (z. B. Seitenleiste) */
    simSetMan(cid, side, val) {
      if (!this.sim) return;
      PS.setManual(this.sim, cid, side, val);
      this.renderSim();
      if (this.cb.onSimInput) this.cb.onSimInput();
    }
    simHover(e) {
      const t = e.target.closest ? e.target.closest('.wire') : null;
      if (!t || !this.sim) { if (this.cb.onTip) this.cb.onTip(null); return; }
      const n = this.sim.wireNode[t.dataset.wid];
      if (n == null) return;
      if (this.cb.onTip) this.cb.onTip(`${PS.fmt(this.sim.P[n] - PS.P0, 2)} bar`, e.clientX, e.clientY);
    }
  }

  PS.Editor = Editor;
})();
