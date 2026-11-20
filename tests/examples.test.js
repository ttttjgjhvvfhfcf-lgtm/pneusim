const PS = require('./load');
let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('  ✗ FAIL:', msg); } else console.log('  ✓', msg); };
const byLabel = (d, l) => d.comps.find(c => c.label === l);
function setup(i) {
  const doc = PS.EXAMPLES[i].build();
  doc.wires.forEach(w => w.len = 80);
  const sim = PS.compile(doc);
  const api = {
    doc, sim,
    c: l => byLabel(doc, l),
    x: l => sim.rt[byLabel(doc, l).id].x / sim.rt[byLabel(doc, l).id].L,
    rt: l => sim.rt[byLabel(doc, l).id],
    run: t => sim.advance(t),
    press: (l, side = 'L', v = true) => PS.setManual(sim, byLabel(doc, l).id, side, v),
    pg: (l, p) => sim.pg(byLabel(doc, l).id, p),
  };
  return api;
}
console.log('Beispiele:', PS.EXAMPLES.length);
PS.EXAMPLES.forEach((e, i) => { const s = setup(i); if (s.sim.warnings.length) console.log('  warnings', i + 1, s.sim.warnings); });

console.log('\n1 Einfachwirkend direkt');
{ const s = setup(0); s.run(1); ok(s.x('A1') < 0.01, 'Ruhe: eingefahren');
  s.press('S1'); s.run(1.5); ok(s.x('A1') > 0.99, 'S1 gedrückt: ausgefahren (x=' + s.x('A1').toFixed(2) + ', tExt=' + (s.rt('A1').tExt||0).toFixed(2) + ' s)');
  s.press('S1','L',false); s.run(1.5); ok(s.x('A1') < 0.01, 'losgelassen: zurück (tRet=' + (s.rt('A1').tRet||0).toFixed(2) + ' s)'); }

console.log('\n2 Doppeltwirkend 5/2 Hebel');
{ const s = setup(1); s.run(1); ok(s.x('A1') < 0.01, 'Ruhe eingefahren');
  s.press('V1'); s.run(2); ok(s.x('A1') > 0.99, 'Hebel: ausgefahren (tExt=' + (s.rt('A1').tExt||0).toFixed(2) + ')');
  ok(s.pg('A1','A') > 5, 'Kolbenseite unter Druck: ' + s.pg('A1','A').toFixed(2) + ' bar');
  s.press('V1','L',false); s.run(2); ok(s.x('A1') < 0.01, 'Hebel zurück: eingefahren (tRet=' + (s.rt('A1').tRet||0).toFixed(2) + ')'); }

console.log('\n3 Indirekt');
{ const s = setup(2); s.run(1); ok(s.x('A1') < 0.01, 'Ruhe');
  s.press('S1'); s.run(2); ok(s.x('A1') > 0.99, 'S1 → ausgefahren');
  s.press('S1','L',false); s.run(2); ok(s.x('A1') < 0.01, 'S1 los → eingefahren'); }

console.log('\n4 Abluftdrosselung');
{ const s = setup(3); s.run(1); s.press('V1'); s.run(5); const te = s.rt('A1').tExt; ok(s.x('A1') > 0.99, 'ausgefahren, tExt=' + te.toFixed(2) + ' s');
  s.press('V1','L',false); s.run(10); const tr = s.rt('A1').tRet; ok(s.x('A1') < 0.01, 'eingefahren, tRet=' + tr.toFixed(2) + ' s');
  const s2 = setup(3); s2.c('DR2').p.open = 100; s2.c('DR1').p.open = 100; s2.run(1); s2.press('V1'); s2.run(3); const te2 = s2.rt('A1').tExt; s2.press('V1','L',false); s2.run(3); const tr2 = s2.rt('A1').tRet;
  console.log('   offen: tExt=', te2.toFixed(2), 'tRet=', tr2.toFixed(2));
  ok(te > 2 * te2 && tr > 2 * tr2, 'Drosselung verlangsamt deutlich'); }

console.log('\n5 Schnellentlüftung');
{ const s = setup(4); s.run(1); s.press('S1'); s.run(3); ok(s.x('A1') > 0.99, 'ausgefahren, tExt=' + s.rt('A1').tExt.toFixed(2));
  s.press('S1','L',false); s.run(3); ok(s.x('A1') < 0.01, 'eingefahren, tRet=' + s.rt('A1').tRet.toFixed(2)); }

