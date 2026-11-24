/* PneuSim – Dokumentmodell (Bauteile + Leitungen) */
(function () {
  const PS = globalThis.PS;

  const Doc = (PS.Doc = {});

  Doc.create = (name) => ({ app: 'pneusim', version: 1, name: name || 'Neuer Schaltplan', comps: [], wires: [], nextId: 1 });

  Doc.labelFor = function (doc, type, p) {
    const T = PS.types[type];
    if (!T || T.noLabel) return '';
    let prefix = T.prefix || '';
    if (type === 'valve' && (p.kind === '3/2' || p.kind === '2/2')) {
      const sig = (k) => ['push', 'manual', 'lever', 'pedal', 'roller', 'rollerIdle'].includes(k);
      if (sig(p.left) || sig(p.right)) prefix = 'S';
    }
    const used = new Set(doc.comps.map((c) => c.label));
    for (let n = 1; ; n++) if (!used.has(prefix + n)) return prefix + n;
  };

  Doc.addComp = function (doc, type, x, y, over, opts) {
    const T = PS.types[type];
    if (!T) throw new Error('Unbekannter Bauteiltyp: ' + type);
    opts = opts || {};
    const p = Object.assign(T.defaults(), PS.copy(over || {}));
    const c = {
      id: opts.id || 'c' + doc.nextId++,
      type, x: PS.snap(x), y: PS.snap(y), rot: opts.rot || 0, flip: !!opts.flip, p,
      label: opts.label != null ? opts.label : Doc.labelFor(doc, type, p),
    };
    if (opts.id) { const m = /^c(\d+)$/.exec(opts.id); if (m) doc.nextId = Math.max(doc.nextId, +m[1] + 1); }
    doc.comps.push(c);
    return c;
  };

  Doc.addWire = function (doc, a, b, via) {
    const w = { id: 'w' + doc.nextId++, a: { c: a.c, p: a.p }, b: { c: b.c, p: b.p }, via: via || null };
    doc.wires.push(w);
    return w;
  };

  Doc.byId = (doc, id) => doc.comps.find((c) => c.id === id);

  /* Zuordnungen: Parameter mit Objektwert {cyl|coil|relay: <id>, …} */
  Doc.REFS = ['cyl', 'coil', 'relay'];
  Doc.eachBind = (c, fn) => {
    if (!c.p) return;
    Object.keys(c.p).forEach((k) => { const v = c.p[k]; if (v && typeof v === 'object' && !Array.isArray(v)) fn(k, v); });
  };

  Doc.removeComp = function (doc, id) {
    doc.comps = doc.comps.filter((c) => c.id !== id);
    doc.wires = doc.wires.filter((w) => w.a.c !== id && w.b.c !== id);
    // Zuordnungen (Zylinder, Spule, Relais) aufräumen
    doc.comps.forEach((c) => Doc.eachBind(c, (k, bd) => { if (Doc.REFS.some((r) => bd[r] === id)) c.p[k] = null; }));
  };

  /* Verbindungsvorschau: gibt es an einem Port bereits eine Leitung? */
  Doc.connSet = function (doc) {
    const s = new Set();
    doc.wires.forEach((w) => { s.add(w.a.c + ':' + w.a.p); s.add(w.b.c + ':' + w.b.p); });
    return s;
  };

  /* Zylinder-Geber-Markierungen: cylId -> [{pos,label}] */
  Doc.sensorsOf = function (doc, cylId) {
    const out = [];
    doc.comps.forEach((c) => {
      if (c.type === 'esens' && c.p.bind && c.p.bind.cyl === cylId) out.push({ pos: c.p.bind.pos, label: c.label || '·' });
      if (c.type !== 'valve' && c.type !== 'timer') return;
      [['left', 'bindL'], ['right', 'bindR']].forEach(([k, bk]) => {
        const kind = c.p[k], bd = c.p[bk];
        if (PS.ACT[kind] && PS.ACT[kind].sensor && bd && bd.cyl === cylId) out.push({ pos: bd.pos, label: c.label || '·' });
      });
    });
    return out;
  };

  Doc.serialize = (doc) => JSON.stringify({ app: 'pneusim', version: 1, name: doc.name, comps: doc.comps, wires: doc.wires.map((w) => ({ id: w.id, a: w.a, b: w.b, via: w.via })), nextId: doc.nextId }, null, 1);

  Doc.parse = function (text) {
    const o = typeof text === 'string' ? JSON.parse(text) : text;
    if (!o || o.app !== 'pneusim' || !Array.isArray(o.comps)) throw new Error('Keine gültige PneuSim-Datei.');
    const doc = Doc.create(o.name);
    doc.comps = o.comps.filter((c) => PS.types[c.type]).map((c) => {
      const T = PS.types[c.type];
      return { id: c.id, type: c.type, x: +c.x || 0, y: +c.y || 0, rot: c.rot | 0, flip: !!c.flip, label: c.label || '', p: Object.assign(T.defaults(), c.p || {}) };
    });
    const ids = new Set(doc.comps.map((c) => c.id));
    doc.wires = (o.wires || []).filter((w) => ids.has(w.a.c) && ids.has(w.b.c)).map((w) => ({ id: w.id, a: w.a, b: w.b, via: w.via || null }));
    doc.nextId = Math.max(o.nextId || 1, 1);
    [...doc.comps.map((c) => c.id), ...doc.wires.map((w) => w.id)].forEach((id) => {
      const m = /^[cw](\d+)$/.exec(id); if (m) doc.nextId = Math.max(doc.nextId, +m[1] + 1);
    });
    return doc;
  };
})();
