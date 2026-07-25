# ReMarkt Credit Analyse App

Los project naast de grading-app. KS en Retouren blijven in Excel werken; op vrijdag wordt het Excelbestand in deze app geïmporteerd voor vaste analyse.

De app is gebouwd rond één vraag van de directie: **per reden het % van het totale teruggestorte bedrag, deze periode vergeleken met de vorige, met het verschil** — en dat voor week, maand, kwartaal én jaar. Zo zie je in één oogopslag welke onderwerpen in verhouding stijgen of dalen en waar extra aandacht nodig is.

## Starten

```powershell
npm run dev
```

Open daarna: `http://localhost:8091/`

## Wat de app laat zien

**Overzicht & vergelijking**
- **Hero:** het totaal teruggestort van de gekozen periode, groot, met het **verschil in % t.o.v. de vorige periode** (bv. €14.699, +30% t.o.v. vorige week) en t.o.v. het gemiddelde. Rood = hoger, groen = lager. Plus een gewone-taal conclusiezin voor wie geen analist is.
- **Focustegels:** *Niet akkoord met ALT* en *Niet werkzaam* (door Wout genoemd) plus *Voorkombaar (onze fout)* — elk met het % van het totaal en de beweging (bv. "vorige week 23,0% → nu 23,2%").
- **Waar zit het in:** de ~40 redenen gebundeld in vijf groepen met een compositiebalk en **bedrag groot** per groep. De groepen zijn **knoppen**: klik een groep om de tabel eronder te filteren op alleen die redenen (met subtotaal). Voorkombaar (onze fout) staat rood.
- **Kostendrijvers:** een Pareto-overzicht laat zien hoeveel redenen samen minimaal 80% van het creditbedrag vormen. Een tweede grafiek rangschikt de grootste stijgers en dalers in euro's ten opzichte van de vergelijkingsperiode.
- **Vergelijktabel (de kern):** per reden het bedrag, aantal, **% van totaal nu**, **% vorige periode**, **verschil aandeel (%-punt)** en **verschil €**. De kolommen zijn sorteerbaar en blijven bruikbaar met toetsenbord en schermlezer. Met een uitlegregel en gemarkeerde focusredenen/voorkombare fouten.
- **Belangrijke definitie:** “% van totaal” is de verdeling binnen alle uitbetaalde credits. Een echte retourratio vereist later een noemer, bijvoorbeeld orders, omzet of verkochte apparaten.

**Verloop per periode**
- Professionele tijdreeks van bedrag, aantal of gemiddeld creditbedrag met bereik 13/26/52/alles. Ontbrekende kalenderperioden blijven zichtbare gaten en worden niet als nul of als aansluitende lijn geïnterpreteerd.
- **I-MR-procesgrenzen:** de proceslijn en drie-sigma-grenzen gebruiken de moving range van opeenvolgende bruikbare perioden. Formele signalering start bij 20 meetpunten en is tot 25 punten als voorlopig gemarkeerd. Administratieve inhaalparen tellen niet mee.
- **Gevalideerde prognose** (aan/uit): ETS wordt met rolling-origin backtests vergeleken met een naïeve referentie. De beste methode wordt gekozen, gemiddelde absolute fout (MAE) wordt getoond en de 80%-onzekerheidsband groeit met de horizon. Minder dan acht aaneengesloten perioden geeft bewust geen prognose.
- **Retouren vs Klantenservice:** aantallen per periode gesplitst naar herkomst, zodat je ziet of de retouren dalen of stijgen.
- **Periodetotalen-tabel:** elk totaal met het verschil in % en euro's t.o.v. de periode ervoor — maand-op-maand, kwartaal-op-kwartaal, jaar-op-jaar.
- **Inhaalweekcorrectie:** een bijna lege betaalweek gevolgd door een dubbele betaalweek wordt als één administratieve inhaalronde herkend. Het werkelijke uitbetaalde bedrag blijft zichtbaar; vergelijkingen gebruiken het gemiddelde van beide weken tegenover de laatste normale referentieweek. Dit werkt door in overzicht, redenen, groepen, herkomst, CSV, PDF en PNG.

