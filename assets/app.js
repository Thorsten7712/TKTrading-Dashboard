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
    // Helpful debug for GitHub Pages / invalid JSON (e.g. NaN, Infinity, trailing commas)
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

function buildEventsCell(overlay) {
  // overlay is optional; currently you mostly have "–"
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

function clearEl(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function setTableHeader(thead, cols) {
  clearEl(thead);
  const tr = document.createElement("tr");
  cols.forEach(c => {
    const th = document.createElement("th");
    th.textContent = c;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
}

function rowToTr_Generic(row, cols, renderers) {
  const tr = document.createElement("tr");
  cols.forEach((colKey) => {
    const td = document.createElement("td");
    const renderer = renderers[colKey];
    const val = renderer ? renderer(row) : row[colKey];
    td.textContent = (val === null || val === undefined || val === "") ? "–" : String(val);
    tr.appendChild(td);
  });
  return tr;
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

function normalizeStats(stats) {
  // stats come from export_dashboard enrichment:
  // { trades, score, mean_R, pf, ... }
  if (!stats) return null;
  return {
    trades: toNum(stats.trades),
    score: toNum(stats.score),
    meanR: toNum(stats.mean_R ?? stats.meanR),
    pf: toNum(stats.pf ?? stats.profit_factor),
  };
}

function pickRowsFromArchive(archive, view) {
  // archive schema:
  // { strategy, trend_suffix, asof, generated, data: { candidates_active, candidates_edge, trade_plan, position_plan } }
  const data = archive?.data || {};
  if (view === "active") return data.candidates_active || [];
  if (view === "edge") return data.candidates_edge || [];
  if (view === "trade_plan") return data.trade_plan || [];
  if (view === "position_plan") return data.position_plan || [];
  return [];
}

function computeRR(row) {
  // Prefer explicit rr if present. Else compute from buy/sl/tp.
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

function buildViewConfig(view) {
  // Return { title, cols(header labels), keys(for rendering), renderers }
  // We'll render by "keys" but show human-friendly headers.
  // Note: candidates vs plans have different columns.
  if (view === "trade_plan") {
    return {
      title: "Trade Plan",
      headers: ["Universe", "Symbol", "Mode", "Buy", "SL", "TP", "RR", "Hold", "Trades", "Score", "meanR", "PF"],
      keys:    ["universe","symbol","mode","buy","sl","tp","rr","hold","trades","score","meanR","pf"],
      renderers: {
        universe: r => r.universe ?? "–",
        symbol: r => r.symbol ?? "–",
        mode: r => r.mode ?? "–",
        buy: r => fmt(toNum(r.buy)),
        sl: r => fmt(toNum(r.sl)),
        tp: r => fmt(toNum(r.tp)),
        rr: r => fmt(computeRR(r), 2),
        hold: r => fmt(toNum(r.time_stop_bars ?? r.hold_bars ?? r.hold), 0),
        trades: r => {
          const s = normalizeStats(r.stats);
          return s?.trades ?? "–";
        },
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
      }
    };
  }

  if (view === "position_plan") {
    return {
      title: "Position Plan",
      headers: ["Universe", "Symbol", "Mode", "Buy", "SL", "TP", "Shares", "Cost$", "Risk$", "Fee$", "CashAfter$", "Trades", "Score", "meanR", "PF"],
      keys:    ["universe","symbol","mode","buy","sl","tp","shares","cost_usd","risk_usd","fee_usd","cash_after_usd","trades","score","meanR","pf"],
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
        trades: r => {
          const s = normalizeStats(r.stats);
          return s?.trades ?? "–";
        },
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
      }
    };
  }

  // Candidates (active/edge)
  return {
    title: view === "edge" ? "Candidates — Edge" : "Candidates — Active",
    headers: ["Universe", "Symbol", "Buy", "SL", "TP", "RR", "Hold", "Shares", "Risk$", "Fee$", "Trades", "Score", "meanR", "PF", "Events/News"],
    keys:    ["universe","symbol","buy","sl","tp","rr","hold","shares","risk_usd","fee_usd","trades","score","meanR","pf","events"],
    renderers: {
      universe: r => r.universe ?? "–",
      symbol: r => r.symbol ?? "–",
      buy: r => fmt(toNum(r.buy)),
      sl: r => fmt(toNum(r.sl)),
      tp: r => fmt(toNum(r.tp)),
      rr: r => fmt(computeRR(r), 2),
      hold: r => fmt(toNum(r.time_stop_bars ?? r.hold_bars ?? r.hold), 0),
      shares: r => (r.shares === undefined || r.shares === null) ? "–" : String(r.shares),
      risk_usd: r => fmt(toNum(r.risk_usd)),
      fee_usd: r => fmt(toNum(r.fee_usd)),
      trades: r => {
        const s = normalizeStats(r.stats);
        return s?.trades ?? "–";
      },
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
    }
  };
}

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
    opt.dataset.path = s.path; // latest.json
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

    // 1) latest.json
    try {
      latest = await loadJSON(latestPath);
    } catch (e) {
      metaEl.textContent = `Report nicht ladbar (${latestPath}): ${e.message}`;
      return;
    }

    // 2) archive json (contains the actual rows + stats)
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

    const view = viewSelect.value;
    const cfg = buildViewConfig(view);

    titleEl.textContent = `${(strategySelect.selectedOptions[0]?.textContent || "").trim()} — ${cfg.title}`;

    const rows = pickRowsFromArchive(archive, view);
    const filtered = applyFilter(rows, search.value);

    hintEl.textContent = `Anzahl: ${filtered.length} (von ${rows.length})`;

    setTableHeader(thead, cfg.headers);

    clearEl(tbody);
    filtered.forEach(r => {
      const tr = rowToTr_Generic(r, cfg.keys, cfg.renderers);
      tbody.appendChild(tr);
    });
  }

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
