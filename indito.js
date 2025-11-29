const express = require('express');
const path = require('path');
const session = require('express-session');
const flash = require('connect-flash');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();

// SZERVER BEÁLLÍTÁSOK
const PORT = 4162;          // belső port – neked ez van megadva
const BASE_PATH = '/app162'; // reverse proxy útvonal

// ----------- ALAP BEÁLLÍTÁSOK -----------

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session + flash üzenetek
app.use(session({
    secret: 'nagyonTitkosKulcs123',  // lehet bármi, de ne legyen nyilvános
    resave: false,
    saveUninitialized: false
}));
app.use(flash());

// Statikus állományok (CSS, képek, JS) az /app162 alatt
app.use(BASE_PATH, express.static(path.join(__dirname, 'public')));

// Globális változók a nézetekhez
app.use((req, res, next) => {
    res.locals.basePath = BASE_PATH;
    res.locals.user = req.session.user || null;
    next();
});

// ----------- KÖZÖS MIDDLEWARE-OK -----------

function authRequired(req, res, next) {
    if (!req.session.user) {
        req.flash('errors', ['Előbb be kell jelentkezned.']);
        return res.redirect(BASE_PATH + '/login');
    }
    next();
}

function adminRequired(req, res, next) {
    if (!req.session.user || req.session.user.szerep !== 'admin') {
        req.flash('errors', ['Nincs jogosultságod az admin felülethez.']);
        return res.redirect(BASE_PATH + '/');
    }
    next();
}

// Segédfüggvény: egyszerű hiba-kezelés view-khoz
function renderWithMessages(res, view, options = {}) {
    const errors = res.req.flash('errors');
    const success = res.req.flash('success');
    const values = res.req.flash('values')[0] || {};
    res.render(view, {
        ...options,
        errors,
        success: success[0] || null,
        values
    });
}

// ----------- FŐOLDAL -----------

app.get(BASE_PATH + '/', (req, res) => {
    res.render('index', { title: 'Főoldal' });
});

// ----------- RECEPTEK (Adatbázis menü) -----------

app.get(BASE_PATH + '/receptek', async (req, res) => {
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

        res.render('receptek', { title: 'Receptek', etelek: rows });
    } catch (err) {
        console.error('Receptek hiba:', err);
        res.status(500).send('Hiba a receptek lekérdezésénél.');
    }
});

// ----------- REGISZTRÁCIÓ -----------

app.get(BASE_PATH + '/regisztracio', (req, res) => {
    renderWithMessages(res, 'regisztracio', { title: 'Regisztráció' });
});

app.post(BASE_PATH + '/regisztracio', async (req, res) => {
    try {
        const { nev, email, jelszo, jelszo2 } = req.body;
        const errors = [];

        if (!nev || nev.trim().length < 2) errors.push('A név minimum 2 karakter.');
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Érvényes e-mail cím szükséges.');
        if (!jelszo || jelszo.length < 6) errors.push('A jelszó minimum 6 karakter.');
        if (jelszo !== jelszo2) errors.push('A jelszavak nem egyeznek.');

        if (errors.length > 0) {
            req.flash('errors', errors);
            req.flash('values', { nev, email });
            return res.redirect(BASE_PATH + '/regisztracio');
        }

        // van-e már ilyen email?
        const [existing] = await db.query('SELECT id FROM users WHERE email = ?', [email.trim()]);
        if (existing.length > 0) {
            req.flash('errors', ['Ez az e-mail cím már regisztrálva van.']);
            req.flash('values', { nev, email });
            return res.redirect(BASE_PATH + '/regisztracio');
        }

        const hashed = await bcrypt.hash(jelszo, 10);

        // az első user lehet admin, a többi user
        let role = 'user';
        const [countRows] = await db.query('SELECT COUNT(*) AS cnt FROM users');
        if (countRows[0].cnt === 0) {
            role = 'admin';
        }

        await db.query(
            'INSERT INTO users (nev, email, jelszo, szerep) VALUES (?, ?, ?, ?)',
            [nev.trim(), email.trim(), hashed, role]
        );

        req.flash('success', 'Sikeres regisztráció! Most jelentkezz be.');
        res.redirect(BASE_PATH + '/login');
    } catch (err) {
        console.error('Regisztráció hiba:', err);
        req.flash('errors', ['Szerverhiba, próbáld később.']);
        res.redirect(BASE_PATH + '/regisztracio');
    }
});

// ----------- BEJELENTKEZÉS -----------

app.get(BASE_PATH + '/login', (req, res) => {
    renderWithMessages(res, 'login', { title: 'Bejelentkezés' });
});

app.post(BASE_PATH + '/login', async (req, res) => {
    try {
        const { email, jelszo } = req.body;
        const errors = [];

        if (!email || !jelszo) {
            errors.push('Add meg az e-mail címet és a jelszót.');
        }

        if (errors.length > 0) {
            req.flash('errors', errors);
            req.flash('values', { email });
            return res.redirect(BASE_PATH + '/login');
        }

        const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email.trim()]);
        if (rows.length === 0) {
            req.flash('errors', ['Nincs ilyen felhasználó.']);
            req.flash('values', { email });
            return res.redirect(BASE_PATH + '/login');
        }

        const user = rows[0];
        const ok = await bcrypt.compare(jelszo, user.jelszo);
        if (!ok) {
            req.flash('errors', ['Hibás jelszó.']);
            req.flash('values', { email });
            return res.redirect(BASE_PATH + '/login');
        }

        req.session.user = {
            id: user.id,
            nev: user.nev,
            email: user.email,
            szerep: user.szerep
        };

        req.flash('success', 'Sikeres bejelentkezés!');
        res.redirect(BASE_PATH + '/');
    } catch (err) {
        console.error('Login hiba:', err);
        req.flash('errors', ['Szerverhiba, próbáld később.']);
        res.redirect(BASE_PATH + '/login');
    }
});

