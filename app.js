"use strict";

const ML_PER_L = 1000;
const UNIT_LABEL = { L: "л", ml: "мл", kg: "кг", g: "г" };

const state = {
  core: null,
  colorantById: null,
  formulasByProduct: {},
  currentFormulas: [],
  visibleColors: [],
  yieldPerCoat: null, // м² на 1 литр/кг при ровно одном слое
};

const $ = (id) => document.getElementById(id);

function init() {
  const d = window.OIKOS_DATA;
  state.core = d;
  state.colorantById = Object.fromEntries(d.colorants.map((c) => [c.id, c]));
  $("dropVol").textContent = d.drop_ml.toFixed(4);
  $("verLabel").textContent = d.version;

  let totalFormulas = 0;
  let totalSubprods = 0;
  for (const p of d.products) {
    totalSubprods += p.subproducts.length;
    totalFormulas += p.subproducts.reduce((a, sp) => a + sp.n, 0);
  }
  $("totalFormulas").textContent = totalFormulas.toLocaleString("ru-RU");
  $("totalSubprods").textContent = totalSubprods;

  fillSelect($("product"), d.products, (p) => ({ value: p.id, textContent: `${p.code} — ${p.descr}` }));

  $("product").addEventListener("change", onProductChange);
  $("subproduct").addEventListener("change", onSubproductChange);
  $("subproductSearch").addEventListener("input", refreshSubproductList);
  $("series").addEventListener("change", refreshColorList);
  $("search").addEventListener("input", refreshColorList);
  $("color").addEventListener("change", onColorChange);
  $("coats").addEventListener("input", onCoatsChange);
  $("yield").addEventListener("input", onYieldChange);
  $("areaCalc").addEventListener("click", computeFromArea);
  $("calc").addEventListener("click", calculate);

  onProductChange();
}

function fillSelect(sel, items, toOption) {
  sel.innerHTML = "";
  for (const it of items) {
    const o = document.createElement("option");
    Object.assign(o, toOption(it));
    sel.append(o);
  }
}

function swatchEl(hex) {
  const s = document.createElement("span");
  s.className = "swatch";
  s.style.background = hex;
  return s;
}

function currentProduct() {
  return state.core.products.find((p) => p.id === $("product").value);
}

function currentSubproduct() {
  const p = currentProduct();
  return p?.subproducts.find((sp) => sp.id === $("subproduct").value);
}

function onProductChange() {
  const p = currentProduct();
  $("subproductSearch").value = "";
  refreshSubproductList();
  ensureProductLoaded(p.id).then(onSubproductChange);
}

function refreshSubproductList() {
  const p = currentProduct();
  const q = $("subproductSearch").value.trim().toLowerCase();
  const prev = $("subproduct").value;
  const matches = p.subproducts.filter((sp) =>
    !q || sp.code.toLowerCase().includes(q) || sp.descr.toLowerCase().includes(q)
  );
  fillSelect($("subproduct"), matches, (sp) => ({
    value: sp.id,
    textContent: `${sp.code} — ${sp.descr} (${sp.n})`,
  }));
  const stillSelectable = matches.find((sp) => sp.id === prev);
  if (stillSelectable) $("subproduct").value = prev;
  else if (matches.length) onSubproductChange();
}

async function ensureProductLoaded(prd_id) {
  if (state.formulasByProduct[prd_id]) return;
  $("loadStatus").textContent = `Загрузка формул…`;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `formulas/p${prd_id}.js?v=${state.core.version}`;
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
  state.formulasByProduct[prd_id] = window[`OIKOS_FORMULAS_P${prd_id}`];
  $("loadStatus").textContent = "";
}

