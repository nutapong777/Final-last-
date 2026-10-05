/* Interactive dashboard: อุบัติเหตุบนทางหลวงไทย ปี 2562 (Plotly.js)
 * ข้อมูล: data/accidents.json (UTF-8) สร้างจาก scripts/prepare_web_data.py
 * Interactivity: filter (dropdown + cross-filter จากการคลิกกราฟ), tooltip, zoom (แผนที่ + กราฟรายวัน),
 *                drilldown (เดือน → วัน, ภาค → จังหวัด), transition (แอนิเมชันตอนข้อมูลเปลี่ยน)
 */
(() => {
  "use strict";

  const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  const MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const DOW = ["จันทร์", "อังคาร", "พุธ", "พฤหัสฯ", "ศุกร์", "เสาร์", "อาทิตย์"];
  const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 2019 ไม่ใช่ปีอธิกสุรทิน
  const TRANSITION = { duration: 450, easing: "cubic-in-out" };
  const CONFIG = {
    responsive: true, displaylogo: false, locale: "th",
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoScale2d", "toggleSpikelines", "hoverClosestCartesian", "hoverCompareCartesian"],
  };
  // ใช้แอนิเมชันเฉพาะเมื่อแกน/หมวดหมู่เหมือนรอบก่อน (ถ้าโครงสร้างเปลี่ยน ให้วาดใหม่ทันทีเพื่อให้ layout ถูกต้อง)
  const lastSig = {};
  function transitionFor(key, sig) {
    const same = lastSig[key] === sig;
    lastSig[key] = sig;
    return same ? TRANSITION : { duration: 0 };
  }
  const fmt = (n) => Math.round(n).toLocaleString("th-TH");
  const fmt1 = (n) => n.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  // ---------- state ----------
  const state = {
    region: null, province: null, month: null, vehicle: null, cause: null, weather: null,
    trendMetric: "count", vehMetric: "count",
  };
  let DB, I, D; // ข้อมูล, ดัชนีฟิลด์, dictionaries
  let provinceRegion = []; // province index -> region index

  // ---------- theme (อ่านสีจาก CSS variables) ----------
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  function theme() {
    return {
      surface: css("--surface"), text: css("--text"), text2: css("--text-2"), text3: css("--text-3"),
      grid: css("--grid"), accent: css("--accent"), soft: css("--accent-soft"), fatal: css("--fatal"),
      other: css("--other"), seq: css("--seq").split(",").map((s) => s.trim()),
      cat: css("--cat").split(",").map((s) => s.trim()),
      dark: document.documentElement.dataset.theme === "dark" ||
        (!document.documentElement.dataset.theme && window.matchMedia("(prefers-color-scheme: dark)").matches),
    };
  }
  function baseLayout(t, extra = {}) {
    return Object.assign({
      paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
      font: { family: '"IBM Plex Sans Thai", system-ui, sans-serif', color: t.text2, size: 12 },
      margin: { l: 48, r: 12, t: 10, b: 40 },
      hoverlabel: { bgcolor: t.surface, bordercolor: t.grid, font: { color: t.text, family: '"IBM Plex Sans Thai", sans-serif', size: 13 } },
      transition: TRANSITION,
      showlegend: false,
    }, extra);
  }
  const axis = (t, extra = {}) => Object.assign({
    gridcolor: t.grid, zeroline: false, linecolor: t.grid, tickcolor: t.grid,
    tickfont: { color: t.text2 }, automargin: true,
  }, extra);
  const isMobile = () => window.innerWidth < 640;

  // ---------- data ----------
  function rowsFor(exclude = []) {
    const ex = new Set(exclude);
    const f = state;
    return DB.rows.filter((r) =>
      (ex.has("region") || f.region === null || r[I.region] === f.region) &&
      (ex.has("province") || f.province === null || r[I.province] === f.province) &&
      (ex.has("month") || f.month === null || r[I.month] === f.month) &&
      (ex.has("vehicle") || f.vehicle === null || r[I.vehicle] === f.vehicle) &&
      (ex.has("cause") || f.cause === null || r[I.cause] === f.cause) &&
      (ex.has("weather") || f.weather === null || r[I.weather] === f.weather));
  }
  const sum = (rows, k) => rows.reduce((a, r) => a + r[I[k]], 0);

  // ---------- filters UI ----------
  const sel = (id) => document.getElementById(id);
  function fillSelect(el, allLabel, items) {
    el.innerHTML = "";
    el.append(new Option(allLabel, ""));
    items.forEach(([value, label]) => el.append(new Option(label, value)));
  }
  function buildFilters() {
    fillSelect(sel("f-region"), "ทุกภาค", D.region.map((r, i) => [i, "ภาค" + r]).sort((a, b) => a[1].localeCompare(b[1], "th")));
    fillSelect(sel("f-month"), "ทุกเดือน", MONTHS_FULL.map((m, i) => [i + 1, m]));
    fillSelect(sel("f-vehicle"), "ทุกประเภท", D.vehicle.map((v, i) => [i, v]));
    fillSelect(sel("f-cause"), "ทุกมูลเหตุ", D.cause.map((v, i) => [i, v]));
    fillSelect(sel("f-weather"), "ทุกสภาพอากาศ", D.weather.map((v, i) => [i, v]));
    const bind = (id, key, after) => sel(id).addEventListener("change", (e) => {
      state[key] = e.target.value === "" ? null : +e.target.value;
      if (after) after();
      render();
    });
    bind("f-region", "region", () => {
      if (state.province !== null && provinceRegion[state.province] !== state.region) state.province = null;
    });
    bind("f-province", "province", () => { if (state.province !== null) state.region = provinceRegion[state.province]; });
    bind("f-month", "month");
    bind("f-vehicle", "vehicle");
    bind("f-cause", "cause");
    bind("f-weather", "weather");
    sel("reset").addEventListener("click", () => {
      Object.assign(state, { region: null, province: null, month: null, vehicle: null, cause: null, weather: null });
      render();
    });
  }
  function syncFilters() {
    const provinces = D.province.map((p, i) => [i, p])
      .filter(([i]) => state.region === null || provinceRegion[i] === state.region)
      .sort((a, b) => a[1].localeCompare(b[1], "th"));
    fillSelect(sel("f-province"), "ทุกจังหวัด", provinces);
    const set = (id, v) => { sel(id).value = v === null ? "" : String(v); };
    set("f-region", state.region); set("f-province", state.province); set("f-month", state.month);
    set("f-vehicle", state.vehicle); set("f-cause", state.cause); set("f-weather", state.weather);

    const chips = [];
    if (state.region !== null) chips.push(["region", "ภาค", D.region[state.region]]);
    if (state.province !== null) chips.push(["province", "จังหวัด", D.province[state.province]]);
    if (state.month !== null) chips.push(["month", "เดือน", MONTHS_FULL[state.month - 1]]);
    if (state.vehicle !== null) chips.push(["vehicle", "รถ", D.vehicle[state.vehicle]]);
    if (state.cause !== null) chips.push(["cause", "มูลเหตุ", D.cause[state.cause]]);
    if (state.weather !== null) chips.push(["weather", "อากาศ", D.weather[state.weather]]);
    const box = sel("chips");
    box.innerHTML = "";
    chips.forEach(([key, label, value]) => {
      const b = document.createElement("button");
      b.className = "chip"; b.type = "button";
      b.setAttribute("aria-label", `ลบตัวกรอง ${label} ${value}`);
      b.innerHTML = `${label}: <b></b><span aria-hidden="true">×</span>`;
      b.querySelector("b").textContent = value;
      b.addEventListener("click", () => {
        state[key] = null;
        if (key === "region") state.province = null;
        render();
      });
      box.append(b);
    });
  }

  // ---------- KPI (นับเลขแบบมีแอนิเมชัน) ----------
  const kpiPrev = {};
  function animateNumber(id, to, formatter) {
    const el = sel(id);
    const from = kpiPrev[id] ?? 0;
    kpiPrev[id] = to;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { el.textContent = formatter(to); return; }
    const start = performance.now(), dur = 500;
    const step = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = formatter(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function renderKpis() {
    const rows = rowsFor();
    const n = rows.length, deaths = sum(rows, "deaths"), inj = sum(rows, "injuries");
    animateNumber("k-count", n, fmt);
    animateNumber("k-deaths", deaths, fmt);
    animateNumber("k-injuries", inj, fmt);
    animateNumber("k-rate", n ? (deaths / n) * 100 : 0, fmt1);
  }

  // ---------- 1) Trend: line chart + drilldown เดือน → วัน ----------
  function renderTrend(t) {
    const metric = state.trendMetric;
    const metricLabel = metric === "count" ? "อุบัติเหตุ (ครั้ง)" : "ผู้เสียชีวิต (คน)";
    const val = (r) => (metric === "count" ? 1 : r[I.deaths]);
    let x, y, hover, layoutX, title, sub;

    if (state.month === null) {
      const rows = rowsFor(["month"]);
      y = new Array(12).fill(0);
      rows.forEach((r) => { y[r[I.month] - 1] += val(r); });
      x = MONTHS;
      hover = MONTHS_FULL.map((m, i) => `<b>${m} 2562</b><br>${metricLabel}: ${fmt(y[i])}<extra></extra>`);
      layoutX = axis(t, { type: "category", fixedrange: true, tickangle: 0, tickfont: { color: t.text2, size: isMobile() ? 9 : 12 } });
      title = metric === "count" ? "จำนวนอุบัติเหตุรายเดือน" : "ผู้เสียชีวิตรายเดือน";
      const mx = y.indexOf(Math.max(...y));
      const avg = y.reduce((a, b) => a + b, 0) / 12;
      sub = y.some((v) => v > 0)
        ? `สูงสุดเดือน${MONTHS_FULL[mx]} ${fmt(y[mx])} — สูงกว่าค่าเฉลี่ยต่อเดือน (${fmt(avg)}) ${fmt1(((y[mx] - avg) / avg) * 100)}%`
        : "ไม่มีข้อมูลตามตัวกรอง";
    } else {
      const m = state.month, days = DAYS_IN_MONTH[m - 1];
      const rows = rowsFor();
      y = new Array(days).fill(0);
      rows.forEach((r) => { y[r[I.day] - 1] += val(r); });
      x = Array.from({ length: days }, (_, i) => i + 1);
      hover = x.map((d, i) => {
        const dow = DOW[(new Date(2019, m - 1, d).getDay() + 6) % 7];
        return `<b>วัน${dow}ที่ ${d} ${MONTHS_FULL[m - 1]} 2562</b><br>${metricLabel}: ${fmt(y[i])}<extra></extra>`;
      });
      layoutX = axis(t, { title: { text: `วันที่ (${MONTHS_FULL[m - 1]})`, font: { size: 12 } }, dtick: isMobile() ? 5 : 2, range: [0.5, days + 0.5] });
      title = (metric === "count" ? "จำนวนอุบัติเหตุรายวัน — " : "ผู้เสียชีวิตรายวัน — ") + MONTHS_FULL[m - 1];
      const mx = y.indexOf(Math.max(...y));
      sub = y.some((v) => v > 0) ? `วันที่เกิดเหตุสูงสุด: ${mx + 1} ${MONTHS_FULL[m - 1]} (${fmt(y[mx])})` : "ไม่มีข้อมูลตามตัวกรอง";
    }
    sel("t-trend").textContent = title;
    sel("s-trend").textContent = sub;
    sel("trend-back").hidden = state.month === null;

    const color = metric === "count" ? t.accent : t.fatal;
    const trace = {
      x, y, type: "scatter", mode: "lines+markers",
      line: { color, width: 2, shape: "spline", smoothing: 0.5 },
      marker: { color, size: 8, line: { color: t.surface, width: 2 } },
      fill: "tozeroy", fillcolor: color + "1f",
      hovertemplate: hover,
    };
    const annotations = [];
    if (state.month === null && metric === "count" && y[3] > 0 && y[11] > 0) {
      [[3, "สงกรานต์"], [11, "ปีใหม่"]].forEach(([i, label]) => annotations.push({
        x: MONTHS[i], y: y[i], text: label, showarrow: true, arrowhead: 0, ax: 0, ay: -26,
        font: { color: t.text, size: 12 }, arrowcolor: t.text3, bgcolor: t.surface,
      }));
    }
    const layout = baseLayout(t, {
      xaxis: layoutX,
      yaxis: axis(t, { title: { text: metricLabel, font: { size: 12 } }, rangemode: "tozero", fixedrange: true }),
      annotations, hovermode: "closest",
      dragmode: state.month === null ? false : "zoom",
      transition: transitionFor("trend", `${state.month}-${metric}-${isMobile()}`),
      margin: { l: 56, r: 12, t: 30, b: 44 },
    });
    Plotly.react("c-trend", [trace], layout, CONFIG);
  }

  // ---------- 2) Area: bar chart + drilldown ภาค → จังหวัด ----------
  function renderArea(t) {
    const rows = rowsFor(["region", "province"]);
    let labels, values, ids, level;
    if (state.region === null) {
      level = "region";
      const c = new Array(D.region.length).fill(0);
      rows.forEach((r) => c[r[I.region]]++);
      ids = c.map((_, i) => i).sort((a, b) => c[b] - c[a]);
      labels = ids.map((i) => "ภาค" + D.region[i]);
      values = ids.map((i) => c[i]);
    } else {
      level = "province";
      const c = new Map();
      rows.forEach((r) => { if (r[I.region] === state.region) c.set(r[I.province], (c.get(r[I.province]) || 0) + 1); });
      ids = [...c.keys()].sort((a, b) => c.get(b) - c.get(a));
      labels = ids.map((i) => D.province[i]);
      values = ids.map((i) => c.get(i));
    }
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const colors = ids.map((i) => (level === "province" && state.province !== null && state.province !== i) ? t.soft : t.accent);
    const trace = {
      type: "bar", orientation: "h", x: values.slice().reverse(), y: labels.slice().reverse(),
      customdata: ids.slice().reverse(),
      marker: { color: colors.slice().reverse(), cornerradius: 4 },
      text: values.slice().reverse().map((v) => fmt(v)), textposition: "outside", cliponaxis: false,
      textfont: { color: t.text2, size: 11 },
      hovertemplate: values.slice().reverse().map((v, k) =>
        `<b>${labels.slice().reverse()[k]}</b><br>อุบัติเหตุ: ${fmt(v)} ครั้ง (${fmt1((v / total) * 100)}%)<br><i>${level === "region" ? "คลิกเพื่อดูรายจังหวัด" : "คลิกเพื่อกรอง"}</i><extra></extra>`),
    };
    const layout = baseLayout(t, {
      xaxis: axis(t, { showgrid: true, fixedrange: true, showticklabels: false, range: [0, Math.max(1, ...values) * 1.15] }),
      yaxis: axis(t, { fixedrange: true, ticksuffix: "  " }),
      bargap: Math.max(0.28, 1 - ids.length / 9), margin: { l: 10, r: 44, t: 4, b: 10 },
      transition: transitionFor("area", labels.join("|") + (isMobile() ? "m" : "")),
    });
    renderArea.lastLevel = level;
    renderArea.ids = ids;
    renderArea.level = level;
    Plotly.react("c-area", [trace], layout, CONFIG);

    const top = ids[0];
    sel("s-area").textContent = !values.length ? "ไม่มีข้อมูลตามตัวกรอง"
      : level === "region" ? `ภาค${D.region[top]} สูงสุด ${fmt1((values[0] / total) * 100)}% ของอุบัติเหตุทั้งหมด`
        : `${D.province[top]} สูงสุดในภาค${D.region[state.region]} (${fmt(values[0])} ครั้ง)`;
    const cr = sel("crumbs");
    cr.innerHTML = "";
    const add = (text, onClick) => {
      if (cr.childNodes.length) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "›"; cr.append(s); }
      if (onClick) { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.onclick = onClick; cr.append(b); }
      else { const s = document.createElement("span"); s.textContent = text; cr.append(s); }
    };
    add("ทุกภาค", state.region !== null ? () => { state.region = null; state.province = null; render(); } : null);
    if (state.region !== null) add("ภาค" + D.region[state.region], state.province !== null ? () => { state.province = null; render(); } : null);
    if (state.province !== null) add(D.province[state.province]);
  }

  // ---------- 3) Map: scatter map + zoom/pan ----------
  function renderMap(t) {
    const rows = rowsFor();
    const groups = [[], []]; // 0 = ไม่มีผู้เสียชีวิต, 1 = มีผู้เสียชีวิต
    rows.forEach((r) => groups[r[I.deaths] > 0 ? 1 : 0].push(r));
    const text = (r) => {
      const hh = String(r[I.hour]).padStart(2, "0"), mm = String(r[I.minute]).padStart(2, "0");
      return `<b>${r[I.day]} ${MONTHS[r[I.month] - 1]} 2562 · ${hh}:${mm} น.</b><br>` +
        `${D.province[r[I.province]]} · ${D.route[r[I.route]]}<br>` +
        `รถ: ${D.vehicle[r[I.vehicle]]}<br>มูลเหตุ: ${D.cause[r[I.cause]]}<br>` +
        `ลักษณะ: ${D.crash[r[I.crash]]}<br>เสียชีวิต ${r[I.deaths]} · บาดเจ็บ ${r[I.injuries]}`;
    };
    const mk = (g, name, color, size, opacity) => ({
      type: "scattermap", name: `${name} (${fmt(g.length)})`, mode: "markers",
      lat: g.map((r) => r[I.lat]), lon: g.map((r) => r[I.lon]),
      text: g.map(text), hovertemplate: "%{text}<extra></extra>",
      marker: { color, size, opacity },
    });
    const traces = [
      mk(groups[0], "ไม่มีผู้เสียชีวิต", t.accent, isMobile() ? 4 : 5, 0.5),
      mk(groups[1], "มีผู้เสียชีวิต", t.fatal, isMobile() ? 4.5 : 5.5, 0.75),
    ];
    // จุดศูนย์กลาง/ระดับซูมตามตัวกรองพื้นที่
    let center = { lat: 13.0, lon: 100.9 }, zoom = isMobile() ? 3.9 : 4.25;
    if ((state.province !== null || state.region !== null) && rows.length) {
      const lats = rows.map((r) => r[I.lat]).sort((a, b) => a - b), lons = rows.map((r) => r[I.lon]).sort((a, b) => a - b);
      const q = (a, p) => a[Math.floor((a.length - 1) * p)];
      center = { lat: (q(lats, 0.05) + q(lats, 0.95)) / 2, lon: (q(lons, 0.05) + q(lons, 0.95)) / 2 };
      const span = Math.max(q(lats, 0.95) - q(lats, 0.05), q(lons, 0.95) - q(lons, 0.05), 0.3);
      zoom = Math.max(4, Math.min(10, Math.log2(360 / span) - (isMobile() ? 1.9 : 1.4)));
    }
    const layout = baseLayout(t, {
      map: { style: t.dark ? "carto-darkmatter" : "carto-positron", center, zoom },
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: true,
      legend: { x: 0.01, y: 0.99, bgcolor: t.surface + "e6", bordercolor: t.grid, borderwidth: 1, font: { color: t.text, size: 12 } },
      uirevision: `${state.region}-${state.province}`,
      transition: { duration: 0 },
    });
    Plotly.react("c-map", traces, layout, CONFIG);
    sel("s-map").textContent = rows.length
      ? `${fmt(rows.length)} จุด · มีผู้เสียชีวิต ${fmt(groups[1].length)} จุด (${fmt1((groups[1].length / rows.length) * 100)}%)`
      : "ไม่มีข้อมูลตามตัวกรอง";
  }

  // ---------- 4) Cause: donut ----------
  function renderCause(t) {
    const rows = rowsFor(["cause"]);
    const c = new Map();
    rows.forEach((r) => c.set(r[I.cause], (c.get(r[I.cause]) || 0) + 1));
    const sorted = [...c.keys()].sort((a, b) => c.get(b) - c.get(a));
    const TOP = 6;
    let top = sorted.slice(0, TOP);
    if (state.cause !== null && !top.includes(state.cause) && c.has(state.cause)) top = [...top.slice(0, TOP - 1), state.cause];
    const rest = sorted.filter((k) => !top.includes(k));
    const restCount = rest.reduce((a, k) => a + c.get(k), 0);
    const labels = top.map((k) => D.cause[k]), values = top.map((k) => c.get(k)), ids = [...top];
    // สีตามมูลเหตุ (คงที่ ไม่เปลี่ยนตามอันดับ)
    const colors = top.map((k) => (k < TOP ? t.cat[k] : t.cat[TOP - 1]));
    if (restCount) { labels.push(`มูลเหตุอื่น ${rest.length} ประเภท`); values.push(restCount); ids.push(-1); colors.push(t.other); }
    const total = values.reduce((a, b) => a + b, 0) || 1;
    const trace = {
      type: "pie", hole: 0.58, labels, values, customdata: ids, sort: false, direction: "clockwise",
      marker: { colors: colors.map((col, i) => (state.cause !== null && ids[i] !== state.cause) ? col + "55" : col), line: { color: t.surface, width: 2 } },
      pull: ids.map((k) => (k === state.cause ? 0.06 : 0)),
      textinfo: "percent", textposition: "inside", insidetextorientation: "horizontal",
      textfont: { color: "#fff", size: 12 },
      hovertemplate: "<b>%{label}</b><br>%{value:,} ครั้ง (%{percent})<extra></extra>",
    };
    const layout = baseLayout(t, {
      showlegend: true,
      legend: isMobile()
        ? { orientation: "h", x: 0, y: -0.05, yanchor: "top", font: { color: t.text, size: 12 } }
        : { x: 0.56, xanchor: "left", y: 0.5, yanchor: "middle", font: { color: t.text, size: 12 } },
      margin: isMobile() ? { l: 4, r: 4, t: 4, b: 4 } : { l: 4, r: 4, t: 10, b: 10 },
      annotations: [{
        text: `<b>${fmt(total)}</b><br><span style="font-size:11px">ครั้ง</span>`, showarrow: false, x: 0.5, y: 0.5,
        xref: "paper", yref: "paper", font: { size: 18, color: t.text },
      }],
    });
    if (!isMobile()) { trace.domain = { x: [0, 0.52] }; layout.annotations[0].x = 0.26; }
    else { trace.domain = { x: [0, 1], y: [0.42, 1] }; layout.annotations[0].y = 0.71; }
    Plotly.react("c-cause", [trace], layout, CONFIG);
    renderCause.ids = ids;
    sel("s-cause").textContent = values.length
      ? `อันดับ 1: ${labels[0]} (${fmt1((values[0] / total) * 100)}%)` : "ไม่มีข้อมูลตามตัวกรอง";
  }

  // ---------- 5) Heatmap: วัน × ชั่วโมง ----------
  function renderHeat(t) {
    const rows = rowsFor();
    const z = Array.from({ length: 7 }, () => new Array(24).fill(0));
    rows.forEach((r) => z[r[I.dow]][r[I.hour]]++);
    const hours = Array.from({ length: 24 }, (_, h) => h);
    const colorscale = t.seq.map((c, i) => [i / (t.seq.length - 1), c]);
    const trace = {
      type: "heatmap", z, x: hours, y: DOW, colorscale, xgap: 2, ygap: 2,
      hovertemplate: "<b>วัน%{y} เวลา %{x}:00–%{x}:59 น.</b><br>อุบัติเหตุ: %{z:,} ครั้ง<extra></extra>",
      colorbar: { thickness: 10, outlinewidth: 0, tickfont: { color: t.text2, size: 11 }, len: 0.9,
        title: { text: "ครั้ง", side: "top", font: { color: t.text2, size: 11 } } },
    };
    const layout = baseLayout(t, {
      xaxis: axis(t, { title: { text: "ชั่วโมง (น.)", font: { size: 12 } }, dtick: isMobile() ? 4 : 2, fixedrange: true, showgrid: false }),
      yaxis: axis(t, { autorange: "reversed", fixedrange: true, showgrid: false }),
      margin: { l: 60, r: 8, t: 8, b: 44 },
    });
    Plotly.react("c-heat", [trace], layout, CONFIG);
    let best = [0, 0];
    z.forEach((row, d) => row.forEach((v, h) => { if (v > z[best[0]][best[1]]) best = [d, h]; }));
    const hourTot = hours.map((h) => z.reduce((a, row) => a + row[h], 0));
    const peakH = hourTot.indexOf(Math.max(...hourTot));
    sel("s-heat").textContent = rows.length
      ? `ช่วงเวลาที่เกิดเหตุมากที่สุด ${peakH}:00–${peakH}:59 น. · ช่องสูงสุด: วัน${DOW[best[0]]} ${best[1]}:00 น.`
      : "ไม่มีข้อมูลตามตัวกรอง";
  }

  // ---------- 6) Vehicle: bar chart (จำนวน / ความรุนแรง) ----------
  function renderVehicle(t) {
    const rows = rowsFor(["vehicle"]);
    const n = new Map(), dth = new Map();
    rows.forEach((r) => {
      const v = r[I.vehicle];
      n.set(v, (n.get(v) || 0) + 1);
      dth.set(v, (dth.get(v) || 0) + r[I.deaths]);
    });
    const rate = state.vehMetric === "rate";
    let ids = [...n.keys()];
    if (rate) ids = ids.filter((v) => n.get(v) >= 30);
    const metric = (v) => (rate ? (dth.get(v) / n.get(v)) * 100 : n.get(v));
    ids.sort((a, b) => metric(b) - metric(a));
    ids = ids.slice(0, 10);
    const short = (s) => s.replace("รถยนต์นั่งส่วนบุคคล/รถยนต์นั่งสาธารณะ", "รถยนต์นั่ง").replace("รถบรรทุกมากกว่า 6 ล้อ ไม่เกิน 10 ล้อ", "รถบรรทุก 7–10 ล้อ")
      .replace("รถบรรทุกมากกว่า 10 ล้อ (รถพ่วง)", "รถบรรทุก >10 ล้อ (พ่วง)").replace("รถอีแต๋น/เพื่อการเกษตร", "รถอีแต๋น");
    const color = rate ? t.fatal : t.accent;
    const ys = ids.map((v) => short(D.vehicle[v]));
    const xs = ids.map(metric);
    const trace = {
      type: "bar", orientation: "h", y: ys.slice().reverse(), x: xs.slice().reverse(), customdata: ids.slice().reverse(),
      marker: {
        color: ids.slice().reverse().map((v) => (state.vehicle !== null && state.vehicle !== v) ? color + "40" : color),
        cornerradius: 4,
      },
      text: xs.slice().reverse().map((v) => (rate ? fmt1(v) : fmt(v))), textposition: "outside", cliponaxis: false,
      textfont: { color: t.text2, size: 11 },
      hovertemplate: ids.slice().reverse().map((v) =>
        `<b>${D.vehicle[v]}</b><br>อุบัติเหตุ: ${fmt(n.get(v))} ครั้ง<br>ผู้เสียชีวิต: ${fmt(dth.get(v))} คน<br>` +
        `ความรุนแรง: ${fmt1((dth.get(v) / n.get(v)) * 100)} คน/100 ครั้ง<extra></extra>`),
    };
    const layout = baseLayout(t, {
      xaxis: axis(t, { fixedrange: true, showticklabels: false, range: [0, Math.max(1, ...xs) * 1.15], title: { text: rate ? "ผู้เสียชีวิตต่อ 100 ครั้ง" : "จำนวนอุบัติเหตุ (ครั้ง)", font: { size: 12 } } }),
      yaxis: axis(t, { fixedrange: true, ticksuffix: "  " }),
      bargap: Math.max(0.3, 1 - ids.length / 9), margin: { l: 10, r: 48, t: 4, b: 36 },
      transition: transitionFor("veh", ys.join("|") + (isMobile() ? "m" : "")),
    });
    renderVehicle.ids = ids;
    Plotly.react("c-vehicle", [trace], layout, CONFIG);
    sel("t-vehicle").textContent = rate ? "ความรุนแรงตามประเภทรถคันที่ 1" : "ประเภทรถคันที่ 1";
    sel("s-vehicle").textContent = !ids.length ? "ไม่มีข้อมูลตามตัวกรอง"
      : rate ? `${D.vehicle[ids[0]]} รุนแรงที่สุด: เสียชีวิต ${fmt1(metric(ids[0]))} คนต่อ 100 ครั้ง`
        : `${D.vehicle[ids[0]]} เกิดเหตุมากที่สุด (${fmt(n.get(ids[0]))} ครั้ง)`;
  }


  // ---------- ข้อค้นพบสำคัญ (คำนวณจากข้อมูลทั้งปี ไม่ขึ้นกับตัวกรอง) ----------
  function renderInsights() {
    const rows = DB.rows, n = rows.length;
    const totalDeaths = sum(rows, "deaths");
    const fest = rows.filter((r) => r[I.month] === 4 || r[I.month] === 12).length;
    const cause = new Map(), hour = new Array(24).fill(0), vn = new Map(), vd = new Map();
    rows.forEach((r) => {
      cause.set(r[I.cause], (cause.get(r[I.cause]) || 0) + 1);
      hour[r[I.hour]]++;
      vn.set(r[I.vehicle], (vn.get(r[I.vehicle]) || 0) + 1);
      vd.set(r[I.vehicle], (vd.get(r[I.vehicle]) || 0) + r[I.deaths]);
    });
    const topCause = [...cause.entries()].sort((x, y) => y[1] - x[1])[0];
    const peakH = hour.indexOf(Math.max(...hour));
    const avgRate = (totalDeaths / n) * 100;
    const worst = [...vn.keys()].filter((v) => vn.get(v) >= 100)
      .map((v) => [v, (vd.get(v) / vn.get(v)) * 100]).sort((x, y) => y[1] - x[1])[0];
    const items = [
      [`${fmt1((fest / n) * 100)}%`, `ของอุบัติเหตุทั้งปีเกิดในเดือนเมษายนและธันวาคม (สงกรานต์–ปีใหม่) ทั้งที่เป็นแค่ 2 จาก 12 เดือน`],
      [`${fmt1((topCause[1] / n) * 100)}%`, `มีมูลเหตุจาก "${D.cause[topCause[0]]}" มากกว่ามูลเหตุอื่นทั้งหมดรวมกัน`],
      [`${peakH}:00–${peakH}:59 น.`, `ชั่วโมงที่เกิดเหตุมากที่สุดของวัน (${fmt(hour[peakH])} ครั้ง) ช่วงบ่ายถึงเย็นเสี่ยงสูงสุด`],
      [`${fmt1(worst[1])} คน/100 ครั้ง`, `${D.vehicle[worst[0]]} เสียชีวิตสูงสุด เป็น ${fmt1(worst[1] / avgRate)} เท่าของค่าเฉลี่ย (${fmt1(avgRate)})`],
    ];
    const box = sel("insights");
    box.innerHTML = "";
    items.forEach(([big, text], i) => {
      const d = document.createElement("div");
      d.className = "insight"; d.style.animationDelay = `${i * 80}ms`;
      const b = document.createElement("b"); b.textContent = big;
      const s = document.createElement("span"); s.textContent = text;
      d.append(b, s); box.append(d);
    });
  }

  // ---------- render ทั้งหน้า ----------
  function render() {
    const t = theme();
    syncFilters();
    renderKpis();
    renderTrend(t);
    renderArea(t);
    renderMap(t);
    renderCause(t);
    renderHeat(t);
    renderVehicle(t);
  }

  // ---------- คลิกบนกราฟ (cross-filter / drilldown) ----------
  function bindChartEvents() {
    sel("c-trend").on("plotly_click", (e) => {
      if (state.month !== null) return;
      const p = e.points[0];
      state.month = MONTHS.indexOf(p.x) + 1;
      render();
    });
    sel("trend-back").addEventListener("click", () => { state.month = null; render(); });
    sel("c-area").on("plotly_click", (e) => {
      const id = e.points[0].customdata;
      if (renderArea.level === "region") { state.region = id; state.province = null; }
      else state.province = state.province === id ? null : id;
      render();
    });
    sel("c-cause").on("plotly_click", (e) => {
      const id = e.points[0].customdata;
      const v = Array.isArray(id) ? id[0] : id;
      if (v === -1) return;
      state.cause = state.cause === v ? null : v;
      render();
    });
    sel("c-vehicle").on("plotly_click", (e) => {
      const id = e.points[0].customdata;
      state.vehicle = state.vehicle === id ? null : id;
      render();
    });
    document.querySelectorAll("[data-trend]").forEach((b) => b.addEventListener("click", () => {
      state.trendMetric = b.dataset.trend;
      document.querySelectorAll("[data-trend]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderTrend(theme());
    }));
    document.querySelectorAll("[data-veh]").forEach((b) => b.addEventListener("click", () => {
      state.vehMetric = b.dataset.veh;
      document.querySelectorAll("[data-veh]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      renderVehicle(theme());
    }));
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);
    let lastMobile = isMobile(), timer;
    window.addEventListener("resize", () => {
      clearTimeout(timer);
      timer = setTimeout(() => { if (isMobile() !== lastMobile) { lastMobile = isMobile(); render(); } }, 200);
    });
  }

  // ---------- start ----------
  async function init() {
    try {
      if (typeof Plotly === "undefined") throw new Error("โหลด Plotly.js ไม่สำเร็จ (ต้องต่ออินเทอร์เน็ต)");
      if (window.ACCIDENT_DATA) DB = window.ACCIDENT_DATA;           // เปิดจากไฟล์ในเครื่องได้
      else DB = await (await fetch("data/accidents.json")).json();   // สำรอง: โหลดผ่าน server
      I = Object.fromEntries(DB.fields.map((f, i) => [f, i]));
      D = DB.dicts;
      provinceRegion = new Array(D.province.length);
      DB.rows.forEach((r) => { provinceRegion[r[I.province]] = r[I.region]; });
      buildFilters();
      renderInsights();
      render();
      bindChartEvents();
      sel("loading").classList.add("done");
    } catch (err) {
      console.error(err);
      sel("loading").textContent = "เปิดเว็บไม่สำเร็จ: " + err.message;
    }
  }
  // รอฟอนต์ไม่เกิน 1.5 วินาที แล้วเริ่มวาดกราฟ
  const fontWait = document.fonts && document.fonts.ready ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]) : Promise.resolve();
  fontWait.then(init);
})();
