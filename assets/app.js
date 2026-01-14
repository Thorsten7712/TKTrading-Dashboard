// assets/app.js
//
// TKTrading Dashboard Explorer (static, no build step)
// - Reads data/manifest.json to list strategies
// - Reads each strategy's latest.json to get pointers to CSVs
// - Renders Active / Edge candidates from CSV (no embedded arrays needed)
// - Cache-busting for GitHub Pages via ?_ts=...
//
// Expected files in dashboard repo:
//   data/manifest.json
//   data/<strategy_id>/latest.json  (your current schema)
//   data/<strategy_id>/csv/candidates_active.csv
//   data/<strategy_id>/csv/candidates_edge.csv
//   data/<strategy_id>/csv/trade_plan.csv         (optional)
//   data/<strategy_id>/csv/position_plan.csv      (optional)
//
// Your latest.json schema (example):
// {
//   "strategy": "trend_pulse",
//   "trend_suffix": "trend_off",
//   "asof": "2026-01-13",
//   "generated": "2026-01-14T08:07:29Z",
//   "paths": { "csv": { "candidates_active": "...", ... } },
//   "counts": { ... }
// }

function bust(url) {
  const u = new URL(url, window.location.href);
  u.searchParams.set("_ts", String(Date.now()));
  return u.toString();
}

