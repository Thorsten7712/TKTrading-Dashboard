// assets/app.js

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function loadText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function fmt(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  if (typeof x === "number") return x.toFixed(digits);
  const n = Number(x);
  if (!Number.isNaN(n) && String(x).trim() !== "") return n.toFixed(digits);
  return String(x);
}

function linkButton(href, label) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = label;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function stripBOM(s) {
  return s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function splitCSVLine(line) {
  const res = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      inQ = true;
      continue;
    }
    if (c === ",") {
      res.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  res.push(cur);
  return res;
}

function parseCSV(text) {
  const lines = stripBOM(text).replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map(h => h.trim());

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    if (!parts.length) continue;

    const obj = {};
    for (let j = 0; j < header.length; j++) {
      const key = header[j];
      if (!key) continue;

      const raw = (parts[j] ?? "").trim();
      if (raw === "") {
        obj[key] = null;
        continue;
      }

      const n = Number(raw);
      obj[key] = (!Number.isNaN(n) && /^[+-]?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) ? n : raw;
    }
    out.push(obj);
  }
  return out;
}

function applyFilter(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r =>
    String(r.symbol || "").toLowerCase().includes(s) ||
    String(r.universe || "").toLowerCase().includes(s)
  );
}

function buildEventsCell(_overlay) {
  // Overlay kommt später; aktuell keine Daten -> "-"
  return "–";
}

function rowToTr(r) {
  const tr = document.createElement("tr");

  const hold =
    (r.hold_days_min && r.hold_days_max)
      ? `${r.hold_days_min}-${r.hold_days_max}d`
      : (r.time_stop_bars ? String(r.time_stop_bars) : "–");

  const cells = [
    r.universe,
    r.symbol,
    fmt(r.buy),
    fmt(r.sl),
    fmt(r.tp),
    fmt(r.rr, 2),
    hold,
    r.shares ?? "–",
    fmt(r.risk_usd, 2),
    fmt(r.fee_usd, 2),
    r.stats?.trades ?? "–",
    fmt(r.stats?.score, 3),
    fmt(r.stats?.mean_R, 3),
    fmt(r.stats?.pf, 2),
    buildEventsCell(null),
  ];

  cells.forEach((c) => {
    const td = document.createElement("td");
    td.textContent = (c === null || c === undefined || c === "") ? "–" : String(c);
    tr.appendChild(td);
  });

  return tr;
}

async function buildStatsLookup({ rankingsDir, universes, trendSuffix }) {
  const map = new Map();
  const missing = [];
  const loaded = [];

  for (const u of universes) {
    const url = `${rankingsDir}/ranking_${u}_${trendSuffix}_score.csv`;
    try {
      const txt = await loadText(url);
      const rows = parseCSV(txt);

      let cnt = 0;
      for (const r of rows) {
        const sym = String(r.symbol || "").trim();
        if (!sym) continue;

        map.set(`${u}__${sym}`, {
          trades: r.trades ?? null,
          score: r.score ?? null,
          mean_R: r.mean_R ?? null,
          pf: r.profit_factor ?? null,
        });
        cnt++;
      }
      loaded.push(`${u}:${cnt}`);
    } catch (e) {
      missing.push(`${u} (${e.message})`);
    }
  }

  return { map, missing, loaded };
}

function enrichWithStats(rows, statsMap) {
  return rows.map(r => {
    const u = String(r.universe || "").trim();
    const sym = String(r.symbol || "").trim();
    const stats = statsMap.get(`${u}__${sym}`) || null;
    return { ...r, stats };
  });
}

async function loadRowsFromCSV(csvUrl) {
  const txt = await loadText(csvUrl);
  return parseCSV(txt);
}

