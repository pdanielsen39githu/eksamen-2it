require('dotenv').config();
const express  = require('express');
const bcrypt   = require('bcrypt');
const session  = require('express-session');
const { Pool } = require('pg');
const path     = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

// --- Database ---
const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     process.env.DB_PORT,
  user:     process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

async function q(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// --- Middleware ---
function requireLogin(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login.html');
}
function requireAdmin(req, res, next) {
  if (req.session.user?.role === 'admin') return next();
  res.status(403).json({ error: 'Ikke tilgang' });
}
function isKunde(req) {
  return req.session.user?.role === 'kunde';
}

// --- Auth ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const rows = await q('SELECT * FROM bruker WHERE username = $1', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash)))
    return res.status(401).json({ error: 'Feil brukernavn eller passord' });
  req.session.user = {
    id:        user.id,
    username:  user.username,
    role:      user.role,
    bedriftId: user.bedrift_id || null
  };
  res.json({ role: user.role });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Ikke innlogget' });
  res.json(req.session.user);
});

app.get('/',         requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/app.html', requireLogin, (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

// -------------------------------------------------------
// BEDRIFTER
// Admin/ansatt: ser alle bedrifter, kan opprette/endre/slette
// Kunde: ser kun sin egen bedrift, kan endre egne opplysninger
// -------------------------------------------------------
app.get('/api/bedrifter', requireLogin, async (req, res) => {
  if (isKunde(req)) {
    return res.json(await q(
      'SELECT bedrift_id AS id, navn, organisasjonsnr AS orgnr, adresse, postnummer, poststed FROM bedrift WHERE bedrift_id = $1',
      [req.session.user.bedriftId]
    ));
  }
  res.json(await q('SELECT bedrift_id AS id, navn, organisasjonsnr AS orgnr, adresse, postnummer, poststed FROM bedrift'));
});

app.post('/api/bedrifter', requireLogin, requireAdmin, async (req, res) => {
  const { navn, orgnr, adresse, postnummer, poststed, tjenesteIds } = req.body;
  const rows = await q(
    'INSERT INTO bedrift (navn, organisasjonsnr, adresse, postnummer, poststed) VALUES ($1,$2,$3,$4,$5) RETURNING bedrift_id AS id',
    [navn, orgnr, adresse, postnummer, poststed]
  );
  const id = rows[0].id;
  for (const tid of (tjenesteIds || [])) {
    await q(
      'INSERT INTO bedrifttjeneste (bedrift_id, tjeneste_id, startdato) VALUES ($1,$2,CURRENT_DATE) ON CONFLICT DO NOTHING',
      [id, tid]
    );
  }
  res.json({ id, navn, orgnr, adresse, postnummer, poststed });
});

app.put('/api/bedrifter/:id', requireLogin, async (req, res) => {
  const id = parseInt(req.params.id);
  // Kunde kan kun endre sin egen bedrift
  if (isKunde(req) && req.session.user.bedriftId !== id)
    return res.status(403).json({ error: 'Ikke tilgang' });
  const { navn, orgnr, adresse, postnummer, poststed, tjenesteIds } = req.body;
  await q(
    'UPDATE bedrift SET navn=$1, organisasjonsnr=$2, adresse=$3, postnummer=$4, poststed=$5 WHERE bedrift_id=$6',
    [navn, orgnr, adresse, postnummer, poststed, id]
  );
  // Kun admin kan endre tjenestekoblinger
  if (!isKunde(req)) {
    await q('DELETE FROM bedrifttjeneste WHERE bedrift_id=$1', [id]);
    for (const tid of (tjenesteIds || [])) {
      await q('INSERT INTO bedrifttjeneste (bedrift_id, tjeneste_id, startdato) VALUES ($1,$2,CURRENT_DATE)', [id, tid]);
    }
  }
  res.json({ ok: true });
});

app.delete('/api/bedrifter/:id', requireLogin, requireAdmin, async (req, res) => {
  await q('DELETE FROM bedrift WHERE bedrift_id=$1', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// TJENESTER
// Admin/ansatt: ser alle tjenester, admin kan opprette/endre/slette
// Kunde: ser kun tjenester knyttet til sin bedrift (kun les)
// -------------------------------------------------------
app.get('/api/tjenester', requireLogin, async (req, res) => {
  if (isKunde(req)) {
    return res.json(await q(
      `SELECT t.tjeneste_id AS id, t.navn, t.beskrivelse, t.pris_per_mnd AS pris,
              bt.aktiv, bt.startdato, bt.sluttdato
       FROM tjeneste t
       JOIN bedrifttjeneste bt ON bt.tjeneste_id = t.tjeneste_id
       WHERE bt.bedrift_id = $1
       ORDER BY bt.aktiv DESC, t.navn`,
      [req.session.user.bedriftId]
    ));
  }
  res.json(await q('SELECT tjeneste_id AS id, navn, beskrivelse, pris_per_mnd AS pris FROM tjeneste'));
});

app.post('/api/tjenester', requireLogin, requireAdmin, async (req, res) => {
  const { navn, beskrivelse, pris } = req.body;
  const rows = await q(
    'INSERT INTO tjeneste (navn, beskrivelse, pris_per_mnd) VALUES ($1,$2,$3) RETURNING tjeneste_id AS id',
    [navn, beskrivelse, pris]
  );
  res.json({ id: rows[0].id, navn, beskrivelse, pris });
});

app.put('/api/tjenester/:id', requireLogin, requireAdmin, async (req, res) => {
  const { navn, beskrivelse, pris } = req.body;
  await q(
    'UPDATE tjeneste SET navn=$1, beskrivelse=$2, pris_per_mnd=$3 WHERE tjeneste_id=$4',
    [navn, beskrivelse, pris, parseInt(req.params.id)]
  );
  res.json({ ok: true });
});

app.delete('/api/tjenester/:id', requireLogin, requireAdmin, async (req, res) => {
  await q('DELETE FROM tjeneste WHERE tjeneste_id=$1', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// KONTAKTPERSONER
// Admin/ansatt: ser alle, kan opprette/endre/slette
// Kunde: ser og kan endre kun kontakter tilknyttet sin bedrift
// -------------------------------------------------------
app.get('/api/kontakter', requireLogin, async (req, res) => {
  if (isKunde(req)) {
    return res.json(await q(
      `SELECT kontakt_id AS id, bedrift_id AS "bedriftId",
              fornavn, etternavn, stilling, epost, telefon
       FROM kontaktperson WHERE bedrift_id = $1`,
      [req.session.user.bedriftId]
    ));
  }
  res.json(await q(
    `SELECT kontakt_id AS id, bedrift_id AS "bedriftId",
            fornavn, etternavn, stilling, epost, telefon
     FROM kontaktperson`
  ));
});

app.post('/api/kontakter', requireLogin, async (req, res) => {
  const bedriftId = isKunde(req) ? req.session.user.bedriftId : req.body.bedriftId;
  const { fornavn, etternavn, stilling, epost, telefon } = req.body;
  const rows = await q(
    'INSERT INTO kontaktperson (bedrift_id, fornavn, etternavn, stilling, epost, telefon) VALUES ($1,$2,$3,$4,$5,$6) RETURNING kontakt_id AS id',
    [bedriftId, fornavn, etternavn, stilling, epost, telefon]
  );
  res.json({ id: rows[0].id });
});

app.put('/api/kontakter/:id', requireLogin, async (req, res) => {
  const kid = parseInt(req.params.id);
  if (isKunde(req)) {
    const rows = await q('SELECT bedrift_id FROM kontaktperson WHERE kontakt_id=$1', [kid]);
    if (!rows[0] || rows[0].bedrift_id !== req.session.user.bedriftId)
      return res.status(403).json({ error: 'Ikke tilgang' });
  }
  const { fornavn, etternavn, stilling, epost, telefon, bedriftId } = req.body;
  const safeBedriftId = isKunde(req) ? req.session.user.bedriftId : bedriftId;
  await q(
    'UPDATE kontaktperson SET bedrift_id=$1, fornavn=$2, etternavn=$3, stilling=$4, epost=$5, telefon=$6 WHERE kontakt_id=$7',
    [safeBedriftId, fornavn, etternavn, stilling, epost, telefon, kid]
  );
  res.json({ ok: true });
});

app.delete('/api/kontakter/:id', requireLogin, requireAdmin, async (req, res) => {
  await q('DELETE FROM kontaktperson WHERE kontakt_id=$1', [parseInt(req.params.id)]);
  res.json({ ok: true });
});

// -------------------------------------------------------
// KOBLINGER (bedrift <-> tjeneste)
// -------------------------------------------------------
app.get('/api/koblinger', requireLogin, async (req, res) => {
  if (isKunde(req)) {
    return res.json(await q(
      `SELECT bedrift_id AS "bedriftId", tjeneste_id AS "tjenesteId"
       FROM bedrifttjeneste WHERE bedrift_id = $1`,
      [req.session.user.bedriftId]
    ));
  }
  res.json(await q(`SELECT bedrift_id AS "bedriftId", tjeneste_id AS "tjenesteId" FROM bedrifttjeneste`));
});

// -------------------------------------------------------
// ADMIN
// -------------------------------------------------------
app.get('/api/admin/users', requireLogin, requireAdmin, async (req, res) => {
  res.json(await q('SELECT id, username, role FROM bruker ORDER BY id'));
});


// -------------------------------------------------------
// TJENESTE-ABONNEMENT (kjøp / avbryt)
// Kun kunder kan gjøre dette på seg selv
// -------------------------------------------------------

// Kjøp / aktiver en tjeneste
app.post('/api/abonnement/kjop', requireLogin, async (req, res) => {
  const bedriftId = isKunde(req) ? req.session.user.bedriftId : req.body.bedriftId;
  const { tjenesteId } = req.body;
  if (!bedriftId || !tjenesteId) return res.status(400).json({ error: 'Mangler data' });

  // Sjekk om den allerede er aktiv
  const existing = await q(
    'SELECT * FROM bedrifttjeneste WHERE bedrift_id=$1 AND tjeneste_id=$2',
    [bedriftId, tjenesteId]
  );
  if (existing[0]?.aktiv) return res.status(400).json({ error: 'Allerede aktiv' });

  if (existing[0]) {
    // Re-aktiver
    await q(
      'UPDATE bedrifttjeneste SET aktiv=TRUE, startdato=CURRENT_DATE, sluttdato=NULL WHERE bedrift_id=$1 AND tjeneste_id=$2',
      [bedriftId, tjenesteId]
    );
  } else {
    // Ny
    await q(
      'INSERT INTO bedrifttjeneste (bedrift_id, tjeneste_id, startdato, aktiv) VALUES ($1,$2,CURRENT_DATE,TRUE)',
      [bedriftId, tjenesteId]
    );
  }
  res.json({ ok: true });
});

// Avbryt / deaktiver en tjeneste
app.post('/api/abonnement/avbryt', requireLogin, async (req, res) => {
  const bedriftId = isKunde(req) ? req.session.user.bedriftId : req.body.bedriftId;
  const { tjenesteId } = req.body;
  if (!bedriftId || !tjenesteId) return res.status(400).json({ error: 'Mangler data' });

  await q(
    'UPDATE bedrifttjeneste SET aktiv=FALSE, sluttdato=CURRENT_DATE WHERE bedrift_id=$1 AND tjeneste_id=$2',
    [bedriftId, tjenesteId]
  );
  res.json({ ok: true });
});

// Alle tilgjengelige tjenester (for kjøp-modal)
app.get('/api/tjenester/alle', requireLogin, async (req, res) => {
  res.json(await q('SELECT tjeneste_id AS id, navn, beskrivelse, pris_per_mnd AS pris FROM tjeneste ORDER BY navn'));
});

app.listen(3000, () => console.log('Server kjører på http://localhost:3000'));
