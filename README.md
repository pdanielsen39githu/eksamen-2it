# DataKonsulent.no – Kundeadministrasjon

## Oppsett

### 1. Installer Node-pakker
```bash
npm install
```

### 2. Sett opp database i pgAdmin
1. Åpne pgAdmin og koble til serveren din
2. Høyreklikk **Databases** → **Create** → **Database**
3. Kall den `datakonsulent` og klikk Save
4. Klikk på den nye databasen i venstre panel
5. Klikk **Query Tool** i verktøylinjen øverst
6. Lim inn hele innholdet fra `database.sql`
7. Trykk **F5** (eller Run-knappen) for å kjøre

### 3. Start serveren
```bash
node server.js
```
Åpne: http://localhost:3000

---

## Miljøvariabler
Standard kobler til localhost med bruker `postgres`. Overstyr med:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=dittpassord
DB_NAME=datakonsulent
```

Eksempel:
```bash
DB_PASS=hemmelig node server.js
```

---

## Brukere

| Brukernavn | Passord   | Rolle  |
|------------|-----------|--------|
| admin      | Admin123! | Admin  |
| konsulent  | Pass123!  | Bruker |

Passord er bcrypt-hashet i databasen.

## Roller
- **Admin** – full tilgang, kan slette alt, endre tjenester, ser Admin-panel
- **Bruker** – kan lese alt, legge til og redigere bedrifter og kontakter

## Teknologi
- Node.js + Express
- PostgreSQL (pg / node-postgres)
- bcrypt
- express-session
- Vanilla HTML/CSS/JS
