/* PneuSim – Simulations-Engine
 *
 * Modell: Jedes durch Leitungen verbundene Netz ist ein Druckknoten (isotherme Kammer mit Volumen V).
 * Zwischen den Knoten liegen Strömungselemente (Blenden nach ISO 6358, Rückschlagventile, …).
 *   d(p·V)/dt = p0 · Q_normal      →   V·dp/dt = p0·Q − p·dV/dt
 * Zylinder sind Knoten mit veränderlichem Volumen; der Kolben folgt m·a = Σ F.
 * Zeitintegration: explizit, Schrittweite wird aus der Steifigkeit der Knoten geschätzt.
 */
(function () {
  const PS = globalThis.PS;
  const P0 = PS.P0;

  /* ---------- Durchflussfunktion (ISO 6358, mit linearisiertem Auslauf für p_unten/p_oben -> 1) ---------- */
  const B_CRIT = 0.3, PR_LIN = 0.96;
  const G_LIN = Math.sqrt(1 - Math.pow((PR_LIN - B_CRIT) / (1 - B_CRIT), 2));
  const KSENS = G_LIN / (1 - PR_LIN); // max. Steigung dQ/dp_unten je Einheit C
  function gfun(pr) {
    if (pr <= B_CRIT) return 1;
    if (pr >= PR_LIN) return pr >= 1 ? 0 : (G_LIN * (1 - pr)) / (1 - PR_LIN);
    const x = (pr - B_CRIT) / (1 - B_CRIT);
    return Math.sqrt(1 - x * x);
  }
  /* Normvolumenstrom (NL/s) von a nach b; C in l/(s·bar), Drücke absolut in bar */
  function orificeQ(pa, pb, C) {
    if (pa >= pb) return pa > 1e-6 ? C * pa * gfun(pb / pa) : 0;
    return pb > 1e-6 ? -C * pb * gfun(pa / pb) : 0;
  }
  PS.orificeQ = orificeQ;

  class Sim {
    constructor() {
      this.t = 0;
      this.nodes = [];
      this.els = [];
      this.hooks = [];
      this.chambers = [];
      this.rt = {};
      this.warnings = [];
      this.portNode = {};
      this.wireNode = {};
      this.eport = {};
      this.ewireNet = {};
      this.elec = null;
      this.maxSupply = 6;
      this.dtNext = 2e-4;
      this.addNode(1, true, () => P0); // Knoten 0 = Atmosphäre
    }
    addNode(v0, fixed, pfn) {
      this.nodes.push({ v0: Math.max(v0, 0.005), fixed: !!fixed, pfn: pfn || null });
      return this.nodes.length - 1;
    }
    addVol(n, v) { if (n > 0 && !this.nodes[n].fixed) this.nodes[n].v0 += v; }
    addEl(e) { e.q = 0; e.k = 0; this.els.push(e); return e; }
    finalize() {
      const n = this.nodes.length;
      this.nN = n;
      this.P = new Float64Array(n); this.V = new Float64Array(n); this.dV = new Float64Array(n);
      this.Q = new Float64Array(n); this.K = new Float64Array(n);
      this.fixedIdx = [];
      this.nodes.forEach((nd, i) => { this.P[i] = nd.fixed ? nd.pfn() : P0; if (nd.fixed) this.fixedIdx.push(i); });
    }
    step(dt) {
      const P = this.P, nN = this.nN, Q = this.Q, K = this.K, V = this.V, dV = this.dV, nodes = this.nodes;
      const hooks = this.hooks;
      for (let i = 0; i < hooks.length; i++) hooks[i](dt);
      for (let i = 0; i < this.fixedIdx.length; i++) { const j = this.fixedIdx[i]; P[j] = nodes[j].pfn(); }
      for (let i = 0; i < nN; i++) { V[i] = nodes[i].v0; dV[i] = 0; Q[i] = 0; K[i] = 0; }
      const ch = this.chambers;
      for (let i = 0; i < ch.length; i++) { V[ch[i].node] += ch[i].vol(); dV[ch[i].node] += ch[i].dv(); }
      const els = this.els;
      for (let i = 0; i < els.length; i++) {
        const e = els[i];
        const C = typeof e.C === 'function' ? e.C() : e.C;
        let q = 0;
        if (C > 1e-9) {
          const pa = P[e.a], pb = P[e.b];
          if (e.kind === 1) {
            const crack = typeof e.crack === 'function' ? e.crack() : e.crack;
            const d = pa - pb - crack;
            if (d > 0) q = orificeQ(pa, pb, C) * (d >= 0.08 ? 1 : d / 0.08);
          } else q = orificeQ(pa, pb, C);
          const k = KSENS * C;
          K[e.a] += k; K[e.b] += k;
        }
        e.q = q;
        Q[e.a] -= q; Q[e.b] += q;
      }
      let minTau = 1;
      for (let i = 0; i < nN; i++) {
        if (nodes[i].fixed) continue;
        let p = P[i] + ((P0 * Q[i] - P[i] * dV[i]) / V[i]) * dt;
        if (p < 0.05) p = 0.05; else if (p > 40) p = 40;
        P[i] = p;
        if (K[i] > 0) { const tau = V[i] / (P0 * K[i]); if (tau < minTau) minTau = tau; }
      }
      this.t += dt;
      this.dtNext = PS.clamp(0.4 * minTau, 2e-6, 5e-4);
    }
    /* Simulationszeit T (s) voranschreiten; liefert tatsächlich simulierte Zeit */
    advance(T, maxSteps) {
      let done = 0, steps = 0;
      maxSteps = maxSteps || 40000;
      while (done < T - 1e-12 && steps < maxSteps) {
        const dt = Math.min(this.dtNext, T - done);
        this.step(dt);
        done += dt; steps++;
      }
      return done;
    }
    /* Hinweise: statische beim Aufbau + laufende (z. B. Kurzschluss) */
    allWarnings() {
      const w = this.warnings.slice();
      if (this.elec && this.elec.shorted) w.push({ msg: 'Kurzschluss: +24 V und 0 V sind leitend verbunden.' });
      return w;
    }
    pg(cid, pid) { const n = this.portNode[cid + ':' + pid]; return n == null ? 0 : this.P[n] - P0; }
    /* Volumenstrom (NL/s) in das Bauteil hinein, je Anschluss */
    portFlows() {
      const m = {};
      for (const e of this.els) {
        if (e.pa) m[e.pa] = (m[e.pa] || 0) + e.q;
        if (e.pb) m[e.pb] = (m[e.pb] || 0) - e.q;
      }
      return m;
    }
  }
  PS.Sim = Sim;

  /* ---------- Elektrik: logischer Gleichstrom-Löser ----------
   * Netze sind durch Leitungen verbundene Anschlüsse. Geschlossene Kontakte verbinden Netze leitend,
   * Quellen legen +24 V bzw. 0 V an. Eine Last (Spule, Lampe) ist erregt, wenn ihre beiden Klemmen
   * an 24 V und 0 V liegen. Verbinden sich beide Potenziale direkt, liegt ein Kurzschluss vor.
   * Stromführend sind alle Netze, hinter denen (von der Schiene aus gesehen) eine erregte Last liegt. */
  class Elec {
    constructor() {
      this.n = 0; this.sw = []; this.loads = []; this.src = [];
      this.shorted = false;
    }
    addNet() { return this.n++; }
    finalize() {
      const n = this.n;
      this.par = new Int32Array(n); this.gpot = new Int8Array(n); this.cur = new Uint8Array(n);
      this.mark = new Uint8Array(n); this.need = new Uint8Array(n); this.pnt = new Int32Array(n); this.queue = new Int32Array(n);
      this.adj = Array.from({ length: n }, () => []);
    }
    find(i) { const p = this.par; while (p[i] !== i) { p[i] = p[p[i]]; i = p[i]; } return i; }
    /* Potenzial eines Netzes: 24, 0, null (potenzialfrei) oder 'S' (Kurzschluss) */
    pot(i) { const g = this.gpot[i]; return g === 1 ? 24 : g === 2 ? 0 : g === 3 ? 'S' : null; }
    solve() {
      const n = this.n;
      if (!n) return;
      const p = this.par, adj = this.adj;
      for (let i = 0; i < n; i++) { p[i] = i; adj[i].length = 0; }
      for (const s of this.sw) {
        if (!s.f()) continue;
        adj[s.a].push(s.b); adj[s.b].push(s.a);
        const a = this.find(s.a), b = this.find(s.b);
        if (a !== b) p[a] = b;
      }
      const h = this.mark; h.fill(0);
      for (const s of this.src) h[this.find(s.net)] |= s.pot === 24 ? 1 : 2;
      let shorted = false;
      for (let i = 0; i < n; i++) { const m = h[this.find(i)]; this.gpot[i] = m; if (m === 3) shorted = true; }
      this.shorted = shorted;
      const need = this.need; need.fill(0);
      for (const l of this.loads) {
        const pa = this.gpot[l.a], pb = this.gpot[l.b];
        const on = (pa === 1 && pb === 2) || (pa === 2 && pb === 1);
        l.rt.on = on;
        if (on) { need[l.a] = 1; need[l.b] = 1; }
      }
      /* Stromfluss: Baum von den Schienen aus; Netze mit erregter Last dahinter führen Strom */
      this.cur.fill(0);
      for (const pot of [24, 0]) {
        const seen = this.pnt, q = this.queue;
        seen.fill(-2);
        let head = 0, tail = 0;
        for (const s of this.src) if (s.pot === pot && seen[s.net] === -2) { seen[s.net] = -1; q[tail++] = s.net; }
        while (head < tail) {
          const u = q[head++];
          for (const v of adj[u]) if (seen[v] === -2) { seen[v] = u; q[tail++] = v; }
        }
        for (let k = tail - 1; k >= 0; k--) {
          const u = q[k];
          if (need[u]) { this.cur[u] = 1; if (seen[u] >= 0) need[seen[u]] = 1; }
        }
      }
    }
  }
  PS.Elec = Elec;

  /* ---------- Schaltplan -> Simulation ---------- */
  PS.compile = function (doc) {
    const sim = new Sim();
    const comps = doc.comps || [], wires = doc.wires || [];
    const byId = {};
    comps.forEach((c) => (byId[c.id] = c));

    /* Zwei getrennte Netzwerke: pneumatisch (Standard) und elektrisch (Anschlüsse mit dom:'e') */
    const mkUF = () => {
      const parent = new Map();
      const find = (k) => {
        let r = k;
        while (parent.get(r) !== r) r = parent.get(r);
        while (parent.get(k) !== r) { const nx = parent.get(k); parent.set(k, r); k = nx; }
        return r;
      };
      const union = (a, b) => {
        if (!parent.has(a) || !parent.has(b)) return;
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent.set(ra, rb);
      };
      return { parent, find, union };
    };
    const UFP = mkUF(), UFE = mkUF();
    const portDefs = {};
    for (const c of comps) {
      const T = PS.types[c.type];
      if (!T) continue;
      for (const p of T.ports(c)) {
        const k = c.id + ':' + p.id;
        (p.dom === 'e' ? UFE : UFP).parent.set(k, k);
        portDefs[k] = { c, p };
      }
    }
    const ufOf = (k) => (portDefs[k] && portDefs[k].p.dom === 'e' ? UFE : UFP);
    const connected = new Set();
    const wk = (e) => e.c + ':' + e.p;
    for (const w of wires) {
      const ka = wk(w.a), kb = wk(w.b);
      if (portDefs[ka] && portDefs[kb] && ufOf(ka) === ufOf(kb)) { ufOf(ka).union(ka, kb); connected.add(ka); connected.add(kb); }
    }
    for (const c of comps) {
      const T = PS.types[c.type];
      if (T && T.merge) for (const [a, b] of T.merge(c)) { const ka = c.id + ':' + a; ufOf(ka).union(ka, c.id + ':' + b); }
    }
    const find = UFP.find, parent = UFP.parent;
    const nets = new Map();
    const netOf = (k) => {
      const r = find(k);
      let n = nets.get(r);
      if (!n) { n = { keys: [], vol: 0, src: [], atm: false, idx: -1 }; nets.set(r, n); }
      return n;
    };
    for (const k of parent.keys()) netOf(k).keys.push(k);
    let maxSupply = 0;
    for (const c of comps) {
      const T = PS.types[c.type];
      if (!T || !T.boundary) continue;
      for (const b of T.boundary(c)) {
        const n = netOf(c.id + ':' + b.port);
        if (b.kind === 'src') { n.src.push(b.p); maxSupply = Math.max(maxSupply, b.p()); } else n.atm = true;
      }
    }
    sim.maxSupply = maxSupply || 6;
    for (const n of nets.values()) n.vol = 0.02 + 0.003 * n.keys.length;
    for (const w of wires) {
      if (!parent.has(wk(w.a)) || !parent.has(wk(w.b))) continue;
      const len = w.len != null ? w.len : 60;
      netOf(wk(w.a)).vol += 0.00004 * len;
    }
    for (const n of nets.values()) {
      if (n.src.length) {
        const fs = n.src;
        n.idx = sim.addNode(1, true, () => Math.max(...fs.map((f) => f())) + P0);
        if (n.atm) sim.warnings.push({ msg: 'Druckluftquelle ist direkt mit einer Entlüftung verbunden (Kurzschluss).' });
      } else if (n.atm) n.idx = 0;
      else n.idx = sim.addNode(n.vol);
    }
    for (const k of parent.keys()) {
      const { p } = portDefs[k];
      const n = netOf(k);
      let idx = n.idx;
      if (p.kind === 'exh' && n.keys.length === 1 && !connected.has(k)) idx = 0; // unbeschalteter Abluftanschluss entlüftet frei
      sim.portNode[k] = idx;
    }
    for (const w of wires) if (parent.has(wk(w.a)) && parent.has(wk(w.b))) sim.wireNode[w.id] = sim.portNode[wk(w.a)];

    /* Elektrische Netze */
    const elec = (sim.elec = new Elec());
    const enet = new Map();
    for (const k of UFE.parent.keys()) {
      const r = UFE.find(k);
      if (!enet.has(r)) enet.set(r, elec.addNet());
      sim.eport[k] = enet.get(r);
    }
    for (const w of wires) if (sim.eport[wk(w.a)] != null && ufOf(wk(w.a)) === UFE && ufOf(wk(w.b)) === UFE) sim.ewireNet[w.id] = sim.eport[wk(w.a)];

    for (const c of comps) {
      const T = PS.types[c.type];
      if (!T) continue;
      const rt = (sim.rt[c.id] = {});
      const B = {
        sim, c, p: c.p, rt,
        key: (pid) => c.id + ':' + pid,
        port: (pid) => sim.portNode[c.id + ':' + pid],
        addNode: (v0) => sim.addNode(v0),
        orifice: (a, b, C, pa, pb) => sim.addEl({ kind: 0, a, b, C, pa, pb }),
        check: (a, b, C, crack, pa, pb) => sim.addEl({ kind: 1, a, b, C, crack: crack || 0, pa, pb }),
        hook: (fn) => sim.hooks.push(fn),
        chamber: (node, vol, dv) => sim.chambers.push({ node, vol, dv }),
        hasComp: (id) => !!byId[id],
        comp: (id) => byId[id] || null,
        warnIf: (cond, msg) => { if (cond) sim.warnings.push({ cid: c.id, msg: `${c.label || T.name} ${msg}` }); },
        /* Elektrik */
        enet: (pid) => sim.eport[c.id + ':' + pid],
        eNew: () => elec.addNet(),
        eSwitch: (a, b, f) => elec.sw.push({ a, b, f }),
        eLink: (a, b) => elec.sw.push({ a, b, f: () => true }),
        eLoad: (a, b) => elec.loads.push({ a, b, rt }),
        eSource: (net, pot) => elec.src.push({ net, pot }),
      };
      if (T.build) T.build(c, B);
    }
    sim.finalize();
    elec.finalize();
    if (elec.n) { elec.solve(); sim.hooks.push(() => elec.solve()); }
    return sim;
  };

  /* Bedienung: manuelle Betätigung setzen (Taster, Hebel, Magnet) */
  PS.setManual = function (sim, cid, side, val) {
    const rt = sim && sim.rt[cid];
    if (rt && rt.man) rt.man[side] = !!val;
  };
})();
