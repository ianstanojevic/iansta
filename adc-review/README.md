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

```bash
cd adc-review
npm install
cp .env.example .env.local   # fyll i RIOT_API_KEY
npm run dev
```

Öppna adressen som visas, fyll i ditt Riot ID och region under **Hämta data**, och tryck
**Hämta & analysera**. Vill du bara se hur det ser ut, välj **Prova med demodata** eller öppna `/?demo`.

**API-nyckel:** skaffa en på [developer.riotgames.com](https://developer.riotgames.com). En
utvecklarnyckel gäller i 24 timmar och tillåter 100 anrop per 2 minuter. Varje match kostar två
anrop, så 100 matcher tar ungefär fyra minuter första gången. Appen väntar själv ut rate limits.
Färdiga matcher sparas i `adc-review/.cache/`, så de hämtas aldrig igen. Ansök om en *personal API key*
om du inte vill förnya nyckeln varje dag.

Championporträtt och kartan hämtas från Riots Data Dragon-CDN. Utan nätverk visas initialer och
en schematisk karta i stället.

Nyckeln används bara av dev-serverns proxy (`server/riotProxy.ts`) och når aldrig webbläsarkoden.
Riot API skickar inga CORS-headers, så appen måste köras via `npm run dev` (eller `npm run build &&
npm run preview`) och kan inte ligga som en statisk sida.

## Begränsningar

- Riot sparar spelarpositioner en gång per minut. "Ensam död" mäter avståndet till närmaste
  allierade vid den närmaste minuten, så se det som en ledtråd att kolla i replayen, inte ett facit.
- Lane-motståndaren är fiendens spelare med `teamPosition = BOTTOM`. I matcher med lane-swap eller
  off-meta-bot blir jämförelsen mindre meningsfull.
- Allt (analyser och reviews) sparas i webbläsarens localStorage. Använd **Exportera som JSON** för backup.

## Struktur

```
server/riotProxy.ts      dev-server-proxy mot Riot API + diskcache
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
