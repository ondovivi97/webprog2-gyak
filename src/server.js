const express = require('express');
const path = require('path');
const db = require('./db'); // a db.js import

const app = express();
const port = 3000;

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
            SELECT e.id, e.nev, e.kategoriaid, k.nev AS kategoria_nev, e.felirdatum, e.elsodatum
            FROM etel e
            LEFT JOIN kategoria k ON e.kategoriaid = k.id
        `);
        res.render('etelek', { etelek: rows, title: 'Receptek' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Hiba a receptek lekérdezésnél');
    }
});

// ------------------------
// Autentikáció
// ------------------------
app.get('/autentikacio', (req, res) => {
    res.render('autentikacio', { title: 'Autentikáció' });
});

// ------------------------
// Kapcsolat
// ------------------------
app.get('/kapcsolat', (req, res) => {
    res.render('kapcsolat', { title: 'Kapcsolat' });
});

// ------------------------
// Üzenetek
// ------------------------
app.get('/uzenetek', (req, res) => {
    res.render('uzenetek', { title: 'Üzenetek' });
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
