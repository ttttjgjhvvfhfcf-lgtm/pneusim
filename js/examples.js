/* PneuSim – Beispielschaltungen */
(function () {
  const PS = globalThis.PS;
  const CYL = { rot: 2, flip: true }; // Zylinder mit Anschlüssen nach unten, Kolbenstange nach rechts

  function builder(doc) {
    const E = {
      doc,
      /* Bauteil so setzen, dass sein Anschluss `port` auf (x,y) liegt */
      at(type, port, x, y, o) {
        o = o || {};
        const c = PS.Doc.addComp(doc, type, 0, 0, o.p, o);
        const pt = PS.worldPorts(c).find((p) => p.id === port);
        c.x = x - pt.x; c.y = y - pt.y;
        return c;
      },
      add(type, x, y, o) { o = o || {}; return PS.Doc.addComp(doc, type, x, y, o.p, o); },
      w(a, pa, b, pb, via) { return PS.Doc.addWire(doc, { c: a.id, p: pa }, { c: b.id, p: pb }, via || null); },
      note(text, x, y, size) { return PS.Doc.addComp(doc, 'note', x, y, { text, size: size || 13 }); },
      bind(valve, side, cyl, pos, dir) { valve.p['bind' + side] = Object.assign({ cyl: cyl.id, pos }, dir ? { dir } : {}); },
      J(x, y) { return PS.Doc.addComp(doc, 'junction', x, y); },
    };
    return E;
  }
  const V32 = (left, extra) => Object.assign({ kind: '3/2', nc: true, left, right: 'spring' }, extra || {});

  const EX = [];
  function ex(name, desc, fn) {
    EX.push({ name, desc, build() { const d = PS.Doc.create(name); fn(builder(d), d); return d; } });
  }

  /* 1 ------------------------------------------------------------------- */
  ex('1 · Einfachwirkender Zylinder, direkt', 'Taster S1 gedrückt halten: Zylinder fährt aus, beim Loslassen schiebt die Feder ihn zurück.', (E) => {
    const A = E.at('cylS', 'A', 210, 100, Object.assign({ label: 'A1' }, CYL));
    const S = E.at('valve', '2', 210, 180, { p: V32('push'), label: 'S1' });
    const W = E.at('wu', 'out', 210, 280, { label: 'WE' });
    const Q = E.at('src', '1', 210, 380, { label: 'Q' });
    E.w(S, '2', A, 'A'); E.w(S, '1', W, 'out'); E.w(W, 'in', Q, '1');
    E.note('Direkte Ansteuerung', 60, 40, 16);
    E.note('S1 drücken → A1 fährt aus', 280, 300);
  });

  /* 2 ------------------------------------------------------------------- */
  ex('2 · Doppeltwirkender Zylinder, 5/2-Handhebel', 'Der rastende Hebel V1 schaltet zwischen Ausfahren und Einfahren um.', (E) => {
    const A = E.at('cylD', 'A', 170, 100, Object.assign({ label: 'A1' }, CYL));
    const V = E.at('valve', '4', 170, 180, { p: { kind: '5/2', left: 'lever', right: 'none' }, label: 'V1' });
    const W = E.at('wu', 'out', 180, 280, { label: 'WE' });
    const Q = E.at('src', '1', 180, 380, { label: 'Q' });
    E.w(V, '4', A, 'A'); E.w(V, '2', A, 'B'); E.w(V, '1', W, 'out'); E.w(W, 'in', Q, '1');
    E.note('Direkte Ansteuerung, doppeltwirkend', 60, 40, 16);
    E.note('Hebel V1 anklicken → umschalten', 330, 280);
  });

  /* 3 ------------------------------------------------------------------- */
  ex('3 · Indirekte Ansteuerung', 'Der kleine Taster S1 steuert das pneumatische 5/2-Ventil V1, das den Zylinder mit großem Volumenstrom versorgt.', (E) => {
    const A = E.at('cylD', 'A', 270, 100, Object.assign({ label: 'A1' }, CYL));
    const V = E.at('valve', '4', 270, 190, { p: { kind: '5/2', left: 'pilot', right: 'spring' }, label: 'V1' });
    const S = E.at('valve', '2', 100, 290, { p: V32('push'), label: 'S1' });
    const J1 = E.J(100, 390), J2 = E.J(280, 390), Jm = E.J(190, 390);
    const W = E.at('wu', 'out', 190, 440, { label: 'WE' });
    const Q = E.at('src', '1', 190, 540, { label: 'Q' });
    E.w(V, '4', A, 'A'); E.w(V, '2', A, 'B'); E.w(S, '2', V, 'pL');
    E.w(S, '1', J1, '1'); E.w(V, '1', J2, '1'); E.w(J1, '1', Jm, '1'); E.w(Jm, '1', J2, '1');
    E.w(W, 'out', Jm, '1'); E.w(W, 'in', Q, '1');
    E.note('Indirekte Ansteuerung', 40, 40, 16);
  });

  /* 4 ------------------------------------------------------------------- */
  ex('4 · Geschwindigkeitsregelung (Abluftdrosselung)', 'Zwei Drossel-Rückschlagventile drosseln die Abluft: DR2 bremst das Ausfahren, DR1 das Einfahren. Drossel live verstellen!', (E) => {
    const A = E.at('cylD', 'A', 170, 100, Object.assign({ label: 'A1' }, CYL));
    const D1 = E.at('grv', 'b', 170, 160, { rot: 3, p: { open: 20 }, label: 'DR1' });
    const D2 = E.at('grv', 'b', 270, 160, { rot: 3, p: { open: 35 }, label: 'DR2' });
    const V = E.at('valve', '4', 170, 300, { p: { kind: '5/2', left: 'lever', right: 'none' }, label: 'V1' });
    const W = E.at('wu', 'out', 180, 420, { label: 'WE' });
    const Q = E.at('src', '1', 180, 520, { label: 'Q' });
    E.w(D1, 'b', A, 'A'); E.w(D2, 'b', A, 'B'); E.w(V, '4', D1, 'a'); E.w(V, '2', D2, 'a');
    E.w(V, '1', W, 'out'); E.w(W, 'in', Q, '1');
    E.note('Abluftdrosselung', 40, 40, 16);
    E.note('Freier Zulauf, gedrosselte Abluft', 320, 190);
  });

  /* 5 ------------------------------------------------------------------- */
  ex('5 · Schnellentlüftung', 'Das Schnellentlüftungsventil SE1 lässt die Abluft des einfachwirkenden Zylinders direkt ins Freie – der Rückhub wird deutlich schneller.', (E) => {
    const A = E.at('cylS', 'A', 210, 100, Object.assign({ label: 'A1', p: { d: 50, stroke: 150, spring0: 25, springK: 0.2 } }, CYL));
    const QE = E.at('qe', '2', 210, 160, { rot: 3, label: 'SE1' });
    const S = E.at('valve', '2', 210, 270, { p: V32('lever'), label: 'S1' });
    const W = E.at('wu', 'out', 210, 370, { label: 'WE' });
    const Q = E.at('src', '1', 210, 470, { label: 'Q' });
    E.w(A, 'A', QE, '2'); E.w(QE, '1', S, '2'); E.w(S, '1', W, 'out'); E.w(W, 'in', Q, '1');
    E.note('Schnellentlüftung', 60, 40, 16);
    E.note('Tipp: Hubzeit im Reiter Bedienung beobachten', 300, 290, 12);
  });

  /* 6 / 7 --------------------------------------------------------------- */
  function logicExample(type, name, desc, title, hint) {
    ex(name, desc, (E) => {
      const A = E.at('cylD', 'A', 330, 100, Object.assign({ label: 'A1' }, CYL));
      const V = E.at('valve', '4', 330, 200, { p: { kind: '5/2', left: 'pilot', right: 'spring' }, label: 'V1' });
      const L = E.at(type, 'y', 170, 260, { rot: 3, label: type === 'or' ? 'W1' : 'U1' });
      const S1 = E.at('valve', '2', 50, 380, { p: V32('push'), label: 'S1' });
      const S2 = E.at('valve', '2', 200, 380, { p: V32('push'), label: 'S2' });
      const J1 = E.J(50, 470), J2 = E.J(200, 470), J3 = E.J(340, 470), Jm = E.J(120, 470);
      const W = E.at('wu', 'out', 120, 520, { label: 'WE' });
      const Q = E.at('src', '1', 120, 620, { label: 'Q' });
      E.w(V, '4', A, 'A'); E.w(V, '2', A, 'B'); E.w(L, 'y', V, 'pL');
      E.w(S1, '2', L, 'a'); E.w(S2, '2', L, 'b');
      E.w(S1, '1', J1, '1'); E.w(S2, '1', J2, '1'); E.w(V, '1', J3, '1');
      E.w(J1, '1', Jm, '1'); E.w(Jm, '1', J2, '1'); E.w(J2, '1', J3, '1');
      E.w(W, 'out', Jm, '1'); E.w(W, 'in', Q, '1');
      E.note(title, 40, 40, 16);
      E.note(hint, 390, 380, 13);
    });
  }
  logicExample('or', '6 · ODER-Verknüpfung (Wechselventil)', 'A1 fährt aus, wenn S1 ODER S2 betätigt wird.', 'ODER-Schaltung', 'S1 oder S2 drücken → A1 fährt aus');
  logicExample('and', '7 · UND-Verknüpfung (Zweidruckventil)', 'A1 fährt nur aus, wenn S1 UND S2 gleichzeitig betätigt werden (Zweihandsicherung).', 'UND-Schaltung', 'S1 und S2 gleichzeitig drücken');

  /* 8 ------------------------------------------------------------------- */
  ex('8 · Automatischer Rücklauf', 'Start mit S1. Am Hubende betätigt der Rollenhebel S2 das Impulsventil V1 – der Zylinder fährt selbsttätig zurück.', (E) => {
    const A = E.at('cylD', 'A', 330, 100, Object.assign({ label: 'A1' }, CYL));
    const V = E.at('valve', '4', 330, 200, { p: { kind: '5/2', left: 'pilot', right: 'pilot' }, label: 'V1' });
    const S1 = E.at('valve', '2', 170, 300, { p: V32('push'), label: 'S1' });
    const S2 = E.at('valve', '2', 450, 300, { p: V32('roller'), label: 'S2' });
    E.bind(S2, 'L', A, 1);
    const J1 = E.J(170, 420), J2 = E.J(340, 420), J3 = E.J(450, 420);
    const W = E.at('wu', 'out', 340, 500, { label: 'WE' });
    const Q = E.at('src', '1', 340, 600, { label: 'Q' });
    E.w(V, '4', A, 'A'); E.w(V, '2', A, 'B'); E.w(S1, '2', V, 'pL'); E.w(S2, '2', V, 'pR');
    E.w(S1, '1', J1, '1'); E.w(V, '1', J2, '1'); E.w(S2, '1', J3, '1');
    E.w(J1, '1', J2, '1'); E.w(J2, '1', J3, '1'); E.w(W, 'out', J2, '1'); E.w(W, 'in', Q, '1');
    E.note('Automatischer Rücklauf', 40, 40, 16);
    E.note('S1 kurz drücken → Rücklauf automatisch', 40, 62, 12);
  });

  /* 9 ------------------------------------------------------------------- */
  ex('9 · Dauerlauf (Pendelbewegung)', 'Mit dem Hebelventil S0 einschalten: Der Zylinder pendelt, gesteuert durch die Endlagengeber S1 (hinten) und S2 (vorn).', (E) => {
    const A = E.at('cylD', 'A', 330, 100, Object.assign({ label: 'A1' }, CYL));
    const V = E.at('valve', '4', 330, 200, { p: { kind: '5/2', left: 'pilot', right: 'pilot' }, label: 'V1' });
    const S1 = E.at('valve', '2', 170, 300, { p: V32('roller'), label: 'S1' });
    const S2 = E.at('valve', '2', 450, 300, { p: V32('roller'), label: 'S2' });
    const S0 = E.at('valve', '2', 170, 410, { p: V32('lever'), label: 'S0' });
    E.bind(S1, 'L', A, 0); E.bind(S2, 'L', A, 1);
    const J1 = E.J(170, 520), J2 = E.J(340, 520), J3 = E.J(450, 520);
    const W = E.at('wu', 'out', 340, 600, { label: 'WE' });
    const Q = E.at('src', '1', 340, 700, { label: 'Q' });
    E.w(V, '4', A, 'A'); E.w(V, '2', A, 'B'); E.w(S1, '2', V, 'pL'); E.w(S2, '2', V, 'pR');
    E.w(S0, '2', S1, '1'); E.w(S0, '1', J1, '1'); E.w(V, '1', J2, '1'); E.w(S2, '1', J3, '1');
    E.w(J1, '1', J2, '1'); E.w(J2, '1', J3, '1'); E.w(W, 'out', J2, '1'); E.w(W, 'in', Q, '1');
    E.note('Dauerlauf / Pendelbewegung', 40, 40, 16);
    E.note('S0 anklicken (rastet) → Dauerlauf', 40, 62, 12);
  });

  /* 10 ------------------------------------------------------------------ */
  ex('10 · Zeitverzögerung (Verweilzeit)', 'S1 startet. Am vorderen Hubende läuft die Verzögerungszeit des Zeitventils ZV1 (3 s), danach fährt der Zylinder zurück.', (E) => {
    const A = E.at('cylD', 'A', 330, 100, Object.assign({ label: 'A1' }, CYL));
    const V = E.at('valve', '4', 330, 200, { p: { kind: '5/2', left: 'pilot', right: 'pilot' }, label: 'V1' });
    const S1 = E.at('valve', '2', 170, 300, { p: V32('push'), label: 'S1' });
    const S2 = E.at('valve', '2', 430, 380, { p: V32('roller'), label: 'S2' });
    const Z = E.at('timer', '2', 640, 300, { p: { delay: 3 }, label: 'ZV1' });
    E.bind(S2, 'L', A, 1);
    const J1 = E.J(170, 520), J2 = E.J(340, 520), J3 = E.J(440, 520), J4 = E.J(650, 520);
    const W = E.at('wu', 'out', 340, 600, { label: 'WE' });
    const Q = E.at('src', '1', 340, 700, { label: 'Q' });
    E.w(V, '4', A, 'A'); E.w(V, '2', A, 'B'); E.w(S1, '2', V, 'pL'); E.w(S2, '2', Z, 'pL'); E.w(Z, '2', V, 'pR');
    E.w(S1, '1', J1, '1'); E.w(V, '1', J2, '1'); E.w(S2, '1', J3, '1'); E.w(Z, '1', J4, '1');
    E.w(J1, '1', J2, '1'); E.w(J2, '1', J3, '1'); E.w(J3, '1', J4, '1'); E.w(W, 'out', J2, '1'); E.w(W, 'in', Q, '1');
    E.note('Zeitverzögerter Rücklauf', 40, 40, 16);
    E.note('S1 kurz drücken · Zeit live änderbar', 40, 62, 12);
  });

  /* 11 ------------------------------------------------------------------ */
  ex('11 · Druckabhängiger Rückhub (Druckfolgeventil)', 'Der Zylinder presst gegen eine Last (Zuluftdrosselung). Steigt der Druck im Kolbenraum über 5 bar, schaltet das Druckfolgeventil DF1 den Rückhub ein.', (E) => {
    const A = E.at('cylD', 'A', 330, 100, Object.assign({ label: 'A1', p: { d: 40, rod: 16, stroke: 150, load: 450 } }, CYL));
    const Jp = E.J(330, 130);
    const D1 = E.at('grv', 'a', 330, 150, { rot: 1, p: { open: 35 }, label: 'DR1' });
    const V = E.at('valve', '4', 330, 260, { p: { kind: '5/2', left: 'pilot', right: 'pilot' }, label: 'V1' });
    const S1 = E.at('valve', '2', 170, 360, { p: V32('push'), label: 'S1' });
    const DF = E.at('valve', '2', 470, 360, { p: V32('pilot', { pilotP: 5 }), label: 'DF1' });
    const M = E.at('gauge', '1', 560, 100, { label: 'M1', p: { max: 10 } });
    const J1 = E.J(170, 500), J2 = E.J(340, 500), J3 = E.J(480, 500);
    const W = E.at('wu', 'out', 340, 580, { label: 'WE' });
    const Q = E.at('src', '1', 340, 680, { label: 'Q' });
    E.w(A, 'A', Jp, '1'); E.w(Jp, '1', D1, 'a'); E.w(D1, 'b', V, '4'); E.w(V, '2', A, 'B');
    E.w(Jp, '1', DF, 'pL'); E.w(DF, '2', V, 'pR'); E.w(S1, '2', V, 'pL');
    E.w(S1, '1', J1, '1'); E.w(V, '1', J2, '1'); E.w(DF, '1', J3, '1');
    E.w(J1, '1', J2, '1'); E.w(J2, '1', J3, '1'); E.w(W, 'out', J2, '1'); E.w(W, 'in', Q, '1');
    E.w(M, '1', Jp, '1');
    E.note('Druckabhängige Steuerung', 40, 40, 16);
    E.note('S1 kurz drücken · Ansprechdruck einstellbar', 40, 62, 12);
  });

  /* 12 ------------------------------------------------------------------ */
  ex('12 · Folgesteuerung A+ B+ B− A− (Kaskade)', 'Zwei Zylinder fahren nach dem Ablauf A+ B+ B− A− mit zwei Gruppen (L1/L2) und Speicherventil M. Start mit S0.', (E) => {
    const A = E.at('cylD', 'A', 140, 100, Object.assign({ label: 'A1', p: { stroke: 150 } }, CYL));
    const B = E.at('cylD', 'A', 640, 100, Object.assign({ label: 'B1', p: { stroke: 150 } }, CYL));
    const VA = E.at('valve', '4', 140, 200, { p: { kind: '5/2', left: 'pilot', right: 'pilot' }, label: 'V1' });
    const VB = E.at('valve', '4', 640, 200, { p: { kind: '5/2', left: 'pilot', right: 'pilot' }, label: 'V2' });
    const M = E.at('valve', '4', 390, 640, { p: { kind: '5/2', left: 'pilot', right: 'pilot', init: 'L' }, label: 'M' });
    const S0 = E.at('valve', '2', 50, 340, { p: V32('push'), label: 'S0' });
    const a0 = E.at('valve', '2', 250, 340, { p: V32('roller'), label: 'a0' });
    const b0 = E.at('valve', '2', 410, 340, { p: V32('roller'), label: 'b0' });
    const a1 = E.at('valve', '2', 560, 340, { p: V32('roller'), label: 'a1' });
    const b1 = E.at('valve', '2', 750, 340, { p: V32('roller'), label: 'b1' });
    E.bind(a0, 'L', A, 0); E.bind(a1, 'L', A, 1); E.bind(b0, 'L', B, 0); E.bind(b1, 'L', B, 1);
    const W = E.at('wu', 'out', 400, 790, { label: 'WE' });
    const Q = E.at('src', '1', 400, 890, { label: 'Q' });
    E.w(VA, '4', A, 'A'); E.w(VA, '2', A, 'B'); E.w(VB, '4', B, 'A'); E.w(VB, '2', B, 'B');
    E.w(S0, '2', VA, 'pL');       // A+
    E.w(a1, '2', VB, 'pL');       // B+
    E.w(b1, '2', M, 'pR');        // Gruppenwechsel L1 → L2
    E.w(b0, '2', VA, 'pR');       // A−
    E.w(a0, '2', M, 'pL');        // Gruppenwechsel L2 → L1
    /* Druckluftversorgung (unten) */
    const ys = 730;
    const js1 = E.J(150, ys), jsm = E.J(400, ys), js2 = E.J(650, ys);
    E.w(W, 'in', Q, '1'); E.w(W, 'out', jsm, '1'); E.w(M, '1', jsm, '1');
    E.w(jsm, '1', js1, '1'); E.w(jsm, '1', js2, '1'); E.w(VA, '1', js1, '1'); E.w(VB, '1', js2, '1');
    /* Gruppenleitungen: L1 = M.4, L2 = M.2 */
    const r1 = 520, r2 = 570;
    const j1a = E.J(50, r1), jm1 = E.J(390, r1), j1b = E.J(560, r1), j1c = E.J(750, r1);
    const j2a = E.J(250, r2), jm2 = E.J(410, r2), j2c = E.J(860, r2);
    E.w(M, '4', jm1, '1'); E.w(jm1, '1', j1a, '1'); E.w(jm1, '1', j1b, '1'); E.w(j1b, '1', j1c, '1');
    E.w(j1a, '1', S0, '1'); E.w(j1b, '1', a1, '1'); E.w(j1c, '1', b1, '1');
    E.w(M, '2', jm2, '1'); E.w(jm2, '1', j2a, '1'); E.w(jm2, '1', j2c, '1');
    E.w(j2a, '1', a0, '1'); E.w(jm2, '1', b0, '1'); E.w(j2c, '1', VB, 'pR');
    E.note('Kaskadensteuerung A+ B+ B− A−', 40, 26, 16);
    E.note('Start: S0 drücken', 40, 46, 12);
  });

  PS.EXAMPLES = EX;
})();
