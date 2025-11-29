const express = require('express');
const path = require('path');
const db = require('./db'); 
const bcrypt = require('bcryptjs');

const app = express();
const port = 3000;

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session + Flash
const session = require('express-session');
const flash = require('connect-flash');

app.use(session({
    secret: 'valamiTitkosKulcs123',
    resave: false,
    saveUninitialized: false
}));

app.use(flash());

// Globális sablonváltozók
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// Statikus fájlok
app.use(express.static(path.join(__dirname, 'public')));

// EJS sablonmotor
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware: csak bejelentkezett felhasználóknak
function authRequired(req, res, next) {
    if (!req.session.user) {
        req.flash('error', 'Előbb be kell jelentkezned!');
        return res.redirect('/login');
    }
    next();
}

// ------------------------
// Főoldal
// ------------------------
app.get('/', (req, res) => {
    res.render('index', { title: 'Főoldal' });
});

// ------------------------
// Receptek listázása
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
                        DISTINCT CONCAT(
                            h.nev, 
                            ' (', COALESCE(hu.mennyiseg,''), 
                            IFNULL(CONCAT(' ', COALESCE(hu.egyseg,'')),''),
                            ')'
                        )
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
        res.status(500).send('Hiba a receptek lekérdezésénél');
    }
});

// ----------------------------------------------------
// REGISZTRÁCIÓ
// ----------------------------------------------------
app.get('/regisztracio', (req, res) => {
    res.render('regisztracio', {
        title: 'Regisztráció',
        errors: [],
        values: {}
    });
});

app.post('/regisztracio', async (req, res) => {
    try {
        const { nev, jelszo, jelszo2 } = req.body;
        const errors = [];

        // Validálás
        if (!nev || nev.trim().length < 2) errors.push('A felhasználónév minimum 2 karakter.');
        if (!jelszo || jelszo.length < 6) errors.push('A jelszó minimum 6 karakter.');
        if (jelszo !== jelszo2) errors.push('A jelszavak nem egyeznek.');

        if (errors.length > 0) {
            return res.render('regisztracio', {
                title: 'Regisztráció',
                errors,
                values: { nev }
            });
        }

        // Ellenőrzés: foglalt username?
        const [existing] = await db.query(
            'SELECT * FROM users WHERE username = ?',
            [nev]
        );

        if (existing.length > 0) {
            errors.push('Ez a felhasználónév már foglalt.');
            return res.render('regisztracio', { title: 'Regisztráció', errors, values: { nev } });
        }

        // Jelszó hash
        const hashedPassword = await bcrypt.hash(jelszo, 10);

        // Mentés
        await db.query(
            'INSERT INTO users (username, password, role) VALUES (?, ?, "user")',
            [nev.trim(), hashedPassword]
        );

        req.flash('success', 'Sikeres regisztráció! Most bejelentkezhetsz.');
        res.redirect('/login');

    } catch (err) {
        console.error('Regisztráció hiba:', err);
        res.render('regisztracio', {
            title: 'Regisztráció',
            errors: ['Szerverhiba, próbáld később.'],
            values: req.body
        });
    }
});

// ----------------------------------------------------
// BEJELENTKEZÉS
// ----------------------------------------------------
app.get('/login', (req, res) => {
    res.render('login', { title: 'Bejelentkezés', errors: [], values: {} });
});

app.post('/login', async (req, res) => {
    try {
        const { email, jelszo } = req.body;

        const [rows] = await db.query(
            'SELECT * FROM users WHERE username = ?',
            [email]
        );

        if (rows.length === 0) {
            return res.render('login', {
                title: 'Bejelentkezés',
                errors: ['Nincs ilyen felhasználó.'],
                values: { email }
            });
        }

        const user = rows[0];

        const validPassword = await bcrypt.compare(jelszo, user.password);

        if (!validPassword) {
            return res.render('login', {
                title: 'Bejelentkezés',
                errors: ['Hibás jelszó.'],
                values: { email }
            });
        }

        req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role
        };

        req.flash('success', 'Sikeres bejelentkezés!');
        res.redirect('/');

    } catch (err) {
        console.error('Bejelentkezés hiba:', err);
        res.render('login', {
            title: 'Bejelentkezés',
            errors: ['Szerverhiba, próbáld később.'],
            values: req.body
        });
    }
});

