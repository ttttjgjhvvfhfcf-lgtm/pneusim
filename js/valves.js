/* PneuSim – Wegeventile: Geometrie, ISO-1219-Symbole, Schaltlogik */
(function () {
  const PS = globalThis.PS;
  const P0 = PS.P0;

  /* Betätigungsarten */
  PS.ACT = {
    none: { name: '— keine —' },
    spring: { name: 'Rückstellfeder' },
    push: { name: 'Drucktaste (Taster)', manual: true, hold: true },
    manual: { name: 'Handbetätigung (allgemein)', manual: true, hold: true },
    lever: { name: 'Handhebel mit Rastung', manual: true, latch: true },
    pedal: { name: 'Fußpedal', manual: true, hold: true },
    roller: { name: 'Rolle (Endlagengeber)', sensor: true },
    rollerIdle: { name: 'Rollenhebel Leerrücklauf', sensor: true, oneway: true },
    solenoid: { name: 'Elektromagnet (Spule Y)', manual: true, latch: true, coil: true },
    pilot: { name: 'Pneumatisch (Steuerdruck)', pilot: true },
  };

  /* Anschlusslage relativ zum Ruhe-Feld (links oben = 0,0) */
  const TBL = {
    '2/2': { bw: 40, top: { 2: 20 }, bot: { 1: 20 } },
    '3/2': { bw: 40, top: { 2: 10 }, bot: { 1: 10, 3: 30 } },
    '4/2': { bw: 40, top: { 4: 10, 2: 30 }, bot: { 1: 10, 3: 30 } },
    '5/2': { bw: 60, top: { 4: 20, 2: 40 }, bot: { 5: 10, 1: 30, 3: 50 } },
    '5/3': { bw: 60, top: { 4: 20, 2: 40 }, bot: { 5: 10, 1: 30, 3: 50 } },
  };
  const PKIND = { 1: 'in', 2: 'out', 4: 'out', 3: 'exh', 5: 'exh' };

  function squaresOf(p, n, restIdx) {
    const kind = p.kind;
    if (kind === '2/2' || kind === '3/2') {
      const flow = [['1', '2']];
      const closed = kind === '3/2' ? [['2', '3']] : [];
      const sq = [];
      sq[restIdx] = p.nc ? closed : flow;
      sq[1 - restIdx] = p.nc ? flow : closed;
      return sq;
    }
    if (kind === '4/2') return [[['1', '4'], ['2', '3']], [['1', '2'], ['4', '3']]];
    if (kind === '5/2') return [[['1', '4'], ['2', '3']], [['1', '2'], ['4', '5']]];
    const center = { closed: [], exhaust: [['2', '3'], ['4', '5']], pressure: [['1', '2'], ['1', '4']] }[p.center || 'closed'];
    return [[['1', '4'], ['2', '3']], center, [['1', '2'], ['4', '5']]];
  }

  PS.valveSpec = function (p, extra) {
    extra = extra || {};
    const kind = TBL[p.kind] ? p.kind : '3/2';
    const T = TBL[kind];
    const n = kind === '5/3' ? 3 : 2;
    const bw = T.bw;
    const springSide = n === 3 ? null : p.left === 'spring' ? 'L' : p.right === 'spring' ? 'R' : null;
    /* Ventil mit nur einer Betätigung (z. B. Hebel, Taster): geht in die Gegenstellung zurück, sobald die Betätigung endet */
    const noAct = (k) => !k || k === 'none';
    let restSide = springSide;
    if (!restSide && n === 2) {
      if (!noAct(p.left) && noAct(p.right)) restSide = 'R';
      else if (!noAct(p.right) && noAct(p.left)) restSide = 'L';
    }
    const restIdx = n === 3 ? 1 : restSide === 'L' ? 0 : 1;
    const initIdx = p.init === 'L' ? 0 : p.init === 'R' ? n - 1 : restIdx;
    const squares = squaresOf(Object.assign({}, p, { kind }), n, restIdx);
    const centered = n === 3;

    const actSlot = (k, side) => {
      if (!k || k === 'none') return 0;
      if (k === 'pilot') return extra.pilotW || 30;
      return 30;
    };
    const lw = (centered ? 20 : 0) + actSlot(p.left);
    const rw = (centered ? 20 : 0) + actSlot(p.right);
    const leftEdge = -restIdx * bw;
    const rightEdge = (n - restIdx) * bw;

    const ports = [];
    const port = {};
    const main = [];
    const add = (id, x, y, dir, kd, label) => {
      const o = { id, x, y, dir, kind: kd, label: label || id };
      ports.push(o); port[id] = o;
    };
    Object.keys(T.top).forEach((id) => { add(id, T.top[id], 0, 'up', PKIND[id]); main.push(id); });
    Object.keys(T.bot).forEach((id) => { add(id, T.bot[id], 40, 'down', PKIND[id]); main.push(id); });

    const ctrlLabel = (side) => {
      if (kind === '4/2' || kind === '5/2' || kind === '5/3') return side === 'L' ? '14' : '12';
      const sq = squares[side === 'L' ? 0 : n - 1];
      return sq.some((pr) => pr[0] === '1' && pr[1] === '2') ? '12' : '10';
    };
    const ctrl = {};
    if (p.left === 'pilot') { add('pL', leftEdge - lw, 20, 'left', 'ctrl', ctrlLabel('L')); ctrl.L = port.pL; }
    if (p.right === 'pilot') { add('pR', rightEdge + rw, 20, 'right', 'ctrl', ctrlLabel('R')); ctrl.R = port.pR; }

    return {
      kind, n, bw, restIdx, initIdx, springSide, restSide, squares, centered,
      ports, port, main, ctrl, leftEdge, rightEdge, lw, rw,
      pilotW: extra.pilotW || 30,
      bbox: { x0: leftEdge - lw - 6, y0: -8, x1: rightEdge + rw + 6, y1: 58 },
    };
  };

  /* ---------- Betätigungssymbole (Rahmen: Ventilkante bei x=0, nach außen +x) ---------- */
  function actuatorSvg(kind, on, spec, col) {
    const cl = on ? 'k act-on' : 'k';
    const cp = on ? 'kp act-on' : 'kp';
    switch (kind) {
      case 'spring':
        return PS.svg.spring(0, 30, 20, 4, 6);
      case 'push':
        return `<path class="${cl}" d="M0,20 H12 M12,9 V31"/><path class="${cl}" d="M12,9 H20 M12,31 H20"/>`;
      case 'manual':
        return `<path class="${cl}" d="M0,20 H8"/><path class="${cp}" d="M8,12 H22 V28 H8 Z"/>`;
      case 'lever':
        return `<path class="${cl}" d="M0,20 H9 M9,20 L22,8"/><path class="${cl}" d="M2,14 L5,20 L8,14"/>`;
      case 'pedal':
        return `<path class="${cl}" d="M0,20 H8 M8,20 V32 H22"/>`;
      case 'roller':
        return `<path class="${cl}" d="M0,20 H8"/><circle class="${cp}" cx="14" cy="20" r="6"/><circle class="kf" cx="14" cy="20" r="1.4"/>`;
      case 'rollerIdle':
        return (
          `<path class="${cl}" d="M0,20 H8"/><circle class="${cp}" cx="14" cy="20" r="6"/><circle class="kf" cx="14" cy="20" r="1.4"/>` +
          `<path class="k thin" d="M7,8 H21 M18,5.5 L21,8 L18,10.5"/>`
        );
      case 'solenoid':
        return `<path class="${cl}" d="M0,20 H6"/><path class="${cp}" d="M6,12 H22 V28 H6 Z"/><path class="${cl}" d="M6,28 L22,12"/>`;
      case 'pilot':
        return (
          `<path class="${cp}" d="M0,20 L9,14 V26 Z"/>` +
          `<path class="k dash" d="M9,20 H${spec.pilotW}" ${col ? `style="stroke:${col}"` : ''}/>`
        );
      default: return '';
    }
  }

  const POSTXT = (pos) => (pos <= 0.02 ? 'hinten' : pos >= 0.98 ? 'vorn' : Math.round(pos * 100) + '%');

  PS.drawValve = function (c, ctx, spec) {
    const p = c.p;
    spec = spec || PS.valveSpec(p);
    const rt = ctx.rt, simOn = !!(ctx.sim && rt);
    const { bw, n } = spec;
    const sPos = simOn ? rt.s : spec.initIdx;
    const cur = Math.round(sPos);
    const pp = (id) => (simOn ? ctx.pp(id) : 0);
    let s = '';

    for (let j = 0; j < n; j++) {
      const x0 = (j - spec.restIdx) * bw;
      s += `<rect class="pap vsq${simOn && j === cur ? ' on' : ''}" x="${x0}" y="0" width="${bw}" height="40"/>`;
    }
    for (let j = 0; j < n; j++) {
      const x0 = (j - spec.restIdx) * bw;
      const used = new Set();
      const live = simOn && j === cur;
      spec.squares[j].forEach(([a, b]) => {
        used.add(a); used.add(b);
        const A = spec.port[a], Bp = spec.port[b];
        const col = live ? PS.pcol(Math.max(pp(a), pp(b))) : null;
        s += PS.svg.arrow(A.x + x0, A.y, Bp.x + x0, Bp.y, col);
      });
      spec.main.forEach((id) => {
        if (used.has(id)) return;
        const A = spec.port[id], x = A.x + x0;
        const col = live ? PS.pcol(pp(id)) : null;
        const st = col ? ` style="stroke:${col}"` : '';
        s += A.y === 0
          ? `<path class="k" d="M${x},0 V7 M${x - 5},7 H${x + 5}"${st}/>`
          : `<path class="k" d="M${x},40 V33 M${x - 5},33 H${x + 5}"${st}/>`;
      });
    }

    /* Betätigungen */
    const side = (sd) => {
      const kind = sd === 'L' ? p.left : p.right;
      const edge = sd === 'L' ? spec.leftEdge : spec.rightEdge;
      const mir = sd === 'L' ? ` scale(-1,1)` : '';
      let g = '', off = 0;
      if (spec.centered) { g += PS.svg.spring(0, 20, 20, 3, 6); off = 20; }
      if (kind && kind !== 'none') {
        const on = simOn && rt.act[sd];
        const col = kind === 'pilot' && simOn ? PS.pcol(pp(sd === 'L' ? 'pL' : 'pR')) : null;
        const def = PS.ACT[kind] || {};
        g += `<g transform="translate(${off},0)" class="act${def.manual ? ' act-man' : ''}" data-act="${sd}">` +
          `<rect class="hit" x="0" y="6" width="${kind === 'pilot' ? 30 : 30}" height="28"/>` +
          actuatorSvg(kind, on, spec, col) + '</g>';
      }
      s += `<g transform="translate(${edge},0)${mir}">${g}</g>`;
      const bd = sd === 'L' ? p.bindL : p.bindR;
      const adef = PS.ACT[kind], rl = ctx.refLabel || ctx.cylLabel;
      if (adef && bd && rl) {
        let txt = null;
        if (adef.sensor) { const lab = rl(bd.cyl); txt = lab ? `${lab} ${POSTXT(bd.pos)}` : '⚠ ohne Zylinder'; }
        else if (adef.coil && bd.coil) { txt = rl(bd.coil) || '⚠ ohne Spule'; }
        if (txt) s += PS.txt(ctx, sd === 'L' ? edge - 4 : edge + 4, 54, txt, sd === 'L' ? 'end' : 'start', 'lbl sens');
      }
    };
    side('L'); side('R');

    /* Anschlüsse: Entlüftung ohne Leitung, Beschriftung */
    spec.ports.forEach((pt) => {
      if (pt.kind === 'exh' && !(ctx.conn && ctx.conn(pt.id))) {
        const fl = simOn ? ctx.flow(pt.id) : 0;
        s += `<path class="k" d="M${pt.x},40 V45"/><path class="${Math.abs(fl) > 0.05 ? 'kp exh-on' : 'kp'}" d="M${pt.x - 4},45 H${pt.x + 4} L${pt.x},52 Z"/>`;
      }
      if (pt.kind !== 'ctrl' || true) s += PS.portLabel(ctx, pt, pt.label);
    });
    return s;
  };

  PS.buildValveCore = function (B, spec, o) {
    const sim = B.sim, rt = B.rt;
    const n = spec.n;
    rt.s = rt.target = spec.initIdx;
    rt.man = { L: false, R: false };
    rt.act = { L: false, R: false };
    rt.pst = { L: false, R: false };
    rt.hold = { L: 0, R: 0 };
    const w = (j) => {
      const s = rt.s;
      if (n === 2) return j === 0 ? 1 - s : s;
      if (j === 0) return Math.max(0, 1 - s);
      if (j === 2) return Math.max(0, s - 1);
      return Math.max(0, 1 - Math.abs(s - 1));
    };
    spec.squares.forEach((paths, j) => {
      paths.forEach(([a, b]) => {
        B.orifice(o.nodes[a], o.nodes[b], () => o.cv() * w(j), B.key(a), B.key(b));
      });
    });
    const SLEW = 1 / 0.015;
    const TOL = 0.03;
    B.hook((dt) => {
      for (const sd of ['L', 'R']) {
        const kind = sd === 'L' ? o.left : o.right;
        const def = PS.ACT[kind] || {};
        let on = false;
        if (def.manual) {
          on = rt.man[sd]; // Handbetätigung bzw. Handhilfsbetätigung
          if (def.coil) { const bd = o.bind[sd], cl = bd && sim.rt[bd.coil]; if (cl && cl.on) on = true; }
        } else if (def.sensor) {
          const bd = o.bind[sd];
          const cyl = bd && sim.rt[bd.cyl];
          let hit = false;
          if (cyl && cyl.L) {
            const frac = cyl.x / cyl.L;
            hit = Math.abs(frac - bd.pos) <= TOL;
            if (hit && def.oneway) {
              const dir = bd.dir || (bd.pos >= 0.5 ? 1 : -1);
              hit = cyl.v * dir > 1e-3;
            }
          }
          if (hit) rt.hold[sd] = 0.03; else if (rt.hold[sd] > 0) rt.hold[sd] -= dt;
          on = rt.hold[sd] > 0;
        } else if (def.pilot) {
          const nd = o.pilot[sd];
          if (nd >= 0) {
            const pg = sim.P[nd] - P0, th = o.pilotP();
            if (pg >= th) rt.pst[sd] = true; else if (pg <= 0.5 * th) rt.pst[sd] = false;
            on = rt.pst[sd];
          }
        }
        rt.act[sd] = on;
      }
      const L = rt.act.L, R = rt.act.R;
      let tgt = rt.target;
      if (n === 3) {
        tgt = L && !R ? 0 : R && !L ? 2 : !L && !R ? 1 : tgt;
      } else if (L && !R) tgt = 0;
      else if (R && !L) tgt = 1;
      else if (!L && !R && spec.restSide) tgt = spec.restSide === 'L' ? 0 : 1;
      rt.target = tgt;
      const d = tgt - rt.s, m = SLEW * dt;
      rt.s = Math.abs(d) <= m ? tgt : rt.s + Math.sign(d) * m;
    });
  };

  const actOpts = Object.keys(PS.ACT).map((k) => [k, PS.ACT[k].name]);
  const isSensor = (k) => !!(PS.ACT[k] && PS.ACT[k].sensor);
  const isCoil = (k) => !!(PS.ACT[k] && PS.ACT[k].coil);

  PS.defType({
    id: 'valve', name: 'Wegeventil', prefix: 'V', dyn: true,
    defaults: () => ({ kind: '3/2', nc: true, center: 'closed', left: 'push', right: 'spring', qn: 150, pilotP: 1.5, bindL: null, bindR: null, init: 'auto' }),
    params: [
      { k: 'kind', label: 'Ventiltyp', type: 'sel', opts: [['2/2', '2/2-Wegeventil'], ['3/2', '3/2-Wegeventil'], ['4/2', '4/2-Wegeventil'], ['5/2', '5/2-Wegeventil'], ['5/3', '5/3-Wegeventil']] },
      { k: 'nc', label: 'Ruhestellung gesperrt (NC)', type: 'bool', when: (p) => p.kind === '2/2' || p.kind === '3/2' },
      { k: 'center', label: 'Mittelstellung', type: 'sel', when: (p) => p.kind === '5/3', opts: [['closed', 'gesperrt'], ['exhaust', 'entlüftet'], ['pressure', 'belüftet']] },
      { k: 'left', label: 'Betätigung links', type: 'sel', opts: actOpts },
      { k: 'bindL', label: 'Zuordnung links', type: 'bind', when: (p) => isSensor(p.left) || isCoil(p.left) },
      { k: 'right', label: 'Betätigung rechts', type: 'sel', opts: actOpts },
      { k: 'bindR', label: 'Zuordnung rechts', type: 'bind', when: (p) => isSensor(p.right) || isCoil(p.right) },
      { k: 'init', label: 'Startstellung (ohne Feder)', type: 'sel', when: (p) => p.kind !== '5/3' && p.left !== 'spring' && p.right !== 'spring', opts: [['auto', 'rechtes Feld'], ['L', 'linkes Feld']] },
      { k: 'pilotP', label: 'Ansprechdruck Steuerung', type: 'num', min: 0.3, max: 8, step: 0.1, unit: 'bar', when: (p) => p.left === 'pilot' || p.right === 'pilot' },
      { k: 'qn', label: 'Nenndurchfluss', type: 'num', min: 20, max: 1200, step: 10, unit: 'l/min' },
    ],
    ports: (c) => PS.valveSpec(c.p).ports,
    bbox: (c) => PS.valveSpec(c.p).bbox,
    draw: (c, ctx) => PS.drawValve(c, ctx),
    /* bedienbare Betätigungen (Simulation) */
    operables(c) {
      const out = [];
      ['L', 'R'].forEach((sd) => {
        const kind = sd === 'L' ? c.p.left : c.p.right, def = PS.ACT[kind];
        if (def && def.manual) out.push({ side: sd, latch: !!def.latch, name: def.coil ? 'Handhilfsbetätigung Magnet' : def.name });
      });
      return out;
    },
    build(c, B) {
      const spec = PS.valveSpec(c.p);
      const nodes = {};
      spec.main.forEach((id) => (nodes[id] = B.port(id)));
      const pilot = { L: -1, R: -1 };
      if (spec.ctrl.L) pilot.L = B.port('pL');
      if (spec.ctrl.R) pilot.R = B.port('pR');
      PS.buildValveCore(B, spec, {
        nodes, pilot, left: c.p.left, right: c.p.right,
        bind: { L: c.p.bindL, R: c.p.bindR },
        cv: () => (c.p.qn || 150) / 252,
        pilotP: () => c.p.pilotP || 1.5,
      });
      B.warnIf(
        (isSensor(c.p.left) && !(c.p.bindL && B.hasComp(c.p.bindL.cyl))) ||
        (isSensor(c.p.right) && !(c.p.bindR && B.hasComp(c.p.bindR.cyl))),
        'hat eine Rolle ohne zugeordneten Zylinder'
      );
    },
  });

  /* Bedienbare Elemente eines Bauteils (Taster, Hebel, Schalter …) */
  PS.operables = (c) => { const T = PS.types[c.type]; return T && T.operables ? T.operables(c) : []; };

  /* Vorlagen für die Palette */
  PS.valvePresets = [
    { name: '2/2 Handhebel (Absperrventil)', p: { kind: '2/2', nc: true, left: 'lever', right: 'spring' } },
    { name: '3/2 Taster, Ruhe gesperrt (NC)', p: { kind: '3/2', nc: true, left: 'push', right: 'spring' } },
    { name: '3/2 Taster, Ruhe offen (NO)', p: { kind: '3/2', nc: false, left: 'push', right: 'spring' } },
    { name: '3/2 Handhebel rastend', p: { kind: '3/2', nc: true, left: 'lever', right: 'spring' } },
    { name: '3/2 Rolle (Endlagengeber)', p: { kind: '3/2', nc: true, left: 'roller', right: 'spring' } },
    { name: '3/2 Rollenhebel Leerrücklauf', p: { kind: '3/2', nc: true, left: 'rollerIdle', right: 'spring' } },
    { name: '3/2 Magnetventil', p: { kind: '3/2', nc: true, left: 'solenoid', right: 'spring' } },
    { name: '3/2 pneumatisch betätigt', p: { kind: '3/2', nc: true, left: 'pilot', right: 'spring' } },
    { name: 'Druckfolgeventil 3/2', p: { kind: '3/2', nc: true, left: 'pilot', right: 'spring', pilotP: 4 } },
    { name: '4/2 Handhebel', p: { kind: '4/2', left: 'lever', right: 'none' } },
    { name: '5/2 Handhebel rastend', p: { kind: '5/2', left: 'lever', right: 'none', init: 'auto' } },
    { name: '5/2 Taster, Federrückstellung', p: { kind: '5/2', left: 'push', right: 'spring' } },
    { name: '5/2 pneumatisch, Federrückstellung', p: { kind: '5/2', left: 'pilot', right: 'spring' } },
    { name: '5/2 Magnet, Federrückstellung', p: { kind: '5/2', left: 'solenoid', right: 'spring' } },
    { name: '5/2 Impulsventil (pneumatisch)', p: { kind: '5/2', left: 'pilot', right: 'pilot', init: 'auto' } },
    { name: '5/2 Impulsventil (Magnet)', p: { kind: '5/2', left: 'solenoid', right: 'solenoid' } },
    { name: '5/3 Mitte gesperrt (Hand)', p: { kind: '5/3', center: 'closed', left: 'lever', right: 'lever' } },
    { name: '5/3 Mitte entlüftet (Magnet)', p: { kind: '5/3', center: 'exhaust', left: 'solenoid', right: 'solenoid' } },
    { name: '5/3 Mitte belüftet (Magnet)', p: { kind: '5/3', center: 'pressure', left: 'solenoid', right: 'solenoid' } },
  ];
})();
