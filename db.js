const mysql = require('mysql2');

// Kapcsolódás az adatbázishoz
const pool = mysql.createPool({
    host: 'localhost',       // vagy ha más a szerver IP: pl. '143.47.98.96'
    user: 'root',            // MySQL felhasználó
    password: '',            // jelszó (ha van)
    database: 'receptdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Egyszerű query teszt (opcionális)
pool.query('SELECT 1 + 1 AS result', (err, results) => {
    if (err) throw err;
    console.log('DB kapcsolódás OK, teszt:', results[0].result);
});

module.exports = pool.promise(); // használjuk promise-al a könnyebb async/await-et
