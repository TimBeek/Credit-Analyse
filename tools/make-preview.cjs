/* Bouwt preview.html: index.html met vooraf ingeladen, realistische data
 * (week 26 = jullie draaitabel; week 25 ~ €11.300 zodat +30% zichtbaar is),
 * zodat we een echte screenshot van het dashboard kunnen maken. */
const fs = require("fs");
const path = require("path");
const api = require("../assets/credit-analyse.js");

// raw: [week, reason, origin, amount, count]
const raw = [
  // Week 22
  [22, "Niet akkoord met alt", "Klantenservice", 2100, 4], [22, "Annulering door klant", "Klantenservice", 1500, 5],
  [22, "Niet werkzaam", "Retouren", 900, 3], [22, "Transportschade", "Retouren", 1200, 3],
  [22, "Niet naar wens, B-grade", "Retouren", 1300, 2], [22, "PostNL, retourafzender", "Retouren", 400, 2], [22, "Niet leverbaar", "Klantenservice", 600, 1],
  // Week 23
  [23, "Niet akkoord met alt", "Klantenservice", 2400, 5], [23, "Annulering door klant", "Klantenservice", 2000, 6],
  [23, "Niet werkzaam", "Retouren", 1100, 4], [23, "Transportschade", "Retouren", 800, 2],
  [23, "Niet naar wens, C-grade", "Retouren", 900, 2], [23, "Ondeugdelijk product", "Retouren", 1200, 2], [23, "Verkeerd besteld", "Retouren", 700, 2],
  // Week 24
  [24, "Niet akkoord met alt", "Klantenservice", 1900, 3], [24, "Annulering door klant", "Klantenservice", 1400, 4],
  [24, "Niet werkzaam", "Retouren", 800, 3], [24, "Niet naar wens, B-grade", "Retouren", 1000, 2],
  [24, "Transportschade", "Retouren", 700, 2], [24, "Te lange levertijd", "Klantenservice", 500, 1],
  // Week 25 (~ €11.300 -> zodat week 26 +30% is)
  [25, "Niet akkoord met alt", "Klantenservice", 2600, 4], [25, "Annulering door klant", "Klantenservice", 1800, 6],
  [25, "Niet werkzaam", "Retouren", 1200, 4], [25, "Niet naar wens, B-grade", "Retouren", 1400, 3],
  [25, "Transportschade", "Retouren", 900, 2], [25, "Niet naar wens, C-grade", "Retouren", 700, 2],
  [25, "Verkeerd besteld", "Retouren", 500, 2], [25, "Te lange levertijd", "Klantenservice", 400, 1],
  [25, "PostNL, retourafzender", "Retouren", 500, 2], [25, "Ondeugdelijk product", "Retouren", 900, 2], [25, "Niet leverbaar", "Klantenservice", 400, 1],
  // Week 26 (exact jullie draaitabel)
  [26, "Aangehouden actieprijs", "Klantenservice", 190, 1], [26, "Akkoord met goedkoper alternatief", "Klantenservice", 380, 1],
  [26, "Annulering door klant", "Klantenservice", 702, 3], [26, "Annulering door Riverty", "Klantenservice", 99, 1],
  [26, "Niet akkoord met alt", "Klantenservice", 3405.40, 12], [26, "Niet leverbaar", "Klantenservice", 156.93, 1],
  [26, "Niet naar wens", "Klantenservice", 25, 1], [26, "Te lange levertijd", "Klantenservice", 450, 2], [26, "Verkeerd geleverd", "Klantenservice", 50.30, 1],
  [26, "Annulering door klant", "Retouren", 1591, 5], [26, "Bestelling vies geleverd", "Retouren", 238.84, 1],
  [26, "Fout in website, onjuiste omschrijving", "Retouren", 64, 1], [26, "Niet leverbaar", "Retouren", 34.14, 1],
  [26, "Niet naar wens", "Retouren", 821.95, 4], [26, "Niet naar wens, accu", "Retouren", 279, 1],
  [26, "Niet naar wens, B-grade", "Retouren", 1540, 3], [26, "Niet naar wens, C-grade", "Retouren", 523, 2],
  [26, "Niet naar wens, toetsenbordstickers", "Retouren", 922, 3], [26, "Niet werkzaam", "Retouren", 1043.68, 6],
  [26, "Ondeugdelijk product", "Retouren", 449, 2], [26, "PostNL, retourafzender", "Retouren", 423, 2],
  [26, "Transportschade", "Retouren", 268.98, 1], [26, "Verkeerd besteld", "Retouren", 479, 2], [26, "Verkeerd geleverd", "Retouren", 562.62, 3],
];

