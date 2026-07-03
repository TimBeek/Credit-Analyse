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
- **Vergelijktabel (de kern):** per reden het bedrag, aantal, **% van totaal nu**, **% vorige periode**, **verschil aandeel (%-punt)** en **verschil €**. Onderaan het eindtotaal met het %-verschil. Met een uitlegregel en gemarkeerde focusredenen/voorkombare fouten.

**Verloop per periode**
- Professionele lijn/vlak-grafiek van het totaal per week/maand/kwartaal/jaar, met filters (**Bedrag / Aantal / Gemiddeld**, bereik 13/26/52/alles), een **normaalzone** (gemiddelde ± spreiding), rood gemarkeerde **uitschieters** en klikbare punten.
- **Prognose** (aan/uit): exponential smoothing (ETS) — automatisch **Holt-Winters** met seizoen bij ≥2 volledige cycli, anders een **gedempte trend** (schiet niet door); uitschieters worden eerst gladgestreken en de band toont de onzekerheid.
- **Retouren vs Klantenservice:** aantallen per periode gesplitst naar herkomst, zodat je ziet of de retouren dalen of stijgen.
- **Periodetotalen-tabel:** elk totaal met het verschil in % en euro's t.o.v. de periode ervoor — maand-op-maand, kwartaal-op-kwartaal, jaar-op-jaar.

**Import & controle**
- Wat is verwerkt, hersteld of overgeslagen bij de laatste import, plus onbekende redenen met suggesties.

## Filters

Bovenin kies je **periode** (week/maand/kwartaal/jaar), **welke** periode, **herkomst** (alle / Klantenservice / Retouren) en je kunt op reden zoeken. De hele analyse en het % van totaal rekenen mee met de gekozen herkomst.

## Aanleveren aan de baas

- **Afbeelding voor Wout (PNG):** één knop maakt een nette PNG-samenvatting (hero, focusredenen, de vergelijktabel met eindtotaal, "waar zit het in" in euro's) die je direct kunt doorsturen — zonder screenshot te hoeven maken. Volgt de gekozen periode en herkomst.
- **Schermweergave:** het overzicht is ook strak genoeg om zelf een screenshot van te maken.
- **Rapport (PDF):** verzorgd rapport van de gekozen periode — hero, focusredenen, de volledige vergelijktabel, per groep, het verloop en de signalen.
- **CSV:** exporteert de vergelijktabel om zelf mee te rekenen.

## Foutafhandeling bij import (pijnpunten)

De app schoont bekende fouten automatisch op en meldt dat in gewone taal bovenin (en volledig in "Import & controle"):
- **Lege datum** → overgenomen van de regel erboven/eronder (of afgeleid uit weeknummer + jaar).
- **Leeg week/jaar** → overgenomen van een buurregel.
- **Leeg bedrag** → overgenomen van de regel erboven/eronder en **gemarkeerd als "controleer"** (een creditbedrag kan per regel uniek zijn, dus de melding vraagt je het te controleren voordat je het rapport naar Wout stuurt). Alleen als er geen bruikbare buurregel is, wordt de regel overgeslagen.
- **Fout jaartal** → automatisch gecorrigeerd: `2202 → 2022`, `226 → 2026`, `24 → 2024` (alleen als de uitkomst een geloofwaardig jaar is).
- **Lege reden** → op "Overige" gezet; **onbekende reden** → met suggestie gemeld.

## Privacy

Alles blijft lokaal in de browser. Klantnaam en ordernummer worden bij import herkend maar **nooit opgeslagen** — alleen periode, reden, herkomst, bedrag en aantal.

## Ontwikkeling / kwaliteit

```powershell
npm run check   # syntax-check
npm test        # rekenkern + import + privacy + jaarcorrectie + buurregel-herstel + forecast (61 checks)
node tools/render-smoke.cjs   # render-laag + PDF + PNG bouwen zonder crash
node tools/make-preview.cjs   # (optioneel) preview-pagina's met testdata voor screenshots
```

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