async function main() {
  const metaEl = document.getElementById("meta");
  const linksEl = document.getElementById("links");
  const tblBody = document.querySelector("#tbl tbody");
  const strategySelect = document.getElementById("strategySelect");
  const viewSelect = document.getElementById("viewSelect");
  const search = document.getElementById("search");
  const title = document.getElementById("tableTitle");
  const hint = document.getElementById("hint");

  let manifest;
  try {
    manifest = await loadJSON("data/manifest.json");
  } catch (e) {
    metaEl.textContent = `Manifest nicht ladbar: ${e.message}`;
    return;
  }

  const strategies = manifest?.strategies || [];
  if (!strategies.length) {
    metaEl.textContent = "Keine Strategien in data/manifest.json definiert.";
    return;
  }

  for (const s of strategies) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name || s.id;
    opt.dataset.path = s.path;
    strategySelect.appendChild(opt);
  }

  let latest = null;
  let rowsActive = [];
  let rowsEdge = [];
  let rowsTrade = [];
  let rowsPos = [];

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const latestPath = sel?.dataset?.path;
    if (!latestPath) return;

    metaEl.textContent = "Lade …";
    linksEl.innerHTML = "";
    tblBody.innerHTML = "";
    rowsActive = [];
    rowsEdge = [];
    rowsTrade = [];
    rowsPos = [];
    latest = null;

    try {
      latest = await loadJSON(latestPath);
    } catch (e) {
      metaEl.textContent = `latest.json nicht ladbar (${latestPath}): ${e.message}`;
      return;
    }

    const strategyId = latest.strategy || sel.value;
    const trendSuffix = latest.trend_suffix || "trend_off";
    const asof = latest.asof || "–";
    const generated = latest.generated || "–";

    const csv = latest.paths?.csv || {};
    const rankingsDir = latest.paths?.rankings_dir || `data/${strategyId}/rankings`;

    // Links
    const linkItems = [
      ["Candidates Active (CSV)", csv.candidates_active],
      ["Candidates Edge (CSV)", csv.candidates_edge],
      ["Trade Plan (CSV)", csv.trade_plan],
      ["Position Plan (CSV)", csv.position_plan],
      ["Archive (JSON)", latest.paths?.archive],
    ].filter(([, href]) => !!href);

    linkItems.forEach(([label, href]) => linksEl.appendChild(linkButton(href, label)));

    // Load CSV rows (do NOT depend on archive JSON)
    try {
      if (csv.candidates_active) rowsActive = await loadRowsFromCSV(csv.candidates_active);
      if (csv.candidates_edge) rowsEdge = await loadRowsFromCSV(csv.candidates_edge);
      if (csv.trade_plan) rowsTrade = await loadRowsFromCSV(csv.trade_plan);
      if (csv.position_plan) rowsPos = await loadRowsFromCSV(csv.position_plan);
    } catch (e) {
      metaEl.textContent = `CSV nicht ladbar: ${e.message}`;
      return;
    }

    // Universes present
    const universes = Array.from(
      new Set([...rowsActive, ...rowsEdge, ...rowsTrade, ...rowsPos].map(r => String(r.universe || "").trim()).filter(Boolean))
    ).sort();

    // Rankings
    const { map: statsMap, missing, loaded } = await buildStatsLookup({
      rankingsDir,
      universes,
      trendSuffix,
    });

    rowsActive = enrichWithStats(rowsActive, statsMap);
    rowsEdge = enrichWithStats(rowsEdge, statsMap);
    rowsTrade = enrichWithStats(rowsTrade, statsMap);
    rowsPos = enrichWithStats(rowsPos, statsMap);

    const dbg = [];
    dbg.push(`rankings_dir: ${rankingsDir}`);
    dbg.push(`rankings loaded: ${statsMap.size}`);
    if (loaded.length) dbg.push(`files: ${loaded.join(", ")}`);
    if (missing.length) dbg.push(`missing: ${missing.join(" | ")}`);

    metaEl.textContent = `asof: ${asof} • strategy: ${strategyId} • generated: ${generated} • ${dbg.join(" • ")}`;

    render();
  }

  function getRowsForView(view) {
    if (view === "edge") return rowsEdge;
    if (view === "trade") return rowsTrade;
    if (view === "pos") return rowsPos;
    return rowsActive;
  }

  function render() {
    const view = viewSelect.value; // active|edge
    const rows = getRowsForView(view);
    const filtered = applyFilter(rows, search.value);

    const stratName = (strategySelect.selectedOptions[0]?.textContent || "").trim();
    title.textContent = `${stratName} — ${view === "edge" ? "Edge" : "Active"}`;
    hint.textContent = `Anzahl: ${filtered.length} (von ${rows.length})`;

    tblBody.innerHTML = "";
    filtered.forEach(r => tblBody.appendChild(rowToTr(r)));
  }

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
