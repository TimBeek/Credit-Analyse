# Statistisch onderzoek ReMarkt Credit Analyse

Onderzoeksdatum: 25 juli 2026

## Doel

Deze notitie legt vast welke statistische en visuele keuzes in de app worden
gebruikt. Het doel is niet om zoveel mogelijk grafieken te tonen, maar om drie
managementvragen betrouwbaar te beantwoorden:

1. Is de hoeveelheid terugbetaalde credits structureel veranderd?
2. Welke redenen veroorzaken de meeste kosten en de grootste verandering?
3. Is een prognose aantoonbaar bruikbaarder dan een eenvoudige referentie?

## Onderzochte richtlijnen

### Procesbeheersing

- [NIST - Individuals Control Charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc322.htm)
  beschrijft de I-MR-methode voor een reeks met een enkele waarneming per
  meetmoment. De procesvariatie wordt geschat uit de moving range tussen
  opeenvolgende waarnemingen. De grenzen zijn het gemiddelde plus of min drie
  maal `MR-gemiddelde / 1,128`.
- [NIST - What are Control Charts?](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc31.htm)
  maakt onderscheid tussen gewone variatie en een signaal dat onderzoek naar
  een bijzondere oorzaak rechtvaardigt.
- [NIST - Variables Control Charts](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc32.htm)
  beschrijft aanvullende signalen zoals acht punten aan dezelfde kant van het
  gemiddelde en zes opeenvolgend stijgende of dalende punten. NIST waarschuwt
  ook dat extra regels meer valse meldingen kunnen geven.

Besluit voor de app:

- vervang `gemiddelde + 1,5 standaardafwijking` door I-MR-procesgrenzen;
- activeer formele signalering pas bij minimaal 20 bruikbare meetpunten en
  benoem minder dan 25 punten als een voorlopige basis;
- toon een punt buiten drie-sigma-grenzen als primair signaal;
- toon een lange verschuiving of trend alleen als secundair signaal;
- sluit bevestigde administratieve inhaalweken uit van de basis, maar laat de
  werkelijke uitbetaling zichtbaar.

### Prognoses

