const mysql = require('mysql2');


const pool = mysql.createPool({
    host: 'localhost',
    user: 'studb162',      
    password: 'abc123',    
    database: 'db162',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    charset: 'utf8mb4_hungarian_ci '
});

// Teszt lekérdezés induláskor
pool.query('SELECT 1 + 1 AS result', (err, results) => {
    if (err) {
        console.error('DB kapcsolódási hiba:', err);
    } else {
        console.log('DB kapcsolódás OK, teszt:', results[0].result);
    }
});

module.exports = pool.promise();
