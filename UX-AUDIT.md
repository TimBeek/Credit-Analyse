# UX- en productaudit ReMarkt Credit Analyse

Auditdatum: 25 juli 2026

## Productdoel

De app moet een wekelijkse Excel-export omzetten in een betrouwbaar besluitdocument:

1. wat is werkelijk terugbetaald;
2. welke redenen bepalen het totaal;
3. wat veranderde ten opzichte van een eerlijke referentie;
4. welke fouten zijn beïnvloedbaar;
5. kan het overzicht zonder extra uitleg naar management.

De primaire gebruiker is een operationele medewerker die importeert en controleert. De secundaire gebruiker is een manager die vooral de conclusie, afwijkingen en acties nodig heeft.

## Onderzoeksbasis

- [GOV.UK Design Principles](https://www.gov.uk/guidance/government-design-principles): start bij de gebruikersbehoefte, ontwerp met data en maak complexiteit begrijpelijk.
- [GOV.UK dashboard guidance](https://brand.design-system.service.gov.uk/data/dashboards/): gebruik een dashboard voor overzicht en samenhang, met controle over responsiviteit en toegankelijkheid.
- [Office for Statistics Regulation: Dashboards](https://osr.statisticsauthority.gov.uk/guidance/regulatory-guidance-dashboards/): communiceer bronkwaliteit, beperkingen en methodiek zodat cijfers betrouwbaar te interpreteren zijn.
- [Government Analysis Function: dashboard testing](https://analysisfunction.civilservice.gov.uk/policy-store/data-visualisation-testing-dashboards-for-design-and-accessibility/): bied chartdata ook toegankelijk aan en test ontwerp en interactie.
- [W3C Tables Tutorial](https://www.w3.org/WAI/tutorials/tables/): gebruik echte tabelkoppen, scopes en captions voor betekenisvolle relaties tussen cellen.
- [Microsoft Power BI accessibility guidance](https://learn.microsoft.com/en-us/power-bi/create-reports/desktop-accessibility-creating-reports): gebruik toetsenbordnavigatie, voldoende contrast, tekstalternatieven en nooit alleen kleur als betekenisdrager.
- [ONS: Using colours in charts](https://service-manual.ons.gov.uk/data-visualisation/colours/using-colours-in-charts): gebruik kleur consistent, met voldoende contrast en duidelijk onderscheid tussen categorieën.

## Bevindingen En Doorvoering

### 1. Inhaalweek was niet overal consequent

De hero gebruikte al een tweeweeksgemiddelde, maar ranking, herkomst, CSV en exports vergeleken nog met de bijna lege gemiste week. Daardoor verschenen onbruikbare verschillen van duizenden procenten.

Doorgevoerd:

- werkelijk uitbetaald bedrag blijft zichtbaar;
- gemiste plus ingehaalde week worden gemiddeld voor beoordeling;
- laatste normale week wordt automatisch referentieweek;
- dezelfde basis geldt voor redenen, groepen, aantallen, herkomst, CSV, PDF en PNG;
- historische tabel toont geen misleidende delta voor de gemiste ronde;
- I-MR-procesgrenzen en prognose worden niet door de administratieve uitzondering vervuild.

### 2. Ranking was informatief maar niet onderzoekbaar

Doorgevoerd:

- sorteren op reden, bedrag, aantal, aandeel en beide verschillen;
- expliciete referentie in kolomkoppen;
- eindtotaal toont geen percentage in de kolom "verschil aandeel";
- desktop behoudt een scanbare tabel;
- mobiel gebruikt compacte datakaarten en een eigen sorteerkeuze.

### 3. Geldbedrag uit een buurregel overnemen was te riskant

Een ontbrekend bedrag is geen invulbaar contextveld. Automatisch kopiëren kan een fout totaal opleveren dat er betrouwbaar uitziet.

Doorgevoerd:

- ontbrekende of ongeldige bedragen worden nooit geschat;
- de regel wordt uitgesloten en met rijnummer gemeld;
- de gebruiker corrigeert de bron in Excel en importeert opnieuw.

### 4. Grafieken waren visueel sterk maar methodisch niet volledig transparant

Doorgevoerd:

- lijnpunten blijven aanklikbaar en toetsenbordbedienbaar;
- grafieken hebben een programmatische titel en dynamische samenvatting;
- herkomstpunten openen nu ook de betreffende periode;
- inhaalweken pauzeren de prognose volledig, inclusief schaalberekening;
- gemiste en ingehaalde betaalweek tellen niet mee in de I-MR-procesbasis;
- de ruwe piek blijft zichtbaar, zodat de financiële werkelijkheid niet wordt weggepoetst.

### 5. Toegankelijkheid en bediening hadden gaten

Doorgevoerd:

- echte tabrollen, selectie-status en pijltjestoetsbediening;
- captions, kolomscopes en rijscopes voor tabellen;
- sorteerstatus via `aria-sort`;
- toetsenbordbediening voor bestand kiezen, grafiekpunten en historische rijen;
- importfouten als live foutmelding;
- donkerdere tekst- en actiekleuren met behoud van de warme ReMarkt-stijl;
- skiplink naar de analyse.

## Resterende Roadmap

### Prioriteit 1: bevestiging van een inhaalweek

De detectie is bewust conservatief, maar blijft een statistische aanname. Voeg een bediening toe waarmee de gebruiker de voorgestelde correctie bevestigt, uitschakelt of handmatig twee betaalweken koppelt. Sla die keuze alleen lokaal op als rapportmetadata.

### Prioriteit 1: managementdoelen

Een trend vertelt wat gebeurde, maar niet of het acceptabel is. Voeg pas na akkoord vaste doelen toe, bijvoorbeeld maximaal creditbedrag per omzet, maximaal aandeel voorkombaar en een norm voor specifieke focusredenen. Zonder overeengekomen norm zou de app schijnzekerheid geven.

### Prioriteit 2: importreview voor publicatie

Maak een compacte controlepoort vóór PDF/PNG-export: ontbrekende bedragen, onbekende redenen, mogelijke dubbelen en negatieve bedragen moeten expliciet zijn bekeken. Blokkeer export alleen bij financieel onvolledige regels; waarschuwingen mogen met bevestiging door.

### Prioriteit 2: redenbeheer

Beheer aliases en groepsindeling vanuit één versieerbare legenda. Toon bij onbekende redenen een voorgestelde match met een keuze "accepteren" of "als nieuw bewaren".

### Prioriteit 2: toegankelijke PDF

De visuele PDF is geschikt voor management, maar jsPDF maakt niet automatisch een volledig getagde PDF voor schermlezers. Voor formele toegankelijkheid is een HTML-printversie of server-side tagged-PDF-route nodig.

### Prioriteit 3: onderhoudbaarheid

De app is nog één groot JavaScript-bestand en de stylesheet bevat historische themalagen. Splits bij een volgende technische fase import, analyse, rapportage en rendering in modules. Doe dit pas met browsertests rond import, filters, exports en inhaalweken om gedragsregressies te voorkomen.

## Acceptatiecriteria Voor Volgende Releases

- Een getal heeft altijd een zichtbare periode, eenheid en vergelijkingsbasis.
- Geen financieel bedrag wordt automatisch geraamd.
- Een chartinzicht is ook als tekst of tabel beschikbaar.
- Alle kernacties werken met toetsenbord.
- Kleur is nooit de enige drager van stijging, daling of status.
- Desktop, 390 px mobiel, PNG en A4-PDF worden visueel gecontroleerd.
- Rekenkern, import en render-smoke zijn volledig groen vóór publicatie.
