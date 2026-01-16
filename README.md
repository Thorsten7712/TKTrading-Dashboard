# TKTrading Dashboard

Ein **statisches, read-only Trading-Dashboard** zur Exploration von täglich generierten Strategiedaten.
Es hilft dabei, aus einer großen Kandidatenmenge systematisch zu einer **handelbaren Shortlist**
und schließlich zu **konkreten Trades** zu kommen.

👉 Fokus: **Transparenz, Vergleichbarkeit und Disziplin** – nicht Automatisierung oder Execution.

---

## ✨ Features

- **Mehrere Views**
  - Candidates — Active
  - Candidates — Edge
  - Trade Plan
  - Position Plan

- **Qualitätsbewertung pro Symbol**
  - Ampel (Score-basiert)
  - Tooltip mit Score, Trades, meanR, PF

- **Trade Gates (Dropdown)**
  - Off / Conservative / Balanced / Aggressive
  - Blendet schwächere Setups vorab aus

- **Interaktive Tabelle**
  - Sortierbar (Standard: Score absteigend)
  - Textfilter (Symbol / Universe)

- **Downloads**
  - CSV-Snapshots je View
  - Archiv-JSON

- **Statisch & schnell**
  - Keine Backend-Logik
  - Läuft direkt über GitHub Pages oder jeden statischen Webserver

---

## 🧠 Grundidee

Das Dashboard ist **kein Trading-Bot** und keine Garantie-Maschine.

Es unterstützt einen strukturierten Entscheidungsprozess:

```
Setup (Buy/SL/TP/RR)
+ Qualität (Score / Trades / meanR / PF)
+ Machbarkeit (Position Plan)
= informierte Handelsentscheidung
```

Alles ist **explizit sichtbar** – nichts passiert automatisch.

---

## 🗂️ Projektstruktur

```
.
├── index.html
├── help.html
├── assets/
│   ├── app.js
│   └── style.css
└── data/
    ├── manifest.json
    ├── latest.json
    ├── archive/
    │   └── YYYY-MM-DD.json
    └── csv/
        ├── candidates_active.csv
        ├── candidates_edge.csv
        ├── trade_plan.csv
        └── position_plan.csv
```

---

## 🚦 Ampel (Score)

| Farbe | Score |
|------|-------|
| Rot | < 0.5 |
| Gelb | 0.5 – 1.5 |
| Grün | 1.5 – 3.0 |
| Sehr Grün | ≥ 3.0 |

Tooltip zeigt Score, Trades, meanR, PF.

---

## 🎚️ Trade Gates

Trade Gates filtern vor der Anzeige:

- **Off** – alles anzeigen  
- **Conservative** – hohe Mindestqualität  
- **Balanced** – Mittelweg  
- **Aggressive** – größere Auswahl

---

## 🧭 Workflow

1. Trade Gate setzen
2. Trade Plan prüfen
3. Qualität über Ampel + Tooltip bewerten
4. Setup (RR, SL) prüfen
5. Position Plan auf Machbarkeit prüfen
6. Fallback auf Candidates Active / Edge

---

## ⚠️ Hinweise

- Wenige Trades = geringe statistische Stabilität
- PF ≤ 1 oder meanR ≤ 0 → Vorsicht
- Risk$ ist wichtiger als Score

---

## 📖 Handbuch

Über **?** im Dashboard erreichbar (`help.html`).

---

Quelle: `static data/` im Dashboard Repo
