/* PneuSim – Elektropneumatik: Bauteile des Stromlaufplans (Symbole nach EN 60617, vertikal gezeichnet) */
(function () {
  const PS = globalThis.PS;
  const P0 = PS.P0;
  const clamp = PS.clamp;

  /* Potenzialfarben im Stromlaufplan */
  PS.ecol = (pot, cur) => (pot === 24 ? (cur ? '#e5484d' : '#efa1a4') : pot === 0 ? (cur ? '#3b82f6' : '#9dbcf0') : pot === 'S' ? '#c026d3' : null);
  const est = (col) => (col ? ` style="stroke:${col}"` : '');
  const num = (k, label, min, max, step, unit, extra) => Object.assign({ k, label, type: 'num', min, max, step, unit }, extra || {});
  const ep = (id, x, y, dir, label) => ({ id, x, y, dir, kind: 'any', dom: 'e', label });
  const TOL = 0.03; // Schaltfenster der Geber (Anteil des Hubs)

  /* ---------------- Kontakte (Taster, Geber, Relaiskontakte) ---------------- */
  const LBL = {
    sw: { no: { a: '3', b: '4' }, nc: { a: '1', b: '2' }, co: { c: '11', nc: '12', no: '14' } },
    rel: { no: { a: '13', b: '14' }, nc: { a: '21', b: '22' }, co: { c: '11', nc: '12', no: '14' } },
  };
  function contactPorts(kind, set) {
    const L = LBL[set][kind] || LBL[set].no;
    if (kind === 'co') return [ep('nc', -10, 0, 'up', L.nc), ep('no', 10, 0, 'up', L.no), ep('c', 0, 60, 'down', L.c)];
    return [ep('a', 0, 0, 'up', L.a), ep('b', 0, 60, 'down', L.b)];
  }

  /* Betätigungssymbol links des Kontakts (Mittellinie y=30) */
  function actuatorSvg(style, on) {
    const k = on ? 'k act-on' : 'k', kp = on ? 'kp act-on' : 'kp';
    switch (style) {
      case 'push':
        return `<path class="k dash thin" d="M-4,30 H-26"/><path class="${k}" d="M-26,21 V39 M-26,21 H-34 M-26,39 H-34"/>`;
      case 'switch':
        return `<path class="k dash thin" d="M-4,30 H-26"/><path class="${k}" d="M-26,21 V39 M-26,21 H-34 M-26,39 H-34"/><path class="k thin" d="M-13,30 l3,-6 l3,6"/>`;
      case 'estop':
        return `<path class="k dash thin" d="M-4,30 H-24"/><path class="${kp}" d="M-24,21 V39 A9,9 0 0 1 -24,21 Z" transform="translate(-9,0)"/><path class="${k}" d="M-24,30 H-26"/>`;
      case 'roller':
        return `<path class="k dash thin" d="M-4,30 H-21"/><circle class="${kp}" cx="-27" cy="30" r="6"/><circle class="kf" cx="-27" cy="30" r="1.4"/>`;
      case 'prox':
        return `<path class="k dash thin" d="M-4,30 H-22"/><path class="${kp}" d="M-22,30 L-30,22 L-38,30 L-30,38 Z"/>`;
      case 'press':
        return `<path class="k dash thin" d="M-4,30 H-56"/><path class="${kp}" d="M-27,24 L-37,30 L-27,36 Z" transform="translate(0,0)"/>`;
      case 'relay':
        return `<path class="k dash thin" d="M-4,30 H-15"/>`;
      default: return '';
    }
  }

  function contactSvg(c, ctx, o) {
    const kind = c.p.contact || 'no';
    const sim = ctx.sim && ctx.rt;
    const act = sim ? !!ctx.rt.act : false;
    const ec = (id) => (ctx.ecol ? ctx.ecol(id) : null);
    let s = '';
    if (kind === 'co') {
      s += `<path class="k" d="M-10,0 V20"${est(ec('nc'))}/><path class="k" d="M10,0 V20"${est(ec('no'))}/><path class="k" d="M0,40 V60"${est(ec('c'))}/>`;
      s += `<circle class="kf" cx="-10" cy="20" r="1.8"/><circle class="kf" cx="10" cy="20" r="1.8"/>`;
      s += `<path class="k" d="M0,40 L${act ? 10 : -10},21"${est(ec('c'))}/>`;
    } else {
      const closed = kind === 'no' ? act : !act;
      s += `<path class="k" d="M0,0 V20"${est(ec('a'))}/><path class="k" d="M0,40 V60"${est(ec('b'))}/>`;
      s += closed ? `<path class="k" d="M0,40 V20"${est(ec('a'))}/>` : `<path class="k" d="M0,40 L-9,21"/>`;
      if (kind === 'nc') s += `<path class="k thin" d="M-5,20 H5"/>`;
      s += `<circle class="kf" cx="0" cy="20" r="1.8"/>`;
    }
    const a = actuatorSvg(o.style, o.active != null ? o.active : act);
    s += o.operable ? `<g class="act act-man" data-act="L"><rect class="hit" x="-46" y="8" width="52" height="44"/>${a}</g>` : a;
    PS.types[c.type].ports(c).forEach((pt) => { if (pt.label && pt.dom === 'e') s += PS.portLabel(ctx, pt, pt.label); });
    return s;
  }

  function buildContact(c, B, stateFn) {
    const kind = c.p.contact || 'no';
    const rt = B.rt;
    rt.act = false;
    if (kind === 'co') {
      const nc = B.enet('nc'), no = B.enet('no'), cm = B.enet('c');
      B.eSwitch(cm, nc, () => !rt.act); B.eSwitch(cm, no, () => rt.act);
    } else {
      const a = B.enet('a'), b = B.enet('b');
      B.eSwitch(a, b, () => (kind === 'no' ? rt.act : !rt.act));
    }
    B.hook((dt) => { rt.act = !!stateFn(dt); });
  }

  const BODY_C = { x0: -46, y0: 6, x1: 12, y1: 54 };
  const contactBase = { prefix: 'S', dyn: true, junction: false };

  /* Taster / Schalter (handbetätigt) */
  const BTN_NAMES = { push: 'Taster', switch: 'Schalter (rastend)', estop: 'Not-Aus' };
  PS.defType(Object.assign({}, contactBase, {
    id: 'ebtn', name: 'Taster / Schalter',
    defaults: () => ({ contact: 'no', mode: 'hold', style: 'push' }),
    params: [
      { k: 'contact', label: 'Kontakt', type: 'sel', opts: [['no', 'Schließer'], ['nc', 'Öffner'], ['co', 'Wechsler']] },
      { k: 'style', label: 'Betätigungsart', type: 'sel', opts: [['push', 'Drucktaster'], ['switch', 'Schalter'], ['estop', 'Not-Aus-Pilz']] },
      { k: 'mode', label: 'Verhalten', type: 'sel', opts: [['hold', 'tastend (Federrückstellung)'], ['latch', 'rastend']] },
    ],
    ports: (c) => contactPorts(c.p.contact, 'sw'),
    bbox: () => ({ x0: -50, y0: -4, x1: 22, y1: 66 }),
    body: () => BODY_C,
    draw: (c, ctx) => contactSvg(c, ctx, { style: c.p.style, operable: true, active: ctx.sim && ctx.rt ? !!ctx.rt.man.L : false }),
    operables: (c) => [{ side: 'L', latch: c.p.mode === 'latch', name: BTN_NAMES[c.p.style] || 'Taster' }],
    build(c, B) {
      B.rt.man = { L: false };
      buildContact(c, B, () => B.rt.man.L);
    },
  }));

  /* Positionsgeber am Zylinder: Endlagenschalter (Rolle) und Näherungsschalter (Reed) */
  PS.defType(Object.assign({}, contactBase, {
    id: 'esens', name: 'Endlagen-/Näherungsschalter', prefix: 'B',
    defaults: () => ({ contact: 'no', style: 'roller', bind: null }),
    params: [
      { k: 'contact', label: 'Kontakt', type: 'sel', opts: [['no', 'Schließer'], ['nc', 'Öffner'], ['co', 'Wechsler']] },
      { k: 'style', label: 'Bauart', type: 'sel', opts: [['roller', 'Rollenhebel (mechanisch)'], ['prox', 'Näherungsschalter / Reed']] },
      { k: 'bind', label: 'Zylinder und Position', type: 'bind', target: 'cyl' },
    ],
    ports: (c) => contactPorts(c.p.contact, 'sw'),
    bbox: () => ({ x0: -50, y0: -4, x1: 22, y1: 66 }),
    body: () => BODY_C,
    draw: (c, ctx) => contactSvg(c, ctx, { style: c.p.style }),
    build(c, B) {
      const sim = B.sim, rt = B.rt;
      rt.hold = 0;
      B.warnIf(!(c.p.bind && B.hasComp(c.p.bind.cyl)), 'ist keinem Zylinder zugeordnet');
      buildContact(c, B, (dt) => {
        const bd = c.p.bind, cyl = bd && sim.rt[bd.cyl];
        let hit = false;
        if (cyl && cyl.L) hit = Math.abs(cyl.x / cyl.L - bd.pos) <= TOL;
        if (hit) rt.hold = 0.02; else if (rt.hold > 0) rt.hold -= dt;
        return rt.hold > 0;
      });
    },
  }));

  /* Druckschalter: pneumatischer Eingang, elektrischer Kontakt */
  PS.defType(Object.assign({}, contactBase, {
    id: 'epress', name: 'Druckschalter', prefix: 'B',
    defaults: () => ({ contact: 'no', pset: 3 }),
    params: [
      { k: 'contact', label: 'Kontakt', type: 'sel', opts: [['no', 'Schließer'], ['nc', 'Öffner'], ['co', 'Wechsler']] },
      num('pset', 'Schaltdruck', 0.3, 10, 0.1, 'bar'),
    ],
    ports: (c) => contactPorts(c.p.contact, 'sw').concat([{ id: 'p', x: -56, y: 30, dir: 'left', kind: 'any', dom: 'p', label: 'P' }]),
    bbox: () => ({ x0: -62, y0: -4, x1: 22, y1: 66 }),
    body: () => ({ x0: -50, y0: 6, x1: 12, y1: 54 }),
    draw(c, ctx) {
      const pc = ctx.sim ? PS.pcol(ctx.pp('p')) : null;
      return contactSvg(c, ctx, { style: 'press' }) + (pc ? `<path class="k dash thin" d="M-4,30 H-56" style="stroke:${pc}"/>` : '') +
        PS.txt(ctx, -30, 52, PS.fmt(c.p.pset, 1) + ' bar', 'middle', ctx.sim ? 'lbl val' : 'lbl muted');
    },
    build(c, B) {
      const n = B.port('p'), rt = B.rt;
      B.sim.addVol(n, 0.004);
      buildContact(c, B, () => {
        const pg = B.sim.P[n] - P0;
        if (pg >= c.p.pset) rt.on = true; else if (pg <= c.p.pset - 0.4) rt.on = false;
        return !!rt.on;
      });
    },
  }));

  /* Relaiskontakt: gehört zu einem Relais (Zuordnung im Eigenschaften-Bereich) */
  PS.defType({
    id: 'kcont', name: 'Relaiskontakt', prefix: '', noLabel: true, dyn: true,
    defaults: () => ({ contact: 'no', bind: null }),
    params: [
      { k: 'contact', label: 'Kontakt', type: 'sel', opts: [['no', 'Schließer'], ['nc', 'Öffner'], ['co', 'Wechsler']] },
      { k: 'bind', label: 'gehört zu Relais', type: 'bind', target: 'relay' },
    ],
    ports: (c) => contactPorts(c.p.contact, 'rel'),
    bbox: () => ({ x0: -52, y0: -4, x1: 40, y1: 66 }),
    body: () => ({ x0: -22, y0: 6, x1: 12, y1: 54 }),
    draw(c, ctx) {
      const bd = c.p.bind, lab = bd && ctx.refLabel ? ctx.refLabel(bd.relay) : null;
      const rel = ctx.sim && bd ? ctx.sim.rt[bd.relay] : null;
      let s = contactSvg(c, ctx, { style: 'relay', active: !!(ctx.rt && ctx.rt.act) });
      s += PS.txt(ctx, -19, 34, lab || '⚠ Relais?', 'end', rel && rel.pulled ? 'lbl sens' : 'lbl val');
      return s;
    },
    build(c, B) {
      const sim = B.sim;
      B.warnIf(!(c.p.bind && B.hasComp(c.p.bind.relay)), 'ist keinem Relais zugeordnet');
      buildContact(c, B, () => { const bd = c.p.bind, r = bd && sim.rt[bd.relay]; return !!(r && r.pulled); });
    },
  });

  /* ---------------- Spulen und Verbraucher ---------------- */
  const coilPorts = () => [ep('a', 0, 0, 'up', 'A1'), ep('b', 0, 60, 'down', 'A2')];
  const BODY_L = { x0: -14, y0: 6, x1: 14, y1: 54 };

  PS.defType({
    id: 'relay', name: 'Relais (Spule)', prefix: 'K', dyn: true,
    defaults: () => ({ kind: 'std', delay: 3 }),
    params: [
      { k: 'kind', label: 'Bauart', type: 'sel', opts: [['std', 'Relais (unverzögert)'], ['on', 'anzugsverzögert'], ['off', 'abfallverzögert']] },
      num('delay', 'Verzögerungszeit', 0.1, 60, 0.1, 's', { when: (p) => p.kind !== 'std' }),
    ],
    ports: coilPorts, bbox: () => ({ x0: -22, y0: -4, x1: 60, y1: 66 }), body: () => BODY_L,
    draw(c, ctx) {
      const rt = ctx.sim && ctx.rt, on = !!(rt && rt.on), pulled = !!(rt && rt.pulled);
      const ec = (id) => (ctx.ecol ? ctx.ecol(id) : null);
      let s = `<path class="k" d="M0,0 V16"${est(ec('a'))}/><path class="k" d="M0,44 V60"${est(ec('b'))}/>`;
      s += `<path class="${pulled ? 'kp act-on' : 'kp'}" d="M-10,16 H10 V44 H-10 Z"/>`;
      if (c.p.kind === 'on') s += `<path class="kf" d="M-5,26 H5 L0,36 Z"/>`;
      else if (c.p.kind === 'off') s += `<path class="kf" d="M-5,36 H5 L0,26 Z"/>`;
      if (c.p.kind !== 'std') s += PS.txt(ctx, 15, 34, PS.fmt(c.p.delay, 1) + ' s', 'start', 'lbl val');
      else if (pulled) s += PS.txt(ctx, 15, 34, 'angezogen', 'start', 'lbl sens');
      s += PS.portLabel(ctx, { x: 0, y: 0, dir: 'up' }, 'A1') + PS.portLabel(ctx, { x: 0, y: 60, dir: 'down' }, 'A2');
      return s;
    },
    build(c, B) {
      const rt = B.rt;
      rt.on = false; rt.pulled = false; rt.tOn = 0; rt.tOff = 0;
      B.eLoad(B.enet('a'), B.enet('b'));
      B.hook((dt) => {
        const tOn = c.p.kind === 'on' ? c.p.delay : 0.012, tOff = c.p.kind === 'off' ? c.p.delay : 0.008;
        if (rt.on) {
          rt.tOff = 0; rt.tOn += dt;
          if (!rt.pulled && rt.tOn >= tOn) rt.pulled = true;
        } else {
          rt.tOn = 0; rt.tOff += dt;
          if (rt.pulled && rt.tOff >= tOff) rt.pulled = false;
        }
      });
    },
  });

  PS.defType({
    id: 'coil', name: 'Magnetspule (Ventil)', prefix: 'Y', dyn: true,
    defaults: () => ({}), params: [],
    ports: coilPorts, bbox: () => ({ x0: -22, y0: -4, x1: 40, y1: 66 }), body: () => BODY_L,
    draw(c, ctx) {
      const rt = ctx.sim && ctx.rt, on = !!(rt && rt.on);
      const ec = (id) => (ctx.ecol ? ctx.ecol(id) : null);
      let s = `<path class="k" d="M0,0 V16"${est(ec('a'))}/><path class="k" d="M0,44 V60"${est(ec('b'))}/>`;
      s += `<path class="${on ? 'kp act-on' : 'kp'}" d="M-10,16 H10 V44 H-10 Z"/><path class="${on ? 'k act-on' : 'k'}" d="M-10,44 L10,16"/>`;
      s += PS.portLabel(ctx, { x: 0, y: 0, dir: 'up' }, 'A1') + PS.portLabel(ctx, { x: 0, y: 60, dir: 'down' }, 'A2');
      return s;
    },
    build(c, B) { B.rt.on = false; B.eLoad(B.enet('a'), B.enet('b')); },
  });

  const LAMP = { yellow: '#fbbf24', red: '#ef4444', green: '#22c55e', white: '#f8fafc', blue: '#3b82f6' };
  PS.defType({
    id: 'lamp', name: 'Meldeleuchte', prefix: 'H', dyn: true,
    defaults: () => ({ color: 'yellow' }),
    params: [{ k: 'color', label: 'Farbe', type: 'sel', opts: [['yellow', 'gelb'], ['red', 'rot'], ['green', 'grün'], ['white', 'weiß'], ['blue', 'blau']] }],
    ports: () => [ep('a', 0, 0, 'up', 'X1'), ep('b', 0, 60, 'down', 'X2')],
    bbox: () => ({ x0: -20, y0: -4, x1: 40, y1: 66 }), body: () => ({ x0: -14, y0: 6, x1: 14, y1: 54 }),
    draw(c, ctx) {
      const on = !!(ctx.sim && ctx.rt && ctx.rt.on), col = LAMP[c.p.color] || LAMP.yellow;
      const ec = (id) => (ctx.ecol ? ctx.ecol(id) : null);
      let s = `<path class="k" d="M0,0 V20"${est(ec('a'))}/><path class="k" d="M0,40 V60"${est(ec('b'))}/>`;
      if (on) s += `<circle cx="0" cy="30" r="17" style="fill:${col};opacity:.28"/>`;
      s += `<circle class="pap" cx="0" cy="30" r="10"${on ? ` style="fill:${col}"` : ''}/><path class="k" d="M-7,23 L7,37 M7,23 L-7,37"/>`;
      return s;
    },
    build(c, B) { B.rt.on = false; B.eLoad(B.enet('a'), B.enet('b')); },
  });

  /* ---------------- Spannungsschienen und Knoten ---------------- */
  PS.defType({
    id: 'bus', name: 'Spannungsschiene', prefix: '', noLabel: true, dyn: true,
    defaults: () => ({ pot: '24', n: 8 }),
    params: [
      { k: 'pot', label: 'Potenzial', type: 'sel', opts: [['24', '+24 V'], ['0', '0 V']] },
      num('n', 'Anschlusspunkte', 2, 24, 1, '', {}),
    ],
    ports: (c) => {
      const out = [], n = clamp(c.p.n | 0, 2, 24);
      for (let i = 0; i < n; i++) out.push({ id: 't' + i, x: i * 40, y: 0, dir: c.p.pot === '24' ? 'down' : 'up', kind: 'bus', dom: 'e', label: '' });
      return out;
    },
    bbox: (c) => ({ x0: -56, y0: -8, x1: (clamp(c.p.n | 0, 2, 24) - 1) * 40 + 10, y1: 8 }),
    body: (c) => ({ x0: -6, y0: -4, x1: (clamp(c.p.n | 0, 2, 24) - 1) * 40 + 6, y1: 4 }),
    draw(c, ctx) {
      const n = clamp(c.p.n | 0, 2, 24), x1 = (n - 1) * 40, hi = c.p.pot === '24';
      const cur = ctx.sim && ctx.rt && ctx.sim.elec ? ctx.sim.elec.cur[ctx.rt.net] : 0;
      const col = ctx.sim ? PS.ecol(hi ? 24 : 0, cur) : null;
      let s = `<path class="ebar ${hi ? 'e24' : 'e0'}" d="M-6,0 H${x1 + 6}"${col ? ` style="stroke:${col}"` : ''}/>`;
      for (let i = 0; i < n; i++) if (ctx.conn && ctx.conn('t' + i)) s += `<circle class="kf" cx="${i * 40}" cy="0" r="2.6"/>`;
      s += PS.txt(ctx, -12, 4, hi ? '+24 V' : '0 V', 'end', 'lbl val big');
      return s;
    },
    build(c, B) {
      const bn = B.eNew();
      B.rt.net = bn;
      B.eSource(bn, c.p.pot === '24' ? 24 : 0);
      const n = clamp(c.p.n | 0, 2, 24);
      for (let i = 0; i < n; i++) B.eLink(B.enet('t' + i), bn);
    },
  });

  PS.defType({
    id: 'ejunction', name: 'Verzweigung (elektrisch)', prefix: '', noLabel: true, dyn: true, junction: true,
    defaults: () => ({}), params: [],
    ports: () => [{ id: '1', x: 0, y: 0, dir: 'any', kind: 'any', dom: 'e' }],
    bbox: () => ({ x0: -5, y0: -5, x1: 5, y1: 5 }),
    draw(c, ctx) {
      const col = ctx.ecol ? ctx.ecol('1') : null;
      return `<circle class="junction" r="3.4"${col ? ` style="fill:${col};stroke:${col}"` : ''}/>`;
    },
    build() {},
  });

  /* ---------------- Palette ---------------- */
  PS.PALETTE.push(
    { cat: 'Elektrik: Versorgung', items: [
      { type: 'bus', name: '+24-V-Schiene', p: { pot: '24', n: 8 } },
      { type: 'bus', name: '0-V-Schiene', p: { pot: '0', n: 8 } },
      { type: 'ejunction', name: 'Verzweigung (elektrisch)' },
    ] },
    { cat: 'Elektrik: Geber & Schalter', items: [
      { type: 'ebtn', name: 'Taster (Schließer)' },
      { type: 'ebtn', name: 'Taster (Öffner)', p: { contact: 'nc' } },
      { type: 'ebtn', name: 'Taster (Wechsler)', p: { contact: 'co' } },
      { type: 'ebtn', name: 'Schalter rastend (Schließer)', p: { style: 'switch', mode: 'latch' } },
      { type: 'ebtn', name: 'Not-Aus (Öffner, rastend)', p: { contact: 'nc', style: 'estop', mode: 'latch' } },
      { type: 'esens', name: 'Endlagenschalter Rolle (Schließer)' },
      { type: 'esens', name: 'Endlagenschalter Rolle (Öffner)', p: { contact: 'nc' } },
      { type: 'esens', name: 'Näherungsschalter / Reed (Schließer)', p: { style: 'prox' } },
      { type: 'epress', name: 'Druckschalter (Schließer)' },
    ] },
    { cat: 'Elektrik: Relais & Verbraucher', items: [
      { type: 'relay', name: 'Relais' },
      { type: 'relay', name: 'Relais anzugsverzögert', p: { kind: 'on' } },
      { type: 'relay', name: 'Relais abfallverzögert', p: { kind: 'off' } },
      { type: 'kcont', name: 'Relaiskontakt (Schließer)' },
      { type: 'kcont', name: 'Relaiskontakt (Öffner)', p: { contact: 'nc' } },
      { type: 'kcont', name: 'Relaiskontakt (Wechsler)', p: { contact: 'co' } },
      { type: 'coil', name: 'Magnetspule (Ventil)' },
      { type: 'lamp', name: 'Meldeleuchte' },
    ] },
  );
})();
