// indito.js

const express = require('express');
const path = require('path');
const db = require('./db');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');

const app = express();

// ---- KONFIG ----
const PORT = 4162;          // belső port (reverse proxy: app162 => 4162)
const BASE_PATH = '/app162'; // minden útvonal ezen a prefixen megy kifelé

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session + Flash
app.use(
  session({
    secret: 'valamiTitkosKulcs123',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(flash());

// Statikus fájlok (mind /css, mind /app162/css működjön)
app.use(express.static(path.join(__dirname, 'public')));
app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));

// EJS sablonmotor
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Globális változók a sablonokhoz
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');

  // EJS sablonokhoz – mindenhol ezt használjuk: <%= basePath %>
  res.locals.basePath = BASE_PATH;

  next();
});

// Egyszerű auth middleware
function authRequired(req, res, next) {
  if (!req.session.user) {
    req.flash('error', 'Előbb be kell jelentkezned!');
    return res.redirect(BASE_PATH + '/login');
  }
  next();
}

// ------------------------
// Főoldal
// ------------------------
app.get(BASE_PATH + '/', (req, res) => {
  res.render('index', { title: 'Főoldal' });
});

// ------------------------
// Receptek
// ------------------------
app.get(BASE_PATH + '/receptek', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        e.id,
        e.nev,
        e.kategoria_id,
        k.nev AS kategoria_nev,
        IFNULL(
          GROUP_CONCAT(
            DISTINCT CONCAT(
              h.nev, ' (',
              COALESCE(hu.mennyiseg, ''),
              IFNULL(CONCAT(' ', COALESCE(hu.egyseg, '')), ''),
              ')'
            )
            ORDER BY h.nev SEPARATOR ', '
          ), ''
        ) AS hozzavalok
      FROM etel e
      LEFT JOIN kategoria k    ON e.kategoria_id = k.id
      LEFT JOIN hasznalt hu    ON hu.etel_id      = e.id
      LEFT JOIN hozzavalo h    ON hu.hozzavalo_id = h.id
      GROUP BY e.id, e.nev, e.kategoria_id, k.nev
      ORDER BY e.id;
    `);

    res.render('etelek', { etelek: rows, title: 'Receptek' });
  } catch (err) {
    console.error('Hiba a receptek lekérdezésénél:', err);
    res.status(500).send('Hiba a receptek lekérdezésénél.');
  }
});

// ------------------------
// Regisztráció (GET)
// ------------------------
app.get(BASE_PATH + '/regisztracio', (req, res) => {
  res.render('regisztracio', {
    title: 'Regisztráció',
    errors: [],
    values: {},
  });
});

// ------------------------
// Regisztráció (POST)
// users: id, nev, email, jelszo, szerep
// ------------------------
app.post(BASE_PATH + '/regisztracio', async (req, res) => {
  try {
    const { nev, email, jelszo, jelszo2 } = req.body;
    const errors = [];

    if (!nev || nev.trim().length < 2)
      errors.push('A név minimum 2 karakter.');
    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      errors.push('Érvényes e-mail cím szükséges.');
    if (!jelszo || jelszo.length < 6)
      errors.push('A jelszó minimum 6 karakter.');
    if (jelszo !== jelszo2)
      errors.push('A jelszavak nem egyeznek.');

    if (errors.length > 0) {
      return res.render('regisztracio', {
        title: 'Regisztráció',
        errors,
        values: { nev, email },
      });
    }

    // Van-e már ilyen email?
    const [existing] = await db.query(
      'SELECT id FROM users WHERE email = ?',
      [email.trim()]
    );
    if (existing.length > 0) {
      errors.push('Ez az e-mail cím már regisztrálva van.');
      return res.render('regisztracio', {
        title: 'Regisztráció',
        errors,
        values: { nev, email },
      });
    }

    const hashedPassword = await bcrypt.hash(jelszo, 10);

    await db.query(
      "INSERT INTO users (nev, email, jelszo, szerep) VALUES (?, ?, ?, 'user')",
      [nev.trim(), email.trim(), hashedPassword]
    );

    req.flash(
      'success',
      'Sikeres regisztráció! Most bejelentkezhetsz.'
    );
    res.redirect(BASE_PATH + '/login');
  } catch (err) {
    console.error('Regisztráció hiba:', err);
    res.render('regisztracio', {
      title: 'Regisztráció',
      errors: ['Szerverhiba, próbáld később.'],
      values: req.body || {},
    });
  }
});

// ------------------------
// Bejelentkezés (GET)
// ------------------------
app.get(BASE_PATH + '/login', (req, res) => {
  res.render('login', {
    title: 'Bejelentkezés',
    errors: [],
    values: {},
  });
});

// ------------------------
// Bejelentkezés (POST)
// ------------------------
app.post(BASE_PATH + '/login', async (req, res) => {
  try {
    const { email, jelszo } = req.body;
    const errors = [];

    if (!email || !jelszo) {
      errors.push('Kérlek add meg az e-mail címet és a jelszót.');
      return res.render('login', {
        title: 'Bejelentkezés',
        errors,
        values: { email },
      });
    }

    const [rows] = await db.query(
      'SELECT * FROM users WHERE email = ?',
      [email.trim()]
    );
    if (rows.length === 0) {
      errors.push('Nincs ilyen felhasználó.');
      return res.render('login', {
        title: 'Bejelentkezés',
        errors,
        values: { email },
      });
    }

    const user = rows[0];
    const validPassword = await bcrypt.compare(
      jelszo,
      user.jelszo
    );
    if (!validPassword) {
      errors.push('Hibás jelszó.');
      return res.render('login', {
        title: 'Bejelentkezés',
        errors,
        values: { email },
      });
    }

    req.session.user = {
      id: user.id,
      nev: user.nev,
      email: user.email,
      szerep: user.szerep,
    };

    req.flash('success', 'Sikeresen bejelentkeztél!');
    res.redirect(BASE_PATH + '/');
  } catch (err) {
    console.error('Bejelentkezés hiba:', err);
    res.render('login', {
      title: 'Bejelentkezés',
      errors: ['Szerverhiba, próbáld később.'],
      values: req.body || {},
    });
  }
});

// ------------------------
// Kijelentkezés
// ------------------------
app.get(BASE_PATH + '/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Logout hiba:', err);
    res.redirect(BASE_PATH + '/');
  });
});

// ------------------------
// Kapcsolat (GET)
// ------------------------
app.get(BASE_PATH + '/kapcsolat', (req, res) => {
  res.render('kapcsolat', {
    title: 'Kapcsolat',
    success: null,
    errors: [],
    values: {},
  });
});

// ------------------------
// Kapcsolat (POST)
// ------------------------
app.post(BASE_PATH + '/kapcsolat', async (req, res) => {
  try {
    const { nev, email, telefon, uzenet } = req.body;
    const errors = [];

    if (!nev || nev.trim().length < 2)
      errors.push('Kérlek add meg a nevet (min. 2 karakter).');
    if (!uzenet || uzenet.trim().length < 5)
      errors.push('Az üzenet túl rövid (min. 5 karakter).');
    if (
      email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      errors.push('Érvénytelen e-mail cím.');

    if (errors.length > 0) {
      return res.render('kapcsolat', {
        title: 'Kapcsolat',
        errors,
        success: null,
        values: { nev, email, telefon, uzenet },
      });
    }

    const bekuldo_ip = req.headers['x-forwarded-for'] ||
      req.socket.remoteAddress ||
      null;

    await db.query(
      'INSERT INTO uzenetek (nev, email, telefon, uzenet, bekuldo_ip) VALUES (?, ?, ?, ?, ?)',
      [
        nev.trim(),
        email ? email.trim() : null,
        telefon ? telefon.trim() : null,
        uzenet.trim(),
        bekuldo_ip,
      ]
    );

    res.render('kapcsolat', {
      title: 'Kapcsolat',
      success: 'Köszönjük, az üzeneted elmentésre került.',
      errors: [],
      values: {},
    });
  } catch (err) {
    console.error('Kapcsolat POST hiba:', err);
    res.status(500).render('kapcsolat', {
      title: 'Kapcsolat',
      errors: ['Szerverhiba történt, próbáld később.'],
      success: null,
      values: req.body || {},
    });
  }
});

// ------------------------
// Üzenetek lista (auth kell)
// ------------------------
app.get(BASE_PATH + '/uzenetek', authRequired, async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT id, nev, email, telefon, uzenet, bekuldo_ip, bekuldve
      FROM uzenetek
      ORDER BY bekuldve DESC
    `);

    res.render('uzenetek', {
      title: 'Üzenetek',
      uzenetek: rows,
    });
  } catch (err) {
    console.error('Hiba az üzenetek lekérdezésénél:', err);
    res
      .status(500)
      .send('Hiba történt az üzenetek betöltésekor.');
  }
});

