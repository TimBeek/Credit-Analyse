/* Node-testharnas voor de creditanalyse. Test de rekenkern (Wout's %'en en
 * verschillen) en het Excel-inlezen met synthetische data. Draai met: npm test */
const XLSX = require("../assets/xlsx.full.min.js");
global.window = { XLSX };
global.XLSX = XLSX;

const api = require("../assets/credit-analyse.js");

let pass = 0;
let fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${extra ? ` — ${extra}` : ""}`); }
}
function near(a, b, eps = 0.001) { return Math.abs(a - b) <= eps; }

function resetState(records) {
  api.state.records = records;
  api.state.meta = null;
  api.state.quality = null;
  api.state.origin = "all";
  api.state.reasonSearch = "";
  api.state.periodType = "week";
  api.state.selectedKey = "";
}

function rec(weekKey, monthKey, reason, origin, amount, count) {
  const [year] = weekKey.split("-");
  const q = monthKey ? `${year}-Q${Math.ceil(Number(monthKey.split("-")[1]) / 3)}` : `${year}-Q1`;
  return { weekKey, monthKey, quarterKey: q, yearKey: year, reason, origin, amount, count };
}

// ---------------------------------------------------------------------------
console.log("\n1. Rekenkern: aandeel-% en verschillen (Wout's kernvraag)");
// Week 25 totaal 10.000, week 26 totaal 14.000 (mirror van ~11k -> 14k).
const records = [
  // Week 25 (2026-06)
  rec("2026-W25", "2026-06", "Niet akkoord met alt", "Klantenservice", 2000, 4),
  rec("2026-W25", "2026-06", "Niet werkzaam", "Retouren", 1000, 3),
  rec("2026-W25", "2026-06", "Transportschade", "Retouren", 3000, 6),
  rec("2026-W25", "2026-06", "Annulering door klant", "Klantenservice", 4000, 8),
  // Week 26 (2026-06)
  rec("2026-W26", "2026-06", "Niet akkoord met alt", "Klantenservice", 3500, 5),
  rec("2026-W26", "2026-06", "Niet werkzaam", "Retouren", 1400, 4),
  rec("2026-W26", "2026-06", "Transportschade", "Retouren", 2100, 3),
  rec("2026-W26", "2026-06", "Annulering door klant", "Klantenservice", 7000, 10),
];
resetState(records);
api.state.selectedKey = "2026-W26";
let ctx = api.getDashboardContext();

ok("huidige week totaal = 14.000", near(ctx.current.total, 14000), `got ${ctx.current.total}`);
ok("vorige week totaal = 10.000", near(ctx.previous.total, 10000), `got ${ctx.previous.total}`);
ok("totaal Δ% = +40%", near(ctx.headline.totalDeltaPct, 40), `got ${ctx.headline.totalDeltaPct}`);
ok("headline tone = up (rood/hoger)", ctx.headline.tone === "up", `got ${ctx.headline.tone}`);

const alt = ctx.comparison.find(r => r.reason === "Niet akkoord met alt");
ok("ALT aandeel nu = 25%", near(alt.currentShare, 25), `got ${alt.currentShare}`);
ok("ALT aandeel vorige = 20%", near(alt.previousShare, 20), `got ${alt.previousShare}`);
ok("ALT Δ %-punt = +5", near(alt.shareDelta, 5), `got ${alt.shareDelta}`);
ok("ALT Δ bedrag = +1500", near(alt.amountDelta, 1500), `got ${alt.amountDelta}`);
ok("ALT is focusreden", alt.isFocus === true);

const transport = ctx.comparison.find(r => r.reason === "Transportschade");
ok("Transport aandeel nu = 15%", near(transport.currentShare, 15), `got ${transport.currentShare}`);
ok("Transport Δ %-punt = -15 (gedaald)", near(transport.shareDelta, -15), `got ${transport.shareDelta}`);

const annul = ctx.comparison.find(r => r.reason === "Annulering door klant");
ok("Annulering Δ %-punt = +10", near(annul.shareDelta, 10), `got ${annul.shareDelta}`);

// Aandelen tellen op tot 100%
const shareSum = ctx.comparison.reduce((s, r) => s + r.currentShare, 0);
ok("alle aandelen samen = 100%", near(shareSum, 100, 0.01), `got ${shareSum}`);

// ---------------------------------------------------------------------------
console.log("\n2. Focustegels (ALT + Niet werkzaam)");
ok("twee focusredenen", ctx.focus.length === 2);
ok("focus[0] = Niet akkoord met alt", api.FOCUS_REASONS[0] === "Niet akkoord met alt");
const nw = ctx.focus.find(r => r.reason === "Niet werkzaam");
ok("Niet werkzaam aandeel nu = 10%", near(nw.currentShare, 10), `got ${nw.currentShare}`);
ok("Niet werkzaam Δ %-punt = 0", near(nw.shareDelta, 0), `got ${nw.shareDelta}`);

// ---------------------------------------------------------------------------
console.log("\n3. Groepen (voorkombaar/transport/klant)");
const vg = ctx.groupComparison.find(g => g.key === api.PREVENTABLE_GROUP);
ok("voorkombaar groep bestaat", !!vg);
const transportGroup = ctx.groupComparison.find(g => g.key === "transport");
ok("Transportschade valt in groep transport", near(transportGroup.amount, 2100), `got ${transportGroup.amount}`);
const groupSum = ctx.groupComparison.reduce((s, g) => s + g.amount, 0);
ok("groepen samen = totaal (14.000)", near(groupSum, 14000), `got ${groupSum}`);

// ---------------------------------------------------------------------------
console.log("\n4. Periode-uitrol: week -> maand -> kwartaal -> jaar");
ok("beschikbare weken gesorteerd", JSON.stringify(api.getAvailablePeriodKeys("week")) === JSON.stringify(["2026-W25", "2026-W26"]));
ok("vorige van W26 = W25", api.getPreviousKey("week", "2026-W26") === "2026-W25");

api.state.periodType = "month";
api.state.selectedKey = "";
const ctxMonth = api.getDashboardContext();
ok("maand 2026-06 totaal = 24.000", near(ctxMonth.current.total, 24000), `got ${ctxMonth.current.total}`);
ok("maand geen vorige (Δ leeg)", ctxMonth.headline.hasPrevious === false);

api.state.periodType = "quarter";
api.state.selectedKey = "";
const ctxQ = api.getDashboardContext();
ok("kwartaal 2026-Q2 totaal = 24.000", near(ctxQ.current.total, 24000), `got ${ctxQ.current.total}`);

api.state.periodType = "year";
api.state.selectedKey = "";
const ctxY = api.getDashboardContext();
ok("jaar 2026 totaal = 24.000", near(ctxY.current.total, 24000), `got ${ctxY.current.total}`);

// ---------------------------------------------------------------------------
console.log("\n5. Herkomstfilter (Klantenservice vs Retouren)");
api.state.periodType = "week";
api.state.selectedKey = "2026-W26";
api.state.origin = "Klantenservice";
const ctxKS = api.getDashboardContext();
ok("KS-only totaal = 10.500 (ALT 3500 + Annulering 7000)", near(ctxKS.current.total, 10500), `got ${ctxKS.current.total}`);
const altKS = ctxKS.comparison.find(r => r.reason === "Niet akkoord met alt");
ok("ALT aandeel binnen KS = 33,33%", near(altKS.currentShare, 100 * 3500 / 10500, 0.01), `got ${altKS.currentShare}`);
api.state.origin = "all";

// ---------------------------------------------------------------------------
console.log("\n6. Excel-import + privacy (synthetische draaitabel-data)");
function xlsxRow(reason, herkomst, bedrag, order, naam, week, jaar) {
  return { Reden: reason, Herkomst: herkomst, Bedrag: bedrag, Ordernummer: order, Naam: naam, Weeknummer: week, Jaar: jaar };
}
const sheetData = [
  xlsxRow("Niet akkoord met alt", "Klantenservice", "€ 3.405,40", "ORD-1001", "Jan Jansen", 26, 2026),
  xlsxRow("Niet werkzaam", "Retouren", "1.043,68", "ORD-1002", "Piet de Vries", 26, 2026),
  xlsxRow("Transportschade", "Retouren", "268,98", "ORD-1003", "Klaas K.", 26, 2026),
  xlsxRow("Annulering door klant", "Klantenservice", "702,00", "ORD-1004", "Anna A.", 26, 2026),
  xlsxRow("Annulering door klant", "Retouren", "1591,00", "ORD-1005", "Bob B.", 26, 2026),
  xlsxRow("Niet naar wens, B-grade", "Retouren", "1540,00", "ORD-1006", "Cor C.", 26, 2026),
  xlsxRow("Niet akkoord met alt", "Klantenservice", "1200,00", "ORD-0900", "Ex Emp", 25, 2026),
  xlsxRow("Niet werkzaam", "Retouren", "900,00", "ORD-0901", "Ex Emp2", 25, 2026),
];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData), "Credit ruwe data");
const parsed = api.parseWorkbookRecords(wb, "week26.xlsx");

ok("er zijn records ingelezen", parsed.records.length > 0, `got ${parsed.records.length}`);
ok("Naam + Ordernummer als genegeerd gemarkeerd",
  parsed.quality.ignoredPersonalColumns.includes("Naam") && parsed.quality.ignoredPersonalColumns.includes("Ordernummer"));
const allowedKeys = new Set(["weekKey", "monthKey", "quarterKey", "yearKey", "reason", "origin", "amount", "count"]);
const leaks = parsed.records.flatMap(r => Object.keys(r)).filter(k => !allowedKeys.has(k));
ok("geen naam/ordernummer in opgeslagen records", leaks.length === 0, `lekt: ${[...new Set(leaks)].join(",")}`);
ok("bedrag € 3.405,40 correct geparseerd",
  parsed.records.some(r => r.reason === "Niet akkoord met alt" && r.weekKey === "2026-W26" && near(r.amount, 3405.40)),
  JSON.stringify(parsed.records.find(r => r.reason === "Niet akkoord met alt" && r.weekKey === "2026-W26")));
ok("week 26 2026 afgeleid uit week+jaar (geen datumkolom)", parsed.records.every(r => /^2026-W\d\d$/.test(r.weekKey)));

// Analyse na echte import
resetState(api.mergeImportedRecords([], parsed.records));
api.state.selectedKey = "2026-W26";
const ctxImp = api.getDashboardContext();
const w26Total = 3405.40 + 1043.68 + 268.98 + 702 + 1591 + 1540;
ok("week 26 totaal na import klopt", near(ctxImp.current.total, w26Total, 0.01), `got ${ctxImp.current.total} vs ${w26Total}`);
const altImp = ctxImp.comparison.find(r => r.reason === "Niet akkoord met alt");
ok("ALT aandeel na import = bedrag/totaal", near(altImp.currentShare, 100 * 3405.40 / w26Total, 0.01), `got ${altImp.currentShare}`);

// ---------------------------------------------------------------------------
console.log("\n6b. Leeg bedrag/week overnemen van buurregel");
const gapData = [
  xlsxRow("Transportschade", "Retouren", "150,00", "ORD-3001", "A", 27, 2026),
  xlsxRow("Transportschade", "Retouren", "", "ORD-3002", "B", 27, 2026),        // leeg bedrag
  xlsxRow("Niet werkzaam", "Retouren", "200,00", "ORD-3003", "C", 27, 2026),
];
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.json_to_sheet(gapData), "Credit ruwe data");
const parsed2 = api.parseWorkbookRecords(wb2, "gap.xlsx");
ok("1 leeg bedrag overgenomen van buurregel", parsed2.quality.recoveredAmountRows === 1, `got ${parsed2.quality.recoveredAmountRows}`);
ok("regel met leeg bedrag niet overgeslagen", parsed2.quality.skippedRows === 0, `got ${parsed2.quality.skippedRows}`);
ok("overgenomen bedrag = 150 van de buurregel", parsed2.records.some(r => r.reason === "Transportschade" && near(r.amount, 300)), JSON.stringify(parsed2.records.find(r => r.reason === "Transportschade")));

// ---------------------------------------------------------------------------
console.log("\n7. Jaar-correctie (pijnpunt: kromme jaartallen)");
ok("2202 → 2022 (omgewisselde cijfers)", api.correctYearNumber(2202).year === 2022, `got ${api.correctYearNumber(2202).year}`);
ok("226 → 2026 (ontbrekend cijfer)", api.correctYearNumber(226).year === 2026, `got ${api.correctYearNumber(226).year}`);
ok("206 → 2026", api.correctYearNumber(206).year === 2026, `got ${api.correctYearNumber(206).year}`);
ok("24 → 2024 (twee cijfers)", api.correctYearNumber(24).year === 2024, `got ${api.correctYearNumber(24).year}`);
ok("2026 blijft 2026 (geen correctie)", api.correctYearNumber(2026).year === 2026 && api.correctYearNumber(2026).corrected === false);
ok("2027 blijft 2027 (volgend jaar plausibel)", api.correctYearNumber(2027).year === 2027);
ok("9999 → geen geloofwaardig jaar (null)", api.correctYearNumber(9999).year === null, `got ${api.correctYearNumber(9999).year}`);
ok("2202 wordt als 'gecorrigeerd' gemarkeerd", api.correctYearNumber(2202).corrected === true);

// ---------------------------------------------------------------------------
console.log("\n8. Fout jaartal ín de datum (2202 mag nooit een periode worden)");
ok("makePeriodKeys(datum 2202) → jaar 2022", api.makePeriodKeys(new Date(2202, 6, 3), null, null).yearKey === "2022", JSON.stringify(api.makePeriodKeys(new Date(2202, 6, 3), null, null)));
const badDate = [
  { Reden: "Transportschade", Herkomst: "Retouren", Bedrag: "100,00", Datum: "3-7-2202", Ordernummer: "O1", Naam: "N" },
  { Reden: "Niet werkzaam", Herkomst: "Retouren", Bedrag: "50,00", Datum: "10-7-2202", Ordernummer: "O2", Naam: "M" },
];
const wb3 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb3, XLSX.utils.json_to_sheet(badDate), "Credit ruwe data");
const parsed3 = api.parseWorkbookRecords(wb3, "baddate.xlsx");
ok("geen enkele periodesleutel bevat 2202", parsed3.records.every(r => ![r.weekKey, r.monthKey, r.quarterKey, r.yearKey].join("|").includes("2202")), JSON.stringify(parsed3.records.map(r => `${r.weekKey}/${r.yearKey}`)));
ok("jaar in de records = 2022", parsed3.records.every(r => r.yearKey === "2022"), JSON.stringify(parsed3.records.map(r => r.yearKey)));
ok("2202-datum als correctie gemeld", (parsed3.quality.correctedYearRows || 0) >= 1, `got ${parsed3.quality.correctedYearRows}`);

// ---------------------------------------------------------------------------
console.log("\n9. Forecast (exponential smoothing / gedempte trend)");
const noOut = arr => arr.map(() => false);
const rising = [100, 108, 121, 130, 142, 149, 161, 170, 182, 191];
const fRise = api.forecastSeries(rising, noOut(rising), 0, 4);
ok("forecast levert 4 stappen", fRise && fRise.preds.length === 4, `got ${fRise && fRise.preds.length}`);
ok("alle voorspellingen zijn eindige getallen", fRise.preds.every(p => Number.isFinite(p.y) && Number.isFinite(p.lo) && Number.isFinite(p.hi)));
ok("band omsluit de voorspelling (lo ≤ y ≤ hi)", fRise.preds.every(p => p.lo <= p.y + 1e-9 && p.y <= p.hi + 1e-9));
ok("stijgende reeks → eerste voorspelling boven laatste waarde", fRise.preds[0].y >= rising[rising.length - 1] - 5, `got ${fRise.preds[0].y}`);
ok("gedempte trend schiet niet extreem door", fRise.preds[3].y < rising[rising.length - 1] * 1.6, `got ${fRise.preds[3].y}`);
ok("onzekerheidsband groeit met de horizon", (fRise.preds[3].hi - fRise.preds[3].y) >= (fRise.preds[0].hi - fRise.preds[0].y));
ok("methode = gedempte trend (geen seizoen bij korte reeks)", /gedempte trend/.test(fRise.method), fRise.method);

const flat = [500, 505, 498, 502, 500, 503, 499, 501];
const fFlat = api.forecastSeries(flat, noOut(flat), 0, 3);
ok("vlakke reeks → voorspelling dicht bij niveau", fFlat.preds.every(p => Math.abs(p.y - 500) < 60), JSON.stringify(fFlat.preds.map(p => Math.round(p.y))));
ok("te korte reeks (<5) → geen forecast", api.forecastSeries([1, 2, 3, 4], noOut([1, 2, 3, 4]), 0, 3) === null);

const seasonal = [];
for (let i = 0; i < 24; i += 1) seasonal.push(100 + i * 2 + (i % 4 === 0 ? 40 : i % 4 === 2 ? -20 : 0));
const fSeason = api.forecastSeries(seasonal, noOut(seasonal), 4, 4);
ok("≥2 seizoenscycli → Holt-Winters seizoensmodel", /Holt-Winters/.test(fSeason.method), fSeason.method);
ok("nextPeriodKey week rolt door", api.nextPeriodKey("week", "2026-W52") === "2027-W01" && api.nextPeriodKey("week", "2026-W26") === "2026-W27");

// ---------------------------------------------------------------------------
console.log("\n10. Privacy: automatisch wissen na 30 min inactiviteit");
const NOW = 1000000000000;
ok("RETENTION_MS = 30 minuten", api.RETENTION_MS === 30 * 60 * 1000, `got ${api.RETENTION_MS}`);
ok("geen tijdstempel → niet wissen", api.retentionExpired(0, NOW) === false);
ok("31 min inactief → wissen", api.retentionExpired(NOW - 31 * 60 * 1000, NOW) === true);
ok("29 min inactief → niet wissen", api.retentionExpired(NOW - 29 * 60 * 1000, NOW) === false);
ok("net actief → niet wissen", api.retentionExpired(NOW, NOW) === false);

// ---------------------------------------------------------------------------
console.log(`\nResultaat: ${pass} geslaagd, ${fail} gefaald`);
process.exit(fail ? 1 : 0);
