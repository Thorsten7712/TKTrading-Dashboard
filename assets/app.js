// assets/app.js

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function fmt(x, digits = 2) {
  if (x === null || x === undefined) return "–";
  const n = Number(x);
  if (!Number.isFinite(n)) return String(x) === "" ? "–" : String(x);
  return n.toFixed(digits);
}

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function esc(s) {
  return String(s ?? "");
}

function parseCSV(text) {
  // Minimal CSV parser (handles quoted commas, double quotes)
  // Returns array of objects; first row as header.
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;

  function pushField() {
    row.push(field);
    field = "";
  }
  function pushRow() {
    // Ignore trailing empty last line
    if (row.length === 1 && row[0] === "" && rows.length === 0) return;
    rows.push(row);
    row = [];
  }

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        // escaped quote
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
      pushField();
      i += 1;
      continue;
    }
    if (c === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  // last field/row
  pushField();
  pushRow();

  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  const out = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r];
    // skip fully empty rows
    if (cols.every(v => (v ?? "").trim() === "")) continue;

    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = cols[c] ?? "";
    }
    out.push(obj);
  }
  return out;
}

function normalizeCandidateRow(r) {
  // Candidates CSV schema is produced by your pipeline; we normalize to a stable rendering shape
  const universe = r.universe ?? r.market_symbol ?? r.index ?? "";
  const symbol = r.symbol ?? r.ticker ?? "";
  const buy = r.buy ?? r.entry ?? r.entry_price ?? "";
  const sl = r.sl ?? r.stop ?? r.stop_price ?? "";
  const tp = r.tp ?? r.target ?? r.tp_price ?? "";
  const rr = r.rr ?? r.RR ?? "";
  const timeStop = r.time_stop_bars ?? r.hold ?? r.hold_bars ?? "";

  // ranking/stats columns (may exist directly in candidates file)
  const trades = r.trades ?? r.n_trades ?? r.num_trades ?? "";
  const score = r.score ?? "";
  const meanR = r.mean_R ?? r.meanR ?? "";
  const pf = r.profit_factor ?? r.pf ?? "";

  return {
    universe: esc(universe),
    symbol: esc(symbol),
    buy: buy === "" ? null : Number(buy),
    sl: sl === "" ? null : Number(sl),
    tp: tp === "" ? null : Number(tp),
    rr: rr === "" ? null : Number(rr),
    hold: timeStop === "" ? null : timeStop, // could be int or "30"
    trades: trades === "" ? null : toInt(trades),
    score: score === "" ? null : Number(score),
    mean_R: meanR === "" ? null : Number(meanR),
    pf: pf === "" ? null : Number(pf),
    // placeholder for later overlay
    events_news: "–",
  };
}

function normalizePlanRow(r) {
  // trade_plan.csv / position_plan.csv have slightly different columns; we show common core.
  const universe = r.universe ?? "";
  const symbol = r.symbol ?? "";
  const buy = r.buy ?? "";
  const sl = r.sl ?? "";
  const tp = r.tp ?? "";
  const rr = r.rr ?? "";
  const hold = r.time_stop_bars ?? "";
  const shares = r.shares ?? "";
  const riskUsd = r.risk_usd ?? r.risk$ ?? "";
  const feeUsd = r.fee_usd ?? r.fee$ ?? "";

  const trades = r.trades ?? "";
  const score = r.score ?? "";
  const meanR = r.mean_R ?? r.meanR ?? "";
  const pf = r.profit_factor ?? r.pf ?? "";

  return {
    universe: esc(universe),
    symbol: esc(symbol),
    buy: buy === "" ? null : Number(buy),
    sl: sl === "" ? null : Number(sl),
    tp: tp === "" ? null : Number(tp),
    rr: rr === "" ? null : Number(rr),
    hold: hold === "" ? null : hold,
    shares: shares === "" ? null : toInt(shares) ?? shares,
    risk_usd: riskUsd === "" ? null : Number(riskUsd),
    fee_usd: feeUsd === "" ? null : Number(feeUsd),
    trades: trades === "" ? null : toInt(trades),
    score: score === "" ? null : Number(score),
    mean_R: meanR === "" ? null : Number(meanR),
    pf: pf === "" ? null : Number(pf),
    events_news: "–",
  };
}

function applyFilter(rows, q) {
  const s = (q || "").trim().toLowerCase();
  if (!s) return rows;
  return rows.filter(r =>
    String(r.symbol || "").toLowerCase().includes(s) ||
    String(r.universe || "").toLowerCase().includes(s)
  );
}

