const express = require('express');
const path = require('path');
const db = require('./db'); // a db.js import

const app = express();
const port = 3000;

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const session = require('express-session');
const flash = require('connect-flash');

function authRequired(req, res, next) {
    if (!req.session.user) {
        req.flash('error', 'Előbb be kell jelentkezned!');
        return res.redirect('/login');
    }
    next();
}

app.use(session({
    secret: 'valamiTitkosKulcs123',
    resave: false,
    saveUninitialized: false
}));

app.use(flash());

// Globális változók a sablonokhoz
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// Statikus fájlok (CSS, JS, képek) – most a src/public mappát használja
app.use(express.static(path.join(__dirname, 'public')));

// Sablonmotor – a views mappa a src/views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ------------------------
// Főoldal
// ------------------------
app.get('/', (req, res) => {
    res.render('index', { title: 'Főoldal' });
});

// ------------------------
// Receptek
// ------------------------
app.get('/receptek', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                e.id,
                e.nev,
                e.kategoriaid,
                k.nev AS kategoria_nev,
                IFNULL(
                  GROUP_CONCAT(
                    DISTINCT CONCAT(h.nev, ' (', COALESCE(hu.mennyiseg,''), 
                                   IFNULL(CONCAT(' ', COALESCE(hu.egyseg,'')),''),
                                   ')')
                    ORDER BY h.nev SEPARATOR ', '
                  ), ''
                ) AS hozzavalok
            FROM etel e
            LEFT JOIN kategoria k ON e.kategoriaid = k.id
            LEFT JOIN hasznalt hu ON hu.etelid = e.id
            LEFT JOIN hozzavalo h ON hu.hozzavaloid = h.id
            GROUP BY e.id, e.nev, e.kategoriaid, k.nev
            ORDER BY e.id;
        `);
        res.render('etelek', { etelek: rows, title: 'Receptek' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Hiba a receptek lekérdezésnél');
    }
});


const bcrypt = require('bcryptjs');

// ------------------------
// Regisztráció (GET) – űrlap megjelenítés
// ------------------------
app.get('/regisztracio', (req, res) => {
    res.render('regisztracio', {
        title: 'Regisztráció',
        errors: [],
        values: {}
    });
});

// ------------------------
// Regisztráció (POST)
// ------------------------
app.post('/regisztracio', async (req, res) => {
    try {
        const { nev, email, jelszo, jelszo2 } = req.body;
        const errors = [];

        // Validálás
        if (!nev || nev.trim().length < 2) errors.push('A név minimum 2 karakter.');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Érvényes e-mail cím szükséges.');
        if (!jelszo || jelszo.length < 6) errors.push('A jelszó minimum 6 karakter.');
        if (jelszo !== jelszo2) errors.push('A jelszavak nem egyeznek.');

        if (errors.length > 0) {
            return res.render('regisztracio', { title: 'Regisztráció', errors, values: { nev, email } });
        }

        // Ellenőrizzük, hogy már van-e ilyen email
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            errors.push('Ez az e-mail cím már regisztrálva van.');
            return res.render('regisztracio', { title: 'Regisztráció', errors, values: { nev, email } });
        }

        // Jelszó hash-elése
        const hashedPassword = await bcrypt.hash(jelszo, 10);

        // Mentés az adatbázisba
        await db.query('INSERT INTO users (nev, email, jelszo) VALUES (?, ?, ?)', [nev.trim(), email.trim(), hashedPassword]);

        req.flash('success', 'Sikeres regisztráció! Most bejelentkezhetsz.');
        res.redirect('/login');

    } catch (err) {
        console.error('Regisztráció hiba:', err);
        res.render('regisztracio', { title: 'Regisztráció', errors: ['Szerverhiba, próbáld később.'], values: req.body });
    }
});

// ------------------------
// Bejelentkezés (GET) – űrlap megjelenítés
// ------------------------
app.get('/login', (req, res) => {
    res.render('login', { title: 'Bejelentkezés', errors: [], values: {} });
});

// ------------------------
// Bejelentkezés (POST)
// ------------------------
app.post('/login', async (req, res) => {
    try {
        const { email, jelszo } = req.body;
        const errors = [];

        if (!email || !jelszo) {
            errors.push('Kérlek add meg az e-mail címet és a jelszót.');
            return res.render('login', { title: 'Bejelentkezés', errors, values: { email } });
        }

        // Ellenőrizzük, hogy van-e ilyen user
        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (rows.length === 0) {
            errors.push('Nincs ilyen felhasználó.');
            return res.render('login', { title: 'Bejelentkezés', errors, values: { email } });
        }

        const user = rows[0];

        // Jelszó ellenőrzés
        const validPassword = await bcrypt.compare(jelszo, user.jelszo);
        if (!validPassword) {
            errors.push('Hibás jelszó.');
            return res.render('login', { title: 'Bejelentkezés', errors, values: { email } });
        }

        // Bejelentkeztetés – session létrehozása
        req.session.user = {
            id: user.id,
            nev: user.nev,
            email: user.email,
            szerep: user.szerep
        };

        req.flash('success', 'Sikeresen bejelentkeztél!');
        res.redirect('/');

    } catch (err) {
        console.error('Bejelentkezés hiba:', err);
        res.render('login', { title: 'Bejelentkezés', errors: ['Szerverhiba, próbáld később.'], values: req.body });
    }
});

// ------------------------
// Kijelentkezés
// ------------------------
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error('Logout hiba:', err);
        res.redirect('/');
    });
});



// ------------------------
// Kapcsolat (GET) - űrlap megjelenítése
// ------------------------
app.get('/kapcsolat', (req, res) => {
    res.render('kapcsolat', {
        title: 'Kapcsolat',
        success: null,
        errors: [],
        values: {}
    });
});



// ------------------------
// Kapcsolat (POST) - űrlap beküldése, mentés DB-be
// ------------------------
app.post('/kapcsolat', async (req, res) => {
  try {
    const { nev, email, telefon, uzenet } = req.body;

    // Egyszerű szerveroldali validálás
    const errors = [];
    if (!nev || nev.trim().length < 2) errors.push('Kérlek add meg a nevet (min. 2 karakter).');
    if (!uzenet || uzenet.trim().length < 5) errors.push('Az üzenet túl rövid (min. 5 karakter).');
    // opcionális: email formátum ellenőrzés
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Érvénytelen e-mail cím.');

    if (errors.length > 0) {
      return res.render('kapcsolat', { title: 'Kapcsolat', errors, values: { nev, email, telefon, uzenet } });
    }

    // IP cím (opcionális)
    //const bekuldo_ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || null;

    // SQL beszúrás (paraméterezve)
    await db.query(
      'INSERT INTO uzenetek (nev, email, telefon, uzenet, bekuldo_ip) VALUES (?, ?, ?, ?, ?)',
      [nev.trim(), email ? email.trim() : null, telefon ? telefon.trim() : null, uzenet.trim(), bekuldo_ip]
    );

    // Visszajelzés (köszönő oldalra vagy ugyanarra az oldalra sikerüzenettel)
    res.render('kapcsolat', { title: 'Kapcsolat', success: 'Köszönjük, az üzeneted elmentésre került.', errors: [], values: {} });

  } catch (err) {
    console.error('Kapcsolat POST hiba:', err);
    res.status(500).render('kapcsolat', { title: 'Kapcsolat', errors: ['Szerverhiba történt, próbáld később.'], values: req.body || {} });
  }
});


// ------------------------
// Üzenetek
// ------------------------
app.get('/uzenetek', authRequired, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, nev, email, telefon, uzenet, bekuldo_ip, bekuldve
            FROM uzenetek
            ORDER BY bekuldve DESC
        `);

        res.render('uzenetek', {
            title: 'Üzenetek',
            uzenetek: rows
        });

    } catch (err) {
        console.error('Hiba az üzenetek lekérdezésénél:', err);
        res.status(500).send('Hiba történt az üzenetek betöltésekor.');
    }
});