function onSubproductChange() {
  const p = currentProduct();
  const sp = currentSubproduct();
  if (!p || !sp) return;
  const rows = state.formulasByProduct[p.id] || [];
  state.currentFormulas = rows.filter((r) => r[0] === sp.id);
  const series = [...new Set(state.currentFormulas.map((r) => r[2]).filter(Boolean))].sort();
  fillSelect($("series"), [{ v: "", t: "— все коллекции —" }, ...series.map((s) => ({ v: s, t: s }))], (o) => ({
    value: o.v,
    textContent: o.t,
  }));
  refreshColorList();
}

function refreshColorList() {
  const s = $("search").value.trim().toLowerCase();
  const series = $("series").value;
  const matches = state.currentFormulas.filter((r) => {
    if (series && r[2] !== series) return false;
    if (s && !r[1].toLowerCase().includes(s)) return false;
    return true;
  });
  state.visibleColors = matches.slice(0, 2000);
  fillSelect($("color"), state.visibleColors, (r) => ({
    value: r[1],
    textContent: r[1] + (r[2] ? ` · ${r[2]}` : ""),
  }));
}

function toCanUnits(amount, unit, canKind) {
  if (canKind === "mass") {
    if (unit === "kg") return amount * 1000;
    if (unit === "g") return amount;
    return null;
  }
  if (unit === "L") return amount * ML_PER_L;
  if (unit === "ml") return amount;
  return null;
}

function rgbToHex(rgb) {
  return rgb ? "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("") : null;
}

const VOLUME_UNITS = [
  { value: "L", label: "литры" },
  { value: "ml", label: "миллилитры" },
];
const MASS_UNITS = [
  { value: "kg", label: "килограммы" },
  { value: "g", label: "граммы" },
];

function onColorChange() {
  const row = state.visibleColors.find((r) => r[1] === $("color").value);
  const hex = rgbToHex(row?.[6]);
  document.body.style.setProperty("--selected-color", hex || "transparent");
  document.body.classList.toggle("has-color", !!hex);
  syncUnitsForColor(row);
}

function syncUnitsForColor(row) {
  const can = row ? state.core.cans[row[4]] : null;
  if (!can) {
    $("canInfo").textContent = "— выберите цвет —";
    fillSelect($("unit"), VOLUME_UNITS, (u) => ({ value: u.value, textContent: u.label }));
    syncCoverage(null, null);
    return;
  }
  const units = can.kind === "mass" ? MASS_UNITS : VOLUME_UNITS;
  fillSelect($("unit"), units, (u) => ({ value: u.value, textContent: u.label }));
  const noun = can.kind === "mass" ? "масса базы" : "объём базы";
  $("canInfo").textContent = `Формула задана на банку ${can.descr} (${noun}).`;
  syncCoverage(currentSubproduct(), can);
}

function syncCoverage(sp, can) {
  const cov = sp ? window.OIKOS_COVERAGE?.[sp.code] : null;
  const yieldInput = $("yield");
  const info = $("coverageInfo");
  const unitNoun = can?.kind === "mass" ? "м²/кг" : "м²/л";
  if (cov && (!can || cov.kind === can.kind)) {
    const [lo, hi] = cov.yield;
    const mid = (lo + hi) / 2;
    state.yieldPerCoat = mid * cov.coats;
    yieldInput.value = mid.toFixed(2);
    $("coats").value = cov.coats;
    info.innerHTML = `Из TDS Oikos <code>${cov.source}</code>: <b>${lo === hi ? lo : `${lo}–${hi}`} ${unitNoun}</b> в ${cov.coats} сл.${cov.notes ? ` <i>(${cov.notes})</i>` : ""}`;
  } else {
    state.yieldPerCoat = null;
    yieldInput.value = "";
    info.textContent = "Расход для этого продукта не задан — посмотрите TDS Oikos и введите вручную.";
  }
}

function onCoatsChange() {
  const c = parseInt($("coats").value, 10);
  if (state.yieldPerCoat && c > 0) {
    $("yield").value = (state.yieldPerCoat / c).toFixed(2);
  }
}

