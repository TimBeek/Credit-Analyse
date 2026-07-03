/* DOM-shim smoke-test: draait de volledige render-laag (hero, groepsdashboard,
 * vergelijktabel, grafiek, periodetabel, importmelding), de PDF-opbouw én de
 * PNG-afbeelding met synthetische data om te bewijzen dat de weergave niet crasht. */
const XLSX = require("../assets/xlsx.full.min.js");

// --- Canvas-2d mock (voor de PNG-afbeelding) ---
const ctx2d = new Proxy({}, {
  get(t, p) {
    if (p === "measureText") return s => ({ width: String(s).length * 7 });
    return typeof t[p] === "function" ? t[p] : () => {};
  },
  set(t, p, v) { t[p] = v; return true; },
});

// --- Minimale DOM-shim ---
function stubEl() {
  const el = {
    innerHTML: "", textContent: "", value: "", checked: false, hidden: false,
    className: "", href: "", download: "", dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, remove() {}, click() {},
    querySelector() { return stubEl(); },
    querySelectorAll() { return []; },
  };
  return el;
}
const elCache = new Map();
const document = {
  getElementById(id) { if (!elCache.has(id)) elCache.set(id, stubEl()); return elCache.get(id); },
  querySelectorAll() { return []; },
  createElement(tag) {
    if (tag === "canvas") {
      return { width: 0, height: 0, style: {}, getContext() { return ctx2d; }, toBlob(cb) { cb({}); }, toDataURL() { return ""; } };
    }
    return stubEl();
  },
  body: stubEl(),
  activeElement: null,
};
function makeDoc() {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === "splitTextToSize") return text => String(text).split("\n");
      if (prop === "getNumberOfPages") return () => 2;
      return () => {};
    },
  });
}
global.document = document;
global.window = { XLSX, jspdf: { jsPDF: function () { return makeDoc(); } }, confirm: () => true, alert: () => {} };
global.XLSX = XLSX;
global.URL = { createObjectURL: () => "blob:x", revokeObjectURL() {} };
global.Blob = function () {};

const api = require("../assets/credit-analyse.js");

let fail = 0;
function run(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { fail += 1; console.log(`  ✗ ${name} — ${e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e}`); }
}

function rec(weekKey, monthKey, reason, origin, amount, count) {
  const [year] = weekKey.split("-");
  const q = `${year}-Q${Math.ceil(Number(monthKey.split("-")[1]) / 3)}`;
  return { weekKey, monthKey, quarterKey: q, yearKey: year, reason, origin, amount, count };
}
const data = [
  rec("2026-W20", "2026-05", "Niet akkoord met alt", "Klantenservice", 1600, 3),
  rec("2026-W20", "2026-05", "Niet werkzaam", "Retouren", 700, 2),
  rec("2026-W21", "2026-05", "Niet akkoord met alt", "Klantenservice", 1900, 4),
  rec("2026-W21", "2026-05", "Transportschade", "Retouren", 1200, 3),
  rec("2026-W22", "2026-05", "Niet akkoord met alt", "Klantenservice", 2200, 4),
  rec("2026-W22", "2026-05", "Annulering door klant", "Klantenservice", 3000, 6),
  rec("2026-W23", "2026-06", "Niet akkoord met alt", "Klantenservice", 8000, 9),
  rec("2026-W23", "2026-06", "Niet werkzaam", "Retouren", 1100, 4),
  rec("2026-W24", "2026-06", "Niet akkoord met alt", "Klantenservice", 1800, 3),
  rec("2026-W24", "2026-06", "Transportschade", "Retouren", 900, 2),
  rec("2026-W25", "2026-06", "Niet akkoord met alt", "Klantenservice", 2000, 4),
  rec("2026-W25", "2026-06", "Niet werkzaam", "Retouren", 1000, 3),
  rec("2026-W25", "2026-06", "Annulering door klant", "Klantenservice", 4000, 8),
  rec("2026-W26", "2026-06", "Niet akkoord met alt", "Klantenservice", 3500, 5),
  rec("2026-W26", "2026-06", "Niet werkzaam", "Retouren", 1400, 4),
  rec("2026-W26", "2026-06", "Fout in website, onjuiste verkoopprijs", "Klantenservice", 900, 2),
  rec("2026-W26", "2026-06", "Annulering door klant", "Klantenservice", 7000, 10),
  rec("2026-W30", "2026-07", "Niet akkoord met alt", "Klantenservice", 2500, 4),
  rec("2026-W30", "2026-07", "PostNL, retourafzender", "Retouren", 600, 2),
];

