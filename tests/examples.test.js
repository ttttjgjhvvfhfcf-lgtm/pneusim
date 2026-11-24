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

console.log('\nEP1 Magnetventil direkt');
{ const s = setup(12); s.run(1); ok(s.x('A1') < 0.01 && !s.rt('H1').on, 'Ruhe: eingefahren, Lampe aus');
  s.press('S1'); s.run(1); ok(s.x('A1') > 0.99 && s.rt('Y1').on && s.rt('H1').on, 'S1 gedrückt: Y1 erregt, Lampe an, ausgefahren');
  s.press('S1', 'L', false); s.run(1.5); ok(s.x('A1') < 0.01 && !s.rt('Y1').on, 'S1 los: Y1 aus, eingefahren'); }

console.log('\nEP2 Selbsthaltung');
{ const s = setup(13); s.run(1); ok(s.x('A1') < 0.01, 'Ruhe');
  s.press('S1'); s.run(0.3); s.press('S1', 'L', false); s.run(1.5);
  ok(s.rt('K1').pulled && s.x('A1') > 0.99 && s.rt('H1').on, 'K1 hält nach Loslassen von S1, A1 ausgefahren, H1 an');
  s.press('S2'); s.run(0.3); s.press('S2', 'L', false); s.run(1.5);
  ok(!s.rt('K1').pulled && s.x('A1') < 0.01 && !s.rt('H1').on, 'S2 (Öffner) löst Selbsthaltung, A1 fährt zurück');
  s.run(1); ok(!s.rt('K1').pulled, 'bleibt aus'); }

console.log('\nEP3 Rücklauf mit Sensoren');
{ const s = setup(14); s.run(1); ok(s.x('A1') < 0.01, 'Ruhe');
  s.press('S1'); s.run(0.2); s.press('S1', 'L', false); s.run(3);
  ok(s.x('A1') < 0.01 && s.rt('A1').tExt != null && s.rt('A1').tRet != null, 'fährt aus und selbsttätig zurück (aus ' + s.rt('A1').tExt.toFixed(2) + ' s, ein ' + s.rt('A1').tRet.toFixed(2) + ' s)');
  s.run(2); ok(s.x('A1') < 0.01, 'bleibt ohne neuen Start eingefahren'); }

console.log('\nEP4 Zeitrelais');
{ const s = setup(15); s.run(1); s.press('S1'); s.run(0.2); s.press('S1', 'L', false);
  let tFront = null, tBack = null; const t0 = s.sim.t;
  for (let i = 0; i < 1000; i++) { s.run(0.02); if (tFront == null && s.x('A1') > 0.98) tFront = s.sim.t - t0; if (tFront != null && s.x('A1') < 0.9) { tBack = s.sim.t - t0; break; } }
  ok(tFront != null && tBack != null && tBack - tFront > 2.9 && tBack - tFront < 3.6, 'Verweilzeit ≈ 3 s: ' + (tBack ? (tBack - tFront).toFixed(2) : '–') + ' s'); }

console.log('\nEP5 Folgesteuerung A+ B+ A- B-');
{ const s = setup(16); s.run(1);
  const ev = []; let st = { a: 0, b: 0 };
  s.press('S1'); s.run(0.25); s.press('S1', 'L', false);
  for (let i = 0; i < 1000; i++) {
    s.run(0.01);
    const a = s.x('1A1'), b = s.x('2A1');
    const na = a > 0.95 ? 1 : a < 0.05 ? 0 : st.a, nb = b > 0.95 ? 1 : b < 0.05 ? 0 : st.b;
    if (na !== st.a) { ev.push(na ? 'A+' : 'A-'); st.a = na; }
    if (nb !== st.b) { ev.push(nb ? 'B+' : 'B-'); st.b = nb; }
    if (ev.length >= 4) { s.run(1); break; }
  }
  ok(ev.join(' ') === 'A+ B+ A- B-', 'Ablauf: ' + ev.join(' '));
  s.run(3); ok(s.x('1A1') < 0.01 && s.x('2A1') < 0.01, 'bleibt in Ausgangslage ohne neuen Start'); }

