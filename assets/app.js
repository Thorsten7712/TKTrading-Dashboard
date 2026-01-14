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

function applyFilter(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r =>
    String(r.symbol || "").toLowerCase().includes(s) ||
    String(r.universe || "").toLowerCase().includes(s)
  );
}

// ---------------- CSV parsing ----------------

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

      // numeric coercion (incl. scientific)
      const n = Number(raw);
      obj[key] = (!Number.isNaN(n) && /^[+-]?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(raw)) ? n : raw;
    }
    out.push(obj);
  }
  return out;
}

// ---------------- Rankings -> stats lookup ----------------

async function buildStatsLookup({ rankingsDir, universes, trendSuffix }) {
  const map = new Map();
  const missing = [];
  const loaded = [];

  if (!rankingsDir || !universes?.length) {
    return { map, missing, loaded };
  }

  for (const u of universes) {
    const url = `${rankingsDir}/ranking_${u}_${trendSuffix}_score.csv`;

    try {
      const txt = await loadText(url);
      const rows = parseCSV(txt);

      let cnt = 0;
      for (const r of rows) {
        const sym = String(r.symbol || "").trim();
        if (!sym) continue;

        // THESE NAMES MATCH YOUR CSV EXACTLY:
        // trades, score, mean_R, profit_factor
        map.set(`${u}__${sym}`, {
          trades: r.trades ?? null,
          score: r.score ?? null,
          mean_R: r.mean_R ?? null,
          pf: r.profit_factor ?? null, // PF column in UI
        });
        cnt++;
      }
      loaded.push(`${u}: ${cnt}`);
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

// ---------------- Table rendering ----------------

function rowToTr(r) {
  const tr = document.createElement("tr");

  // Hold: prefer explicit hold range, else show time_stop_bars
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
      td.textContent = (c === null || c === undefined || c === "") ? "–" : String(c);
    }
    tr.appendChild(td);
  });

  return tr;
}

// ---------------- Main ----------------

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

  let currentLatest = null;
  let rowsActive = [];
  let rowsEdge = [];

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const latestPath = sel?.dataset?.path;
    if (!latestPath) return;

    metaEl.textContent = "Lade …";
    linksEl.innerHTML = "";
    tblBody.innerHTML = "";
    rowsActive = [];
    rowsEdge = [];
    currentLatest = null;

    // 1) latest.json
    try {
      currentLatest = await loadJSON(latestPath);
    } catch (e) {
      metaEl.textContent = `latest.json nicht ladbar (${latestPath}): ${e.message}`;
      return;
    }

    const strategyId = currentLatest.strategy || sel.value;
    const trendSuffix = currentLatest.trend_suffix || "trend_off";
    const asof = currentLatest.asof || "–";
    const generated = currentLatest.generated || "–";

    // links
    const csv = currentLatest.paths?.csv || {};
    const linkItems = [
      ["Candidates Active (CSV)", csv.candidates_active],
      ["Candidates Edge (CSV)", csv.candidates_edge],
      ["Trade Plan (CSV)", csv.trade_plan],
      ["Position Plan (CSV)", csv.position_plan],
      ["Archive (JSON)", currentLatest.paths?.archive],
    ].filter(([, href]) => !!href);

    linkItems.forEach(([label, href]) => linksEl.appendChild(linkButton(href, label)));

    // 2) archive snapshot with actual rows
    const archivePath = currentLatest.paths?.archive;
    if (!archivePath) {
      metaEl.textContent = `latest.json hat keinen paths.archive`;
      return;
    }

    let snapshot;
    try {
      snapshot = await loadJSON(archivePath);
    } catch (e) {
      metaEl.textContent = `Archive nicht ladbar (${archivePath}): ${e.message}`;
      return;
    }

    const data = snapshot.data || {};
    rowsActive = Array.isArray(data.candidates_active) ? data.candidates_active : [];
    rowsEdge = Array.isArray(data.candidates_edge) ? data.candidates_edge : [];

    // universes from rows
    const universes = Array.from(
      new Set([...rowsActive, ...rowsEdge].map(r => String(r.universe || "").trim()).filter(Boolean))
    ).sort();

    // 3) rankings
    const rankingsDir =
      currentLatest.paths?.rankings_dir ||
      `data/${strategyId}/rankings`;

    const { map: statsMap, missing, loaded } = await buildStatsLookup({
      rankingsDir,
      universes,
      trendSuffix
    });

    // 4) enrich rows
    rowsActive = enrichWithStats(rowsActive, statsMap);
    rowsEdge = enrichWithStats(rowsEdge, statsMap);

    // Debug line in meta
    const dbg = [];
    dbg.push(`rankings_dir: ${rankingsDir}`);
    dbg.push(`rankings loaded: ${statsMap.size} symbols`);
    if (loaded.length) dbg.push(`files: ${loaded.join(", ")}`);
    if (missing.length) dbg.push(`missing: ${missing.join(" | ")}`);

    metaEl.textContent = `asof: ${asof} • strategy: ${strategyId} • generated: ${generated} • ${dbg.join(" • ")}`;

    render();
  }

  function render() {
    const view = viewSelect.value;
    const base = (view === "edge") ? rowsEdge : rowsActive;
    const filtered = applyFilter(base, search.value);

    title.textContent = `${(strategySelect.selectedOptions[0]?.textContent || "").trim()} — ${view === "edge" ? "Edge" : "Active"}`;
    hint.textContent = `Anzahl: ${filtered.length} (von ${base.length})`;

    tblBody.innerHTML = "";
    filtered.forEach(r => tblBody.appendChild(rowToTr(r)));
  }

  strategySelect.addEventListener("change", loadStrategy);
  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);

  await loadStrategy();
}

main();
