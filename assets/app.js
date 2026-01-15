// assets/app.js
// Dashboard Explorer (static GitHub Pages)
//
// Loads:
//   data/manifest.json -> latest.json -> archive.json
//
// Views:
//   - candidates active
//   - candidates edge
//   - trade plan
//   - position plan
//
// Ranking Ampel:
//   score < 0.5           => red
//   0.5 <= score < 1.5    => yellow
//   1.5 <= score < 3.0    => green
//   score >= 3.0          => top (green variant)
// Tooltip on dot shows: score, trades, mean_R, profit_factor

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
  while (el.firstChild) el.removeChild(el.firstChild);
}

function buildEventsCell(overlay) {
  if (!overlay) return "–";
  const parts = [];
  if (overlay.risk_flag) parts.push(`[${overlay.risk_flag}]`);
  if (Array.isArray(overlay.events) && overlay.events.length) parts.push(overlay.events.join(" • "));
  if (Array.isArray(overlay.news) && overlay.news.length) parts.push(overlay.news.slice(0, 2).join(" • "));
  return parts.length ? parts.join(" — ") : "–";
}

function applyFilter(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r =>
    String(r.symbol || "").toLowerCase().includes(s) ||
    String(r.universe || "").toLowerCase().includes(s)
  );
}

// -----------------------------
// Stats / RR
// -----------------------------

function normalizeStats(stats) {
  // export_dashboard enrichment: { trades, score, mean_R, pf/profit_factor, ... }
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

// -----------------------------
// Ampel (fixed score bins)
// -----------------------------

function rankClassForScore(score) {
  if (score === null) return "rank-na";
  if (score < 0.5) return "rank-red";
  if (score < 1.5) return "rank-yellow";
  if (score < 3.0) return "rank-green";
  return "rank-top";
}

function buildRankTooltip(row) {
  const s = normalizeStats(row?.stats);
  if (!s) return "Ranking: keine Daten";
  const parts = [];
  parts.push(`Score: ${s.score === null ? "–" : fmt(s.score, 3)}`);
  parts.push(`Trades: ${s.trades === null ? "–" : fmt(s.trades, 0)}`);
  parts.push(`mean_R: ${s.meanR === null ? "–" : fmt(s.meanR, 3)}`);
  parts.push(`PF: ${s.pf === null ? "–" : fmt(s.pf, 2)}`);
  return parts.join(" • ");
}

// -----------------------------
// Table helpers
// -----------------------------

function setTableHeader(thead, cols) {
  // cols: [{ key, label, numeric? }]
  clearEl(thead);
  const tr = document.createElement("tr");
  cols.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c.label;
    if (c.numeric) th.className = "num";
    tr.appendChild(th);
  });
  thead.appendChild(tr);
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

// -----------------------------
// View configs
// -----------------------------

