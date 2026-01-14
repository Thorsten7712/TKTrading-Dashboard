// assets/app.js

async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function fmt(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  if (typeof x === "number") return x.toFixed(digits);
  const n = Number(x);
  if (!Number.isNaN(n) && String(x).trim() !== "") return n.toFixed(digits);
  return String(x);
}

function fmtInt(x) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  const n = Number(x);
  if (Number.isNaN(n)) return String(x);
  return String(Math.trunc(n));
}

function safeStr(x) {
  if (x === null || x === undefined) return "";
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

function applyFilter(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r =>
    safeStr(r.symbol).toLowerCase().includes(s) ||
    safeStr(r.universe).toLowerCase().includes(s)
  );
}

// ---------- Events/News cell helpers (optional future overlay) ----------
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

// ---------- Table schema per view ----------
const VIEWS = {
  active: {
    title: "Candidates — Active",
    getRows: (archive) => archive?.data?.candidates_active || [],
    columns: [
      { key: "universe", label: "Universe", render: r => safeStr(r.universe) || "–" },
      { key: "symbol", label: "Symbol", render: r => safeStr(r.symbol) || "–" },

      { key: "buy", label: "Buy", render: r => fmt(r.buy, 2) },
      { key: "sl", label: "SL", render: r => fmt(r.sl, 2) },
      { key: "tp", label: "TP", render: r => fmt(r.tp, 2) },
      { key: "rr", label: "RR", render: r => fmt(r.rr, 2) },

      // Hold comes from time_stop_bars in your pipeline
      { key: "hold", label: "Hold", render: r => (r.time_stop_bars != null ? fmtInt(r.time_stop_bars) : "–") },

      // Ranking stats (from enrichment)
      { key: "trades", label: "Trades", render: r => (r.stats?.trades != null ? fmtInt(r.stats.trades) : "–") },
      { key: "score", label: "Score", render: r => (r.stats?.score != null ? fmt(r.stats.score, 3) : "–") },
      { key: "meanR", label: "meanR", render: r => (r.stats?.mean_R != null ? fmt(r.stats.mean_R, 3) : "–") },
      { key: "pf", label: "PF", render: r => (r.stats?.pf != null ? fmt(r.stats.pf, 2) : "–") },

      { key: "events", label: "Events/News", render: r => buildEventsCell(r.overlay) },
    ],
  },

  edge: {
    title: "Candidates — Edge",
    getRows: (archive) => archive?.data?.candidates_edge || [],
    columns: [
      { key: "universe", label: "Universe", render: r => safeStr(r.universe) || "–" },
      { key: "symbol", label: "Symbol", render: r => safeStr(r.symbol) || "–" },

      { key: "buy", label: "Buy", render: r => fmt(r.buy, 2) },
      { key: "sl", label: "SL", render: r => fmt(r.sl, 2) },
      { key: "tp", label: "TP", render: r => fmt(r.tp, 2) },
      { key: "rr", label: "RR", render: r => fmt(r.rr, 2) },
      { key: "hold", label: "Hold", render: r => (r.time_stop_bars != null ? fmtInt(r.time_stop_bars) : "–") },

      { key: "trades", label: "Trades", render: r => (r.stats?.trades != null ? fmtInt(r.stats.trades) : "–") },
      { key: "score", label: "Score", render: r => (r.stats?.score != null ? fmt(r.stats.score, 3) : "–") },
      { key: "meanR", label: "meanR", render: r => (r.stats?.mean_R != null ? fmt(r.stats.mean_R, 3) : "–") },
      { key: "pf", label: "PF", render: r => (r.stats?.pf != null ? fmt(r.stats.pf, 2) : "–") },

      { key: "events", label: "Events/News", render: r => buildEventsCell(r.overlay) },
    ],
  },

  trade_plan: {
    title: "Trade Plan",
    getRows: (archive) => archive?.data?.trade_plan || [],
    columns: [
      { key: "universe", label: "Universe", render: r => safeStr(r.universe) || "–" },
      { key: "symbol", label: "Symbol", render: r => safeStr(r.symbol) || "–" },
      { key: "mode", label: "Mode", render: r => safeStr(r.mode) || "–" },

      { key: "buy", label: "Buy", render: r => fmt(r.buy, 2) },
      { key: "sl", label: "SL", render: r => fmt(r.sl, 2) },
      { key: "tp", label: "TP", render: r => fmt(r.tp, 2) },

      { key: "risk_per_share", label: "Risk/Share", render: r => {
          // build_trade_plan writes risk_per_share during build, but may not keep it
          // If not present, derive from buy - sl:
          const v = (r.risk_per_share != null) ? r.risk_per_share : (Number(r.buy) - Number(r.sl));
          return fmt(v, 2);
        }
      },

      { key: "rr", label: "RR", render: r => fmt(r.rr, 2) },
      { key: "hold", label: "Hold", render: r => (r.time_stop_bars != null ? fmtInt(r.time_stop_bars) : "–") },

      // Ranking stats
      { key: "trades", label: "Trades", render: r => (r.stats?.trades != null ? fmtInt(r.stats.trades) : "–") },
      { key: "score", label: "Score", render: r => (r.stats?.score != null ? fmt(r.stats.score, 3) : "–") },
      { key: "meanR", label: "meanR", render: r => (r.stats?.mean_R != null ? fmt(r.stats.mean_R, 3) : "–") },
      { key: "pf", label: "PF", render: r => (r.stats?.pf != null ? fmt(r.stats.pf, 2) : "–") },
    ],
  },

  position_plan: {
    title: "Position Plan",
    getRows: (archive) => archive?.data?.position_plan || [],
    columns: [
      { key: "universe", label: "Universe", render: r => safeStr(r.universe) || "–" },
      { key: "symbol", label: "Symbol", render: r => safeStr(r.symbol) || "–" },
      { key: "mode", label: "Mode", render: r => safeStr(r.mode) || "–" },

      { key: "buy", label: "Buy", render: r => fmt(r.buy, 2) },
      { key: "sl", label: "SL", render: r => fmt(r.sl, 2) },
      { key: "tp", label: "TP", render: r => fmt(r.tp, 2) },

      { key: "shares", label: "Shares", render: r => (r.shares != null ? fmtInt(r.shares) : "–") },
      { key: "fee_usd", label: "Fee$", render: r => fmt(r.fee_usd, 2) },
      { key: "cost_usd", label: "Cost$", render: r => fmt(r.cost_usd, 2) },
      { key: "risk_usd", label: "Risk$", render: r => fmt(r.risk_usd, 2) },
      { key: "exp_profit_usd", label: "ExpProfit$", render: r => fmt(r.exp_profit_usd, 2) },
      { key: "cash_after_usd", label: "CashAfter$", render: r => fmt(r.cash_after_usd, 2) },

      // Ranking stats
      { key: "trades", label: "Trades", render: r => (r.stats?.trades != null ? fmtInt(r.stats.trades) : "–") },
      { key: "score", label: "Score", render: r => (r.stats?.score != null ? fmt(r.stats.score, 3) : "–") },
      { key: "meanR", label: "meanR", render: r => (r.stats?.mean_R != null ? fmt(r.stats.mean_R, 3) : "–") },
      { key: "pf", label: "PF", render: r => (r.stats?.pf != null ? fmt(r.stats.pf, 2) : "–") },
    ],
  },
};