- [Forecasting: Principles and Practice - time series cross-validation](https://otexts.com/fpp3/tscv.html)
  adviseert rolling-origin evaluatie: ieder testpunt wordt alleen voorspeld met
  informatie die daarvoor beschikbaar was.
- [Forecasting: Principles and Practice - benchmark methods](https://otexts.com/fpp2/simple-methods.html)
  benadrukt dat een simpele naive of seasonal-naive methode altijd als
  benchmark moet worden gebruikt en soms de beste voorspeller is.
- [Forecasting: Principles and Practice - prediction intervals](https://otexts.com/fpp3/prediction-intervals.html)
  stelt dat een puntprognose vrijwel geen waarde heeft zonder zichtbare
  onzekerheid en dat intervallen breder horen te worden bij een langere horizon.
- [Forecasting: Principles and Practice - exponential smoothing](https://otexts.com/fpp3/expsmooth.html)
  ondersteunt exponentiele smoothing als praktische methode voor operationele
  tijdreeksen.

Besluit voor de app:

- behoud gedempte exponential smoothing als kandidaatmodel;
- meet de fout met rolling-origin backtests;
- vergelijk die fout met een naive voorspelling;
- gebruik de naive methode wanneer die historisch beter presteert;
- toon testomvang, gemiddelde absolute fout en winst/verlies versus benchmark;
- publiceer geen forecast bij minder dan acht aaneengesloten perioden;
- toon een 80%-voorspelband in gewone taal.

### Kostenoorzaken en aandelen

- [ASQ - Pareto Chart](https://asq.org/quality-resources/pareto) adviseert
  categorieen aflopend op kosten of frequentie te sorteren en het cumulatieve
  aandeel te tonen om de belangrijkste oorzaken te vinden.
- [Aitchison - The Statistical Analysis of Compositional Data](https://rss.onlinelibrary.wiley.com/doi/10.1111/j.2517-6161.1982.tb01195.x)
  laat zien dat aandelen samen een vaste som vormen. Een aandeel kan daardoor
  stijgen omdat een andere categorie daalt, zonder dat de eigen eurokosten
  stijgen.

Besluit voor de app:

- toon een Pareto-overzicht op werkelijk creditbedrag;
- toon daarnaast een aparte divergerende grafiek voor verandering in euro;
- blijf zowel bedrag, aantal, aandeel als procentpuntverschil tonen;
- label `% van totaal` expliciet als creditmix, niet als retourpercentage van
  alle verkopen.

### Vertraagde verwerking en revisies

- [Microsoft - Understand star schema and the importance for Power BI](https://learn.microsoft.com/en-au/power-bi/guidance/star-schema)
  beschrijft dat feiten verschillende datumrollen kunnen hebben. Voor deze app
  zijn dat de werkelijke betaaldatum en de operationele week waarop de retouren
  betrekking hebben.
- [AWS - Reprocess late-arriving data](https://docs.aws.amazon.com/timestream/latest/developerguide/scheduledqueries-patterns-latearrive.html)
  behandelt vertraagd binnenkomende gegevens als een apart herstelproces, zodat
  reeds verwerkte tijdvakken controleerbaar opnieuw kunnen worden berekend.
- [ONS - Guide to statistical revisions](https://www.ons.gov.uk/methodology/methodologytopicsandstatisticalconcepts/revisions/guidetostatisticalrevisions)
  adviseert revisies transparant te markeren en gebruikers uit te leggen wat is
  gewijzigd en waarom.
- Het [IFRS Conceptual Framework](https://www.ifrs.org/content/dam/ifrs/publications/pdf-standards/english/2024/issued/part-a/conceptual-framework-for-financial-reporting.pdf?bypass=on)
  ondersteunt het toerekenen van effecten aan de periode waarop ze economisch
  betrekking hebben, los van het kasmoment.

Besluit voor de app:

- behoud iedere geïmporteerde credit op de werkelijke betaaldatum;
- voeg alleen bij een bevestigde uitzondering een aparte operationele
  Retouren-toerekening toe;
- laat Klantenservice en andere herkomsten ongemoeid;
- bied zowel **Operationeel** als **Werkelijk betaald** aan;
- bewaar het gecombineerde eurototaal exact en toon een reconciliatie voor en
  na de correctie;
- sluit gecorrigeerde perioden uit van procesgrenzen en pauzeer prognoses in de
  werkelijke betaalweergave, omdat die piek administratief is;
- pas dit alleen handmatig toe wanneer de dubbele batch echt is bevestigd.

### Grafiekontwerp en toegankelijkheid

- [ONS - Line chart](https://service-manual.ons.gov.uk/data-visualisation/chart-types/line-chart)
  adviseert een gat in de lijn wanneer een reguliere periode ontbreekt en
  context of annotaties voor bijzondere gebeurtenissen.
- [Government Analysis Function - Data visualisation charts](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-charts/)
  adviseert beperkte, lichte gridlines, directe labels en weinig lijnen per
  grafiek.
- [W3C WCAG 2.2 - Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color)
  vereist dat kleur niet de enige informatiedrager is.
- [W3C WCAG 2.2 - Non-text Contrast](https://www.w3.org/WAI/WCAG22/understanding/non-text-contrast.html)
  vereist voldoende contrast voor betekenisvolle grafische elementen.

Besluit voor de app:

- ontbrekende perioden worden niet als nul behandeld en niet overbrugd;
- stijging en daling krijgen naast kleur ook richting, tekst en teken;
- grafieken behouden een toegankelijke tekstsamenvatting en onderliggende tabel;
- forecast, procesgrenzen en werkelijke waarden krijgen verschillende lijnstijlen.

## Belangrijke beperking

De huidige import bevat credits, maar geen totaal aantal verkopen, omzet of
uitgeleverde orders. Daardoor kan de app nog geen echte retourratio of
creditkosten als percentage van omzet berekenen. `% van totaal` betekent alleen
het aandeel binnen de uitbetaalde credits. Voor een echte rate-analyse is later
een betrouwbare noemer per periode nodig.