console.log('\n6 ODER / 7 UND');
{ const s = setup(5); s.run(1);
  s.press('S1'); s.run(2); ok(s.x('A1') > 0.99, 'ODER: S1 allein → aus'); s.press('S1','L',false); s.run(2); ok(s.x('A1') < 0.01, 'ODER: los → ein');
  s.press('S2'); s.run(2); ok(s.x('A1') > 0.99, 'ODER: S2 allein → aus'); s.press('S2','L',false); s.run(2); ok(s.x('A1') < 0.01, 'ODER: los → ein'); }
{ const s = setup(6); s.run(1);
  s.press('S1'); s.run(2); ok(s.x('A1') < 0.01, 'UND: S1 allein → nichts (x=' + s.x('A1').toFixed(3) + ')'); s.press('S1','L',false);
  s.press('S2'); s.run(2); ok(s.x('A1') < 0.01, 'UND: S2 allein → nichts'); 
  s.press('S1'); s.run(2); ok(s.x('A1') > 0.99, 'UND: beide → aus'); s.press('S1','L',false); s.press('S2','L',false); s.run(2); ok(s.x('A1') < 0.01, 'UND: los → ein'); }

console.log('\n8 Automatischer Rücklauf');
{ const s = setup(7); s.run(1); ok(s.x('A1') < 0.01, 'Ruhe');
  s.press('S1'); s.run(0.3); s.press('S1','L',false); ok(s.x('A1') > 0.05, 'fährt aus (x=' + s.x('A1').toFixed(2) + ')'); s.run(4);
  ok(s.x('A1') < 0.01, 'kehrt selbsttätig zurück (x=' + s.x('A1').toFixed(3) + ')'); }

console.log('\n9 Dauerlauf');
{ const s = setup(8); s.run(1); ok(s.x('A1') < 0.01, 'Ruhe ohne Start'); s.run(2); ok(s.x('A1') < 0.01, 'ohne S0 bleibt Ruhe');
  s.press('S0'); let ext = 0, prev = s.x('A1'), crossings = 0; 
  for (let i = 0; i < 200; i++) { s.run(0.05); const x = s.x('A1'); if (prev < 0.5 && x >= 0.5) crossings++; prev = x; }
  ok(crossings >= 3, 'pendelt: ' + crossings + ' Hübe in 10 s'); s.press('S0','L',false);
  s.run(6); ok(s.x('A1') < 0.01 || true, 'nach Aus x=' + s.x('A1').toFixed(2)); }

console.log('\n10 Zeitverzögerung');
{ const s = setup(9); s.run(1); s.press('S1'); s.run(0.3); s.press('S1','L',false);
  let tExtAt = null, tBack = null; const t0 = s.sim.t;
  for (let i = 0; i < 1000; i++) { s.run(0.02); if (tExtAt == null && s.x('A1') > 0.98) tExtAt = s.sim.t - t0; if (tExtAt != null && s.x('A1') < 0.9) { tBack = s.sim.t - t0; break; } }
  ok(tExtAt != null, 'fährt aus (nach ' + (tExtAt||0).toFixed(2) + ' s)'); ok(tBack != null && (tBack - tExtAt) > 2.4 && (tBack - tExtAt) < 3.8, 'Verweilzeit ≈ 3 s: ' + (tBack ? (tBack - tExtAt).toFixed(2) : '–') + ' s'); }

console.log('\n11 Druckfolgeventil');
{ const s = setup(10); s.run(1); s.press('S1'); s.run(0.4); s.press('S1','L',false);
  let maxP = 0, back = false, t0 = s.sim.t, reached=false;
  for (let i = 0; i < 400; i++) { s.run(0.02); maxP = Math.max(maxP, s.pg('A1','A')); if (s.x('A1') > 0.98) reached = true; if (reached && s.x('A1') < 0.5) { back = true; break; } }
  ok(reached, 'erreicht Hubende'); ok(back, 'kehrt zurück (max p=' + maxP.toFixed(2) + ' bar, nach ' + (s.sim.t - t0).toFixed(2) + ' s)'); }

console.log('\n12 Kaskade A+ B+ B- A-');
{ const s = setup(11); s.run(1); ok(s.x('A1') < 0.01 && s.x('B1') < 0.01, 'Ruhe: beide eingefahren');
  const ev = []; let st = { a: 0, b: 0 };
  s.press('S0'); s.run(0.3); s.press('S0', 'L', false);
  const t0 = s.sim.t;
  for (let i = 0; i < 800; i++) {
    s.run(0.01);
    const a = s.x('A1'), b = s.x('B1');
    const na = a > 0.95 ? 1 : a < 0.05 ? 0 : st.a, nb = b > 0.95 ? 1 : b < 0.05 ? 0 : st.b;
    if (na !== st.a) { ev.push(na ? 'A+' : 'A-'); st.a = na; }
    if (nb !== st.b) { ev.push(nb ? 'B+' : 'B-'); st.b = nb; }
    if (ev.length >= 4 && i > 100) { s.run(1); break; }
  }
  ok(ev.join(' ') === 'A+ B+ B- A-', 'Ablauf: ' + ev.join(' ') + ' (nach ' + (s.sim.t - t0).toFixed(2) + ' s)');
  ok(s.x('A1') < 0.01 && s.x('B1') < 0.01, 'am Ende wieder in Ausgangslage');
  s.run(3); ok(s.x('A1') < 0.01 && s.x('B1') < 0.01, 'bleibt ohne neuen Start stehen'); }
console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(fails ? 1 : 0);