// ------------------------
// CRUD – Ételek lista
// ------------------------
app.get(BASE_PATH + '/crud', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT e.id, e.nev, k.nev AS kategoria
      FROM etel e
      LEFT JOIN kategoria k ON e.kategoria_id = k.id
      ORDER BY e.id
    `);

    res.render('crud', {
      title: 'CRUD – Ételek',
      etelek: rows,
    });
  } catch (err) {
    console.error('CRUD hiba:', err);
    res.status(500).send('Hiba a CRUD listázásnál.');
  }
});

// Új étel (GET)
app.get(BASE_PATH + '/crud/uj', async (req, res) => {
  const [kategoriak] = await db.query(
    'SELECT id, nev FROM kategoria'
  );
  res.render('crud-uj', {
    title: 'Új étel',
    kategoriak,
  });
});

// Új étel (POST)
app.post(BASE_PATH + '/crud/uj', async (req, res) => {
  const { nev, kategoriaid } = req.body;

  await db.query(
    'INSERT INTO etel (nev, kategoria_id) VALUES (?, ?)',
    [nev.trim(), kategoriaid]
  );

  res.redirect(BASE_PATH + '/crud');
});

// Szerkesztés (GET)
app.get(BASE_PATH + '/crud/szerkesztes/:id', async (req, res) => {
  const etelId = req.params.id;

  const [[etel]] = await db.query(
    'SELECT * FROM etel WHERE id = ?',
    [etelId]
  );
  const [kategoriak] = await db.query(
    'SELECT id, nev FROM kategoria'
  );

  res.render('crud-szerkesztes', {
    title: 'Étel szerkesztése',
    etel,
    kategoriak,
  });
});

// Szerkesztés (POST)
app.post(BASE_PATH + '/crud/szerkesztes/:id', async (req, res) => {
  const etelId = req.params.id;
  const { nev, kategoriaid } = req.body;

  await db.query(
    'UPDATE etel SET nev = ?, kategoria_id = ? WHERE id = ?',
    [nev.trim(), kategoriaid, etelId]
  );

  res.redirect(BASE_PATH + '/crud');
});

// Törlés
app.get(BASE_PATH + '/crud/torles/:id', async (req, res) => {
  await db.query('DELETE FROM etel WHERE id = ?', [
    req.params.id,
  ]);
  res.redirect(BASE_PATH + '/crud');
});

// ------------------------
// Kategóriák
// ------------------------
app.get(BASE_PATH + '/kategoria', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM kategoria'
    );
    res.render('kategoria', {
      kategoriak: rows,
      title: 'Kategóriák',
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send('Hiba a kategóriák lekérdezésnél');
  }
});

// ------------------------
// Hozzávalók
// ------------------------
app.get(BASE_PATH + '/hozzavalo', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM hozzavalo'
    );
    res.render('hozzavalo', {
      hozzavalok: rows,
      title: 'Hozzávalók',
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send('Hiba a hozzávalók lekérdezésnél');
  }
});

// ------------------------
// Használt hozzávalók
// ------------------------
app.get(BASE_PATH + '/hasznalt', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM hasznalt'
    );
    res.render('hasznalt', {
      hasznalt: rows,
      title: 'Használt hozzávalók',
    });
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send('Hiba a használt hozzávalók lekérdezésnél');
  }
});

// ------------------------
// Ételek + Hozzávalók összesítve
// ------------------------
app.get(BASE_PATH + '/etelek-hozzavalok-tomb', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        e.id   AS etel_id,
        e.nev  AS etel_nev,
        k.nev  AS kategoria,
        h.nev  AS hozzavalo_nev,
        hu.mennyiseg,
        hu.egyseg
      FROM hasznalt hu
      JOIN etel      e ON hu.etel_id      = e.id
      JOIN hozzavalo h ON hu.hozzavalo_id = h.id
      JOIN kategoria k ON e.kategoria_id  = k.id
      ORDER BY e.id;
    `);

    const etelek = {};
    rows.forEach((row) => {
      if (!etelek[row.etel_id]) {
        etelek[row.etel_id] = {
          etel_id: row.etel_id,
          etel_nev: row.etel_nev,
          kategoria: row.kategoria,
          hozzavalok: [],
        };
      }
      etelek[row.etel_id].hozzavalok.push({
        nev: row.hozzavalo_nev,
        mennyiseg: row.mennyiseg,
        egyseg: row.egyseg,
      });
    });

    res.render('etelek-hozzavalok', {
      etelek: Object.values(etelek),
      title: 'Ételek és hozzávalók',
    });
  } catch (err) {
    console.error('Hiba az összetett lekérdezésnél:', err);
    res
      .status(500)
      .send('Hiba az összetett lekérdezésnél');
  }
});

// ------------------------
// Szerver indítása
// ------------------------
app.listen(PORT, () => {
  console.log(`Szerver fut: http://localhost:${PORT}`);
});