async function loadJSON(url) {
  const res = await fetch(bust(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

async function loadText(url) {
  const res = await fetch(bust(url), { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function fmt(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  if (typeof x === "number") return x.toFixed(digits);
  return String(x);
}

function toNum(x) {
  if (x === null || x === undefined) return null;
  const s = String(x).trim();
  if (!s) return null;
  // tolerate German decimals
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function linkButton(href, label) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = label;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

// Minimal CSV parser (handles quotes + commas)
function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCSVLine(lines[i]);
    const o = {};
    header.forEach((h, j) => (o[h] = (cols[j] ?? "").trim()));
    rows.push(o);
  }
  return rows;
}

function buildEventsCell(overlay) {
  const parts = [];
  if (overlay?.risk_flag) parts.push(`[${overlay.risk_flag}]`);
  if (Array.isArray(overlay?.events) && overlay.events.length) parts.push(overlay.events.join(" • "));
  if (Array.isArray(overlay?.news) && overlay.news.length) parts.push(overlay.news.slice(0, 2).join(" • "));
  return parts.length ? parts.join(" — ") : "–";
}

function riskBadge(flag) {
  const span = document.createElement("span");
  span.className = "badge " + (flag || "");
  span.textContent = flag ? flag.toUpperCase() : "–";
  return span;
}

function applyFilter(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(
    (r) =>
      String(r.symbol || "").toLowerCase().includes(s) ||
      String(r.universe || "").toLowerCase().includes(s)
  );
}

// Map CSV row -> table row object expected by rowToTr()
function mapCandidateCsvRow(r) {
  // tolerate different column spellings
  const symbol = r.symbol ?? r.Symbol ?? "";
  const universe = r.universe ?? r.Universe ?? "";
  const buy = toNum(r.buy ?? r.Buy);
  const sl = toNum(r.sl ?? r.SL);
  const tp = toNum(r.tp ?? r.TP);
  const rr = toNum(r.rr ?? r.RR);

  const holdMin = toNum(r.hold_days_min ?? r.hold_min ?? r.holdMin ?? r.HoldMin);
  const holdMax = toNum(r.hold_days_max ?? r.hold_max ?? r.holdMax ?? r.HoldMax);

  const shares = toNum(r.shares ?? r.Shares);
  const riskUsd = toNum(r.risk_usd ?? r["risk$"] ?? r.RiskUSD ?? r.Risk);
  const feeUsd = toNum(r.fee_usd ?? r["fee$"] ?? r.FeeUSD ?? r.Fee);

  // stats columns from candidates enrichment (if present)
  const trades = toNum(r.trades ?? r.Trades);
  const score = toNum(r.score ?? r.Score);
  const meanR = toNum(r.mean_R ?? r.meanR ?? r.MeanR);
  const pf =
    toNum(r.profit_factor ?? r.pf ?? r.PF) ??
    (r.profit_factor === "inf" || r.PF === "inf" ? Infinity : null);

  return {
    universe,
    symbol,
    buy,
    sl,
    tp,
    rr,
    hold_days_min: holdMin,
    hold_days_max: holdMax,
    shares: shares ?? null,
    risk_usd: riskUsd ?? null,
    fee_usd: feeUsd ?? null,
    stats: {
      trades: trades ?? null,
      score: score ?? null,
      mean_R: meanR ?? null,
      pf: pf ?? null,
    },
    overlay: null,
  };
}

function rowToTr(r) {
  const tr = document.createElement("tr");
  const cells = [
    r.universe,
    r.symbol,
    fmt(r.buy),
    fmt(r.sl),
    fmt(r.tp),
    fmt(r.rr, 2),
    r.hold_days_min != null && r.hold_days_max != null ? `${r.hold_days_min}-${r.hold_days_max}d` : "–",
    r.shares ?? "–",
    fmt(r.risk_usd, 2),
    fmt(r.fee_usd, 2),
    r.stats?.trades ?? "–",
    fmt(r.stats?.score, 3),
    fmt(r.stats?.mean_R, 3),
    // show inf nicely
    r.stats?.pf === Infinity ? "inf" : fmt(r.stats?.pf, 2),
    buildEventsCell(r.overlay),
  ];

  cells.forEach((c, idx) => {
    const td = document.createElement("td");
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
      td.textContent = c === null || c === undefined || c === "" ? "–" : String(c);
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

  // build strategy dropdown
  strategies.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.name || s.id;
    opt.dataset.path = s.path; // e.g. data/trend_pulse/latest.json
    strategySelect.appendChild(opt);
  });

  let currentLatest = null;
  let currentRowsActive = [];
  let currentRowsEdge = [];
  let currentCsvPaths = null;

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const path = sel?.dataset?.path;
    if (!path) return;

    metaEl.textContent = "Lade Report …";
    linksEl.innerHTML = "";
    tblBody.innerHTML = "";
    currentLatest = null;
    currentRowsActive = [];
    currentRowsEdge = [];
    currentCsvPaths = null;

    try {
      currentLatest = await loadJSON(path);
    } catch (e) {
      metaEl.textContent = `Report nicht ladbar (${path}): ${e.message}`;
      return;
    }

    // meta line (match your schema)
    metaEl.textContent = `asof: ${currentLatest.asof || "–"} • strategy: ${currentLatest.strategy || "–"} • generated: ${
      currentLatest.generated || "–"
    }`;

    // links from latest.json pointers
    const csv = currentLatest?.paths?.csv || {};
    currentCsvPaths = csv;

    const linkItems = [
      ["Candidates Active", csv.candidates_active],
      ["Candidates Edge", csv.candidates_edge],
      ["Trade Plan", csv.trade_plan],
      ["Position Plan", csv.position_plan],
    ].filter(([, href]) => !!href);

    linkItems.forEach(([label, href]) => linksEl.appendChild(linkButton(href, label)));

    // load both CSVs (fast enough, keeps switching view instant)
    try {
      if (csv.candidates_active) {
        const txtA = await loadText(csv.candidates_active);
        currentRowsActive = parseCSV(txtA).map(mapCandidateCsvRow);
      }
      if (csv.candidates_edge) {
        const txtE = await loadText(csv.candidates_edge);
        currentRowsEdge = parseCSV(txtE).map(mapCandidateCsvRow);
      }
    } catch (e) {
      // show partial data if one loads, don't hard-fail
      console.error(e);
    }

    render();
  }

  function render() {
    if (!currentLatest) return;
    const view = viewSelect.value; // active|edge
    const rows = view === "edge" ? currentRowsEdge : currentRowsActive;

    const filtered = applyFilter(rows, search.value);

    title.textContent = `${(strategySelect.selectedOptions[0]?.textContent || "").trim()} — ${view === "edge" ? "Edge" : "Active"}`;
    hint.textContent = `Anzahl: ${filtered.length} (von ${rows.length})`;

    tblBody.innerHTML = "";
    filtered.forEach((r) => tblBody.appendChild(rowToTr(r)));
  }

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