// ----------- KIJELENTKEZÉS -----------

app.get(BASE_PATH + '/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error('Logout hiba:', err);
        res.redirect(BASE_PATH + '/');
    });
});

// ----------- KAPCSOLAT ------------- 

app.get(BASE_PATH + '/kapcsolat', (req, res) => {
    renderWithMessages(res, 'kapcsolat', { title: 'Kapcsolat' });
});

app.post(BASE_PATH + '/kapcsolat', async (req, res) => {
    try {
        const { nev, email, telefon, uzenet } = req.body;
        const errors = [];

        if (!nev || nev.trim().length < 2) errors.push('A név minimum 2 karakter.');
        if (!uzenet || uzenet.trim().length < 5) errors.push('Az üzenet túl rövid (min. 5 karakter).');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Érvénytelen e-mail cím.');

        if (errors.length > 0) {
            req.flash('errors', errors);
            req.flash('values', { nev, email, telefon, uzenet });
            return res.redirect(BASE_PATH + '/kapcsolat');
        }

        const ip =
            (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
            req.socket.remoteAddress ||
            null;

        await db.query(
            'INSERT INTO uzenetek (nev, email, telefon, uzenet, bekuldo_ip) VALUES (?, ?, ?, ?, ?)',
            [nev.trim(), email || null, telefon || null, uzenet.trim(), ip]
        );

        req.flash('success', 'Köszönjük, az üzeneted elmentésre került.');
        res.redirect(BASE_PATH + '/kapcsolat');
    } catch (err) {
        console.error('Kapcsolat POST hiba:', err);
        req.flash('errors', ['Szerverhiba, próbáld később.']);
        res.redirect(BASE_PATH + '/kapcsolat');
    }
});

// ----------- ÜZENETEK (csak bejelentkezett) -----------

app.get(BASE_PATH + '/uzenetek', authRequired, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, nev, email, telefon, uzenet, bekuldo_ip, bekuldve
            FROM uzenetek
            ORDER BY bekuldve DESC
        `);

        res.render('uzenetek', { title: 'Üzenetek', uzenetek: rows });
    } catch (err) {
        console.error('Üzenetek hiba:', err);
        res.status(500).send('Hiba történt az üzenetek betöltésekor.');
    }
});

// ----------- CRUD ÉTELEKRE -----------

app.get(BASE_PATH + '/crud', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT e.id, e.nev, k.nev AS kategoria
            FROM etel e
            LEFT JOIN kategoria k ON e.kategoriaid = k.id
            ORDER BY e.id
        `);
        res.render('crud', { title: 'CRUD – Ételek', etelek: rows });
    } catch (err) {
        console.error('CRUD lista hiba:', err);
        res.status(500).send('Hiba a CRUD listázásnál.');
    }
});

// Új étel űrlap
app.get(BASE_PATH + '/crud/uj', async (req, res) => {
    const [kategoriak] = await db.query('SELECT id, nev FROM kategoria ORDER BY nev');
    res.render('crud-uj', { title: 'Új étel', kategoriak });
});

// Új étel mentése
app.post(BASE_PATH + '/crud/uj', async (req, res) => {
    const { nev, kategoriaid } = req.body;
    await db.query('INSERT INTO etel (nev, kategoriaid) VALUES (?, ?)', [
        nev.trim(),
        kategoriaid
    ]);
    res.redirect(BASE_PATH + '/crud');
});

// Szerkesztés űrlap
app.get(BASE_PATH + '/crud/szerkesztes/:id', async (req, res) => {
    const etelId = req.params.id;
    const [[etel]] = await db.query('SELECT * FROM etel WHERE id = ?', [etelId]);
    const [kategoriak] = await db.query('SELECT id, nev FROM kategoria ORDER BY nev');
    res.render('crud-szerkesztes', {
        title: 'Étel szerkesztése',
        etel,
        kategoriak
    });
});

// Szerkesztés mentése
app.post(BASE_PATH + '/crud/szerkesztes/:id', async (req, res) => {
    const etelId = req.params.id;
    const { nev, kategoriaid } = req.body;
    await db.query(
        'UPDATE etel SET nev = ?, kategoriaid = ? WHERE id = ?',
        [nev.trim(), kategoriaid, etelId]
    );
    res.redirect(BASE_PATH + '/crud');
});

// Törlés
app.get(BASE_PATH + '/crud/torles/:id', async (req, res) => {
    await db.query('DELETE FROM etel WHERE id = ?', [req.params.id]);
    res.redirect(BASE_PATH + '/crud');
});

// ----------- ADMIN OLDAL (csak admin) -----------

app.get(BASE_PATH + '/admin', adminRequired, async (req, res) => {
    try {
        const [[{ cnt_users }]] = await db.query('SELECT COUNT(*) AS cnt_users FROM users');
        const [[{ cnt_msgs }]] = await db.query('SELECT COUNT(*) AS cnt_msgs FROM uzenetek');
        const [[{ cnt_etel }]] = await db.query('SELECT COUNT(*) AS cnt_etel FROM etel');

        res.render('admin', {
            title: 'Admin',
            stats: {
                users: cnt_users,
                messages: cnt_msgs,
                etelek: cnt_etel
            }
        });
    } catch (err) {
        console.error('Admin hiba:', err);
        res.status(500).send('Hiba az admin oldalon.');
    }
});

// ----------- SZERVER INDÍTÁS -----------

app.listen(PORT, () => {
    console.log(`Szerver fut: http://localhost:${PORT}${BASE_PATH}/`);
});
