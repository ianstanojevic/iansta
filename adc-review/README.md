# ADC Review

Post-game review för League of Legends-ADC:er som redan kan grunderna och vill hitta det
som faktiskt håller dem tillbaka.

Appen hämtar dina ranked solo/duo-matcher från Riot API, läser timeline-datan och jämför dig med
**fiendens ADC i samma match**. Det är en spelare på din nivå, så jämförelsen är rättvis även på
Master+, där generella "benchmarks" inte säger något. Sedan rangordnar den dina svagheter och
föreslår vad du ska öva på.

## Vad den letar efter

| Område | Signal |
| --- | --- |
| Laning | CS-diff @10/@15, guld-diff @15, dödsfall före 15 min (och om de var ganks eller 2v2) |
| Positionering | dödsfall efter lanefasen utan allierad i närheten, andel mottagen skada, tid död |
| Farm & makro | CS/min efter 15 min, objectives som fienden tar inom 90 s efter att du dött, kill participation, tid till första legendary, om du vinner när du är 500+ g före |
| Teamfight | damage-andel och skada per guld jämfört med motståndaren |
| Vision | vision score/min och control wards |
| Championpool | champions som vinner klart mindre (eller mer) än resten |
| Mental | vinstprocent direkt efter en förlust och i långa sessioner |
| Dina reviews | taggar som du själv sätter i minst en fjärdedel av matcherna |

Varje match har en egen sida med guld-diffkurva, dödskarta, dödsfall med tid, plats och vem som
dödade dig, och en journal: ADC-specifika taggar, betyg, anteckningar och ett fokus till nästa match.
Fokuset visas när du granskar nästa match.

## Kom igång

### Som webbsida på Vercel (rekommenderat med en personal API key)

Då öppnar du bara en länk, även från mobilen. Riot-anropen går via en molnfunktion
(`api/riot.ts`), så nyckeln ligger på servern och når aldrig webbläsaren.

1. Logga in på [vercel.com](https://vercel.com) med GitHub och välj **Add New → Project**.
2. Importera repot `iansta` och sätt **Root Directory** till `adc-review`. Ramverket (Vite)
   känns igen automatiskt.
3. Lägg till två **Environment Variables**:
   - `RIOT_API_KEY`: din Riot-nyckel
   - `APP_PASSWORD`: ett lösenord du väljer. Utan det kan vem som helst med länken använda din
     nyckel.
4. Tryck **Deploy**. Öppna länken, fyll i Riot ID, och ange lösenordet när appen frågar
   (bara första gången).

Vercel bygger produktionsversionen från repots huvudbranch. Ligger appen på en annan branch,
ändra **Settings → Git → Production Branch** eller merga först.

Proxyn släpper bara igenom de fyra Riot-anrop appen använder (konto, matchlista, match, timeline).

### Lokalt

```bash
cd adc-review
npm install
cp .env.example .env.local   # fyll i RIOT_API_KEY
npm start                    # startar och öppnar webbläsaren
```

Lokalt sparas färdiga matcher i `adc-review/.cache/`, så de hämtas aldrig igen.

### Bra att veta

Vill du bara se hur appen ser ut, välj **Prova med demodata** eller öppna `/?demo`.

En nyckel tillåter 100 anrop per 2 minuter, och varje match kostar två anrop. 100 matcher tar
alltså ungefär fyra minuter första gången. Appen väntar själv ut rate limits.

Championporträtt och kartan hämtas från Riots Data Dragon-CDN. Utan nätverk visas initialer och
en schematisk karta i stället.

## Begränsningar

- Riot sparar spelarpositioner en gång per minut. "Ensam död" mäter avståndet till närmaste
  allierade vid den närmaste minuten, så se det som en ledtråd att kolla i replayen, inte ett facit.
- Lane-motståndaren är fiendens spelare med `teamPosition = BOTTOM`. I matcher med lane-swap eller
  off-meta-bot blir jämförelsen mindre meningsfull.
- Allt (analyser och reviews) sparas i webbläsarens localStorage. Använd **Exportera som JSON** för backup.

## Struktur

```
server/riotCore.ts       vidarebefordran till Riot API (vitlista, lösenord, nyckel)
server/riotProxy.ts      samma sak som dev-server-middleware, med diskcache
api/riot.ts              samma sak som Vercel-funktion
src/riot/                API-klient och payload-typer
src/domain/analyzeGame   en match + timeline → statistik för dig och motståndaren, dödsfall
src/domain/insights      reglerna som hittar svagheter och styrkor
src/domain/demo          deterministisk demodata i Riots eget format
src/components/          översikt, matchlista, matchsida, dödskarta, diagram
```

```bash
npm test          # analys- och regeltester
npm run build     # typkontroll + produktionsbygge
```
