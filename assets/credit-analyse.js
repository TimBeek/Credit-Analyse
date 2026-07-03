(function () {
  "use strict";

  const IS_BROWSER = typeof document !== "undefined";
  const HAS_STORAGE = (() => {
    try { return typeof localStorage !== "undefined"; } catch { return false; }
  })();

  const STORAGE_KEY = "remarkt.creditAnalyse.records.v2";
  const META_KEY = "remarkt.creditAnalyse.meta.v2";
  const FALLBACK_REASON = "Overige";

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
  const state = {
    records: loadRecords(),
    meta: loadMeta(),
    quality: null,
    reasonList: EXPECTED_REASONS,
    periodType: "week",
    selectedKey: "",
    origin: "all",
    reasonSearch: "",
    activeTab: "overview",
    selectedTrendKey: "",
    selectedGroupFilter: "",
    importBannerDismissed: false,
    trendMetric: "total",   // total | count | average
    trendRange: "all",      // 13 | 26 | 52 | all
    forecastOn: true,
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
    dashboard: document.getElementById("dashboard"),
    periodSelect: document.getElementById("periodSelect"),
    originSelect: document.getElementById("originSelect"),
    reasonSearch: document.getElementById("reasonSearch"),
    hero: document.getElementById("hero"),
    focusRow: document.getElementById("focusRow"),
    groupBreakdown: document.getElementById("groupBreakdown"),
    signalBand: document.getElementById("signalBand"),
    compareMeta: document.getElementById("compareMeta"),
    compareTable: document.getElementById("compareTable"),
    trendChart: document.getElementById("trendChart"),
    originSplit: document.getElementById("originSplit"),
    periodTotals: document.getElementById("periodTotals"),
    qualityDetails: document.getElementById("qualityDetails"),
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

      // Leeg/ongeldig bedrag: neem over van de regel erboven/eronder als dat kan.
      // Overgenomen bedragen worden nadrukkelijk als "controleer" gemarkeerd, omdat
      // een creditbedrag per regel uniek kan zijn.
      if (amount === null) {
        const neighborAmount = findNeighborValue(preparedRows, index, "amount");
        if (neighborAmount.value !== null && neighborAmount.value !== undefined) {
          amount = neighborAmount.value;
          quality.recoveredAmountRows += 1;
          addWarningSample(quality, rowNumber, `Leeg bedrag overgenomen van ${neighborAmount.source} (${formatMoneyExact(amount)}) — controleer`);
        } else {
          quality.missingAmount += 1;
          addSkippedSample(quality, rowNumber, "Leeg bedrag en geen buurregel om over te nemen");
        }
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
  function filteredRecords(records = state.records) {
    const reasonSearch = normalizeKey(state.reasonSearch);
    return records.filter(record => {
      if (state.origin !== "all" && record.origin !== state.origin) return false;
      if (reasonSearch && !normalizeKey(record.reason).includes(reasonSearch)) return false;
      return true;
    });
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
    const index = keys.indexOf(key);
    return index > 0 ? keys[index - 1] : "";
  }

  function recordsForPeriod(type, key) {
    return filteredRecords().filter(record => periodKeyForRecord(record, type) === key);
  }

  // Per reden: bedrag, aandeel-% nu en vorige periode, en de verschillen.
  function getReasonComparison(currentSummary, previousSummary) {
    const reasons = new Set([...currentSummary.reasons.keys(), ...previousSummary.reasons.keys()]);
    return Array.from(reasons).map(reason => {
      const current = currentSummary.reasons.get(reason) || { amount: 0, count: 0 };
      const previous = previousSummary.reasons.get(reason) || { amount: 0, count: 0 };
      const currentShare = currentSummary.total ? (current.amount / currentSummary.total) * 100 : 0;
      const previousShare = previousSummary.total ? (previous.amount / previousSummary.total) * 100 : 0;
      const amountDelta = current.amount - previous.amount;
      const amountDeltaPct = previous.amount ? (amountDelta / previous.amount) * 100 : (current.amount ? 100 : 0);
      return {
        reason, groupKey: reasonGroupKey(reason),
        currentAmount: current.amount, currentCount: current.count, currentShare,
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

  function buildGroupComparison(current, previous) {
    const currentGroups = groupSummary(current, current.total);
    const previousGroups = groupSummary(previous, previous.total);
    const previousByKey = new Map(previousGroups.map(group => [group.key, group]));
    return currentGroups.map(group => {
      const prev = previousByKey.get(group.key) || { amount: 0, count: 0, share: 0 };
      const amountDelta = group.amount - prev.amount;
      return {
        ...group, previousAmount: prev.amount, previousShare: prev.share, amountDelta,
        amountDeltaPct: prev.amount ? (amountDelta / prev.amount) * 100 : (group.amount ? 100 : 0),
        shareDelta: group.share - prev.share,
      };
    });
  }

  // Gemiddelde + spreiding van het totaalbedrag over alle periodes van dit type.
  function getPeriodStats(type) {
    const keys = getAvailablePeriodKeys(type);
    const summaries = keys.map(key => summarizeRecords(recordsForPeriod(type, key)));
    const totals = summaries.map(summary => summary.total);
    const counts = summaries.map(summary => summary.count);
    const count = totals.length;
    const avg = count ? totals.reduce((sum, value) => sum + value, 0) / count : 0;
    const variance = count > 1 ? totals.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / (count - 1) : 0;
    const stdev = Math.sqrt(variance);
    return { keys, totals, counts, count, avg, stdev, threshold: avg + (1.5 * stdev) };
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
    // Nieuwe redenen die er vorige periode nog niet waren en geld kosten.
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
    if (ctx.headline.isOutlier) {
      signals.push({ tone: "bad", title: "Valt op t.o.v. normaal", detail: `Het totaal ligt duidelijk boven het gemiddelde van ${formatMoney(ctx.periodStats.avg)} per ${PERIOD_TYPES[ctx.type].label.toLowerCase()}.` });
    }
    return signals.slice(0, 5);
  }

  // Eén heldere kop: totaal + verschil t.o.v. vorige periode (Wout's kernvraag).
  function buildHeadline(ctx) {
    const totalDelta = ctx.current.total - ctx.previous.total;
    const totalDeltaPct = ctx.previous.total ? (totalDelta / ctx.previous.total) * 100 : 0;
    const hasPrevious = Boolean(ctx.previousKey);
    const avg = ctx.periodStats.avg;
    const vsAvgPct = avg ? ((ctx.current.total - avg) / avg) * 100 : 0;
    const enoughHistory = ctx.periodStats.count >= 4;
    const isOutlier = enoughHistory && ctx.periodStats.stdev > 0 && ctx.current.total > ctx.periodStats.threshold;
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
    return { totalDelta, totalDeltaPct, hasPrevious, vsAvgPct, enoughHistory, isOutlier, tone, title, periodWord };
  }

  // Eén gewone-mensen-zin die de kern samenvat, voor wie geen analist is.
  function buildPlainConclusion(ctx) {
    const h = ctx.headline;
    const periodWord = PERIOD_TYPES[ctx.type].label.toLowerCase();
    const prevWord = PERIOD_TYPES[ctx.type].previousLabel;
    const top = ctx.comparison.filter(row => row.currentAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount)[0];
    const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP) || { share: 0 };
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
    const ctx = {
      type, key, latestKey, isLatest: key === latestKey, previousKey,
      current, previous,
      comparison: getReasonComparison(current, previous),
      groupComparison: buildGroupComparison(current, previous),
      periodStats: getPeriodStats(type),
    };
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
    if (q.recoveredAmountRows) fixes.push(`${formatNumber(q.recoveredAmountRows)}× leeg bedrag overgenomen van de regel erboven/eronder — controleer`);
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
    } else if (q.recoveredAmountRows) {
      tone = "warn"; icon = "!";
      headline = `${formatNumber(q.parsedRows)} regels ingelezen. Let op: ${formatNumber(q.recoveredAmountRows)} leeg bedrag overgenomen van een buurregel — controleer die even voordat je naar Wout stuurt.`;
    } else if (fixes.length) {
      tone = "ok"; icon = "✓";
      headline = `${formatNumber(q.parsedRows)} regels ingelezen — een paar dingen zijn automatisch opgeschoond.`;
    } else {
      tone = "good"; icon = "✓";
      headline = `${formatNumber(q.parsedRows)} regels netjes ingelezen. Niets hoefde te worden hersteld.`;
    }

    els.importBanner.hidden = false;
    els.importBanner.className = `import-banner tone-${tone}`;
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
      button.classList.toggle("is-active", button.dataset.periodType === state.periodType);
    });
    els.originSelect.value = state.origin;
    if (document.activeElement !== els.reasonSearch) els.reasonSearch.value = state.reasonSearch;
  }

  function renderTabs() {
    document.querySelectorAll("[data-tab]").forEach(button => button.classList.toggle("is-active", button.dataset.tab === state.activeTab));
    document.querySelectorAll("[data-tab-section]").forEach(section => { section.hidden = section.dataset.tabSection !== state.activeTab; });
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
    const countDelta = ctx.current.count - ctx.previous.count;
    const deltaLine = h.hasPrevious
      ? `<span class="delta-badge ${h.tone}">${trendArrow(h.totalDeltaPct)} ${formatSignedPercent(h.totalDeltaPct, 0)}</span> t.o.v. ${escapeHtml(PERIOD_TYPES[ctx.type].previousLabel)} (${formatMoney(ctx.previous.total)})`
      : `Nog geen vorige ${escapeHtml(h.periodWord)} om mee te vergelijken.`;
    const avgLine = h.enoughHistory
      ? `${trendArrow(h.vsAvgPct)} ${formatSignedPercent(h.vsAvgPct, 0)} t.o.v. gemiddeld (${formatMoney(ctx.periodStats.avg)})`
      : `Nog te weinig ${escapeHtml(PERIOD_TYPES[ctx.type].plural)} voor een gemiddelde.`;

    const prevLabel = PERIOD_TYPES[ctx.type].previousLabel;
    const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP) || { amount: 0, share: 0 };
    const topReason = ctx.comparison.filter(row => row.currentAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount)[0];

    els.hero.className = `hero tone-${h.tone}`;
    els.hero.innerHTML = `
      <div class="hero-lead">
        <div class="hero-eyebrow">${escapeHtml(PERIOD_TYPES[ctx.type].label)} · ${escapeHtml(labelPeriod(ctx.type, ctx.key))}${ctx.isLatest ? ` <span class="tag">Nieuwste</span>` : ""}</div>
        <div class="hero-amount">${formatMoney(ctx.current.total)}</div>
        <div class="hero-sub">totaal teruggestort · ${formatNumber(ctx.current.count)} creditaties</div>
        <div class="hero-verdict ${h.tone}">${trendArrow(h.hasPrevious ? h.totalDeltaPct : 0)} ${escapeHtml(h.title)}</div>
        <div class="hero-line">${deltaLine}</div>
        <div class="hero-line muted">${avgLine}</div>
        <p class="hero-plain">${escapeHtml(buildPlainConclusion(ctx))}</p>
      </div>
      <div class="hero-kpis">
        <div class="kpi"><span>Gemiddeld per credit</span><strong>${formatMoney(avgPerCredit)}</strong><em class="is-flat">terugbetaling</em></div>
        <div class="kpi"><span>Aantal credits</span><strong>${formatNumber(ctx.current.count)}</strong><em class="${costTrendClass(countDelta)}">${countDelta > 0 ? "+" : countDelta < 0 ? "−" : ""}${formatNumber(Math.abs(countDelta))} vs ${escapeHtml(prevLabel)}</em></div>
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
    const prevLabel = PERIOD_TYPES[ctx.type].previousLabel;
    els.focusRow.innerHTML = cards.map(card => {
      const movement = card.previousShare > 0
        ? `${escapeHtml(prevLabel)} ${formatPercent(card.previousShare, 1)} → nu ${formatPercent(card.share, 1)}`
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
          <span>${trendArrow(card.shareDelta)} ${formatSignedPercent(card.shareDelta, 1)}-punt vs ${escapeHtml(prevLabel)}</span>
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
    if (els.compareMeta) {
      const originText = state.origin === "all" ? "alle herkomsten" : state.origin.toLowerCase();
      els.compareMeta.textContent = `${labelPeriod(ctx.type, ctx.key)} vs ${ctx.previousKey ? labelPeriod(ctx.type, ctx.previousKey) : "geen vorige periode"} · ${originText} · ${formatMoney(ctx.current.total)} totaal`;
    }
    const activeGroup = state.selectedGroupFilter && ctx.groupComparison.some(g => g.key === state.selectedGroupFilter) ? state.selectedGroupFilter : "";
    const activeGroupMeta = activeGroup ? ctx.groupComparison.find(g => g.key === activeGroup) : null;
    const rows = ctx.comparison
      .filter(row => row.currentAmount > 0 || row.previousAmount > 0)
      .filter(row => !activeGroup || row.groupKey === activeGroup)
      .sort((a, b) => b.currentAmount - a.currentAmount);
    if (!rows.length) { els.compareTable.innerHTML = `<div class="empty-state">Geen redenen voor deze selectie.</div>`; return; }
    const maxShare = Math.max(...rows.map(row => row.currentShare), 1);
    const totalCountDelta = ctx.current.count - ctx.previous.count;
    const foot = activeGroupMeta ? {
      label: `Subtotaal · ${activeGroupMeta.short}`, amount: activeGroupMeta.amount, count: activeGroupMeta.count,
      share: activeGroupMeta.share, prevShare: ctx.previous.total ? activeGroupMeta.previousShare : null,
      hasPrev: ctx.headline.hasPrevious, shareDelta: activeGroupMeta.shareDelta, amountDelta: activeGroupMeta.amountDelta, shareDigits: 1,
    } : {
      label: "Eindtotaal", amount: ctx.current.total, count: ctx.current.count,
      share: 100, prevShare: ctx.previous.total ? 100 : null,
      hasPrev: ctx.headline.hasPrevious, shareDelta: ctx.headline.totalDeltaPct, amountDelta: ctx.headline.totalDelta, shareDigits: 0,
    };

    const bodyRows = rows.map(row => {
      const fillClass = row.groupKey === PREVENTABLE_GROUP ? "bad" : "neutral";
      const shareBar = `<span class="cell-bar"><i class="${fillClass}" style="width:${Math.max(3, (row.currentShare / maxShare) * 100)}%"></i></span>`;
      const isNew = row.previousAmount === 0 && row.currentAmount > 0;
      const gone = row.currentAmount === 0 && row.previousAmount > 0;
      const tags = `${row.isFocus ? `<span class="dot dot-focus" title="Focusreden"></span>` : ""}${row.groupKey === PREVENTABLE_GROUP ? `<span class="dot dot-bad" title="Voorkombaar"></span>` : ""}`;
      return `
        <tr class="${row.isFocus ? "row-focus" : ""}">
          <td class="reason">${tags}<span>${escapeHtml(row.reason)}</span></td>
          <td class="num strong">${formatMoney(row.currentAmount)}</td>
          <td class="num">${formatNumber(row.currentCount)}</td>
          <td class="num share">${shareBar}<span>${formatPercent(row.currentShare, 1)}</span></td>
          <td class="num ${costTrendClass(row.shareDelta)}">${isNew ? `<span class="pill pill-new">nieuw</span>` : `${trendArrow(row.shareDelta)} ${formatSignedPercent(row.shareDelta, 1)}`}</td>
          <td class="num ${costTrendClass(row.amountDelta)}">${row.previousAmount || row.currentAmount ? formatSignedMoney(row.amountDelta) : "—"}</td>
        </tr>`;
    }).join("");

    els.compareTable.innerHTML = `
      <p class="table-help">Lees je zo: <strong>% van totaal</strong> = welk deel van al het teruggestorte geld deze reden is. <strong>Verschil aandeel</strong> = hoeveel dat deel is <span class="is-up">gestegen (rood)</span> of <span class="is-down">gedaald (groen)</span> t.o.v. de vorige periode, in procentpunten.</p>
      ${activeGroupMeta ? `<div class="filter-chip">Alleen groep <strong>${escapeHtml(activeGroupMeta.label)}</strong> — ${formatMoney(activeGroupMeta.amount)} (${formatPercent(activeGroupMeta.share, 1)} van totaal). <button type="button" class="chip-clear" data-clear-group>× toon alle redenen</button></div>` : ""}
      <table class="compare">
        <thead>
          <tr>
            <th>Reden</th>
            <th class="num">Bedrag</th>
            <th class="num">Aantal</th>
            <th class="num">% van totaal</th>
            <th class="num">Verschil aandeel</th>
            <th class="num">Verschil €</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <td class="reason">${escapeHtml(foot.label)}</td>
            <td class="num strong">${formatMoney(foot.amount)}</td>
            <td class="num">${formatNumber(foot.count)}</td>
            <td class="num">${formatPercent(foot.share, foot.shareDigits)}</td>
            <td class="num ${costTrendClass(foot.shareDelta)}">${foot.hasPrev ? `${trendArrow(foot.shareDelta)} ${formatSignedPercent(foot.shareDelta, 1)}` : "—"}</td>
            <td class="num ${costTrendClass(foot.amountDelta)}">${foot.hasPrev ? formatSignedMoney(foot.amountDelta) : "—"}</td>
          </tr>
        </tfoot>
      </table>
      <p class="table-note">
        <span class="dot dot-focus"></span> focusreden (ALT / Niet werkzaam) ·
        <span class="dot dot-bad"></span> voorkombaar (onze fout) ·
        aantal credits ${totalCountDelta > 0 ? "+" : totalCountDelta < 0 ? "−" : ""}${formatNumber(Math.abs(totalCountDelta))} vs ${escapeHtml(PERIOD_TYPES[ctx.type].previousLabel)}
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

    const prevLabel = PERIOD_TYPES[ctx.type].previousLabel;
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
            <div class="group-tile-delta ${costTrendClass(group.shareDelta)}">${trendArrow(group.shareDelta)} ${formatSignedPercent(group.shareDelta, 1)}-punt vs ${escapeHtml(prevLabel)}</div>
          </div>
          <span class="group-tile-cta">${isSelected ? "✓ getoond" : "bekijk"}</span>
        </button>`;
    }).join("");

    els.groupBreakdown.innerHTML = `
      <div class="comp-bar">${segments}</div>
      <div class="group-tiles">${tiles}</div>
      <p class="group-hint">Klik op een groep om alleen die redenen in de tabel hieronder te zien.</p>`;
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

  function nextPeriodKey(type, key) {
    if (type === "week") { const m = key.match(/^(\d{4})-W(\d{2})$/); if (!m) return ""; let y = +m[1], w = +m[2] + 1; if (w > 52) { y += 1; w = 1; } return `${y}-W${pad2(w)}`; }
    if (type === "month") { const m = key.match(/^(\d{4})-(\d{2})$/); if (!m) return ""; let y = +m[1], mo = +m[2] + 1; if (mo > 12) { y += 1; mo = 1; } return `${y}-${pad2(mo)}`; }
    if (type === "quarter") { const m = key.match(/^(\d{4})-Q(\d)$/); if (!m) return ""; let y = +m[1], q = +m[2] + 1; if (q > 4) { y += 1; q = 1; } return `${y}-Q${q}`; }
    return String((Number(key) || 0) + 1);
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
      const band = sigma * Math.sqrt(hh);
      preds.push({ idx: n - 1 + hh, y: yv, lo: Math.max(0, yv - band), hi: yv + band });
    }
    const method = useSeasonal ? "Holt-Winters (seizoen + gedempte trend)" : useTrend ? "exponentiële smoothing (gedempte trend)" : "exponentiële smoothing";
    return { preds, excluded, method };
  }

  function getTrendSeries(ctx) {
    const allKeys = ctx.periodStats.keys, totals = ctx.periodStats.totals, counts = ctx.periodStats.counts;
    const metricKey = TREND_METRICS[state.trendMetric] ? state.trendMetric : "total";
    const valueOf = i => metricKey === "count" ? counts[i] : metricKey === "average" ? (counts[i] ? totals[i] / counts[i] : 0) : totals[i];
    const allValues = allKeys.map((k, i) => valueOf(i));
    const N = allValues.length;

    // Statistiek + prognose op de VOLLEDIGE historie — stabiel, los van het bereik.
    const avg = N ? allValues.reduce((a, b) => a + b, 0) / N : 0;
    const variance = N > 1 ? allValues.reduce((s, v) => s + (v - avg) ** 2, 0) / (N - 1) : 0;
    const stdev = Math.sqrt(variance);
    const upper = avg + 1.5 * stdev;
    const bandLo = Math.max(0, avg - stdev), bandHi = avg + stdev;
    const allOutliers = allValues.map(v => N > 4 && stdev > 0 && v > upper);
    let hi = { v: -Infinity, i: 0 }, lo = { v: Infinity, i: 0 };
    allValues.forEach((v, i) => { if (v > hi.v) hi = { v, i }; if (v < lo.v) lo = { v, i }; });
    const outCount = allOutliers.filter(Boolean).length;
    const steps = { week: 6, month: 3, quarter: 2, year: 1 }[ctx.type] || 3;
    const seasonLen = { week: 52, month: 12, quarter: 4, year: 0 }[ctx.type] || 0;
    const forecast = state.forecastOn ? forecastSeries(allValues, allOutliers, seasonLen, steps) : null;

    // Bereik = alleen de zichtbare zoom (aantal recente periodes in beeld).
    const limit = getTrendRangeLimit();
    const start = Number.isFinite(limit) ? Math.max(0, N - limit) : 0;
    const keys = allKeys.slice(start), values = allValues.slice(start), outliers = allOutliers.slice(start);
    const n = values.length;
    if (forecast) forecast.preds.forEach((p, i) => { p.idx = n - 1 + (i + 1); });
    const maxVal = Math.max(...values, bandHi, forecast ? Math.max(...forecast.preds.map(p => p.hi)) : 0, 1);

    return {
      metric: TREND_METRICS[metricKey], metricKey, keys, values, n, fullN: N, avg, stdev, upper, bandLo, bandHi,
      outliers, forecast, maxVal, outCount,
      highKey: allKeys[hi.i], highVal: hi.v, lowKey: allKeys[lo.i], lowVal: lo.v,
    };
  }

  // Professionele verloopgrafiek: lijn + vlak, gemiddelde, normaalzone (gem. ±
  // spreiding), gemarkeerde uitschieters en een stippellijn-prognose.
  function renderTrendChart(ctx) {
    if (!els.trendChart) return;
    const type = ctx.type, periodWord = PERIOD_TYPES[type].label.toLowerCase();
    const s = getTrendSeries(ctx);
    const M = s.metric;
    const fc = s.forecast;
    const fcKeys = [];
    if (fc) { let k = ctx.latestKey || s.keys[s.n - 1]; for (let i = 0; i < fc.preds.length; i += 1) { k = nextPeriodKey(type, k); fcKeys.push(k); } }

    const metrics = [["total", "Bedrag"], ["count", "Aantal"], ["average", "Gemiddeld"]];
    const ranges = [["13", "13"], ["26", "26"], ["52", "52"], ["all", "Alles"]];
    const toolbar = `
      <div class="trend-toolbar">
        <div class="trend-group" role="group" aria-label="Toon"><span>Toon</span>${metrics.map(([v, l]) => `<button type="button" data-trend-metric="${v}" class="${state.trendMetric === v ? "is-active" : ""}">${l}</button>`).join("")}</div>
        <div class="trend-group" role="group" aria-label="Bereik"><span>Bereik</span>${ranges.map(([v, l]) => `<button type="button" data-trend-range="${v}" class="${state.trendRange === v ? "is-active" : ""}">${l} ${escapeHtml(v === "all" ? "" : PERIOD_TYPES[type].plural)}</button>`).join("")}</div>
        <button type="button" class="trend-toggle ${state.forecastOn ? "is-active" : ""}" data-forecast aria-pressed="${state.forecastOn}">Prognose ${state.forecastOn ? "aan" : "uit"}</button>
      </div>`;

    if (!s.n) { els.trendChart.innerHTML = `${toolbar}<div class="empty-state">Geen verloopdata voor dit bereik.</div>`; return; }

    const outCount = s.outCount;
    const statCards = [
      { label: `Gemiddeld per ${periodWord}`, value: M.axis(s.avg) },
      { label: `Hoogste · ${shortPeriodLabel(type, s.highKey)}`, value: M.axis(s.highVal) },
      { label: `Laagste · ${shortPeriodLabel(type, s.lowKey)}`, value: M.axis(s.lowVal) },
      { label: outCount === 1 ? "Uitschieter" : "Uitschieters", value: formatNumber(outCount), alert: outCount > 0 },
      { label: fc ? `Prognose ${PERIOD_TYPES[type].previousLabel.replace("vorige", "volgende").replace("vorig", "volgend")}` : "Prognose", value: fc ? M.axis(fc.preds[0].y) : "—", accent: true },
    ];

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

    const linePts = s.values.map((v, i) => `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(" ");
    const areaPts = `${left.toFixed(1)},${baseY.toFixed(1)} ${linePts} ${xEnd.toFixed(1)},${baseY.toFixed(1)}`;

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
      const x = xFor(i), y = yFor(v);
      const isSel = s.keys[i] === ctx.key, isLatest = s.keys[i] === ctx.latestKey, isOut = s.outliers[i];
      const showLabel = i % labelStep === 0 || isLatest || isSel;
      return `<g class="pt ${isSel ? "is-selected" : ""} ${isLatest ? "is-latest" : ""} ${isOut ? "is-outlier" : ""}" data-period-key="${escapeHtml(s.keys[i])}" tabindex="0" role="button" aria-label="${escapeHtml(labelPeriod(type, s.keys[i]))}: ${escapeHtml(M.fmt(v))}">
        <rect class="pt-hit" x="${(x - pitch / 2).toFixed(1)}" y="${top}" width="${pitch.toFixed(1)}" height="${ch}"></rect>
        ${isOut ? `<circle class="pt-outring" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7.5"></circle>` : ""}
        <circle class="pt-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${isSel || isOut ? 5 : 3.4}"></circle>
        <title>${escapeHtml(labelPeriod(type, s.keys[i]))}: ${escapeHtml(M.fmt(v))}${isOut ? " · valt op" : ""}</title>
        ${isSel ? `<text class="pt-value" x="${x.toFixed(1)}" y="${Math.max(top + 12, y - 12).toFixed(1)}" text-anchor="middle">${escapeHtml(M.axis(v))}</text>` : ""}
        ${showLabel ? `<text class="pt-axis" x="${x.toFixed(1)}" y="${(height - 48).toFixed(1)}" text-anchor="middle">${escapeHtml(shortPeriodLabel(type, s.keys[i]))}</text>` : ""}
      </g>`;
    }).join("");

    const showBand = s.fullN > 4 && s.stdev > 0;

    els.trendChart.innerHTML = `
      ${toolbar}
      <div class="trend-stats">${statCards.map(c => `<div class="trend-stat ${c.alert ? "alert" : ""} ${c.accent ? "accent" : ""}"><strong>${escapeHtml(c.value)}</strong><span>${escapeHtml(c.label)}</span></div>`).join("")}</div>
      <svg viewBox="0 0 ${width} ${height}" class="trend-svg pro" role="img" aria-label="Verloop ${escapeHtml(M.label.toLowerCase())} per ${escapeHtml(periodWord)}">
        ${showBand ? `<rect class="band-normal" x="${left.toFixed(1)}" y="${yFor(s.bandHi).toFixed(1)}" width="${(xEnd - left).toFixed(1)}" height="${Math.max(0, yFor(s.bandLo) - yFor(s.bandHi)).toFixed(1)}"></rect>` : ""}
        ${yTicks.map(val => { const y = yFor(val); return `<line class="grid" x1="${left}" x2="${width - right}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="axis-tick" x="${left - 12}" y="${(y + 4).toFixed(1)}" text-anchor="end">${escapeHtml(M.axis(val))}</text>`; }).join("")}
        <line class="avg-line" x1="${left}" x2="${xEnd.toFixed(1)}" y1="${yFor(s.avg).toFixed(1)}" y2="${yFor(s.avg).toFixed(1)}"></line>
        <text class="avg-label" x="${(xEnd).toFixed(1)}" y="${(yFor(s.avg) - 6).toFixed(1)}" text-anchor="end">gemiddeld</text>
        ${fcArea}
        <polygon class="trend-area" points="${areaPts}"></polygon>
        <polyline class="trend-mainline" points="${linePts}" fill="none"></polyline>
        ${fcLine}
        ${marks}
        ${fcDots}
        ${fcAxis}
      </svg>
      <div class="trend-legend">
        <span><i class="lg-line"></i>Verloop ${escapeHtml(M.label.toLowerCase())}</span>
        <span><i class="lg-band"></i>Normaalzone (gem. ± spreiding)</span>
        <span><i class="lg-out"></i>Uitschieter</span>
        ${fc ? `<span><i class="lg-fc"></i>Prognose</span>` : ""}
      </div>
      <p class="chart-note">${escapeHtml(`${s.n} van ${s.fullN} ${PERIOD_TYPES[type].plural} in beeld (bereik = alleen de zoom). Gemiddelde, normaalzone${outCount ? `, ${outCount} uitschieter${outCount === 1 ? "" : "s"}` : ""} en prognose zijn berekend over de volledige historie (${s.fullN} ${PERIOD_TYPES[type].plural}).`)}${fc ? escapeHtml(` Prognose: ${fc.method}${fc.excluded ? `, ${fc.excluded} uitschieter(s) gladgestreken` : ""} — de band toont de onzekerheid.`) : ""} <span class="chart-note-hint">Klik een punt om die ${escapeHtml(periodWord)} bovenin te openen.</span></p>`;
  }

  // Periodetotalen-tabel: elke periode vs de vorige (maand vs maand, etc.).
  function renderPeriodTotals(ctx) {
    if (!els.periodTotals) return;
    const type = ctx.type;
    const keys = ctx.periodStats.keys;
    const totals = ctx.periodStats.totals;
    const counts = ctx.periodStats.counts;
    if (!keys.length) { els.periodTotals.innerHTML = `<div class="empty-state">Geen periodes beschikbaar.</div>`; return; }
    const rows = keys.map((key, index) => {
      const prevTotal = index > 0 ? totals[index - 1] : null;
      const deltaPct = prevTotal ? ((totals[index] - prevTotal) / prevTotal) * 100 : null;
      const delta = prevTotal !== null ? totals[index] - prevTotal : null;
      return { key, total: totals[index], count: counts[index], deltaPct, delta };
    }).reverse();
    const maxTotal = Math.max(...totals, 1);

    els.periodTotals.innerHTML = `
      <table class="periods">
        <thead>
          <tr>
            <th>${escapeHtml(PERIOD_TYPES[type].label)}</th>
            <th class="num">Totaal</th>
            <th class="num">Aantal</th>
            <th class="num">Δ % vs vorige</th>
            <th class="num">Δ bedrag</th>
            <th class="bar-col">Omvang</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(row => `
            <tr class="${row.key === ctx.key ? "row-selected" : ""} ${row.key === ctx.latestKey ? "row-latest" : ""}" data-period-key="${escapeHtml(row.key)}">
              <td><strong>${escapeHtml(labelPeriod(type, row.key))}</strong>${row.key === ctx.latestKey ? ` <span class="pill pill-latest">Nieuwste</span>` : ""}</td>
              <td class="num strong">${formatMoney(row.total)}</td>
              <td class="num">${formatNumber(row.count)}</td>
              <td class="num ${row.deltaPct === null ? "muted" : costTrendClass(row.deltaPct)}">${row.deltaPct === null ? "—" : `${trendArrow(row.deltaPct)} ${formatSignedPercent(row.deltaPct, 1)}`}</td>
              <td class="num ${row.delta === null ? "muted" : costTrendClass(row.delta)}">${row.delta === null ? "—" : formatSignedMoney(row.delta)}</td>
              <td class="bar-col"><span class="cell-bar"><i class="neutral" style="width:${Math.max(2, (row.total / maxTotal) * 100)}%"></i></span></td>
            </tr>`).join("")}
        </tbody>
      </table>
      <p class="table-note">Klik een rij om die ${escapeHtml(PERIOD_TYPES[type].label.toLowerCase())} bovenin te openen.</p>`;
  }

  // Aantallen per herkomst (Klantenservice vs Retouren) over tijd.
  function getHerkomstSeries(type) {
    const search = normalizeKey(state.reasonSearch);
    const recs = state.records.filter(r => !search || normalizeKey(r.reason).includes(search));
    const map = new Map();
    recs.forEach(r => {
      const key = periodKeyForRecord(r, type); if (!key) return;
      const e = map.get(key) || { ksCount: 0, retCount: 0, ksAmt: 0, retAmt: 0 };
      if (r.origin === "Retouren") { e.retCount += r.count; e.retAmt += r.amount; } else { e.ksCount += r.count; e.ksAmt += r.amount; }
      map.set(key, e);
    });
    const keys = Array.from(map.keys()).sort((a, b) => periodSortValue(type, a) - periodSortValue(type, b));
    return { keys, rows: keys.map(k => map.get(k)) };
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
    const cur = hs.rows[idx], prev = idx > 0 ? hs.rows[idx - 1] : null;
    const totCount = cur.retCount + cur.ksCount, totAmt = cur.retAmt + cur.ksAmt;
    const retShare = totCount ? (cur.retCount / totCount) * 100 : 0;
    const retShareAmt = totAmt ? (cur.retAmt / totAmt) * 100 : 0;
    const KS_C = "#3f6f92", RET_C = "#d1852f";
    const dTxt = d => d === null ? "geen vorige" : `${trendArrow(d)} ${d > 0 ? "+" : d < 0 ? "−" : ""}${formatNumber(Math.abs(d))} vs ${prevWord}`;
    const retCd = prev ? cur.retCount - prev.retCount : null;
    const ksCd = prev ? cur.ksCount - prev.ksCount : null;

    const cards = [
      { swatch: RET_C, value: formatNumber(cur.retCount), label: `Retouren · ${formatMoney(cur.retAmt)}`, sub: dTxt(retCd), delta: retCd },
      { swatch: KS_C, value: formatNumber(cur.ksCount), label: `Klantenservice · ${formatMoney(cur.ksAmt)}`, sub: dTxt(ksCd), delta: ksCd },
      { swatch: RET_C, value: formatPercent(retShare, 0), label: "Aandeel retouren (aantal)", sub: `${formatPercent(retShareAmt, 0)} van het bedrag`, delta: 0, plain: true },
    ];

    els.originSplit.innerHTML = `
      <div class="origin-head"><strong>${escapeHtml(labelPeriod(type, hs.keys[idx]))}</strong><span>${formatNumber(totCount)} creditaties · ${formatMoney(totAmt)} totaal</span></div>
      <div class="trend-stats">${cards.map(c => `<div class="trend-stat os-stat ${!c.plain && c.delta > 0 ? "alert" : ""}"><span class="os-swatch" style="background:${c.swatch}"></span><strong>${escapeHtml(c.value)}</strong><span>${escapeHtml(c.label)}</span><em class="${c.plain ? "" : costTrendClass(c.delta)}">${escapeHtml(c.sub)}</em></div>`).join("")}</div>
      <div class="split-bar" role="img" aria-label="Verdeling retouren versus klantenservice">
        <div class="split-seg ret" style="flex:${Math.max(retShare, 3)}">${retShare >= 12 ? `<span>Retouren ${formatPercent(retShare, 0)}</span>` : ""}</div>
        <div class="split-seg ks" style="flex:${Math.max(100 - retShare, 3)}">${(100 - retShare) >= 12 ? `<span>Klantenservice ${formatPercent(100 - retShare, 0)}</span>` : ""}</div>
      </div>
      <p class="chart-note">Aantallen en bedragen per herkomst, deze ${escapeHtml(periodWord)} vergeleken met de vorige.</p>`;
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
      { label: "Bedrag uit buurregel", value: quality.recoveredAmountRows || 0, tone: quality.recoveredAmountRows ? "warning" : "" },
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
      els.controlBar.hidden = true; els.dashboard.hidden = true; return;
    }
    if (!state.records.length) state.activeTab = "control";
    els.controlBar.hidden = !state.records.length;
    els.dashboard.hidden = false;
    renderTabs();
    if (!state.records.length) return;
    renderControls();
    const ctx = getDashboardContext();
    renderHero(ctx);
    renderFocusRow(ctx);
    renderGroupBreakdown(ctx);
    renderSignals(ctx);
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
      .map(row => ({
        periode: labelPeriod(ctx.type, ctx.key),
        vorige_periode: ctx.previousKey ? labelPeriod(ctx.type, ctx.previousKey) : "",
        reden: row.reason,
        groep: (GROUP_BY_KEY.get(row.groupKey) || {}).short || "Overig",
        bedrag: row.currentAmount.toFixed(2),
        aantal: row.currentCount,
        pct_van_totaal: row.currentShare.toFixed(2),
        vorig_pct_van_totaal: row.previousShare.toFixed(2),
        verschil_pct_punt: row.shareDelta.toFixed(2),
        verschil_bedrag: row.amountDelta.toFixed(2),
      }));
    rows.push({
      periode: labelPeriod(ctx.type, ctx.key), vorige_periode: ctx.previousKey ? labelPeriod(ctx.type, ctx.previousKey) : "",
      reden: "EINDTOTAAL", groep: "", bedrag: ctx.current.total.toFixed(2), aantal: ctx.current.count,
      pct_van_totaal: "100.00", vorig_pct_van_totaal: ctx.previous.total ? "100.00" : "",
      verschil_pct_punt: "", verschil_bedrag: (ctx.current.total - ctx.previous.total).toFixed(2),
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
    els.dropZone.querySelector("strong").textContent = file.name;
    els.dropZone.querySelector("span").textContent = `${formatNumber(parsed.quality.parsedRows)} regels verwerkt · ${formatNumber(parsed.quality.storedRecords)} blokken opgeslagen. Klaar — bekijk het overzicht hieronder.`;
    renderDashboard();
  }

  function clearHistory() {
    if (!state.records.length) return;
    if (!window.confirm("Alle lokaal bewaarde creditanalyse wissen?")) return;
    state.records = []; state.meta = null; state.quality = null;
    state.selectedKey = ""; state.selectedTrendKey = ""; state.activeTab = "overview"; state.selectedGroupFilter = "";
    if (HAS_STORAGE) { localStorage.removeItem(STORAGE_KEY); localStorage.removeItem(META_KEY); }
    els.dropZone.querySelector("strong").textContent = "Zet hier het vrijdagbestand neer";
    els.dropZone.querySelector("span").textContent = "Sleep het Excel-bestand hierheen of kies het. De app bewaart alleen geaggregeerde cijfers — geen klantnamen of ordernummers.";
    renderDashboard();
  }

  function showError(error) {
    if (!els.dropZone) return;
    els.dropZone.classList.remove("is-dragging");
    els.contextStrip.hidden = false;
    els.contextStrip.innerHTML = `
      <div class="context-item context-error">
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
    const previousLabel = ctx.previousKey ? labelPeriod(ctx.type, ctx.previousKey) : `geen vorige ${PERIOD_TYPES[ctx.type].label.toLowerCase()}`;
    const h = ctx.headline;
    const avgPerCredit = ctx.current.count ? ctx.current.total / ctx.current.count : 0;
    const countDelta = ctx.current.count - ctx.previous.count;
    const preventable = ctx.groupComparison.find(group => group.key === PREVENTABLE_GROUP) || { amount: 0, share: 0, amountDelta: 0 };
    const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    const originText = state.origin === "all" ? "alle herkomsten" : state.origin;

    // Header
    font("bold", 19); set(INK); doc.text("Credit Analyse", M, y + 4);
    font("bold", 15); set(BAD); doc.text("ReMarkt", RIGHT, y + 4, { align: "right" });
    y += 9;
    font("normal", 10); set(MUT);
    doc.text(`${PERIOD_TYPES[ctx.type].label}rapport · ${periodLabel} vs ${previousLabel} · ${originText}`, M, y); y += 4.5;
    doc.text(`Opgesteld ${today}`, M, y); y += 3;
    doc.setDrawColor(INK[0], INK[1], INK[2]); doc.setLineWidth(0.5); doc.line(M, y, RIGHT, y); y += 7;

    // Verdict band
    const vFill = toneFill[h.tone] || toneFill.flat, vText = toneText[h.tone] || toneText.flat;
    doc.setFillColor(vFill[0], vFill[1], vFill[2]); doc.roundedRect(M, y, CW, 17, 2, 2, "F");
    font("bold", 13); set(vText); doc.text(h.title, M + 5, y + 7);
    font("normal", 9.5); set(INK);
    doc.text(h.hasPrevious ? `${formatSignedPercent(h.totalDeltaPct, 0)} t.o.v. ${previousLabel} — die was ${formatMoney(ctx.previous.total)}` : "Nog geen vorige periode om mee te vergelijken.", M + 5, y + 13);
    y += 23;

    // KPI cards
    const kpis = [
      { label: "Totaal teruggestort", value: formatMoney(ctx.current.total), sub: h.hasPrevious ? `${formatSignedPercent(h.totalDeltaPct, 0)} vs vorige` : "geen vorige", color: costColor(h.totalDeltaPct) },
      { label: "Aantal credits", value: formatNumber(ctx.current.count), sub: `${countDelta > 0 ? "+" : countDelta < 0 ? "-" : ""}${formatNumber(Math.abs(countDelta))} vs vorige`, color: costColor(countDelta) },
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
        { text: r.previousAmount === 0 && r.currentAmount > 0 ? "nieuw" : formatSignedPercent(r.shareDelta, 1), x: 172, align: "right", color: costColor(r.shareDelta), size: 8.5 },
        { text: r.previousAmount || r.currentAmount ? formatSignedMoney(r.amountDelta) : "—", x: RIGHT, align: "right", color: costColor(r.amountDelta), size: 8.5 },
      ]);
    });
    ensure(6);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.3); doc.line(M, y - 1, RIGHT, y - 1);
    cols([
      { text: "Eindtotaal", x: M, bold: true },
      { text: formatMoney(ctx.current.total), x: 92, align: "right", bold: true },
      { text: "100%", x: 118, align: "right", bold: true },
      { text: ctx.previous.total ? "100%" : "—", x: 146, align: "right", color: MUT },
      { text: h.hasPrevious ? formatSignedPercent(h.totalDeltaPct, 1) : "—", x: 172, align: "right", bold: true, color: costColor(h.totalDeltaPct) },
      { text: h.hasPrevious ? formatSignedMoney(h.totalDelta) : "—", x: RIGHT, align: "right", bold: true, color: costColor(h.totalDelta) },
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
    const trendKeys = ctx.periodStats.keys.slice(-Math.min(12, PERIOD_TYPES[ctx.type].pickLimit));
    const trendTotals = trendKeys.map(key => ctx.periodStats.totals[ctx.periodStats.keys.indexOf(key)] || 0);
    if (trendKeys.length) {
      sectionTitle(`Verloop laatste ${trendKeys.length} ${PERIOD_TYPES[ctx.type].plural}`);
      const chartX = M, chartY = y, chartW = CW, chartH = 32;
      const chartMax = Math.max(...trendTotals, 1);
      const barGap = 3, barW = (chartW - barGap * (trendKeys.length - 1)) / trendKeys.length;
      const avgY = chartY + chartH - ((ctx.periodStats.avg / chartMax) * chartH);
      doc.setDrawColor(LINE[0], LINE[1], LINE[2]); doc.setLineWidth(0.2); doc.roundedRect(chartX, chartY, chartW, chartH, 1.5, 1.5);
      doc.setDrawColor(GOOD[0], GOOD[1], GOOD[2]); doc.setLineWidth(0.4); doc.setLineDashPattern([2, 2], 0);
      doc.line(chartX + 2, avgY, chartX + chartW - 2, avgY); doc.setLineDashPattern([], 0);
      trendKeys.forEach((key, index) => {
        const x = chartX + index * (barW + barGap);
        const barH = Math.max(1.5, (trendTotals[index] / chartMax) * (chartH - 7));
        const isCurrent = key === ctx.key;
        const fill = isCurrent ? BAD : DATA;
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.roundedRect(x + 1, chartY + chartH - barH - 5, Math.max(1, barW - 2), barH, 0.8, 0.8, "F");
        font(isCurrent ? "bold" : "normal", 7); set(isCurrent ? BAD : MUT);
        doc.text(shortPeriodLabel(ctx.type, key), x + (barW / 2), chartY + chartH - 1.5, { align: "center" });
      });
      font("normal", 7.5); set(MUT);
      doc.text(`Streeplijn = gemiddeld ${formatMoney(ctx.periodStats.avg)}`, chartX, chartY + chartH + 5);
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
    const previousLabel = ctx.previousKey ? labelPeriod(ctx.type, ctx.previousKey) : `geen vorige ${PERIOD_TYPES[ctx.type].label.toLowerCase()}`;
    const prevWord = PERIOD_TYPES[ctx.type].previousLabel;
    const originText = state.origin === "all" ? "alle herkomsten" : state.origin;
    const today = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
    const groups = ctx.groupComparison.slice().sort((a, b) => b.amount - a.amount);
    const rows = ctx.comparison.filter(r => r.currentAmount > 0 || r.previousAmount > 0).sort((a, b) => b.currentAmount - a.currentAmount);
    const shownRows = rows.slice(0, 15);
    const restCount = rows.length - shownRows.length;

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
    const tableTitleY = tilesY + tileH + 36;
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
    text(`${PERIOD_TYPES[ctx.type].label}rapport · ${periodLabel} vs ${previousLabel} · ${originText}`, P, 79, { size: 14.5, color: MUT });
    text(`Opgesteld ${today}`, P, 99, { size: 13, color: FAINT });
    hline(112, INK, 1);

    // ---- Blok 1: weektotaal ----
    text(`Totaal terugbetaald · ${PERIOD_TYPES[ctx.type].label.toLowerCase()}`, P, 150, { size: 15, color: MUT });
    text(formatMoney(ctx.current.total), P, 214, { size: 60, weight: "800" });
    const deltaTxt = h.hasPrevious
      ? `${h.totalDeltaPct > 0.05 ? "▲" : h.totalDeltaPct < -0.05 ? "▼" : "→"} ${formatSignedPercent(h.totalDeltaPct, 0)} t.o.v. ${prevWord} — die was ${formatMoney(ctx.previous.total)}`
      : `Nog geen vorige ${PERIOD_TYPES[ctx.type].label.toLowerCase()} om mee te vergelijken`;
    text(deltaTxt, P, 240, { size: 16, weight: "700", color: h.hasPrevious ? costColor(h.totalDeltaPct) : FAINT });
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

    // ---- Blok 3: alle redenen ----
    text("Alle redenen — vs vorige " + PERIOD_TYPES[ctx.type].label.toLowerCase(), P, tableTitleY, { size: 17, weight: "700" });
    const colBedrag = 596, colShare = 716, colDelta = 856, colDeltaE = RIGHT;
    text("Reden", P, tableHeadY, { size: 11.5, weight: "700", color: MUT });
    text("Bedrag", colBedrag, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    text("% totaal", colShare, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    text(`vs vorige ${PERIOD_TYPES[ctx.type].label.toLowerCase()}`, colDelta, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    text("Δ bedrag", colDeltaE, tableHeadY, { size: 11.5, weight: "700", color: MUT, align: "right" });
    hline(tableHeadY + 10, LINE2, 1);

    let ty = rowsStartY;
    shownRows.forEach(r => {
      const rowY = ty + rowH - 10;
      const isNew = r.previousAmount === 0 && r.currentAmount > 0;
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
    text(h.hasPrevious ? `${h.totalDeltaPct > 0.05 ? "▲" : h.totalDeltaPct < -0.05 ? "▼" : "→"} ${formatSignedPercent(h.totalDeltaPct, 1)}` : "—", colDelta, totY, { size: 15, weight: "800", color: costColor(h.totalDeltaPct), align: "right" });
    text(h.hasPrevious ? formatSignedMoney(h.totalDelta) : "—", colDeltaE, totY, { size: 15, weight: "800", color: costColor(h.totalDelta), align: "right" });

    // Footer
    text("ReMarkt Credit Analyse · geaggregeerde cijfers, zonder klantnamen of ordernummers.", P, H - 20, { size: 12, color: FAINT });

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
    document.querySelectorAll("[data-tab]").forEach(button => {
      button.addEventListener("click", () => { state.activeTab = button.dataset.tab; renderDashboard(); });
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
      if (getClosestTarget(event, "[data-clear-group]")) { state.selectedGroupFilter = ""; renderDashboard(); }
    });
    if (els.importBanner) {
      els.importBanner.addEventListener("click", event => {
        if (getClosestTarget(event, "[data-dismiss-banner]")) { state.importBannerDismissed = true; els.importBanner.hidden = true; }
      });
    }
  }

  if (IS_BROWSER) {
    wireEvents();
    renderDashboard();
    // Handvat voor previews/diagnose (niet nodig voor normaal gebruik).
    window.creditAnalyseApp = { state, getDashboardContext, generateReportImage, generateReportPdf, renderDashboard };
  }

  // Node-export voor tests (raakt de browser niet).
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      state, parseWorkbookRecords, mergeImportedRecords, aggregateRows, detectColumns,
      summarizeRecords, getReasonComparison, groupSummary, buildGroupComparison, getPeriodStats,
      getAvailablePeriodKeys, getPreviousKey, recordsForPeriod, filteredRecords,
      getDashboardContext, buildHeadline, focusStats, reasonGroupKey, makePeriodKeys,
      parseMoney, parseDateValue, correctYearNumber, labelPeriod, periodSortValue,
      renderDashboard, generateReportPdf, generateReportImage, exportCurrentCsv, buildPlainConclusion,
      forecastSeries, nextPeriodKey,
      FOCUS_REASONS, REASON_GROUPS, PREVENTABLE_GROUP,
    };
  }
}());