// Genereer weken 10-21 met oplopende trend + een piek (week 16) voor uitschieter/forecast.
const gen = [];
for (let w = 10; w <= 21; w += 1) {
  const total = Math.max(6000, 9000 + (w - 10) * 250 + ((w * 137) % 900 - 450) + (w === 16 ? 6500 : 0));
  [["Niet akkoord met alt", "Klantenservice", 0.30, 6], ["Annulering door klant", "Klantenservice", 0.22, 7],
   ["Niet werkzaam", "Retouren", 0.16, 5], ["Niet naar wens, B-grade", "Retouren", 0.17, 4],
   ["Transportschade", "Retouren", 0.15, 3]].forEach(([reason, origin, frac, cnt]) => {
    gen.push([w, reason, origin, Math.round(total * frac), Math.max(1, Math.round(cnt * (0.8 + (w % 3) * 0.1)))]);
  });
}

const records = [...gen, ...raw].map(([week, reason, origin, amount, count]) => {
  const p = api.makePeriodKeys(null, 2026, week);
  return { ...p, reason, origin, amount, count };
});

const seed = `<script>
try {
  localStorage.setItem("remarkt.creditAnalyse.records.v2", ${JSON.stringify(JSON.stringify(records))});
  localStorage.setItem("remarkt.creditAnalyse.meta.v2", JSON.stringify({ filename: "week26-2026.xlsx", importedAt: "2026-07-03T09:00:00.000Z" }));
} catch (e) {}
</script>
`;

const indexPath = path.join(__dirname, "..", "index.html");
let html = fs.readFileSync(indexPath, "utf8");
html = html.replace('<script src="assets/xlsx.full.min.js"></script>', seed + '<script src="assets/xlsx.full.min.js"></script>');
// preview.html: toon ook de importmelding (met sluitknop) via een demo-quality.
const previewHtml = html.replace("</body>", `<script>
var a=window.creditAnalyseApp;
a.state.quality={parsedRows:81,storedRecords:24,skippedRows:0,missingOrigin:0,negativeAmountRows:0,possibleDuplicateRows:0,recoveredAmountRows:2,recoveredNeighborDateRows:3,recoveredNeighborWeekYearRows:0,recoveredWeekYearRows:0,correctedYearRows:1,recoveredOriginRows:0,fallbackReasonRows:0,normalizedReasonRows:1,unknownReasons:new Map(),warningSamples:[{rowNumber:12,issue:"Fout jaartal in datum (2202) gecorrigeerd naar 2022"}],skippedSamples:[]};
a.renderDashboard();
</script>
</body>`);
fs.writeFileSync(path.join(__dirname, "..", "preview.html"), previewHtml, "utf8");

// preview-image.html: hergebruikt de volledige app (verborgen) en rendert de
// PNG-afbeelding op de pagina, zodat we het exportbeeld kunnen bekijken.
let imgHtml = html
  .replace("</head>", "<style>#creditApp{display:none!important}body{background:#e9e9e6}</style></head>")
  .replace("</body>", `<div id="imgbox" style="margin:24px;width:1080px;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.15)"></div>
<script>
var app=window.creditAnalyseApp;
app.state.periodType="week"; app.state.origin="all"; app.state.selectedKey="";
app.generateReportImage(app.getDashboardContext(),{mount:document.getElementById("imgbox")});
</script>
</body>`);
fs.writeFileSync(path.join(__dirname, "..", "preview-image.html"), imgHtml, "utf8");

// preview-filter.html: volledige app met een actief groepsfilter (voorkombaar).
const filterHtml = html.replace("</body>", `<script>
var a=window.creditAnalyseApp; a.state.selectedGroupFilter="voorkombaar"; a.renderDashboard();
</script>
</body>`);
fs.writeFileSync(path.join(__dirname, "..", "preview-filter.html"), filterHtml, "utf8");

// preview-verloop.html: volledige app op de Verloop-tab.
const verloopHtml = html.replace("</body>", `<script>
var a=window.creditAnalyseApp; a.state.activeTab="verloop"; a.renderDashboard();
</script>
</body>`);
fs.writeFileSync(path.join(__dirname, "..", "preview-verloop.html"), verloopHtml, "utf8");

const verloop13Html = html.replace("</body>", `<script>
var a=window.creditAnalyseApp; a.state.activeTab="verloop"; a.state.trendRange="13"; a.renderDashboard();
</script>
</body>`);
fs.writeFileSync(path.join(__dirname, "..", "preview-verloop13.html"), verloop13Html, "utf8");
console.log(`previews geschreven met ${records.length} records`);