**Import & controle**
- Wat is verwerkt, hersteld of overgeslagen bij de laatste import, plus onbekende redenen met suggesties.

## Filters

Bovenin kies je **periode** (week/maand/kwartaal/jaar), **welke** periode, **herkomst** (alle / Klantenservice / Retouren) en je kunt op reden zoeken. De hele analyse en het % van totaal rekenen mee met de gekozen herkomst.

## Aanleveren aan de baas

- **Afbeelding voor Wout (PNG):** één knop maakt een nette PNG-samenvatting met totaal, groepen, Pareto-concentratie, grootste veranderingen en de vergelijktabel met eindtotaal. Volgt de gekozen periode en herkomst.
- **Schermweergave:** het overzicht is ook strak genoeg om zelf een screenshot van te maken.
- **Rapport (PDF):** verzorgd rapport van de gekozen periode — hero, focusredenen, de volledige vergelijktabel, per groep, het verloop en de signalen.
- **CSV:** exporteert de vergelijktabel om zelf mee te rekenen.

## Foutafhandeling bij import (pijnpunten)

De app schoont bekende fouten automatisch op en meldt dat in gewone taal bovenin (en volledig in "Import & controle"):
- **Lege datum** → overgenomen van de regel erboven/eronder (of afgeleid uit weeknummer + jaar).
- **Leeg week/jaar** → overgenomen van een buurregel.
- **Leeg of ongeldig bedrag** → de regel wordt veilig overgeslagen en met rijnummer gemeld. Een geldbedrag wordt nooit uit een buurregel gegokt; corrigeer de bronregel in Excel en importeer opnieuw.
- **Fout jaartal** → automatisch gecorrigeerd: `2202 → 2022`, `226 → 2026`, `24 → 2024` (alleen als de uitkomst een geloofwaardig jaar is).
- **Lege reden** → op "Overige" gezet; **onbekende reden** → met suggestie gemeld.

## Privacy

Alles blijft lokaal in de browser. Klantnaam en ordernummer worden bij import herkend maar **nooit opgeslagen** — alleen periode, reden, herkomst, bedrag en aantal. De analyse wordt bovendien **na 30 minuten zonder gebruik automatisch gewist**, zodat er geen data blijft staan op een gedeeld apparaat.

## Ontwikkeling / kwaliteit

```powershell
npm run check   # syntax-check
npm test        # rekenkern + import + privacy + kalendergaten + I-MR + forecast (99 checks)
node tools/render-smoke.cjs   # render-laag + PDF + PNG bouwen zonder crash
node tools/make-preview.cjs   # (optioneel) preview-pagina's met testdata voor screenshots
```

De statistische ontwerpkeuzes en primaire bronnen staan in
[`STATISTICAL-RESEARCH.md`](STATISTICAL-RESEARCH.md).

## Online zetten (GitHub Pages)

De app is volledig statisch — geen server nodig. Iedereen van KS opent dezelfde link en importeert zelf het vrijdagbestand; de data blijft lokaal in elke browser.

1. Maak op github.com een nieuwe (lege) repository, bijvoorbeeld `remarkt-credit-analyse` (public).
2. Koppel deze map en push (Git staat al klaar in deze map):
   ```powershell
   git remote add origin https://github.com/<jouw-account>/remarkt-credit-analyse.git
   git push -u origin main
   ```
3. Ga in de repo naar **Settings → Pages** → *Build and deployment* → Source: **Deploy from a branch** → Branch: **main** / **/(root)** → Save.
4. Na ~1 minuut staat de app op `https://<jouw-account>.github.io/remarkt-credit-analyse/`. Deel die link met KS.

Het bestand `.nojekyll` zorgt dat GitHub de map onbewerkt serveert. Alle paden zijn relatief, dus de app werkt ook onder de `/remarkt-credit-analyse/`-submap. Een update uitrollen = gewoon opnieuw `git push`.