console.log("\nRender-laag smoke-test (geen echte browser, wel echte render-code)");
api.state.records = data;
api.state.meta = { filename: "week30.xlsx", importedAt: new Date().toISOString() };
api.state.quality = null;

["week", "month", "quarter", "year"].forEach(type => {
  ["all", "Klantenservice", "Retouren"].forEach(origin => {
    run(`renderDashboard type=${type} herkomst=${origin}`, () => {
      api.state.periodType = type; api.state.origin = origin; api.state.reasonSearch = "";
      api.state.selectedKey = ""; api.state.activeTab = "overview";
      api.renderDashboard();
    });
  });
});

run("renderDashboard tab=verloop", () => { api.state.periodType = "week"; api.state.origin = "all"; api.state.activeTab = "verloop"; api.renderDashboard(); });
run("renderDashboard tab=control + importmelding (met quality)", () => {
  api.state.activeTab = "control";
  api.state.quality = {
    file: "x", sheet: "s", sourceRows: 12, parsedRows: 10, storedRecords: 8, skippedRows: 1,
    missingOrigin: 1, negativeAmountRows: 0, possibleDuplicateRows: 1,
    recoveredNeighborDateRows: 2, recoveredWeekYearRows: 3, recoveredNeighborWeekYearRows: 1, recoveredAmountRows: 2, correctedYearRows: 1, recoveredOriginRows: 1,
    fallbackReasonRows: 1, normalizedReasonRows: 1,
    unknownReasons: new Map([["Iets nieuws", { count: 2, suggestion: "Niet werkzaam" }]]),
    warningSamples: [{ rowNumber: 7, issue: "Jaar 2202 gecorrigeerd naar 2022" }, { rowNumber: 5, issue: "Datum overgenomen van regel erboven" }],
    skippedSamples: [{ rowNumber: 9, issue: "Geen geldig bedrag" }],
  };
  api.renderDashboard();
});

run("renderDashboard met groepsfilter (voorkombaar)", () => {
  api.state.periodType = "week"; api.state.origin = "all"; api.state.activeTab = "overview";
  api.state.selectedKey = ""; api.state.selectedGroupFilter = "voorkombaar"; api.renderDashboard();
});
run("renderDashboard met groepsfilter (transport)", () => { api.state.selectedGroupFilter = "transport"; api.renderDashboard(); });
run("renderDashboard met ongeldige groepsfilter (valt terug)", () => { api.state.selectedGroupFilter = "bestaatniet"; api.renderDashboard(); api.state.selectedGroupFilter = ""; });

run("renderDashboard zonder records (lege staat)", () => { api.state.records = []; api.state.quality = null; api.renderDashboard(); api.state.records = data; });

["week", "month", "quarter", "year"].forEach(type => {
  run(`generateReportPdf type=${type}`, () => {
    api.state.periodType = type; api.state.origin = "all"; api.state.reasonSearch = ""; api.state.selectedKey = "";
    api.generateReportPdf(api.getDashboardContext());
  });
  run(`generateReportImage (PNG) type=${type}`, () => {
    api.state.periodType = type; api.state.origin = "all"; api.state.reasonSearch = ""; api.state.selectedKey = "";
    api.generateReportImage(api.getDashboardContext());
  });
});

run("buildPlainConclusion levert een leesbare zin", () => {
  api.state.periodType = "week"; api.state.selectedKey = "2026-W26";
  const s = api.buildPlainConclusion(api.getDashboardContext());
  if (!s || typeof s !== "string" || s.length < 30) throw new Error(`onverwacht: ${s}`);
});

console.log(fail ? `\n${fail} render-fout(en) gevonden` : "\nGeen render-fouten — hero, groepsdashboard, tabellen, grafiek, PDF én PNG bouwen zonder crash.");
process.exit(fail ? 1 : 0);
