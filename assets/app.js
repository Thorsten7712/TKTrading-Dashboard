async function loadJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.json();
}

function fmt(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "–";
  if (typeof x === "number") return x.toFixed(digits);
  return String(x);
}

function linkButton(href, label) {
  const a = document.createElement("a");
  a.href = href;
  a.textContent = label;
  return a;
}

function riskBadge(flag) {
  const span = document.createElement("span");
  span.className = "badge " + (flag || "");
  span.textContent = flag ? flag.toUpperCase() : "–";
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

function rowToTr(r) {
  const tr = document.createElement("tr");
  const cells = [
    r.universe,
    r.symbol,
    fmt(r.buy),
    fmt(r.sl),
    fmt(r.tp),
    fmt(r.rr, 2),
    (r.hold_days_min && r.hold_days_max) ? `${r.hold_days_min}-${r.hold_days_max}d` : "–",
    r.shares ?? "–",
    fmt(r.risk_usd, 2),
    fmt(r.fee_usd, 2),
    r.stats?.trades ?? "–",
    fmt(r.stats?.score, 3),
    fmt(r.stats?.mean_R, 3),
    fmt(r.stats?.pf, 2),
    buildEventsCell(r.overlay)
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

  let currentData = null;

  async function loadStrategy() {
    const sel = strategySelect.selectedOptions[0];
    const path = sel?.dataset?.path;
    if (!path) return;

    metaEl.textContent = "Lade Report …";
    linksEl.innerHTML = "";
    tblBody.innerHTML = "";
    currentData = null;

    try {
      currentData = await loadJSON(path);
    } catch (e) {
      metaEl.textContent = `Report nicht ladbar (${path}): ${e.message}`;
      return;
    }

    metaEl.textContent = `asof: ${currentData.asof} • strategy: ${currentData.strategy_id} • generated: ${currentData.generated_utc || "–"}`;

    // Build links (optional; expected to be repo-relative paths inside private repo outputs,
    // but here in dashboard we only link if they were copied into this repo too)
    const links = currentData.links || {};
    const linkItems = [
      ["Candidates Active", links.candidates_active_csv],
      ["Candidates Edge", links.candidates_edge_csv],
      ["Trade Plan", links.trade_plan_csv],
      ["Position Plan", links.position_plan_csv],
    ].filter(([, href]) => !!href);

    // If you also copy those CSVs into dashboard, keep them relative. Otherwise leave links empty.
    linkItems.forEach(([label, href]) => linksEl.appendChild(linkButton(href, label)));

    render();
  }

  function render() {
    if (!currentData) return;
    const view = viewSelect.value;
    const rows = (view === "edge" ? (currentData.edge || []) : (currentData.active || []));
    const filtered = applyFilter(rows, search.value);

    title.textContent = `${(strategySelect.selectedOptions[0]?.textContent || "").trim()} — ${view === "edge" ? "Edge" : "Active"}`;
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
