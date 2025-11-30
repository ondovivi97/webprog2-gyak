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

// Statikus fájlok
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

// Admin auth middleware
function adminRequired(req, res, next) {
  if (!req.session.user || req.session.user.szerep !== 'admin') {
    req.flash('error', 'Az oldal megtekintéséhez admin jogosultság szükséges.');
    return res.redirect(BASE_PATH + '/');
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
// Receptek / összetett lista az etel + kategória + hozzávalók alapján
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
              COALESCE(eh.mennyiseg, ''),
              ' ',
              COALESCE(eh.egyseg, ''),
              ')'
            )
            ORDER BY h.nev SEPARATOR ', '
          ),
          ''
        ) AS hozzavalok
      FROM etel e
      LEFT JOIN kategoria k ON e.kategoria_id = k.id
      LEFT JOIN etel_hozzavalo eh ON e.id = eh.etelid
      LEFT JOIN hozzavalo h ON eh.hozzavaloid = h.id
      GROUP BY e.id, e.nev, e.kategoria_id, k.nev
      ORDER BY e.nev;
    `);

    res.render('receptek', {
      title: 'Receptek',
      receptek: rows,
    });
  } catch (err) {
    console.error('Hiba a receptek lekérdezésekor:', err);
    res.status(500).send('Hiba a receptek lekérdezésekor');
  }
});

// ------------------------
// Kategóriák
// ------------------------
app.get(BASE_PATH + '/kategoria', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nev, leiras FROM kategoria ORDER BY nev'
    );
    res.render('kategoria', {
      title: 'Kategóriák',
      kategoriak: rows,
    });
  } catch (err) {
    console.error('Hiba a kategóriák lekérdezésekor:', err);
    res.status(500).send('Hiba a kategóriák betöltésekor');
  }
});

// ------------------------
// Hozzávalók
// ------------------------
app.get(BASE_PATH + '/hozzavalo', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nev, egyseg FROM hozzavalo ORDER BY nev'
    );
    res.render('hozzavalo', {
      title: 'Hozzávalók',
      hozzavalok: rows,
    });
  } catch (err) {
    console.error('Hiba a hozzávalók lekérdezésekor:', err);
    res.status(500).send('Hiba a hozzávalók betöltésekor');
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
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
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
      "INSERT INTO users (nev, email, jelszo, szerep) VALUES (?, ?, ?, 'registered')",
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
      [email]
    );
    if (rows.length === 0) {
      errors.push('Nincs ilyen e-mail címmel regisztrált felhasználó.');
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
    if (err) console.error('Session destroy hiba:', err);
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
// Kapcsolat (POST) – üzenetek mentése uzenetek táblába
// ------------------------
app.post(BASE_PATH + '/kapcsolat', async (req, res) => {
  try {
    const { nev, email, telefon, uzenet } = req.body;
    const errors = [];

    if (!nev || nev.trim().length < 2)
      errors.push('A név minimum 2 karakter.');
    if (!uzenet || uzenet.trim().length < 5)
      errors.push('Az üzenet minimum 5 karakter.');

    if (errors.length > 0) {
      return res.render('kapcsolat', {
        title: 'Kapcsolat',
        errors,
        success: null,
        values: { nev, email, telefon, uzenet },
      });
    }

    const bekuldo_ip =
      req.headers['x-forwarded-for'] ||
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
// Üzenetek lista (csak bejelentkezve)
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
// CRUD – Ételek
// ------------------------
app.get(BASE_PATH + '/crud', async (req, res) => {
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
              COALESCE(eh.mennyiseg, ''),
              ' ',
              COALESCE(eh.egyseg, ''),
              ')'
            )
            ORDER BY h.nev SEPARATOR ', '
          ),
          ''
        ) AS hozzavalok
      FROM etel e
      LEFT JOIN kategoria k ON e.kategoria_id = k.id
      LEFT JOIN etel_hozzavalo eh ON e.id = eh.etelid
      LEFT JOIN hozzavalo h ON eh.hozzavaloid = h.id
      GROUP BY e.id, e.nev, e.kategoria_id, k.nev
      ORDER BY e.nev;
    `);

    res.render('crud', {
      title: 'CRUD',
      etelek: rows,
    });
  } catch (err) {
    console.error('Hiba a CRUD lista lekérdezésekor:', err);
    res.status(500).send('Hiba a CRUD lista betöltésekor');
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
    [nev, kategoriaid || null]
  );
  res.redirect(BASE_PATH + '/crud');
});

// Étel szerkesztése (GET)
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

// Étel szerkesztése (POST)
app.post(BASE_PATH + '/crud/szerkesztes/:id', async (req, res) => {
  const etelId = req.params.id;
  const { nev, kategoriaid } = req.body;

  await db.query(
    'UPDATE etel SET nev = ?, kategoria_id = ? WHERE id = ?',
    [nev, kategoriaid || null, etelId]
  );

  res.redirect(BASE_PATH + '/crud');
});