// KIJELENTKEZÉS
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) console.error('Logout hiba:', err);
        res.redirect('/');
    });
});

// ----------------------------------------------------
// KAPCSOLAT
// ----------------------------------------------------
app.get('/kapcsolat', (req, res) => {
    res.render('kapcsolat', {
        title: 'Kapcsolat',
        success: null,
        errors: [],
        values: {}
    });
});

app.post('/kapcsolat', async (req, res) => {
    try {
        const { nev, email, telefon, uzenet } = req.body;

        const errors = [];
        if (!nev || nev.trim().length < 2) errors.push('A név minimum 2 karakter.');
        if (!uzenet || uzenet.trim().length < 5) errors.push('Az üzenet minimum 5 karakter.');

        if (errors.length > 0) {
            return res.render('kapcsolat', {
                title: 'Kapcsolat',
                errors,
                values: { nev, email, telefon, uzenet }
            });
        }

        await db.query(
            'INSERT INTO uzenetek (nev, email, telefon, uzenet) VALUES (?, ?, ?, ?)',
            [nev.trim(), email || null, telefon || null, uzenet.trim()]
        );

        res.render('kapcsolat', {
            title: 'Kapcsolat',
            success: 'Köszönjük, az üzeneted elmentésre került!',
            errors: [],
            values: {}
        });

    } catch (err) {
        console.error('Kapcsolat hiba:', err);
        res.render('kapcsolat', {
            title: 'Kapcsolat',
            errors: ['Szerverhiba történt.'],
            values: req.body
        });
    }
});

// ----------------------------------------------------
// ÜZENET LISTÁZÁS (csak bejelentkezve)
// ----------------------------------------------------
app.get('/uzenetek', authRequired, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT id, nev, email, telefon, uzenet, bekuldve
            FROM uzenetek
            ORDER BY bekuldve DESC
        `);

        res.render('uzenetek', { title: 'Üzenetek', uzenetek: rows });

    } catch (err) {
        console.error('Üzenetek lekérdezési hiba:', err);
        res.status(500).send('Hiba');
    }
});

// ----------------------------------------------------
// CRUD - Étel lista
// ----------------------------------------------------
app.get('/crud', async (req, res) => {
    const [rows] = await db.query(`
        SELECT e.id, e.nev, k.nev AS kategoria
        FROM etel e
        LEFT JOIN kategoria k ON e.kategoriaid = k.id
        ORDER BY e.id
    `);

    res.render('crud', { title: 'CRUD – Ételek', etelek: rows });
});

app.get('/crud/uj', async (req, res) => {
    const [kategoriak] = await db.query('SELECT * FROM kategoria');
    res.render('crud-uj', { title: 'Új étel', kategoriak });
});

app.post('/crud/uj', async (req, res) => {
    const { nev, kategoriaid } = req.body;
    await db.query('INSERT INTO etel (nev, kategoriaid) VALUES (?, ?)', [
        nev.trim(),
        kategoriaid
    ]);
    res.redirect('/crud');
});

// CRUD szerkesztés
app.get('/crud/szerkesztes/:id', async (req, res) => {
    const etelId = req.params.id;

    const [[etel]] = await db.query('SELECT * FROM etel WHERE id = ?', [etelId]);
    const [kategoriak] = await db.query('SELECT * FROM kategoria');

    res.render('crud-szerkesztes', {
        title: 'Étel szerkesztése',
        etel,
        kategoriak
    });
});

app.post('/crud/szerkesztes/:id', async (req, res) => {
    const etelId = req.params.id;
    const { nev, kategoriaid } = req.body;

    await db.query(
        'UPDATE etel SET nev = ?, kategoriaid = ? WHERE id = ?',
        [nev.trim(), kategoriaid, etelId]
    );

    res.redirect('/crud');
});

// CRUD törlés
app.get('/crud/torles/:id', async (req, res) => {
    await db.query('DELETE FROM etel WHERE id = ?', [req.params.id]);
    res.redirect('/crud');
});

// ----------------------------------------------------
// Szerver indítása
// ----------------------------------------------------
app.listen(port, () => {
    console.log(`Szerver fut a http://localhost:${port}`);
});
