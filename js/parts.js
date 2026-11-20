/* PneuSim – Bauteile (außer Wegeventile): Symbole, Anschlüsse, Verhalten */
(function () {
  const PS = globalThis.PS;
  const P0 = PS.P0;
  const clamp = PS.clamp;
  const pst = (col) => (col ? ` style="stroke:${col}"` : '');
  const fst = (col) => (col ? ` style="fill:${col}"` : '');
  const num = (k, label, min, max, step, unit, extra) => Object.assign({ k, label, type: 'num', min, max, step, unit }, extra || {});

  /* ======================= Energieversorgung ======================= */
  PS.defType({
    id: 'src', name: 'Druckluftquelle', prefix: 'Q', dyn: true,
    defaults: () => ({ pressure: 6 }),
    params: [num('pressure', 'Betriebsdruck', 1, 12, 0.5, 'bar')],
    ports: () => [{ id: '1', x: 0, y: 0, dir: 'up', kind: 'in' }],
    bbox: () => ({ x0: -20, y0: -4, x1: 20, y1: 54 }),
    boundary: (c) => [{ port: '1', kind: 'src', p: () => c.p.pressure }],
    draw(c, ctx) {
      const col = ctx.sim ? PS.pcol(ctx.pp('1'), c.p.pressure) : null;
      return (
        `<path class="k" d="M0,0 V10"${pst(col)}/>` +
        `<circle class="pap" cx="0" cy="24" r="14"/>` +
        `<path class="kp" d="M0,15 L7,32 H-7 Z"${fst(col)}/>` +
        PS.txt(ctx, 0, 50, PS.fmt(c.p.pressure, 1) + ' bar', 'middle', 'lbl val')
      );
    },
    build() {},
  });

  PS.defType({
    id: 'wu', name: 'Wartungseinheit', prefix: 'WE', dyn: true,
    defaults: () => ({ pset: 6 }),
    params: [num('pset', 'Einstelldruck', 0.5, 10, 0.1, 'bar')],
    ports: () => [
      { id: 'out', x: 0, y: 0, dir: 'up', kind: 'out' },
      { id: 'in', x: 0, y: 80, dir: 'down', kind: 'in' },
    ],
    bbox: () => ({ x0: -28, y0: -2, x1: 60, y1: 82 }),
    draw(c, ctx) {
      const pi = ctx.sim ? PS.pcol(ctx.pp('in')) : null, po = ctx.sim ? PS.pcol(ctx.pp('out')) : null;
      return (
        `<rect class="k dd thin" x="-26" y="8" width="52" height="64" rx="2"/>` +
        `<path class="k" d="M0,0 V16"${pst(po)}/>` +
        `<path class="pap" d="M-10,16 H10 V38 H-10 Z"/>` +
        `<path class="k" d="M-4,35 V21 M-7.5,25 L-4,20.5 L-0.5,25"/>` +
        `<path class="k" d="M0,38 V48"${pst(po)}/>` +
        `<path class="pap" d="M0,48 L10,58 L0,68 L-10,58 Z"/>` +
        `<path class="k dash thin" d="M-5,58 H5"/>` +
        `<path class="k" d="M0,68 V80"${pst(pi)}/>` +
        PS.svg.spring(10, 22, 27, 2, 4) + `<path class="k thin" d="M13,36 L21,18"/><polygon class="kf" points="21,18 15.6,20.6 19.8,23"/>` +
        PS.txt(ctx, 32, 30, ctx.sim ? PS.fmt(ctx.pp('out'), 1) + ' bar' : PS.fmt(c.p.pset, 1) + ' bar', 'start', 'lbl val') +
        PS.txt(ctx, 32, 44, 'Wartungseinheit', 'start', 'lbl muted')
      );
    },
    build(c, B) {
      const nin = B.port('in'), nout = B.port('out');
      B.check(nin, nout, () => 3.0 * clamp((c.p.pset - (B.sim.P[nout] - P0)) / 0.3, 0, 1), 0, B.key('in'), B.key('out'));
    },
  });

  PS.defType({
    id: 'junction', name: 'Verzweigung', prefix: '', dyn: true, noLabel: true,
    defaults: () => ({}), params: [],
    ports: () => [{ id: '1', x: 0, y: 0, dir: 'any', kind: 'any' }],
    bbox: () => ({ x0: -5, y0: -5, x1: 5, y1: 5 }),
    draw(c, ctx) {
      const col = ctx.sim ? PS.pcol(ctx.pp('1')) : null;
      return `<circle class="junction" r="3.6"${col ? ` style="fill:${col};stroke:${col}"` : ''}/>`;
    },
    build() {},
  });

  PS.defType({
    id: 'exh', name: 'Entlüftung', prefix: 'E', dyn: true,
    defaults: () => ({ muffler: false }),
    params: [{ k: 'muffler', label: 'mit Schalldämpfer', type: 'bool' }],
    ports: () => [{ id: '1', x: 0, y: 0, dir: 'up', kind: 'any' }],
    bbox: () => ({ x0: -9, y0: -2, x1: 9, y1: 26 }),
    boundary: (c) => (c.p.muffler ? [] : [{ port: '1', kind: 'atm' }]),
    draw(c, ctx) {
      const fl = ctx.sim ? Math.abs(ctx.flow('1')) : 0;
      return (
        `<path class="k" d="M0,0 V9"/>` +
        `<path class="${fl > 0.05 ? 'kp exh-on' : 'kp'}" d="M-6,9 H6 L0,18 Z"/>` +
        (c.p.muffler ? `<path class="k thin" d="M-8,22 H8 M-6,25 H6"/>` : '')
      );
    },
    build(c, B) {
      if (c.p.muffler) B.orifice(B.port('1'), 0, 1.0, B.key('1'));
    },
  });

  PS.defType({
    id: 'tank', name: 'Druckluftbehälter', prefix: 'B', dyn: true,
    defaults: () => ({ vol: 2 }),
    params: [num('vol', 'Volumen', 0.1, 50, 0.1, 'l')],
    ports: () => [
      { id: 'a', x: 20, y: 0, dir: 'up', kind: 'any' },
      { id: 'b', x: 60, y: 0, dir: 'up', kind: 'any' },
    ],
    bbox: () => ({ x0: -2, y0: -2, x1: 82, y1: 40 }),
    merge: () => [['a', 'b']],
    draw(c, ctx) {
      const pg = ctx.sim ? ctx.pp('a') : 0, col = PS.pcol(pg);
      return (
        `<rect class="pap" x="0" y="6" width="80" height="32" rx="14"/>` +
        (col ? `<rect class="chamber" x="2" y="8" width="76" height="28" rx="12" style="fill:${col}"/>` : '') +
        `<path class="k" d="M20,0 V6 M60,0 V6"/>` +
        PS.txt(ctx, 40, 26, (ctx.sim ? PS.fmt(pg, 1) + ' bar · ' : '') + PS.fmt(c.p.vol, 1) + ' l', 'middle', 'lbl val')
      );
    },
    build(c, B) {
      B.sim.addVol(B.port('a'), c.p.vol);
    },
  });

  PS.defType({
    id: 'gauge', name: 'Manometer', prefix: 'M', dyn: true,
    defaults: () => ({ max: 10 }),
    params: [num('max', 'Messbereich', 2, 25, 1, 'bar')],
    ports: () => [{ id: '1', x: 0, y: 40, dir: 'down', kind: 'any' }],
    bbox: () => ({ x0: -19, y0: -3, x1: 66, y1: 42 }),
    draw(c, ctx) {
      const pg = ctx.sim ? ctx.pp('1') : 0;
      const a = (-135 + (270 * clamp(pg, 0, c.p.max)) / c.p.max) * (Math.PI / 180);
      const nx = (Math.sin(a) * 11).toFixed(1), ny = (-Math.cos(a) * 11).toFixed(1);
      let ticks = '';
      for (let i = 0; i <= 5; i++) {
        const t = (-135 + 54 * i) * (Math.PI / 180), s = Math.sin(t), co = -Math.cos(t);
        ticks += `M${(s * 12.5).toFixed(1)},${(16 + co * 12.5).toFixed(1)} L${(s * 15).toFixed(1)},${(16 + co * 15).toFixed(1)} `;
      }
      return (
        `<circle class="pap" cx="0" cy="16" r="16"/>` +
        `<path class="k thin" d="${ticks}"/>` +
        `<path class="k needle" d="M0,16 L${nx},${(16 + parseFloat(ny)).toFixed(1)}"/><circle class="kf" cx="0" cy="16" r="1.6"/>` +
        `<path class="k" d="M0,32 V40"/>` +
        PS.txt(ctx, 22, 19, ctx.sim ? PS.fmt(pg, 2) + ' bar' : '— bar', 'start', 'lbl val big')
      );
    },
    build(c, B) {
      const n = B.port('1');
      B.sim.addVol(n, 0.004);
      B.rt.node = n;
    },
  });

  PS.defType({
    id: 'note', name: 'Beschriftung', prefix: '', noLabel: true,
    defaults: () => ({ text: 'Beschriftung', size: 14 }),
    params: [{ k: 'text', label: 'Text', type: 'text' }, num('size', 'Schriftgröße', 8, 40, 1, 'px')],
    ports: () => [],
    bbox: (c) => ({ x0: -2, y0: -c.p.size, x1: Math.max(20, String(c.p.text).length * c.p.size * 0.58) + 4, y1: 6 }),
    draw: (c, ctx) => `<text class="note" style="font-size:${c.p.size}px" transform="${ctx.flip ? 'scale(-1 1)' : ''}${ctx.rot ? ` rotate(${-90 * ctx.rot})` : ''}">${PS.esc(c.p.text)}</text>`,
    build() {},
  });

  /* ======================= Zylinder ======================= */
  const CW = 120, CH = 30;
  function cylDraw(c, ctx, dbl) {
    const simOn = !!(ctx.sim && ctx.rt);
    const frac = simOn ? clamp(ctx.rt.x / ctx.rt.L, 0, 1) : c.p.init === 'front' ? 1 : 0;
    const xp = 3 + frac * (CW - 12);
    const tip = xp + 6 + CW + 7;
    const pA = simOn ? ctx.pp('A') : 0, pB = simOn && dbl ? ctx.pp('B') : 0;
    const cA = PS.pcol(pA), cB = PS.pcol(pB);
    let s = '';
    if (!simOn && !ctx.thumb) {
      s += `<path class="k ghost" d="M${CW},15 H${2 * CW + 4}"/><rect class="pap ghost" x="${2 * CW + 4}" y="6" width="5" height="18"/>`;
    }
    if (cA) s += `<rect class="chamber" x="1" y="1" width="${(xp - 1).toFixed(1)}" height="${CH - 2}" style="fill:${cA}"/>`;
    if (cB) s += `<rect class="chamber" x="${(xp + 6).toFixed(1)}" y="1" width="${(CW - xp - 7).toFixed(1)}" height="${CH - 2}" style="fill:${cB}"/>`;
    s += `<rect class="body" x="0" y="0" width="${CW}" height="${CH}"/>`;
    s += `<path class="k rod" d="M${(xp + 6).toFixed(1)},15 H${tip.toFixed(1)}"/>`;
    s += `<rect class="pap" x="${tip.toFixed(1)}" y="6" width="5" height="18"/>`;
    s += `<rect class="pap" x="${xp.toFixed(1)}" y="3" width="6" height="${CH - 6}"/>`;
    if (!dbl) {
      s += PS.svg.spring(xp + 6, CW, 15, 6, 8);
      s += `<path class="k" d="M${CW - 10},0 V-6 M${CW - 15},-6 H${CW - 5}"/>`;
    }
    s += `<path class="k" d="M10,0 V-2"${pst(cA)}/>` + (dbl ? `<path class="k" d="M${CW - 10},0 V-2"${pst(cB)}/>` : '');
    /* Geber-Markierungen */
    const sens = ctx.sensors ? ctx.sensors(c.id) : [];
    sens.forEach((m, i) => {
      const x = 6 + m.pos * (CW - 12);
      s += `<path class="k sensor" d="M${x.toFixed(1)},${CH + 1} l-3.5,6 h7 Z"/>`;
      s += PS.txt(ctx, m.pos > 0.5 ? x + 2 : x + 8, CH + 17 + 9 * i, m.label, m.pos > 0.5 ? 'end' : 'start', 'lbl sens');
    });
    if (simOn && ctx.rt.tExt != null) {
      s += PS.txt(ctx, CW / 2, CH + 14, `⇥ ${PS.fmt(ctx.rt.tExt, 2)} s  ⇤ ${ctx.rt.tRet != null ? PS.fmt(ctx.rt.tRet, 2) : '–'} s`, 'middle', 'lbl muted');
    }
    return s;
  }

  function cylBuild(c, B, dbl) {
    const p = c.p;
    const A1 = (Math.PI * p.d * p.d) / 4e6;
    const A2 = dbl ? Math.max(A1 * 0.12, A1 - (Math.PI * p.rod * p.rod) / 4e6) : 0;
    const L = p.stroke * 1e-3;
    const rt = B.rt;
    rt.L = L; rt.x = p.init === 'front' ? L : 0; rt.v = 0; rt.phase = rt.x > 0 ? 2 : 0; rt.t0 = 0;
    rt.tExt = null; rt.tRet = null; rt.pA = 0; rt.pB = 0;
    const nA = B.port('A'), nB = dbl ? B.port('B') : -1;
    const dead = 0.004;
    B.chamber(nA, () => dead + A1 * rt.x * 1000, () => A1 * rt.v * 1000);
    if (dbl) B.chamber(nB, () => dead + A2 * (L - rt.x) * 1000, () => -A2 * rt.v * 1000);
    B.hook((dt) => {
      const P = B.sim.P;
      const m = Math.max(0.02, p.mass || 1), fk = Math.max(0, p.fric || 0), fs = fk * 1.25;
      const pa = (P[nA] - P0) * 1e5, pb = dbl ? (P[nB] - P0) * 1e5 : 0;
      rt.pA = (P[nA] - P0); rt.pB = dbl ? P[nB] - P0 : 0;
      let F = pa * A1 - pb * A2 - (p.load || 0) - 6 * rt.v;
      if (p.cushion !== false) { // Endlagendämpfung: Bremskraft in den letzten Millimetern
        const zone = Math.min(0.1 * L, 0.02);
        if (rt.x < zone || rt.x > L - zone) F -= 130 * rt.v;
      }
      if (!dbl) F -= (p.spring0 || 0) + (p.springK || 0) * rt.x * 1000;
      const v0 = rt.v;
      let a;
      if (Math.abs(v0) < 1e-6) a = Math.abs(F) <= fs ? 0 : (F - Math.sign(F) * fk) / m;
      else a = (F - Math.sign(v0) * fk) / m;
      let v = v0 + a * dt;
      if (v0 !== 0 && v * v0 < 0 && Math.abs(F) <= fs) v = 0;
      rt.v = v;
      rt.x += v * dt;
      if (rt.x <= 0) { rt.x = 0; if (rt.v < 0) rt.v = 0; }
      else if (rt.x >= L) { rt.x = L; if (rt.v > 0) rt.v = 0; }
      /* Hubzeit-Messung */
      const fr = rt.x / L, t = B.sim.t;
      if (rt.phase === 0 && fr > 0.02) { rt.phase = 1; rt.t0 = t; }
      else if (rt.phase === 1) { if (fr >= 0.98) { rt.phase = 2; rt.tExt = t - rt.t0; } else if (fr < 0.02) rt.phase = 0; }
      else if (rt.phase === 2 && fr < 0.98) { rt.phase = 3; rt.t0 = t; }
      else if (rt.phase === 3) { if (fr <= 0.02) { rt.phase = 0; rt.tRet = t - rt.t0; } else if (fr >= 0.98) rt.phase = 2; }
    });
  }

  const cylBase = {
    prefix: 'A', dyn: true,
    bbox: () => ({ x0: -4, y0: -10, x1: CW + 12, y1: CH + 32 }),
  };
  const cylParams = [
    num('d', 'Kolbendurchmesser', 6, 125, 1, 'mm'),
    num('stroke', 'Hub', 10, 500, 5, 'mm'),
    num('mass', 'bewegte Masse', 0.05, 100, 0.05, 'kg'),
    num('fric', 'Reibkraft', 0, 200, 1, 'N'),
    num('load', 'Gegenkraft (Last)', 0, 3000, 5, 'N'),
    { k: 'cushion', label: 'Endlagendämpfung', type: 'bool' },
    { k: 'init', label: 'Startlage', type: 'sel', opts: [['rear', 'eingefahren'], ['front', 'ausgefahren']] },
  ];
  PS.defType(Object.assign({}, cylBase, {
    id: 'cylD', name: 'Zylinder doppeltwirkend',
    defaults: () => ({ d: 32, rod: 12, stroke: 200, mass: 2, fric: 10, load: 0, cushion: true, init: 'rear' }),
    params: cylParams.slice(0, 1).concat([num('rod', 'Kolbenstange', 3, 60, 1, 'mm')], cylParams.slice(1)),
    ports: () => [
      { id: 'A', x: 10, y: 0, dir: 'up', kind: 'any', label: 'A' },
      { id: 'B', x: CW - 10, y: 0, dir: 'up', kind: 'any', label: 'B' },
    ],
    draw: (c, ctx) => cylDraw(c, ctx, true),
    build: (c, B) => cylBuild(c, B, true),
  }));
  PS.defType(Object.assign({}, cylBase, {
    id: 'cylS', name: 'Zylinder einfachwirkend',
    defaults: () => ({ d: 32, stroke: 100, mass: 1, fric: 8, load: 0, cushion: true, spring0: 14, springK: 0.15, init: 'rear' }),
    params: cylParams.concat([num('spring0', 'Federvorspannung', 0, 200, 1, 'N'), num('springK', 'Federrate', 0, 5, 0.05, 'N/mm')]),
    ports: () => [{ id: 'A', x: 10, y: 0, dir: 'up', kind: 'any', label: 'A' }],
    draw: (c, ctx) => cylDraw(c, ctx, false),
    build: (c, B) => cylBuild(c, B, false),
  }));

  /* ======================= Strömungs- und Sperrventile ======================= */
  const THR_CMAX = 0.5;
  const thrC = (open) => 0.0004 + THR_CMAX * Math.pow(clamp(open, 0, 100) / 100, 1.6);

  /* Drosselsymbol: Engstelle bei x0 (±10), Leitung von xl bis xr, einstellbar */
  function drawThrottle(x0, xl, xr, ca, cb) {
    return (
      `<path class="k" d="M${xl},0 H${x0 - 10}"${pst(ca)}/><path class="k" d="M${x0 + 10},0 H${xr}"${pst(cb)}/>` +
      `<path class="k thin" d="M${x0 - 10},0 H${x0 + 10}"${pst(ca)}/>` +
      `<path class="k" d="M${x0 - 10},-11 Q${x0},-1 ${x0 + 10},-11"/><path class="k" d="M${x0 - 10},11 Q${x0},1 ${x0 + 10},11"/>` +
      `<path class="k thin" d="M${x0 - 16},15 L${x0 + 16},-15"/><polygon class="kf" points="${x0 + 16},-15 ${x0 + 9.5},-13.5 ${x0 + 14},-9.5"/>`
    );
  }

  PS.defType({
    id: 'thr', name: 'Drosselventil (einstellbar)', prefix: 'D', dyn: true,
    defaults: () => ({ open: 40 }),
    params: [num('open', 'Öffnung', 0, 100, 1, '%')],
    ports: () => [
      { id: 'a', x: 0, y: 0, dir: 'left', kind: 'any' },
      { id: 'b', x: 60, y: 0, dir: 'right', kind: 'any' },
    ],
    bbox: () => ({ x0: -2, y0: -18, x1: 62, y1: 22 }),
    draw(c, ctx) {
      const ca = ctx.sim ? PS.pcol(ctx.pp('a')) : null, cb = ctx.sim ? PS.pcol(ctx.pp('b')) : null;
      return drawThrottle(30, 0, 60, ca, cb) + PS.txt(ctx, 30, 30, Math.round(c.p.open) + ' %', 'middle', 'lbl muted');
    },
    build(c, B) {
      B.orifice(B.port('a'), B.port('b'), () => thrC(c.p.open), B.key('a'), B.key('b'));
    },
  });

  PS.defType({
    id: 'grv', name: 'Drossel-Rückschlagventil', prefix: 'DR', dyn: true,
    defaults: () => ({ open: 30 }),
    params: [num('open', 'Drosselöffnung', 0, 100, 1, '%')],
    ports: () => [
      { id: 'a', x: 0, y: 0, dir: 'left', kind: 'any' },
      { id: 'b', x: 60, y: 0, dir: 'right', kind: 'any' },
    ],
    bbox: () => ({ x0: -2, y0: -34, x1: 62, y1: 22 }),
    draw(c, ctx) {
      const ca = ctx.sim ? PS.pcol(ctx.pp('a')) : null, cb = ctx.sim ? PS.pcol(ctx.pp('b')) : null;
      return (
        drawThrottle(30, 0, 60, ca, cb) +
        `<path class="k" d="M6,0 V-24 H24 M36,-24 H54 V0"/><circle class="kf" cx="6" cy="0" r="2.2"/><circle class="kf" cx="54" cy="0" r="2.2"/>` +
        `<path class="k" d="M30,-30 L24,-24 L30,-18"/><circle class="pap" cx="33.5" cy="-24" r="3.6"/><path class="k" d="M37.1,-24 H36"/>` +
        PS.txt(ctx, 30, 30, Math.round(c.p.open) + ' %', 'middle', 'lbl muted')
      );
    },
    build(c, B) {
      const na = B.port('a'), nb = B.port('b');
      B.orifice(na, nb, () => thrC(c.p.open), B.key('a'), B.key('b'));
      B.check(na, nb, 0.5, 0.03);
    },
  });

  PS.defType({
    id: 'chk', name: 'Rückschlagventil', prefix: 'RV', dyn: true,
    defaults: () => ({ crack: 0.2 }),
    params: [num('crack', 'Öffnungsdruck', 0, 5, 0.05, 'bar')],
    ports: () => [
      { id: 'a', x: 0, y: 0, dir: 'left', kind: 'any' },
      { id: 'b', x: 50, y: 0, dir: 'right', kind: 'any' },
    ],
    bbox: () => ({ x0: -2, y0: -12, x1: 52, y1: 16 }),
    draw(c, ctx) {
      const ca = ctx.sim ? PS.pcol(ctx.pp('a')) : null, cb = ctx.sim ? PS.pcol(ctx.pp('b')) : null;
      return (
        `<path class="k" d="M0,0 H20"${pst(ca)}/><path class="k" d="M36,0 H50"${pst(cb)}/>` +
        `<path class="k" d="M27,-7 L20,0 L27,7"/><circle class="pap" cx="31" cy="0" r="4.2"/>` +
        (c.p.crack > 0.06 ? PS.svg.spring(35.3, 46, 0, 2, 4) + `<path class="k" d="M46,-6 V6"/>` : '')
      );
    },
    build(c, B) {
      B.check(B.port('a'), B.port('b'), 0.6, () => c.p.crack, B.key('a'), B.key('b'));
    },
  });

  PS.defType({
    id: 'qe', name: 'Schnellentlüftungsventil', prefix: 'SE', dyn: true,
    defaults: () => ({}), params: [],
    ports: () => [
      { id: '1', x: 0, y: 20, dir: 'left', kind: 'in', label: '1' },
      { id: '2', x: 40, y: 20, dir: 'right', kind: 'out', label: '2' },
      { id: '3', x: 20, y: 40, dir: 'down', kind: 'exh', label: '3' },
    ],
    bbox: () => ({ x0: -4, y0: -4, x1: 44, y1: 62 }),
    draw(c, ctx) {
      const sim = ctx.sim && ctx.rt, ex = sim && ctx.rt.mode === 1;
      const c1 = sim ? PS.pcol(ctx.pp('1')) : null, c2 = sim ? PS.pcol(ctx.pp('2')) : null;
      const open3 = !(ctx.conn && ctx.conn('3'));
      let s = `<rect class="pap" x="4" y="4" width="32" height="32" rx="3"/>`;
      s += `<path class="k" d="M0,20 H4"${pst(c1)}/><path class="k" d="M36,20 H40"${pst(c2)}/>`;
      if (!ex) {
        s += `<path class="k" d="M4,20 H36"${pst(c1)}/><path class="k" d="M20,20 V36"/><circle class="pap" cx="20" cy="27" r="3.8"/>`;
      } else {
        s += `<path class="k" d="M4,20 H10"${pst(c1)}/><path class="k" d="M36,20 H20 V36"${pst(c2)}/><circle class="pap" cx="14" cy="20" r="3.8"/>`;
      }
      s += `<path class="k" d="M20,36 V40"/>`;
      if (open3) s += `<path class="k" d="M20,40 V45"/><path class="${sim && ex ? 'kp exh-on' : 'kp'}" d="M16,45 H24 L20,52 Z"/>`;
      s += PS.portLabel(ctx, { x: 0, y: 20, dir: 'left' }, '1') + PS.portLabel(ctx, { x: 40, y: 20, dir: 'right' }, '2') + PS.portLabel(ctx, { x: 20, y: 40, dir: 'down' }, '3');
      return s;
    },
    build(c, B) {
      const n1 = B.port('1'), n2 = B.port('2'), n3 = B.port('3');
      const rt = B.rt; rt.mode = 0;
      B.hook(() => {
        const P = B.sim.P, d = P[n1] - P[n2];
        if (d > 0.03) rt.mode = 0; else if (d < -0.03) rt.mode = 1;
      });
      B.orifice(n1, n2, () => (rt.mode === 0 ? 0.9 : 0), B.key('1'), B.key('2'));
      B.orifice(n2, n3, () => (rt.mode === 1 ? 1.6 : 0), B.key('2'), B.key('3'));
    },
  });

  function shuttleDraw(c, ctx, isAnd) {
    const rt = ctx.rt, sim = ctx.sim && rt;
    const ca = sim ? PS.pcol(ctx.pp('a')) : null, cb = sim ? PS.pcol(ctx.pp('b')) : null, cy = sim ? PS.pcol(ctx.pp('y')) : null;
    const dom = sim ? rt.dom : 0;
    let s = `<rect class="pap" x="8" y="2" width="34" height="36" rx="3"/>`;
    s += `<path class="k" d="M0,10 H8"${pst(ca)}/><path class="k" d="M0,30 H8"${pst(cb)}/><path class="k" d="M42,20 H50"${pst(cy)}/>`;
    if (!isAnd) {
      const by = sim ? (dom === 0 ? 26 : 14) : 20;
      s += `<circle class="pap ball" cx="19" cy="${by}" r="5.5"/>`;
      s += PS.txt(ctx, 34, 24, '≥1', 'middle', 'lbl logic');
    } else {
      const by = sim ? (dom === 0 ? 12 : 28) : 20;
      s += `<rect class="pap" x="13" y="${by - 5.5}" width="11" height="11"/>`;
      s += PS.txt(ctx, 34, 24, '&', 'middle', 'lbl logic');
    }
    s += PS.portLabel(ctx, { x: 0, y: 10, dir: 'left' }, '1') + PS.portLabel(ctx, { x: 0, y: 30, dir: 'left' }, '1') + PS.portLabel(ctx, { x: 50, y: 20, dir: 'right' }, '2');
    return s;
  }
  function shuttleBuild(c, B, isAnd) {
    const na = B.port('a'), nb = B.port('b'), ny = B.port('y');
    const rt = B.rt; rt.dom = 0;
    B.hook(() => {
      const P = B.sim.P, d = P[na] - P[nb];
      if (isAnd) { if (d < -0.02) rt.dom = 0; else if (d > 0.02) rt.dom = 1; }
      else if (d > 0.02) rt.dom = 0; else if (d < -0.02) rt.dom = 1;
    });
    B.orifice(na, ny, () => (rt.dom === 0 ? 0.7 : 0), B.key('a'), B.key('y'));
    B.orifice(nb, ny, () => (rt.dom === 1 ? 0.7 : 0), B.key('b'), B.key('y'));
  }
  const shuttlePorts = () => [
    { id: 'a', x: 0, y: 10, dir: 'left', kind: 'in' },
    { id: 'b', x: 0, y: 30, dir: 'left', kind: 'in' },
    { id: 'y', x: 50, y: 20, dir: 'right', kind: 'out' },
  ];
  PS.defType({
    id: 'or', name: 'Wechselventil (ODER)', prefix: 'W', dyn: true, defaults: () => ({}), params: [],
    ports: shuttlePorts, bbox: () => ({ x0: -4, y0: -2, x1: 56, y1: 42 }),
    draw: (c, ctx) => shuttleDraw(c, ctx, false), build: (c, B) => shuttleBuild(c, B, false),
  });
  PS.defType({
    id: 'and', name: 'Zweidruckventil (UND)', prefix: 'U', dyn: true, defaults: () => ({}), params: [],
    ports: shuttlePorts, bbox: () => ({ x0: -4, y0: -2, x1: 56, y1: 42 }),
    draw: (c, ctx) => shuttleDraw(c, ctx, true), build: (c, B) => shuttleBuild(c, B, true),
  });

  /* ======================= Druckventile ======================= */
  PS.defType({
    id: 'reg', name: 'Druckregelventil', prefix: 'DR', dyn: true,
    defaults: () => ({ pset: 4 }),
    params: [num('pset', 'Einstelldruck', 0.5, 10, 0.1, 'bar')],
    ports: () => [
      { id: 'out', x: 20, y: 0, dir: 'up', kind: 'out' },
      { id: 'in', x: 20, y: 40, dir: 'down', kind: 'in' },
    ],
    bbox: () => ({ x0: -4, y0: -2, x1: 78, y1: 42 }),
    draw(c, ctx) {
      const pi = ctx.sim ? PS.pcol(ctx.pp('in')) : null, po = ctx.sim ? PS.pcol(ctx.pp('out')) : null;
      return (
        `<rect class="pap" x="4" y="4" width="32" height="32"/>` +
        `<path class="k" d="M20,40 V36"${pst(pi)}/><path class="k" d="M20,4 V0"${pst(po)}/>` +
        PS.svg.arrow(14, 31, 14, 9, po) +
        PS.svg.spring(36, 52, 20, 3, 5) + `<path class="k thin" d="M40,32 L52,8"/><polygon class="kf" points="52,8 46.6,10.6 50.8,13"/>` +
        `<path class="k dash thin" d="M20,8 H28 M28,8 V12"/><path class="kp" d="M28,12 l-3,-2 h6 z"/>` +
        PS.txt(ctx, 41, 52, ctx.sim ? PS.fmt(ctx.pp('out'), 1) + ' bar' : PS.fmt(c.p.pset, 1) + ' bar', 'start', 'lbl val')
      );
    },
    build(c, B) {
      const nin = B.port('in'), nout = B.port('out');
      B.check(nin, nout, () => 1.6 * clamp((c.p.pset - (B.sim.P[nout] - P0)) / 0.3, 0, 1), 0, B.key('in'), B.key('out'));
    },
  });

  PS.defType({
    id: 'rel', name: 'Druckbegrenzungsventil', prefix: 'DB', dyn: true,
    defaults: () => ({ pset: 7 }),
    params: [num('pset', 'Ansprechdruck', 0.5, 12, 0.1, 'bar')],
    ports: () => [{ id: 'in', x: 20, y: 40, dir: 'down', kind: 'in' }],
    bbox: () => ({ x0: -4, y0: -2, x1: 78, y1: 42 }),
    draw(c, ctx) {
      const pi = ctx.sim ? PS.pcol(ctx.pp('in')) : null;
      const open = ctx.sim && ctx.rt && ctx.rt.open > 0.05;
      return (
        `<rect class="pap" x="4" y="4" width="32" height="32"/>` +
        `<path class="k" d="M20,40 V36"${pst(pi)}/>` +
        PS.svg.arrow(14, 34, 14, 8, null) + `<path class="k" d="M20,4 V0"/><path class="${open ? 'kp exh-on' : 'kp'}" d="M16,-4 H24 L20,-11 Z" transform="translate(0,0)"/>` +
        PS.svg.spring(36, 52, 20, 3, 5) + `<path class="k thin" d="M40,32 L52,8"/><polygon class="kf" points="52,8 46.6,10.6 50.8,13"/>` +
        `<path class="k dash thin" d="M20,38 H6 V20 H4"/>` +
        PS.txt(ctx, 41, 52, PS.fmt(c.p.pset, 1) + ' bar', 'start', 'lbl val')
      );
    },
    build(c, B) {
      const nin = B.port('in');
      B.rt.open = 0;
      B.orifice(nin, 0, () => (B.rt.open = 1.5 * clamp((B.sim.P[nin] - P0 - c.p.pset) / 0.3, 0, 1)), B.key('in'));
    },
  });

  /* ======================= Zeitverzögerungsventil ======================= */
  const calibCache = {};
  function calibCt(delay, V, thr, psG) {
    const key = [delay, V, thr, psG].join('|');
    if (calibCache[key]) return calibCache[key];
    const ps = psG + P0, tgt = thr + P0;
    const timeFor = (C) => {
      let p = P0, t = 0;
      const dt = delay / 3000;
      while (p < tgt && t < delay * 5) { p += (P0 * PS.orificeQ(ps, p, C) / V) * dt; t += dt; }
      return t;
    };
    let lo = 1e-5, hi = 20;
    for (let i = 0; i < 28; i++) {
      const mid = Math.sqrt(lo * hi);
      if (timeFor(mid) > delay) lo = mid; else hi = mid;
    }
    return (calibCache[key] = Math.sqrt(lo * hi));
  }
  const TIMER_THR = 2.5, TIMER_V = 0.2;
  const timerP = (c) => ({ kind: '3/2', nc: c.p.nc, left: 'pilot', right: 'spring' });

  PS.defType({
    id: 'timer', name: 'Zeitverzögerungsventil', prefix: 'ZV', dyn: true,
    defaults: () => ({ delay: 3, nc: true, qn: 150 }),
    params: [
      num('delay', 'Verzögerungszeit', 0.2, 30, 0.1, 's'),
      { k: 'nc', label: 'Ruhestellung gesperrt (einschaltverzögert)', type: 'bool' },
    ],
    ports(c) { return PS.valveSpec(timerP(c), { pilotW: 70 }).ports; },
    bbox(c) { const b = PS.valveSpec(timerP(c), { pilotW: 70 }).bbox; return { x0: b.x0, y0: b.y0, x1: b.x1, y1: 62 }; },
    draw(c, ctx) {
      const spec = PS.valveSpec(timerP(c), { pilotW: 70 });
      const colq = ctx.sim && ctx.rt ? PS.pcol(ctx.rt.q) : null;
      const colp = ctx.sim ? PS.pcol(ctx.pp('pL')) : null;
      let s = PS.drawValve({ p: timerP(c), id: c.id }, ctx, spec);
      /* Drossel-Rückschlag-Kombination und Steuerbehälter auf der Steuerleitung (Mittellinie y=20) */
      const ov = s;
      s = '';
      s += drawThrottle(-88, -110, -68, colp, colq);
      s += `<path class="k" d="M-104,0 V-16 H-72 V0" transform="translate(0,0)"${pst(colp)}/><circle class="kf" cx="-104" cy="0" r="2" />`;
      s += `<path class="k" d="M-91,-22 L-83,-16 L-91,-10"/><circle class="pap" cx="-94" cy="-16" r="3.4"/><circle class="kf" cx="-72" cy="0" r="2"/>`;
      s += `<path class="k dash" d="M-58,0 V12"/><rect class="pap" x="-76" y="12" width="36" height="14" rx="7"${colq ? ` style="fill:${colq}"` : ''}/>`;
      return ov + `<g transform="translate(0,20)">${s}</g>` + PS.txt(ctx, -86, 62, PS.fmt(c.p.delay, 1) + ' s', 'middle', 'lbl val');
    },
    build(c, B) {
      const spec = PS.valveSpec(timerP(c), { pilotW: 70 });
      const nodes = {};
      spec.main.forEach((id) => (nodes[id] = B.port(id)));
      const npp = B.port('pL');
      const nq = B.addNode(TIMER_V);
      B.rt.q = 0;
      let ct = null, lastDelay = null;
      const ctNow = () => {
        if (lastDelay !== c.p.delay) { lastDelay = c.p.delay; ct = calibCt(c.p.delay, TIMER_V, TIMER_THR, B.sim.maxSupply || 6); }
        return ct;
      };
      B.orifice(npp, nq, ctNow, B.key('pL'));
      B.check(nq, npp, 0.5, 0.02);
      B.hook(() => { B.rt.q = B.sim.P[nq] - P0; });
      PS.buildValveCore(B, spec, {
        nodes, pilot: { L: nq, R: -1 }, left: 'pilot', right: 'spring', bind: {},
        cv: () => (c.p.qn || 150) / 252, pilotP: () => TIMER_THR,
      });
    },
  });

  /* ======================= Körper für die Leitungsverlegung ======================= */
  const BODY = {
    src: { x0: -14, y0: 10, x1: 14, y1: 38 },
    wu: { x0: -26, y0: 8, x1: 26, y1: 72 },
    exh: { x0: -6, y0: 9, x1: 6, y1: 18 },
    tank: { x0: 0, y0: 6, x1: 80, y1: 38 },
    gauge: { x0: -16, y0: 0, x1: 16, y1: 32 },
    cylD: { x0: 0, y0: 0, x1: CW + 27, y1: CH },
    cylS: { x0: 0, y0: 0, x1: CW + 27, y1: CH },
    thr: { x0: 0, y0: -12, x1: 60, y1: 12 },
    grv: { x0: 0, y0: -30, x1: 60, y1: 12 },
    chk: { x0: 0, y0: -8, x1: 50, y1: 8 },
    qe: { x0: 4, y0: 4, x1: 36, y1: 36 },
    or: { x0: 8, y0: 2, x1: 32, y1: 38 },
    and: { x0: 8, y0: 2, x1: 32, y1: 38 },
    reg: { x0: 4, y0: 4, x1: 62, y1: 36 },
    rel: { x0: 4, y0: 4, x1: 62, y1: 36 },
  };
  Object.keys(BODY).forEach((k) => { PS.types[k].body = () => BODY[k]; });
  PS.types.valve.body = (c) => { const sp = PS.valveSpec(c.p); return { x0: sp.leftEdge - sp.lw, y0: 0, x1: sp.rightEdge + sp.rw, y1: 40 }; };
  PS.types.timer.body = (c) => { const sp = PS.valveSpec(timerP(c), { pilotW: 70 }); return { x0: sp.leftEdge - sp.lw, y0: 0, x1: sp.rightEdge + sp.rw, y1: 48 }; };

  /* ======================= Palette ======================= */
  PS.PALETTE = [
    { cat: 'Energieversorgung', items: [
      { type: 'src', name: 'Druckluftquelle' },
      { type: 'wu', name: 'Wartungseinheit' },
      { type: 'junction', name: 'Verzweigung' },
      { type: 'exh', name: 'Entlüftung' },
      { type: 'exh', name: 'Entlüftung mit Schalldämpfer', p: { muffler: true } },
      { type: 'tank', name: 'Druckluftbehälter' },
    ] },
    { cat: 'Arbeitsglieder', items: [
      { type: 'cylS', name: 'Zylinder einfachwirkend' },
      { type: 'cylD', name: 'Zylinder doppeltwirkend' },
    ] },
    { cat: 'Wegeventile', items: PS.valvePresets.map((v) => ({ type: 'valve', name: v.name, p: v.p })) },
    { cat: 'Sperr- & Stromventile', items: [
      { type: 'chk', name: 'Rückschlagventil' },
      { type: 'thr', name: 'Drosselventil' },
      { type: 'grv', name: 'Drossel-Rückschlagventil' },
      { type: 'qe', name: 'Schnellentlüftungsventil' },
      { type: 'or', name: 'Wechselventil (ODER)' },
      { type: 'and', name: 'Zweidruckventil (UND)' },
    ] },
    { cat: 'Druck & Zeit', items: [
      { type: 'reg', name: 'Druckregelventil' },
      { type: 'rel', name: 'Druckbegrenzungsventil' },
      { type: 'timer', name: 'Zeitverzögerungsventil (einschalt-verz.)' },
      { type: 'timer', name: 'Zeitverzögerungsventil (ausschalt-verz.)', p: { nc: false } },
    ] },
    { cat: 'Anzeige', items: [
      { type: 'gauge', name: 'Manometer' },
      { type: 'note', name: 'Beschriftung' },
    ] },
  ];
})();