// Étel törlése (POST – pl. űrlapból)
app.post(BASE_PATH + '/crud/torles/:id', async (req, res) => {
  const etelId = req.params.id;
  await db.query('DELETE FROM etel WHERE id = ?', [etelId]);
  res.redirect(BASE_PATH + '/crud');
});

// Étel törlése (GET – a "Törlés" linkhez)
app.get(BASE_PATH + '/crud/torles/:id', async (req, res) => {
  const etelId = req.params.id;
  await db.query('DELETE FROM etel WHERE id = ?', [etelId]);
  res.redirect(BASE_PATH + '/crud');
});


// ------------------------
// CRUD – Hozzávalók egy ételhez
// ------------------------

// Hozzávalók szerkesztése oldal
app.get(BASE_PATH + '/crud/hozzavalok/:id', async (req, res) => {
  const etelId = req.params.id;

  // az adott étel adatai
  const [[etel]] = await db.query(
    'SELECT id, nev FROM etel WHERE id = ?',
    [etelId]
  );

  // az adott étel jelenlegi hozzávalói
  const [aktualis] = await db.query(
    `
    SELECT 
      eh.hozzavaloid,
      h.nev,
      eh.mennyiseg,
      eh.egyseg
    FROM etel_hozzavalo eh
    JOIN hozzavalo h ON eh.hozzavaloid = h.id
    WHERE eh.etelid = ?
    ORDER BY h.nev;
    `,
    [etelId]
  );

  // összes elérhető hozzávaló a dropdownhoz
  const [osszesHozzavalo] = await db.query(
    'SELECT id, nev FROM hozzavalo ORDER BY nev'
  );

  res.render('crud-hozzavalok', {
    title: 'Étel hozzávalói',
    etel,
    aktualis,
    osszesHozzavalo,
  });
});

// Új hozzávaló hozzárendelése egy ételhez
app.post(BASE_PATH + '/crud/hozzavalok/:id/uj', async (req, res) => {
  const etelId = req.params.id;
  const { hozzavaloid, mennyiseg, egyseg } = req.body;

  if (!hozzavaloid) {
    return res.redirect(BASE_PATH + '/crud/hozzavalok/' + etelId);
  }

  // mennyiség számra konvertálása (üres esetén NULL)
  let menny = null;
  if (mennyiseg && mennyiseg.trim() !== '') {
    const val = Number(mennyiseg.replace(',', '.'));
    if (!Number.isNaN(val)) {
      menny = val;
    }
  }

  await db.query(
    'INSERT INTO etel_hozzavalo (mennyiseg, egyseg, etelid, hozzavaloid) VALUES (?, ?, ?, ?)',
    [menny, egyseg || null, etelId, hozzavaloid]
  );

  res.redirect(BASE_PATH + '/crud/hozzavalok/' + etelId);
});

// Meglévő hozzávaló módosítása (mennyiség/egység)
app.post(BASE_PATH + '/crud/hozzavalok/:id/modosit/:hozzavaloid', async (req, res) => {
  const etelId = req.params.id;
  const hozzavaloId = req.params.hozzavaloid;
  const { mennyiseg, egyseg } = req.body;

  let menny = null;
  if (mennyiseg && mennyiseg.trim() !== '') {
    const val = Number(mennyiseg.replace(',', '.'));
    if (!Number.isNaN(val)) {
      menny = val;
    }
  }

  await db.query(
    `
    UPDATE etel_hozzavalo
    SET mennyiseg = ?, egyseg = ?
    WHERE etelid = ? AND hozzavaloid = ?
    `,
    [menny, egyseg || null, etelId, hozzavaloId]
  );

  res.redirect(BASE_PATH + '/crud/hozzavalok/' + etelId);
});

// Hozzávaló törlése egy ételből
app.get(BASE_PATH + '/crud/hozzavalok/:id/torles/:hozzavaloid', async (req, res) => {
  const etelId = req.params.id;
  const hozzavaloId = req.params.hozzavaloid;

  await db.query(
    'DELETE FROM etel_hozzavalo WHERE etelid = ? AND hozzavaloid = ?',
    [etelId, hozzavaloId]
  );

  res.redirect(BASE_PATH + '/crud/hozzavalok/' + etelId);
});


// ------------------------
// Admin oldal (csak adminnak)
// ------------------------
app.get(BASE_PATH + '/admin', adminRequired, async (req, res) => {
  try {
    const [userRows] = await db.query('SELECT COUNT(*) AS count FROM users');
    const [messageRows] = await db.query('SELECT COUNT(*) AS count FROM uzenetek');
    const [etelRows] = await db.query('SELECT COUNT(*) AS count FROM etel');

    const stats = {
      users: userRows[0].count,
      messages: messageRows[0].count,
      etelek: etelRows[0].count,
    };

    res.render('admin', {
      title: 'Admin',
      stats,
    });
  } catch (err) {
    console.error('Admin oldal hiba:', err);
    res
      .status(500)
      .send('Hiba történt az admin oldal betöltésekor.');
  }
});

// ------------------------
// Szerver indítása
// ------------------------
app.listen(PORT, () => {
  console.log(`Szerver fut: http://localhost:${PORT}${BASE_PATH}`);
});
