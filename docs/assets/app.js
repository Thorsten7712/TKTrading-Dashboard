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
      // prepend badge
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

function applyFilter(rows, q) {
  if (!q) return rows;
  const s = q.toLowerCase();
  return rows.filter(r =>
    String(r.symbol || "").toLowerCase().includes(s) ||
    String(r.universe || "").toLowerCase().includes(s)
  );
}

async function main() {
  const metaEl = document.getElementById("meta");
  const linksEl = document.getElementById("links");
  const tblBody = document.querySelector("#tbl tbody");
  const viewSelect = document.getElementById("viewSelect");
  const search = document.getElementById("search");
  const title = document.getElementById("tableTitle");
  const hint = document.getElementById("hint");

  let data;
  try {
    data = await loadJSON("data/latest.json");
  } catch (e) {
    metaEl.textContent = `Fehler beim Laden: ${e.message}`;
    return;
  }

  metaEl.textContent = `asof: ${data.asof} • strategy: ${data.strategy_id} • generated: ${data.generated_utc || "–"}`;

  // Build links (repo-relative)
  linksEl.innerHTML = "";
  const links = data.links || {};
  const linkItems = [
    ["Candidates Active", links.candidates_active_csv],
    ["Candidates Edge", links.candidates_edge_csv],
    ["Trade Plan", links.trade_plan_csv],
    ["Position Plan", links.position_plan_csv],
  ].filter(([, href]) => !!href);

  linkItems.forEach(([label, href]) => linksEl.appendChild(linkButton("../" + href, label)));

  function render() {
    const view = viewSelect.value;
    const rows = (view === "edge" ? (data.edge || []) : (data.active || []));
    const filtered = applyFilter(rows, search.value);

    title.textContent = view === "edge" ? "Edge Candidates" : "Active Candidates";
    hint.textContent = `Anzahl: ${filtered.length} (von ${rows.length})`;

    tblBody.innerHTML = "";
    filtered.forEach(r => tblBody.appendChild(rowToTr(r)));
  }

  viewSelect.addEventListener("change", render);
  search.addEventListener("input", render);
  render();
}

main();
