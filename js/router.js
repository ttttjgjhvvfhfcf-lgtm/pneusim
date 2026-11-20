/* PneuSim – Leitungsverlegung (orthogonal, A* auf dem 10-px-Raster) */
(function () {
  const PS = globalThis.PS;
  const G = PS.G;

  /* tatsächlich belegter Bereich eines Bauteils (Weltkoordinaten), für Hindernisse */
  PS.worldBody = function (c) {
    const T = PS.types[c.type];
    let b = T.body ? T.body(c) : null;
    if (!b) { const bb = T.bbox(c); b = { x0: bb.x0 + 3, y0: bb.y0 + 3, x1: bb.x1 - 3, y1: bb.y1 - 3 }; }
    const pts = [PS.worldPoint(c, b.x0, b.y0), PS.worldPoint(c, b.x1, b.y1)];
    return {
      x0: Math.min(pts[0][0], pts[1][0]), y0: Math.min(pts[0][1], pts[1][1]),
      x1: Math.max(pts[0][0], pts[1][0]), y1: Math.max(pts[0][1], pts[1][1]),
    };
  };

  /* ---------- Binärheap ---------- */
  class Heap {
    constructor() { this.a = []; }
    push(k, v) {
      const a = this.a; a.push([k, v]);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last; let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]]; i = m;
        }
      }
      return top;
    }
    get size() { return this.a.length; }
  }

  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // oben, rechts, unten, links
  const DIRIDX = { up: 0, right: 1, down: 2, left: 3 };

  function simplify(pts) {
    const out = [];
    for (const p of pts) {
      const n = out.length;
      if (n && out[n - 1][0] === p[0] && out[n - 1][1] === p[1]) continue;
      out.push(p);
    }
    for (let i = out.length - 2; i > 0; i--) {
      const a = out[i - 1], b = out[i], c = out[i + 1];
      if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) out.splice(i, 1);
    }
    return out;
  }
  PS.simplifyPath = simplify;

  /* Punktfolge orthogonalisieren (Knickpunkte einfügen) */
  function ortho(pts, startDir) {
    const out = [pts[0].slice()];
    const vertFirst = startDir === 'up' || startDir === 'down';
    for (let i = 1; i < pts.length; i++) {
      const a = out[out.length - 1], b = pts[i];
      if (a[0] !== b[0] && a[1] !== b[1]) {
        const last = out.length >= 2 ? out[out.length - 2] : null;
        const vertical = last ? last[0] !== a[0] : vertFirst;
        out.push(vertical ? [a[0], b[1]] : [b[0], a[1]]);
      }
      out.push(b.slice());
    }
    return simplify(out);
  }
  PS.orthoPath = ortho;

  function manual(pa, pb, via) {
    const pts = [[pa.x, pa.y], ...via, [pb.x, pb.y]];
    return ortho(pts, pa.dir);
  }

  /* A*-Suche; obstacles: Liste {x0,y0,x1,y1}; others: Liste Punktfolgen anderer Leitungen */
  function autoRoute(pa, pb, obstacles, others) {
    const sx = pa.x / G, sy = pa.y / G, ex = pb.x / G, ey = pb.y / G;
    const d0 = pa.dir === 'any' ? null : PS.dirVec(pa.dir), d1 = pb.dir === 'any' ? null : PS.dirVec(pb.dir);
    const s1 = d0 ? [sx + d0[0], sy + d0[1]] : [sx, sy];
    const e1 = d1 ? [ex + d1[0], ey + d1[1]] : [ex, ey];
    const M = 9;
    const minx = Math.min(sx, ex, s1[0], e1[0]) - M, maxx = Math.max(sx, ex, s1[0], e1[0]) + M;
    const miny = Math.min(sy, ey, s1[1], e1[1]) - M, maxy = Math.max(sy, ey, s1[1], e1[1]) + M;
    const W = maxx - minx + 1, H = maxy - miny + 1;
    const cost = new Float32Array(W * H);
    for (const o of obstacles) {
      const i0 = Math.max(minx, Math.ceil(o.x0 / G)), i1 = Math.min(maxx, Math.floor(o.x1 / G));
      const j0 = Math.max(miny, Math.ceil(o.y0 / G)), j1 = Math.min(maxy, Math.floor(o.y1 / G));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const inside = i * G > o.x0 && i * G < o.x1 && j * G > o.y0 && j * G < o.y1;
          const k = (j - miny) * W + (i - minx);
          cost[k] = Math.max(cost[k], inside ? 70 : 10);
        }
      }
    }
    const occ = new Uint8Array(W * H); // 1 = horizontal belegt, 2 = vertikal belegt
    for (const pts of others) {
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], b = pts[i + 1];
        const horiz = a[1] === b[1];
        const x0 = Math.min(a[0], b[0]) / G, x1 = Math.max(a[0], b[0]) / G, y0 = Math.min(a[1], b[1]) / G, y1 = Math.max(a[1], b[1]) / G;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
          if (x < minx || x > maxx || y < miny || y > maxy) continue;
          occ[(y - miny) * W + (x - minx)] |= horiz ? 1 : 2;
        }
      }
    }
    const inb = (x, y) => x >= minx && x <= maxx && y >= miny && y <= maxy;
    const N = W * H * 4;
    const g = new Float32Array(N).fill(Infinity);
    const par = new Int32Array(N).fill(-1);
    const heap = new Heap();
    const hf = (x, y) => (Math.abs(x - e1[0]) + Math.abs(y - e1[1])) * 1.0;
    const sId = (x, y, d) => (((y - miny) * W + (x - minx)) << 2) | d;
    const startDirs = d0 ? [DIRIDX[pa.dir]] : [0, 1, 2, 3];
    for (const d of startDirs) {
      const id = sId(s1[0], s1[1], d);
      g[id] = 0; heap.push(hf(s1[0], s1[1]), id);
    }
    let goal = -1;
    const endDirs = d1 ? DIRIDX[pb.dir] : -1;
    let guard = 0;
    while (heap.size && guard++ < 200000) {
      const [, id] = heap.pop();
      const d = id & 3, cell = id >> 2, x = (cell % W) + minx, y = ((cell / W) | 0) + miny;
      if (x === e1[0] && y === e1[1]) {
        // letzte Bewegung in Richtung Anschluss: Eintritt gegen die Port-Richtung
        goal = id; break;
      }
      const gc = g[id];
      for (let nd = 0; nd < 4; nd++) {
        if (((nd + 2) & 3) === d) continue; // keine Umkehr
        const nx = x + DX[nd], ny = y + DY[nd];
        if (!inb(nx, ny)) continue;
        const k = (ny - miny) * W + (nx - minx);
        let c = 1 + cost[k];
        if (nd !== d) c += 3;
        const o = occ[k];
        if (o) { const horiz = nd === 1 || nd === 3; if ((o & 1 && horiz) || (o & 2 && !horiz)) c += 5; else c += 1.5; }
        const nid = (k << 2) | nd, ng = gc + c;
        if (ng < g[nid]) { g[nid] = ng; par[nid] = id; heap.push(ng + hf(nx, ny), nid); }
      }
    }
    if (goal < 0) return null;
    const cells = [];
    for (let id = goal; id >= 0; id = par[id]) { const cell = id >> 2; cells.push([((cell % W) + minx) * G, (((cell / W) | 0) + miny) * G]); }
    cells.reverse();
    const pts = [[pa.x, pa.y]];
    if (d0) pts.push([s1[0] * G, s1[1] * G]);
    cells.forEach((p) => pts.push(p));
    if (d1) pts.push([pb.x, pb.y]); else if (pts[pts.length - 1][0] !== pb.x || pts[pts.length - 1][1] !== pb.y) pts.push([pb.x, pb.y]);
    return simplify(pts);
  }

  function fallback(pa, pb) {
    const d0 = PS.dirVec(pa.dir), d1 = PS.dirVec(pb.dir);
    const a = [pa.x + d0[0] * G, pa.y + d0[1] * G], b = [pb.x + d1[0] * G, pb.y + d1[1] * G];
    return ortho([[pa.x, pa.y], a, b, [pb.x, pb.y]], pa.dir);
  }

  /* Hindernisse (alle Bauteile mit Körper) */
  PS.obstacles = function (doc, ignoreIds) {
    const out = [];
    for (const c of doc.comps) {
      const T = PS.types[c.type];
      if (!T || T.noRoute || c.type === 'junction' || c.type === 'note') continue;
      if (ignoreIds && ignoreIds.has(c.id)) continue;
      out.push(PS.worldBody(c));
    }
    return out;
  };

  PS.routeWire = function (doc, w, obstacles) {
    const ca = doc.comps.find((c) => c.id === w.a.c), cb = doc.comps.find((c) => c.id === w.b.c);
    if (!ca || !cb) return null;
    const pa = PS.worldPorts(ca).find((p) => p.id === w.a.p), pb = PS.worldPorts(cb).find((p) => p.id === w.b.p);
    if (!pa || !pb) return null;
    if (Array.isArray(w.via)) return manual(pa, pb, w.via);
    const others = doc.wires.filter((o) => o !== w && o._pts).map((o) => o._pts);
    return autoRoute(pa, pb, obstacles || PS.obstacles(doc), others) || fallback(pa, pb);
  };

  /* Vorschau beim Ziehen: von Port zu Punkt (optional mit Zielrichtung) */
  PS.routePreview = function (doc, start, via, target, obstacles) {
    const pa = { x: start.x, y: start.y, dir: start.dir };
    const pb = { x: target.x, y: target.y, dir: target.dir || 'any' };
    if (via.length) return manual(pa, pb, via);
    return autoRoute(pa, pb, obstacles, doc.wires.filter((o) => o._pts).map((o) => o._pts)) || ortho([[pa.x, pa.y], [pb.x, pb.y]], pa.dir);
  };

  /* Länge einer Punktfolge */
  PS.pathLen = (pts) => { let l = 0; for (let i = 0; i + 1 < pts.length; i++) l += Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]); return l; };

  /* Nächster Punkt auf einer Polylinie (achsparallel) */
  PS.nearestOnPath = function (pts, x, y) {
    let best = null;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      const px = PS.clamp(x, Math.min(a[0], b[0]), Math.max(a[0], b[0]));
      const py = PS.clamp(y, Math.min(a[1], b[1]), Math.max(a[1], b[1]));
      const d = Math.hypot(px - x, py - y);
      if (!best || d < best.d) best = { d, x: px, y: py, seg: i };
    }
    return best;
  };
})();
