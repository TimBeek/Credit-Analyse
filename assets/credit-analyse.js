(function () {
  "use strict";

  const IS_BROWSER = typeof document !== "undefined";
  const HAS_STORAGE = (() => {
    try { return typeof localStorage !== "undefined"; } catch { return false; }
  })();

  const STORAGE_KEY = "remarkt.creditAnalyse.records.v2";
  const META_KEY = "remarkt.creditAnalyse.meta.v2";
  const ACTIVE_KEY = "remarkt.creditAnalyse.activeAt.v2";
  const ADJUSTMENT_KEY = "remarkt.creditAnalyse.adjustments.v1";
  const RETENTION_MS = 30 * 60 * 1000;   // auto-wis na 30 minuten inactiviteit
  const RETENTION_LABEL = "30 minuten";
  const FALLBACK_REASON = "Overige";

  function retentionExpired(activeAt, now) {
    return Boolean(activeAt) && (now - activeAt) > RETENTION_MS;
  }

  // Wist opgeslagen analyse als die te lang ongebruikt is (privacy). Draait vóór
  // het laden, zodat een terugkerende bezoeker geen oude data ziet.
  function wipeIfStale() {
    if (!HAS_STORAGE) return;
    try {
      if (!localStorage.getItem(STORAGE_KEY)) return;
      const activeAt = Number(localStorage.getItem(ACTIVE_KEY) || 0);
      if (retentionExpired(activeAt, Date.now())) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(META_KEY);
        localStorage.removeItem(ACTIVE_KEY);
        localStorage.removeItem(ADJUSTMENT_KEY);
      } else if (!activeAt) {
        localStorage.setItem(ACTIVE_KEY, String(Date.now()));
      }
    } catch { /* opslag niet beschikbaar */ }
  }
  wipeIfStale();

  const EXPECTED_REASONS = [
    "Aangehouden actieprijs",
    "Akkoord met goedkoper alternatief",
    "Annulering door klant",
    "Annulering door Riverty",
    "Bestelling intern niet doorgezet",
    "Bestelling vies geleverd",
    "Doorlooptijd retouren te lang",
    "Fout in website, actie niet werkzaam",
    "Fout in website, betalingsmelding",
    "Fout in website, configuratie niet leverbaar",
    "Fout in website, geen passend dock",
    "Fout in website, klarna order niet doorgekomen",
    "Fout in website, livegang M2",
    "Fout in website, mollie koppeling",
    "Fout in website, niet leverbaar",
    "Fout in website, onjuiste omschrijving",
    "Fout in website, onjuiste verkoopprijs",
    "Fraudemelding creditcard",
    "Niet akkoord met alt",
    "Niet akkoord met BTW verrekening",
    "Niet leverbaar",
    "Niet naar wens",
    "Niet naar wens, geen A-grade ontvangen",
    "Niet naar wens, accu",
    "Niet naar wens, B-grade",
    "Niet naar wens, C-grade",
    "Niet naar wens, IOS te oud",
    "Niet naar wens, toetsenbordstickers",
    "Niet naar wens, universele voeten",
    "Niet werkzaam",
    "Onbekend",
    FALLBACK_REASON,
    "Ondeugdelijk product",
    "Order intern kwijt",
    "PostNL, pakket kwijt",
    "PostNL, retourafzender",
    "Te lange levertijd",
    "Terugbetaling dubbele betaling",
    "Transportschade",
    "Uitspraak stichting DigiDispuut",
    "Uitvoering BTW verrekening",
    "Verkeerd besteld",
    "Verkeerd geleverd",
  ];

  const REASON_ALIASES = new Map([
    ["annuerling door klant", "Annulering door klant"],
    ["geannuleerd door klant", "Annulering door klant"],
    ["niet akoord met alt", "Niet akkoord met alt"],
    ["niet akkoord met alternatief", "Niet akkoord met alt"],
    ["doorlooptijd retouren te lang ", "Doorlooptijd retouren te lang"],
    ["niet naar wens ", "Niet naar wens"],
    ["verkeerd besteld ", "Verkeerd besteld"],
    ["vies geleverd", "Bestelling vies geleverd"],
  ]);

  // Redenen die Wout expliciet wekelijks wil volgen. Deze krijgen eigen tegels.
  const FOCUS_REASONS = ["Niet akkoord met alt", "Niet werkzaam"];

  const PERIOD_TYPES = {
    week: { label: "Week", plural: "weken", previousLabel: "vorige week", pickLimit: 26 },
    month: { label: "Maand", plural: "maanden", previousLabel: "vorige maand", pickLimit: 12 },
    quarter: { label: "Kwartaal", plural: "kwartalen", previousLabel: "vorig kwartaal", pickLimit: 8 },
    year: { label: "Jaar", plural: "jaren", previousLabel: "vorig jaar", pickLimit: 6 },
  };

  // Redenen gebundeld in begrijpelijke groepen. "Voorkombaar" = fouten die we zelf
  // kunnen oplossen (website, prijs, intern) -> dit is geld dat je had kunnen besparen.
  const REASON_GROUPS = [
    { key: "voorkombaar", label: "Voorkombaar — onze fout", short: "Voorkombaar", note: "Website-, prijs- en interne fouten. Dit had je kunnen voorkomen.", tone: "bad" },
    { key: "klant", label: "Klantkeuze", short: "Klantkeuze", note: "Klant wilde het toch niet of bestelde verkeerd. Lastig te voorkomen.", tone: "neutral" },
    { key: "transport", label: "Transport & bezorging", short: "Transport", note: "Schade onderweg, PostNL, te lange lever- of retourtijd.", tone: "warn" },
    { key: "product", label: "Product & kwaliteit", short: "Product", note: "Product werkt niet, defect, accu of grade niet zoals verwacht.", tone: "warn" },
    { key: "overig", label: "Financieel & overig", short: "Overig", note: "Dubbele betaling, BTW, fraude, geschillen en onbekende redenen.", tone: "neutral" },
  ];
  const GROUP_BY_KEY = new Map(REASON_GROUPS.map(group => [group.key, group]));
  const PREVENTABLE_GROUP = "voorkombaar";
  // Voorkombaar = rood (aandacht). De rest in aflopende tinten van één rustige
  // blauwtint, zodat de compositie leesbaar blijft zonder regenboog.
  const GROUP_COLORS = {
    voorkombaar: "#db5461",
    klant: "#3e6f93",
    transport: "#6a93b0",
    product: "#94b2c9",
    overig: "#c0d0dd",
  };

  // Bepaalt de groep van een reden op basis van trefwoorden, zodat ook nieuwe
  // of onbekende redenen automatisch netjes worden ingedeeld.
  function reasonGroupKey(reason) {
    const key = normalizeKey(reason);
    if (!key) return "overig";
    if (key.includes("fout in website")) return "voorkombaar";
    if (key.includes("intern")) return "voorkombaar";
    if (key.includes("order") && key.includes("kwijt")) return "voorkombaar";
    if (key.includes("vies geleverd")) return "voorkombaar";
    if (key.includes("verkeerd geleverd")) return "voorkombaar";
    if (key.includes("aangehouden actieprijs")) return "voorkombaar";
    if (key === "niet leverbaar") return "voorkombaar";
    if (key.includes("transport")) return "transport";
    if (key.includes("postnl")) return "transport";
    if (key.includes("levertijd")) return "transport";
    if (key.includes("doorlooptijd")) return "transport";
    if (key.includes("ondeugdelijk")) return "product";
    if (key.includes("niet werkzaam")) return "product";
    if (key.includes("accu")) return "product";
    if (key.includes("grade")) return "product";
    if (key.includes("ios te oud")) return "product";
    if (key.includes("toetsenbordstickers")) return "product";
    if (key.includes("universele voeten")) return "product";
    if (key.includes("btw")) return "overig";
    if (key.includes("dubbele betaling")) return "overig";
    if (key.includes("fraude")) return "overig";
    if (key.includes("digidispuut")) return "overig";
    if (key.includes("riverty")) return "overig";
    if (key.includes("onbekend")) return "overig";
    if (key === normalizeKey(FALLBACK_REASON)) return "overig";
    return "klant";
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  function initialTabFromUrl() {
    if (!IS_BROWSER) return "overview";
    try {
      const tab = new URLSearchParams(window.location.search).get("tab");
      return ["overview", "verloop", "control"].includes(tab) ? tab : "overview";
    } catch {
      return "overview";
    }
  }

  const state = {
    records: loadRecords(),
    meta: loadMeta(),
    adjustments: loadAdjustments(),
    analysisBasis: "operational",
    quality: null,
    reasonList: EXPECTED_REASONS,
    periodType: "week",
    selectedKey: "",
    origin: "all",
    reasonSearch: "",
    activeTab: initialTabFromUrl(),
    selectedTrendKey: "",
    selectedGroupFilter: "",
    importBannerDismissed: false,
    trendMetric: "total",   // total | count | average
    trendRange: "all",      // 13 | 26 | 52 | all
    forecastOn: true,
    compareSort: "amount",  // amount | count | share | shareDelta | amountDelta | reason
    compareSortDir: "desc",
  };
  if (state.records.length) {
    try { saveRecords(state.records, state.meta); } catch { /* lezen/exporteren blijft werken */ }
  }

  const els = IS_BROWSER ? {
    app: document.getElementById("creditApp"),
    fileInputs: [document.getElementById("fileInputHeader"), document.getElementById("fileInputDrop")],
    clearHistory: document.getElementById("clearHistory"),
    exportCsv: document.getElementById("exportCsv"),
    downloadReport: document.getElementById("downloadReport"),
    downloadImage: document.getElementById("downloadImage"),
    dropZone: document.getElementById("dropZone"),
    contextStrip: document.getElementById("contextStrip"),
    importBanner: document.getElementById("importBanner"),
    controlBar: document.getElementById("controlBar"),
    basisBar: document.getElementById("basisBar"),
    basisSummary: document.getElementById("basisSummary"),
    dashboard: document.getElementById("dashboard"),
    periodSelect: document.getElementById("periodSelect"),
    originSelect: document.getElementById("originSelect"),
    reasonSearch: document.getElementById("reasonSearch"),
    hero: document.getElementById("hero"),
    focusRow: document.getElementById("focusRow"),
    groupBreakdown: document.getElementById("groupBreakdown"),
    signalBand: document.getElementById("signalBand"),
    paretoChart: document.getElementById("paretoChart"),
    changeDrivers: document.getElementById("changeDrivers"),
    compareMeta: document.getElementById("compareMeta"),
    compareTable: document.getElementById("compareTable"),
    trendChart: document.getElementById("trendChart"),
    originSplit: document.getElementById("originSplit"),
    periodTotals: document.getElementById("periodTotals"),
    qualityDetails: document.getElementById("qualityDetails"),
    adjustmentPanel: document.getElementById("adjustmentPanel"),
  } : {};

  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  function loadRecords() {
    if (!HAS_STORAGE) return [];
    try {
      const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(records) ? records.map(normalizeStoredRecord).filter(isValidRecord) : [];
    } catch { return []; }
  }

  function loadMeta() {
    if (!HAS_STORAGE) return null;
    try {
      const meta = JSON.parse(localStorage.getItem(META_KEY) || "null");
      return meta && typeof meta === "object" ? meta : null;
    } catch { return null; }
  }

  function saveRecords(records, meta) {
    if (!HAS_STORAGE) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      localStorage.setItem(META_KEY, JSON.stringify(meta || null));
      localStorage.setItem(ACTIVE_KEY, String(Date.now()));
    } catch (error) {
      const quota = error && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
      throw new Error(quota
        ? "De browser kan de analyse niet lokaal opslaan omdat de opslagruimte vol is. Wis oude browserdata of gebruik CSV/PDF zonder historie."
        : "De analyse kon niet lokaal worden opgeslagen. Controleer of lokale browseropslag is toegestaan.");
    }
  }

  function isValidRecord(record) {
    return record && typeof record === "object"
      && record.weekKey && record.monthKey && record.quarterKey && record.yearKey
      && record.reason && record.origin
      && Number.isFinite(Number(record.amount)) && Number.isFinite(Number(record.count));
  }

  function normalizeStoredRecord(record) {
    if (!record || typeof record !== "object") return record;
    const yearFix = correctYearNumber(Number(record.yearKey));
    const fixedYear = yearFix.year ? String(yearFix.year) : String(record.yearKey || "");
    return {
      ...record,
      yearKey: fixedYear,
      weekKey: correctYearPrefix(record.weekKey, /^(\d{4})-W(\d{2})$/, (year, suffix) => `${year}-W${suffix}`),
      monthKey: correctYearPrefix(record.monthKey, /^(\d{4})-(\d{2})$/, (year, suffix) => `${year}-${suffix}`),
      quarterKey: correctYearPrefix(record.quarterKey, /^(\d{4})-Q(\d)$/, (year, suffix) => `${year}-Q${suffix}`),
    };
  }

  function correctYearPrefix(value, pattern, build) {
    const text = String(value || "");
    const match = text.match(pattern);
    if (!match) return text;
    const fixed = correctYearNumber(Number(match[1])).year || Number(match[1]);
    return build(fixed, match[2]);
  }

  // ---------------------------------------------------------------------------
  // Formatting & parsing helpers
  // ---------------------------------------------------------------------------
  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function normalizeText(value) {
    return String(value ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim();
  }

  function normalizeKey(value) { return normalizeText(value).toLowerCase(); }

  function formatMoney(value) {
    return Number(value || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  }

  function formatMoneyExact(value) {
    return Number(value || 0).toLocaleString("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatSignedMoney(value) {
    const number = Math.round(Number(value || 0));
    return `${number > 0 ? "+" : number < 0 ? "−" : ""}${formatMoney(Math.abs(number))}`;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("nl-NL");
  }

  function formatPercent(value, digits = 1) {
    return `${Number(value || 0).toLocaleString("nl-NL", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
  }

  function formatSignedPercent(value, digits = 1) {
    const number = Number(value || 0);
    const sign = number > 0 ? "+" : number < 0 ? "−" : "";
    return `${sign}${formatPercent(Math.abs(number), digits)}`;
  }

  // Kostentrend: bij credits is hoger = slechter, dus "up" wordt rood.
  function costTrendClass(value, deadzone = 0.05) {
    if (value > deadzone) return "is-up";
    if (value < -deadzone) return "is-down";
    return "is-flat";
  }

  function trendArrow(value, deadzone = 0.05) {
    if (value > deadzone) return "▲";
    if (value < -deadzone) return "▼";
    return "→";
  }

  function parseMoney(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    let text = normalizeText(value);
    if (!text) return null;
    const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
    text = text.replace(/[^\d,.-]/g, "");
    if (!text) return null;
    const commaIndex = text.lastIndexOf(",");
    const dotIndex = text.lastIndexOf(".");
    if (commaIndex > -1 && dotIndex > -1) {
      text = commaIndex > dotIndex ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
    } else if (commaIndex > -1) {
      text = text.replace(",", ".");
    }
    const number = Number.parseFloat(text);
    if (!Number.isFinite(number)) return null;
    return negative ? -Math.abs(number) : number;
  }

  function parseInteger(value) {
    if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
    const match = normalizeText(value).match(/\d+/);
    return match ? Number(match[0]) : null;
  }

  function isPlausibleYear(year) {
    const currentYear = new Date().getFullYear();
    return Number.isInteger(year) && year >= 2018 && year <= currentYear + 1;
  }

  // Herstelt kromme jaartallen automatisch:
  //  - 2 cijfers  ->  20xx        (24 -> 2024)
  //  - 3 cijfers  ->  ontbrekend cijfer aanvullen  (226 -> 2026, 206 -> 2026)
  //  - 4 cijfers  ->  omgewisselde cijfers rechtzetten  (2202 -> 2022)
  // De uitkomst moet een geloofwaardig jaar zijn; anders geen correctie.
  function correctYearNumber(year) {
    if (!Number.isInteger(year)) return { year: null, corrected: false, raw: year };
    if (isPlausibleYear(year)) return { year, corrected: false, raw: year };
    const currentYear = new Date().getFullYear();
    const text = String(Math.abs(year));
    const candidates = new Set();
    if (year >= 0 && year < 100) candidates.add(2000 + year);
    if (text.length === 3) {
      // Voeg op elke positie een cijfer 0-9 in om een 4-cijferig jaar te maken.
      for (let pos = 0; pos <= 3; pos += 1) {
        for (let digit = 0; digit <= 9; digit += 1) {
          candidates.add(Number(`${text.slice(0, pos)}${digit}${text.slice(pos)}`));
        }
      }
    }
    if (text.length === 4) {
      // Wissel elk paar cijfers om (typefout zoals 2202 <-> 2022).
      for (let i = 0; i < 4; i += 1) {
        for (let j = i + 1; j < 4; j += 1) {
          const chars = text.split("");
          [chars[i], chars[j]] = [chars[j], chars[i]];
          candidates.add(Number(chars.join("")));
        }
      }
    }
    const best = Array.from(candidates).filter(isPlausibleYear)
      .sort((a, b) => Math.abs(a - currentYear) - Math.abs(b - currentYear))[0];
    return best ? { year: best, corrected: true, raw: year } : { year: null, corrected: false, raw: year };
  }

  function parseYearValue(value) { return correctYearNumber(parseInteger(value)); }

  function excelSerialToDate(value) {
    if (!(typeof window !== "undefined" && window.XLSX && window.XLSX.SSF) || typeof value !== "number") return null;
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }

  function parseDateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
    if (typeof value === "number" && Number.isFinite(value)) return excelSerialToDate(value);
    const text = normalizeText(value);
    if (!text) return null;
    const dutch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
    if (dutch) {
      const year = Number(dutch[3].length === 2 ? `20${dutch[3]}` : dutch[3]);
      const date = new Date(year, Number(dutch[2]) - 1, Number(dutch[1]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (iso) {
      const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function getIsoWeekParts(date) {
    const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = copy.getUTCDay() || 7;
    copy.setUTCDate(copy.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
    const week = Math.ceil((((copy - yearStart) / 86400000) + 1) / 7);
    return { year: copy.getUTCFullYear(), week };
  }

  function pad2(value) { return String(value).padStart(2, "0"); }

  function makePeriodKeys(date, fallbackYear, fallbackWeek) {
    const derivedDate = date || makeDateFromIsoWeek(fallbackYear, fallbackWeek);
    const iso = derivedDate ? getIsoWeekParts(derivedDate) : { year: fallbackYear, week: fallbackWeek };
    const rawYear = derivedDate ? derivedDate.getFullYear() : fallbackYear;
    const month = derivedDate ? derivedDate.getMonth() + 1 : null;
    const quarter = month ? Math.ceil(month / 3) : null;
    // Harde garantie: het jaar in elke periodesleutel is altijd geloofwaardig,
    // ongeacht of het uit een datum of uit de jaar-kolom komt (2202 -> 2022).
    const year = correctYearNumber(rawYear).year || rawYear;
    const isoYear = correctYearNumber(iso.year).year || iso.year;
    const validWeek = Number.isInteger(iso.week) && iso.week >= 1 && iso.week <= 53;
    return {
      weekKey: isoYear && validWeek ? `${isoYear}-W${pad2(iso.week)}` : "",
      monthKey: year && month ? `${year}-${pad2(month)}` : "",
      quarterKey: year && quarter ? `${year}-Q${quarter}` : "",
      yearKey: year ? String(year) : "",
    };
  }

  function makeDateFromIsoWeek(year, week) {
    if (!year || !week || week < 1 || week > 53) return null;
    const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
    const day = simple.getUTCDay() || 7;
    const monday = new Date(simple);
    monday.setUTCDate(simple.getUTCDate() + (day <= 4 ? 1 - day : 8 - day));
    return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
  }

  function periodKeyForRecord(record, type) {
    if (type === "week") return record.weekKey;
    if (type === "month") return record.monthKey;
    if (type === "quarter") return record.quarterKey;
    return record.yearKey;
  }

  const MONTH_NAMES = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

  function labelPeriod(type, key) {
    if (!key) return "-";
    if (type === "week") {
      const match = key.match(/^(\d{4})-W(\d{2})$/);
      return match ? `Week ${Number(match[2])} · ${match[1]}` : key.replace("-W", " week ");
    }
    if (type === "month") {
      const [year, month] = key.split("-");
      return `${MONTH_NAMES[Number(month) - 1] || month} ${year}`;
    }
    if (type === "quarter") return key.replace("-", " ");
    return key;
  }

  function shortPeriodLabel(type, key) {
    if (!key) return "-";
    if (type === "week") {
      const match = key.match(/^(\d{4})-W(\d{2})$/);
      return match ? `W${Number(match[2])}` : key;
    }
    if (type === "month") {
      const [year, month] = key.split("-");
      return `${MONTH_NAMES[Number(month) - 1] || month}`;
    }
    if (type === "quarter") {
      const match = key.match(/^(\d{4})-Q(\d)$/);
      return match ? `Q${match[2]}` : key;
    }
    return key;
  }

  function periodSortValue(type, key) {
    if (type === "week") { const m = key.match(/^(\d{4})-W(\d{2})$/); return m ? Number(m[1]) * 100 + Number(m[2]) : 0; }
    if (type === "month") { const m = key.match(/^(\d{4})-(\d{2})$/); return m ? Number(m[1]) * 100 + Number(m[2]) : 0; }
    if (type === "quarter") { const m = key.match(/^(\d{4})-Q(\d)$/); return m ? Number(m[1]) * 10 + Number(m[2]) : 0; }
    return Number(key) || 0;
  }

  function normalizeOrigin(value) {
    const key = normalizeKey(value);
    if (key.includes("retour")) return "Retouren";
    if (key.includes("klanten") || key === "ks") return "Klantenservice";
    return normalizeText(value) || "Onbekend";
  }

  // ---------------------------------------------------------------------------
  // Reason normalisation & import quality
  // ---------------------------------------------------------------------------
  function getReasonLookup(reasons) {
    const lookup = new Map();
    reasons.forEach(reason => lookup.set(normalizeKey(reason), reason));
    REASON_ALIASES.forEach((value, key) => lookup.set(key, value));
    return lookup;
  }

  function normalizeReasonWithStatus(value, lookup) {
    const clean = normalizeText(value);
    if (!clean) return { reason: "", changed: false };
    const reason = lookup.get(normalizeKey(clean)) || clean;
    return { reason, changed: reason !== clean };
  }

  function levenshteinDistance(a, b) {
    const left = normalizeKey(a);
    const right = normalizeKey(b);
    if (!left) return right.length;
    if (!right) return left.length;
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = new Array(right.length + 1);
    for (let i = 1; i <= left.length; i += 1) {
      current[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      }
      for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
    }
    return previous[right.length];
  }

  function suggestReason(reason, reasonList) {
    const clean = normalizeText(reason);
    if (!clean) return "";
    const candidates = reasonList
      .map(known => ({ known, score: levenshteinDistance(clean, known) }))
      .sort((a, b) => a.score - b.score || a.known.localeCompare(b.known));
    const best = candidates[0];
    return best && best.score <= Math.max(3, Math.floor(clean.length * 0.25)) ? best.known : "";
  }

  function addSkippedSample(quality, rowNumber, issue) {
    if (quality.skippedSamples.length < 20) quality.skippedSamples.push({ rowNumber, issue });
  }
  function addWarningSample(quality, rowNumber, issue) {
    if (quality.warningSamples.length < 20) quality.warningSamples.push({ rowNumber, issue });
  }

  function sameDateKey(left, right) {
    if (!left || !right) return false;
    return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
  }

  function isUsableNeighborValue(key, value) {
    if (!value) return false;
    if (key === "origin") return value !== "Onbekend";
    return true;
  }

  function findNeighborValue(preparedRows, index, key, maxDistance = 3) {
    for (let distance = 1; distance <= maxDistance; distance += 1) {
      const previous = preparedRows[index - distance];
      const next = preparedRows[index + distance];
      const previousValue = previous && previous[key];
      const nextValue = next && next[key];
      const previousUsable = isUsableNeighborValue(key, previousValue);
      const nextUsable = isUsableNeighborValue(key, nextValue);
      if (previousUsable && nextUsable) {
        if (key === "date" && sameDateKey(previousValue, nextValue)) return { value: previousValue, source: `boven en onder (${distance})` };
        if (key !== "date" && previousValue === nextValue) return { value: previousValue, source: `boven en onder (${distance})` };
      }
      if (distance === 1 && previousUsable) return { value: previousValue, source: "regel erboven" };
      if (distance === 1 && nextUsable) return { value: nextValue, source: "regel eronder" };
    }
    return { value: null, source: "" };
  }

  function prepareRawRow(raw, columns, reasonLookup) {
    const reasonStatus = normalizeReasonWithStatus(raw[columns.reason], reasonLookup);
    const yearInfo = parseYearValue(columns.year ? raw[columns.year] : "");
    return {
      raw,
      amount: parseMoney(raw[columns.amount]),
      date: parseDateValue(columns.date ? raw[columns.date] : ""),
      year: yearInfo.year,
      yearCorrected: yearInfo.corrected,
      rawYear: yearInfo.raw,
      week: parseInteger(columns.week ? raw[columns.week] : ""),
      reason: reasonStatus.reason,
      reasonChanged: reasonStatus.changed,
      origin: normalizeOrigin(columns.origin ? raw[columns.origin] : ""),
    };
  }

  function pickSheet(workbook) {
    const names = workbook.SheetNames || [];
    if (!names.length) return { name: "", sheet: null };
    const preferred = names.find(name => normalizeKey(name) === "credit ruwe data")
      || names.find(name => normalizeKey(name).includes("ruwe data"))
      || names[0];
    return { name: preferred, sheet: workbook.Sheets[preferred] };
  }

  function readLegend(workbook) {
    const legendName = (workbook.SheetNames || []).find(name => normalizeKey(name) === "legenda");
    if (!legendName) return EXPECTED_REASONS;
    const rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[legendName], { header: 1, defval: "", raw: true });
    const reasons = rows.map(row => normalizeText(row && row[0])).filter(Boolean);
    const list = reasons.length ? reasons : EXPECTED_REASONS;
    return list.some(reason => normalizeKey(reason) === normalizeKey(FALLBACK_REASON)) ? list : [...list, FALLBACK_REASON];
  }

  function detectColumns(row) {
    const headers = Object.keys(row || {});
    const byKey = new Map(headers.map(header => [normalizeKey(header), header]));
    const find = (...candidates) => {
      for (const candidate of candidates) {
        const exact = byKey.get(normalizeKey(candidate));
        if (exact) return exact;
      }
      for (const header of headers) {
        const key = normalizeKey(header);
        if (candidates.some(candidate => key.includes(normalizeKey(candidate)))) return header;
      }
      return "";
    };
    return {
      amount: find("Bedrag", "Terug gestort incl. BTW", "Credit bedrag"),
      origin: find("Herkomst", "Afdeling", "Bron"),
      week: find("Weeknummer", "Week"),
      date: find("Datum", "Creditdatum"),
      year: find("Jaar"),
      reason: find("Reden", "Categorie", "Credit reden"),
      order: find("Ordernummer", "Order"),
      name: find("Naam", "Achternaam"),
    };
  }

  function aggregateRows(rows) {
    const map = new Map();
    rows.forEach(row => {
      const key = [row.weekKey, row.monthKey, row.quarterKey, row.yearKey, row.reason, row.origin].join("|");
      const record = map.get(key) || {
        weekKey: row.weekKey, monthKey: row.monthKey, quarterKey: row.quarterKey, yearKey: row.yearKey,
        reason: row.reason, origin: row.origin, amount: 0, count: 0,
      };
      record.amount += row.amount;
      record.count += 1;
      map.set(key, record);
    });
    return Array.from(map.values()).map(record => ({ ...record, amount: Math.round(record.amount * 100) / 100 }));
  }

  function parseWorkbookRecords(workbook, filename) {
    const reasonList = readLegend(workbook);
    const reasonLookup = getReasonLookup(reasonList);
    const picked = pickSheet(workbook);
    if (!picked.sheet) throw new Error("Geen bruikbaar werkblad gevonden. Zorg dat het Excelbestand minimaal één tabblad met creditregels bevat.");
    const rawRows = window.XLSX.utils.sheet_to_json(picked.sheet, { defval: "", raw: true });
    if (!rawRows.length) throw new Error(`Werkblad "${picked.name}" bevat geen tabelregels. Controleer of de eerste rij kolomnamen bevat.`);
    const firstDataRow = rawRows.find(row => Object.values(row).some(value => normalizeText(value)));
    const columns = detectColumns(firstDataRow);
    const quality = {
      file: filename, sheet: picked.name, sourceRows: rawRows.length,
      parsedRows: 0, storedRecords: 0, skippedRows: 0,
      missingAmount: 0, missingReason: 0, missingDate: 0, missingOrigin: 0,
      recoveredDateRows: 0, recoveredNeighborDateRows: 0, recoveredWeekYearRows: 0, recoveredNeighborWeekYearRows: 0, recoveredOriginRows: 0, recoveredAmountRows: 0,
      correctedYearRows: 0, fallbackReasonRows: 0, normalizedReasonRows: 0,
      negativeAmountRows: 0, possibleDuplicateRows: 0,
      warningSamples: [], skippedSamples: [], unknownReasons: new Map(),
      importedWeeks: new Set(),
      ignoredPersonalColumns: [columns.name ? "Naam" : "", columns.order ? "Ordernummer" : ""].filter(Boolean),
    };
    if (!columns.amount || !columns.reason) {
      const foundHeaders = Object.keys(firstDataRow || {}).filter(Boolean);
      const missing = [columns.amount ? "" : "Bedrag", columns.reason ? "" : "Reden"].filter(Boolean).join(" en ");
      throw new Error(`${missing} ${missing.includes(" en ") ? "zijn" : "is"} nodig voor analyse. Gevonden kolommen: ${foundHeaders.length ? foundHeaders.join(", ") : "geen"}.`);
    }

    const rows = [];
    const rowFingerprints = new Set();
    const preparedRows = rawRows.map(raw => prepareRawRow(raw, columns, reasonLookup));
    preparedRows.forEach((prepared, index) => {
      const rowNumber = index + 2;
      let amount = prepared.amount;
      let date = prepared.date;
      let explicitYear = prepared.year;
      let explicitWeek = prepared.week;
      let reason = prepared.reason;
      let origin = prepared.origin;

      // Een bedrag is financieel brongegeven en mag nooit uit een buurregel worden
      // gegokt. Zet de regel in quarantaine en laat de gebruiker het Excelbestand
      // corrigeren; zo kan een rapport geen verzonnen eurobedrag bevatten.
      if (amount === null) {
        quality.missingAmount += 1;
        addSkippedSample(quality, rowNumber, "Leeg of ongeldig bedrag — corrigeer deze regel in Excel en importeer opnieuw");
      }
      if (!reason) {
        quality.missingReason += 1; quality.fallbackReasonRows += 1; reason = FALLBACK_REASON;
        addWarningSample(quality, rowNumber, `Geen reden ingevuld, gezet op ${FALLBACK_REASON}`);
      }
      if (prepared.yearCorrected) {
        quality.correctedYearRows += 1;
        addWarningSample(quality, rowNumber, `Jaar ${prepared.rawYear} gecorrigeerd naar ${explicitYear}`);
      }
      if (!date) {
        const neighborDate = findNeighborValue(preparedRows, index, "date");
        if (neighborDate.value) {
          date = neighborDate.value; explicitYear = date.getFullYear();
          quality.recoveredDateRows += 1; quality.recoveredNeighborDateRows += 1;
          addWarningSample(quality, rowNumber, `Datum overgenomen van ${neighborDate.source}`);
        }
      }
      // Fout jaartal ín de datum zelf (bv. 3-7-2202): corrigeer of val terug op week/jaar.
      if (date && !isPlausibleYear(date.getFullYear())) {
        const fix = correctYearNumber(date.getFullYear());
        if (fix.year) {
          addWarningSample(quality, rowNumber, `Fout jaartal in datum (${date.getFullYear()}) gecorrigeerd naar ${fix.year}`);
          date = new Date(fix.year, date.getMonth(), date.getDate());
          explicitYear = fix.year;
          quality.correctedYearRows += 1;
        } else {
          date = null;
        }
      }
      // Geen datum maar wel een buurregel met week/jaar: neem die over.
      if (!date && !explicitWeek) {
        const neighborWeek = findNeighborValue(preparedRows, index, "week");
        if (neighborWeek.value) { explicitWeek = neighborWeek.value; quality.recoveredNeighborWeekYearRows += 1; addWarningSample(quality, rowNumber, `Weeknummer overgenomen van ${neighborWeek.source}`); }
      }
      if (!date && !explicitYear) {
        const neighborYear = findNeighborValue(preparedRows, index, "year");
        if (neighborYear.value) { explicitYear = neighborYear.value; quality.recoveredNeighborWeekYearRows += 1; addWarningSample(quality, rowNumber, `Jaar overgenomen van ${neighborYear.source}`); }
      }
      if (!date && explicitYear && explicitWeek) {
        quality.recoveredDateRows += 1; quality.recoveredWeekYearRows += 1;
        addWarningSample(quality, rowNumber, "Datum/periode afgeleid uit weeknummer en jaar");
      }
      if (!date && (!explicitYear || !explicitWeek)) {
        quality.missingDate += 1; addSkippedSample(quality, rowNumber, "Geen datum en geen bruikbare week/jaar");
      }
      if (origin === "Onbekend") {
        const neighborOrigin = findNeighborValue(preparedRows, index, "origin");
        if (neighborOrigin.value) {
          origin = neighborOrigin.value; quality.recoveredOriginRows += 1;
          addWarningSample(quality, rowNumber, `Herkomst overgenomen van ${neighborOrigin.source}`);
        }
      }
      if (amount === null || (!date && (!explicitYear || !explicitWeek))) { quality.skippedRows += 1; return; }
      if (prepared.reasonChanged) {
        quality.normalizedReasonRows += 1; addWarningSample(quality, rowNumber, `Reden opgeschoond naar: ${reason}`);
      }
      if (origin === "Onbekend") { quality.missingOrigin += 1; addWarningSample(quality, rowNumber, "Herkomst ontbreekt of is onbekend"); }
      if (amount < 0) { quality.negativeAmountRows += 1; addWarningSample(quality, rowNumber, "Negatief bedrag blijft zichtbaar in totalen"); }
      if (!reasonList.some(known => normalizeKey(known) === normalizeKey(reason))) {
        const existing = quality.unknownReasons.get(reason) || { count: 0, suggestion: suggestReason(reason, reasonList) };
        existing.count += 1; quality.unknownReasons.set(reason, existing);
        addWarningSample(quality, rowNumber, existing.suggestion ? `Onbekende reden, suggestie: ${existing.suggestion}` : "Onbekende reden zonder duidelijke suggestie");
      }

      const periods = makePeriodKeys(date, explicitYear, explicitWeek);
      if (!periods.weekKey || !periods.monthKey || !periods.quarterKey || !periods.yearKey) {
        quality.skippedRows += 1; addSkippedSample(quality, rowNumber, "Periode kon niet worden bepaald"); return;
      }
      const duplicateDateKey = date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` : periods.weekKey;
      const fingerprint = [duplicateDateKey, amount, reason, origin].join("|");
      if (rowFingerprints.has(fingerprint)) {
        quality.possibleDuplicateRows += 1; addWarningSample(quality, rowNumber, "Mogelijk dubbele analyse-regel");
      }
      rowFingerprints.add(fingerprint);
      rows.push({ amount, reason, origin, ...periods });
      quality.parsedRows += 1; quality.importedWeeks.add(periods.weekKey);
    });

    const records = aggregateRows(rows);
    quality.storedRecords = records.length;
    if (!records.length) throw new Error("Er zijn geen bruikbare creditregels gevonden. Controleer bedrag, reden en datum of week/jaar in het bestand.");
    return { records, reasonList, meta: { filename, sheet: picked.name, importedAt: new Date().toISOString(), columns }, quality };
  }

  function mergeImportedRecords(existingRecords, importedRecords) {
    const importedWeeks = new Set(importedRecords.map(record => record.weekKey));
    return [
      ...existingRecords.filter(record => !importedWeeks.has(record.weekKey)),
      ...importedRecords,
    ].sort((a, b) => periodSortValue("week", a.weekKey) - periodSortValue("week", b.weekKey)
      || a.reason.localeCompare(b.reason) || a.origin.localeCompare(b.origin));
  }

  // ---------------------------------------------------------------------------
  // Analysis (pure over state.records + filters)
  // ---------------------------------------------------------------------------
  function periodKeysFromWeekKey(weekKey) {
    const match = String(weekKey || "").match(/^(\d{4})-W(\d{2})$/);
    return match ? makePeriodKeys(null, Number(match[1]), Number(match[2])) : null;
  }

  function validAdjustmentsForRecords(records, adjustments) {
    return (adjustments || []).map(normalizeAdjustment).filter(adjustment => {
      if (!adjustment) return false;
      const available = records
        .filter(record => record.weekKey === adjustment.currentKey && record.origin === adjustment.origin)
        .reduce((sum, record) => sum + Math.max(0, Number(record.amount) || 0), 0);
      return available > 0 && adjustment.amount <= available + 0.01;
    });
  }

  // Herverdeelt alleen de geselecteerde Retourenbatch. De bronrecords blijven
  // onaangetast; dit resultaat bestaat uitsluitend voor operationele analyse.
  function applyReturnAdjustments(records, adjustments) {
    const valid = validAdjustmentsForRecords(records, adjustments);
    if (!valid.length) return records.slice();
    let result = records.map(record => ({ ...record }));
    valid.forEach(adjustment => {
      const returnRows = result.filter(record =>
        record.weekKey === adjustment.currentKey && record.origin === adjustment.origin
      );
      const available = returnRows.reduce((sum, record) => sum + Math.max(0, Number(record.amount) || 0), 0);
      if (!(available > 0)) return;
      const ratio = Math.min(1, adjustment.amount / available);
      const targetPeriods = periodKeysFromWeekKey(adjustment.targetKey);
      if (!targetPeriods) return;
      const shifted = [];
      result = result.map(record => {
        if (record.weekKey !== adjustment.currentKey || record.origin !== adjustment.origin) return record;
        const movedAmount = Math.max(0, record.amount) * ratio;
        const movedCount = Math.max(0, record.count) * ratio;
        shifted.push({
          ...record,
          ...targetPeriods,
          amount: movedAmount,
          count: movedCount,
        });
        return {
          ...record,
          amount: record.amount - movedAmount,
          count: record.count - movedCount,
        };
      });
      result.push(...shifted);
    });
    return result;
  }

  function analysisSourceRecords() {
    if (state.analysisBasis !== "operational") return state.records;
    return applyReturnAdjustments(state.records, state.adjustments);
  }

  function filterRecordSet(records) {
    const reasonSearch = normalizeKey(state.reasonSearch);
    return records.filter(record => {
      if (state.origin !== "all" && record.origin !== state.origin) return false;
      if (reasonSearch && !normalizeKey(record.reason).includes(reasonSearch)) return false;
      return true;
    });
  }

  function filteredRecords(records = null) {
    return filterRecordSet(records || analysisSourceRecords());
  }

  function rawFilteredRecords() {
    return filterRecordSet(state.records);
  }

  function summarizeRecords(records) {
    return records.reduce((acc, record) => {
      acc.total += record.amount;
      acc.count += record.count;
      acc.origins[record.origin] = (acc.origins[record.origin] || 0) + record.amount;
      const reason = acc.reasons.get(record.reason) || { reason: record.reason, amount: 0, count: 0 };
      reason.amount += record.amount;
      reason.count += record.count;
      acc.reasons.set(record.reason, reason);
      return acc;
    }, { total: 0, count: 0, origins: {}, reasons: new Map() });
  }

  function getAvailablePeriodKeys(type) {
    const keys = new Set();
    filteredRecords().forEach(record => { const key = periodKeyForRecord(record, type); if (key) keys.add(key); });
    return Array.from(keys).sort((a, b) => periodSortValue(type, a) - periodSortValue(type, b));
  }

  function getLatestStoredWeekKey() {
    return Array.from(new Set(state.records.map(record => record.weekKey).filter(Boolean)))
      .sort((a, b) => periodSortValue("week", a) - periodSortValue("week", b)).at(-1) || "";
  }

  function getPreviousKey(type, key) {
    const keys = getAvailablePeriodKeys(type);
    const expectedPrevious = previousPeriodKey(type, key);
    return expectedPrevious && keys.includes(expectedPrevious) ? expectedPrevious : "";
  }

  function normalizeAdjustment(value) {
    if (!value || typeof value !== "object") return null;
    const currentKey = String(value.currentKey || "");
    const targetKey = String(value.targetKey || "");
    const amount = Number(value.amount);
    if (!/^\d{4}-W\d{2}$/.test(currentKey) || !/^\d{4}-W\d{2}$/.test(targetKey)) return null;
    if (previousPeriodKey("week", currentKey) !== targetKey || !(amount > 0)) return null;
    return {
      currentKey,
      targetKey,
      origin: "Retouren",
      amount: Math.round(amount * 100) / 100,
      method: value.method === "exact" ? "exact" : "estimate",
      createdAt: String(value.createdAt || ""),
    };
  }

  function loadAdjustments() {
    if (!HAS_STORAGE) return [];
    try {
      const values = JSON.parse(localStorage.getItem(ADJUSTMENT_KEY) || "[]");
      return Array.isArray(values) ? values.map(normalizeAdjustment).filter(Boolean) : [];
    } catch { return []; }
  }

  function saveAdjustments(adjustments) {
    if (!HAS_STORAGE) return;
    localStorage.setItem(ADJUSTMENT_KEY, JSON.stringify(adjustments));
    localStorage.setItem(ACTIVE_KEY, String(Date.now()));
  }

  function recordsForPeriod(type, key) {
    return filteredRecords().filter(record => periodKeyForRecord(record, type) === key);
  }

  function rawRecordsForPeriod(type, key) {
    return rawFilteredRecords().filter(record => periodKeyForRecord(record, type) === key);
  }

  function originAmountForWeek(weekKey, origin, records = state.records) {
    return records
      .filter(record => record.weekKey === weekKey && record.origin === origin)
      .reduce((sum, record) => sum + record.amount, 0);
  }

  function getAdjustmentImpact(type, key) {
    let inbound = 0, outbound = 0;
    const matches = [];
    validAdjustmentsForRecords(state.records, state.adjustments).forEach(adjustment => {
      const currentPeriods = periodKeysFromWeekKey(adjustment.currentKey);
      const targetPeriods = periodKeysFromWeekKey(adjustment.targetKey);
      if (!currentPeriods || !targetPeriods) return;
      const currentPeriod = periodKeyForRecord(currentPeriods, type);
      const targetPeriod = periodKeyForRecord(targetPeriods, type);
      let matched = false;
      if (currentPeriod === key) { outbound += adjustment.amount; matched = true; }
      if (targetPeriod === key) { inbound += adjustment.amount; matched = true; }
      if (matched) matches.push(adjustment);
    });
    const operationalNet = inbound - outbound;
    return {
      net: state.analysisBasis === "operational" ? operationalNet : 0,
      operationalNet,
      inbound,
      outbound,
      adjustments: matches,
    };
  }

  function getAdjustmentPeriodKeys(type) {
    const keys = new Set();
    validAdjustmentsForRecords(state.records, state.adjustments).forEach(adjustment => {
      const current = periodKeysFromWeekKey(adjustment.currentKey);
      const target = periodKeysFromWeekKey(adjustment.targetKey);
      if (current) keys.add(periodKeyForRecord(current, type));
      if (target) keys.add(periodKeyForRecord(target, type));
    });
    return keys;
  }

  // Per reden: het werkelijk gerapporteerde bedrag plus een eventueel afwijkende
  // beoordelingsbasis. Bij een inhaalweek is dat basisbedrag het gemiddelde over
  // de gemiste en ingehaalde week; de gebruiker blijft wel zien wat echt is betaald.
  function getReasonComparison(currentSummary, previousSummary, displayCurrentSummary = currentSummary) {
    const reasons = new Set([
      ...currentSummary.reasons.keys(),
      ...previousSummary.reasons.keys(),
      ...displayCurrentSummary.reasons.keys(),
    ]);
    return Array.from(reasons).map(reason => {
      const current = currentSummary.reasons.get(reason) || { amount: 0, count: 0 };
      const previous = previousSummary.reasons.get(reason) || { amount: 0, count: 0 };
      const display = displayCurrentSummary.reasons.get(reason) || { amount: 0, count: 0 };
      const currentShare = currentSummary.total ? (current.amount / currentSummary.total) * 100 : 0;
      const displayCurrentShare = displayCurrentSummary.total ? (display.amount / displayCurrentSummary.total) * 100 : 0;
      const previousShare = previousSummary.total ? (previous.amount / previousSummary.total) * 100 : 0;
      const amountDelta = current.amount - previous.amount;
      const amountDeltaPct = previous.amount ? (amountDelta / previous.amount) * 100 : (current.amount ? 100 : 0);
      return {
        reason, groupKey: reasonGroupKey(reason),
        currentAmount: display.amount, currentCount: display.count, currentShare: displayCurrentShare,
        comparisonCurrentAmount: current.amount, comparisonCurrentCount: current.count, comparisonCurrentShare: currentShare,
        previousAmount: previous.amount, previousCount: previous.count, previousShare,
        shareDelta: currentShare - previousShare,
        amountDelta, amountDeltaPct,
        isFocus: FOCUS_REASONS.some(focus => normalizeKey(focus) === normalizeKey(reason)),
      };
    });
  }

  function groupSummary(summary, total) {
    const map = new Map(REASON_GROUPS.map(group => [group.key, { amount: 0, count: 0 }]));
    summary.reasons.forEach((value, reason) => {
      const bucket = map.get(reasonGroupKey(reason)) || map.get("overig");
      bucket.amount += value.amount;
      bucket.count += value.count;
    });
    const grandTotal = total || summary.total || 0;
    return REASON_GROUPS.map(group => {
      const bucket = map.get(group.key);
      return { ...group, amount: bucket.amount, count: bucket.count, share: grandTotal ? (bucket.amount / grandTotal) * 100 : 0 };
    });
  }

  function buildGroupComparison(current, previous, displayCurrent = current) {
    const currentGroups = groupSummary(current, current.total);
    const previousGroups = groupSummary(previous, previous.total);
    const displayGroups = groupSummary(displayCurrent, displayCurrent.total);
    const previousByKey = new Map(previousGroups.map(group => [group.key, group]));
    const displayByKey = new Map(displayGroups.map(group => [group.key, group]));
    return currentGroups.map(group => {
      const prev = previousByKey.get(group.key) || { amount: 0, count: 0, share: 0 };
      const display = displayByKey.get(group.key) || { amount: 0, count: 0, share: 0 };
      const amountDelta = group.amount - prev.amount;
      return {
        ...group,
        amount: display.amount, count: display.count, share: display.share,
        comparisonAmount: group.amount, comparisonCount: group.count, comparisonShare: group.share,
        previousAmount: prev.amount, previousCount: prev.count, previousShare: prev.share, amountDelta,
        amountDeltaPct: prev.amount ? (amountDelta / prev.amount) * 100 : (group.amount ? 100 : 0),
        shareDelta: group.share - prev.share,
      };
    });
  }

  function averageSummaries(summaries) {
    const usable = summaries.filter(Boolean);
    const divisor = usable.length || 1;
    const reasons = new Map();
    usable.forEach(summary => {
      summary.reasons.forEach((value, reason) => {
        const row = reasons.get(reason) || { reason, amount: 0, count: 0 };
        row.amount += value.amount / divisor;
        row.count += value.count / divisor;
        reasons.set(reason, row);
      });
    });
    return {
      total: usable.reduce((sum, summary) => sum + summary.total, 0) / divisor,
      count: usable.reduce((sum, summary) => sum + summary.count, 0) / divisor,
      reasons,
    };
  }

  // Basistotalen per periode. Procesgrenzen worden afzonderlijk met I-MR bepaald.
  function getPeriodStats(type) {
    const keys = getAvailablePeriodKeys(type);
    const summaries = keys.map(key => summarizeRecords(recordsForPeriod(type, key)));
    const totals = summaries.map(summary => summary.total);
    const counts = summaries.map(summary => summary.count);
    const count = totals.length;
    const avg = count ? totals.reduce((sum, value) => sum + value, 0) / count : 0;
    return { keys, totals, counts, count, avg };
  }

  function median(values) {
    const clean = values.filter(value => Number.isFinite(value)).slice().sort((a, b) => a - b);
    if (!clean.length) return 0;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  }

  // I-MR-procesgrenzen voor een tijdreeks met een waarneming per periode.
  // De spreiding komt uit de moving range van direct opeenvolgende, bruikbare
  // perioden. Een gat of administratieve correctie vormt dus nooit kunstmatig
  // een grote range. Formele signalering start pas bij 20 meetpunten.
  function buildIndividualsControl(values, excludedFlags = []) {
    const eligible = values.map((value, index) => Number.isFinite(value) && !excludedFlags[index]);
    const clean = values.filter((value, index) => eligible[index]);
    const center = clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : 0;
    const movingRanges = [];
    for (let index = 1; index < values.length; index += 1) {
      if (eligible[index] && eligible[index - 1]) movingRanges.push(Math.abs(values[index] - values[index - 1]));
    }
    const mrAverage = movingRanges.length
      ? movingRanges.reduce((sum, value) => sum + value, 0) / movingRanges.length
      : 0;
    const sigma = mrAverage / 1.128;
    const available = clean.length >= 20 && movingRanges.length >= 10;
    const ucl = available ? center + (3 * sigma) : null;
    const lcl = available ? Math.max(0, center - (3 * sigma)) : null;
    const pointSignals = values.map((value, index) => Boolean(
      available && eligible[index] && sigma > 0 && (value > ucl || value < lcl)
    ));

    const rules = [];
    if (available) {
      let side = 0, sideRun = 0;
      for (let index = 0; index < values.length; index += 1) {
        if (!eligible[index]) {
          side = 0;
          sideRun = 0;
          continue;
        }
        const nextSide = values[index] > center ? 1 : values[index] < center ? -1 : 0;
        sideRun = nextSide && nextSide === side ? sideRun + 1 : nextSide ? 1 : 0;
        side = nextSide;
        if (sideRun === 8) {
          rules.push({
            type: "shift",
            index,
            direction: side > 0 ? "up" : "down",
            label: side > 0 ? "8 perioden boven de proceslijn" : "8 perioden onder de proceslijn",
          });
        }
      }

      for (let index = 5; index < values.length; index += 1) {
        const window = values.slice(index - 5, index + 1);
        if (!eligible.slice(index - 5, index + 1).every(Boolean)) continue;
        const rising = window.every((value, j) => j === 0 || value > window[j - 1]);
        const falling = window.every((value, j) => j === 0 || value < window[j - 1]);
        if (rising || falling) {
          rules.push({
            type: "trend",
            index,
            direction: rising ? "up" : "down",
            label: rising ? "6 perioden achter elkaar stijgend" : "6 perioden achter elkaar dalend",
          });
        }
      }
    }

    return {
      available,
      provisional: available && clean.length < 25,
      n: clean.length,
      required: 20,
      center,
      mrAverage,
      sigma,
      ucl,
      lcl,
      pointSignals,
      signalCount: pointSignals.filter(Boolean).length,
      rules,
      latestRule: rules.at(-1) || null,
    };
  }

  function findAdministrativeCatchUps(keys, totals) {
    const pairs = [];
    for (let index = 1; index < keys.length; index += 1) {
      if (nextPeriodKey("week", keys[index - 1]) !== keys[index]) continue;
      const previousTotal = totals[index - 1];
      const currentTotal = totals[index];
      if (!(currentTotal > 0)) continue;
      const baselineValues = totals
        .filter((_, i) => i !== index && i !== index - 1)
        .filter(value => value > 0);
      if (baselineValues.length < 3) continue;
      const baseline = median(baselineValues);
      if (!baseline) continue;
      const normalizedWeekly = (previousTotal + currentTotal) / 2;
      const previousLow = previousTotal <= baseline * 0.35;
      const currentHigh = currentTotal >= baseline * 1.45;
      const plausible = normalizedWeekly >= baseline * 0.65 && normalizedWeekly <= baseline * 1.55;
      if (previousLow && currentHigh && plausible) {
        pairs.push({
          previousKey: keys[index - 1],
          currentKey: keys[index],
          previousTotal,
          currentTotal,
          normalizedWeekly,
          baseline,
        });
      }
    }
    return pairs;
  }

  // Administratieve inhaalweek: als een week bijna niets bevat en de week erna
  // juist veel, beoordelen we de piek met een 2-weeksgemiddelde zonder ruwe data
  // te verplaatsen. Dat past bij retouren die door vakantie pas later betaald zijn.
  function detectCatchUpWeek(ctx) {
    if (ctx.type !== "week" || !ctx.previousKey || !ctx.key) return null;
    if (nextPeriodKey("week", ctx.previousKey) !== ctx.key) return null;
    const keys = ctx.periodStats.keys;
    const index = keys.indexOf(ctx.key);
    if (index <= 0) return null;

    const previousTotal = ctx.previous.total;
    const currentTotal = ctx.current.total;
    if (currentTotal <= 0) return null;

    const baselineValues = ctx.periodStats.totals
      .filter((_, i) => i !== index && i !== index - 1)
      .filter(value => value > 0);
    if (baselineValues.length < 3) return null;

    const baseline = median(baselineValues);
    if (!baseline) return null;

    const previousLow = previousTotal <= baseline * 0.35;
    const currentHigh = currentTotal >= baseline * 1.45;
    const combinedTotal = previousTotal + currentTotal;
    const normalizedWeekly = combinedTotal / 2;
    const plausibleTwoWeeks = normalizedWeekly >= baseline * 0.65 && normalizedWeekly <= baseline * 1.55;
    if (!previousLow || !currentHigh || !plausibleTwoWeeks) return null;

    return {
      previousKey: ctx.previousKey,
      currentKey: ctx.key,
      previousTotal,
      currentTotal,
      combinedTotal,
      normalizedWeekly,
      baseline,
      normalizedVsBaselinePct: baseline ? ((normalizedWeekly - baseline) / baseline) * 100 : 0,
      currentVsBaselinePct: baseline ? ((currentTotal - baseline) / baseline) * 100 : 0,
    };
  }

  function focusStats(ctx) {
    return FOCUS_REASONS.map(name => {
      const row = ctx.comparison.find(item => normalizeKey(item.reason) === normalizeKey(name));
      return row || {
        reason: name, groupKey: reasonGroupKey(name), currentAmount: 0, currentCount: 0, currentShare: 0,
        previousAmount: 0, previousCount: 0, previousShare: 0, shareDelta: 0, amountDelta: 0, amountDeltaPct: 0, isFocus: true,
      };
    });
  }

  function buildSignals(ctx) {
    const signals = [];
    if (ctx.adjustmentImpact.adjustments.length) {
      const amount = Math.max(...ctx.adjustmentImpact.adjustments.map(adjustment => adjustment.amount));
      signals.push({
        tone: "warn",
        title: ctx.isOperational ? "Retourenbatch operationeel toegerekend" : "Retourenbatch-correctie beschikbaar",
        detail: ctx.isOperational
          ? `${formatMoney(amount)} aan vertraagde Retouren is naar de oorspronkelijke betaalweek toegerekend. Werkelijke betaalcijfers blijven ongewijzigd en zijn via Rapportagebasis te bekijken.`
          : `${formatMoney(amount)} is als operationele Retouren-correctie vastgelegd; deze weergave toont nu de werkelijke betaaldatum.`,
      });
    } else if (ctx.returnBatchCandidate) {
      signals.push({
        tone: "warn",
        title: "Mogelijke dubbele Retourenbatch",
        detail: `${labelPeriod("week", ctx.returnBatchCandidate.targetKey)} bevatte weinig Retouren en ${labelPeriod("week", ctx.returnBatchCandidate.currentKey)} juist veel. Bevestig de toerekening onder Controle > Bijzondere betaalweek.`,
      });
    }
    if (ctx.catchUp) {
      signals.push({
        tone: "warn",
        title: "Inhaalweek door gemiste betaalronde",
        detail: `${labelPeriod("week", ctx.catchUp.previousKey)} was ongewoon laag en ${labelPeriod("week", ctx.catchUp.currentKey)} bevat waarschijnlijk twee weken retouren. Interpretatie: ${formatMoney(ctx.catchUp.combinedTotal)} over twee weken = ${formatMoney(ctx.catchUp.normalizedWeekly)} per week${ctx.catchUp.referenceKey ? `, vergeleken met ${labelPeriod("week", ctx.catchUp.referenceKey)}` : ""}. Ruwe cijfers blijven ongewijzigd.`,
      });
    }
    if (!ctx.catchUp) {
      const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP);
      if (preventable) {
        const risingShare = preventable.shareDelta >= 3;
        const risingAmount = preventable.amountDelta > 0 && preventable.previousAmount > 0 && preventable.amountDeltaPct >= 20;
        if (preventable.amount > 0 && (risingShare || risingAmount)) {
          signals.push({
            tone: "bad", title: "Voorkombare fouten stijgen",
            detail: `Onze eigen fouten kostten ${formatMoney(preventable.amount)} (${formatPercent(preventable.share, 0)} van het totaal), ${formatSignedPercent(preventable.amountDeltaPct, 0)} t.o.v. ${PERIOD_TYPES[ctx.type].previousLabel}.`,
          });
        }
      }
      // Focusredenen die in aandeel stijgen.
      ctx.focus.forEach(row => {
        if (row.currentAmount > 0 && row.shareDelta >= 2) {
          signals.push({
            tone: "warn", title: `${row.reason} stijgt in aandeel`,
            detail: `Nu ${formatPercent(row.currentShare, 1)} van het totaal (${formatSignedPercent(row.shareDelta, 1)}-punt t.o.v. ${PERIOD_TYPES[ctx.type].previousLabel}), goed voor ${formatMoney(row.currentAmount)}.`,
          });
        }
      });
    }
    // Nieuwe redenen die er vorige periode nog niet waren en geld kosten. Bij een
    // inhaalweek slaan we dit over: een lege vorige week maakt bestaande redenen
    // anders onterecht "nieuw".
    if (!ctx.catchUp) {
      ctx.comparison
        .filter(row => row.previousAmount === 0 && row.currentAmount > 0)
        .sort((a, b) => b.currentAmount - a.currentAmount)
        .slice(0, 2)
        .forEach(row => {
          signals.push({
            tone: "warn", title: `Nieuwe reden: ${row.reason}`,
            detail: `Deze ${PERIOD_TYPES[ctx.type].label.toLowerCase()} nieuw, goed voor ${formatMoney(row.currentAmount)} (${formatNumber(row.currentCount)} credits).`,
          });
        });
    }
    if (ctx.headline.isOutlier && !ctx.catchUp) {
      const high = ctx.current.total > ctx.processControl.center;
      signals.push({
        tone: high ? "bad" : "good",
        title: high ? "Boven de procesgrens" : "Onder de procesgrens",
        detail: `Het totaal ligt buiten de I-MR-procesgrenzen (${formatMoney(ctx.processControl.lcl)} tot ${formatMoney(ctx.processControl.ucl)}). Onderzoek of er een bijzondere oorzaak is.`,
      });
    }
    return signals.slice(0, 5);
  }

  // Eén heldere kop: totaal + verschil t.o.v. vorige periode (Wout's kernvraag).
  function buildHeadline(ctx) {
    const totalDelta = ctx.current.total - ctx.previous.total;
    const totalDeltaPct = ctx.previous.total ? (totalDelta / ctx.previous.total) * 100 : 0;
    const hasPrevious = Boolean(ctx.previousKey);
    const decisionCurrent = ctx.analysisCurrent || ctx.current;
    const decisionPrevious = ctx.comparisonPrevious || ctx.previous;
    const decisionDelta = decisionCurrent.total - decisionPrevious.total;
    const decisionDeltaPct = decisionPrevious.total ? (decisionDelta / decisionPrevious.total) * 100 : 0;
    const decisionCountDelta = decisionCurrent.count - decisionPrevious.count;
    const decisionHasPrevious = Boolean(ctx.comparisonPreviousKey);
    const process = ctx.processControl || { available: false, n: 0, pointSignals: [] };
    const avg = process.n ? process.center : ctx.periodStats.avg;
    const vsAvgPct = avg ? ((ctx.current.total - avg) / avg) * 100 : 0;
    const enoughHistory = process.available;
    const currentIndex = (ctx.processControlKeys || ctx.periodStats.keys).indexOf(ctx.key);
    const isOutlier = !ctx.catchUp && currentIndex >= 0 && Boolean(process.pointSignals[currentIndex]);
    const periodWord = PERIOD_TYPES[ctx.type].label.toLowerCase();
    let tone = "flat";
    let title = `Vergelijkbaar met ${PERIOD_TYPES[ctx.type].previousLabel}`;
    if (!hasPrevious) {
      tone = "flat"; title = "Eerste periode in beeld";
    } else if (totalDeltaPct >= 8) {
      tone = "up"; title = `Hoger dan ${PERIOD_TYPES[ctx.type].previousLabel}`;
    } else if (totalDeltaPct <= -8) {
      tone = "down"; title = `Lager dan ${PERIOD_TYPES[ctx.type].previousLabel} — goed`;
    }
    if (ctx.catchUp) {
      tone = "flat";
      title = "Inhaalweek: twee weken samen bekijken";
    }
    return {
      totalDelta, totalDeltaPct, hasPrevious, vsAvgPct, enoughHistory, isOutlier, tone, title, periodWord,
      decisionDelta, decisionDeltaPct, decisionCountDelta, decisionHasPrevious,
    };
  }

  // Eén gewone-mensen-zin die de kern samenvat, voor wie geen analist is.
  function buildPlainConclusion(ctx) {
    const h = ctx.headline;
    const periodWord = PERIOD_TYPES[ctx.type].label.toLowerCase();
    const prevWord = PERIOD_TYPES[ctx.type].previousLabel;
    const top = ctx.comparison.filter(row => row.currentAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount)[0];
    const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP) || { share: 0 };
    if (ctx.isOperational && ctx.adjustmentImpact.adjustments.length && Math.abs(ctx.adjustmentImpact.operationalNet) >= 0.01) {
      const direction = ctx.adjustmentImpact.operationalNet > 0 ? "toegevoegd aan" : "doorgeschoven uit";
      return `Deze ${periodWord} is operationeel ${formatMoney(ctx.current.total)} toegerekend; werkelijk betaald was ${formatMoney(ctx.actualCurrent.total)}. Er is ${formatMoney(Math.abs(ctx.adjustmentImpact.operationalNet))} aan vertraagde Retouren ${direction} deze periode. De tweewekenaansluiting blijft volledig gelijk.`;
    }
    if (ctx.catchUp) {
      const referenceText = ctx.catchUp.referenceKey
        ? `${formatSignedPercent(ctx.catchUp.normalizedVsReferencePct, 0)} t.o.v. ${labelPeriod("week", ctx.catchUp.referenceKey)}`
        : `${formatSignedPercent(ctx.catchUp.normalizedVsBaselinePct, 0)} t.o.v. normaal`;
      return `Deze week is administratief vertekend: ${labelPeriod("week", ctx.catchUp.previousKey)} was laag en ${labelPeriod("week", ctx.catchUp.currentKey)} bevat vermoedelijk twee betaalweken. Ruw teruggestort: ${formatMoney(ctx.current.total)}. Gecorrigeerd 2-weeksgemiddelde: ${formatMoney(ctx.catchUp.normalizedWeekly)} per week (${referenceText}).`;
    }
    let dir;
    if (!h.hasPrevious) dir = "er is nog geen vorige periode om mee te vergelijken";
    else if (h.totalDeltaPct >= 1) dir = `dat is ${formatPercent(Math.abs(h.totalDeltaPct), 0)} méér dan ${prevWord}`;
    else if (h.totalDeltaPct <= -1) dir = `dat is ${formatPercent(Math.abs(h.totalDeltaPct), 0)} minder dan ${prevWord}`;
    else dir = `dat is ongeveer gelijk aan ${prevWord}`;
    const topText = top ? ` De grootste post is ${top.reason} (${formatPercent(top.currentShare, 0)} van het totaal).` : "";
    return `Deze ${periodWord} is ${formatMoney(ctx.current.total)} teruggestort — ${dir}.${topText} Voorkombare fouten (die we zelf kunnen voorkomen) zijn ${formatPercent(preventable.share, 0)} van het totaal.`;
  }

  function getDashboardContext() {
    const type = state.periodType;
    const keys = getAvailablePeriodKeys(type);
    const latestKey = keys.at(-1) || "";
    const key = state.selectedKey && keys.includes(state.selectedKey) ? state.selectedKey : latestKey;
    state.selectedKey = key;
    const previousKey = getPreviousKey(type, key);
    const current = summarizeRecords(recordsForPeriod(type, key));
    const previous = summarizeRecords(previousKey ? recordsForPeriod(type, previousKey) : []);
    const actualCurrent = summarizeRecords(rawRecordsForPeriod(type, key));
    const actualPrevious = summarizeRecords(previousKey ? rawRecordsForPeriod(type, previousKey) : []);
    const ctx = {
      type, key, latestKey, isLatest: key === latestKey, previousKey,
      current, previous, actualCurrent, actualPrevious,
      periodStats: getPeriodStats(type),
    };
    ctx.adjustmentImpact = getAdjustmentImpact(type, key);
    if (state.analysisBasis === "operational" && ctx.adjustmentImpact.adjustments.length) {
      const filteredNet = current.total - actualCurrent.total;
      ctx.adjustmentImpact.operationalNet = filteredNet;
      ctx.adjustmentImpact.net = filteredNet;
      ctx.adjustmentImpact.inbound = Math.max(0, filteredNet);
      ctx.adjustmentImpact.outbound = Math.max(0, -filteredNet);
    }
    ctx.hasAdjustments = validAdjustmentsForRecords(state.records, state.adjustments).length > 0;
    ctx.isOperational = state.analysisBasis === "operational" && ctx.hasAdjustments;
    ctx.returnBatchCandidate = type === "week" && !ctx.adjustmentImpact.adjustments.length
      ? detectReturnBatchCandidate(key)
      : null;
    ctx.administrativeCatchUps = type === "week"
      ? findAdministrativeCatchUps(ctx.periodStats.keys, ctx.periodStats.totals)
      : [];
    ctx.catchUp = ctx.adjustmentImpact.adjustments.length || ctx.returnBatchCandidate
      ? null
      : detectCatchUpWeek(ctx);
    ctx.analysisCurrent = current;
    ctx.comparisonPrevious = previous;
    ctx.comparisonPreviousKey = previousKey;
    if (ctx.catchUp) {
      const expectedReference = previousPeriodKey("week", ctx.catchUp.previousKey);
      const referenceKey = ctx.periodStats.keys.includes(expectedReference) ? expectedReference : "";
      const reference = summarizeRecords(referenceKey ? recordsForPeriod(type, referenceKey) : []);
      ctx.analysisCurrent = averageSummaries([previous, current]);
      if (referenceKey && reference.total > 0) {
        ctx.comparisonPrevious = reference;
        ctx.comparisonPreviousKey = referenceKey;
        ctx.catchUp.referenceKey = referenceKey;
        ctx.catchUp.referenceTotal = reference.total;
        ctx.catchUp.normalizedVsReferencePct = ((ctx.analysisCurrent.total - reference.total) / reference.total) * 100;
      } else {
        ctx.comparisonPrevious = { total: 0, count: 0, reasons: new Map() };
        ctx.comparisonPreviousKey = "";
      }
    }
    const administrativeKeys = new Set(ctx.administrativeCatchUps.flatMap(pair => [pair.previousKey, pair.currentKey]));
    getAdjustmentPeriodKeys(type).forEach(periodKey => administrativeKeys.add(periodKey));
    const totalByKey = new Map(ctx.periodStats.keys.map((periodKey, index) => [periodKey, ctx.periodStats.totals[index]]));
    ctx.processControlKeys = completePeriodKeys(type, ctx.periodStats.keys);
    const processValues = ctx.processControlKeys.map(periodKey => totalByKey.has(periodKey) ? totalByKey.get(periodKey) : null);
    const processExcluded = ctx.processControlKeys.map(periodKey => administrativeKeys.has(periodKey));
    ctx.processControl = buildIndividualsControl(processValues, processExcluded);
    ctx.comparison = getReasonComparison(ctx.analysisCurrent, ctx.comparisonPrevious, current);
    ctx.groupComparison = buildGroupComparison(ctx.analysisCurrent, ctx.comparisonPrevious, current);
    ctx.headline = buildHeadline(ctx);
    ctx.focus = focusStats(ctx);
    ctx.signals = buildSignals(ctx);
    return ctx;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  function renderContextStrip() {
    if (!els.contextStrip) return;
    if (!state.records.length) { els.contextStrip.hidden = true; els.contextStrip.innerHTML = ""; return; }
    const latestWeek = getLatestStoredWeekKey();
    const weekCount = new Set(state.records.map(record => record.weekKey).filter(Boolean)).size;
    const items = [
      { value: latestWeek ? labelPeriod("week", latestWeek) : "-", label: "Nieuwste week" },
      { value: formatNumber(weekCount), label: weekCount === 1 ? "week in historie" : "weken in historie" },
      { value: state.meta ? state.meta.filename : "Historie", label: "Laatste import" },
    ];
    els.contextStrip.hidden = false;
    els.contextStrip.innerHTML = items.map(item => `
      <div class="context-item"><strong>${escapeHtml(item.value)}</strong><span>${escapeHtml(item.label)}</span></div>
    `).join("");
  }

  // Duidelijke, gewone-taal melding over wat er bij de import is opgeschoond of
  // overgeslagen — zodat pijnpunten (lege vakken, foute jaartallen) meteen opvallen.
  function renderImportBanner() {
    if (!els.importBanner) return;
    const q = state.quality;
    if (!q || state.importBannerDismissed) { els.importBanner.hidden = true; els.importBanner.innerHTML = ""; return; }
    const unknownCount = Array.from(q.unknownReasons ? q.unknownReasons.values() : [])
      .reduce((sum, item) => sum + (typeof item === "number" ? item : item.count), 0);
    const fixes = [];
    if (q.recoveredNeighborDateRows) fixes.push(`${formatNumber(q.recoveredNeighborDateRows)}× lege datum overgenomen van de regel erboven/eronder`);
    if (q.recoveredNeighborWeekYearRows) fixes.push(`${formatNumber(q.recoveredNeighborWeekYearRows)}× week/jaar overgenomen van een buurregel`);
    if (q.recoveredWeekYearRows) fixes.push(`${formatNumber(q.recoveredWeekYearRows)}× datum afgeleid uit weeknummer + jaar`);
    if (q.correctedYearRows) fixes.push(`${formatNumber(q.correctedYearRows)}× fout jaartal gecorrigeerd`);
    if (q.recoveredOriginRows) fixes.push(`${formatNumber(q.recoveredOriginRows)}× ontbrekende herkomst aangevuld`);
    if (q.normalizedReasonRows) fixes.push(`${formatNumber(q.normalizedReasonRows)}× reden opgeschoond`);
    if (q.fallbackReasonRows) fixes.push(`${formatNumber(q.fallbackReasonRows)}× lege reden op "Overige" gezet`);
    if (unknownCount) fixes.push(`${formatNumber(unknownCount)}× onbekende reden (zie controle)`);
    const example = (q.warningSamples || []).find(s => /Jaar .* gecorrigeerd/.test(s.issue))
      || (q.warningSamples || []).find(s => /Datum overgenomen/.test(s.issue))
      || (q.warningSamples || []).find(s => /afgeleid uit weeknummer/.test(s.issue));
    const skipped = q.skippedRows || 0;

    let tone, icon, headline;
    if (skipped) {
      tone = "warn"; icon = "!";
      headline = `Let op: ${formatNumber(skipped)} ${skipped === 1 ? "regel is" : "regels zijn"} overgeslagen (geen geldig bedrag of geen datum/week). ${formatNumber(q.parsedRows)} regels wél verwerkt.`;
    } else if (fixes.length) {
      tone = "ok"; icon = "✓";
      headline = `${formatNumber(q.parsedRows)} regels ingelezen — een paar dingen zijn automatisch opgeschoond.`;
    } else {
      tone = "good"; icon = "✓";
      headline = `${formatNumber(q.parsedRows)} regels netjes ingelezen. Niets hoefde te worden hersteld.`;
    }

    els.importBanner.hidden = false;
    els.importBanner.className = `import-banner tone-${tone}`;
    if (els.importBanner.setAttribute) els.importBanner.setAttribute("role", tone === "warn" ? "alert" : "status");
    els.importBanner.innerHTML = `
      <span class="ib-ic">${icon}</span>
      <div class="ib-body">
        <strong>${escapeHtml(headline)}</strong>
        ${fixes.length ? `<ul class="ib-list">${fixes.map(f => `<li>${escapeHtml(f)}</li>`).join("")}</ul>` : ""}
        ${example ? `<span class="ib-example">Voorbeeld: rij ${formatNumber(example.rowNumber)} — ${escapeHtml(example.issue)}.</span>` : ""}
        <span class="ib-hint">Volledige controlelijst staat in het tabblad “Import &amp; controle”.</span>
      </div>
      <button type="button" class="ib-close" data-dismiss-banner aria-label="Melding sluiten" title="Sluiten">×</button>`;
  }

  function renderControls() {
    const keys = getAvailablePeriodKeys(state.periodType);
    const latestKey = keys.at(-1) || "";
    if (!state.selectedKey || !keys.includes(state.selectedKey)) state.selectedKey = latestKey;
    els.periodSelect.innerHTML = keys.slice().reverse().map(key => `
      <option value="${escapeHtml(key)}" ${key === state.selectedKey ? "selected" : ""}>${escapeHtml(`${key === latestKey ? "Nieuwste · " : ""}${labelPeriod(state.periodType, key)}`)}</option>
    `).join("");
    document.querySelectorAll("[data-period-type]").forEach(button => {
      const active = button.dataset.periodType === state.periodType;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    els.originSelect.value = state.origin;
    if (document.activeElement !== els.reasonSearch) els.reasonSearch.value = state.reasonSearch;
  }

  function getAdjustmentSetup(currentKey) {
    const targetKey = previousPeriodKey("week", currentKey);
    const currentKS = originAmountForWeek(currentKey, "Klantenservice");
    const currentReturns = originAmountForWeek(currentKey, "Retouren");
    const previousKS = originAmountForWeek(targetKey, "Klantenservice");
    const previousReturns = originAmountForWeek(targetKey, "Retouren");
    const actualCurrent = state.records
      .filter(record => record.weekKey === currentKey)
      .reduce((sum, record) => sum + record.amount, 0);
    const actualPrevious = state.records
      .filter(record => record.weekKey === targetKey)
      .reduce((sum, record) => sum + record.amount, 0);
    const suggestedAmount = Math.round((Math.max(0, currentReturns - previousReturns) / 2) * 100) / 100;
    return {
      currentKey,
      targetKey,
      currentKS,
      currentReturns,
      previousKS,
      previousReturns,
      currentOther: actualCurrent - currentKS - currentReturns,
      previousOther: actualPrevious - previousKS - previousReturns,
      suggestedAmount,
      actualCurrent,
      actualPrevious,
    };
  }

  function renderBasisBar() {
    if (!els.basisBar) return;
    const valid = validAdjustmentsForRecords(state.records, state.adjustments);
    els.basisBar.hidden = !valid.length;
    if (!valid.length) return;
    const operational = state.analysisBasis === "operational";
    els.basisSummary.textContent = operational
      ? "Retouren staan in de operationele week; bronbetalingen blijven intact."
      : "Alle bedragen staan op de werkelijke betaaldatum.";
    els.basisBar.querySelectorAll("[data-analysis-basis]").forEach(button => {
      const active = button.dataset.analysisBasis === state.analysisBasis;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function adjustmentReconciliation(setup, amount) {
    const moved = Math.max(0, Math.min(setup.currentReturns, Number(amount) || 0));
    return {
      moved,
      operationalPrevious: setup.actualPrevious + moved,
      operationalCurrent: setup.actualCurrent - moved,
      combined: setup.actualPrevious + setup.actualCurrent,
    };
  }

  function renderAdjustmentPanel() {
    if (!els.adjustmentPanel) return;
    if (state.periodType !== "week") {
      els.adjustmentPanel.innerHTML = `<p class="adjustment-empty">Selecteer bovenaan een week om een Retourenbatch toe te rekenen.</p>`;
      return;
    }
    const selectedKey = state.selectedKey || getAvailablePeriodKeys("week").at(-1) || "";
    const related = state.adjustments.find(item => item.currentKey === selectedKey || item.targetKey === selectedKey);
    const currentKey = related ? related.currentKey : selectedKey;
    const setup = getAdjustmentSetup(currentKey);
    if (!setup.currentKey || !setup.targetKey || !(setup.currentReturns > 0)) {
      els.adjustmentPanel.innerHTML = `<p class="adjustment-empty">Voor ${escapeHtml(labelPeriod("week", currentKey))} staat geen Retourenbedrag klaar om te verdelen.</p>`;
      return;
    }
    const existing = state.adjustments.find(item => item.currentKey === currentKey);
    const method = existing && existing.method === "exact" ? "exact" : "estimate";
    const amount = existing ? existing.amount : setup.suggestedAmount;
    const recon = adjustmentReconciliation(setup, amount);
    const status = existing ? `
      <div class="adjustment-status">
        <strong>Correctie actief · ${escapeHtml(existing.method === "exact" ? "exact bedrag" : "50/50-schatting")}</strong>
        <span>${formatMoney(existing.amount)} Retouren is operationeel van ${escapeHtml(labelPeriod("week", existing.currentKey))} naar ${escapeHtml(labelPeriod("week", existing.targetKey))} toegerekend.</span>
      </div>` : "";
    els.adjustmentPanel.innerHTML = `
      <div class="adjustment-layout">
        ${status}
        <div class="adjustment-recon" aria-label="Aansluiting bijzondere betaalweek">
          <div class="recon-head">Aansluiting</div>
          <div class="recon-head recon-value">${escapeHtml(labelPeriod("week", setup.targetKey))}</div>
          <div class="recon-head recon-value">${escapeHtml(labelPeriod("week", setup.currentKey))}</div>
          <div class="recon-label">Klantenservice · werkelijk</div>
          <div class="recon-value">${formatMoney(setup.previousKS)}</div>
          <div class="recon-value">${formatMoney(setup.currentKS)}</div>
          <div class="recon-label">Retouren · werkelijk</div>
          <div class="recon-value">${formatMoney(setup.previousReturns)}</div>
          <div class="recon-value">${formatMoney(setup.currentReturns)}</div>
          <div class="recon-label">Overige herkomst · werkelijk</div>
          <div class="recon-value">${formatMoney(setup.previousOther)}</div>
          <div class="recon-value">${formatMoney(setup.currentOther)}</div>
          <div class="recon-label">Totaal · werkelijk betaald</div>
          <div class="recon-value">${formatMoney(setup.actualPrevious)}</div>
          <div class="recon-value">${formatMoney(setup.actualCurrent)}</div>
          <div class="recon-label">Totaal · operationeel</div>
          <div class="recon-value is-adjusted" data-recon-previous>${formatMoney(recon.operationalPrevious)}</div>
          <div class="recon-value is-adjusted" data-recon-current>${formatMoney(recon.operationalCurrent)}</div>
        </div>
        <form class="adjustment-form" data-adjustment-form data-current-key="${escapeHtml(setup.currentKey)}" data-target-key="${escapeHtml(setup.targetKey)}" data-suggested="${setup.suggestedAmount}">
          <label>
            <span>Verdeling Retourenbatch</span>
            <select name="method" data-adjustment-method>
              <option value="estimate" ${method === "estimate" ? "selected" : ""}>Schatting · Retouren gelijk over 2 weken</option>
              <option value="exact" ${method === "exact" ? "selected" : ""}>Exact bedrag bekend</option>
            </select>
          </label>
          <label>
            <span>Naar ${escapeHtml(labelPeriod("week", setup.targetKey))}</span>
            <input name="amount" data-adjustment-amount type="number" min="0.01" max="${setup.currentReturns.toFixed(2)}" step="0.01" value="${amount.toFixed(2)}" ${method === "estimate" ? "readonly" : ""}>
          </label>
          <div class="adjustment-actions">
            <button type="submit" class="btn btn-primary">${existing ? "Correctie bijwerken" : "Correctie activeren"}</button>
            ${existing ? `<button type="button" class="btn btn-ghost" data-remove-adjustment="${escapeHtml(existing.currentKey)}">Verwijderen</button>` : ""}
          </div>
        </form>
        <p class="adjustment-note"><strong>Controle:</strong> beide weken blijven samen ${formatMoney(recon.combined)}. Redenen en aantallen binnen Retouren worden naar verhouding verdeeld, omdat de import de oorspronkelijke week per losse credit niet bevat.</p>
      </div>`;
  }

  function updateAdjustmentPreview() {
    const form = els.adjustmentPanel && els.adjustmentPanel.querySelector("[data-adjustment-form]");
    if (!form) return;
    const setup = getAdjustmentSetup(form.dataset.currentKey);
    const amountInput = form.querySelector("[data-adjustment-amount]");
    const recon = adjustmentReconciliation(setup, amountInput.value);
    const previous = els.adjustmentPanel.querySelector("[data-recon-previous]");
    const current = els.adjustmentPanel.querySelector("[data-recon-current]");
    if (previous) previous.textContent = formatMoney(recon.operationalPrevious);
    if (current) current.textContent = formatMoney(recon.operationalCurrent);
  }

  function renderTabs() {
    document.querySelectorAll("[data-tab]").forEach(button => {
      const active = button.dataset.tab === state.activeTab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll("[data-tab-section]").forEach(section => {
      section.hidden = section.dataset.tabSection !== state.activeTab;
    });
  }

  // Compacte trendlijn in de hero: verloop van het totaal, huidige periode gemarkeerd.
  function buildHeroSparkline(ctx) {
    const keys = ctx.periodStats.keys.slice(-12);
    const values = ctx.periodStats.totals.slice(-12);
    if (values.length < 2) return "";
    const w = 300, h = 92, padX = 6, padTop = 16, padBottom = 12;
    const max = Math.max(...values), min = Math.min(...values);
    const range = max - min || 1;
    const step = (w - padX * 2) / (values.length - 1);
    const xFor = i => padX + i * step;
    const yFor = v => h - padBottom - ((v - min) / range) * (h - padTop - padBottom);
    const line = values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
    const area = `${xFor(0).toFixed(1)},${(h - padBottom).toFixed(1)} ${line} ${xFor(values.length - 1).toFixed(1)},${(h - padBottom).toFixed(1)}`;
    const idx = keys.indexOf(ctx.key) >= 0 ? keys.indexOf(ctx.key) : values.length - 1;
    const cx = xFor(idx), cy = yFor(values[idx]);
    const labelX = Math.min(Math.max(cx, 22), w - 22);
    return `
      <div class="hero-spark">
        <div class="hero-spark-head">Verloop · laatste ${values.length} ${escapeHtml(PERIOD_TYPES[ctx.type].plural)}</div>
        <svg viewBox="0 0 ${w} ${h}" class="spark" role="img" aria-label="Verloop van het totaal">
          <polygon points="${area}" class="spark-area"></polygon>
          <polyline points="${line}" class="spark-line" fill="none"></polyline>
          <line class="spark-guide" x1="${cx.toFixed(1)}" x2="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" y2="${(h - padBottom).toFixed(1)}"></line>
          <circle class="spark-dot" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.6"></circle>
          <text class="spark-label" x="${labelX.toFixed(1)}" y="${Math.max(11, cy - 7).toFixed(1)}" text-anchor="middle">${escapeHtml(formatMoney(values[idx]))}</text>
        </svg>
        <div class="hero-spark-foot"><span>laag ${escapeHtml(formatMoney(min))}</span><span>hoog ${escapeHtml(formatMoney(max))}</span></div>
      </div>`;
  }

  function renderHero(ctx) {
    const h = ctx.headline;
    const avgPerCredit = ctx.current.count ? ctx.current.total / ctx.current.count : 0;
    const countDelta = ctx.catchUp ? h.decisionCountDelta : ctx.current.count - ctx.previous.count;
    const comparisonLabel = ctx.comparisonPreviousKey ? labelPeriod(ctx.type, ctx.comparisonPreviousKey) : PERIOD_TYPES[ctx.type].previousLabel;
    const deltaLine = ctx.catchUp
      ? `Week-op-week is hier niet zinvol: ${escapeHtml(labelPeriod("week", ctx.catchUp.previousKey))} was een gemiste betaalronde (${formatMoney(ctx.catchUp.previousTotal)}).`
      : h.hasPrevious
        ? `<span class="delta-badge ${h.tone}">${trendArrow(h.totalDeltaPct)} ${formatSignedPercent(h.totalDeltaPct, 0)}</span> t.o.v. ${escapeHtml(PERIOD_TYPES[ctx.type].previousLabel)} (${formatMoney(ctx.previous.total)})`
        : `Nog geen vorige ${escapeHtml(h.periodWord)} om mee te vergelijken.`;
    const avgLine = h.enoughHistory
      ? (ctx.catchUp
        ? `Gecorrigeerd: ${formatMoney(ctx.catchUp.normalizedWeekly)} per week (${ctx.catchUp.referenceKey ? `${formatSignedPercent(ctx.catchUp.normalizedVsReferencePct, 0)} t.o.v. ${escapeHtml(comparisonLabel)}` : `${formatSignedPercent(ctx.catchUp.normalizedVsBaselinePct, 0)} t.o.v. normale weken`})`
        : `${trendArrow(h.vsAvgPct)} ${formatSignedPercent(h.vsAvgPct, 0)} t.o.v. gemiddeld (${formatMoney(ctx.processControl.n ? ctx.processControl.center : ctx.periodStats.avg)})`)
      : `Nog te weinig ${escapeHtml(PERIOD_TYPES[ctx.type].plural)} voor een gemiddelde.`;

    const prevLabel = PERIOD_TYPES[ctx.type].previousLabel;
    const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP) || { amount: 0, share: 0 };
    const topReason = ctx.comparison.filter(row => row.currentAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount)[0];
    const sparkline = buildHeroSparkline(ctx);
    const operationalNote = ctx.isOperational && ctx.adjustmentImpact.adjustments.length && Math.abs(ctx.adjustmentImpact.operationalNet) >= 0.01
      ? `
        <div class="catchup-note">
          <strong>Retouren-toerekening actief</strong>
          <span>Werkelijk betaald: ${formatMoney(ctx.actualCurrent.total)}. Operationele correctie: ${formatSignedMoney(ctx.adjustmentImpact.operationalNet)} in deze ${escapeHtml(ctx.type === "week" ? "week" : PERIOD_TYPES[ctx.type].label.toLowerCase())}. Bronbetalingen blijven ongewijzigd.</span>
        </div>`
      : "";

    els.hero.className = `hero tone-${h.tone}`;
    els.hero.innerHTML = `
      <div class="hero-lead">
        <div class="hero-eyebrow">${escapeHtml(PERIOD_TYPES[ctx.type].label)} · ${escapeHtml(labelPeriod(ctx.type, ctx.key))}${ctx.isLatest ? ` <span class="tag">Nieuwste</span>` : ""}</div>
        <div class="hero-amount">${formatMoney(ctx.current.total)}</div>
        <div class="hero-sub">${ctx.isOperational ? "operationeel toegerekend" : "totaal teruggestort"} · ${formatNumber(ctx.current.count)} creditaties</div>
        <div class="hero-verdict ${h.tone}">${trendArrow(h.hasPrevious ? h.totalDeltaPct : 0)} ${escapeHtml(h.title)}</div>
        <div class="hero-line">${deltaLine}</div>
        <div class="hero-line muted">${avgLine}</div>
        <p class="hero-plain">${escapeHtml(buildPlainConclusion(ctx))}</p>
        ${ctx.catchUp ? `
          <div class="catchup-note">
            <strong>Inhaalcorrectie actief</strong>
            <span>Ruw: ${escapeHtml(labelPeriod("week", ctx.catchUp.previousKey))} ${formatMoney(ctx.catchUp.previousTotal)} + ${escapeHtml(labelPeriod("week", ctx.catchUp.currentKey))} ${formatMoney(ctx.catchUp.currentTotal)}. Voor beoordeling gebruikt: ${formatMoney(ctx.catchUp.normalizedWeekly)} per week${ctx.catchUp.referenceKey ? ` tegenover ${escapeHtml(comparisonLabel)}` : ""}.</span>
          </div>
        ` : ""}
        ${operationalNote}
      </div>
      ${sparkline ? `<div class="hero-visual">${sparkline}</div>` : ""}
      <div class="hero-kpis">
        <div class="kpi"><span>Gemiddeld per credit</span><strong>${formatMoney(avgPerCredit)}</strong><em class="is-flat">terugbetaling</em></div>
        <div class="kpi"><span>Aantal credits</span><strong>${formatNumber(ctx.current.count)}</strong><em class="${costTrendClass(countDelta)}">${countDelta > 0 ? "+" : countDelta < 0 ? "−" : ""}${formatNumber(Math.abs(countDelta))} ${ctx.catchUp ? "gecorrigeerd " : ""}vs ${escapeHtml(ctx.catchUp ? comparisonLabel : prevLabel)}</em></div>
        <div class="kpi"><span>Voorkombaar (onze fout)</span><strong>${formatMoney(preventable.amount)}</strong><em class="${preventable.share >= 25 ? "is-up" : "is-flat"}">${formatPercent(preventable.share, 0)} van totaal</em></div>
        <div class="kpi"><span>Grootste reden</span><strong>${topReason ? formatMoney(topReason.currentAmount) : "—"}</strong><em class="is-flat">${topReason ? escapeHtml(topReason.reason) : "geen"}</em></div>
      </div>
    `;
  }

  function renderFocusRow(ctx) {
    if (!els.focusRow) return;
    const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP) || { amount: 0, share: 0, shareDelta: 0, previousShare: 0 };
    const cards = [
      ...ctx.focus.map(row => ({
        label: row.reason, amount: row.currentAmount, share: row.currentShare,
        previousShare: row.previousShare, shareDelta: row.shareDelta, accent: "focus",
      })),
      {
        label: "Voorkombaar (onze fout)", amount: preventable.amount, share: preventable.share,
        previousShare: preventable.previousShare, shareDelta: preventable.shareDelta, accent: "bad",
      },
    ];
    const prevLabel = ctx.catchUp && ctx.comparisonPreviousKey
      ? labelPeriod(ctx.type, ctx.comparisonPreviousKey)
      : PERIOD_TYPES[ctx.type].previousLabel;
    els.focusRow.innerHTML = cards.map(card => {
      const movement = card.amount <= 0
        ? `geen bedrag deze ${escapeHtml(PERIOD_TYPES[ctx.type].label.toLowerCase())}`
        : card.previousShare > 0
          ? `${escapeHtml(prevLabel)} ${formatPercent(card.previousShare, 1)} → nu ${formatPercent(card.share, 1)}`
          : ctx.catchUp
            ? "geen bedrag in de referentieweek"
            : `nieuw deze ${escapeHtml(PERIOD_TYPES[ctx.type].label.toLowerCase())}`;
      return `
      <div class="focus-card accent-${card.accent}">
        <span class="focus-label">${escapeHtml(card.label)}</span>
        <div class="focus-main">
          <strong class="focus-amount-big">${formatMoney(card.amount)}</strong>
          <span class="focus-share-sm">${formatPercent(card.share, 1)} van totaal</span>
        </div>
        <div class="focus-track"><div class="focus-fill" style="width:${Math.max(2, Math.min(100, card.share))}%"></div></div>
        <div class="focus-delta ${costTrendClass(card.shareDelta)}">
          <span>${trendArrow(card.shareDelta)} ${formatSignedPercent(card.shareDelta, 1)}-punt ${ctx.catchUp ? "gecorrigeerd " : ""}vs ${escapeHtml(prevLabel)}</span>
          <span class="focus-prev">${movement}</span>
        </div>
      </div>`;
    }).join("");
  }

  function renderSignals(ctx) {
    if (!els.signalBand) return;
    const icons = { bad: "!", warn: "!", good: "✓" };
    const signals = ctx.signals.length ? ctx.signals : [{ tone: "good", title: "Geen bijzonderheden", detail: "Geen stijgende voorkombare fouten of nieuwe redenen deze periode." }];
    els.signalBand.innerHTML = signals.map(signal => `
      <div class="signal tone-${signal.tone}">
        <span class="signal-ic">${icons[signal.tone] || "•"}</span>
        <div class="signal-text"><strong>${escapeHtml(signal.title)}</strong><span>${escapeHtml(signal.detail)}</span></div>
      </div>
    `).join("");
  }

  // De kern-vergelijktabel: per reden bedrag, aandeel-% nu vs vorige, en verschil.
  function renderCompareTable(ctx) {
    const comparisonKey = ctx.comparisonPreviousKey;
    const comparisonLabel = comparisonKey ? labelPeriod(ctx.type, comparisonKey) : "geen vergelijkbare periode";
    const comparisonShort = comparisonKey ? shortPeriodLabel(ctx.type, comparisonKey) : "referentie";
    const comparable = Boolean(comparisonKey);
    if (els.compareMeta) {
      const originText = state.origin === "all" ? "alle herkomsten" : state.origin.toLowerCase();
      els.compareMeta.textContent = `${labelPeriod(ctx.type, ctx.key)} vs ${comparisonLabel}${ctx.catchUp ? " · gecorrigeerd weekgemiddelde" : ""}${ctx.isOperational ? " · operationeel toegerekend" : ""} · ${originText} · ${formatMoney(ctx.current.total)}`;
    }
    const activeGroup = state.selectedGroupFilter && ctx.groupComparison.some(g => g.key === state.selectedGroupFilter) ? state.selectedGroupFilter : "";
    const activeGroupMeta = activeGroup ? ctx.groupComparison.find(g => g.key === activeGroup) : null;
    const baseRows = ctx.comparison
      .filter(row => row.currentAmount > 0 || row.previousAmount > 0)
      .filter(row => !activeGroup || row.groupKey === activeGroup);
    const sortValue = (row, key) => ({
      reason: normalizeKey(row.reason),
      amount: row.currentAmount,
      count: row.currentCount,
      share: row.currentShare,
      shareDelta: row.shareDelta,
      amountDelta: row.amountDelta,
    })[key];
    const sortKey = ["reason", "amount", "count", "share", "shareDelta", "amountDelta"].includes(state.compareSort)
      ? state.compareSort : "amount";
    const sortDir = state.compareSortDir === "asc" ? 1 : -1;
    const rows = baseRows.slice().sort((a, b) => {
      const av = sortValue(a, sortKey), bv = sortValue(b, sortKey);
      const primary = typeof av === "string" ? av.localeCompare(bv, "nl") : (av - bv);
      return primary ? primary * sortDir : b.currentAmount - a.currentAmount;
    });
    if (!rows.length) { els.compareTable.innerHTML = `<div class="empty-state">Geen redenen voor deze selectie.</div>`; return; }
    const maxShare = Math.max(...rows.map(row => row.currentShare), 1);
    const totalCountDelta = ctx.catchUp ? ctx.headline.decisionCountDelta : ctx.current.count - ctx.previous.count;
    const isNewReason = row => comparable && row.previousAmount === 0 && row.comparisonCurrentAmount > 0;
    const isGoneReason = row => comparable && row.comparisonCurrentAmount === 0 && row.previousAmount > 0;
    const topRows = baseRows.filter(row => row.currentAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount).slice(0, 3);
    const top3Amount = topRows.reduce((sum, row) => sum + row.currentAmount, 0);
    const top3Share = ctx.current.total ? (top3Amount / ctx.current.total) * 100 : 0;
    const preventableAmount = rows.filter(row => row.groupKey === PREVENTABLE_GROUP).reduce((sum, row) => sum + row.currentAmount, 0);
    const preventableShare = ctx.current.total ? (preventableAmount / ctx.current.total) * 100 : 0;
    const newCount = rows.filter(isNewReason).length;
    const foot = activeGroupMeta ? {
      label: `Subtotaal · ${activeGroupMeta.short}`, amount: activeGroupMeta.amount, count: activeGroupMeta.count,
      share: activeGroupMeta.share, prevShare: comparable ? activeGroupMeta.previousShare : null,
      hasPrev: comparable, shareDelta: activeGroupMeta.shareDelta, amountDelta: activeGroupMeta.amountDelta, shareDigits: 1,
    } : {
      label: "Eindtotaal", amount: ctx.current.total, count: ctx.current.count,
      share: 100, prevShare: comparable ? 100 : null,
      hasPrev: comparable, shareDelta: null, amountDelta: ctx.headline.decisionDelta, shareDigits: 0,
    };

    const bodyRows = rows.map((row, index) => {
      const fillClass = row.groupKey === PREVENTABLE_GROUP ? "bad" : "neutral";
      const shareBar = `<span class="cell-bar"><i class="${fillClass}" style="width:${Math.max(3, (row.currentShare / maxShare) * 100)}%"></i></span>`;
      const isNew = isNewReason(row);
      const gone = isGoneReason(row);
      const group = GROUP_BY_KEY.get(row.groupKey) || { short: "Overig" };
      const groupColor = GROUP_COLORS[row.groupKey] || "#3f6f92";
      const shareDelta = gone
        ? `<span class="pill pill-muted">weg</span>`
        : isNew
          ? `<span class="pill pill-new">nieuw</span>`
          : `${trendArrow(row.shareDelta)} ${formatSignedPercent(row.shareDelta, 1)}`;
      const tags = `${row.isFocus ? `<span class="dot dot-focus" title="Focusreden"></span>` : ""}${row.groupKey === PREVENTABLE_GROUP ? `<span class="dot dot-bad" title="Voorkombaar"></span>` : ""}`;
      return `
        <tr class="${row.isFocus ? "row-focus" : ""} ${isNew ? "row-new" : ""} ${gone ? "row-gone" : ""}" style="--row-accent:${escapeHtml(groupColor)}">
          <th scope="row" class="reason">
            <span class="rank">#${String(index + 1).padStart(2, "0")}</span>
            <span class="reason-stack">
              <span class="reason-name">${tags}<span>${escapeHtml(row.reason)}</span></span>
              <span class="reason-group">${escapeHtml(group.short)}</span>
            </span>
          </th>
          <td class="num strong" data-label="Uitbetaald">${formatMoney(row.currentAmount)}</td>
          <td class="num" data-label="Aantal">${formatNumber(row.currentCount)}</td>
          <td class="num share" data-label="% van totaal">${shareBar}<span>${formatPercent(row.currentShare, 1)}</span></td>
          <td class="num ${costTrendClass(row.shareDelta)}" data-label="Δ aandeel">${shareDelta}</td>
          <td class="num ${costTrendClass(row.amountDelta)}" data-label="Δ bedrag">${row.previousAmount || row.currentAmount ? formatSignedMoney(row.amountDelta) : "—"}</td>
        </tr>`;
    }).join("");

    const sortHeader = (key, label, numeric = true) => {
      const active = sortKey === key;
      const direction = active ? (sortDir === 1 ? "ascending" : "descending") : "none";
      const icon = active ? (sortDir === 1 ? "↑" : "↓") : "↕";
      return `<th scope="col" class="${numeric ? "num" : ""}" aria-sort="${direction}"><button type="button" class="sort-button" data-compare-sort="${key}"><span>${escapeHtml(label)}</span><span aria-hidden="true">${icon}</span></button></th>`;
    };

    els.compareTable.innerHTML = `
      <div class="table-summary">
        <div><span>Top 3 redenen</span><strong>${formatMoney(top3Amount)}</strong><em>${formatPercent(top3Share, 0)} van totaal</em></div>
        <div><span>Voorkombaar</span><strong>${formatMoney(preventableAmount)}</strong><em>${formatPercent(preventableShare, 0)} van totaal</em></div>
        <div><span>Nieuwe redenen</span><strong>${comparable ? formatNumber(newCount) : "n.v.t."}</strong><em>${comparable ? `vs ${escapeHtml(comparisonShort)}` : "geen referentie beschikbaar"}</em></div>
      </div>
      <p class="table-help" id="reasonTableHelp">Lees je zo: <strong>% van totaal</strong> = welk deel van al het teruggestorte geld deze reden is. <strong>Verschil aandeel</strong> = hoeveel dat deel is <span class="is-up">gestegen (rood)</span> of <span class="is-down">gedaald (groen)</span> t.o.v. ${escapeHtml(comparisonLabel)}, in procentpunten.${ctx.catchUp ? ` Bedragverschillen zijn gebaseerd op ${formatMoney(ctx.analysisCurrent.total)} per week; de kolom Bedrag blijft de werkelijke uitbetaling van ${formatMoney(ctx.current.total)} tonen.` : ""}</p>
      ${activeGroupMeta ? `<div class="filter-chip">Alleen groep <strong>${escapeHtml(activeGroupMeta.label)}</strong> — ${formatMoney(activeGroupMeta.amount)} (${formatPercent(activeGroupMeta.share, 1)} van totaal). <button type="button" class="chip-clear" data-clear-group>× toon alle redenen</button></div>` : ""}
      <label class="mobile-table-sort">
        <span>Sortering</span>
        <select data-compare-sort-select>
          <option value="amount:desc" ${sortKey === "amount" && sortDir === -1 ? "selected" : ""}>Bedrag · hoog naar laag</option>
          <option value="amount:asc" ${sortKey === "amount" && sortDir === 1 ? "selected" : ""}>Bedrag · laag naar hoog</option>
          <option value="shareDelta:desc" ${sortKey === "shareDelta" && sortDir === -1 ? "selected" : ""}>Grootste stijging aandeel</option>
          <option value="amountDelta:desc" ${sortKey === "amountDelta" && sortDir === -1 ? "selected" : ""}>Grootste stijging bedrag</option>
          <option value="reason:asc" ${sortKey === "reason" && sortDir === 1 ? "selected" : ""}>Reden · alfabetisch</option>
        </select>
      </label>
      <table class="compare" aria-describedby="reasonTableHelp">
        <caption>Redenenranking voor ${escapeHtml(labelPeriod(ctx.type, ctx.key))}, vergeleken met ${escapeHtml(comparisonLabel)}</caption>
        <thead>
          <tr>
            ${sortHeader("reason", "Reden", false)}
            ${sortHeader("amount", "Bedrag")}
            ${sortHeader("count", "Aantal")}
            ${sortHeader("share", "% van totaal")}
            ${sortHeader("shareDelta", `Δ aandeel vs ${comparisonShort}`)}
            ${sortHeader("amountDelta", `Δ € vs ${comparisonShort}`)}
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <th scope="row" class="reason">${escapeHtml(foot.label)}</th>
            <td class="num strong" data-label="Uitbetaald">${formatMoney(foot.amount)}</td>
            <td class="num" data-label="Aantal">${formatNumber(foot.count)}</td>
            <td class="num" data-label="% van totaal">${formatPercent(foot.share, foot.shareDigits)}</td>
            <td class="num ${foot.shareDelta === null ? "muted" : costTrendClass(foot.shareDelta)}" data-label="Δ aandeel">${foot.hasPrev && foot.shareDelta !== null ? `${trendArrow(foot.shareDelta)} ${formatSignedPercent(foot.shareDelta, 1)}` : "—"}</td>
            <td class="num ${costTrendClass(foot.amountDelta)}" data-label="Δ bedrag">${foot.hasPrev ? formatSignedMoney(foot.amountDelta) : "—"}</td>
          </tr>
        </tfoot>
      </table>
      <p class="table-note">
        <span class="dot dot-focus"></span> focusreden (ALT / Niet werkzaam) ·
        <span class="dot dot-bad"></span> voorkombaar (onze fout) ·
        aantal credits ${totalCountDelta > 0 ? "+" : totalCountDelta < 0 ? "−" : ""}${formatNumber(Math.abs(totalCountDelta))} ${ctx.catchUp ? "gecorrigeerd " : ""}vs ${escapeHtml(ctx.catchUp ? comparisonLabel : PERIOD_TYPES[ctx.type].previousLabel)}
      </p>`;
  }

  // "Waar zit het in?" als compact dashboard: één compositiebalk (waar het geld
  // zit) + grote leesbare tegels per groep met % en het verschil t.o.v. vorige.
  function renderGroupBreakdown(ctx) {
    if (!els.groupBreakdown) return;
    const groups = ctx.groupComparison.slice().sort((a, b) => b.amount - a.amount);
    const withAmount = groups.filter(group => group.amount > 0);
    const segments = (withAmount.length ? withAmount : groups).map(group => `
      <button type="button" class="comp-seg ${group.key === state.selectedGroupFilter ? "is-selected" : ""}" data-group="${escapeHtml(group.key)}" style="flex:${Math.max(group.share, 0.4)}; background:${GROUP_COLORS[group.key] || "#c0d0dd"}" title="${escapeHtml(group.label)}: ${escapeHtml(formatMoney(group.amount))} (${escapeHtml(formatPercent(group.share, 1))}) — klik om te filteren" aria-label="${escapeHtml(group.label)}">
        ${group.share >= 8 ? `<span>${escapeHtml(formatMoney(group.amount))}</span>` : ""}
      </button>`).join("");

    const prevLabel = ctx.catchUp && ctx.comparisonPreviousKey
      ? labelPeriod(ctx.type, ctx.comparisonPreviousKey)
      : PERIOD_TYPES[ctx.type].previousLabel;
    const tiles = groups.map(group => {
      const isKey = group.key === PREVENTABLE_GROUP;
      const isSelected = group.key === state.selectedGroupFilter;
      return `
        <button type="button" class="group-tile ${isKey ? "is-key" : ""} ${isSelected ? "is-selected" : ""}" data-group="${escapeHtml(group.key)}" aria-pressed="${isSelected}">
          <span class="group-swatch" style="background:${GROUP_COLORS[group.key] || "#c0d0dd"}"></span>
          <div class="group-tile-body">
            <div class="group-tile-name">${escapeHtml(group.short)}</div>
            <div class="group-tile-amount">${formatMoney(group.amount)}</div>
            <div class="group-tile-share">${formatPercent(group.share, 1)} van totaal</div>
            <div class="group-tile-delta ${costTrendClass(group.shareDelta)}">${trendArrow(group.shareDelta)} ${formatSignedPercent(group.shareDelta, 1)}-punt ${ctx.catchUp ? "gecorrigeerd " : ""}vs ${escapeHtml(prevLabel)}</div>
          </div>
          <span class="group-tile-cta">${isSelected ? "✓ getoond" : "bekijk"}</span>
        </button>`;
    }).join("");

    els.groupBreakdown.innerHTML = `
      <div class="comp-bar">${segments}</div>
      <div class="group-tiles">${tiles}</div>
      <p class="group-hint">Klik op een groep om alleen die redenen in de tabel hieronder te zien.</p>`;
  }

  function buildParetoRows(ctx, limit = 8) {
    const source = ctx.comparison
      .filter(row => row.currentAmount > 0)
      .sort((a, b) => b.currentAmount - a.currentAmount);
    const total = source.reduce((sum, row) => sum + row.currentAmount, 0);
    let cumulative = 0;
    const allRows = source.map(row => {
      const share = total ? (row.currentAmount / total) * 100 : 0;
      cumulative += share;
      return {
        reason: row.reason,
        amount: row.currentAmount,
        share,
        cumulative,
        groupKey: row.groupKey,
      };
    });
    const countToEighty = allRows.findIndex(row => row.cumulative >= 80) + 1 || allRows.length;
    if (allRows.length <= limit) return { rows: allRows, total, countToEighty, totalReasons: allRows.length };

    // Laat waar mogelijk alle redenen zien die nodig zijn om de 80%-grens te
    // bereiken. Bij een zeer vlakke verdeling blijft de lijst begrensd.
    const visibleCount = Math.min(12, Math.max(1, limit - 1, countToEighty));
    if (allRows.length <= visibleCount) return { rows: allRows, total, countToEighty, totalReasons: allRows.length };
    const visible = allRows.slice(0, visibleCount);
    const rest = allRows.slice(visible.length);
    const restAmount = rest.reduce((sum, row) => sum + row.amount, 0);
    const restShare = total ? (restAmount / total) * 100 : 0;
    visible.push({
      reason: `Overige ${rest.length} redenen`,
      amount: restAmount,
      share: restShare,
      cumulative: 100,
      groupKey: "overig",
    });
    return { rows: visible, total, countToEighty, totalReasons: allRows.length };
  }

  function buildChangeDrivers(ctx, limit = 7) {
    const source = ctx.comparison
      .filter(row => Math.abs(row.amountDelta) >= 0.5)
      .sort((a, b) => Math.abs(b.amountDelta) - Math.abs(a.amountDelta));
    const rows = source.slice(0, limit).map(row => ({
      reason: row.reason,
      amountDelta: row.amountDelta,
      groupKey: row.groupKey,
    }));
    if (source.length > limit) {
      rows.push({
        reason: `Overige ${source.length - limit} redenen samen`,
        amountDelta: source.slice(limit).reduce((sum, row) => sum + row.amountDelta, 0),
        groupKey: "overig",
      });
    }
    return {
      rows,
      totalDelta: ctx.headline.decisionHasPrevious ? ctx.headline.decisionDelta : null,
      maxAbs: Math.max(1, ...rows.map(row => Math.abs(row.amountDelta))),
    };
  }

  function detectReturnBatchCandidate(currentKey) {
    const targetKey = previousPeriodKey("week", currentKey);
    if (!targetKey) return null;
    const currentReturns = originAmountForWeek(currentKey, "Retouren");
    const previousReturns = originAmountForWeek(targetKey, "Retouren");
    const currentKS = originAmountForWeek(currentKey, "Klantenservice");
    const previousKS = originAmountForWeek(targetKey, "Klantenservice");
    if (!(currentReturns > 0)) return null;
    const weekKeys = Array.from(new Set(state.records.map(record => record.weekKey).filter(Boolean)))
      .sort((a, b) => periodSortValue("week", a) - periodSortValue("week", b));
    const baselineValues = weekKeys
      .filter(key => key !== currentKey && key !== targetKey)
      .map(key => originAmountForWeek(key, "Retouren"))
      .filter(value => value > 0);
    const baselineKSValues = weekKeys
      .filter(key => key !== currentKey && key !== targetKey)
      .map(key => originAmountForWeek(key, "Klantenservice"))
      .filter(value => value > 0);
    if (baselineValues.length < 3 || baselineKSValues.length < 3) return null;
    const baseline = median(baselineValues);
    const baselineKS = median(baselineKSValues);
    const normalized = (previousReturns + currentReturns) / 2;
    const previousLow = previousReturns <= baseline * 0.35;
    const currentHigh = currentReturns >= baseline * 1.45;
    const plausible = normalized >= baseline * 0.65 && normalized <= baseline * 1.55;
    const ksContinued = previousKS >= baselineKS * 0.65 && previousKS <= baselineKS * 1.55
      && currentKS >= baselineKS * 0.65 && currentKS <= baselineKS * 1.55;
    if (!previousLow || !currentHigh || !plausible || !ksContinued) return null;
    return {
      currentKey,
      targetKey,
      currentReturns,
      previousReturns,
      currentKS,
      previousKS,
      baseline,
      baselineKS,
      suggestedAmount: Math.round((Math.max(0, currentReturns - previousReturns) / 2) * 100) / 100,
    };
  }

  function renderDecisionAnalysis(ctx) {
    if (els.paretoChart) {
      const pareto = buildParetoRows(ctx);
      if (!pareto.rows.length) {
        els.paretoChart.innerHTML = `<div class="empty-state">Geen creditbedragen voor deze selectie.</div>`;
      } else {
        const maxAmount = Math.max(...pareto.rows.map(row => row.amount), 1);
        els.paretoChart.innerHTML = `
          <div class="analysis-summary">
            <strong>${formatNumber(pareto.countToEighty)} van ${formatNumber(pareto.totalReasons)}</strong>
            <span>redenen vormen samen minstens 80% van het bedrag</span>
          </div>
          <ol class="pareto-list">
            ${pareto.rows.map(row => `
              <li>
                <div class="analysis-label">
                  <span>${escapeHtml(row.reason)}</span>
                  <strong>${formatMoney(row.amount)} <small>${formatPercent(row.share, 1)}</small></strong>
                </div>
                <div class="pareto-track" aria-label="${escapeHtml(row.reason)}: ${escapeHtml(formatMoney(row.amount))}, cumulatief ${escapeHtml(formatPercent(row.cumulative, 1))}">
                  <i style="width:${Math.max(1.5, (row.amount / maxAmount) * 100).toFixed(1)}%"></i>
                  <b style="left:${Math.min(100, row.cumulative).toFixed(1)}%"></b>
                </div>
                <span class="cumulative-label">${formatPercent(row.cumulative, 0)} cumulatief</span>
              </li>`).join("")}
          </ol>`;
      }
    }

    if (els.changeDrivers) {
      const drivers = buildChangeDrivers(ctx);
      if (drivers.totalDelta === null) {
        els.changeDrivers.innerHTML = `<div class="empty-state">Nog geen direct voorafgaande periode om de verandering te verklaren.</div>`;
      } else if (!drivers.rows.length) {
        els.changeDrivers.innerHTML = `
          <div class="analysis-summary is-flat"><strong>${formatMoney(0)}</strong><span>geen materiele verandering per reden</span></div>`;
      } else {
        els.changeDrivers.innerHTML = `
          <div class="analysis-summary ${costTrendClass(drivers.totalDelta)}">
            <strong>${formatSignedMoney(drivers.totalDelta)}</strong>
            <span>${ctx.catchUp ? "gecorrigeerd totaalverschil" : `totaalverschil versus ${PERIOD_TYPES[ctx.type].previousLabel}`}</span>
          </div>
          <ol class="change-list">
            ${drivers.rows.map(row => {
              const pct = Math.min(100, (Math.abs(row.amountDelta) / drivers.maxAbs) * 100);
              const tone = costTrendClass(row.amountDelta);
              return `
                <li>
                  <div class="analysis-label">
                    <span>${escapeHtml(row.reason)}</span>
                    <strong class="${tone}">${trendArrow(row.amountDelta)} ${formatSignedMoney(row.amountDelta)}</strong>
                  </div>
                  <div class="change-axis" aria-label="${escapeHtml(row.reason)}: ${escapeHtml(formatSignedMoney(row.amountDelta))}">
                    <span class="change-half negative">${row.amountDelta < 0 ? `<i style="width:${pct.toFixed(1)}%"></i>` : ""}</span>
                    <span class="change-zero"></span>
                    <span class="change-half positive">${row.amountDelta > 0 ? `<i style="width:${pct.toFixed(1)}%"></i>` : ""}</span>
                  </div>
                </li>`;
            }).join("")}
          </ol>`;
      }
    }
  }

  function niceCeil(value) {
    const number = Math.max(1, Number(value || 1));
    const magnitude = 10 ** Math.floor(Math.log10(number));
    const normalized = number / magnitude;
    const nice = normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return nice * magnitude;
  }

  // ---- Verloop: metriek, bereik, statistiek en forecast --------------------
  const TREND_METRICS = {
    total:   { label: "Bedrag",    axis: formatMoney,  fmt: formatMoneyExact },
    count:   { label: "Aantal",    axis: formatNumber, fmt: formatNumber },
    average: { label: "Gemiddeld", axis: formatMoney,  fmt: formatMoneyExact },
  };

  function getTrendRangeLimit() {
    const map = { "13": 13, "26": 26, "52": 52, all: Infinity };
    return map[state.trendRange] !== undefined ? map[state.trendRange] : Infinity;
  }

  function isoWeeksInYear(year) {
    return getIsoWeekParts(new Date(Number(year), 11, 28)).week;
  }

  function nextPeriodKey(type, key) {
    if (type === "week") {
      const m = key.match(/^(\d{4})-W(\d{2})$/);
      if (!m) return "";
      let y = Number(m[1]), w = Number(m[2]) + 1;
      if (w > isoWeeksInYear(y)) { y += 1; w = 1; }
      return `${y}-W${pad2(w)}`;
    }
    if (type === "month") {
      const m = key.match(/^(\d{4})-(\d{2})$/);
      if (!m) return "";
      let y = Number(m[1]), mo = Number(m[2]) + 1;
      if (mo > 12) { y += 1; mo = 1; }
      return `${y}-${pad2(mo)}`;
    }
    if (type === "quarter") {
      const m = key.match(/^(\d{4})-Q(\d)$/);
      if (!m) return "";
      let y = Number(m[1]), q = Number(m[2]) + 1;
      if (q > 4) { y += 1; q = 1; }
      return `${y}-Q${q}`;
    }
    return String((Number(key) || 0) + 1);
  }

  function previousPeriodKey(type, key) {
    if (type === "week") {
      const m = key.match(/^(\d{4})-W(\d{2})$/);
      if (!m) return "";
      let y = Number(m[1]), w = Number(m[2]) - 1;
      if (w < 1) { y -= 1; w = isoWeeksInYear(y); }
      return `${y}-W${pad2(w)}`;
    }
    if (type === "month") {
      const m = key.match(/^(\d{4})-(\d{2})$/);
      if (!m) return "";
      let y = Number(m[1]), mo = Number(m[2]) - 1;
      if (mo < 1) { y -= 1; mo = 12; }
      return `${y}-${pad2(mo)}`;
    }
    if (type === "quarter") {
      const m = key.match(/^(\d{4})-Q(\d)$/);
      if (!m) return "";
      let y = Number(m[1]), q = Number(m[2]) - 1;
      if (q < 1) { y -= 1; q = 4; }
      return `${y}-Q${q}`;
    }
    return String((Number(key) || 0) - 1);
  }

  function completePeriodKeys(type, availableKeys) {
    if (!availableKeys.length) return [];
    const last = availableKeys.at(-1);
    const result = [availableKeys[0]];
    let cursor = availableKeys[0];
    for (let guard = 0; guard < 2000 && cursor !== last; guard += 1) {
      const next = nextPeriodKey(type, cursor);
      if (!next || periodSortValue(type, next) <= periodSortValue(type, cursor)) break;
      result.push(next);
      cursor = next;
    }
    return result;
  }

  // Forecast met exponential smoothing (ETS), volgens Hyndman "Forecasting:
  // Principles and Practice". Automatische modelkeuze:
  //  - Holt-Winters (seizoen + gedempte trend) bij >= 2 volledige seizoenscycli,
  //  - anders gedempte Holt-trend (robuuste standaard, schiet niet door),
  //  - anders enkelvoudige smoothing.
  // Uitschieters worden eerst gladgestreken; parameters via grid-search op de
  // één-staps-vooruit fout. Band = onzekerheid (groeit met de horizon).
  function forecastSeries(values, outlierFlags, seasonLen, steps) {
    const n = values.length;
    if (n < 5 || steps < 1) return null;

    // 1) uitschieters gladstrijken (lineair interpoleren tussen buren)
    const y = values.slice();
    let excluded = 0;
    for (let i = 0; i < n; i += 1) {
      if (!outlierFlags[i]) continue;
      excluded += 1;
      let a = i - 1; while (a >= 0 && outlierFlags[a]) a -= 1;
      let b = i + 1; while (b < n && outlierFlags[b]) b += 1;
      if (a >= 0 && b < n) y[i] = values[a] + (values[b] - values[a]) * ((i - a) / (b - a));
      else if (a >= 0) y[i] = values[a];
      else if (b < n) y[i] = values[b];
    }

    const m = seasonLen;
    const useSeasonal = m > 1 && n >= 2 * m;
    const useTrend = n >= 5;

    // 2) ETS-recursie (additief, gedempte trend) voor één parameterset
    const run = (alpha, beta, gamma, phi) => {
      let level, trendV = 0;
      const s = useSeasonal ? new Array(m).fill(0) : [];
      let start;
      if (useSeasonal) {
        let s1 = 0; for (let i = 0; i < m; i += 1) s1 += y[i]; level = s1 / m;
        let s2 = 0; for (let i = m; i < 2 * m; i += 1) s2 += y[i]; trendV = (s2 / m - s1 / m) / m;
        for (let i = 0; i < m; i += 1) s[i] = y[i] - level;
        let mean = 0; for (let i = 0; i < m; i += 1) mean += s[i]; mean /= m; for (let i = 0; i < m; i += 1) s[i] -= mean;
        start = m;
      } else if (useTrend) { level = y[0]; trendV = y[1] - y[0]; start = 2; } else { level = y[0]; start = 1; }
      let sse = 0, cnt = 0;
      for (let t = start; t < n; t += 1) {
        const idx = useSeasonal ? ((t % m) + m) % m : 0;
        const seasVal = useSeasonal ? s[idx] : 0;
        const damped = useTrend ? phi * trendV : 0;
        const e = y[t] - (level + damped + seasVal); sse += e * e; cnt += 1;
        const newLevel = alpha * (y[t] - seasVal) + (1 - alpha) * (level + damped);
        if (useTrend) trendV = beta * (newLevel - level) + (1 - beta) * phi * trendV;
        if (useSeasonal) s[idx] = gamma * (y[t] - newLevel) + (1 - gamma) * seasVal;
        level = newLevel;
      }
      return { sse, cnt, level, trendV, s };
    };

    // 3) grid-search op de smoothing-parameters
    const alphas = [0.1, 0.2, 0.3, 0.4, 0.5, 0.7];
    const betas = useTrend ? [0.02, 0.05, 0.1, 0.2] : [0];
    const gammas = useSeasonal ? [0.05, 0.1, 0.2, 0.3] : [0];
    const phis = useTrend ? [0.85, 0.9, 0.95, 0.98, 1] : [1];
    let best = null;
    alphas.forEach(alpha => betas.forEach(beta => gammas.forEach(gamma => phis.forEach(phi => {
      const r = run(alpha, beta, gamma, phi);
      if (!best || r.sse < best.r.sse) best = { r, alpha, beta, gamma, phi };
    }))));
    if (!best) return null;
    const fit = best.r;
    const k = 1 + (useTrend ? 2 : 0) + (useSeasonal ? 1 : 0);
    const sigma = Math.sqrt(fit.sse / Math.max(1, fit.cnt - k));

    // 4) projecteren
    const preds = [];
    for (let hh = 1; hh <= steps; hh += 1) {
      const damp = useTrend ? (best.phi < 1 ? best.phi * (1 - Math.pow(best.phi, hh)) / (1 - best.phi) : hh) : 0;
      const seasVal = useSeasonal ? fit.s[(((n - 1 + hh) % m) + m) % m] : 0;
      const yv = Math.max(0, fit.level + damp * fit.trendV + seasVal);
      const band = 1.28 * sigma * Math.sqrt(hh);
      preds.push({ idx: n - 1 + hh, y: yv, lo: Math.max(0, yv - band), hi: yv + band });
    }
    const method = useSeasonal ? "Holt-Winters (seizoen + gedempte trend)" : useTrend ? "exponentiële smoothing (gedempte trend)" : "exponentiële smoothing";
    return { preds, excluded, method };
  }

  function validateForecast(values, _outlierFlags, seasonLen) {
    const n = values.length;
    if (n < 8) return null;
    const firstTest = Math.max(6, n - 8);
    let modelError = 0, benchmarkError = 0, testN = 0;
    for (let target = firstTest; target < n; target += 1) {
      const history = values.slice(0, target);
      // Iedere rolling-origin stap gebruikt alleen informatie die op dat
      // moment beschikbaar was; zo lekt de latere testperiode niet terug.
      const prefixControl = buildIndividualsControl(history);
      const flags = prefixControl.pointSignals;
      const model = forecastSeries(history, flags, seasonLen, 1);
      if (!model || !model.preds.length) continue;
      const seasonalBenchmark = seasonLen > 1 && target >= seasonLen;
      const benchmark = seasonalBenchmark ? values[target - seasonLen] : values[target - 1];
      if (!Number.isFinite(benchmark) || !Number.isFinite(values[target])) continue;
      modelError += Math.abs(values[target] - model.preds[0].y);
      benchmarkError += Math.abs(values[target] - benchmark);
      testN += 1;
    }
    if (testN < 3) return null;
    const mae = modelError / testN;
    const benchmarkMae = benchmarkError / testN;
    const skill = benchmarkMae > 0 ? 1 - (mae / benchmarkMae) : mae === 0 ? 0 : -1;
    return { testN, mae, benchmarkMae, skill };
  }

  function naiveForecast(values, seasonLen, steps) {
    if (values.length < 2 || steps < 1) return null;
    const seasonal = seasonLen > 1 && values.length >= 2 * seasonLen;
    const lag = seasonal ? seasonLen : 1;
    const errors = [];
    for (let index = lag; index < values.length; index += 1) {
      errors.push(values[index] - values[index - lag]);
    }
    const sigma = errors.length
      ? Math.sqrt(errors.reduce((sum, value) => sum + (value * value), 0) / errors.length)
      : 0;
    const preds = [];
    for (let horizon = 1; horizon <= steps; horizon += 1) {
      const y = seasonal
        ? values[values.length - seasonLen + ((horizon - 1) % seasonLen)]
        : values.at(-1);
      const band = 1.28 * sigma * Math.sqrt(horizon);
      preds.push({
        idx: values.length - 1 + horizon,
        y: Math.max(0, y),
        lo: Math.max(0, y - band),
        hi: y + band,
      });
    }
    return {
      preds,
      excluded: 0,
      method: seasonal ? "seizoensnaieve benchmark" : "naieve benchmark (laatste waarde)",
      benchmark: true,
    };
  }

  function selectValidatedForecast(values, outlierFlags, seasonLen, steps) {
    if (values.length < 8) return null;
    const validation = validateForecast(values, outlierFlags, seasonLen);
    const model = forecastSeries(values, outlierFlags, seasonLen, steps);
    if (!model) return null;
    const selected = validation && validation.skill < 0
      ? naiveForecast(values, seasonLen, steps)
      : model;
    if (!selected) return null;
    selected.validation = validation;
    selected.historyN = values.length;
    return selected;
  }

  function getTrendSeries(ctx) {
    const availableKeys = ctx.periodStats.keys;
    const totals = ctx.periodStats.totals;
    const counts = ctx.periodStats.counts;
    const metricKey = TREND_METRICS[state.trendMetric] ? state.trendMetric : "total";
    const valuesByKey = new Map(availableKeys.map((key, index) => {
      const value = metricKey === "count"
        ? counts[index]
        : metricKey === "average"
          ? (counts[index] ? totals[index] / counts[index] : 0)
          : totals[index];
      return [key, value];
    }));
    const allKeys = completePeriodKeys(ctx.type, availableKeys);
    const allValues = allKeys.map(key => valuesByKey.has(key) ? valuesByKey.get(key) : null);
    const N = allValues.length;

    const administrativeKeys = new Set(
      (ctx.administrativeCatchUps || []).flatMap(pair => [pair.previousKey, pair.currentKey])
    );
    getAdjustmentPeriodKeys(ctx.type).forEach(periodKey => administrativeKeys.add(periodKey));
    const excludedFlags = allKeys.map(key => administrativeKeys.has(key));
    const control = buildIndividualsControl(allValues, excludedFlags);
    const allOutliers = control.pointSignals;
    const statsN = control.n;
    const avg = control.center;
    const forecastAdjustedValues = allValues.slice();
    (ctx.administrativeCatchUps || []).forEach(pair => {
      const previousIndex = allKeys.indexOf(pair.previousKey);
      const currentIndex = allKeys.indexOf(pair.currentKey);
      if (previousIndex < 0 || currentIndex < 0) return;
      let normalized;
      if (metricKey === "total") {
        normalized = pair.normalizedWeekly;
      } else if (metricKey === "count") {
        normalized = (counts[availableKeys.indexOf(pair.previousKey)] + counts[availableKeys.indexOf(pair.currentKey)]) / 2;
      } else {
        const pi = availableKeys.indexOf(pair.previousKey);
        const ci = availableKeys.indexOf(pair.currentKey);
        const combinedCount = counts[pi] + counts[ci];
        normalized = combinedCount ? (totals[pi] + totals[ci]) / combinedCount : 0;
      }
      forecastAdjustedValues[previousIndex] = normalized;
      forecastAdjustedValues[currentIndex] = normalized;
    });

    let hi = { v: -Infinity, i: 0 }, lo = { v: Infinity, i: 0 };
    allValues.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      if (value > hi.v) hi = { v: value, i: index };
      if (value < lo.v) lo = { v: value, i: index };
    });
    if (!Number.isFinite(hi.v)) hi = { v: 0, i: 0 };
    if (!Number.isFinite(lo.v)) lo = { v: 0, i: 0 };

    const outCount = allOutliers.filter(Boolean).length;
    const steps = { week: 6, month: 3, quarter: 2, year: 1 }[ctx.type] || 3;
    const seasonLen = { week: 52, month: 12, quarter: 4, year: 0 }[ctx.type] || 0;
    const lastGap = forecastAdjustedValues.reduce((last, value, index) => Number.isFinite(value) ? last : index, -1);
    const forecastValues = forecastAdjustedValues.slice(lastGap + 1);
    const forecastFlags = allOutliers.slice(lastGap + 1);
    const forecastBasisPaused = ctx.hasAdjustments && !ctx.isOperational;
    const forecast = state.forecastOn && !ctx.catchUp && !forecastBasisPaused
      ? selectValidatedForecast(forecastValues, forecastFlags, seasonLen, steps)
      : null;

    // Bereik = alleen de zichtbare zoom (aantal recente periodes in beeld).
    const limit = getTrendRangeLimit();
    const start = Number.isFinite(limit) ? Math.max(0, N - limit) : 0;
    const keys = allKeys.slice(start), values = allValues.slice(start), outliers = allOutliers.slice(start);
    const n = values.length;
    if (forecast) forecast.preds.forEach((p, i) => { p.idx = n - 1 + (i + 1); });
    const finiteValues = values.filter(Number.isFinite);
    const maxVal = Math.max(
      ...finiteValues,
      control.available ? control.ucl : 0,
      forecast ? Math.max(...forecast.preds.map(p => p.hi)) : 0,
      1
    );
    const missingN = allValues.filter(value => !Number.isFinite(value)).length;

    return {
      metric: TREND_METRICS[metricKey], metricKey, keys, values, n, fullN: N, observedN: N - missingN, missingN,
      statsN, avg, stdev: control.sigma, upper: control.ucl, bandLo: control.lcl, bandHi: control.ucl, control,
      outliers, forecast, forecastHistoryN: forecastValues.length, maxVal, outCount,
      forecastBasisPaused,
      highKey: allKeys[hi.i], highVal: hi.v, lowKey: allKeys[lo.i], lowVal: lo.v,
    };
  }

  // Professionele tijdreeks: lijn + vlak, I-MR-procesgrenzen, kalendergaten,
  // bijzondere signalen en een gevalideerde stippellijn-prognose.
  function renderTrendChart(ctx) {
    if (!els.trendChart) return;
    const type = ctx.type, periodWord = PERIOD_TYPES[type].label.toLowerCase();
    const s = getTrendSeries(ctx);
    const M = s.metric;
    const forecastPaused = Boolean(ctx.catchUp || s.forecastBasisPaused);
    const fc = forecastPaused ? null : s.forecast;
    const fcKeys = [];
    if (fc) { let k = ctx.latestKey || s.keys[s.n - 1]; for (let i = 0; i < fc.preds.length; i += 1) { k = nextPeriodKey(type, k); fcKeys.push(k); } }

    const metrics = [["total", "Bedrag"], ["count", "Aantal"], ["average", "Gemiddeld"]];
    const ranges = [["13", "13"], ["26", "26"], ["52", "52"], ["all", "Alles"]];
    const toolbar = `
      <div class="trend-toolbar">
        <div class="trend-group" role="group" aria-label="Toon"><span>Toon</span>${metrics.map(([v, l]) => `<button type="button" data-trend-metric="${v}" class="${state.trendMetric === v ? "is-active" : ""}" aria-pressed="${state.trendMetric === v}">${l}</button>`).join("")}</div>
        <div class="trend-group" role="group" aria-label="Bereik"><span>Bereik</span>${ranges.map(([v, l]) => `<button type="button" data-trend-range="${v}" class="${state.trendRange === v ? "is-active" : ""}" aria-pressed="${state.trendRange === v}">${l} ${escapeHtml(v === "all" ? "" : PERIOD_TYPES[type].plural)}</button>`).join("")}</div>
        <button type="button" class="trend-toggle ${state.forecastOn && !forecastPaused ? "is-active" : ""}" data-forecast aria-pressed="${state.forecastOn && !forecastPaused}" ${forecastPaused ? "disabled aria-disabled=\"true\"" : ""}>Prognose ${forecastPaused ? "gepauzeerd" : state.forecastOn ? "aan" : "uit"}</button>
      </div>`;

    if (!s.n || !s.observedN) { els.trendChart.innerHTML = `${toolbar}<div class="empty-state">Geen verloopdata voor dit bereik.</div>`; return; }

    const outCount = s.outCount;
    const currentSignal = Boolean(s.control.pointSignals.at(-1));
    const activeRule = s.control.latestRule && s.control.latestRule.index === s.fullN - 1
      ? s.control.latestRule
      : null;
    const processValue = !s.control.available
      ? `${formatNumber(s.control.n)}/${formatNumber(s.control.required)}`
      : currentSignal
        ? "Actie nodig"
        : activeRule
          ? "Verschuiving"
          : "Stabiel";
    const processLabel = !s.control.available
      ? "meetpunten voor I-MR-grenzen"
      : currentSignal
        ? "laatste punt buiten procesgrens"
        : activeRule
          ? activeRule.label
          : `${formatNumber(outCount)} grenssignalen in historie`;
    const validation = fc && fc.validation;
    const skillPct = validation ? Math.round(validation.skill * 100) : null;
    const validationLabel = validation
      ? fc.benchmark
        ? `ETS ${Math.abs(skillPct)}% slechter; naive methode gekozen`
        : `${skillPct >= 0 ? "+" : ""}${skillPct}% versus naive benchmark · ${validation.testN} tests`
      : state.forecastOn
        ? `minimaal 8 aaneengesloten perioden nodig (${s.forecastHistoryN}/8)`
        : "prognose en backtest staan uit";
    const statCards = [
      { label: s.control.available ? `Proceslijn per ${periodWord}` : `Gemiddeld per ${periodWord}`, value: M.axis(s.avg) },
      { label: processLabel, value: processValue, alert: currentSignal },
      { label: `Hoogste · ${shortPeriodLabel(type, s.highKey)}`, value: M.axis(s.highVal) },
      { label: s.missingN ? "Ontbrekende kalenderperioden" : `Laagste · ${shortPeriodLabel(type, s.lowKey)}`, value: s.missingN ? formatNumber(s.missingN) : M.axis(s.lowVal) },
      { label: fc ? `Prognose ${PERIOD_TYPES[type].previousLabel.replace("vorige", "volgende").replace("vorig", "volgend")}` : "Prognose", value: fc ? M.axis(fc.preds[0].y) : state.forecastOn ? "Nog niet" : "Uit", accent: true },
      { label: validationLabel, value: validation ? `MAE ${M.axis(validation.mae)}` : "Backtest", accent: Boolean(validation && !fc.benchmark) },
    ];
    if (forecastPaused) {
      statCards[4] = { label: "Prognose gepauzeerd", value: "n.v.t.", accent: true };
      statCards[5] = { label: s.forecastBasisPaused ? "Kies operationele basis" : "Inhaalweek eerst beoordelen", value: "Backtest n.v.t." };
    }
    if (ctx.catchUp && M.label === "Bedrag") {
      statCards.unshift({
        label: `${shortPeriodLabel(type, ctx.catchUp.previousKey)} + ${shortPeriodLabel(type, ctx.catchUp.currentKey)} gemiddeld`,
        value: formatMoney(ctx.catchUp.normalizedWeekly),
        catchup: true,
      });
    }

    const width = 1200, height = 400, left = 92, right = 34, top = 30, bottom = 74;
    const cw = width - left - right, ch = height - top - bottom;
    const stepsCount = fc ? fc.preds.length : 0;
    const maxIdx = Math.max(1, s.n - 1 + stepsCount);
    const chartMax = niceCeil(s.maxVal);
    const xFor = idx => left + (idx / maxIdx) * cw;
    const yFor = v => top + ch - (Math.max(0, v) / chartMax) * ch;
    const pitch = cw / maxIdx;
    const xEnd = xFor(s.n - 1);
    const baseY = top + ch;
    const yTicks = [0, .25, .5, .75, 1].map(f => chartMax * f);
    const labelStep = Math.max(1, Math.ceil(s.n / 12));

    const segments = [];
    let segment = [];
    s.values.forEach((value, index) => {
      if (Number.isFinite(value)) {
        segment.push({ value, index });
      } else if (segment.length) {
        segments.push(segment);
        segment = [];
      }
    });
    if (segment.length) segments.push(segment);
    const trendLines = segments.map(points => {
      const coords = points.map(point => `${xFor(point.index).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(" ");
      return `<polyline class="trend-glow" points="${coords}" fill="none"></polyline><polyline class="trend-mainline" points="${coords}" fill="none"></polyline>`;
    }).join("");
    const trendAreas = segments.filter(points => points.length > 1).map(points => {
      const coords = points.map(point => `${xFor(point.index).toFixed(1)},${yFor(point.value).toFixed(1)}`).join(" ");
      return `<polygon class="trend-area" points="${xFor(points[0].index).toFixed(1)},${baseY.toFixed(1)} ${coords} ${xFor(points.at(-1).index).toFixed(1)},${baseY.toFixed(1)}"></polygon>`;
    }).join("");
    const selectedIndex = s.keys.indexOf(ctx.key);
    const selectedX = xFor(selectedIndex >= 0 ? selectedIndex : s.n - 1);
    const verticalGuides = s.values.map((_, i) => {
      const isSel = s.keys[i] === ctx.key, isLatest = s.keys[i] === ctx.latestKey;
      if (!(i % labelStep === 0 || isSel || isLatest)) return "";
      const x = xFor(i);
      return `<line class="grid grid-v ${isSel ? "is-selected" : ""}" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top}" y2="${baseY.toFixed(1)}"></line>`;
    }).join("");

    let fcArea = "", fcLine = "", fcDots = "", fcAxis = "";
    if (fc) {
      const ax = xEnd, ay = yFor(s.values[s.n - 1]);
      const hiPts = [`${ax.toFixed(1)},${ay.toFixed(1)}`, ...fc.preds.map(p => `${xFor(p.idx).toFixed(1)},${yFor(p.hi).toFixed(1)}`)];
      const loPts = [...fc.preds.map(p => `${xFor(p.idx).toFixed(1)},${yFor(p.lo).toFixed(1)}`).reverse(), `${ax.toFixed(1)},${ay.toFixed(1)}`];
      fcArea = `<polygon class="forecast-band" points="${hiPts.concat(loPts).join(" ")}"></polygon>`;
      fcLine = `<polyline class="forecast-line" fill="none" points="${ax.toFixed(1)},${ay.toFixed(1)} ${fc.preds.map(p => `${xFor(p.idx).toFixed(1)},${yFor(p.y).toFixed(1)}`).join(" ")}"></polyline>`;
      fcDots = fc.preds.map((p, i) => `<g><circle class="forecast-dot" cx="${xFor(p.idx).toFixed(1)}" cy="${yFor(p.y).toFixed(1)}" r="4"></circle><title>Prognose ${escapeHtml(labelPeriod(type, fcKeys[i]))}: ${escapeHtml(M.fmt(p.y))}</title></g>`).join("");
      fcAxis = fcKeys.map((k, i) => `<text class="pt-axis is-forecast" x="${xFor(fc.preds[i].idx).toFixed(1)}" y="${(height - 48).toFixed(1)}" text-anchor="middle">${escapeHtml(shortPeriodLabel(type, k))}</text>`).join("");
    }

    const marks = s.values.map((v, i) => {
      const isSel = s.keys[i] === ctx.key, isLatest = s.keys[i] === ctx.latestKey, isOut = s.outliers[i];
      const showLabel = i % labelStep === 0 || isLatest || isSel;
      const x = xFor(i);
      if (!Number.isFinite(v)) {
        return `<g class="pt is-missing" aria-label="${escapeHtml(labelPeriod(type, s.keys[i]))}: geen data">
          <rect class="pt-hit" x="${(x - pitch / 2).toFixed(1)}" y="${top}" width="${pitch.toFixed(1)}" height="${ch}"></rect>
          <line class="missing-slot" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top + 8}" y2="${baseY.toFixed(1)}"></line>
          <text class="missing-symbol" x="${x.toFixed(1)}" y="${top + 18}" text-anchor="middle">geen data</text>
          <title>${escapeHtml(labelPeriod(type, s.keys[i]))}: ontbrekende periode, niet als nul behandeld</title>
          ${showLabel ? `<text class="pt-axis is-missing" x="${x.toFixed(1)}" y="${(height - 48).toFixed(1)}" text-anchor="middle">${escapeHtml(shortPeriodLabel(type, s.keys[i]))}</text>` : ""}
        </g>`;
      }
      const y = yFor(v);
      return `<g class="pt ${isSel ? "is-selected" : ""} ${isLatest ? "is-latest" : ""} ${isOut ? "is-outlier" : ""}" data-period-key="${escapeHtml(s.keys[i])}" tabindex="0" role="button" aria-label="${escapeHtml(labelPeriod(type, s.keys[i]))}: ${escapeHtml(M.fmt(v))}">
        <rect class="pt-hit" x="${(x - pitch / 2).toFixed(1)}" y="${top}" width="${pitch.toFixed(1)}" height="${ch}"></rect>
        <line class="pt-stem" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${baseY.toFixed(1)}" y2="${y.toFixed(1)}"></line>
        ${isOut ? `<circle class="pt-outring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5"></circle>` : ""}
        <circle class="pt-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel || isOut ? 5 : 3.4}"></circle>
        <title>${escapeHtml(labelPeriod(type, s.keys[i]))}: ${escapeHtml(M.fmt(v))}${isOut ? " · valt op" : ""}</title>
        ${isSel ? `<text class="pt-value" x="${x.toFixed(1)}" y="${Math.max(top + 12, y - 12).toFixed(1)}" text-anchor="middle">${escapeHtml(M.axis(v))}</text>` : ""}
        ${showLabel ? `<text class="pt-axis" x="${x.toFixed(1)}" y="${(height - 48).toFixed(1)}" text-anchor="middle">${escapeHtml(shortPeriodLabel(type, s.keys[i]))}</text>` : ""}
      </g>`;
    }).join("");

    const showControl = s.control.available;
    const observedInView = s.values.filter(Number.isFinite).length;
    const baseChartNote = `${observedInView} waarnemingen in beeld binnen ${s.n} kalenderperioden. ${s.missingN ? `${s.missingN} ontbrekende periode${s.missingN === 1 ? "" : "n"} blijft als gat zichtbaar en telt niet als nul. ` : ""}`;
    const processNote = showControl
      ? `I-MR-procesgrenzen over ${s.control.n} bruikbare meetpunten: ${M.fmt(s.control.lcl)} tot ${M.fmt(s.control.ucl)}${s.control.provisional ? " (voorlopige basis; 25 punten geeft een stabielere schatting)" : ""}.${activeRule ? ` Actueel patroon: ${activeRule.label}.` : ""}`
      : `Formele I-MR-signalering start bij ${s.control.required} bruikbare meetpunten; beschikbaar: ${s.control.n}.`;
    const forecastNote = forecastPaused
      ? s.forecastBasisPaused
        ? " Prognose is in de werkelijke betaalweergave verborgen; kies de operationele basis voor een tijdreeks zonder betaalbatchpiek."
        : " Prognose is tijdelijk verborgen omdat deze inhaalweek administratief vertekend is; beoordeel deze ronde op het gecorrigeerde 2-weeksgemiddelde."
      : !state.forecastOn
        ? " Prognose staat uit."
        : fc
          ? ` Prognose: ${fc.method}. Rolling backtest: ${fc.validation ? `${fc.validation.testN} testpunten, MAE ${M.fmt(fc.validation.mae)}, ${fc.benchmark ? "naive benchmark presteerde beter en is daarom gekozen" : `${skillPct >= 0 ? skillPct : Math.abs(skillPct)}% ${skillPct >= 0 ? "beter" : "slechter"} dan naive`}` : "nog te weinig testpunten"}. De band is een 80%-voorspelinterval.`
          : ` Geen prognose: minimaal 8 aaneengesloten perioden nodig; beschikbaar sinds het laatste datagat: ${s.forecastHistoryN}.`;

    els.trendChart.innerHTML = `
      ${toolbar}
      <div class="trend-stats">${statCards.map(c => `<div class="trend-stat ${c.alert ? "alert" : ""} ${c.accent ? "accent" : ""} ${c.catchup ? "catchup" : ""}"><strong>${escapeHtml(c.value)}</strong><span>${escapeHtml(c.label)}</span></div>`).join("")}</div>
      <svg viewBox="0 0 ${width} ${height}" class="trend-svg pro" role="img" aria-labelledby="trendTitle trendDesc">
        <title id="trendTitle">Verloop ${escapeHtml(M.label.toLowerCase())} per ${escapeHtml(periodWord)}</title>
        <desc id="trendDesc">${escapeHtml(`${observedInView} waarnemingen in beeld${s.missingN ? ` en ${s.missingN} ontbrekende kalenderperioden` : ""}. Gemiddeld ${M.fmt(s.avg)}. Hoogste ${M.fmt(s.highVal)} in ${labelPeriod(type, s.highKey)}. Laagste ${M.fmt(s.lowVal)} in ${labelPeriod(type, s.lowKey)}.${outCount ? ` ${outCount} punt${outCount === 1 ? "" : "en"} buiten de I-MR-procesgrenzen.` : ""}`)}</desc>
        <defs>
          <linearGradient id="trendStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#3f6f92"></stop>
            <stop offset="58%" stop-color="#6a97b6"></stop>
            <stop offset="100%" stop-color="#db5461"></stop>
          </linearGradient>
          <linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3f6f92" stop-opacity=".22"></stop>
            <stop offset="100%" stop-color="#3f6f92" stop-opacity=".03"></stop>
          </linearGradient>
          <linearGradient id="forecastArea" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#6a97b6" stop-opacity=".16"></stop>
            <stop offset="100%" stop-color="#db5461" stop-opacity=".08"></stop>
          </linearGradient>
          <filter id="chartGlow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="4" result="blur"></feGaussianBlur>
            <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
          </filter>
        </defs>
        <rect class="plot-bg" x="${left}" y="${top}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}"></rect>
        ${verticalGuides}
        ${showControl ? `<rect class="band-control" x="${left.toFixed(1)}" y="${yFor(s.control.ucl).toFixed(1)}" width="${(xEnd - left).toFixed(1)}" height="${Math.max(0, yFor(s.control.lcl) - yFor(s.control.ucl)).toFixed(1)}"></rect>` : ""}
        ${yTicks.map(val => { const y = yFor(val); return `<line class="grid" x1="${left}" x2="${width - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="axis-tick" x="${left - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(M.axis(val))}</text>`; }).join("")}
        <line class="avg-line" x1="${left}" x2="${xEnd.toFixed(1)}" y1="${yFor(s.avg).toFixed(1)}" y2="${yFor(s.avg).toFixed(1)}"></line>
        <text class="avg-label" x="${(xEnd).toFixed(1)}" y="${(yFor(s.avg) - 6).toFixed(1)}" text-anchor="end">${showControl ? "proceslijn" : "gemiddeld"}</text>
        ${showControl ? `<line class="control-line upper" x1="${left}" x2="${xEnd.toFixed(1)}" y1="${yFor(s.control.ucl).toFixed(1)}" y2="${yFor(s.control.ucl).toFixed(1)}"></line><text class="control-label-svg upper" x="${xEnd.toFixed(1)}" y="${(yFor(s.control.ucl) - 5).toFixed(1)}" text-anchor="end">bovengrens</text><line class="control-line lower" x1="${left}" x2="${xEnd.toFixed(1)}" y1="${yFor(s.control.lcl).toFixed(1)}" y2="${yFor(s.control.lcl).toFixed(1)}"></line><text class="control-label-svg lower" x="${xEnd.toFixed(1)}" y="${(yFor(s.control.lcl) - 5).toFixed(1)}" text-anchor="end">ondergrens</text>` : ""}
        ${fcArea}
        ${fc ? `<line class="forecast-divider" x1="${xEnd.toFixed(1)}" x2="${xEnd.toFixed(1)}" y1="${top}" y2="${baseY.toFixed(1)}"></line><text class="forecast-label" x="${Math.min(width - right, xEnd + 10).toFixed(1)}" y="${top + 16}" text-anchor="start">prognose</text>` : ""}
        ${trendAreas}
        ${trendLines}
        ${selectedIndex >= 0 ? `<line class="selection-guide" x1="${selectedX.toFixed(1)}" x2="${selectedX.toFixed(1)}" y1="${top}" y2="${baseY.toFixed(1)}"></line>` : ""}
        ${fcLine}
        ${marks}
        ${fcDots}
        ${fcAxis}
      </svg>
      <div class="trend-legend">
        <span><i class="lg-line"></i>Verloop ${escapeHtml(M.label.toLowerCase())}</span>
        ${showControl ? `<span><i class="lg-band"></i>I-MR-procesruimte</span><span><i class="lg-out"></i>Buiten procesgrens</span>` : ""}
        ${s.missingN ? `<span><i class="lg-gap"></i>Ontbrekende periode</span>` : ""}
        ${fc ? `<span><i class="lg-fc"></i>Prognose</span>` : ""}
      </div>
      <p class="chart-note">${ctx.isOperational ? "<strong>Operationele basis:</strong> vertraagde Retouren zijn aan de oorspronkelijke week toegerekend. " : ""}${ctx.catchUp ? `<strong>Inhaalweek:</strong> ${escapeHtml(labelPeriod("week", ctx.catchUp.previousKey))} en ${escapeHtml(labelPeriod("week", ctx.catchUp.currentKey))} samen gemiddeld ${formatMoney(ctx.catchUp.normalizedWeekly)} per week. ` : ""}${escapeHtml(baseChartNote)} ${escapeHtml(processNote)}${escapeHtml(forecastNote)} <span class="chart-note-hint">Klik een punt om die ${escapeHtml(periodWord)} bovenin te openen.</span></p>`;
  }

  // Periodetotalen-tabel: elke periode vs de vorige (maand vs maand, etc.).
  function renderPeriodTotals(ctx) {
    if (!els.periodTotals) return;
    const type = ctx.type;
    const availableKeys = ctx.periodStats.keys;
    const totals = ctx.periodStats.totals;
    const counts = ctx.periodStats.counts;
    if (!availableKeys.length) { els.periodTotals.innerHTML = `<div class="empty-state">Geen periodes beschikbaar.</div>`; return; }
    const totalByKey = new Map(availableKeys.map((key, index) => [key, totals[index]]));
    const countByKey = new Map(availableKeys.map((key, index) => [key, counts[index]]));
    const keys = completePeriodKeys(type, availableKeys);
    const rows = keys.map(key => {
      const hasData = totalByKey.has(key);
      const previousKey = previousPeriodKey(type, key);
      const hasPreviousData = totalByKey.has(previousKey);
      const total = hasData ? totalByKey.get(key) : null;
      const count = hasData ? countByKey.get(key) : null;
      const prevTotal = hasPreviousData ? totalByKey.get(previousKey) : null;
      const deltaPct = hasData && prevTotal ? ((total - prevTotal) / prevTotal) * 100 : null;
      const delta = hasData && prevTotal !== null ? total - prevTotal : null;
      return { key, hasData, total, count, deltaPct, delta };
    }).reverse();
    const maxTotal = Math.max(...totals, 1);

    const referenceHeading = "Δ % vs vorige";
    els.periodTotals.innerHTML = `
      <table class="periods">
        <caption>Historische totalen per ${escapeHtml(PERIOD_TYPES[type].label.toLowerCase())}</caption>
        <thead>
          <tr>
            <th scope="col">${escapeHtml(PERIOD_TYPES[type].label)}</th>
            <th scope="col" class="num">Totaal</th>
            <th scope="col" class="num">Aantal</th>
            <th scope="col" class="num">${escapeHtml(referenceHeading)}</th>
            <th scope="col" class="num">Δ bedrag</th>
            <th scope="col" class="bar-col">Omvang</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => {
            const isAdjustedPeriod = ctx.isOperational && getAdjustmentPeriodKeys(type).has(row.key);
            const administrativePair = (ctx.administrativeCatchUps || []).find(pair => pair.currentKey === row.key || pair.previousKey === row.key);
            const isCatchUpCurrent = Boolean(administrativePair && row.key === administrativePair.currentKey);
            const isMissedRound = Boolean(administrativePair && row.key === administrativePair.previousKey);
            const isActiveCatchUp = Boolean(ctx.catchUp && row.key === ctx.catchUp.currentKey && ctx.catchUp.referenceKey);
            const displayDeltaPct = isActiveCatchUp
              ? ctx.headline.decisionDeltaPct
              : isCatchUpCurrent || isMissedRound ? null : row.deltaPct;
            const displayDelta = isActiveCatchUp
              ? ctx.headline.decisionDelta
              : isCatchUpCurrent || isMissedRound ? null : row.delta;
            const catchUpPill = isCatchUpCurrent
              ? ` <span class="pill pill-catchup">inhaalweek</span>`
              : isMissedRound
                ? ` <span class="pill pill-muted">gemiste ronde</span>`
                : isAdjustedPeriod
                  ? ` <span class="pill pill-catchup">toegerekend</span>`
                  : "";
            if (!row.hasData) {
              return `
              <tr class="row-missing">
                <th scope="row"><strong>${escapeHtml(labelPeriod(type, row.key))}</strong> <span class="pill pill-muted">ontbreekt</span></th>
                <td class="num muted">—</td>
                <td class="num muted">—</td>
                <td class="num muted">—</td>
                <td class="num muted">—</td>
                <td class="bar-col"><span class="missing-bar">geen data</span></td>
              </tr>`;
            }
            return `
            <tr class="${row.key === ctx.key ? "row-selected" : ""} ${row.key === ctx.latestKey ? "row-latest" : ""}" data-period-key="${escapeHtml(row.key)}">
              <th scope="row"><button type="button" class="period-link" data-period-key="${escapeHtml(row.key)}"><strong>${escapeHtml(labelPeriod(type, row.key))}</strong>${row.key === ctx.latestKey ? ` <span class="pill pill-latest">Nieuwste</span>` : ""}${catchUpPill}</button></th>
              <td class="num strong">${formatMoney(row.total)}</td>
              <td class="num">${formatNumber(row.count)}</td>
              <td class="num ${displayDeltaPct === null ? "muted" : costTrendClass(displayDeltaPct)}">${displayDeltaPct === null ? "—" : `${trendArrow(displayDeltaPct)} ${formatSignedPercent(displayDeltaPct, 1)}${isActiveCatchUp ? ` gecorr. vs ${escapeHtml(shortPeriodLabel(type, ctx.catchUp.referenceKey))}` : ""}`}</td>
              <td class="num ${displayDelta === null ? "muted" : costTrendClass(displayDelta)}">${displayDelta === null ? "—" : formatSignedMoney(displayDelta)}</td>
              <td class="bar-col"><span class="cell-bar"><i class="neutral" style="width:${Math.max(2, (row.total / maxTotal) * 100)}%"></i></span></td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      <p class="table-note">${ctx.isOperational ? "Perioden met het label toegerekend bevatten de operationele Retouren-correctie; de werkelijke betaaldatum blijft via Rapportagebasis beschikbaar. " : ""}${ctx.catchUp && ctx.catchUp.referenceKey ? `De inhaalweek gebruikt het gecorrigeerde tweeweeksgemiddelde tegenover ${escapeHtml(labelPeriod(type, ctx.catchUp.referenceKey))}. ` : ""}Een ontbrekende kalenderperiode blijft leeg en verbreekt de vergelijking; deze wordt nooit als nul ingevuld. Klik een rij met data om die ${escapeHtml(PERIOD_TYPES[type].label.toLowerCase())} bovenin te openen.</p>`;
  }

  // Aantallen per herkomst (Klantenservice vs Retouren) over tijd.
  function getHerkomstSeries(type) {
    const search = normalizeKey(state.reasonSearch);
    const recs = analysisSourceRecords().filter(r => !search || normalizeKey(r.reason).includes(search));
    const map = new Map();
    recs.forEach(r => {
      const key = periodKeyForRecord(r, type); if (!key) return;
      const e = map.get(key) || { ksCount: 0, retCount: 0, ksAmt: 0, retAmt: 0 };
      if (r.origin === "Retouren") { e.retCount += r.count; e.retAmt += r.amount; } else { e.ksCount += r.count; e.ksAmt += r.amount; }
      map.set(key, e);
    });
    const availableKeys = Array.from(map.keys()).sort((a, b) => periodSortValue(type, a) - periodSortValue(type, b));
    const keys = completePeriodKeys(type, availableKeys);
    return { keys, rows: keys.map(key => map.get(key) || null), availableKeys };
  }

  // Analyse: dalen of stijgen de retouren t.o.v. klantenservice? Twee lijnen (aantallen).
  // Compact dashboard (geen grafiek): retouren vs klantenservice voor de gekozen
  // periode — aantal en bedrag, met het verschil t.o.v. de vorige periode.
  function renderOriginSplit(ctx) {
    if (!els.originSplit) return;
    const type = ctx.type, periodWord = PERIOD_TYPES[type].label.toLowerCase(), prevWord = PERIOD_TYPES[type].previousLabel;
    const hs = getHerkomstSeries(type);
    if (!hs.keys.length) { els.originSplit.innerHTML = `<div class="empty-state">Geen herkomstdata beschikbaar.</div>`; return; }
    let idx = hs.keys.indexOf(ctx.key);
    if (idx < 0) idx = hs.keys.length - 1;
    const cur = hs.rows[idx];
    const immediatePrev = idx > 0 ? hs.rows[idx - 1] : null;
    const referenceIndex = ctx.catchUp && ctx.catchUp.referenceKey ? hs.keys.indexOf(ctx.catchUp.referenceKey) : idx - 1;
    const reference = referenceIndex >= 0 ? hs.rows[referenceIndex] : null;
    const comparisonCurrent = ctx.catchUp && immediatePrev ? {
      retCount: (cur.retCount + immediatePrev.retCount) / 2,
      ksCount: (cur.ksCount + immediatePrev.ksCount) / 2,
      retAmt: (cur.retAmt + immediatePrev.retAmt) / 2,
      ksAmt: (cur.ksAmt + immediatePrev.ksAmt) / 2,
    } : cur;
    const totCount = cur.retCount + cur.ksCount, totAmt = cur.retAmt + cur.ksAmt;
    const retShare = totCount ? (cur.retCount / totCount) * 100 : 0;
    const retShareAmt = totAmt ? (cur.retAmt / totAmt) * 100 : 0;
    const KS_C = "#3f6f92", RET_C = "#a9781f";
    const referenceText = ctx.catchUp && ctx.catchUp.referenceKey ? shortPeriodLabel(type, ctx.catchUp.referenceKey) : prevWord;
    const dTxt = d => d === null ? "geen referentie" : `${trendArrow(d)} ${d > 0 ? "+" : d < 0 ? "−" : ""}${formatNumber(Math.abs(d))}${ctx.catchUp ? " gecorrigeerd" : ""} vs ${referenceText}`;
    const retCd = reference ? comparisonCurrent.retCount - reference.retCount : null;
    const ksCd = reference ? comparisonCurrent.ksCount - reference.ksCount : null;

    const cards = [
      { swatch: RET_C, value: formatNumber(cur.retCount), label: `Retouren · ${formatMoney(cur.retAmt)}`, sub: dTxt(retCd), delta: retCd },
      { swatch: KS_C, value: formatNumber(cur.ksCount), label: `Klantenservice · ${formatMoney(cur.ksAmt)}`, sub: dTxt(ksCd), delta: ksCd },
      { swatch: RET_C, value: formatPercent(retShare, 0), label: "Aandeel retouren (aantal)", sub: `${formatPercent(retShareAmt, 0)} van het bedrag`, delta: 0, plain: true },
    ];

    const limit = getTrendRangeLimit();
    const viewCount = Math.min(hs.keys.length, Number.isFinite(limit) ? limit : hs.keys.length);
    let start = Math.max(0, hs.keys.length - viewCount);
    if (idx < start) start = Math.max(0, Math.min(idx, hs.keys.length - viewCount));
    const viewKeys = hs.keys.slice(start, start + viewCount);
    const viewRows = hs.rows.slice(start, start + viewCount);
    const chart = (() => {
      const observedRows = viewRows.filter(Boolean);
      if (observedRows.length < 2) return "";
      const width = 1000, height = 286, left = 66, right = 30, top = 26, bottom = 50;
      const cw = width - left - right, ch = height - top - bottom;
      const maxVal = niceCeil(Math.max(1, ...observedRows.map(row => Math.max(row.retCount, row.ksCount))));
      const baseY = top + ch;
      const maxIdx = Math.max(1, viewRows.length - 1);
      const xFor = i => left + (i / maxIdx) * cw;
      const yFor = v => top + ch - (Math.max(0, v) / maxVal) * ch;
      const labelStep = Math.max(1, Math.ceil(viewRows.length / 8));
      const seriesSegments = field => {
        const result = [];
        let current = [];
        viewRows.forEach((row, index) => {
          if (row) current.push(`${xFor(index).toFixed(1)},${yFor(row[field]).toFixed(1)}`);
          else if (current.length) { result.push(current); current = []; }
        });
        if (current.length) result.push(current);
        return result;
      };
      const retLines = seriesSegments("retCount").map(points => `<polyline class="os-line ret" points="${points.join(" ")}" fill="none"></polyline>`).join("");
      const ksLines = seriesSegments("ksCount").map(points => `<polyline class="os-line ks" points="${points.join(" ")}" fill="none"></polyline>`).join("");
      const selectedLocal = idx - start;
      const selectedGuide = selectedLocal >= 0 && selectedLocal < viewRows.length
        ? `<line class="selection-guide" x1="${xFor(selectedLocal).toFixed(1)}" x2="${xFor(selectedLocal).toFixed(1)}" y1="${top}" y2="${baseY.toFixed(1)}"></line>`
        : "";
      const yTicks = [0, .5, 1].map(f => maxVal * f);
      const xLabels = viewKeys.map((key, i) => {
        const isSel = i === selectedLocal;
        const show = i % labelStep === 0 || i === viewKeys.length - 1 || isSel;
        return show ? `<text class="pt-axis ${isSel ? "is-selected" : ""}" x="${xFor(i).toFixed(1)}" y="${height - 20}" text-anchor="middle">${escapeHtml(shortPeriodLabel(type, key))}</text>` : "";
      }).join("");
      const dots = viewRows.map((row, i) => {
        const key = viewKeys[i];
        const isSel = i === selectedLocal;
        const x = xFor(i);
        if (!row) {
          return `<g class="os-point is-missing" aria-label="${escapeHtml(labelPeriod(type, key))}: geen data">
            <line class="missing-slot" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${top + 8}" y2="${baseY.toFixed(1)}"></line>
            <title>${escapeHtml(labelPeriod(type, key))}: ontbrekende periode</title>
          </g>`;
        }
        return `
          <g class="os-point ${isSel ? "is-selected" : ""}" data-period-key="${escapeHtml(key)}" tabindex="0" role="button" aria-label="${escapeHtml(`${labelPeriod(type, key)}: Retouren ${formatNumber(row.retCount)}, Klantenservice ${formatNumber(row.ksCount)}`)}">
            <line class="pt-stem" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${baseY.toFixed(1)}" y2="${yFor(Math.max(row.retCount, row.ksCount)).toFixed(1)}"></line>
            <circle class="os-dot ret ${isSel ? "is-selected" : ""}" cx="${x.toFixed(1)}" cy="${yFor(row.retCount).toFixed(1)}" r="${isSel ? 5 : 3.6}"><title>Retouren ${escapeHtml(labelPeriod(type, key))}: ${formatNumber(row.retCount)}</title></circle>
            <circle class="os-dot ks ${isSel ? "is-selected" : ""}" cx="${x.toFixed(1)}" cy="${yFor(row.ksCount).toFixed(1)}" r="${isSel ? 5 : 3.6}"><title>Klantenservice ${escapeHtml(labelPeriod(type, key))}: ${formatNumber(row.ksCount)}</title></circle>
          </g>`;
      }).join("");
      const lastObservedIndex = viewRows.reduce((last, row, index) => row ? index : last, -1);
      const lastObserved = lastObservedIndex >= 0 ? viewRows[lastObservedIndex] : null;
      return `
        <svg viewBox="0 0 ${width} ${height}" class="trend-svg origin-svg" role="img" aria-labelledby="originTitle originDesc">
          <title id="originTitle">Trend herkomst per ${escapeHtml(periodWord)}</title>
          <desc id="originDesc">${escapeHtml(`Retouren en Klantenservice over ${observedRows.length} waarnemingen binnen ${viewRows.length} kalenderperioden. Geselecteerd: ${labelPeriod(type, hs.keys[idx])}, ${formatNumber(cur.retCount)} retourcredits en ${formatNumber(cur.ksCount)} klantenservicecredits.`)}</desc>
          <defs>
            <linearGradient id="originKs" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#3f6f92"></stop><stop offset="100%" stop-color="#6a97b6"></stop>
            </linearGradient>
            <linearGradient id="originRet" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#a9781f"></stop><stop offset="100%" stop-color="#db5461"></stop>
            </linearGradient>
            <filter id="originGlow" x="-20%" y="-40%" width="140%" height="180%">
              <feGaussianBlur stdDeviation="3.2" result="blur"></feGaussianBlur>
              <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
            </filter>
          </defs>
          <rect class="plot-bg" x="${left}" y="${top}" width="${cw.toFixed(1)}" height="${ch.toFixed(1)}"></rect>
          ${yTicks.map(val => { const y = yFor(val); return `<line class="grid" x1="${left}" x2="${width - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="axis-tick" x="${left - 10}" y="${(y + 4).toFixed(1)}" text-anchor="end">${formatNumber(Math.round(val))}</text>`; }).join("")}
          ${selectedGuide}
          ${retLines}
          ${ksLines}
          ${dots}
          ${xLabels}
          ${lastObserved ? `<text class="os-end ret" x="${xFor(lastObservedIndex).toFixed(1)}" y="${Math.max(top + 12, yFor(lastObserved.retCount) - 8).toFixed(1)}" text-anchor="end">Retouren</text><text class="os-end ks" x="${xFor(lastObservedIndex).toFixed(1)}" y="${Math.min(baseY - 8, yFor(lastObserved.ksCount) + 16).toFixed(1)}" text-anchor="end">Klantenservice</text>` : ""}
        </svg>
        <div class="trend-legend origin-legend">
          <span><i class="lg-line lg-ret"></i>Retouren</span>
          <span><i class="lg-line lg-ks"></i>Klantenservice</span>
          <span><i class="lg-band"></i>Gekozen periode gemarkeerd</span>
        </div>`;
    })();

    els.originSplit.innerHTML = `
      <div class="origin-head"><strong>${escapeHtml(labelPeriod(type, hs.keys[idx]))}</strong><span>${formatNumber(totCount)} creditaties · ${formatMoney(totAmt)} totaal</span></div>
      <div class="trend-stats">${cards.map(c => `<div class="trend-stat os-stat ${!c.plain && c.delta > 0 ? "alert" : ""}"><span class="os-swatch" style="background:${c.swatch}"></span><strong>${escapeHtml(c.value)}</strong><span>${escapeHtml(c.label)}</span><em class="${c.plain ? "" : costTrendClass(c.delta)}">${escapeHtml(c.sub)}</em></div>`).join("")}</div>
      ${chart}
      <div class="split-bar" role="img" aria-label="Verdeling retouren versus klantenservice">
        <div class="split-seg ret" style="flex:${Math.max(retShare, 3)}">${retShare >= 12 ? `<span>Retouren ${formatPercent(retShare, 0)}</span>` : ""}</div>
        <div class="split-seg ks" style="flex:${Math.max(100 - retShare, 3)}">${(100 - retShare) >= 12 ? `<span>Klantenservice ${formatPercent(100 - retShare, 0)}</span>` : ""}</div>
      </div>
      <p class="chart-note">Aantallen en bedragen per herkomst, deze ${escapeHtml(periodWord)} vergeleken met ${escapeHtml(referenceText)}.${ctx.isOperational ? " Retouren volgen de operationele toerekening." : ""}${viewRows.some(row => !row) ? " Ontbrekende perioden zijn als gaten weergegeven." : ""}${ctx.catchUp ? " Verschillen gebruiken het gecorrigeerde tweeweeksgemiddelde." : ""}</p>`;
  }

  function renderIssueList(title, items, emptyText) {
    return `
      <div class="quality-block">
        <h3>${escapeHtml(title)}</h3>
        ${items.length ? `<div class="issue-list">${items.map(item => `
          <div class="issue-row"><strong>Rij ${formatNumber(item.rowNumber)}</strong><span>${escapeHtml(item.issue)}</span></div>
        `).join("")}</div>` : `<p>${escapeHtml(emptyText)}</p>`}
      </div>`;
  }

  function renderUnknownReasons(quality) {
    const entries = Array.from(quality.unknownReasons.entries())
      .map(([reason, value]) => ({ reason, count: typeof value === "number" ? value : value.count, suggestion: typeof value === "number" ? "" : value.suggestion }))
      .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
    return `
      <div class="quality-block">
        <h3>Onbekende redenen</h3>
        ${entries.length ? `<div class="unknown-list">${entries.map(entry => `
          <div class="unknown-row"><strong>${escapeHtml(entry.reason)}</strong><span>${formatNumber(entry.count)}×${entry.suggestion ? ` · suggestie: ${escapeHtml(entry.suggestion)}` : ""}</span></div>
        `).join("")}</div>` : `<p>Alle redenen vallen binnen de legenda of bekende correcties.</p>`}
      </div>`;
  }

  function renderQualityDetails() {
    if (!els.qualityDetails) return;
    const quality = state.quality;
    if (!quality) {
      els.qualityDetails.innerHTML = state.records.length
        ? `<div class="quality-block"><h3>Geen nieuwe importmeldingen</h3><p>Er staat wel analysehistorie klaar. Importeer een vrijdagbestand om de controlelijst te vullen.</p></div>`
        : `<div class="empty-state">Importeer een Excelbestand om de controlelijst te vullen.</div>`;
      return;
    }
    const unknownCount = Array.from(quality.unknownReasons.values()).reduce((sum, item) => sum + (typeof item === "number" ? item : item.count), 0);
    const stats = [
      { label: "Regels verwerkt", value: quality.parsedRows || 0, tone: "" },
      { label: "Analyseblokken", value: quality.storedRecords || 0, tone: "" },
      { label: "Hard overgeslagen", value: quality.skippedRows || 0, tone: quality.skippedRows ? "danger" : "" },
      { label: "Bedrag ontbreekt", value: quality.missingAmount || 0, tone: quality.missingAmount ? "danger" : "" },
      { label: "Datum uit buurregel", value: quality.recoveredNeighborDateRows || 0, tone: "" },
      { label: "Week/jaar uit buurregel", value: quality.recoveredNeighborWeekYearRows || 0, tone: "" },
      { label: "Datum uit week/jaar", value: quality.recoveredWeekYearRows || 0, tone: "" },
      { label: "Jaar gecorrigeerd", value: quality.correctedYearRows || 0, tone: "" },
      { label: "Reden naar Overige", value: quality.fallbackReasonRows || 0, tone: "" },
      { label: "Reden opgeschoond", value: quality.normalizedReasonRows || 0, tone: "" },
      { label: "Herkomst uit buurregel", value: quality.recoveredOriginRows || 0, tone: "" },
      { label: "Onbekende redenen", value: unknownCount, tone: unknownCount ? "warning" : "" },
      { label: "Herkomst onbekend", value: quality.missingOrigin || 0, tone: quality.missingOrigin ? "warning" : "" },
      { label: "Mogelijk dubbel", value: quality.possibleDuplicateRows || 0, tone: quality.possibleDuplicateRows ? "warning" : "" },
      { label: "Negatief bedrag", value: quality.negativeAmountRows || 0, tone: quality.negativeAmountRows ? "warning" : "" },
    ];
    els.qualityDetails.innerHTML = `
      <div class="quality-block">
        <h3>Importbeslissingen</h3>
        <div class="quality-matrix">${stats.map(stat => `
          <div class="quality-cell ${stat.tone}"><strong>${formatNumber(stat.value)}</strong><span>${escapeHtml(stat.label)}</span></div>
        `).join("")}</div>
      </div>
      ${renderIssueList("Overgeslagen regels", quality.skippedSamples || [], "Geen harde fouten gevonden.")}
      ${renderIssueList("Hersteld of waarschuwing", quality.warningSamples || [], "Geen herstelacties of waarschuwingen gevonden.")}
      ${renderUnknownReasons(quality)}`;
  }

  function setChrome() {
    const hasData = state.records.length > 0;
    els.app.classList.toggle("has-data", hasData);
    els.exportCsv.hidden = !hasData;
    els.clearHistory.hidden = !hasData;
    els.downloadReport.hidden = !hasData;
    if (els.downloadImage) els.downloadImage.hidden = !hasData;
  }

  function renderDashboard() {
    if (!IS_BROWSER) return;
    renderContextStrip();
    renderImportBanner();
    renderQualityDetails();
    setChrome();
    if (!state.records.length && !state.quality) {
      els.controlBar.hidden = true;
      if (els.basisBar) els.basisBar.hidden = true;
      els.dashboard.hidden = true;
      return;
    }
    if (!state.records.length) state.activeTab = "control";
    els.controlBar.hidden = !state.records.length;
    els.dashboard.hidden = false;
    renderTabs();
    if (!state.records.length) {
      if (els.basisBar) els.basisBar.hidden = true;
      return;
    }
    renderControls();
    renderBasisBar();
    renderAdjustmentPanel();
    const ctx = getDashboardContext();
    renderHero(ctx);
    renderFocusRow(ctx);
    renderGroupBreakdown(ctx);
    renderSignals(ctx);
    renderDecisionAnalysis(ctx);
    renderCompareTable(ctx);
    renderTrendChart(ctx);
    renderOriginSplit(ctx);
    renderPeriodTotals(ctx);
  }

  // ---------------------------------------------------------------------------
  // CSV export
  // ---------------------------------------------------------------------------
  function toCsvValue(value) { return `"${String(value ?? "").replace(/"/g, '""')}"`; }

  function exportCurrentCsv() {
    if (!state.records.length) return;
    const ctx = getDashboardContext();
    const rows = ctx.comparison
      .filter(row => row.currentAmount > 0 || row.previousAmount > 0)
      .sort((a, b) => b.currentAmount - a.currentAmount)
      .map(row => {
        const actual = ctx.actualCurrent.reasons.get(row.reason) || { amount: 0, count: 0 };
        return {
          periode: labelPeriod(ctx.type, ctx.key),
          vergelijkingsperiode: ctx.comparisonPreviousKey ? labelPeriod(ctx.type, ctx.comparisonPreviousKey) : "",
          vergelijkingsbasis: ctx.isOperational ? "operationeel toegerekend" : ctx.catchUp ? "gecorrigeerd tweeweeksgemiddelde" : "werkelijke periode",
          reden: row.reason,
          groep: (GROUP_BY_KEY.get(row.groupKey) || {}).short || "Overig",
          werkelijk_uitbetaald: actual.amount.toFixed(2),
          bedrag_rapportagebasis: row.currentAmount.toFixed(2),
          toerekeningscorrectie: (row.currentAmount - actual.amount).toFixed(2),
          toerekeningsmethode: ctx.isOperational && Math.abs(row.currentAmount - actual.amount) >= 0.01 ? "proportioneel binnen Retouren" : "",
          beoordelingsbedrag: row.comparisonCurrentAmount.toFixed(2),
          aantal_rapportagebasis: row.currentCount,
          pct_van_totaal: row.currentShare.toFixed(2),
          vorig_pct_van_totaal: row.previousShare.toFixed(2),
          verschil_pct_punt: row.shareDelta.toFixed(2),
          verschil_bedrag: row.amountDelta.toFixed(2),
        };
      });
    rows.push({
      periode: labelPeriod(ctx.type, ctx.key),
      vergelijkingsperiode: ctx.comparisonPreviousKey ? labelPeriod(ctx.type, ctx.comparisonPreviousKey) : "",
      vergelijkingsbasis: ctx.isOperational ? "operationeel toegerekend" : ctx.catchUp ? "gecorrigeerd tweeweeksgemiddelde" : "werkelijke periode",
      reden: "EINDTOTAAL", groep: "",
      werkelijk_uitbetaald: ctx.actualCurrent.total.toFixed(2),
      bedrag_rapportagebasis: ctx.current.total.toFixed(2),
      toerekeningscorrectie: (ctx.current.total - ctx.actualCurrent.total).toFixed(2),
      toerekeningsmethode: ctx.isOperational && ctx.adjustmentImpact.adjustments.length ? "Retourenbatch; bronbetalingen ongewijzigd" : "",
      beoordelingsbedrag: ctx.analysisCurrent.total.toFixed(2),
      aantal_rapportagebasis: ctx.current.count,
      pct_van_totaal: "100.00", vorig_pct_van_totaal: ctx.comparisonPrevious.total ? "100.00" : "",
      verschil_pct_punt: "", verschil_bedrag: ctx.headline.decisionDelta.toFixed(2),
    });
    const headers = Object.keys(rows[0]);
    const csv = "﻿" + [headers.map(toCsvValue).join(";"), ...rows.map(row => headers.map(header => toCsvValue(row[header])).join(";"))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `credit-analyse-${ctx.type}-${(ctx.key || "export").replace(/[^\w-]/g, "-")}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------------------------------------------------------------------
  // Import handling
  // ---------------------------------------------------------------------------
  async function handleFile(file) {
    if (!file) return;
    if (!window.XLSX) throw new Error("Excel-parser kon niet laden.");
    const fileName = file.name || "";
    if (!/\.(xlsx|xls|csv)$/i.test(fileName)) throw new Error("Kies een Excel- of CSV-bestand (.xlsx, .xls of .csv).");
    if (!file.size) throw new Error("Dit bestand is leeg. Kies het vrijdagbestand met creditregels.");
    if (file.size > 25 * 1024 * 1024) throw new Error("Dit bestand is groter dan 25 MB. Maak eerst een export met alleen de creditregels.");
    els.dropZone.classList.remove("is-dragging");
    els.dropZone.querySelector("strong").textContent = "Bestand verwerken…";
    const buffer = await file.arrayBuffer();
    let workbook;
    try { workbook = window.XLSX.read(buffer, { type: "array", cellDates: true }); }
    catch { throw new Error("Het bestand kon niet gelezen worden. Controleer of het een geldig Excel- of CSV-bestand is."); }
    const parsed = parseWorkbookRecords(workbook, file.name);
    state.records = mergeImportedRecords(state.records, parsed.records);
    state.adjustments = validAdjustmentsForRecords(state.records, state.adjustments);
    state.reasonList = parsed.reasonList;
    state.meta = parsed.meta;
    state.quality = parsed.quality;
    state.periodType = "week";
    state.selectedKey = "";
    state.selectedTrendKey = "";
    state.origin = "all";
    state.reasonSearch = "";
    state.selectedGroupFilter = "";
    state.importBannerDismissed = false;
    state.activeTab = "overview";
    saveRecords(state.records, state.meta);
    saveAdjustments(state.adjustments);
    els.dropZone.querySelector("strong").textContent = file.name;
    els.dropZone.querySelector("span").textContent = `${formatNumber(parsed.quality.parsedRows)} regels verwerkt · ${formatNumber(parsed.quality.storedRecords)} blokken opgeslagen. Klaar — bekijk het overzicht hieronder.`;
    renderDashboard();
  }

  function clearHistory() {
    if (!state.records.length) return;
    if (!window.confirm("Alle lokaal bewaarde creditanalyse wissen?")) return;
    state.records = []; state.meta = null; state.quality = null; state.adjustments = [];
    state.analysisBasis = "operational";
    state.selectedKey = ""; state.selectedTrendKey = ""; state.activeTab = "overview"; state.selectedGroupFilter = "";
    if (HAS_STORAGE) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(META_KEY); localStorage.removeItem(ACTIVE_KEY); localStorage.removeItem(ADJUSTMENT_KEY); }
    els.dropZone.querySelector("strong").textContent = "Zet hier het vrijdagbestand neer";
    els.dropZone.querySelector("span").textContent = "Sleep het Excel-bestand hierheen of kies het. De app bewaart alleen geaggregeerde cijfers — geen klantnamen of ordernummers.";
    renderDashboard();
  }

  // Registreert gebruik (throttled) zodat de analyse niet wordt gewist zolang
  // iemand actief bezig is.
  let lastTouchWrite = 0;
  function touchActivity() {
    if (!HAS_STORAGE || !state.records.length) return;
    const now = Date.now();
    if (now - lastTouchWrite < 20000) return;
    lastTouchWrite = now;
    try { localStorage.setItem(ACTIVE_KEY, String(now)); } catch { /* opslag niet beschikbaar */ }
  }

  // Wist de analyse automatisch na RETENTION_MS zonder gebruik (privacy).
  function autoWipe() {
    if (!state.records.length) return;
    state.records = []; state.meta = null; state.quality = null; state.adjustments = [];
    state.analysisBasis = "operational";
    state.selectedKey = ""; state.selectedTrendKey = ""; state.selectedGroupFilter = ""; state.activeTab = "overview";
    if (HAS_STORAGE) { try { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(META_KEY); localStorage.removeItem(ACTIVE_KEY); localStorage.removeItem(ADJUSTMENT_KEY); } catch { /* noop */ } }
    if (els.dropZone) {
      els.dropZone.querySelector("strong").textContent = "Analyse automatisch gewist";
      els.dropZone.querySelector("span").textContent = `Na ${RETENTION_LABEL} zonder gebruik is de analyse voor de privacy gewist. Importeer het vrijdagbestand opnieuw om verder te gaan.`;
    }
    renderDashboard();
  }

  function checkExpiry() {
    if (!HAS_STORAGE || !state.records.length) return;
    const activeAt = Number(localStorage.getItem(ACTIVE_KEY) || 0);
    if (retentionExpired(activeAt, Date.now())) autoWipe();
  }

  function showError(error) {
    if (!els.dropZone) return;
    els.dropZone.classList.remove("is-dragging");
    els.contextStrip.hidden = false;
    els.contextStrip.innerHTML = `
      <div class="context-item context-error" role="alert">
        <strong>Import mislukt</strong>
        <span>${escapeHtml(error.message || error)}</span>
        <span>Controleer minimaal de kolommen Bedrag en Reden, plus Datum of Weeknummer/Jaar.</span>
      </div>`;
    els.dropZone.querySelector("strong").textContent = "Zet hier het vrijdagbestand neer";
    els.dropZone.querySelector("span").textContent = "Import kon niet worden verwerkt. Pas het bestand aan en probeer opnieuw.";
  }

  function selectPeriodKey(key) {
    if (!key) return;
    state.selectedKey = key;
    renderDashboard();
  }

  function getClosestTarget(event, selector) {
    return event.target && event.target.closest ? event.target.closest(selector) : null;
  }

  // ---------------------------------------------------------------------------
  // PDF report — volgt het gekozen periodetype en de herkomstfilter.
  // ---------------------------------------------------------------------------
  function generateReportPdf(ctx) {
    const lib = window.jspdf;
    if (!lib || !lib.jsPDF) { window.alert("De PDF-bibliotheek kon niet laden. Ververs de pagina en probeer opnieuw."); return; }
    const doc = new lib.jsPDF({ unit: "mm", format: "a4" });
    const M = 14, PAGE_W = 210, PAGE_H = 297, RIGHT = PAGE_W - M, CW = RIGHT - M;
    const INK = [24, 24, 22], MUT = [137, 135, 129], BAD = [178, 58, 71], GOOD = [0, 99, 0], LINE = [225, 224, 217], DATA = [62, 111, 147];
    const toneFill = { up: [251, 234, 236], down: [238, 243, 241], flat: [241, 240, 236] };
    const toneText = { up: [178, 58, 71], down: [0, 99, 0], flat: [110, 110, 106] };
    let y = M;
    const set = rgb => doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const font = (style, size) => { doc.setFont("helvetica", style); doc.setFontSize(size); };
    const ensure = space => { if (y + space > PAGE_H - M) { doc.addPage(); y = M; } };
    const costColor = value => (value > 0.5 ? BAD : value < -0.5 ? GOOD : MUT);

    const periodLabel = labelPeriod(ctx.type, ctx.key);
    const previousLabel = ctx.comparisonPreviousKey ? labelPeriod(ctx.type, ctx.comparisonPreviousKey) : `geen vergelijkbare ${PERIOD_TYPES[ctx.type].label.toLowerCase()}`;
    const h = ctx.headline;
    const avgPerCredit = ctx.current.count ? ctx.current.total / ctx.current.count : 0;
    const countDelta = ctx.catchUp ? h.decisionCountDelta : ctx.current.count - ctx.previous.count;
    const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP) || { amount: 0, share: 0, amountDelta: 0 };
    const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    const originText = state.origin === "all" ? "alle herkomsten" : state.origin;

    // Header
    font("bold", 19); set(INK); doc.text("Credit Analyse", M, y + 4);
    font("bold", 15); set(BAD); doc.text("ReMarkt", RIGHT, y + 4, { align: "right" });
    y += 9;
    font("normal", 10); set(MUT);
    doc.text(`${PERIOD_TYPES[ctx.type].label}rapport · ${periodLabel} vs ${previousLabel} · ${originText}${ctx.isOperational ? " · operationeel toegerekend" : ""}`, M, y); y += 4.5;
    doc.text(`Opgesteld ${today}`, M, y); y += 3;
    doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(0.5); doc.line(M, y, RIGHT, y); y += 7;

    // Verdict band
    const vFill = toneFill[h.tone] || toneFill.flat, vText = toneText[h.tone] || toneText.flat;
    doc.setFillColor(vFill[0], vFill[1], vFill[2]); doc.roundedRect(M, y, CW, 17, 2, 2, "F");
    font("bold", 13); set(vText); doc.text(h.title, M + 5, y + 7);
    font("normal", 9.5); set(INK);
    const verdictSub = ctx.catchUp && h.decisionHasPrevious
      ? `${formatSignedPercent(h.decisionDeltaPct, 0)} gecorrigeerd t.o.v. ${previousLabel} — die was ${formatMoney(ctx.comparisonPrevious.total)}`
      : h.hasPrevious
        ? `${formatSignedPercent(h.totalDeltaPct, 0)} t.o.v. ${previousLabel} — die was ${formatMoney(ctx.previous.total)}`
        : "Nog geen vorige periode om mee te vergelijken.";
    doc.text(verdictSub, M + 5, y + 13);
    y += 23;

    if (ctx.catchUp) {
      doc.setFillColor(247, 238, 216);
      doc.roundedRect(M, y, CW, 18, 2, 2, "F");
      font("bold", 10); set([137, 93, 24]);
      doc.text("Administratieve inhaalweek", M + 5, y + 6.5);
      font("normal", 8.5); set(INK);
      const catchUpLine = `${labelPeriod("week", ctx.catchUp.previousKey)} (${formatMoney(ctx.catchUp.previousTotal)}) + ${labelPeriod("week", ctx.catchUp.currentKey)} (${formatMoney(ctx.catchUp.currentTotal)}) samen: ${formatMoney(ctx.catchUp.combinedTotal)}. Gecorrigeerd oordeel: ${formatMoney(ctx.catchUp.normalizedWeekly)} per week${ctx.catchUp.referenceKey ? ` versus ${previousLabel}` : ""}.`;
      doc.text(doc.splitTextToSize(catchUpLine, CW - 10), M + 5, y + 12.5);
      y += 24;
    }

    if (ctx.isOperational && ctx.adjustmentImpact.adjustments.length) {
      const line = `Werkelijk betaald: ${formatMoney(ctx.actualCurrent.total)}. Operationeel rapportagebedrag: ${formatMoney(ctx.current.total)}. Correctie in deze periode: ${formatSignedMoney(ctx.adjustmentImpact.operationalNet)}. Bronbetalingen zijn niet gewijzigd; redenmix en aantallen binnen Retouren zijn proportioneel verdeeld.`;
      const adjustmentLines = doc.splitTextToSize(line, CW - 10);
      const adjustmentBoxHeight = Math.max(18, 10 + adjustmentLines.length * 3.8);
      doc.setFillColor(247, 238, 216);
      doc.roundedRect(M, y, CW, adjustmentBoxHeight, 2, 2, "F");
      font("bold", 10); set([137, 93, 24]);
      doc.text("Retouren-toerekening actief", M + 5, y + 6.5);
      font("normal", 8.5); set(INK);
      doc.text(adjustmentLines, M + 5, y + 12.5);
      y += adjustmentBoxHeight + 6;
    }

    // KPI cards
    const kpis = ctx.isOperational ? [
      { label: "Operationeel toegerekend", value: formatMoney(ctx.current.total), sub: h.decisionHasPrevious ? `${formatSignedPercent(h.totalDeltaPct, 0)} vs referentie` : "geen referentie", color: costColor(h.totalDeltaPct) },
      { label: "Werkelijk betaald", value: formatMoney(ctx.actualCurrent.total), sub: "aansluiting Finance", color: MUT },
      { label: "Aantal credits · operationeel", value: formatNumber(ctx.current.count), sub: `${countDelta > 0 ? "+" : countDelta < 0 ? "-" : ""}${formatNumber(Math.abs(countDelta))} vs referentie`, color: costColor(countDelta) },
      { label: "Voorkombaar (onze fout)", value: formatMoney(preventable.amount), sub: `${formatPercent(preventable.share, 0)} van totaal`, color: preventable.share >= 25 ? BAD : MUT },
    ] : [
      { label: "Totaal teruggestort", value: formatMoney(ctx.current.total), sub: h.decisionHasPrevious ? `${formatSignedPercent(ctx.catchUp ? h.decisionDeltaPct : h.totalDeltaPct, 0)}${ctx.catchUp ? " gecorr." : ""} vs referentie` : "geen referentie", color: costColor(ctx.catchUp ? h.decisionDeltaPct : h.totalDeltaPct) },
      { label: "Aantal credits", value: formatNumber(ctx.current.count), sub: `${countDelta > 0 ? "+" : countDelta < 0 ? "-" : ""}${formatNumber(Math.abs(countDelta))}${ctx.catchUp ? " gecorr." : ""} vs referentie`, color: costColor(countDelta) },
      { label: "Gemiddeld per credit", value: formatMoney(avgPerCredit), sub: "terugbetaling", color: MUT },
      { label: "Voorkombaar (onze fout)", value: formatMoney(preventable.amount), sub: `${formatPercent(preventable.share, 0)} van totaal`, color: preventable.share >= 25 ? BAD : MUT },
    ];
    const gap = 4, bw = (CW - gap * 3) / 4;
    kpis.forEach((k, i) => {
      const x = M + i * (bw + gap);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3); doc.roundedRect(x, y, bw, 21, 2, 2);
      font("normal", 7.5); set(MUT); doc.text(doc.splitTextToSize(k.label, bw - 6), x + 3, y + 5);
      font("bold", 13); set(INK); doc.text(k.value, x + 3, y + 13);
      font("normal", 7.5); set(k.color); doc.text(doc.splitTextToSize(k.sub, bw - 6), x + 3, y + 18);
    });
    y += 28;

    const sectionTitle = title => {
      ensure(14); font("bold", 11.5); set(INK); doc.text(title, M, y); y += 2.5;
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3); doc.line(M, y, RIGHT, y); y += 5;
    };
    const cols = cells => {
      ensure(6);
      cells.forEach(c => { font(c.bold ? "bold" : "normal", c.size || 9); set(c.color || INK); doc.text(String(c.text), c.x, y, { align: c.align || "left", maxWidth: c.maxWidth }); });
      y += 5.2;
    };

    // Focus reasons
    sectionTitle("Focus — % van totaal");
    cols([
      { text: "Reden", x: M, bold: true, color: MUT, size: 8 },
      { text: "Bedrag", x: 96, align: "right", bold: true, color: MUT, size: 8 },
      { text: "% totaal", x: 130, align: "right", bold: true, color: MUT, size: 8 },
      { text: "vorige %", x: 162, align: "right", bold: true, color: MUT, size: 8 },
      { text: "Δ %-punt", x: RIGHT, align: "right", bold: true, color: MUT, size: 8 },
    ]);
    ctx.focus.forEach(row => {
      cols([
        { text: row.reason, x: M, maxWidth: 78 },
        { text: formatMoney(row.currentAmount), x: 96, align: "right" },
        { text: formatPercent(row.currentShare, 1), x: 130, align: "right", bold: true },
        { text: row.previousAmount ? formatPercent(row.previousShare, 1) : "—", x: 162, align: "right", color: MUT },
        { text: formatSignedPercent(row.shareDelta, 1), x: RIGHT, align: "right", color: costColor(row.shareDelta) },
      ]);
    });
    y += 3;

    // Pareto and absolute change drivers
    const pareto = buildParetoRows(ctx, 7);
    const drivers = buildChangeDrivers(ctx, 6);
    sectionTitle("Kostendrijvers — Pareto en verandering");
    font("normal", 8); set(MUT);
    const paretoNote = doc.splitTextToSize(`${pareto.countToEighty} van ${pareto.totalReasons} redenen vormen samen minstens 80% van het rapportagebedrag. % totaal is creditmix, geen retourpercentage van alle verkopen.`, CW);
    doc.text(paretoNote, M, y);
    y += paretoNote.length * 3.5 + 3;
    cols([
      { text: "Pareto op rapportagebedrag", x: M, bold: true, color: MUT, size: 8 },
      { text: "Bedrag", x: 126, align: "right", bold: true, color: MUT, size: 8 },
      { text: "% totaal", x: 158, align: "right", bold: true, color: MUT, size: 8 },
      { text: "cumulatief", x: RIGHT, align: "right", bold: true, color: MUT, size: 8 },
    ]);
    pareto.rows.forEach(row => {
      cols([
        { text: row.reason, x: M, maxWidth: 92, size: 8.5 },
        { text: formatMoney(row.amount), x: 126, align: "right", size: 8.5 },
        { text: formatPercent(row.share, 1), x: 158, align: "right", size: 8.5 },
        { text: formatPercent(row.cumulative, 0), x: RIGHT, align: "right", color: row.cumulative >= 80 ? BAD : MUT, size: 8.5 },
      ]);
    });
    y += 2;
    cols([
      { text: "Grootste bijdragen aan het verschil", x: M, bold: true, color: MUT, size: 8 },
      { text: h.decisionHasPrevious ? formatSignedMoney(drivers.totalDelta) : "geen referentie", x: RIGHT, align: "right", bold: true, color: h.decisionHasPrevious ? costColor(drivers.totalDelta) : MUT, size: 8 },
    ]);
    drivers.rows.forEach(row => {
      cols([
        { text: row.reason, x: M, maxWidth: 130, size: 8.5 },
        { text: formatSignedMoney(row.amountDelta), x: RIGHT, align: "right", color: costColor(row.amountDelta), size: 8.5, bold: true },
      ]);
    });
    if (!drivers.rows.length) {
      cols([{
        text: h.decisionHasPrevious
          ? "Geen materiele verandering per reden."
          : "Nog geen vergelijkbare vorige periode.",
        x: M,
        color: MUT,
        size: 8.5,
      }]);
    }
    y += 4;

    // Compare table
    const compareRows = ctx.comparison.filter(r => r.currentAmount > 0 || r.previousAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount).slice(0, 18);
    sectionTitle(`Alle redenen — ${periodLabel} vs ${previousLabel}`);
    cols([
      { text: "Reden", x: M, bold: true, color: MUT, size: 8 },
      { text: "Bedrag", x: 92, align: "right", bold: true, color: MUT, size: 8 },
      { text: "% tot", x: 118, align: "right", bold: true, color: MUT, size: 8 },
      { text: "vorige %", x: 146, align: "right", bold: true, color: MUT, size: 8 },
      { text: "Δ %-pnt", x: 172, align: "right", bold: true, color: MUT, size: 8 },
      { text: "Δ bedrag", x: RIGHT, align: "right", bold: true, color: MUT, size: 8 },
    ]);
    compareRows.forEach(r => {
      cols([
        { text: r.reason, x: M, maxWidth: 74, size: 8.5, color: r.isFocus ? BAD : INK, bold: r.isFocus },
        { text: formatMoney(r.currentAmount), x: 92, align: "right", size: 8.5 },
        { text: formatPercent(r.currentShare, 1), x: 118, align: "right", size: 8.5 },
        { text: r.previousAmount ? formatPercent(r.previousShare, 1) : "—", x: 146, align: "right", color: MUT, size: 8.5 },
        { text: h.decisionHasPrevious && r.previousAmount === 0 && r.comparisonCurrentAmount > 0 ? "nieuw" : formatSignedPercent(r.shareDelta, 1), x: 172, align: "right", color: costColor(r.shareDelta), size: 8.5 },
        { text: r.previousAmount || r.currentAmount ? formatSignedMoney(r.amountDelta) : "—", x: RIGHT, align: "right", color: costColor(r.amountDelta), size: 8.5 },
      ]);
    });
    ensure(6);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3); doc.line(M, y - 1, RIGHT, y - 1);
    cols([
      { text: "Eindtotaal", x: M, bold: true },
      { text: formatMoney(ctx.current.total), x: 92, align: "right", bold: true },
      { text: "100%", x: 118, align: "right", bold: true },
      { text: ctx.comparisonPrevious.total ? "100%" : "—", x: 146, align: "right", color: MUT },
      { text: "—", x: 172, align: "right", bold: true, color: MUT },
      { text: h.decisionHasPrevious ? formatSignedMoney(h.decisionDelta) : "—", x: RIGHT, align: "right", bold: true, color: costColor(h.decisionDelta) },
    ]);
    y += 4;

    // Per group
    sectionTitle("Per groep");
    cols([
      { text: "Groep", x: M, bold: true, color: MUT, size: 8 },
      { text: "Bedrag", x: 116, align: "right", bold: true, color: MUT, size: 8 },
      { text: "% totaal", x: 150, align: "right", bold: true, color: MUT, size: 8 },
      { text: "Δ bedrag", x: RIGHT, align: "right", bold: true, color: MUT, size: 8 },
    ]);
    ctx.groupComparison.slice().sort((a, b) => b.amount - a.amount).forEach(g => {
      cols([
        { text: g.label, x: M, maxWidth: 95, color: g.key === PREVENTABLE_GROUP ? BAD : INK },
        { text: formatMoney(g.amount), x: 116, align: "right" },
        { text: formatPercent(g.share, 1), x: 150, align: "right" },
        { text: g.previousAmount || g.amount ? formatSignedMoney(g.amountDelta) : "—", x: RIGHT, align: "right", color: costColor(g.amountDelta) },
      ]);
    });
    y += 4;

    // Trend chart
    const completeTrendKeys = completePeriodKeys(ctx.type, ctx.periodStats.keys);
    const trendKeys = completeTrendKeys.slice(-Math.min(12, PERIOD_TYPES[ctx.type].pickLimit));
    const trendTotals = trendKeys.map(key => {
      const index = ctx.periodStats.keys.indexOf(key);
      return index >= 0 ? ctx.periodStats.totals[index] : null;
    });
    const finiteTrendTotals = trendTotals.filter(Number.isFinite);
    if (finiteTrendTotals.length) {
      sectionTitle(`Verloop laatste ${trendKeys.length} ${PERIOD_TYPES[ctx.type].plural}`);
      const chartX = M, chartY = y, chartW = CW, chartH = 32;
      const chartMax = Math.max(...finiteTrendTotals, ctx.processControl.available ? ctx.processControl.ucl : 0, 1);
      const barGap = 3, barW = (chartW - barGap * (trendKeys.length - 1)) / trendKeys.length;
      const avgY = chartY + chartH - ((ctx.processControl.center / chartMax) * chartH);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.2); doc.roundedRect(chartX, chartY, chartW, chartH, 1.5, 1.5);
      doc.setDrawColor(DATA[0], DATA[1], DATA[2]); doc.setLineWidth(0.4); doc.setLineDashPattern([2, 2], 0);
      doc.line(chartX + 2, avgY, chartX + chartW - 2, avgY); doc.setLineDashPattern([], 0);
      if (ctx.processControl.available) {
        const uclY = chartY + chartH - ((ctx.processControl.ucl / chartMax) * chartH);
        const lclY = chartY + chartH - ((ctx.processControl.lcl / chartMax) * chartH);
        doc.setDrawColor(BAD[0], BAD[1], BAD[2]); doc.setLineDashPattern([1, 2], 0);
        doc.line(chartX + 2, uclY, chartX + chartW - 2, uclY);
        doc.setDrawColor(GOOD[0], GOOD[1], GOOD[2]);
        doc.line(chartX + 2, lclY, chartX + chartW - 2, lclY);
        doc.setLineDashPattern([], 0);
      }
      trendKeys.forEach((key, index) => {
        const x = chartX + index * (barW + barGap);
        const value = trendTotals[index];
        const isCurrent = key === ctx.key;
        if (Number.isFinite(value)) {
          const barH = Math.max(1.5, (value / chartMax) * (chartH - 7));
          const fill = isCurrent ? BAD : DATA;
          doc.setFillColor(fill[0], fill[1], fill[2]);
          doc.roundedRect(x + 1, chartY + chartH - barH - 5, Math.max(1, barW - 2), barH, 0.8, 0.8, "F");
        } else {
          doc.setDrawColor(MUT[0], MUT[1], MUT[2]); doc.setLineDashPattern([1, 1], 0);
          doc.line(x + (barW / 2), chartY + 4, x + (barW / 2), chartY + chartH - 5);
          doc.setLineDashPattern([], 0);
        }
        font(isCurrent ? "bold" : "normal", 7); set(isCurrent ? BAD : MUT);
        doc.text(shortPeriodLabel(ctx.type, key), x + (barW / 2), chartY + chartH - 1.5, { align: "center" });
      });
      font("normal", 7.5); set(MUT);
      doc.text(ctx.processControl.available
        ? `Proceslijn ${formatMoney(ctx.processControl.center)} · I-MR ${formatMoney(ctx.processControl.lcl)} tot ${formatMoney(ctx.processControl.ucl)}`
        : `Gemiddeld ${formatMoney(ctx.processControl.center)} · I-MR start bij 20 meetpunten (${ctx.processControl.n}/20)`, chartX, chartY + chartH + 5);
      y += chartH + 12;
    }

    // Signals
    const signals = ctx.signals.length ? ctx.signals : [{ title: "Geen bijzonderheden", detail: "Geen stijgende voorkombare fouten of nieuwe redenen deze periode." }];
    sectionTitle("Belangrijkste signalen");
    signals.forEach(s => {
      ensure(7); font("bold", 9.5); set(INK); doc.text(`• ${s.title}`, M, y); y += 4.4;
      font("normal", 9); set(MUT); const lines = doc.splitTextToSize(s.detail, CW - 4); doc.text(lines, M + 4, y); y += lines.length * 4.2 + 2;
    });

    // Footer
    const pages = doc.getNumberOfPages();
    for (let p = 1; p <= pages; p += 1) {
      doc.setPage(p); font("normal", 7.5); set(MUT);
      doc.text("ReMarkt Credit Analyse · uit geaggregeerde cijfers, zonder klantnamen of ordernummers.", M, PAGE_H - 8);
      doc.text(`${p}/${pages}`, RIGHT, PAGE_H - 8, { align: "right" });
    }
    doc.save(`ReMarkt-creditrapport-${ctx.type}-${String(ctx.key || "rapport").replace(/[^\w-]/g, "-")}.pdf`);
  }

  function openReport() {
    if (!state.records.length) return;
    generateReportPdf(getDashboardContext());
  }

  // ---------------------------------------------------------------------------
  // Afbeelding (PNG) voor Wout — op maat getekend, zonder externe bibliotheek.
  // ---------------------------------------------------------------------------
  function generateReportImage(ctx, opts = {}) {
    const INK = "#1b1a17", MUT = "#6a695f", FAINT = "#9a988d", BRAND = "#db5461";
    const UP = "#b4313f", DOWN = "#1f7a43", LINE = "#e9e7df", LINE2 = "#dcd9cf", SUNKEN = "#faf9f6";
    const costColor = v => (v > 0.05 ? UP : v < -0.05 ? DOWN : FAINT);
    const groupColor = key => GROUP_COLORS[key] || "#c0d0dd";
    const W = 1080, P = 44, RIGHT = W - P, CW = W - 2 * P, scale = 2, rowH = 30;

    const canvas = document.createElement("canvas");
    const c = canvas.getContext("2d");
    const setFont = (weight, size) => { c.font = `${weight} ${size}px "Segoe UI Variable Display", "Segoe UI", system-ui, Arial, sans-serif`; };
    const truncate = (s, maxW) => {
      let t = String(s);
      if (c.measureText(t).width <= maxW) return t;
      while (t.length > 1 && c.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
      return `${t}…`;
    };
    const wrap = (s, maxW) => {
      const words = String(s).split(" ");
      const lines = [];
      let cur = "";
      words.forEach(word => {
        const test = cur ? `${cur} ${word}` : word;
        if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = word; } else cur = test;
      });
      if (cur) lines.push(cur);
      return lines;
    };
    const rrect = (x, y, w, h, r) => {
      c.beginPath();
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
    };

    const h = ctx.headline;
    const periodLabel = labelPeriod(ctx.type, ctx.key);
    const previousLabel = ctx.comparisonPreviousKey ? labelPeriod(ctx.type, ctx.comparisonPreviousKey) : `geen vergelijkbare ${PERIOD_TYPES[ctx.type].label.toLowerCase()}`;
    const prevWord = ctx.catchUp && ctx.comparisonPreviousKey ? previousLabel : PERIOD_TYPES[ctx.type].previousLabel;
    const originText = state.origin === "all" ? "alle herkomsten" : state.origin;
    const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    const groups = ctx.groupComparison.slice().sort((a, b) => b.amount - a.amount);
    const rows = ctx.comparison.filter(r => r.currentAmount > 0 || r.previousAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount);
    const shownRows = rows.slice(0, 15);
    const restCount = rows.length - shownRows.length;
    const pareto = buildParetoRows(ctx, 8);
    const drivers = buildChangeDrivers(ctx, 4);

    // Conclusiezin vooraf opmeten voor de hoogte.
    setFont("400", 15);
    const concLines = wrap(buildPlainConclusion(ctx), CW);

    // Verticale ankers
    const concStartY = 262;
    const concBottom = concStartY + concLines.length * 20;
    const waarTitleY = concBottom + 26;
    const compBarY = waarTitleY + 16;
    const compBarH = 26;
    const tilesY = compBarY + compBarH + 18;
    const tileH = 74;
    const driverTitleY = tilesY + tileH + 36;
    const driverSummaryY = driverTitleY + 23;
    const driverRowsY = driverSummaryY + 18;
    const driverRowH = 27;
    const driverBlockH = Math.max(1, drivers.rows.length) * driverRowH;
    const tableTitleY = driverRowsY + driverBlockH + 32;
    const tableHeadY = tableTitleY + 24;
    const rowsStartY = tableHeadY + 12;
    const tableRows = shownRows.length + (restCount > 0 ? 1 : 0) + 1;
    const tableEndY = rowsStartY + tableRows * rowH;
    const H = tableEndY + 42;

    canvas.width = W * scale;
    canvas.height = H * scale;
    c.scale(scale, scale);
    c.textBaseline = "alphabetic";
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, W, H);

    const text = (str, x, y, { size = 15, weight = "400", color = INK, align = "left", maxW } = {}) => {
      setFont(weight, size);
      c.fillStyle = color;
      c.textAlign = align;
      c.fillText(maxW ? truncate(str, maxW) : String(str), x, y);
    };
    const hline = (y, color = LINE, width = 1) => { c.strokeStyle = color; c.lineWidth = width; c.beginPath(); c.moveTo(P, y); c.lineTo(RIGHT, y); c.stroke(); };

    // ---- Header ----
    text("Credit Analyse", P, 50, { size: 29, weight: "700" });
    text("ReMarkt", RIGHT, 50, { size: 23, weight: "700", color: BRAND, align: "right" });
    text(`${PERIOD_TYPES[ctx.type].label}rapport · ${periodLabel} vs ${previousLabel} · ${originText}${ctx.isOperational ? " · operationeel toegerekend" : ""}`, P, 79, { size: 14.5, color: MUT });
    text(`Opgesteld ${today}`, P, 99, { size: 13, color: FAINT });
    hline(112, INK, 1);

    // ---- Blok 1: weektotaal ----
    text(`${ctx.isOperational ? "Operationeel toegerekend" : "Totaal terugbetaald"} · ${PERIOD_TYPES[ctx.type].label.toLowerCase()}`, P, 150, { size: 15, color: MUT });
    text(formatMoney(ctx.current.total), P, 214, { size: 60, weight: "800" });
    const reportDeltaPct = ctx.catchUp ? h.decisionDeltaPct : h.totalDeltaPct;
    const reportPreviousTotal = ctx.catchUp ? ctx.comparisonPrevious.total : ctx.previous.total;
    const deltaTxt = h.decisionHasPrevious
      ? `${reportDeltaPct > 0.05 ? "▲" : reportDeltaPct < -0.05 ? "▼" : "→"} ${formatSignedPercent(reportDeltaPct, 0)}${ctx.catchUp ? " gecorrigeerd" : ""} t.o.v. ${prevWord} — die was ${formatMoney(reportPreviousTotal)}`
      : `Nog geen vorige ${PERIOD_TYPES[ctx.type].label.toLowerCase()} om mee te vergelijken`;
    text(deltaTxt, P, 240, { size: 16, weight: "700", color: h.decisionHasPrevious ? costColor(reportDeltaPct) : FAINT });
    concLines.forEach((ln, i) => text(ln, P, concStartY + i * 20, { size: 14, weight: "600", color: INK }));

    // ---- Blok 2: Waar zit het in? (5 groepen) ----
    text("Waar zit het in?", P, waarTitleY, { size: 17, weight: "700" });
    // compositiebalk
    c.save();
    rrect(P, compBarY, CW, compBarH, 6); c.clip();
    let bx = P;
    groups.forEach(g => {
      const segW = CW * (g.share / 100);
      if (segW <= 0) return;
      c.fillStyle = groupColor(g.key);
      c.fillRect(bx, compBarY, Math.max(0, segW - 2), compBarH);
      if (segW > 78) text(formatMoney(g.amount), bx + segW / 2, compBarY + 17, { size: 11, weight: "700", color: "#fff", align: "center" });
      bx += segW;
    });
    c.restore();
    // 5 tegels
    const tGap = 12, tW = (CW - 4 * tGap) / 5;
    groups.forEach((g, i) => {
      const x = P + i * (tW + tGap);
      c.fillStyle = SUNKEN; rrect(x, tilesY, tW, tileH, 10); c.fill();
      c.strokeStyle = g.key === PREVENTABLE_GROUP ? "#f2ccd1" : LINE; c.lineWidth = 1; rrect(x, tilesY, tW, tileH, 10); c.stroke();
      c.fillStyle = groupColor(g.key); rrect(x + 14, tilesY + 15, 11, 11, 3); c.fill();
      text(truncate(g.short, tW - 40), x + 31, tilesY + 24, { size: 12.5, weight: "600", color: MUT });
      text(formatMoney(g.amount), x + 14, tilesY + 50, { size: 20, weight: "800" });
      text(`${formatPercent(g.share, 1)} van totaal`, x + 14, tilesY + 66, { size: 11.5, color: FAINT });
    });

    // ---- Blok 3: grootste kostendrijvers ----
    text("Grootste kostendrijvers", P, driverTitleY, { size: 17, weight: "700" });
    const paretoSummary = pareto.totalReasons
      ? `${formatNumber(pareto.countToEighty)} van ${formatNumber(pareto.totalReasons)} redenen vormen samen minimaal 80% van het bedrag.`
      : "Nog geen redenen beschikbaar voor een Pareto-analyse.";
    text(paretoSummary, P, driverSummaryY, { size: 12.5, color: MUT });
    if (!drivers.rows.length) {
      text(
        h.decisionHasPrevious
          ? "Geen materiele verandering: beide operationele weken sluiten op hetzelfde totaal."
          : "Nog geen vergelijkbare vorige periode.",
        P,
        driverRowsY + 18,
        { size: 13, color: FAINT },
      );
    } else {
      const driverBarX = 430;
      const driverBarW = 420;
      const driverMid = driverBarX + driverBarW / 2;
      drivers.rows.forEach((row, index) => {
        const y = driverRowsY + index * driverRowH;
        const barW = drivers.maxAbs ? (Math.abs(row.amountDelta) / drivers.maxAbs) * (driverBarW / 2) : 0;
        text(row.reason, P, y + 17, { size: 12.5, weight: "600", maxW: 355 });
        c.strokeStyle = LINE2;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(driverMid, y + 14);
        c.lineTo(driverMid, y + 24);
        c.stroke();
        c.fillStyle = row.amountDelta > 0 ? UP : DOWN;
        const x = row.amountDelta >= 0 ? driverMid : driverMid - barW;
        rrect(x, y + 8, Math.max(2, barW), 10, 3);
        c.fill();
        text(formatSignedMoney(row.amountDelta), RIGHT, y + 18, {
          size: 12.5, weight: "700", color: costColor(row.amountDelta), align: "right",
        });
      });
    }

    // ---- Blok 4: alle redenen ----
    text(`Alle redenen — vs ${previousLabel}`, P, tableTitleY, { size: 17, weight: "700" });
    const colBedrag = 596, colShare = 716, colDelta = 856, colDeltaE = RIGHT;
    text("Reden", P, tableHeadY, { size: 11.5, weight: "700", color: MUT });
    text("Bedrag", colBedrag, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    text("% totaal", colShare, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    text("Δ aandeel", colDelta, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    text("Δ bedrag", colDeltaE, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    hline(tableHeadY + 10, LINE2, 1);

    let ty = rowsStartY;
    shownRows.forEach(r => {
      const rowY = ty + rowH - 10;
      const isNew = h.decisionHasPrevious && r.previousAmount === 0 && r.comparisonCurrentAmount > 0;
      // Subtiele gekleurde stip = groep uit "Waar zit het in?".
      c.fillStyle = groupColor(r.groupKey); c.beginPath(); c.arc(P + 4, rowY - 4, 3.5, 0, Math.PI * 2); c.fill();
      text(r.reason, P + 16, rowY, { size: 14, color: INK, maxW: 446 });
      text(formatMoney(r.currentAmount), colBedrag, rowY, { size: 14, weight: "700", align: "right" });
      text(formatPercent(r.currentShare, 1), colShare, rowY, { size: 14, weight: "600", align: "right" });
      text(isNew ? "nieuw" : `${r.shareDelta > 0.05 ? "▲" : r.shareDelta < -0.05 ? "▼" : "→"} ${formatSignedPercent(r.shareDelta, 1)}`, colDelta, rowY, { size: 14, weight: "600", color: isNew ? MUT : costColor(r.shareDelta), align: "right" });
      text(r.previousAmount || r.currentAmount ? formatSignedMoney(r.amountDelta) : "—", colDeltaE, rowY, { size: 14, weight: "600", color: costColor(r.amountDelta), align: "right" });
      hline(ty + rowH, LINE, 1);
      ty += rowH;
    });
    if (restCount > 0) { text(`+ ${formatNumber(restCount)} overige redenen (kleiner bedrag)`, P, ty + rowH - 10, { size: 13, color: FAINT }); ty += rowH; }

    // Eindtotaal
    hline(ty + 2, LINE2, 2);
    const totY = ty + rowH - 8;
    text("Eindtotaal", P, totY, { size: 15, weight: "800" });
    text(formatMoney(ctx.current.total), colBedrag, totY, { size: 15, weight: "800", align: "right" });
    text("100%", colShare, totY, { size: 15, weight: "800", align: "right" });
    text("—", colDelta, totY, { size: 15, weight: "800", color: FAINT, align: "right" });
    text(h.decisionHasPrevious ? formatSignedMoney(h.decisionDelta) : "—", colDeltaE, totY, { size: 15, weight: "800", color: costColor(h.decisionDelta), align: "right" });

    // Footer
    text(`ReMarkt Credit Analyse · ${ctx.isOperational ? `werkelijk betaald ${formatMoney(ctx.actualCurrent.total)} · ` : ""}geaggregeerd, zonder klantnamen of ordernummers.`, P, H - 20, { size: 12, color: FAINT });

    // Voor previews/tests: monteer de canvas in plaats van te downloaden.
    if (opts.mount) { canvas.style.width = `${W}px`; canvas.style.height = "auto"; opts.mount.appendChild(canvas); return canvas; }

    const name = `ReMarkt-creditrapport-${ctx.type}-${String(ctx.key || "rapport").replace(/[^\w-]/g, "-")}.png`;
    const finish = blob => {
      if (!blob) { window.alert("De afbeelding kon niet worden gemaakt."); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url; link.download = name;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    if (canvas.toBlob) canvas.toBlob(finish, "image/png");
    else finish(null);
  }

  function openImage() {
    if (!state.records.length) return;
    generateReportImage(getDashboardContext());
  }

  // ---------------------------------------------------------------------------
  // Events + bootstrap
  // ---------------------------------------------------------------------------
  function wireEvents() {
    document.querySelectorAll("[data-file-trigger]").forEach(trigger => {
      trigger.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        const input = trigger.querySelector('input[type="file"]');
        if (input) input.click();
      });
    });
    els.fileInputs.forEach(input => {
      if (!input) return;
      input.addEventListener("change", event => { handleFile(event.target.files && event.target.files[0]).catch(showError); input.value = ""; });
    });
    els.clearHistory.addEventListener("click", clearHistory);
    els.exportCsv.addEventListener("click", exportCurrentCsv);
    els.downloadReport.addEventListener("click", openReport);
    if (els.downloadImage) els.downloadImage.addEventListener("click", openImage);
    els.dropZone.addEventListener("dragover", event => { event.preventDefault(); els.dropZone.classList.add("is-dragging"); });
    els.dropZone.addEventListener("dragleave", () => els.dropZone.classList.remove("is-dragging"));
    els.dropZone.addEventListener("drop", event => {
      event.preventDefault();
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      handleFile(file).catch(showError);
    });
    document.querySelectorAll("[data-period-type]").forEach(button => {
      button.addEventListener("click", () => { state.periodType = button.dataset.periodType; state.selectedKey = ""; renderDashboard(); });
    });
    if (els.basisBar) {
      els.basisBar.addEventListener("click", event => {
        const button = getClosestTarget(event, "[data-analysis-basis]");
        if (!button) return;
        state.analysisBasis = button.dataset.analysisBasis === "actual" ? "actual" : "operational";
        state.selectedKey = "";
        renderDashboard();
      });
    }
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => { state.activeTab = button.dataset.tab; renderDashboard(); });
      button.addEventListener("keydown", event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = Array.from(document.querySelectorAll("[data-tab]"));
        const index = tabs.indexOf(button);
        const nextIndex = event.key === "Home" ? 0
          : event.key === "End" ? tabs.length - 1
            : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        state.activeTab = tabs[nextIndex].dataset.tab;
        renderDashboard();
        tabs[nextIndex].focus();
      });
    });
    els.periodSelect.addEventListener("change", event => { state.selectedKey = event.target.value; renderDashboard(); });
    els.originSelect.addEventListener("change", event => { state.origin = event.target.value; state.selectedKey = ""; renderDashboard(); });
    els.reasonSearch.addEventListener("input", event => { state.reasonSearch = event.target.value; renderDashboard(); });
    els.trendChart.addEventListener("click", event => {
      const metricBtn = getClosestTarget(event, "[data-trend-metric]");
      const rangeBtn = getClosestTarget(event, "[data-trend-range]");
      const fcBtn = getClosestTarget(event, "[data-forecast]");
      if (metricBtn) state.trendMetric = metricBtn.dataset.trendMetric;
      else if (rangeBtn) state.trendRange = rangeBtn.dataset.trendRange;
      else if (fcBtn) state.forecastOn = !state.forecastOn;
      else {
        const pt = getClosestTarget(event, "[data-period-key]");
        if (pt) selectPeriodKey(pt.dataset.periodKey);
        return;
      }
      const ctx = getDashboardContext();
      renderTrendChart(ctx);
      renderOriginSplit(ctx);
    });
    els.trendChart.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const pt = getClosestTarget(event, "[data-period-key]");
      if (pt) { event.preventDefault(); selectPeriodKey(pt.dataset.periodKey); }
    });
    if (els.originSplit) {
      els.originSplit.addEventListener("click", event => {
        const pt = getClosestTarget(event, "[data-period-key]");
        if (pt) selectPeriodKey(pt.dataset.periodKey);
      });
      els.originSplit.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        const pt = getClosestTarget(event, "[data-period-key]");
        if (pt) { event.preventDefault(); selectPeriodKey(pt.dataset.periodKey); }
      });
    }
    els.periodTotals.addEventListener("click", event => {
      const row = getClosestTarget(event, "[data-period-key]");
      if (row) selectPeriodKey(row.dataset.periodKey);
    });
    if (els.groupBreakdown) {
      els.groupBreakdown.addEventListener("click", event => {
        const tile = getClosestTarget(event, "[data-group]");
        if (!tile) return;
        state.selectedGroupFilter = state.selectedGroupFilter === tile.dataset.group ? "" : tile.dataset.group;
        renderDashboard();
      });
    }
    els.compareTable.addEventListener("click", event => {
      if (getClosestTarget(event, "[data-clear-group]")) {
        state.selectedGroupFilter = "";
        renderDashboard();
        return;
      }
      const sortButton = getClosestTarget(event, "[data-compare-sort]");
      if (sortButton) {
        const key = sortButton.dataset.compareSort;
        if (state.compareSort === key) state.compareSortDir = state.compareSortDir === "asc" ? "desc" : "asc";
        else {
          state.compareSort = key;
          state.compareSortDir = key === "reason" ? "asc" : "desc";
        }
        renderCompareTable(getDashboardContext());
      }
    });
    els.compareTable.addEventListener("change", event => {
      const select = getClosestTarget(event, "[data-compare-sort-select]");
      if (!select) return;
      const [key, direction] = String(select.value || "").split(":");
      state.compareSort = key;
      state.compareSortDir = direction === "asc" ? "asc" : "desc";
      renderCompareTable(getDashboardContext());
    });
    if (els.importBanner) {
      els.importBanner.addEventListener("click", event => {
        if (getClosestTarget(event, "[data-dismiss-banner]")) { state.importBannerDismissed = true; els.importBanner.hidden = true; }
      });
    }
    if (els.adjustmentPanel) {
      els.adjustmentPanel.addEventListener("change", event => {
        const method = getClosestTarget(event, "[data-adjustment-method]");
        if (!method) return;
        const form = method.closest("[data-adjustment-form]");
        const amount = form && form.querySelector("[data-adjustment-amount]");
        if (!amount) return;
        if (method.value === "estimate") {
          amount.value = Number(form.dataset.suggested || 0).toFixed(2);
          amount.setAttribute("readonly", "");
        } else {
          amount.removeAttribute("readonly");
          amount.focus();
          amount.select();
        }
        updateAdjustmentPreview();
      });
      els.adjustmentPanel.addEventListener("input", event => {
        if (getClosestTarget(event, "[data-adjustment-amount]")) updateAdjustmentPreview();
      });
      els.adjustmentPanel.addEventListener("submit", event => {
        const form = getClosestTarget(event, "[data-adjustment-form]");
        if (!form) return;
        event.preventDefault();
        const setup = getAdjustmentSetup(form.dataset.currentKey);
        const amount = Number(form.querySelector("[data-adjustment-amount]").value);
        const method = form.querySelector("[data-adjustment-method]").value === "exact" ? "exact" : "estimate";
        if (!(amount > 0) || amount > setup.currentReturns + 0.01) {
          window.alert(`Vul een bedrag in tussen € 0,01 en ${formatMoney(setup.currentReturns)}.`);
          return;
        }
        const adjustment = normalizeAdjustment({
          currentKey: setup.currentKey,
          targetKey: setup.targetKey,
          amount,
          method,
          createdAt: new Date().toISOString(),
        });
        state.adjustments = [
          ...state.adjustments.filter(item => item.currentKey !== setup.currentKey),
          adjustment,
        ].filter(Boolean);
        state.analysisBasis = "operational";
        saveAdjustments(state.adjustments);
        renderDashboard();
      });
      els.adjustmentPanel.addEventListener("click", event => {
        const button = getClosestTarget(event, "[data-remove-adjustment]");
        if (!button) return;
        state.adjustments = state.adjustments.filter(item => item.currentKey !== button.dataset.removeAdjustment);
        saveAdjustments(state.adjustments);
        renderDashboard();
      });
    }
  }

  if (IS_BROWSER) {
    wireEvents();
    renderDashboard();
    // Privacy: registreer gebruik en wis de analyse na 30 min inactiviteit.
    ["click", "keydown", "change", "input"].forEach(ev => els.app.addEventListener(ev, touchActivity, true));
    setInterval(checkExpiry, 60000);
    // Handvat voor previews/diagnose (niet nodig voor normaal gebruik).
    window.creditAnalyseApp = { state, getDashboardContext, generateReportImage, generateReportPdf, renderDashboard };
  }

  // Node-export voor tests (raakt de browser niet).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      state, parseWorkbookRecords, mergeImportedRecords, aggregateRows, detectColumns,
      summarizeRecords, getReasonComparison, groupSummary, buildGroupComparison, getPeriodStats,
      detectCatchUpWeek,
      getAvailablePeriodKeys, getPreviousKey, recordsForPeriod, filteredRecords,
      getDashboardContext, buildHeadline, focusStats, reasonGroupKey, makePeriodKeys,
      parseMoney, parseDateValue, correctYearNumber, labelPeriod, periodSortValue,
      renderDashboard, generateReportPdf, generateReportImage, exportCurrentCsv, buildPlainConclusion,
      forecastSeries, validateForecast, naiveForecast, selectValidatedForecast,
      getTrendSeries, buildIndividualsControl, findAdministrativeCatchUps,
      normalizeAdjustment, validAdjustmentsForRecords, applyReturnAdjustments, detectReturnBatchCandidate,
      buildParetoRows, buildChangeDrivers, completePeriodKeys, nextPeriodKey, previousPeriodKey, retentionExpired,
      FOCUS_REASONS, REASON_GROUPS, PREVENTABLE_GROUP, RETENTION_MS,
    };
  }
}());
