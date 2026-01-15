// assets/app.js
// TKTrading Dashboard (static)
// - loads data/manifest.json -> latest.json -> archive.json
// - views: candidates active/edge, trade plan, position plan
// - ranking dot + tooltip based on stats.score thresholds
// - trade gates: preset dropdown + only-passes toggle
// - sorting: click headers to sort asc/desc; numeric aware; default per view

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function loadJSON(url) {
  const txt = await fetchText(url);
  try {
    return JSON.parse(txt);
  } catch (e) {
    const head = txt.slice(0, 400).replace(/\s+/g, " ").trim();
    throw new Error(`JSON parse failed for ${url}: ${e.message}. Head: ${head}`);
  }
}

function fmt(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  if (typeof x === "number") return x.toFixed(digits);
  const s = String(x);
  if (s === "" || s.toLowerCase() === "nan") return "–";
  return s;
}

function toNum(x) {
  if (x === null || x === undefined) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  const s = String(x).trim();
  if (!s || s.toLowerCase() === "nan") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function clearEl(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

function applyTextFilter(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r =>
    String(r.symbol || "").toLowerCase().includes(s) ||
    String(r.universe || "").toLowerCase().includes(s)
  );
}

function buildEventsCell(overlay) {
  if (!overlay) return "–";
  const parts = [];
  if (overlay.risk_flag) parts.push(`[${overlay.risk_flag}]`);
  if (Array.isArray(overlay.events) && overlay.events.length) parts.push(overlay.events.join(" • "));
  if (Array.isArray(overlay.news) && overlay.news.length) parts.push(overlay.news.slice(0, 2).join(" • "));
  return parts.length ? parts.join(" — ") : "–";
}

function normalizeStats(stats) {
  if (!stats) return null;
  return {
    trades: toNum(stats.trades),
    score: toNum(stats.score),
    meanR: toNum(stats.mean_R ?? stats.meanR),
    pf: toNum(stats.pf ?? stats.profit_factor),
  };
}

function computeRR(row) {
  const rr = toNum(row.rr);
  if (rr !== null) return rr;
  const buy = toNum(row.buy);
  const sl = toNum(row.sl);
  const tp = toNum(row.tp);
  if (buy === null || sl === null || tp === null) return null;
  const risk = buy - sl;
  if (risk <= 0) return null;
  return (tp - buy) / risk;
}

function pickRowsFromArchive(archive, view) {
  const data = archive?.data || {};
  if (view === "active") return data.candidates_active || [];
  if (view === "edge") return data.candidates_edge || [];
  if (view === "trade_plan") return data.trade_plan || [];
  if (view === "position_plan") return data.position_plan || [];
  return [];
}

function buildLinks(linksEl, latest) {
  clearEl(linksEl);

  const paths = latest?.paths?.csv || {};
  const items = [
    ["Candidates Active (CSV)", paths.candidates_active],
    ["Candidates Edge (CSV)", paths.candidates_edge],
    ["Trade Plan (CSV)", paths.trade_plan],
    ["Position Plan (CSV)", paths.position_plan],
    ["Archive (JSON)", latest?.paths?.archive],
  ].filter(([, href]) => !!href);

  items.forEach(([label, href]) => {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    linksEl.appendChild(a);
  });
}

// ---------------------------------------------------------
// Ampel (fixed thresholds as requested)
// <0.5 red, 0.5-1.5 yellow, 1.5-3 green, >=3 strong green
// ---------------------------------------------------------
function scoreBand(score) {
  if (score === null) return { cls: "rank-na", label: "Kein Ranking" };
  if (score < 0.5) return { cls: "rank-red", label: "Score < 0.5 (rot)" };
  if (score < 1.5) return { cls: "rank-yellow", label: "0.5–1.5 (gelb)" };
  if (score < 3.0) return { cls: "rank-green", label: "1.5–3.0 (grün)" };
  return { cls: "rank-strong", label: "≥ 3.0 (sehr grün)" };
}

function tooltipText(row, gateInfo) {
  const s = normalizeStats(row.stats);
  const parts = [];
  if (!s) {
    parts.push("Kein Ranking verfügbar");
  } else {
    parts.push(`Score: ${s.score === null ? "–" : s.score.toFixed(3)}`);
    parts.push(`Trades: ${s.trades === null ? "–" : String(Math.round(s.trades))}`);
    parts.push(`meanR: ${s.meanR === null ? "–" : s.meanR.toFixed(3)}`);
    parts.push(`PF: ${s.pf === null ? "–" : s.pf.toFixed(2)}`);
  }
  if (gateInfo && !gateInfo.pass) parts.push(`Gate FAIL: ${gateInfo.reasons.join(", ")}`);
  return parts.join(" • ");
}

// ---------------------------------------------------------
// Trade Gates (presets)
// ---------------------------------------------------------
function gatePreset(name) {
  // You can tweak later. The point: explicit + easy to switch.
  if (name === "conservative") return { tradesMin: 40, scoreMin: 1.5, pfMin: 1.30, meanRMin: 0.10 };
  if (name === "balanced")     return { tradesMin: 25, scoreMin: 1.0, pfMin: 1.15, meanRMin: 0.05 };
  if (name === "aggressive")   return { tradesMin: 20, scoreMin: 0.5, pfMin: 1.00, meanRMin: 0.00 };
  return null; // off
}

function evalGate(row, preset) {
  if (!preset) return { pass: true, reasons: [] };

  const s = normalizeStats(row.stats);
  const reasons = [];

  const trades = s?.trades ?? null;
  const score  = s?.score ?? null;
  const pf     = s?.pf ?? null;
  const meanR  = s?.meanR ?? null;

  if (trades === null) reasons.push("no trades");
  else if (trades < preset.tradesMin) reasons.push(`trades < ${preset.tradesMin}`);

  if (score === null) reasons.push("no score");
  else if (score < preset.scoreMin) reasons.push(`score < ${preset.scoreMin}`);

  if (pf === null) reasons.push("no PF");
  else if (pf < preset.pfMin) reasons.push(`PF < ${preset.pfMin}`);

  if (meanR === null) reasons.push("no meanR");
  else if (meanR < preset.meanRMin) reasons.push(`meanR < ${preset.meanRMin}`);

  return { pass: reasons.length === 0, reasons };
}

// ---------------------------------------------------------
// Sorting
// ---------------------------------------------------------
function valueForSort(row, key, cfg) {
  const renderer = cfg.renderers?.[key];
  const raw = renderer ? renderer(row) : row[key];

  if (raw === null || raw === undefined || raw === "" || raw === "–") return { t: "na", v: null };

  const n = toNum(raw);
  if (n !== null) return { t: "num", v: n };

  return { t: "str", v: String(raw).toLowerCase() };
}

function sortRows(rows, sortState, cfg, tieBreak) {
  if (!sortState?.key) return rows;

  const { key, dir } = sortState;
  const mul = dir === "asc" ? 1 : -1;

  const out = rows.slice();
  out.sort((a, b) => {
    const va = valueForSort(a, key, cfg);
    const vb = valueForSort(b, key, cfg);

    // NA always last
    if (va.t === "na" && vb.t === "na") return 0;
    if (va.t === "na") return 1;
    if (vb.t === "na") return -1;

    // numeric before string
    if (va.t !== vb.t) {
      if (va.t === "num") return -1;
      if (vb.t === "num") return 1;
    }

    let cmp = 0;
    if (va.t === "num" && vb.t === "num") cmp = va.v - vb.v;
    else cmp = String(va.v).localeCompare(String(vb.v));

    if (cmp !== 0) return cmp * mul;

    // tie-break (e.g., score desc then trades desc)
    if (tieBreak?.length) {
      for (const tb of tieBreak) {
        const ta = valueForSort(a, tb.key, cfg);
        const tbv = valueForSort(b, tb.key, cfg);

        if (ta.t === "na" && tbv.t === "na") continue;
        if (ta.t === "na") return 1;
        if (tbv.t === "na") return -1;

        let c2 = 0;
        const m2 = tb.dir === "asc" ? 1 : -1;

        if (ta.t === "num" && tbv.t === "num") c2 = ta.v - tbv.v;
        else c2 = String(ta.v).localeCompare(String(tbv.v));

        if (c2 !== 0) return c2 * m2;
      }
    }

    return 0;
  });

  return out;
}

// ---------------------------------------------------------
// View configuration
// renderers should return numbers for numeric cols (so sort works)
// ---------------------------------------------------------
function buildViewConfig(view) {
  const commonStats = {
    trades: r => normalizeStats(r.stats)?.trades ?? null,
    score:  r => normalizeStats(r.stats)?.score ?? null,
    meanR:  r => normalizeStats(r.stats)?.meanR ?? null,
    pf:     r => normalizeStats(r.stats)?.pf ?? null,
  };

  if (view === "trade_plan") {
    return {
      title: "Trade Plan",
      defaultSort: { key: "score", dir: "desc" },
      tieBreak: [{ key: "trades", dir: "desc" }],
      cols: [
        { key: "universe", label: "Universe", sortable: true },
        { key: "symbol", label: "Symbol", sortable: true },
        { key: "mode", label: "Mode", sortable: true },
        { key: "buy", label: "Buy", numeric: true, sortable: true },
        { key: "sl", label: "SL", numeric: true, sortable: true },
        { key: "tp", label: "TP", numeric: true, sortable: true },
        { key: "rr", label: "RR", numeric: true, sortable: true },
        { key: "hold", label: "Hold", numeric: true, sortable: true },
        { key: "trades", label: "Trades", numeric: true, sortable: true },
        { key: "score", label: "Score", numeric: true, sortable: true },
        { key: "meanR", label: "meanR", numeric: true, sortable: true },
        { key: "pf", label: "PF", numeric: true, sortable: true },
      ],
      renderers: {
        universe: r => r.universe ?? "–",
        symbol: r => r.symbol ?? "–",
        mode: r => r.mode ?? "–",
        buy: r => toNum(r.buy),
        sl: r => toNum(r.sl),
        tp: r => toNum(r.tp),
        rr: r => computeRR(r),
        hold: r => toNum(r.time_stop_bars ?? r.hold_bars ?? r.hold),
        ...commonStats,
      },
    };
  }

  if (view === "position_plan") {
    return {
      title: "Position Plan",
      defaultSort: { key: "score", dir: "desc" },
      tieBreak: [{ key: "trades", dir: "desc" }],
      cols: [
        { key: "universe", label: "Universe", sortable: true },
        { key: "symbol", label: "Symbol", sortable: true },
        { key: "mode", label: "Mode", sortable: true },
        { key: "buy", label: "Buy", numeric: true, sortable: true },
        { key: "sl", label: "SL", numeric: true, sortable: true },
        { key: "tp", label: "TP", numeric: true, sortable: true },
        { key: "shares", label: "Shares", numeric: true, sortable: true },
        { key: "cost_usd", label: "Cost$", numeric: true, sortable: true },
        { key: "risk_usd", label: "Risk$", numeric: true, sortable: true },
        { key: "fee_usd", label: "Fee$", numeric: true, sortable: true },
        { key: "cash_after_usd", label: "CashAfter$", numeric: true, sortable: true },
        { key: "trades", label: "Trades", numeric: true, sortable: true },
        { key: "score", label: "Score", numeric: true, sortable: true },
        { key: "meanR", label: "meanR", numeric: true, sortable: true },
        { key: "pf", label: "PF", numeric: true, sortable: true },
      ],
      renderers: {
        universe: r => r.universe ?? "–",
        symbol: r => r.symbol ?? "–",
        mode: r => r.mode ?? "–",
        buy: r => toNum(r.buy),
        sl: r => toNum(r.sl),
        tp: r => toNum(r.tp),
        shares: r => toNum(r.shares),
        cost_usd: r => toNum(r.cost_usd),
        risk_usd: r => toNum(r.risk_usd),
        fee_usd: r => toNum(r.fee_usd),
        cash_after_usd: r => toNum(r.cash_after_usd),
        ...commonStats,
      },
    };
  }

  // Candidates (active/edge)
  return {
    title: view === "edge" ? "Candidates — Edge" : "Candidates — Active",
    defaultSort: { key: "score", dir: "desc" },
    tieBreak: [{ key: "trades", dir: "desc" }],
    cols: [
      { key: "universe", label: "Universe", sortable: true },
      { key: "symbol", label: "Symbol", sortable: true },
      { key: "buy", label: "Buy", numeric: true, sortable: true },
      { key: "sl", label: "SL", numeric: true, sortable: true },
      { key: "tp", label: "TP", numeric: true, sortable: true },
      { key: "rr", label: "RR", numeric: true, sortable: true },
      { key: "hold", label: "Hold", numeric: true, sortable: true },
      { key: "shares", label: "Shares", numeric: true, sortable: true },
      { key: "risk_usd", label: "Risk$", numeric: true, sortable: true },
      { key: "fee_usd", label: "Fee$", numeric: true, sortable: true },
      { key: "trades", label: "Trades", numeric: true, sortable: true },
      { key: "score", label: "Score", numeric: true, sortable: true },
      { key: "meanR", label: "meanR", numeric: true, sortable: true },
      { key: "pf", label: "PF", numeric: true, sortable: true },
      { key: "events", label: "Events/News" },
    ],
    renderers: {
      universe: r => r.universe ?? "–",
      symbol: r => r.symbol ?? "–",
      buy: r => toNum(r.buy),
      sl: r => toNum(r.sl),
      tp: r => toNum(r.tp),
      rr: r => computeRR(r),
      hold: r => toNum(r.time_stop_bars ?? r.hold_bars ?? r.hold),
      shares: r => toNum(r.shares),
      risk_usd: r => toNum(r.risk_usd),
      fee_usd: r => toNum(r.fee_usd),
      ...commonStats,
      events: r => buildEventsCell(r.overlay),
    },
  };
}

// ---------------------------------------------------------
// Table header + row rendering
// ---------------------------------------------------------
function setTableHeader(thead, cfg, sortState, onSort) {
  clearEl(thead);
  const tr = document.createElement("tr");

  cfg.cols.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label;
    if (col.numeric) th.classList.add("num");

    if (col.sortable) {
      th.classList.add("sortable");
      th.tabIndex = 0;

      const active = sortState?.key === col.key;
      if (active) th.classList.add("sorted");

      const arrow = document.createElement("span");
      arrow.className = "sort-arrow";
      arrow.textContent = active ? (sortState.dir === "asc" ? "▲" : "▼") : "↕";
      th.appendChild(arrow);

      th.addEventListener("click", () => onSort(col.key));
      th.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") onSort(col.key);
      });
    }

    tr.appendChild(th);
  });

  thead.appendChild(tr);
}

