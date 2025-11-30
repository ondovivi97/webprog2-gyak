// import.js
//
// Adatimportáló script a db161 adatbázisba a .txt fájlokból.
// Használat:  node import.js

const fs = require('fs').promises;
const path = require('path');
const db = require('./db'); // mysql2/promise pool

async function readLines(filename) {
  const fullPath = path.join(__dirname, filename);
  const content = await fs.readFile(fullPath, 'utf-8');
  return content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

// "1993.06.27"  ->  "1993-06-27"
function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  if (!s) return null;
  const parts = s.split('.');
  if (parts.length !== 3) return null;
  let [y, m, d] = parts;
  if (!y || !m || !d) return null;
  m = m.padStart(2, '0');
  d = d.padStart(2, '0');
  return `${y}-${m}-${d}`; // yyyy-mm-dd
}

async function importKategoria() {
  console.log('→ Kategóriák importálása (kategoria.txt)...');
  const lines = await readLines('kategoria.txt');
  const header = lines.shift(); // "id;nev"

  let count = 0;
  for (const line of lines) {
    const [idStr, nev] = line.split(';');
    if (!idStr || !nev) continue;

    const id = parseInt(idStr, 10);
    try {
      await db.query(
        'INSERT INTO kategoria (id, nev, leiras) VALUES (?, ?, NULL)',
        [id, nev]
      );
      count++;
    } catch (err) {
      console.error('  ! Hiba kategoria sor importjánál:', line, err.message);
    }
  }
  console.log(`  ✓ ${count} kategória importálva.`);
}

async function importHozzavalo() {
  console.log('→ Hozzávalók importálása (hozzavalo.txt)...');
  const lines = await readLines('hozzavalo.txt');
  const header = lines.shift(); // "id;nev"

  let count = 0;
  for (const line of lines) {
    const [idStr, nev] = line.split(';');
    if (!idStr || !nev) continue;

    const id = parseInt(idStr, 10);
    try {
      await db.query(
        'INSERT INTO hozzavalo (id, nev, egyseg) VALUES (?, ?, NULL)',
        [id, nev]
      );
      count++;
    } catch (err) {
      console.error('  ! Hiba hozzavalo sor importjánál:', line, err.message);
    }
  }
  console.log(`  ✓ ${count} hozzávaló importálva.`);
}

async function importEtel() {
  console.log('→ Ételek importálása (etel.txt)...');
  const lines = await readLines('etel.txt');
  const header = lines.shift(); // "nev;id;kategoriaid;felirdatum;elsodatum"

  let count = 0;
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 3) continue;

    const nev = parts[0];
    const idStr = parts[1];
    const katStr = parts[2];
    const felirStr = parts[3] || '';
    const elsoStr = parts[4] || '';

    const id = parseInt(idStr, 10);
    const kategoriaId = katStr ? parseInt(katStr, 10) : null;
    const felirdatum = parseDate(felirStr);
    const elsodatum = parseDate(elsoStr);

    try {
      await db.query(
        'INSERT INTO etel (id, nev, kategoria_id, felirdatum, elsodatum) VALUES (?, ?, ?, ?, ?)',
        [id, nev, kategoriaId, felirdatum, elsodatum]
      );
      count++;
    } catch (err) {
      console.error('  ! Hiba etel sor importjánál:', line, err.message);
    }
  }
  console.log(`  ✓ ${count} étel importálva.`);
}

async function importEtelHozzavalo() {
  console.log('→ Étel–hozzávaló kapcsolatok importálása (hasznalt.txt)...');
  const lines = await readLines('hasznalt.txt');
  const header = lines.shift(); // "mennyiseg;egyseg;etelid;hozzavaloid"

  let count = 0;
  for (const line of lines) {
    const parts = line.split(';');
    if (parts.length < 4) continue;

    let mennyisegStr = parts[0] || '';
    const egyseg = parts[1] || null;
    const etelIdStr = parts[2];
    const hozzavaloIdStr = parts[3];

    if (!etelIdStr || !hozzavaloIdStr) continue;

    // "3,5" → 3.5; üres → NULL
    let mennyiseg = null;
    mennyisegStr = mennyisegStr.replace(',', '.').trim();
    if (mennyisegStr !== '') {
      const num = Number(mennyisegStr);
      if (!Number.isNaN(num)) {
        mennyiseg = num;
      }
    }

    const etelId = parseInt(etelIdStr, 10);
    const hozzavaloId = parseInt(hozzavaloIdStr, 10);

    try {
      await db.query(
        'INSERT INTO etel_hozzavalo (mennyiseg, egyseg, etelid, hozzavaloid) VALUES (?, ?, ?, ?)',
        [mennyiseg, egyseg, etelId, hozzavaloId]
      );
      count++;
    } catch (err) {
      console.error('  ! Hiba etel_hozzavalo sor importjánál:', line, err.message);
    }
  }
  console.log(`  ✓ ${count} etel_hozzavalo sor importálva.`);
}

async function main() {
  try {
    console.log('*** Adatbázis import indul (db161) ***');

    await db.query('SET FOREIGN_KEY_CHECKS = 0');

    console.log('Táblák ürítése...');
    await db.query('TRUNCATE TABLE etel_hozzavalo');
    await db.query('TRUNCATE TABLE etel');
    await db.query('TRUNCATE TABLE hozzavalo');
    await db.query('TRUNCATE TABLE kategoria');

    console.log('Táblák importálása...');
    await importKategoria();
    await importHozzavalo();
    await importEtel();
    await importEtelHozzavalo();

    await db.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('*** Import sikeresen befejeződött. ***');
    process.exit(0);
  } catch (err) {
    console.error('HIBA az import közben (globális):', err);
    process.exit(1);
  }
}

main();
