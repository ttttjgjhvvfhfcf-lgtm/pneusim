# PneuSim – Pneumatik-Simulator im Browser

Eine FluidSim-artige Web-App zum **Zeichnen und Simulieren pneumatischer Schaltungen** nach ISO 1219.
Reine statische Seite (HTML/CSS/JavaScript, keine Abhängigkeiten, kein Build-Schritt).

```bash
npm start            # oder: python3 -m http.server 8080
# → http://localhost:8080
```

`index.html` lässt sich auch direkt per Doppelklick öffnen (`file://`).
Für eine einzelne HTML-Datei (CSS und JS inline): `node scripts/bundle.js` → `dist/pneusim.html`.

## Funktionen

**Editor**
- Bauteilbibliothek mit ISO-Symbolen: Druckluftquelle, Wartungseinheit, Behälter, Verzweigung, Entlüftung (mit/ohne Schalldämpfer), einfach-/doppeltwirkende Zylinder,
  2/2-, 3/2-, 4/2-, 5/2- und 5/3-Wegeventile (Mittelstellung gesperrt/entlüftet/belüftet), Rückschlag-, Drossel-, Drossel-Rückschlag-, Schnellentlüftungs-, Wechsel- (ODER) und Zweidruckventil (UND),
  Druckregel-, Druckbegrenzungs- und Druckfolgeventil, Zeitverzögerungsventil, Manometer, Beschriftung
- Betätigungen frei kombinierbar: Taster, Handhebel (rastend), Pedal, Rolle, Rollenhebel mit Leerrücklauf, Elektromagnet, pneumatisch (Steuerdruck), Feder
- Rollen-/Endlagengeber werden einem Zylinder und einer Hubposition zugeordnet; Markierungen erscheinen am Zylinder
- Drag & Drop, Rasterung, Drehen/Spiegeln, Mehrfachauswahl, Kopieren/Einfügen/Duplizieren, Undo/Redo (Strg+Z / Strg+Y)
- Leitungen: Anschluss ziehen → automatische orthogonale Verlegung (A\*), Knickpunkte durch Klicken, Verzweigung durch Ziehen auf eine Leitung, Abschnitte per Griff verschieben
- Speichern/Öffnen (JSON), Autosave im Browser, Export als SVG und PNG, hell/dunkel

**Simulation**
- Druckaufbau in jedem Leitungsnetz, Strömung durch Ventile, Zylinderbewegung mit Masse, Reibung, Last, Federrückstellung und Endlagendämpfung
- Leitungen färben sich nach Druck, animierte Strömungsrichtung, Schaltstellung der Ventile hervorgehoben, Druckwerte beim Überfahren
- Taster halten, Hebel/Magnete rasten (`Umschalt`+Klick rastet auch Taster ein), Tempo 0,1×–2×, Pause, Einzelschritt, Reset
- Weg-Zeit-Diagramm (Zylinderwege und Manometer), Hubzeitmessung, Live-Verstellen von Betriebsdruck, Drosselöffnung, Last, Verzögerungszeit u. a.

**Beispiele** (Menü „Beispiele“): direkte/indirekte Ansteuerung, Abluftdrosselung, Schnellentlüftung, ODER/UND, automatischer Rücklauf,
Dauerlauf, Zeitverzögerung, Druckfolgeventil und eine Kaskadensteuerung **A+ B+ B− A−**.

## Bedienung

| Aktion | Bedienung |
| --- | --- |
| Bauteil einfügen | aus der Bibliothek ziehen oder anklicken |
| Leitung ziehen | roten Anschlusskreis ziehen; auf freier Fläche loslassen = Knickpunkt; auf Leitung loslassen = Verzweigung |
| Drehen / Spiegeln | `R` / `M` |
| Löschen / Kopieren / Einfügen / Duplizieren | `Entf` / `Strg+C` / `Strg+V` / `Strg+D` |
| Ansicht | Mausrad zoomt, mittlere/rechte Maustaste oder `Leertaste`+Ziehen verschiebt, `0` zeigt alles |
| Simulation Pause | `Leertaste` |

Nicht beschaltete Abluftanschlüsse (3, 5) von Ventilen entlüften automatisch ins Freie (offenes Dreieck); verbindet man sie mit einer Leitung, wird dort gedrosselt oder
über ein Schnellentlüftungsventil abgeführt.

## Aufbau

```
index.html          Seitengerüst
css/app.css         Oberfläche (hell/dunkel) und Symbolstile
js/util.js          Geometrie, Farben, SVG-Helfer
js/valves.js        Wegeventile: Symbolgeometrie, Betätigungen, Schaltlogik
js/parts.js         übrige Bauteile (Symbole, Anschlüsse, Verhalten) und Palette
js/engine.js        Simulation: Netze → Druckknoten, Durchflussmodell, Zeitintegration
js/doc.js           Dokumentmodell, (De-)Serialisierung
js/router.js        Leitungsverlegung (A*)
js/editor.js        SVG-Editor und Simulationsdarstellung
js/ui.js            Palette, Inspektor, Weg-Zeit-Diagramm
js/app.js           Verdrahtung, Datei-Funktionen, Export
js/examples.js      Beispielschaltungen
scripts/bundle.js   Bündelt alles zu einer einzelnen HTML-Datei
tests/              automatisierte Tests
```

### Simulationsmodell

Jedes durch Leitungen verbundene Netz ist ein isothermes Druckvolumen *V*. Zwischen den Knoten liegen Strömungselemente:

- Blenden nach **ISO 6358** (kritisches Druckverhältnis *b* = 0,3, im Auslauf linearisiert) mit Nenndurchfluss als Parameter
- Rückschlagventile mit Öffnungsdruck, Druckregler als geregelte Blende, Wechsel-/Zweidruckventil als Druckvergleich
- Wegeventile: Schaltstellung relaxiert in ca. 15 ms; Betätigung durch Hand, Geber (Hubposition des Zylinders) oder Steuerdruck mit Hysterese
- Zylinder: Knoten mit veränderlichem Volumen, `m·a = Σ F` (Druckkraft, Feder, Reibung, Last, Dämpfung, Endanschläge)

Pro Knoten gilt `V·dp/dt = p0·Q − p·dV/dt`; die Schrittweite wird adaptiv aus der Steifigkeit der Knoten bestimmt.
Die Parameter sind plausibel gewählt, ersetzen aber keine Auslegungsrechnung.

## Tests

```bash
npm test             # Simulation headless (Node, ohne Abhängigkeiten): alle Beispiele inkl. Kaskade
npm i && npm run test:ui   # Mausbedienung im Browser (Playwright/Chromium)
```