function cellText(colKey, raw) {
  if (raw === null || raw === undefined || raw === "" || raw === "–") return "–";
  if (typeof raw === "number") {
    if (colKey === "trades" || colKey === "hold" || colKey === "shares") return fmt(raw, 0);
    if (colKey === "pf") return fmt(raw, 2);
    if (colKey === "score" || colKey === "meanR") return fmt(raw, 3);
    if (colKey === "rr") return fmt(raw, 2);
    return fmt(raw, 2);
  }
  return String(raw);
}

function renderRow(row, cfg, gateInfo) {
  const tr = document.createElement("tr");
  if (gateInfo && !gateInfo.pass) tr.classList.add("gate-fail");

  cfg.cols.forEach(col => {
    const td = document.createElement("td");
    if (col.numeric) td.classList.add("num");

    if (col.key === "symbol") {
      td.classList.add("symbol");
      const wrap = document.createElement("div");
      wrap.className = "symbol-wrap";

      const s = normalizeStats(row.stats);
      const band = scoreBand(s?.score ?? null);

      const dot = document.createElement("span");
      dot.className = "rank-dot " + band.cls;
      dot.title = band.label + " — " + tooltipText(row, gateInfo);
      wrap.appendChild(dot);

      const txt = document.createElement("span");
      const sym = cfg.renderers.symbol ? cfg.renderers.symbol(row) : (row.symbol ?? "–");
      txt.textContent = cellText("symbol", sym);
      wrap.appendChild(txt);

      td.appendChild(wrap);
    } else {
      const renderer = cfg.renderers?.[col.key];
      const raw = renderer ? renderer(row) : row[col.key];
      td.textContent = cellText(col.key, raw);
    }

    tr.appendChild(td);
  });

  return tr;
}