// ------------------------
// CRUD
// ------------------------
app.get('/crud', (req, res) => {
    res.render('crud', { title: 'CRUD' });
});

// ------------------------
// Kategóriák
// ------------------------
app.get('/kategoria', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM kategoria');
        res.render('kategoria', { kategoriak: rows, title: 'Kategóriák' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Hiba a kategóriák lekérdezésnél');
    }
});

// ------------------------
// Hozzávalók
// ------------------------
app.get('/hozzavalo', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM hozzavalo');
        res.render('hozzavalo', { hozzavalok: rows, title: 'Hozzávalók' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Hiba a hozzávalók lekérdezésnél');
    }
});

// ------------------------
// Használt hozzávalók
// ------------------------
app.get('/hasznalt', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM hasznalt');
        res.render('hasznalt', { hasznalt: rows, title: 'Használt hozzávalók' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Hiba a használt hozzávalók lekérdezésnél');
    }
});

// ------------------------
// Ételek + Hozzávalók összesítve
// ------------------------
app.get('/etelek-hozzavalok-tomb', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                e.id AS etel_id,
                e.nev AS etel_nev,
                k.nev AS kategoria,
                h.nev AS hozzavalo_nev,
                hu.mennyiseg,
                hu.egyseg
            FROM hasznalt hu
            JOIN etel e ON hu.etelid = e.id
            JOIN hozzavalo h ON hu.hozzavaloid = h.id
            JOIN kategoria k ON e.kategoriaid = k.id
            ORDER BY e.id;
        `);

        const etelek = {};
        rows.forEach(row => {
            if (!etelek[row.etel_id]) {
                etelek[row.etel_id] = {
                    etel_id: row.etel_id,
                    etel_nev: row.etel_nev,
                    kategoria: row.kategoria,
                    hozzavalok: []
                };
            }
            etelek[row.etel_id].hozzavalok.push({
                nev: row.hozzavalo_nev,
                mennyiseg: row.mennyiseg,
                egyseg: row.egyseg
            });
        });

        res.render('etelek-hozzavalok', { etelek: Object.values(etelek), title: 'Ételek és hozzávalók' });

    } catch (err) {
        console.error(err);
        res.status(500).send('Hiba az összetett lekérdezésnél');
    }
});

// ------------------------
// Szerver indítása
// ------------------------
app.listen(port, () => {
    console.log(`Szerver fut a http://localhost:${port}`);
});
