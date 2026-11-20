/* PneuSim – Hilfsfunktionen, Geometrie, Farben */
(function () {
  const PS = (globalThis.PS = globalThis.PS || {});

  PS.G = 10; // Rastermaß
  PS.P0 = 1.01325; // Atmosphärendruck (bar abs.)
  PS.opts = { portLabels: true, showSensors: true };

  PS.snap = (v, g = PS.G) => Math.round(v / g) * g;
  PS.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  PS.copy = (o) => JSON.parse(JSON.stringify(o));
  PS.esc = (s) =>
    String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  PS.fmt = (v, d = 1) => { v = +v; if (!isFinite(v)) return '–'; return (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toFixed(d).replace('.', ','); };

  /* ---------- Transformation lokal -> Welt ---------- */
  PS.rotPt = function (x, y, rot, flip) {
    if (flip) x = -x;
    switch (rot & 3) {
      case 1: return [-y, x];
      case 2: return [-x, -y];
      case 3: return [y, -x];
      default: return [x, y];
    }
  };
  const DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  PS.rotDir = function (dir, rot, flip) {
    if (!dir || dir === 'any') return 'any';
    const v = DIRV[dir];
    const [x, y] = PS.rotPt(v[0], v[1], rot, flip);
    if (y < 0) return 'up';
    if (y > 0) return 'down';
    return x < 0 ? 'left' : 'right';
  };
  PS.dirVec = (dir) => DIRV[dir] || [0, 0];

  PS.worldPoint = (c, x, y) => {
    const [X, Y] = PS.rotPt(x, y, c.rot || 0, c.flip);
    return [c.x + X, c.y + Y];
  };

  /* Ports einer Komponente in Weltkoordinaten */
  PS.worldPorts = function (c) {
    const T = PS.types[c.type];
    return T.ports(c).map((p) => {
      const [x, y] = PS.worldPoint(c, p.x, p.y);
      return Object.assign({}, p, { lx: p.x, ly: p.y, x, y, dir: PS.rotDir(p.dir, c.rot || 0, c.flip) });
    });
  };

  /* Umgebendes Rechteck (Welt) */
  PS.worldBBox = function (c) {
    const b = PS.types[c.type].bbox(c);
    const pts = [
      PS.worldPoint(c, b.x0, b.y0), PS.worldPoint(c, b.x1, b.y0),
      PS.worldPoint(c, b.x1, b.y1), PS.worldPoint(c, b.x0, b.y1),
    ];
    return {
      x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])),
      x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])),
    };
  };

  /* ---------- Druckfarbe ---------- */
  PS.pcol = function (pg, pref) {
    // pg: Überdruck in bar. Liefert CSS-Farbe oder null (drucklos)
    if (pg < 0.12) return null;
    const t = PS.clamp(pg / (pref || 7), 0, 1);
    const hue = 205 + 20 * t;
    const sat = 82;
    const light = 62 - 26 * t;
    return `hsl(${hue.toFixed(0)},${sat}%,${light.toFixed(0)}%)`;
  };

  /* ---------- Kleine SVG-Helfer ---------- */
  PS.svg = {
    arrow(x1, y1, x2, y2, col) {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
      const ux = dx / L, uy = dy / L, nx = -uy, ny = ux, hl = 7, hw = 3.2;
      const bx = x2 - ux * hl, by = y2 - uy * hl;
      const st = col ? ` style="stroke:${col};fill:${col}"` : '';
      return (
        `<line class="k" x1="${x1}" y1="${y1}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}"${col ? ` style="stroke:${col}"` : ''}/>` +
        `<polygon class="kf" points="${x2},${y2} ${(bx + nx * hw).toFixed(2)},${(by + ny * hw).toFixed(2)} ${(bx - nx * hw).toFixed(2)},${(by - ny * hw).toFixed(2)}"${st}/>`
      );
    },
    /* Zickzack-Feder entlang x von x0 nach x1 bei y */
    spring(x0, x1, y, n = 4, amp = 6) {
      const pts = [[x0, y]];
      const lead = Math.min(3, (x1 - x0) / 8);
      const a = x0 + lead, b = x1 - lead, step = (b - a) / (n * 2);
      pts.push([a, y]);
      for (let i = 0; i < n * 2; i++) pts.push([a + step * (i + 0.5), y + (i % 2 ? amp : -amp)]);
      pts.push([b, y], [x1, y]);
      return `<polyline class="k" points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
    },
  };

  /* Beschriftung, die bei Drehung/Spiegelung lesbar bleibt */
  PS.txt = function (ctx, x, y, str, anchor, cls) {
    const rot = (ctx && ctx.rot) || 0, flip = ctx && ctx.flip;
    const tr = `translate(${x} ${y})${flip ? ' scale(-1 1)' : ''}${rot ? ` rotate(${-90 * rot})` : ''}`;
    return `<text class="${cls || 'lbl'}" transform="${tr}" text-anchor="${anchor || 'start'}">${PS.esc(str)}</text>`;
  };

  /* Beschriftung neben einem Port */
  PS.portLabel = function (ctx, port, str) {
    if (!PS.opts.portLabels) return '';
    const o = { up: [4, -4, 'start'], down: [4, 10, 'start'], left: [-3, -4, 'end'], right: [3, -4, 'start'], any: [4, -4, 'start'] }[port.dir || 'up'];
    return PS.txt(ctx, port.x + o[0], port.y + o[1], str || port.label || port.id, o[2], 'lbl port-lbl');
  };

  PS.types = PS.types || {};
  PS.defType = (def) => { PS.types[def.id] = def; return def; };

  PS.uid = (() => {
    let n = 0;
    return (pfx) => pfx + Date.now().toString(36).slice(-4) + (++n).toString(36);
  })();
})();