function buildThead(theadEl, viewKey) {
  const view = VIEWS[viewKey];
  theadEl.innerHTML = "";
  const tr = document.createElement("tr");
  view.columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col.label;
    tr.appendChild(th);
  });
  theadEl.appendChild(tr);
}

function rowToTr(row, viewKey) {
  const view = VIEWS[viewKey];
  const tr = document.createElement("tr");

  view.columns.forEach((col, idx) => {
    const td = document.createElement("td");

    // Special styling for Events/News with optional badge
    if (col.key === "events") {
      const txt = col.render(row);
      if (row.overlay?.risk_flag) {
        const wrap = document.createElement("div");
        wrap.style.display = "flex";
        wrap.style.gap = "8px";
        wrap.style.alignItems = "center";
        wrap.appendChild(riskBadge(row.overlay.risk_flag));
        const span = document.createElement("span");
        span.textContent = txt;
        wrap.appendChild(span);
        td.appendChild(wrap);
      } else {
        td.textContent = txt;
      }
    } else {
      const v = col.render(row);
      td.textContent = (v === null || v === undefined || v === "") ? "–" : String(v);
    }

    tr.appendChild(td);
  });

  return tr;
}

async function main() {
  const metaEl = document.getElementById("meta");
  const linksEl = document.getElementById("links");
  const tbl = document.getElementById("tbl");
  const thead = tbl.querySelector("thead");
  const tbody = tbl.querySelector("tbody");

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
    opt.dataset.path = s.path; // points to latest.json
    strategySelect.appendChild(opt);
  });

  let current = {
    latest: null,
    archive: null,
    strategyId: null,
  };

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const latestPath = sel?.dataset?.path;
    if (!latestPath) return;

    metaEl.textContent = "Lade Report …";
    linksEl.innerHTML = "";
    tbody.innerHTML = "";
    current = { latest: null, archive: null, strategyId: sel.value };

    try {
      const latest = await loadJSON(latestPath);

      // latest.json uses: strategy, trend_suffix, asof, generated, paths
      const archiveRel = latest?.paths?.archive;
      if (!archiveRel) throw new Error(`latest.json hat kein paths.archive`);

      const archive = await loadJSON(archiveRel);

      current.latest = latest;
      current.archive = archive;

      metaEl.textContent =
        `asof: ${latest.asof} • strategy: ${latest.strategy} • generated: ${latest.generated} • rankings_dir: ${latest.paths?.rankings_dir || "–"}`;

      // Build CSV download links
      linksEl.innerHTML = "";
      const csv = latest?.paths?.csv || {};
      const linkItems = [
        ["Candidates Active (CSV)", csv.candidates_active],
        ["Candidates Edge (CSV)", csv.candidates_edge],
        ["Trade Plan (CSV)", csv.trade_plan],
        ["Position Plan (CSV)", csv.position_plan],
        ["Archive (JSON)", latest?.paths?.archive],
      ].filter(([, href]) => !!href);

      linkItems.forEach(([label, href]) => linksEl.appendChild(linkButton(href, label)));

      render();
    } catch (e) {
      metaEl.textContent = `Report nicht ladbar (${latestPath}): ${e.message}`;
      return;
    }
  }

  function render() {
    if (!current.latest || !current.archive) return;

    const viewKey = viewSelect.value;
    const view = VIEWS[viewKey];
    if (!view) return;

    buildThead(thead, viewKey);

    const rows = view.getRows(current.archive);
    const filtered = applyFilter(rows, search.value);

    title.textContent = `${strategySelect.selectedOptions[0]?.textContent || current.strategyId} — ${view.title}`;
    hint.textContent = `Anzahl: ${filtered.length} (von ${rows.length})`;

    tbody.innerHTML = "";
    filtered.forEach(r => tbody.appendChild(rowToTr(r, viewKey)));
  }

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