function onYieldChange() {
  const y = parseFloat($("yield").value);
  const c = parseInt($("coats").value, 10) || 1;
  if (y > 0) state.yieldPerCoat = y * c;
}

function computeFromArea() {
  const row = state.visibleColors.find((r) => r[1] === $("color").value);
  if (!row) return;
  const can = state.core.cans[row[4]];
  if (!can) return;
  const area = parseFloat($("area").value);
  const coats = parseInt($("coats").value, 10) || 1;
  const yieldVal = parseFloat($("yield").value);
  const reserve = parseFloat($("reserve").value) || 0;
  if (!(area > 0) || !(yieldVal > 0)) {
    alert("Введите площадь и расход (м²/л или м²/кг)");
    return;
  }
  // yieldVal — м² на 1 единицу базы при coats слоях.
  // нужно_единиц = площадь / расход
  const needed = (area / yieldVal) * (1 + reserve / 100);
  const unit = can.kind === "mass" ? "kg" : "L";
  $("unit").value = unit;
  $("amount").value = needed.toFixed(3);
}

function parseFormula(str) {
  return str.split(";").map((part) => {
    const [cid, amt] = part.split(":");
    return { cid, amount: parseFloat(amt) };
  });
}

function calculate() {
  const key1 = $("color").value;
  const row = state.visibleColors.find((r) => r[1] === key1);
  if (!row) return;
  const [spd_id, , key3, base_id, can_id, fstr, rgb] = row;

  const amount = parseFloat($("amount").value);
  if (!(amount > 0)) return;
  const unit = $("unit").value;

  const can = state.core.cans[can_id];
  const target = toCanUnits(amount, unit, can.kind);
  if (target === null) return;
  const factor = target / can.amount;
  const items = parseFormula(fstr);

  const tbody = $("result").querySelector("tbody");
  tbody.innerHTML = "";
  const totals = { drops: 0, ml: 0, g: 0 };

  for (const it of items) {
    const c = state.colorantById[it.cid];
    const drops = it.amount * factor;
    const ml = drops * state.core.drop_ml;
    const g = ml * (c?.density ?? 1.1);
    totals.drops += drops;
    totals.ml += ml;
    totals.g += g;
    tbody.append(renderRow(c?.code ?? it.cid, c?.descr ?? "—", c?.hex ?? "#ccc", drops, ml, g));
  }

  $("totDrops").textContent = totals.drops.toFixed(1);
  $("totMl").textContent = totals.ml.toFixed(2);
  $("totG").textContent = totals.g.toFixed(2);

  const hex = rgbToHex(rgb) ?? "#bbb";
  const nameCell = $("resColorName");
  nameCell.innerHTML = "";
  nameCell.append(swatchEl(hex), document.createTextNode(key1 + (key3 ? ` · ${key3}` : "")));

  $("resLabel").textContent = `${amount} ${UNIT_LABEL[unit]}`;
  const sp = currentSubproduct();
  $("resProduct").textContent = `${currentProduct().code} / ${sp.code} — ${sp.descr}`;
  $("baseName").textContent = state.core.bases[base_id]?.descr ?? `#${base_id}`;
  $("canName").textContent = state.core.cans[can_id]?.descr ?? `#${can_id}`;
  $("colorSwatch").style.background = hex;

  const card = $("resultCard");
  card.hidden = false;
  card.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderRow(code, name, hex, drops, ml, g) {
  const tr = document.createElement("tr");
  const tdCode = document.createElement("td");
  tdCode.append(swatchEl(hex), document.createTextNode(code));
  const tdName = document.createElement("td");
  tdName.textContent = name;
  const cells = [drops.toFixed(1), ml.toFixed(2), g.toFixed(2)].map((v) => {
    const td = document.createElement("td");
    td.className = "num";
    td.textContent = v;
    return td;
  });
  tr.append(tdCode, tdName, ...cells);
  return tr;
}

init();
