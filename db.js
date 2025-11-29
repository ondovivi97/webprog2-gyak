const mysql = require('mysql2');

// Kapcsolódás az adatbázishoz
const pool = mysql.createPool({
    host: 'localhost',       // ugyanazon a szerveren fut a MariaDB
    user: 'studb162',        // a TE adatbázis felhasználód
    password: 'abc123',      // ha nem változtattad meg
    database: 'db162',       // a TE adatbázisod
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Egyszerű query teszt (opcionális)
pool.query('SELECT 1 + 1 AS result', (err, results) => {
    if (err) {
        console.error('DB kapcsolódási hiba:', err);
    } else {
        console.log('DB kapcsolódás OK, teszt:', results[0].result);
    }
});

module.exports = pool.promise();
