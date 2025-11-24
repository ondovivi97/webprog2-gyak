const mysql = require('mysql2/promise');

const pool = mysql.createPool({
    host: 'localhost',
    user: 'student001',      // módosítsd
    password: 'jelszo',      // módosítsd
    database: 'adatbazisnev' // módosítsd
});

module.exports = pool;
