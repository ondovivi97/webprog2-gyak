const express = require('express');
const path = require('path');
const db = require('./db');
const bcrypt = require('bcryptjs');

const app = express();
const port = 4162;

// EZ LESZ A FELHASZNÁLÓ-ÚTVONAL
const BASE_PATH = '/app162';

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

// Globális változók a sablonokhoz
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

// *** FONTOS: BASE PATH CSERÉLŐ MIDDLEWARE ***
// Ha /app162 vagy /app162/... az URL, levágjuk belőle az /app162 részt,
// hogy a meglévő route-ok (/ , /login, /regisztracio, stb.) működjenek.
app.use((req, res, next) => {
    if (req.url === BASE_PATH || req.url.startsWith(BASE_PATH + '/')) {
        req.url = req.url.slice(BASE_PATH.length) || '/';
    }
    next();
});

// Statikus fájlok (CSS, JS, képek)
app.use(express.static(path.join(__dirname, 'public')));

// Sablonmotor – views mappa
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// EJS beállítás
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


// ------------------------------------------------------
// 🔐 Middleware – Belépéshez kötött oldalak
// ------------------------------------------------------
function authRequired(req, res, next) {
    if (!req.session.user) {
        req.flash('error', 'Előbb be kell jelentkezned!');
        return res.redirect('/login');
    }
    next();
}

function adminRequired(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        req.flash('error', 'Ehhez az oldalhoz nincs jogosultságod!');
        return res.redirect('/');
    }
    next();
}


// ------------------------------------------------------
// Főoldal
// ------------------------------------------------------
app.get('/', (req, res) => {
    res.render('index', { title: 'Főoldal' });
});


// ------------------------------------------------------
// Receptek
// ------------------------------------------------------
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
                      h.nev, ' (', 
                      COALESCE(hu.mennyiseg,''), 
                      IFNULL(CONCAT(' ', COALESCE(hu.egyseg,'')),''), 
                      ')'
                    ) ORDER BY h.nev SEPARATOR ', '
                  ), ''
                ) AS hozzavalok
            FROM etel e
            LEFT JOIN kategoria k ON e.kategoriaid = k.id
            LEFT JOIN hasznalt hu ON hu.etelid = e.id
            LEFT JOIN hozzavalo h ON hu.hozzavaloid = h.id
            GROUP BY e.id
            ORDER BY e.id;
        `);

        res.render('etelek', { etelek: rows, title: 'Receptek' });

    } catch (err) {
        console.error(err);
        res.status(500).send("Hiba a receptek lekérdezésénél");
    }
});


// ------------------------------------------------------
// 🔐 REGISZTRÁCIÓ
// ------------------------------------------------------
app.get('/regisztracio', (req, res) => {
    res.render('regisztracio', { title: 'Regisztráció', errors: [], values: {} });
});

// ------------------------
// Regisztráció (POST)
// ------------------------
app.post('/regisztracio', async (req, res) => {
    try {
        const { nev, email, jelszo, jelszo2 } = req.body;
        const errors = [];

        if (!nev || nev.trim().length < 2) errors.push("A név minimum 2 karakter.");
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Érvényes email szükséges.");
        if (!jelszo || jelszo.length < 6) errors.push("A jelszó min. 6 karakter.");
        if (jelszo !== jelszo2) errors.push("A jelszavak nem egyeznek.");

        if (errors.length > 0) {
            return res.render('regisztracio', {
                title: 'Regisztráció',
                errors,
                values: { nev, email }
            });
        }

        // Ellenőrzés: van-e ilyen email username-ként
        const [exists] = await db.query("SELECT id FROM users WHERE username = ?", [email]);
        if (exists.length > 0) {
            return res.render('regisztracio', { 
                title: 'Regisztráció', 
                errors: ['Ez az e-mail cím már regisztrálva van.'], 
                values: { nev, email } 
            });
        }

        const hash = await bcrypt.hash(jelszo, 10);

        // MENTÉS A MEGLÉVŐ users TÁBLÁBA
        await db.query(
            "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')",
            [email.trim(), hash]
        );

        req.flash("success", "Sikeres regisztráció! Jelentkezz be.");
        res.redirect("/login");

    } catch (err) {
        console.error("Regisztráció hiba:", err);
        res.status(500).render("regisztracio", {
            title: "Regisztráció",
            errors: ["Szerverhiba, próbáld később."],
            values: req.body
        });
    }
});



// ------------------------------------------------------
// 🔐 LOGIN
// ------------------------------------------------------
app.get('/login', (req, res) => {
    res.render('login', { title: 'Bejelentkezés', errors: [], values: {} });
});

// ------------------------
// Bejelentkezés (POST)
// ------------------------
app.post('/login', async (req, res) => {
    try {
        const { email, jelszo } = req.body;

        const [rows] = await db.query("SELECT * FROM users WHERE username = ?", [email]);
        if (rows.length === 0) {
            return res.render('login', { title: 'Bejelentkezés', errors: ['Nincs ilyen felhasználó'], values: { email } });
        }

        const user = rows[0];
        const valid = await bcrypt.compare(jelszo, user.password);

        if (!valid) {
            return res.render('login', { title: 'Bejelentkezés', errors: ['Hibás jelszó'], values: { email } });
        }

        req.session.user = {
            id: user.id,
            nev: user.username,  // NINCS nev mező → username a név
            email: user.username,
            role: user.role
        };

        req.flash("success", "Sikeres bejelentkezés!");

        if (user.role === "admin") return res.redirect("/admin");
        return res.redirect("/");

    } catch (err) {
        console.error("Login hiba:", err);
        res.render('login', {
            title: 'Bejelentkezés',
            errors: ["Szerverhiba!"],
            values: req.body
        });
    }
});



// ------------------------------------------------------
// ADMIN OLDAL
// ------------------------------------------------------
app.get('/admin', adminRequired, async (req, res) => {
    res.render('admin', {
        title: 'Admin felület',
        user: req.session.user
    });
});


// ------------------------------------------------------
// LOGOUT
// ------------------------------------------------------
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});


// ------------------------------------------------------
// Szerver indítása
// ------------------------------------------------------
app.listen(port, () => {
    console.log(`Szerver fut: http://localhost:${port}`);
});
