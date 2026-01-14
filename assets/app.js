// assets/app.js

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

// --- formatting ---
function fmt(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  if (typeof x === "number") return x.toFixed(digits);
  const n = Number(x);
  if (!Number.isNaN(n) && String(x).trim() !== "") return n.toFixed(digits);
  return String(x);
}

function riskBadge(flag) {
  const span = document.createElement("span");
  span.className = "badge " + (flag || "");
  span.textContent = flag ? String(flag).toUpperCase() : "–";
  return span;
}

function buildEventsCell(overlay) {
  const parts = [];
  if (overlay?.risk_flag) parts.push(`[${overlay.risk_flag}]`);
  if (Array.isArray(overlay?.events) && overlay.events.length) parts.push(overlay.events.join(" • "));
  if (Array.isArray(overlay?.news) && overlay.news.length) parts.push(overlay.news.slice(0, 2).join(" • "));
  return parts.length ? parts.join(" — ") : "–";
}

function linkButton(href, label) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = label;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

// --- CSV parsing (simple, robust enough for your ranking files) ---
function parseCSV(text) {
  // Supports:
  // - commas
  // - quoted fields with commas
  // - newlines
  // Not meant for exotic CSV edge cases, but good enough here.
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // escaped quote?
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }

    if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i += 1;
      continue;
    }

    if (c === "\r") {
      // ignore
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  // last field
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];
  const header = rows[0].map(h => (h || "").trim());
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const arr = rows[r];
    if (!arr || arr.length === 0) continue;

    const obj = {};
    for (let k = 0; k < header.length; k++) {
      const key = header[k];
      if (!key) continue;
      const val = (arr[k] ?? "").trim();

      // numeric coercion where appropriate
      const n = Number(val);
      if (val === "") obj[key] = null;
      else if (!Number.isNaN(n) && /^[+-]?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(val)) obj[key] = n;
      else obj[key] = val;
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

// --- Build stats lookup from ranking CSVs ---
async function loadRankingsLookup({ rankingsDir, universes, trendSuffix, metaEl }) {
  // returns Map key `${universe}__${symbol}` -> stats object
  const map = new Map();

  if (!rankingsDir || !Array.isArray(universes) || universes.length === 0) {
    return map;
  }

  // Normalize universes from data to file naming (you use dax/mdax/sdax/sp500)
  const uniqUniverses = Array.from(new Set(universes.map(u => String(u).trim()).filter(Boolean)));

  // Load per-universe ranking_<u>_<suffix>_score.csv
  for (const u of uniqUniverses) {
    const url = `${rankingsDir}/ranking_${u}_${trendSuffix}_score.csv`;
    try {
      const csvText = await fetchText(url);
      const rows = parseCSV(csvText);

      // expected columns: symbol,trades,score,mean_R,profit_factor,...
      for (const r of rows) {
        const sym = String(r.symbol || "").trim();
        if (!sym) continue;

        const stats = {
          trades: r.trades ?? null,
          score: r.score ?? null,
          mean_R: r.mean_R ?? null,
          pf: r.profit_factor ?? null,          // UI expects "pf"
          profit_factor: r.profit_factor ?? null,
          total_R: r.total_R ?? null,
          median_R: r.median_R ?? null,
          win_rate: r.win_rate ?? null,
          avg_hold: r.avg_hold ?? null,
          tp_rate: r.tp_rate ?? null,
          sl_rate: r.sl_rate ?? null,
          time_rate: r.time_rate ?? null,
          expectancy_R: r.expectancy_R ?? null,
        };

        map.set(`${u}__${sym}`, stats);
      }
    } catch (e) {
      // Not fatal: if a universe has no ranking yet, UI still works.
      if (metaEl) {
        // keep it quiet, but helpful if all are missing
        // metaEl.textContent = metaEl.textContent; // no-op
      }
    }
  }

  return map;
}

function enrichRowsWithStats(rows, lookup) {
  if (!lookup || lookup.size === 0) {
    return rows.map(r => ({ ...r, stats: r.stats ?? null }));
  }

  return rows.map(r => {
    const u = String(r.universe || "").trim();
    const sym = String(r.symbol || "").trim();
    const key = `${u}__${sym}`;
    const stats = lookup.get(key) || r.stats || null;
    return { ...r, stats };
  });
}

function rowToTr(r) {
  const tr = document.createElement("tr");

  const hold =
    (r.hold_days_min && r.hold_days_max)
      ? `${r.hold_days_min}-${r.hold_days_max}d`
      : (r.time_stop_bars ? `${r.time_stop_bars} bars` : "–");

  const cells = [
    r.universe,
    r.symbol,
    fmt(r.buy),
    fmt(r.sl),
    fmt(r.tp),
    fmt(r.rr, 2),
    hold,
    (r.shares ?? "–"),
    fmt(r.risk_usd, 2),
    fmt(r.fee_usd, 2),
    (r.stats?.trades ?? "–"),
    fmt(r.stats?.score, 3),
    fmt(r.stats?.mean_R, 3),
    fmt(r.stats?.pf, 2),
    buildEventsCell(r.overlay)
  ];

  cells.forEach((c, idx) => {
    const td = document.createElement("td");

    // events cell with risk badge if available
    if (idx === 14 && r.overlay?.risk_flag) {
      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.gap = "8px";
      wrap.style.alignItems = "center";
      wrap.appendChild(riskBadge(r.overlay.risk_flag));
      const txt = document.createElement("span");
      txt.textContent = c;
      wrap.appendChild(txt);
      td.appendChild(wrap);
    } else {
      td.textContent = (c === null || c === undefined || c === "") ? "–" : String(c);
    }

    tr.appendChild(td);
  });

  return tr;
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

  strategies.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name || s.id;
    opt.dataset.path = s.path;
    strategySelect.appendChild(opt);
  });

  let current = null; // latest.json payload
  let rowsActive = [];
  let rowsEdge = [];
  let statsLookup = new Map();

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const path = sel?.dataset?.path;
    if (!path) return;

    metaEl.textContent = "Lade Report …";
    linksEl.innerHTML = "";
    tblBody.innerHTML = "";
    current = null;
    rowsActive = [];
    rowsEdge = [];
    statsLookup = new Map();

    try {
      current = await loadJSON(path);
    } catch (e) {
      metaEl.textContent = `Report nicht ladbar (${path}): ${e.message}`;
      return;
    }

    // latest.json schema you currently have:
    const strategyId = current.strategy_id || current.strategy || "–";
    const asof = current.asof || "–";
    const gen = current.generated_utc || current.generated || "–";

    metaEl.textContent = `asof: ${asof} • strategy: ${strategyId} • generated: ${gen}`;

    // Links: support both "links" and "paths.csv"
    const links = current.links || {};
    const csvPaths = current.paths?.csv || {};
    const linkItems = [
      ["Candidates Active", links.candidates_active_csv || csvPaths.candidates_active],
      ["Candidates Edge", links.candidates_edge_csv || csvPaths.candidates_edge],
      ["Trade Plan", links.trade_plan_csv || csvPaths.trade_plan],
      ["Position Plan", links.position_plan_csv || csvPaths.position_plan],
      ["Archive JSON", current.paths?.archive],
    ].filter(([, href]) => !!href);

    linksEl.innerHTML = "";
    linkItems.forEach(([label, href]) => linksEl.appendChild(linkButton(href, label)));

    // Determine where rows are stored.
    // Prefer direct arrays if present (active/edge),
    // else load archive and extract from snapshot.data
    if (Array.isArray(current.active) || Array.isArray(current.edge)) {
      rowsActive = Array.isArray(current.active) ? current.active : [];
      rowsEdge = Array.isArray(current.edge) ? current.edge : [];
    } else {
      // load archive snapshot
      const archivePath = current.paths?.archive;
      if (archivePath) {
        try {
          const snap = await loadJSON(archivePath);
          const data = snap.data || {};
          rowsActive = Array.isArray(data.candidates_active) ? data.candidates_active : [];
          rowsEdge = Array.isArray(data.candidates_edge) ? data.candidates_edge : [];
        } catch (e) {
          // fallback: try CSVs? (not needed for now)
          rowsActive = [];
          rowsEdge = [];
        }
      }
    }

    // Load rankings & enrich
    const rankingsDir = current.paths?.rankings_dir || `data/${strategyId}/rankings`;
    const universes = current.universes || Array.from(new Set([...rowsActive, ...rowsEdge].map(r => r.universe).filter(Boolean)));
    const trendSuffix = current.trend_suffix || "trend_off";

    statsLookup = await loadRankingsLookup({
      rankingsDir,
      universes,
      trendSuffix,
      metaEl
    });

    rowsActive = enrichRowsWithStats(rowsActive, statsLookup);
    rowsEdge = enrichRowsWithStats(rowsEdge, statsLookup);

    render();
  }

  function render() {
    if (!current) return;

    const view = viewSelect.value;
    const baseRows = (view === "edge" ? rowsEdge : rowsActive);
    const filtered = applyFilter(baseRows, search.value);

    title.textContent = `${(strategySelect.selectedOptions[0]?.textContent || "").trim()} — ${view === "edge" ? "Edge" : "Active"}`;
    hint.textContent = `Anzahl: ${filtered.length} (von ${baseRows.length})`;

    tblBody.innerHTML = "";
    filtered.forEach(r => tblBody.appendChild(rowToTr(r)));
  }

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