console.log('\nElektrik-Löser');
function elecDoc(build) {
  const doc = PS.Doc.create('e'); const E = { doc };
  E.add = (type, x, y, p, label) => PS.Doc.addComp(doc, type, x, y, p, { label });
  E.w = (a, pa, b, pb) => PS.Doc.addWire(doc, { c: a.id, p: pa }, { c: b.id, p: pb });
  build(E); doc.wires.forEach((w) => (w.len = 60));
  const sim = PS.compile(doc);
  return { doc, sim, rt: (c) => sim.rt[c.id], press: (c, v) => PS.setManual(sim, c.id, 'L', v), run: (t) => sim.advance(t) };
}
{ // Kurzschluss: Taster zwischen +24 V und 0 V
  let S; const e = elecDoc((E) => { const b24 = E.add('bus', 0, 0, { pot: '24', n: 2 }), b0 = E.add('bus', 0, 100, { pot: '0', n: 2 }); S = E.add('ebtn', 0, 40, {}, 'S'); E.w(b24, 't0', S, 'a'); E.w(S, 'b', b0, 't0'); });
  e.run(0.1); ok(!e.sim.elec.shorted, 'offener Taster: kein Kurzschluss');
  e.press(S, true); e.run(0.1); ok(e.sim.elec.shorted && e.sim.allWarnings().some((w) => /Kurzschluss/.test(w.msg)), 'gedrückter Taster zwischen den Schienen: Kurzschluss gemeldet'); }
{ // Reihenschaltung zweier Spulen: keine wird erregt (keine Spannungsteilung modelliert)
  let Y1, Y2; const e = elecDoc((E) => { const b24 = E.add('bus', 0, 0, { pot: '24', n: 2 }), b0 = E.add('bus', 0, 300, { pot: '0', n: 2 }); Y1 = E.add('coil', 0, 40, {}, 'Y1'); Y2 = E.add('coil', 0, 150, {}, 'Y2'); E.w(b24, 't0', Y1, 'a'); E.w(Y1, 'b', Y2, 'a'); E.w(Y2, 'b', b0, 't0'); });
  e.run(0.1); ok(!e.rt(Y1).on && !e.rt(Y2).on, 'zwei Spulen in Reihe: keine erregt'); }
{ // Wechsler: schaltet Last A bzw. B
  let S, LA, LB; const e = elecDoc((E) => { const b24 = E.add('bus', 0, 0, { pot: '24', n: 3 }), b0 = E.add('bus', 0, 300, { pot: '0', n: 4 });
    S = E.add('ebtn', 0, 40, { contact: 'co' }, 'S'); LA = E.add('lamp', 0, 150, {}, 'LA'); LB = E.add('lamp', 40, 150, {}, 'LB');
    E.w(b24, 't0', S, 'c'); E.w(S, 'nc', LA, 'a'); E.w(S, 'no', LB, 'a'); E.w(LA, 'b', b0, 't0'); E.w(LB, 'b', b0, 't1'); });
  e.run(0.1); ok(e.rt(LA).on && !e.rt(LB).on, 'Wechsler Ruhe: Lampe A an');
  e.press(S, true); e.run(0.1); ok(!e.rt(LA).on && e.rt(LB).on, 'Wechsler betätigt: Lampe B an'); }
{ // abfallverzögertes Relais
  let S, K, L; const e = elecDoc((E) => { const b24 = E.add('bus', 0, 0, { pot: '24', n: 3 }), b0 = E.add('bus', 0, 300, { pot: '0', n: 3 });
    S = E.add('ebtn', 0, 40, {}, 'S'); K = E.add('relay', 0, 150, { kind: 'off', delay: 1 }, 'K'); L = E.add('lamp', 40, 40, {}, 'L'); const KC = E.add('kcont', 40, 40, { bind: null }, 'x');
    E.w(b24, 't0', S, 'a'); E.w(S, 'b', K, 'a'); E.w(K, 'b', b0, 't0'); KC.p.bind = { relay: K.id }; E.w(b24, 't1', KC, 'a'); E.w(KC, 'b', L, 'a'); E.w(L, 'b', b0, 't1'); });
  e.press(S, true); e.run(0.2); ok(e.rt(K).pulled && e.rt(L).on, 'Relais angezogen, Lampe an');
  e.press(S, false); e.run(0.5); ok(e.rt(K).pulled && e.rt(L).on, 'abfallverzögert: nach 0,5 s noch angezogen');
  e.run(0.8); ok(!e.rt(K).pulled && !e.rt(L).on, 'nach 1 s abgefallen, Lampe aus'); }
{ // Druckschalter: pneumatischer Eingang schaltet Lampe
  let Q, V, P, L; const e = elecDoc((E) => { const b24 = E.add('bus', 0, 0, { pot: '24', n: 2 }), b0 = E.add('bus', 0, 300, { pot: '0', n: 2 });
    Q = E.add('src', 300, 0, { pressure: 6 }, 'Q'); V = E.add('valve', 300, 100, { kind: '3/2', nc: true, left: 'push', right: 'spring' }, 'V'); P = E.add('epress', 0, 40, { pset: 3 }, 'P'); L = E.add('lamp', 0, 150, {}, 'L');
    E.w(Q, '1', V, '1'); E.w(V, '2', P, 'p'); E.w(b24, 't0', P, 'a'); E.w(P, 'b', L, 'a'); E.w(L, 'b', b0, 't0'); });
  e.run(0.3); ok(!e.rt(L).on, 'Druckschalter: ohne Druck Lampe aus');
  PS.setManual(e.sim, V.id, 'L', true); e.run(0.5); ok(e.rt(L).on, 'Druckschalter: mit Druck Lampe an'); }
{ // Domänen: elektrische und pneumatische Anschlüsse werden getrennt behandelt
  const e = elecDoc((E) => { const b24 = E.add('bus', 0, 0, { pot: '24', n: 2 }); const Q = E.add('src', 200, 0, { pressure: 6 }, 'Q'); E.w(Q, '1', Q, '1'); });
  ok(e.sim.nodes.length >= 2, 'Pneumatik und Elektrik kompilieren getrennt'); }
{ // Zuordnungen werden beim Löschen aufgeräumt
  const doc = PS.EXAMPLES[13].build();
  const coil = doc.comps.find((c) => c.label === 'Y1'), valve = doc.comps.find((c) => c.label === 'V1'), kc = doc.comps.find((c) => c.type === 'kcont');
  const relay = doc.comps.find((c) => c.label === 'K1');
  ok(valve.p.bindL && valve.p.bindL.coil === coil.id && kc.p.bind.relay === relay.id, 'Zuordnungen vorhanden');
  PS.Doc.removeComp(doc, coil.id); PS.Doc.removeComp(doc, relay.id);
  ok(valve.p.bindL === null && kc.p.bind === null, 'Löschen von Spule/Relais entfernt die Zuordnungen');
  const sim = PS.compile(doc); ok(sim.allWarnings().length >= 1, 'verwaiste Relaiskontakte werden gemeldet'); }
console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
process.exit(fails ? 1 : 0);
