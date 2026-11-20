/* UI-Test mit Playwright: echte Mauseingaben im Editor und in der Simulation.
 * Start: node tests/ui.test.js   (benötigt das npm-Paket "playwright" und einen installierten Chromium) */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': mime[path.extname(f)] || 'text/plain' }); res.end(d); } });
});

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('  ✗ FAIL:', m); } else console.log('  ✓', m); };

(async () => {
  await new Promise((r) => server.listen(0, r));
  const url = `http://localhost:${server.address().port}/index.html`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.waitForTimeout(300);

  const doc = () => page.evaluate(() => ({ comps: PSapp.ed.doc.comps.map((c) => ({ id: c.id, type: c.type, x: c.x, y: c.y, rot: c.rot, label: c.label })), wires: PSapp.ed.doc.wires.length }));
  const portXY = (cid, pid) => page.evaluate(([cid, pid]) => {
    const el = document.querySelector(`.port[data-cid="${cid}"][data-pid="${pid}"]`);
    const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];
  }, [cid, pid]);

  console.log('Editor');
  await page.click('#menuFile summary'); await page.click('[data-act="new"]');
  await page.waitForTimeout(200);
  let d = await doc();
  ok(d.comps.length === 0, 'neuer leerer Schaltplan');

  // Drag & Drop aus der Palette
  const canvas = page.locator('#canvas');
  await page.locator('.pitem', { hasText: 'Druckluftquelle' }).dragTo(canvas, { targetPosition: { x: 200, y: 450 } });
  await page.locator('.pitem', { hasText: 'Zylinder doppeltwirkend' }).dragTo(canvas, { targetPosition: { x: 450, y: 150 } });
  d = await doc();
  ok(d.comps.length === 2 && d.comps[0].type === 'src' && d.comps[1].type === 'cylD', 'Bauteile per Drag & Drop eingefügt: ' + d.comps.map((c) => c.type).join(','));
  ok(d.comps.every((c) => c.x % 10 === 0 && c.y % 10 === 0), 'Positionen rasten im 10-px-Raster');

  // Klick auf Palette fügt in der Mitte ein
  await page.locator('.pitem', { hasText: '5/2 Handhebel rastend' }).click();
  d = await doc();
  ok(d.comps.length === 3 && d.comps[2].type === 'valve', 'Klick fügt Ventil ein');
  const [src, cyl, val] = d.comps;

  // Leitung ziehen: Quelle(1) -> Ventil(1)
  const a = await portXY(src.id, '1'), b = await portXY(val.id, '1');
  await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 5 }); await page.mouse.move(b[0], b[1], { steps: 5 }); await page.mouse.up();
  d = await doc();
  ok(d.wires === 1, 'Leitung Quelle → Ventil 1 gezogen');
  const c4 = await portXY(val.id, '4'), ca = await portXY(cyl.id, 'A');
  await page.mouse.move(c4[0], c4[1]); await page.mouse.down(); await page.mouse.move(ca[0], ca[1], { steps: 8 }); await page.mouse.up();
  const c2 = await portXY(val.id, '2'), cb = await portXY(cyl.id, 'B');
  await page.mouse.move(c2[0], c2[1]); await page.mouse.down(); await page.mouse.move(cb[0], cb[1], { steps: 8 }); await page.mouse.up();
  d = await doc();
  ok(d.wires === 3, 'drei Leitungen vorhanden');

  // Verzweigung: Leitung auf bestehende Leitung ziehen
  await page.locator('.pitem', { hasText: 'Entlüftung mit' }).click();
  d = await doc();
  const exh = d.comps[d.comps.length - 1];
  const wirePt = await page.evaluate(() => { const w = PSapp.ed.doc.wires[0]; const pts = w._pts; const k = PSapp.ed.view.k, r = PSapp.ed.svg.getBoundingClientRect(); const i = Math.floor(pts.length / 2) - 1; const a = pts[i], b = pts[i + 1]; return [r.x + PSapp.ed.view.x + ((a[0] + b[0]) / 2) * k, r.y + PSapp.ed.view.y + ((a[1] + b[1]) / 2) * k]; });
  const ep = await portXY(exh.id, '1');
  await page.mouse.move(ep[0], ep[1]); await page.mouse.down(); await page.mouse.move(wirePt[0], wirePt[1], { steps: 8 }); await page.mouse.up();
  d = await doc();
  ok(d.comps.some((c) => c.type === 'junction') && d.wires === 5, 'Verzweigung auf bestehender Leitung erzeugt (Leitungen: ' + d.wires + ')');

  // Auswahl, Drehen, Löschen, Undo/Redo
  await page.evaluate((id) => PSapp.ed.select([id]), val.id);
  await page.keyboard.press('r');
  d = await doc();
  ok(d.comps.find((c) => c.id === val.id).rot === 1, 'R dreht das Ventil');
  await page.keyboard.press('Delete');
  d = await doc();
  ok(!d.comps.some((c) => c.id === val.id), 'Entf löscht Bauteil samt Leitungen (Leitungen: ' + d.wires + ')');
  await page.keyboard.press('Control+z');
  d = await doc();
  ok(d.comps.some((c) => c.id === val.id), 'Strg+Z stellt Bauteil wieder her');
  await page.keyboard.press('Control+y');
  d = await doc();
  ok(!d.comps.some((c) => c.id === val.id), 'Strg+Y wiederholt Löschen');
  await page.keyboard.press('Control+z');

  // Bauteil mit der Maus verschieben
  const before = (await doc()).comps.find((c) => c.id === cyl.id);
  const cp = await page.evaluate((id) => { const r = document.querySelector(`.comp[data-cid="${id}"] .sym`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, cyl.id);
  await page.mouse.move(cp[0], cp[1]); await page.mouse.down(); await page.mouse.move(cp[0] + 47, cp[1] + 33, { steps: 6 }); await page.mouse.up();
  const after = (await doc()).comps.find((c) => c.id === cyl.id);
  ok(after.x - before.x === 50 && after.y - before.y === 30, `Verschieben mit Rasterung (Δ=${after.x - before.x},${after.y - before.y})`);

  // Eigenschaften ändern
  await page.evaluate((id) => PSapp.ed.select([id]), cyl.id);
  await page.fill('#pp_stroke', '120'); await page.press('#pp_stroke', 'Tab');
  const stroke = await page.evaluate((id) => PSapp.ed.byId(id).p.stroke, cyl.id);
  ok(stroke === 120, 'Zylinderhub im Inspektor geändert');

  console.log('Simulation');
  await page.evaluate(() => PSapp.loadDoc(PS.EXAMPLES[0].build()));
  await page.waitForTimeout(300);
  await page.click('#modeSim');
  await page.evaluate(() => { PSapp.ed.speed = 2; });
  const pos = () => page.evaluate(() => { const c = PSapp.ed.doc.comps.find((c) => c.label === 'A1'); const r = PSapp.ed.sim.rt[c.id]; return r.x / r.L; });
  ok((await pos()) < 0.01, 'Start: Zylinder eingefahren');
  const btn = await page.evaluate(() => { const c = PSapp.ed.doc.comps.find((c) => c.label === 'S1'); const r = document.querySelector(`.comp[data-cid="${c.id}"] .act`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.mouse.move(btn[0], btn[1]); await page.mouse.down();
  await page.waitForTimeout(900);
  ok((await pos()) > 0.95, 'Taster gehalten: Zylinder fährt aus (' + (await pos()).toFixed(2) + ')');
  const col = await page.evaluate(() => { const w = [...document.querySelectorAll('.wire .wline')].filter((l) => l.classList.contains('live')); return w.length; });
  ok(col > 0, 'Leitungen werden druckabhängig eingefärbt (' + col + ')');
  await page.mouse.up();
  await page.waitForTimeout(1200);
  ok((await pos()) < 0.05, 'Taster losgelassen: Zylinder fährt zurück');
  await page.click('#simPlay');
  const t1 = await page.evaluate(() => PSapp.ed.sim.t); await page.waitForTimeout(300); const t2 = await page.evaluate(() => PSapp.ed.sim.t);
  ok(t2 === t1, 'Pause hält die Simulation an');
  await page.click('#simReset');
  ok((await page.evaluate(() => PSapp.ed.sim.t)) === 0, 'Zurücksetzen setzt Zeit auf 0');
  await page.click('#modeEdit');
  ok(!(await page.evaluate(() => document.body.classList.contains('sim'))), 'zurück im Bearbeiten-Modus');


  console.log('Wiring, Clipboard, Dateien');
  await page.evaluate(() => PSapp.loadDoc(PS.EXAMPLES[1].build()));
  await page.waitForTimeout(300);
  const n0 = await page.evaluate(() => ({ c: PSapp.ed.doc.comps.length, w: PSapp.ed.doc.wires.length }));
  // Leitung per Klick wählen und löschen
  const wp = await page.evaluate(() => { const w = PSapp.ed.doc.wires[0]; const pts = w._pts; const i = Math.floor((pts.length - 1) / 2); const a = pts[i], b = pts[i + 1]; const r = PSapp.ed.svg.getBoundingClientRect(), v = PSapp.ed.view; return [r.x + v.x + ((a[0] + b[0]) / 2) * v.k, r.y + v.y + ((a[1] + b[1]) / 2) * v.k]; });
  await page.mouse.click(wp[0], wp[1]);
  ok((await page.evaluate(() => PSapp.ed.sel.size)) === 1, 'Klick wählt Leitung');
  await page.keyboard.press('Delete');
  ok((await page.evaluate(() => PSapp.ed.doc.wires.length)) === n0.w - 1, 'Entf löscht Leitung');
  await page.keyboard.press('Control+z');
  // Kopieren / Einfügen
  await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  const n1 = await page.evaluate(() => ({ c: PSapp.ed.doc.comps.length, w: PSapp.ed.doc.wires.length }));
  ok(n1.c === 2 * n0.c && n1.w === 2 * n0.w, `Kopieren/Einfügen verdoppelt Bauteile und Leitungen (${n1.c}/${n1.w})`);
  await page.keyboard.press('Control+z');
  // SVG-Export
  await page.click('#menuFile summary');
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="svg"]')]);
  const svgText = fs.readFileSync(await dl.path(), 'utf8');
  ok(/^<svg[^>]+viewBox/.test(svgText) && svgText.includes('class="comp') && !svgText.includes('class="port'), 'SVG-Export enthält Schaltplan ohne Bedienelemente (' + dl.suggestedFilename() + ')');
  await page.click('#menuFile summary');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="png"]')]);
  const png = fs.readFileSync(await dl.path());
  ok(png.slice(0, 4).toString('hex') === '89504e47', 'PNG-Export liefert gültiges PNG (' + png.length + ' Bytes)');
  // Speichern → Öffnen
  await page.click('#menuFile summary');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="save"]')]);
  const jsonPath = await dl.path();
  const saved = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  ok(saved.app === 'pneusim' && saved.comps.length === n0.c, 'Speichern erzeugt gültige Datei (' + dl.suggestedFilename() + ')');
  await page.evaluate(() => PSapp.loadDoc(PS.Doc.create('leer')));
  await page.setInputFiles('#fileIn', jsonPath);
  await page.waitForTimeout(300);
  const n2 = await page.evaluate(() => ({ c: PSapp.ed.doc.comps.length, w: PSapp.ed.doc.wires.length }));
  ok(n2.c === n0.c && n2.w === n0.w, 'Öffnen lädt gespeicherten Schaltplan');
  // Neu laden → Autosave
  await page.waitForTimeout(500);
  await page.reload(); await page.waitForTimeout(300);
  const n3 = await page.evaluate(() => PSapp.ed.doc.comps.length);
  ok(n3 === n0.c, 'Autosave stellt Schaltplan nach Neuladen wieder her');

  // Leitungsabschnitt per Griff verschieben
  await page.evaluate(() => PSapp.loadDoc(PS.EXAMPLES[2].build()));
  await page.waitForTimeout(300);
  const seg = await page.evaluate(() => {
    const ed = PSapp.ed;
    for (const w of ed.doc.wires) { if (w._pts && w._pts.length >= 4) { ed.select([w.id]); const h = document.querySelector('.seghandle'); if (h) { const r = h.getBoundingClientRect(); return { id: w.id, x: r.x + r.width / 2, y: r.y + r.height / 2, horiz: h.classList.contains('hh'), n: w._pts.length }; } } }
    return null;
  });
  ok(!!seg, 'gewählte Leitung zeigt Griffe zum Verschieben');
  if (seg) {
    await page.mouse.move(seg.x, seg.y); await page.mouse.down();
    await page.mouse.move(seg.x + (seg.horiz ? 0 : 40), seg.y + (seg.horiz ? 40 : 0), { steps: 6 }); await page.mouse.up();
    const after = await page.evaluate((id) => { const w = PSapp.ed.wireById(id); return { manual: Array.isArray(w.via), n: w._pts.length }; }, seg.id);
    ok(after.manual, 'verschobener Abschnitt wird als manuelle Leitungsführung gespeichert');
  }
  // Ansicht im Sim-Modus mit mittlerer Maustaste verschieben
  await page.click('#modeSim');
  const v0 = await page.evaluate(() => ({ x: PSapp.ed.view.x, y: PSapp.ed.view.y }));
  await page.mouse.move(700, 400); await page.mouse.down({ button: 'middle' }); await page.mouse.move(760, 440, { steps: 4 }); await page.mouse.up({ button: 'middle' });
  await page.mouse.move(500, 300); await page.mouse.move(600, 350);
  const v1 = await page.evaluate(() => ({ x: PSapp.ed.view.x, y: PSapp.ed.view.y }));
  ok(Math.abs(v1.x - v0.x - 60) < 2 && Math.abs(v1.y - v0.y - 40) < 2, `Panning im Simulationsmodus endet beim Loslassen (Δ=${Math.round(v1.x - v0.x)},${Math.round(v1.y - v0.y)})`);
  await page.click('#modeEdit');

  console.log('Geber, Verzweigung, leerer Plan');
  await page.evaluate(() => PSapp.loadDoc(PS.Doc.create('t')));
  await page.locator('.pitem', { hasText: 'Zylinder doppeltwirkend' }).click();
  await page.locator('.pitem', { hasText: '3/2 Rolle (Endlagengeber)' }).click();
  const ids = await page.evaluate(() => ({ cyl: PSapp.ed.doc.comps.find((c) => c.type === 'cylD').id, val: PSapp.ed.doc.comps.find((c) => c.type === 'valve').id }));
  await page.evaluate((id) => PSapp.ed.select([id]), ids.val);
  await page.selectOption('select[data-bc]', ids.cyl);
  await page.click('button[data-pos="100"]');
  const bind = await page.evaluate((id) => PSapp.ed.byId(id).p.bindL, ids.val);
  ok(bind && bind.cyl === ids.cyl && bind.pos === 1, 'Rollenventil dem Zylinder (Position vorn) zugeordnet');
  ok((await page.evaluate(() => document.querySelectorAll('.t-cylD .sensor').length)) === 1, 'Geber-Markierung am Zylinder sichtbar');
  // Verzweigung auswählen per Klick
  await page.locator('.pitem', { hasText: 'Verzweigung' }).click();
  const jc = await page.evaluate(() => PSapp.ed.doc.comps.find((c) => c.type === 'junction').id);
  await page.evaluate(() => PSapp.ed.select([]));
  const jp = await portXY(jc, '1');
  await page.mouse.click(jp[0], jp[1]);
  ok((await page.evaluate(() => [...PSapp.ed.sel][0])) === jc, 'Klick auf Verzweigung wählt sie aus');
  // leerer Plan in der Simulation
  await page.evaluate(() => PSapp.loadDoc(PS.Doc.create('leer')));
  await page.click('#modeSim'); await page.waitForTimeout(300);
  await page.click('#modeEdit');

  ok(errs.length === 0, 'keine Konsolenfehler' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close(); server.close();
  console.log(fails ? `\n${fails} Test(s) fehlgeschlagen` : '\nAlle UI-Tests bestanden');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