function buildViewConfig(view) {
  if (view === "trade_plan") {
    return {
      title: "Trade Plan",
      cols: [
        { key: "universe", label: "Universe" },
        { key: "symbol", label: "Symbol" },
        { key: "mode", label: "Mode" },
        { key: "buy", label: "Buy", numeric: true },
        { key: "sl", label: "SL", numeric: true },
        { key: "tp", label: "TP", numeric: true },
        { key: "rr", label: "RR", numeric: true },
        { key: "hold", label: "Hold", numeric: true },
        { key: "trades", label: "Trades", numeric: true },
        { key: "score", label: "Score", numeric: true },
        { key: "meanR", label: "meanR", numeric: true },
        { key: "pf", label: "PF", numeric: true },
      ],
      renderers: {
        universe: r => r.universe ?? "–",
        symbol: r => r.symbol ?? "–",
        mode: r => r.mode ?? "–",
        buy: r => fmt(toNum(r.buy)),
        sl: r => fmt(toNum(r.sl)),
        tp: r => fmt(toNum(r.tp)),
        rr: r => fmt(computeRR(r), 2),
        hold: r => fmt(toNum(r.time_stop_bars ?? r.hold_bars ?? r.hold), 0),
        trades: r => normalizeStats(r.stats)?.trades ?? "–",
        score: r => {
          const s = normalizeStats(r.stats);
          return s?.score === null || s?.score === undefined ? "–" : fmt(s.score, 3);
        },
        meanR: r => {
          const s = normalizeStats(r.stats);
          return s?.meanR === null || s?.meanR === undefined ? "–" : fmt(s.meanR, 3);
        },
        pf: r => {
          const s = normalizeStats(r.stats);
          return s?.pf === null || s?.pf === undefined ? "–" : fmt(s.pf, 2);
        },
      },
    };
  }

  if (view === "position_plan") {
    return {
      title: "Position Plan",
      cols: [
        { key: "universe", label: "Universe" },
        { key: "symbol", label: "Symbol" },
        { key: "mode", label: "Mode" },
        { key: "buy", label: "Buy", numeric: true },
        { key: "sl", label: "SL", numeric: true },
        { key: "tp", label: "TP", numeric: true },
        { key: "shares", label: "Shares", numeric: true },
        { key: "cost_usd", label: "Cost$", numeric: true },
        { key: "risk_usd", label: "Risk$", numeric: true },
        { key: "fee_usd", label: "Fee$", numeric: true },
        { key: "cash_after_usd", label: "CashAfter$", numeric: true },
        { key: "trades", label: "Trades", numeric: true },
        { key: "score", label: "Score", numeric: true },
        { key: "meanR", label: "meanR", numeric: true },
        { key: "pf", label: "PF", numeric: true },
      ],
      renderers: {
        universe: r => r.universe ?? "–",
        symbol: r => r.symbol ?? "–",
        mode: r => r.mode ?? "–",
        buy: r => fmt(toNum(r.buy)),
        sl: r => fmt(toNum(r.sl)),
        tp: r => fmt(toNum(r.tp)),
        shares: r => fmt(toNum(r.shares), 0),
        cost_usd: r => fmt(toNum(r.cost_usd)),
        risk_usd: r => fmt(toNum(r.risk_usd)),
        fee_usd: r => fmt(toNum(r.fee_usd)),
        cash_after_usd: r => fmt(toNum(r.cash_after_usd)),
        trades: r => normalizeStats(r.stats)?.trades ?? "–",
        score: r => {
          const s = normalizeStats(r.stats);
          return s?.score === null || s?.score === undefined ? "–" : fmt(s.score, 3);
        },
        meanR: r => {
          const s = normalizeStats(r.stats);
          return s?.meanR === null || s?.meanR === undefined ? "–" : fmt(s.meanR, 3);
        },
        pf: r => {
          const s = normalizeStats(r.stats);
          return s?.pf === null || s?.pf === undefined ? "–" : fmt(s.pf, 2);
        },
      },
    };
  }

  // Candidates (active/edge)
  return {
    title: view === "edge" ? "Candidates — Edge" : "Candidates — Active",
    cols: [
      { key: "universe", label: "Universe" },
      { key: "symbol", label: "Symbol" },
      { key: "buy", label: "Buy", numeric: true },
      { key: "sl", label: "SL", numeric: true },
      { key: "tp", label: "TP", numeric: true },
      { key: "rr", label: "RR", numeric: true },
      { key: "hold", label: "Hold", numeric: true },
      { key: "shares", label: "Shares", numeric: true },
      { key: "risk_usd", label: "Risk$", numeric: true },
      { key: "fee_usd", label: "Fee$", numeric: true },
      { key: "trades", label: "Trades", numeric: true },
      { key: "score", label: "Score", numeric: true },
      { key: "meanR", label: "meanR", numeric: true },
      { key: "pf", label: "PF", numeric: true },
      { key: "events", label: "Events/News" },
    ],
    renderers: {
      universe: r => r.universe ?? "–",
      symbol: r => r.symbol ?? "–",
      buy: r => fmt(toNum(r.buy)),
      sl: r => fmt(toNum(r.sl)),
      tp: r => fmt(toNum(r.tp)),
      rr: r => fmt(computeRR(r), 2),
      hold: r => fmt(toNum(r.time_stop_bars ?? r.hold_bars ?? r.hold), 0),
      shares: r => {
        const n = toNum(r.shares);
        return n === null ? "–" : fmt(n, 0);
      },
      risk_usd: r => fmt(toNum(r.risk_usd)),
      fee_usd: r => fmt(toNum(r.fee_usd)),
      trades: r => normalizeStats(r.stats)?.trades ?? "–",
      score: r => {
        const s = normalizeStats(r.stats);
        return s?.score === null || s?.score === undefined ? "–" : fmt(s.score, 3);
      },
      meanR: r => {
        const s = normalizeStats(r.stats);
        return s?.meanR === null || s?.meanR === undefined ? "–" : fmt(s.meanR, 3);
      },
      pf: r => {
        const s = normalizeStats(r.stats);
        return s?.pf === null || s?.pf === undefined ? "–" : fmt(s.pf, 2);
      },
      events: r => buildEventsCell(r.overlay),
    },
  };
}