function buildRowTr(r) {
  const tr = document.createElement("tr");

  const cells = [
    r.universe,
    r.symbol,
    fmt(r.buy),
    fmt(r.sl),
    fmt(r.tp),
    fmt(r.rr, 2),
    r.hold ?? "–",
    r.shares ?? "–",
    fmt(r.risk_usd, 2),
    fmt(r.fee_usd, 2),
    r.trades ?? "–",
    fmt(r.score, 3),
    fmt(r.mean_R, 3),
    fmt(r.pf, 2),
    r.events_news ?? "–",
  ];

  cells.forEach(v => {
    const td = document.createElement("td");
    td.textContent = (v === null || v === undefined || v === "") ? "–" : String(v);
    tr.appendChild(td);
  });

  return tr;
}

function setMeta(metaEl, latest) {
  const asof = latest?.asof ?? "–";
  const strategy = latest?.strategy ?? latest?.strategy_id ?? "–";
  const gen = latest?.generated ?? latest?.generated_utc ?? "–";
  metaEl.textContent = `asof: ${asof} • strategy: ${strategy} • generated: ${gen}`;
}

function setLinks(linksEl, latest) {
  linksEl.innerHTML = "";
  const csv = latest?.paths?.csv || {};
  const items = [
    ["Candidates Active", csv.candidates_active],
    ["Candidates Edge", csv.candidates_edge],
    ["Trade Plan", csv.trade_plan],
    ["Position Plan", csv.position_plan],
  ].filter(([, href]) => !!href);

  items.forEach(([label, href]) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    a.style.marginRight = "10px";
    linksEl.appendChild(a);
  });
}

async function loadLatestAndCSVs(latestPath) {
  const latest = await fetchJSON(latestPath);

  const csvPaths = latest?.paths?.csv;
  if (!csvPaths) {
    return { latest, csv: { active: [], edge: [], trade: [], position: [] } };
  }

  // load CSVs (if missing, keep empty)
  async function maybeLoad(p) {
    if (!p) return [];
    try {
      const t = await fetchText(p);
      return parseCSV(t);
    } catch (e) {
      console.warn(`CSV not loadable: ${p}`, e);
      return [];
    }
  }

  const [a, e, t, p] = await Promise.all([
    maybeLoad(csvPaths.candidates_active),
    maybeLoad(csvPaths.candidates_edge),
    maybeLoad(csvPaths.trade_plan),
    maybeLoad(csvPaths.position_plan),
  ]);

  return { latest, csv: { active: a, edge: e, trade: t, position: p } };
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
    manifest = await fetchJSON("data/manifest.json");
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

  let current = null; // { latest, csv: {active,edge,trade,position}, viewRows }

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const latestPath = sel?.dataset?.path;
    if (!latestPath) return;

    metaEl.textContent = "Lade Report …";
    linksEl.innerHTML = "";
    tblBody.innerHTML = "";
    hint.textContent = "";
    current = null;

    try {
      current = await loadLatestAndCSVs(latestPath);
    } catch (e) {
      metaEl.textContent = `Report nicht ladbar (${latestPath}): ${e.message}`;
      return;
    }

    setMeta(metaEl, current.latest);
    setLinks(linksEl, current.latest);
    render();
  }

  function getRowsForView() {
    if (!current) return [];
    const v = viewSelect.value;

    if (v === "edge") return (current.csv.edge || []).map(normalizeCandidateRow);
    if (v === "trade_plan") return (current.csv.trade || []).map(normalizePlanRow);
    if (v === "position_plan") return (current.csv.position || []).map(normalizePlanRow);
    // default: active
    return (current.csv.active || []).map(normalizeCandidateRow);
  }

  function render() {
    if (!current) return;

    const v = viewSelect.value;
    const rows = getRowsForView();
    const filtered = applyFilter(rows, search.value);

    const stratName = (strategySelect.selectedOptions[0]?.textContent || "").trim() || "Strategy";
    const label =
      v === "edge" ? "Candidates — Edge" :
      v === "trade_plan" ? "Trade Plan" :
      v === "position_plan" ? "Position Plan" :
      "Candidates — Active";

    title.textContent = `${stratName} — ${label}`;
    hint.textContent = `Anzahl: ${filtered.length} (von ${rows.length})`;

    tblBody.innerHTML = "";
    filtered.forEach(r => tblBody.appendChild(buildRowTr(r)));
  }

  // Extend viewSelect without touching index.html options: add Trade/Position if not present
  (function ensureViews() {
    const existing = new Set(Array.from(viewSelect.options).map(o => o.value));
    if (!existing.has("trade_plan")) {
      const o = document.createElement("option");
      o.value = "trade_plan";
      o.textContent = "Trade Plan";
      viewSelect.appendChild(o);
    }
    if (!existing.has("position_plan")) {
      const o = document.createElement("option");
      o.value = "position_plan";
      o.textContent = "Position Plan";
      viewSelect.appendChild(o);
    }
  })();

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