// ---------------------------------------------------------
// Main
// ---------------------------------------------------------
async function main() {
  const metaEl = document.getElementById("meta");
  const linksEl = document.getElementById("links");
  const thead = document.querySelector("#tbl thead");
  const tbody = document.querySelector("#tbl tbody");

  const strategySelect = document.getElementById("strategySelect");
  const viewSelect = document.getElementById("viewSelect");
  const gateSelect = document.getElementById("gateSelect"); // optional
  const gateOnly = document.getElementById("gateOnly");     // optional
  const search = document.getElementById("search");
  const titleEl = document.getElementById("tableTitle");
  const hintEl = document.getElementById("hint");

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
    opt.dataset.path = s.path; // latest.json
    strategySelect.appendChild(opt);
  });

  let latest = null;
  let archive = null;

  // keep sort per view
  const sortByView = { active: null, edge: null, trade_plan: null, position_plan: null };

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const latestPath = sel?.dataset?.path;
    if (!latestPath) return;

    metaEl.textContent = "Lade Report …";
    clearEl(linksEl);
    clearEl(thead);
    clearEl(tbody);
    titleEl.textContent = "Loading…";
    hintEl.textContent = "";

    latest = null;
    archive = null;

    try {
      latest = await loadJSON(latestPath);
    } catch (e) {
      metaEl.textContent = `Report nicht ladbar (${latestPath}): ${e.message}`;
      return;
    }

    const archivePath = latest?.paths?.archive;
    if (!archivePath) {
      metaEl.textContent = `latest.json hat keinen paths.archive: ${latestPath}`;
      return;
    }

    try {
      archive = await loadJSON(archivePath);
    } catch (e) {
      metaEl.textContent = `Archive nicht ladbar (${archivePath}): ${e.message}`;
      return;
    }

    const asof = archive?.asof ?? latest?.asof ?? "–";
    const strat = archive?.strategy ?? latest?.strategy ?? sel?.value ?? "–";
    const gen = archive?.generated ?? latest?.generated ?? "–";
    metaEl.textContent = `asof: ${asof} • strategy: ${strat} • generated: ${gen}`;

    buildLinks(linksEl, latest);

    // init default sort for current view
    const view = viewSelect.value;
    const cfg = buildViewConfig(view);
    if (!sortByView[view]) sortByView[view] = cfg.defaultSort;

    render();
  }

  function onSort(key) {
    const view = viewSelect.value;
    const cfg = buildViewConfig(view);
    const cur = sortByView[view] || cfg.defaultSort;

    let dir = "desc";
    if (cur?.key === key) dir = cur.dir === "desc" ? "asc" : "desc";
    sortByView[view] = { key, dir };
    render();
  }

  function render() {
    if (!archive) return;

    const view = viewSelect.value;
    const cfg = buildViewConfig(view);

    if (!sortByView[view]) sortByView[view] = cfg.defaultSort;

    titleEl.textContent = `${(strategySelect.selectedOptions[0]?.textContent || "").trim()} — ${cfg.title}`;

    const rowsAll = pickRowsFromArchive(archive, view);

    // 1) gates evaluate (defensive: controls may not exist)
    const preset = gateSelect ? gatePreset(gateSelect.value) : null;
    const evaluated = rowsAll.map(r => ({ row: r, gate: evalGate(r, preset) }));

    // map for tooltips
    const gateMap = new Map();
    evaluated.forEach(x => gateMap.set(x.row, x.gate));

    // 2) optional gate filter (defensive)
    const onlyPass = gateOnly ? !!gateOnly.checked : false;
    const gateFiltered = onlyPass
      ? evaluated.filter(x => x.gate.pass).map(x => x.row)
      : evaluated.map(x => x.row);
    
    // 3) search filter
    const textFiltered = applyTextFilter(gateFiltered, search.value);

    // 4) sorting
    const sorted = sortRows(textFiltered, sortByView[view], cfg, cfg.tieBreak);

    hintEl.textContent = `Anzahl: ${sorted.length} (von ${rowsAll.length})`;

    setTableHeader(thead, cfg, sortByView[view], onSort);

    clearEl(tbody);
    sorted.forEach(r => {
      const gateInfo = gateMap.get(r) || null;
      tbody.appendChild(renderRow(r, cfg, gateInfo));
    });
  }

  strategySelect.addEventListener("change", loadStrategy);

  viewSelect.addEventListener("change", () => {
    const view = viewSelect.value;
    const cfg = buildViewConfig(view);
    if (!sortByView[view]) sortByView[view] = cfg.defaultSort;
    render();
  });

  if (gateSelect) gateSelect.addEventListener("change", render);
  if (gateOnly) gateOnly.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