// -----------------------------
// Row render (with Ampel dot in Symbol cell)
// -----------------------------

function renderRowWithAmpel(row, cfg) {
  const tr = document.createElement("tr");

  cfg.cols.forEach(col => {
    const td = document.createElement("td");
    if (col.numeric) td.classList.add("num");

    if (col.key === "symbol") {
      td.classList.add("symbol");

      const wrap = document.createElement("div");
      wrap.style.display = "flex";
      wrap.style.alignItems = "center";
      wrap.style.gap = "8px";

      const s = normalizeStats(row?.stats);
      const score = s ? s.score : null;

      const dot = document.createElement("span");
      dot.className = "rank-dot " + rankClassForScore(score);
      dot.title = buildRankTooltip(row); // native tooltip
      wrap.appendChild(dot);

      const txt = document.createElement("span");
      const val = cfg.renderers?.symbol ? cfg.renderers.symbol(row) : (row.symbol ?? "–");
      txt.textContent = (val === null || val === undefined || val === "") ? "–" : String(val);
      wrap.appendChild(txt);

      td.appendChild(wrap);
    } else {
      const renderer = cfg.renderers?.[col.key];
      const val = renderer ? renderer(row) : row[col.key];
      td.textContent = (val === null || val === undefined || val === "") ? "–" : String(val);
    }

    tr.appendChild(td);
  });

  return tr;
}

// -----------------------------
// Main
// -----------------------------

async function main() {
  const metaEl = document.getElementById("meta");
  const linksEl = document.getElementById("links");
  const thead = document.querySelector("#tbl thead");
  const tbody = document.querySelector("#tbl tbody");

  const strategySelect = document.getElementById("strategySelect");
  const viewSelect = document.getElementById("viewSelect");
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
    opt.dataset.path = s.path; // latest.json path
    strategySelect.appendChild(opt);
  });

  let latest = null;
  let archive = null;

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
    render();
  }

  function render() {
    if (!archive) return;

    const view = viewSelect.value; // active|edge|trade_plan|position_plan
    const cfg = buildViewConfig(view);

    titleEl.textContent = `${(strategySelect.selectedOptions[0]?.textContent || "").trim()} — ${cfg.title}`;

    const rows = pickRowsFromArchive(archive, view);
    const filtered = applyFilter(rows, search.value);

    hintEl.textContent = `Anzahl: ${filtered.length} (von ${rows.length})`;

    setTableHeader(thead, cfg.cols);

    clearEl(tbody);
    filtered.forEach(r => tbody.appendChild(renderRowWithAmpel(r, cfg)));
  }

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
